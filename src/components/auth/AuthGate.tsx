'use client'

import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { signInWithGoogle } from '@/lib/auth'
import { watchAuthSession } from '@/lib/authSession'
import { UserContext } from '@/context/UserContext'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    return watchAuthSession(supabase, nextSession => {
      setSession(nextSession)
      setAuthError(false)
      setLoading(false)
    }, () => {
      setAuthError(true)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg, #F8F9FA)' }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (authError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
        <section role="alert" className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-8 text-center">
          <h1 className="text-xl font-bold">로그인 연결을 확인하지 못했어요</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-3)]">인터넷 연결을 확인한 뒤 다시 시도해주세요.</p>
          <button onClick={() => window.location.reload()} className="mt-6 rounded-lg bg-[var(--purple)] px-5 py-2.5 font-medium text-white">다시 시도</button>
        </section>
      </main>
    )
  }

  // Local/offline mode remains usable when Supabase environment variables are
  // absent. Production still requires the authenticated server-backed session.
  if (!supabase) {
    return <UserContext.Provider value="">{children}</UserContext.Provider>
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg, #F8F9FA)' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>Planr</h1>
          <p style={{ margin: '10px 0 20px', fontSize: '1.1rem', color: '#666' }}>Your life, organized.</p>
          <button
            onClick={signInWithGoogle}
            style={{
              background: '#4285F4',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Google로 로그인
          </button>
        </div>
      </div>
    )
  }

  return <UserContext.Provider value={session.user.id}>{children}</UserContext.Provider>
}
