from pathlib import Path

# 1) Focus mode: local save is authoritative; cloud sync is delegated to the main store.
p = Path('src/components/today/TaskExecutionLayer.tsx')
s = p.read_text()

s = s.replace("import { supabase } from '@/lib/supabase'\nimport { upsertDayEntry } from '@/lib/syncService'\n", "")

old = """      window.localStorage.setItem(DAY_STORAGE_KEY, JSON.stringify(updatedDays))
      if (supabase) {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        if (data.user) await upsertDayEntry(data.user.id, updatedEntry)
      }

      writeSession(null)
      setSession(null)
      window.dispatchEvent(new CustomEvent('planr:focus-stopwatch-saved', {
        detail: { date: session.date, taskId: session.taskId, durationMin: activeMinutes },
      }))
      // The main store already syncs on focus. Trigger it so the React state catches
      // up immediately instead of waiting for the next periodic pull.
      window.dispatchEvent(new Event('focus'))
    } catch (error) {
      console.error('[Planr] focus stopwatch save failed:', error)
      window.alert('집중 시간을 저장하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.')
"""
new = """      // Commit the stopwatch result locally first. Focus recording must never be
      // blocked by a transient Supabase/auth failure: the main store owns cloud
      // persistence and already has dirty-entity retry semantics.
      window.localStorage.setItem(DAY_STORAGE_KEY, JSON.stringify(updatedDays))
      writeSession(null)
      setSession(null)
      window.dispatchEvent(new CustomEvent('planr:focus-stopwatch-saved', {
        detail: {
          entry: updatedEntry,
          date: session.date,
          taskId: session.taskId,
          durationMin: activeMinutes,
        },
      }))
    } catch (error) {
      console.error('[Planr] focus stopwatch local save failed:', error)
      window.alert('집중 시간을 브라우저에 저장하지 못했습니다. 저장 공간 또는 브라우저 상태를 확인한 뒤 다시 시도해주세요.')
"""
if old not in s:
    raise SystemExit('TaskExecutionLayer finishSession marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# 2) Main store: consume the locally committed focus entry, update React state,
# mark the day dirty, and let the existing retry queue handle Supabase.
p = Path('src/hooks/usePlanrStore.ts')
s = p.read_text()
marker = """  function toggleTask(date: string, taskId: string) {
"""
insert = """  useEffect(() => {
    function onFocusStopwatchSaved(event: Event) {
      const detail = (event as CustomEvent<{ entry?: DayEntry }>).detail
      if (!detail?.entry) return
      // The focus layer already committed this exact entry to localStorage.
      // Route it through the store as well so React state updates immediately and
      // Supabase persistence uses the normal dirty/retry path instead of blocking UI.
      upsertDay(detail.entry, { bumpMeta: false })
    }
    window.addEventListener('planr:focus-stopwatch-saved', onFocusStopwatchSaved)
    return () => window.removeEventListener('planr:focus-stopwatch-saved', onFocusStopwatchSaved)
  // upsertDay intentionally follows the current userId; re-register on account change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

"""
if marker not in s:
    raise SystemExit('usePlanrStore toggleTask marker not found')
s = s.replace(marker, insert + marker, 1)
p.write_text(s)
