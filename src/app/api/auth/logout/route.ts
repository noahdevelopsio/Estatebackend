import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function POST() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, message: 'Logged out' }, { status: 200 })
}
