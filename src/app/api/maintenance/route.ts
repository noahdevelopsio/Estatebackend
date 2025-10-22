import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabaseServer";

// Zod schemas for validation
const CreateMaintenanceSchema = z.object({
  property_id: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().min(1, "Description is required"),
  urgency: z.enum(["low", "medium", "high"]),
});

const UpdateMaintenanceSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "in-progress", "resolved"]),
  resolved_at: z.string().optional(), // ISO date string
});

// Helper function to log activity
async function logActivity(
  supabase: any,
  userId: string,
  action: string,
  entity: string,
  details: string,
) {
  const { error } = await supabase
    .from("ActivityLogs")
    .insert({ user_id: userId, action, entity, details });
  if (error) console.error("Failed to log activity:", error);
}

// Helper to get user role for a property
async function getUserRoleForProperty(
  supabase: any,
  userId: string,
  propertyId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("UserPropertyRoles")
    .select("role")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .single();
  if (error || !data) return null;
  return data.role;
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    // For tenants: get their own requests
    // For landlords: get requests for their properties
    // To simplify, we'll query all and filter based on role, but in production, use RLS

    const { data: userRoles, error: rolesError } = await supabase
      .from("UserPropertyRoles")
      .select("role, property_id")
      .eq("user_id", user.id);

    if (rolesError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch user roles" },
        { status: 500 },
      );
    }

    const isTenant = userRoles.some((role: any) => role.role === "tenant");
    const isLandlord = userRoles.some((role: any) => role.role === "landlord");

    let query = supabase
      .from("MaintenanceRequests")
      .select("*")
      .order("created_at", { ascending: false });

    if (isTenant && !isLandlord) {
      // Tenant: only own requests
      query = query.eq("tenant_id", user.id);
    } else if (isLandlord && !isTenant) {
      // Landlord: requests for their properties
      const propertyIds = userRoles
        .filter((role: any) => role.role === "landlord")
        .map((role: any) => role.property_id);
      if (propertyIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
      query = query.in("property_id", propertyIds);
    } else {
      // Admin or mixed: all, but for now, assume based on roles
      const allPropertyIds = userRoles
        .map((role: any) => role.property_id)
        .filter(Boolean);
      if (allPropertyIds.length > 0) {
        query = query.in("property_id", allPropertyIds);
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Simulate auth for testing
export async function GET_SIMULATED(_req: NextRequest, userId: string) {
  const supabase = await createClient();
  // Simulate user
  const user = { id: userId };

  try {
    // For tenants: get their own requests
    // For landlords: get requests for their properties
    // To simplify, we'll query all and filter based on role, but in production, use RLS

    const { data: userRoles, error: rolesError } = await supabase
      .from("UserPropertyRoles")
      .select("role, property_id")
      .eq("user_id", user.id);

    if (rolesError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch user roles" },
        { status: 500 },
      );
    }

    const isTenant = userRoles.some((role: any) => role.role === "tenant");
    const isLandlord = userRoles.some((role: any) => role.role === "landlord");

    let query = supabase
      .from("MaintenanceRequests")
      .select("*")
      .order("created_at", { ascending: false });

    if (isTenant && !isLandlord) {
      // Tenant: only own requests
      query = query.eq("tenant_id", user.id);
    } else if (isLandlord && !isTenant) {
      // Landlord: requests for their properties
      const propertyIds = userRoles
        .filter((role: any) => role.role === "landlord")
        .map((role: any) => role.property_id);
      if (propertyIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
      query = query.in("property_id", propertyIds);
    } else {
      // Admin or mixed: all, but for now, assume based on roles
      const allPropertyIds = userRoles
        .map((role: any) => role.property_id)
        .filter(Boolean);
      if (allPropertyIds.length > 0) {
        query = query.in("property_id", allPropertyIds);
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json();
    const validated = CreateMaintenanceSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: validated.error.issues[0].message },
        { status: 400 },
      );
    }

    const { property_id, title, description, urgency } = validated.data;

    // Validate tenant access to property
    const role = await getUserRoleForProperty(supabase, user.id, property_id);
    if (role !== "tenant") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Access denied: Only tenants can create maintenance requests for their property",
        },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("MaintenanceRequests")
      .insert({
        tenant_id: user.id,
        property_id,
        title,
        description,
        urgency,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Log activity
    await logActivity(
      supabase,
      user.id,
      "CREATE",
      "MaintenanceRequests",
      `Created maintenance request: ${title}`,
    );

    // Optionally create notification for landlord
    // For now, skip detailed notification logic

    return NextResponse.json({ success: true, data });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json();
    const validated = UpdateMaintenanceSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: validated.error.issues[0].message },
        { status: 400 },
      );
    }

    const { id, status, resolved_at } = validated.data;

    // Get the request to check property
    const { data: request, error: reqError } = await supabase
      .from("MaintenanceRequests")
      .select("property_id")
      .eq("id", id)
      .single();

    if (reqError || !request) {
      return NextResponse.json(
        { success: false, error: "Maintenance request not found" },
        { status: 404 },
      );
    }

    // Validate landlord access to property
    const role = await getUserRoleForProperty(
      supabase,
      user.id,
      request.property_id,
    );
    if (role !== "landlord") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Access denied: Only landlords can update maintenance requests",
        },
        { status: 403 },
      );
    }

    const updateData: any = { status };
    if (status === "resolved" && resolved_at) {
      updateData.resolved_at = resolved_at;
    }

    const { data, error } = await supabase
      .from("MaintenanceRequests")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Log activity
    await logActivity(
      supabase,
      user.id,
      "UPDATE",
      "MaintenanceRequests",
      `Updated status to ${status} for request ${id}`,
    );

    // Create notification for tenant if resolved
    if (status === "resolved") {
      const { data: tenant } = await supabase
        .from("Users")
        .select("id")
        .eq("id", data.tenant_id)
        .single();
      if (tenant) {
        await supabase.from("Notifications").insert({
          user_id: tenant.id,
          title: "Maintenance Request Resolved",
          body: `Your maintenance request "${data.title}" has been resolved.`,
          event_type: "maintenance_resolved",
          reference_id: id,
        });
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Example request payloads:
// POST: { "property_id": "uuid", "title": "Leaky faucet", "description": "Fix the kitchen faucet", "urgency": "high" }
// PUT: { "id": "uuid", "status": "resolved", "resolved_at": "2023-10-01T00:00:00Z" }
