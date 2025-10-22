import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabaseServer";

const createPropertySchema = z.object({
  property_code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  type: z.string().min(1),
  logo_url: z.string().optional(),
});

const updatePropertySchema = z.object({
  property_code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  logo_url: z.string().optional(),
});

export async function GET() {
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

  // Get user role from UserRoles
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

  let query = supabase.from("Properties").select("*");

  if (userRole.role === "landlord") {
    query = query.eq("owner_id", user.id);
  } else if (userRole.role === "admin") {
    // Admin can see all
  } else {
    return NextResponse.json(
      { success: false, error: "Access denied" },
      { status: 403 },
    );
  }

  const { data, error } = await query;

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
    entity: "Properties",
    details: "Viewed properties list",
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

  if (roleError || !userRole || userRole.role !== "landlord") {
    return NextResponse.json(
      { success: false, error: "Only landlords can create properties" },
      { status: 403 },
    );
  }

  const body = await req.json();
  const validated = createPropertySchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { success: false, error: validated.error.issues[0].message },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("Properties")
    .insert({ ...validated.data, owner_id: user.id })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  // Log activity
  await supabase.from("ActivityLogs").insert({
    user_id: user.id,
    action: "CREATE",
    entity: "Properties",
    details: `Created property: ${validated.data.name}`,
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
      { success: false, error: "Property ID required" },
      { status: 400 },
    );
  }

  const validated = updatePropertySchema.safeParse(updates);

  if (!validated.success) {
    return NextResponse.json(
      { success: false, error: validated.error.issues[0].message },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("Properties")
    .update(validated.data)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Property not found or access denied" },
      { status: 404 },
    );
  }

  // Log activity
  await supabase.from("ActivityLogs").insert({
    user_id: user.id,
    action: "UPDATE",
    entity: "Properties",
    details: `Updated property: ${data.name}`,
  });

  return NextResponse.json({ success: true, data });
}
