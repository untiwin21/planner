from pathlib import Path

p = Path('src/components/today/TodayDashboard.tsx')
s = p.read_text()
old = """  const flexible = useMemo(() => entry.tasks
    .filter(task => !isActualOnlyTask(task) && !isFixedTask(task))
    .sort((a, b) => Number(a.discarded) - Number(b.discarded) || Number(a.done) - Number(b.done) || (a.updated_at ?? 0) - (b.updated_at ?? 0)), [entry.tasks])
"""
new = """  // Preserve the explicit order stored in DayEntry. User drag ordering must not
  // be overridden by completion state or updated_at timestamps.
  const flexible = useMemo(() => entry.tasks
    .filter(task => !isActualOnlyTask(task) && !isFixedTask(task)), [entry.tasks])
"""
if old not in s:
    if new in s:
        raise SystemExit(0)
    raise SystemExit('flexible task sorting marker not found')
p.write_text(s.replace(old, new, 1))
