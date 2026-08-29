from pathlib import Path

p = Path('src/components/today/TodayDashboard.tsx')
s = p.read_text()
old = """    return items.sort((a, b) => a.start - b.start)
  }, [entry.tasks])

  const flexible = useMemo(() => entry.tasks
"""
new = """    return items.sort((a, b) => a.start - b.start)
  }, [date, entry.tasks])

  const flexible = useMemo(() => entry.tasks
"""
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('actualBlocks dependency marker not found')
p.write_text(s)
