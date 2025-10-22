import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabaseServer";

const createReceiptSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  amount: z.number().positive(),
  period: z.string().min(1),
  receipt_pdf_url: z.string().optional(),
  status: z.string().default("pending"),
});

const updateReceiptSchema = z.object({
  status: z.string().optional(),
  receipt_pdf_url: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Get user role
  const { data: userRole, error: roleError } = await supabase
    .from("UserRoles")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (roleError || !userRole) {
    return NextResponse.json(
      { success: false, error: "Role not found" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("property_id");
  const tenantId = url.searchParams.get("tenant_id");

  let query = supabase.from("Receipts").select(`
      *,
      tenant:Users!Receipts_tenant_id_fkey(full_name, email),
      property:Properties!Receipts_property_id_fkey(name),
      approver:Users!Receipts_approved_by_fkey(full_name)
    `);

  if (userRole.role === "tenant") {
    query = query.eq("tenant_id", user.id);
  } else if (userRole.role === "landlord") {
    if (propertyId) {
      query = query.eq("property_id", propertyId);
    } else {
      // Get properties owned by landlord
      const { data: properties } = await supabase
        .from("Properties")
        .select("id")
        .eq("owner_id", user.id);
      if (properties && properties.length > 0) {
        query = query.in(
          "property_id",
          properties.map((p: any) => p.id),
        );
      } else {
        // No properties, return empty
        return NextResponse.json({ success: true, data: [] });
      }
    }
  } else if (userRole.role === "admin") {
    // Admin can see all
  } else {
    return NextResponse.json(
      { success: false, error: "Access denied" },
      { status: 403 },
    );
  }

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.order("approved_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  // Log activity
  await supabase.from("ActivityLogs").insert({
    user_id: user.id,
    action: "VIEW",
    entity: "Receipts",
    details: "Viewed receipts list",
  });

  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Get user role
  const { data: userRole, error: roleError } = await supabase
    .from("UserRoles")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (
    roleError ||
    !userRole ||
    (userRole.role !== "landlord" && userRole.role !== "admin")
  ) {
    return NextResponse.json(
      { success: false, error: "Only landlords can create receipts" },
      { status: 403 },
    );
  }

  const body = await req.json();
  const validated = createReceiptSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { success: false, error: validated.error.issues[0].message },
      { status: 400 },
    );
  }

  // Verify landlord owns the property
  if (userRole.role === "landlord") {
    const { data: property, error: propError } = await supabase
      .from("Properties")
      .select("id")
      .eq("id", validated.data.property_id)
      .eq("owner_id", user.id)
      .single();

    if (propError || !property) {
      return NextResponse.json(
        { success: false, error: "Property not found or access denied" },
        { status: 403 },
      );
    }
  }

  // Get next receipt number
  const { data: property, error: propError } = await supabase
    .from("Properties")
    .select("receipt_serial_counter")
    .eq("id", validated.data.property_id)
    .single();

  if (propError || !property) {
    return NextResponse.json(
      { success: false, error: "Property not found" },
      { status: 404 },
    );
  }

  const nextCounter = (property.receipt_serial_counter || 0) + 1;
  const receiptNo = `RCP-${validated.data.property_id.slice(-8).toUpperCase()}-${nextCounter.toString().padStart(4, "0")}`;

  const { data, error } = await supabase
    .from("Receipts")
    .insert({
      ...validated.data,
      receipt_no: receiptNo,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  // Update property counter
  await supabase
    .from("Properties")
    .update({ receipt_serial_counter: nextCounter })
    .eq("id", validated.data.property_id);

  // Log activity
  await supabase.from("ActivityLogs").insert({
    user_id: user.id,
    action: "CREATE",
    entity: "Receipts",
    details: `Created receipt: ${receiptNo} for tenant ${validated.data.tenant_id}`,
  });

  return NextResponse.json({ success: true, data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id, ...updates } = await req.json();

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Receipt ID required" },
      { status: 400 },
    );
  }

  const validated = updateReceiptSchema.safeParse(updates);

  if (!validated.success) {
    return NextResponse.json(
      { success: false, error: validated.error.issues[0].message },
      { status: 400 },
    );
  }

  // Get user role
  const { data: userRole, error: roleError } = await supabase
    .from("UserRoles")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (roleError || !userRole) {
    return NextResponse.json(
      { success: false, error: "Role not found" },
      { status: 403 },
    );
  }

  let query = supabase.from("Receipts").update(validated.data).eq("id", id);

  if (userRole.role === "landlord") {
    // Ensure landlord owns the property
    query = query.eq(
      "property_id",
      supabase.from("Properties").select("id").eq("owner_id", user.id),
    );
  }

  const { data, error } = await query.select().single();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Receipt not found or access denied" },
      { status: 404 },
    );
  }

  // Log activity
  await supabase.from("ActivityLogs").insert({
    user_id: user.id,
    action: "UPDATE",
    entity: "Receipts",
    details: `Updated receipt: ${data.receipt_no}`,
  });

  return NextResponse.json({ success: true, data });
}
