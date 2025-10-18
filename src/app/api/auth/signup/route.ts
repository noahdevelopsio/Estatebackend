import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { supabase } from '@/lib/supabaseClient'

export async function POST(req: Request) {
  const supabaseAuth = await createClient()
  const { email, password, full_name } = await req.json()

  const { data, error } = await supabaseAuth.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
    },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Insert into public.Users table using service role
  if (data.user) {
    const { error: insertError } = await supabase
      .from('Users')
      .insert({
        id: data.user.id,
        full_name,
        email,
      })

    if (insertError) {
      console.error('Error inserting user into public.Users:', insertError)
      return NextResponse.json({ error: 'Failed to save user profile' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, user: data.user })
}
