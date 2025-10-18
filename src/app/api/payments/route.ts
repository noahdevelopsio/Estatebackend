import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { z } from 'zod'
import type { Payments } from '@/types/db'

// Zod schemas for validation
const CreatePaymentSchema = z.object({
  property_id: z.string().uuid(),
  amount: z.number().positive(),
  reference: z.string().min(1),
  payment_method: z.string().min(1),
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
    // For tenants: get their own payments
    // For landlords: get payments for their properties

    const { data: userRoles, error: rolesError } = await supabase
      .from('UserPropertyRoles')
      .select('role, property_id')
      .eq('user_id', user.id)

    if (rolesError) {
      return NextResponse.json({ success: false, error: 'Failed to fetch user roles' }, { status: 500 })
    }

    const isTenant = userRoles.some((role: any) => role.role === 'tenant')
    const isLandlord = userRoles.some((role: any) => role.role === 'landlord')

    let query = supabase.from('Payments').select('*').order('paid_at', { ascending: false })

    if (isTenant && !isLandlord) {
      // Tenant: only own payments
      query = query.eq('tenant_id', user.id)
    } else if (isLandlord && !isTenant) {
      // Landlord: payments for their properties
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
    const validated = CreatePaymentSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json({ success: false, error: validated.error.issues[0].message }, { status: 400 })
    }

    const { property_id, amount, reference, payment_method } = validated.data

    // Validate tenant access to property
    const role = await getUserRoleForProperty(supabase, user.id, property_id)
    if (role !== 'tenant') {
      return NextResponse.json({ success: false, error: 'Access denied: Only tenants can record payments for their property' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('Payments')
      .insert({
        tenant_id: user.id,
        property_id,
        amount,
        reference,
        payment_method,
        status: 'pending' // Assuming payments start as pending
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Log activity
    await logActivity(supabase, user.id, 'CREATE', 'Payments', `Recorded payment: ${reference}`)

    // Optionally create notification for landlord
    // For now, skip

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Example request payloads:
// POST: { "property_id": "uuid", "amount": 1000.00, "reference": "PAY-001", "payment_method": "Bank Transfer" }
