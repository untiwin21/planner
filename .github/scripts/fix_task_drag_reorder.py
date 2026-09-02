from pathlib import Path

p = Path('src/components/today/TodayDashboard.tsx')
s = p.read_text()

old_dragover = """                      onDragOver={event => {
                        if (!onReorderTask || !draggedTaskId?.startsWith('task:') || draggedTaskId === token) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={event => {
                        const source = draggedTaskId ?? event.dataTransfer.getData('text/plain')
                        if (!onReorderTask || !source.startsWith('task:') || source === token) return
                        event.preventDefault()
                        onReorderTask(category.id, source.slice(5), task.id)
                        setDraggedTaskId(null)
                      }}
"""
new_dragover = """                      onDragOver={event => {
                        // A native HTML drag target must call preventDefault synchronously.
                        // Do not depend on React state here: draggedTaskId may still be stale
                        // during the first dragover, which makes the browser show a forbidden cursor.
                        if (!onReorderTask) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={event => {
                        event.preventDefault()
                        const source = draggedTaskId ?? event.dataTransfer.getData('text/plain')
                        if (!onReorderTask || !source.startsWith('task:') || source === token) return
                        const sourceTask = entry.tasks.find(item => item.id === source.slice(5))
                        if (!sourceTask || sourceTask.category_id !== category.id) return
                        onReorderTask(category.id, sourceTask.id, task.id)
                        setDraggedTaskId(null)
                        setDragPreviewMinute(null)
                      }}
"""
if old_dragover not in s:
    raise SystemExit('task dragover marker not found')
s = s.replace(old_dragover, new_dragover, 1)

old_pointer = """                          onPointerDown={event => {
                            if (task.done || task.discarded || !event.isPrimary) return
                            pointerTaskIdRef.current = token
                            setDraggedTaskId(token)
                            event.currentTarget.setPointerCapture(event.pointerId)
                          }}
                          onPointerMove={event => {
                            if (pointerTaskIdRef.current !== token) return
                            event.preventDefault()
                            const drop = timelineDropAtPoint(event.clientX, event.clientY)
                            setDragPreviewMinute(drop?.minute ?? null)
                            if (drop) setDragTargetSide(drop.side)
                          }}
                          onPointerUp={event => finishPointerDrag(event.clientX, event.clientY)}
                          onPointerCancel={() => finishPointerDrag(-1, -1)}
"""
new_pointer = """                          onPointerDown={event => {
                            // Mouse uses native HTML5 drag/drop so cards can reorder reliably.
                            // Pointer capture is reserved for touch/pen timeline placement.
                            if (event.pointerType === 'mouse' || task.done || task.discarded || !event.isPrimary) return
                            pointerTaskIdRef.current = token
                            setDraggedTaskId(token)
                            event.currentTarget.setPointerCapture(event.pointerId)
                          }}
                          onPointerMove={event => {
                            if (event.pointerType === 'mouse' || pointerTaskIdRef.current !== token) return
                            event.preventDefault()
                            const drop = timelineDropAtPoint(event.clientX, event.clientY)
                            setDragPreviewMinute(drop?.minute ?? null)
                            if (drop) setDragTargetSide(drop.side)
                          }}
                          onPointerUp={event => {
                            if (event.pointerType !== 'mouse') finishPointerDrag(event.clientX, event.clientY)
                          }}
                          onPointerCancel={event => {
                            if (event.pointerType !== 'mouse') finishPointerDrag(-1, -1)
                          }}
"""
if old_pointer not in s:
    raise SystemExit('task pointer marker not found')
s = s.replace(old_pointer, new_pointer, 1)

p.write_text(s)
