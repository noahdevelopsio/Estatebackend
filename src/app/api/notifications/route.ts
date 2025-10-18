import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { z } from 'zod'
import type { Notifications } from '@/types/db'

// Zod schemas for validation
const UpdateNotificationSchema = z.object({
  id: z.string().uuid(),
  is_read: z.boolean(),
})

// Helper function to log activity
async function logActivity(supabase: any, userId: string, action: string, entity: string, details: string) {
  const { error } = await supabase
    .from('ActivityLogs')
    .insert({ user_id: userId, action, entity, details })
  if (error) console.error('Failed to log activity:', error)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('Notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const validated = UpdateNotificationSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json({ success: false, error: validated.error.issues[0].message }, { status: 400 })
    }

    const { id, is_read } = validated.data

    // Ensure the notification belongs to the user
    const { data: notification, error: notifError } = await supabase
      .from('Notifications')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (notifError || !notification) {
      return NextResponse.json({ success: false, error: 'Notification not found or access denied' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('Notifications')
      .update({ is_read })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Log activity if marking as read
    if (is_read) {
      await logActivity(supabase, user.id, 'UPDATE', 'Notifications', `Marked notification ${id} as read`)
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Example request payloads:
// PUT: { "id": "uuid", "is_read": true }
