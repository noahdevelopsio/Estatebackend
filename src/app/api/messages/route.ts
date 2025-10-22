import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabaseServer";

// Zod schemas for validation
const CreateMessageSchema = z.object({
  receiver_id: z.string().uuid(),
  message_body: z.string().min(1, "Message cannot be empty"),
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

// Helper to check if users are in the same property
async function canMessage(
  supabase: any,
  senderId: string,
  receiverId: string,
): Promise<boolean> {
  // Check if both users have roles in the same property
  const { data: senderRoles, error: senderError } = await supabase
    .from("UserPropertyRoles")
    .select("property_id")
    .eq("user_id", senderId);

  if (senderError || !senderRoles.length) return false;

  const { data: receiverRoles, error: receiverError } = await supabase
    .from("UserPropertyRoles")
    .select("property_id")
    .eq("user_id", receiverId);

  if (receiverError || !receiverRoles.length) return false;

  const senderPropertyIds = senderRoles.map((r: any) => r.property_id);
  const receiverPropertyIds = receiverRoles.map((r: any) => r.property_id);

  return senderPropertyIds.some((id: string) =>
    receiverPropertyIds.includes(id),
  );
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
    // Get messages where user is sender or receiver
    const { data, error } = await supabase
      .from("Messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

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
    const validated = CreateMessageSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: validated.error.issues[0].message },
        { status: 400 },
      );
    }

    const { receiver_id, message_body } = validated.data;

    // Prevent self-messaging
    if (receiver_id === user.id) {
      return NextResponse.json(
        { success: false, error: "Cannot send message to yourself" },
        { status: 400 },
      );
    }

    // Check if messaging is allowed (same property)
    const canMsg = await canMessage(supabase, user.id, receiver_id);
    if (!canMsg) {
      return NextResponse.json(
        {
          success: false,
          error: "Access denied: Can only message users in the same property",
        },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("Messages")
      .insert({
        sender_id: user.id,
        receiver_id,
        message_body,
        status: "sent",
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
      "Messages",
      `Sent message to ${receiver_id}`,
    );

    // Create notification for receiver
    await supabase.from("Notifications").insert({
      user_id: receiver_id,
      title: "New Message",
      body: `You have a new message from ${user.id}`, // In production, get user name
      event_type: "message_received",
      reference_id: data.id,
    });

    return NextResponse.json({ success: true, data });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Example request payloads:
// POST: { "receiver_id": "uuid", "message_body": "Hello, how are you?" }
