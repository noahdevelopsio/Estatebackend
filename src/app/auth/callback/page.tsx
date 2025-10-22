'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function Callback() {
  const router = useRouter()

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    if (accessToken && refreshToken) {
      // Exchange tokens for a session
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          if (error) {
            router.push('/auth/login?message=Authentication failed')
          } else {
            router.push('/')
          }
        })
    } else {
      // fallback: check session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) router.push('/')
        else router.push('/auth/login?message=Authentication failed')
      })
    }
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p>Processing authentication...</p>
      </div>
    </div>
  )
}
