import { supabase } from './supabase'

export async function signInWithGoogle() {
  if (!supabase) return
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://planner-kappa-two.vercel.app' }
  })
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