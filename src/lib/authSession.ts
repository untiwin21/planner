import type { Session, SupabaseClient } from '@supabase/supabase-js'

// Subscribe only after initial recovery/refresh finishes. Auth callbacks run
// under the SDK lock: consume their session directly, never call auth APIs.
export function watchAuthSession(
  client: Pick<SupabaseClient, 'auth'>,
  onSession: (session: Session | null) => void,
  onError: () => void,
  timeoutMs = 12000,
) {
  let disposed = false
  let unsubscribe: (() => void) | undefined
  const timer = setTimeout(() => {
    if (!disposed) onError()
  }, timeoutMs)

  void (async () => {
    try {
      const { data, error } = await client.auth.getSession()
      if (disposed) return
      clearTimeout(timer)
      if (error) {
        onError()
        return
      }
      onSession(data.session)

      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        if (!disposed) onSession(session)
      })
      unsubscribe = () => subscription.unsubscribe()
    } catch {
      clearTimeout(timer)
      if (!disposed) onError()
    }
  })()

  return () => {
    disposed = true
    clearTimeout(timer)
    unsubscribe?.()
  }
}
