'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { onAuthStateChange, signInWithGoogle } from '@/lib/auth'
import { UserContext } from '@/context/UserContext'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function getSession() {
      if (!supabase) {
        setLoading(false)
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setLoading(false)
    }

    getSession()

    const authListener = onAuthStateChange((_userId) => {
        // For simplicity, we'll just refetch the session.
        // A more robust implementation might handle different auth events.
        supabase?.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
        })
    })

    return () => {
      authListener?.data.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg, #F8F9FA)' }}>
        <p>Loading...</p>
      </div>
    )
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
