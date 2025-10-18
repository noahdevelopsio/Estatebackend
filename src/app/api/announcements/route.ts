import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { z } from 'zod'
import type { Announcements } from '@/types/db'

// Zod schemas for validation
const CreateAnnouncementSchema = z.object({
  property_id: z.string().uuid(),
  body: z.string().min(1, 'Announcement body is required'),
})

// Helper function to log activity
async function logActivity(supabase: any, userId: string, action: string, entity: string, details: string) {
  const { error } = await supabase
    .from('ActivityLogs')
    .insert({ user_id: userId, action, entity, details })
  if (error) console.error('Failed to log activity:', error)
}

// Helper to get user role for a property
async function getUserRoleForProperty(supabase: any, userId: string, propertyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('UserPropertyRoles')
    .select('role')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .single()
  if (error || !data) return null
  return data.role
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // For tenants: get announcements for their properties
    // For landlords: get announcements they created or for their properties

    const { data: userRoles, error: rolesError } = await supabase
      .from('UserPropertyRoles')
      .select('role, property_id')
      .eq('user_id', user.id)

    if (rolesError) {
      return NextResponse.json({ success: false, error: 'Failed to fetch user roles' }, { status: 500 })
    }

    const isTenant = userRoles.some((role: any) => role.role === 'tenant')
    const isLandlord = userRoles.some((role: any) => role.role === 'landlord')

    let query = supabase.from('Announcements').select('*').order('created_at', { ascending: false })

    if (isTenant && !isLandlord) {
      // Tenant: announcements for their properties
      const propertyIds = userRoles.filter((role: any) => role.role === 'tenant').map((role: any) => role.property_id)
      if (propertyIds.length === 0) {
        return NextResponse.json({ success: true, data: [] })
      }
      query = query.in('property_id', propertyIds)
    } else if (isLandlord && !isTenant) {
      // Landlord: announcements for their properties
      const propertyIds = userRoles.filter((role: any) => role.role === 'landlord').map((role: any) => role.property_id)
      if (propertyIds.length === 0) {
        return NextResponse.json({ success: true, data: [] })
      }
      query = query.in('property_id', propertyIds)
    } else {
      // Admin or mixed: all, but for now, assume based on roles
      const allPropertyIds = userRoles.map((role: any) => role.property_id).filter(Boolean)
      if (allPropertyIds.length > 0) {
        query = query.in('property_id', allPropertyIds)
      }
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const validated = CreateAnnouncementSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json({ success: false, error: validated.error.issues[0].message }, { status: 400 })
    }

    const { property_id, body: announcementBody } = validated.data

    // Validate landlord access to property
    const role = await getUserRoleForProperty(supabase, user.id, property_id)
    if (role !== 'landlord') {
      return NextResponse.json({ success: false, error: 'Access denied: Only landlords can create announcements for their property' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('Announcements')
      .insert({
        property_id,
        created_by: user.id,
        body: announcementBody
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Log activity
    await logActivity(supabase, user.id, 'CREATE', 'Announcements', `Created announcement for property ${property_id}`)

    // Create notifications for tenants in the property
    // Get tenants in the property
    const { data: tenants, error: tenantError } = await supabase
      .from('UserPropertyRoles')
      .select('user_id')
      .eq('property_id', property_id)
      .eq('role', 'tenant')

    if (!tenantError && tenants) {
      const notifications = tenants.map((tenant: any) => ({
        user_id: tenant.user_id,
        title: 'New Announcement',
        body: `New announcement posted for your property.`,
        event_type: 'announcement_posted',
        reference_id: data.id
      }))
      await supabase.from('Notifications').insert(notifications)
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Example request payloads:
// POST: { "property_id": "uuid", "body": "Maintenance scheduled for tomorrow." }
