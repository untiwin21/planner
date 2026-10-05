// Credentials are supplied by a secure execution environment, never arguments or chat.
const endpoint = process.env.PLANNER_ASSISTANT_URL || 'https://planner-kappa-two.vercel.app/api/assistant'
const token = process.env.PLANNER_ASSISTANT_TOKEN
if (!token) throw new Error('PLANNER_ASSISTANT_TOKEN must be provided securely')
let body = ''
for await (const chunk of process.stdin) body += chunk
const command = JSON.parse(body)
const response = await fetch(endpoint, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(command), signal: AbortSignal.timeout(30000),
})
const result = await response.json()
if (!response.ok) { console.error(`Planner request failed (${response.status})`); process.exitCode = 1 }
else console.log(JSON.stringify(result, null, 2))
