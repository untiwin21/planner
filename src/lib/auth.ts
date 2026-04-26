import { supabase } from './supabase'

export async function signInWithGoogle() {
  console.log('버튼 클릭됨')
  console.log('supabase:', supabase)
  
  if (!supabase) {
    console.log('supabase가 null임 — 환경변수 문제')
    return
  }
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://planner-kappa-two.vercel.app' }
  })
  
  console.log('data:', data)
  console.log('error:', error)
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export function onAuthStateChange(cb: (userId: string | null) => void) {
  if (!supabase) return
  return supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user?.id ?? null)
  })
}