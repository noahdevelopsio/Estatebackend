import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch additional user data from Users table
  const { data: userData, error: userError } = await supabase
    .from('Users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (userError) {
    return NextResponse.json({ error: 'User data not found' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      full_name: userData.full_name,
      phone: userData.phone,
      role: userData.role,
      created_at: userData.created_at,
    }
  })
}
