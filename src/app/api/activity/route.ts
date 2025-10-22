import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

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
    // For tenants: get activity related to their properties/units
    // For landlords: get activity for their properties
    // To simplify, get activity where user is involved, or for their properties

    const { data: userRoles, error: rolesError } = await supabase
      .from("UserPropertyRoles")
      .select("role, property_id, unit_id")
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
      .from("ActivityLogs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (isTenant && !isLandlord) {
      // Tenant: activity where they are the user, or related to their properties/units
      // For simplicity, get their own activity
      query = query.eq("user_id", user.id);
    } else if (isLandlord && !isTenant) {
      // Landlord: activity for their properties - but since activity logs don't have property_id, this is tricky
      // For now, get all activity (in production, might need to filter based on entity details or add property_id to ActivityLogs)
      // Alternatively, get activity where user is involved
      query = query.or(`user_id.eq.${user.id}`);
    } else {
      // Admin or mixed: all, but limit to user's activity
      query = query.eq("user_id", user.id);
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
