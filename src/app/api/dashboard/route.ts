import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

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

  let dashboardData: any = {
    user: {
      id: user.id,
      email: user.email,
      role: userRole.role,
    },
  };

  if (userRole.role === "landlord") {
    // Landlord dashboard
    let propertiesQuery = supabase
      .from("Properties")
      .select(`
        id,
        name,
        property_code,
        address,
        type,
        receipt_serial_counter,
        logo_url,
        units:Units(count)
      `)
      .eq("owner_id", user.id);

    if (propertyId) {
      propertiesQuery = propertiesQuery.eq("id", propertyId);
    }

    const { data: properties, error: propError } = await propertiesQuery;

    if (propError) {
      return NextResponse.json(
        { success: false, error: propError.message },
        { status: 500 },
      );
    }

    // Get maintenance requests for landlord's properties
    const propertyIds = properties?.map((p: any) => p.id) || [];
    let maintQuery = supabase
      .from("MaintenanceRequests")
      .select(`
        id,
        title,
        status,
        urgency,
        created_at,
        property:Properties(name),
        tenant:Users(full_name)
      `)
      .order("created_at", { ascending: false })
      .limit(10);

    if (propertyIds.length > 0) {
      maintQuery = maintQuery.in("property_id", propertyIds);
    } else {
      // No properties, return empty
      maintQuery = maintQuery.eq("property_id", "00000000-0000-0000-0000-000000000000"); // Non-existent ID
    }

    const { data: maintenanceRequests, error: maintError } = await maintQuery;

    // Get payments for landlord's properties
    let payQuery = supabase
      .from("Payments")
      .select(`
        id,
        amount,
        status,
        paid_at,
        property:Properties(name),
        tenant:Users(full_name)
      `)
      .order("paid_at", { ascending: false })
      .limit(10);

    if (propertyIds.length > 0) {
      payQuery = payQuery.in("property_id", propertyIds);
    } else {
      // No properties, return empty
      payQuery = payQuery.eq("property_id", "00000000-0000-0000-0000-000000000000"); // Non-existent ID
    }

    const { data: payments, error: payError } = await payQuery;

    // Get recent announcements
    let annQuery = supabase
      .from("Announcements")
      .select(`
        id,
        body,
        created_at,
        property:Properties(name)
      `)
      .order("created_at", { ascending: false })
      .limit(5);

    if (propertyIds.length > 0) {
      annQuery = annQuery.in("property_id", propertyIds);
    } else {
      // No properties, return empty
      annQuery = annQuery.eq("property_id", "00000000-0000-0000-0000-000000000000"); // Non-existent ID
    }

    const { data: announcements, error: annError } = await annQuery;

    dashboardData = {
      ...dashboardData,
      properties,
      maintenanceRequests: maintenanceRequests || [],
      payments: payments || [],
      announcements: announcements || [],
    };
  } else if (userRole.role === "tenant") {
    // Tenant dashboard
    const { data: userProperties, error: upError } = await supabase
      .from("UserPropertyRoles")
      .select(`
        property:Properties(id, name, address, type, logo_url),
        unit:Units(id, unit_name, type)
      `)
      .eq("user_id", user.id)
      .eq("role", "tenant")
      .eq("status", "active");

    if (upError) {
      return NextResponse.json(
        { success: false, error: upError.message },
        { status: 500 },
      );
    }

    // Get tenant's maintenance requests
    const { data: maintenanceRequests, error: maintError } = await supabase
      .from("MaintenanceRequests")
      .select(`
        id,
        title,
        description,
        status,
        urgency,
        created_at,
        resolved_at,
        property:Properties(name)
      `)
      .eq("tenant_id", user.id)
      .order("created_at", { ascending: false });

    // Get tenant's payments
    const { data: payments, error: payError } = await supabase
      .from("Payments")
      .select(`
        id,
        amount,
        reference,
        status,
        paid_at,
        property:Properties(name)
      `)
      .eq("tenant_id", user.id)
      .order("paid_at", { ascending: false });

    // Get tenant's receipts
    const { data: receipts, error: recError } = await supabase
      .from("Receipts")
      .select(`
        id,
        amount,
        period,
        receipt_no,
        status,
        approved_at,
        receipt_pdf_url,
        property:Properties(name)
      `)
      .eq("tenant_id", user.id)
      .order("approved_at", { ascending: false });

    // Get announcements for tenant's properties
    const propertyIds =
      userProperties?.map((up: any) => up.property?.id).filter(Boolean) || [];
    const { data: announcements, error: annError } = await supabase
      .from("Announcements")
      .select(`
        id,
        body,
        created_at,
        property:Properties(name)
      `)
      .in("property_id", propertyIds)
      .order("created_at", { ascending: false })
      .limit(5);

    dashboardData = {
      ...dashboardData,
      properties: userProperties,
      maintenanceRequests: maintenanceRequests || [],
      payments: payments || [],
      receipts: receipts || [],
      announcements: announcements || [],
    };
  } else if (userRole.role === "admin") {
    // Admin dashboard - overview of all
    const { data: properties, error: propError } = await supabase
      .from("Properties")
      .select("id, name, property_code, owner:Users(full_name)");

    const { data: users, error: userError } = await supabase
      .from("Users")
      .select("id, full_name, email, created_at");

    const { data: maintenanceRequests, error: maintError } = await supabase
      .from("MaintenanceRequests")
      .select("id, status, urgency, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    dashboardData = {
      ...dashboardData,
      properties: properties || [],
      users: users || [],
      maintenanceRequests: maintenanceRequests || [],
    };
  }

  // Log activity
  await supabase.from("ActivityLogs").insert({
    user_id: user.id,
    action: "VIEW",
    entity: "Dashboard",
    details: "Viewed dashboard",
  });

  return NextResponse.json({ success: true, data: dashboardData });
}
