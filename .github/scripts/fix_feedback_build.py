from pathlib import Path

ai = Path('src/lib/aiExport.ts')
s = ai.read_text()

# Idempotent syntax repair for the GPT guidance line.
bad = "lines.push('AI 피드백 지침: 1) 계획 변경 이력을 시간순으로 복원해 처음 계획→재배치/취소→최종 실행을 설명한다. 2) 계획 타임라인과 실제 타임라인을 비교해 계획과 다르게 행동한 구간을 구체적으로 짚는다. 3) 실제 기록이 비어 있는 시간은 딴짓이라고 단정하지 말고 '미기록 시간'으로 표현한다. 4) 폐기/취소를 무조건 실패로 해석하지 말고 합리적 계획 수정인지 구분한다. 5) 막연한 격려보다 잘된 행동, 반복 패턴, 추정오차, 회복력, 다음에 바꿀 가장 작은 행동을 근거와 함께 제시한다.')"
good = "lines.push(\"AI 피드백 지침: 1) 계획 변경 이력을 시간순으로 복원해 처음 계획→재배치/취소→최종 실행을 설명한다. 2) 계획 타임라인과 실제 타임라인을 비교해 계획과 다르게 행동한 구간을 구체적으로 짚는다. 3) 실제 기록이 비어 있는 시간은 딴짓이라고 단정하지 말고 '미기록 시간'으로 표현한다. 4) 폐기/취소를 무조건 실패로 해석하지 말고 합리적 계획 수정인지 구분한다. 5) 막연한 격려보다 잘된 행동, 반복 패턴, 추정오차, 회복력, 다음에 바꿀 가장 작은 행동을 근거와 함께 제시한다.\")"
if bad in s:
    s = s.replace(bad, good, 1)

old_stats = "const activeTaskRecords = taskRecords.filter(task => !task.discarded)"
new_stats = "const activeTaskRecords = taskRecords.filter(task => !task.discarded && !task.deleted)"
if old_stats in s:
    s = s.replace(old_stats, new_stats, 1)
elif new_stats not in s:
    raise SystemExit('activeTaskRecords marker not found')

ai.write_text(s)

# Remove a stale variable left from the old reorder implementation.
store = Path('src/hooks/usePlanrStore.ts')
t = store.read_text()
t = t.replace("      const rest = d.tasks.filter(t => t.category_id !== categoryId)\n", "", 1)
store.write_text(t)
