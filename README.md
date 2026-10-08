# Planr

남은 시간을 기준으로 오늘을 설계하는 플래너입니다. 고정 일정과 유동 작업을 분리하고, 실제로 쓸 수 있는 시간과 과부하 여부를 한 화면에서 보여줍니다.

## 주요 기능

- 오늘의 활동 시간과 고정 일정을 반영한 남은 시간 계산
- 유동 작업의 예상 소요 시간, 선택적 시작 시간 배치, 과부하 경고
- 카테고리별 색상과 오늘의 Top 3
- 주간 플래너, 단기 목표, 루틴, 회고와 기록
- Supabase 로그인 기반 다중 디바이스 동기화
- 작업 삭제 tombstone과 최신 수정 시각 병합으로 오래된 기기의 데이터 부활 방지
- Supabase가 없는 로컬 환경에서는 브라우저 저장소로 동작

## 일정 카드의 의미 (모든 AI 비서 채팅 공통)

목표·계획 화면은 한국시간 이번 주 월요일부터 4주차 일요일까지의 카드가 먼저, 이번 주 요약이 아래에 표시됩니다. 카드 본문에는 이름과 날짜만 표시하며 유형은 색깔로 구분합니다.

| 유형 | 의미 | 색상 | 저장 |
| --- | --- | --- | --- |
| Public | 수업·시험·면접·회의처럼 공식적으로 정해진 일정 | 초록~연두 | `category_id=schedule`, `schedule_details.visibility=public` |
| Private | 개인이 계획한 활동·약속·계획 | 하늘~파랑 | `category_id=schedule`, `schedule_details.visibility=private` |
| 데드라인 | 과제 제출·단기계획 등 **이 기한까지 완료할 일** | 빨강 | `category_id=deadline`, 선택 마감 시각은 `schedule_details.due_time` |

- 데드라인은 60분짜리 일정이 아닙니다. `fixed=false`이며 시작/종료/예상시간을 배정하거나 타임라인 용량·일정 겹침에 포함하지 않습니다. 준비 작업은 별도 할 일로 관리합니다.
- 단기계획(`ShortGoal`)은 기존 기간을 보존합니다. 카드 상세에서 데드라인으로 지정하면 종료일(`date_to`)을 마감일로 표시합니다. 이 유형은 `categories`의 `__schedule_details__` 항목에 `details.kind=deadline`으로 저장합니다.
- 공식 과제도 **제출 기한**이면 데드라인입니다. 공식/개인 분류보다 마감의 의미가 우선합니다. 10시부터 11시까지 시험은 Public, 23:59까지 과제 제출은 데드라인입니다. 시각이 없는 마감은 날짜만 저장하고 임의로 23:59를 만들지 않습니다.
- Public/Private은 일정 성격이며 파일 공개·공유 권한을 바꾸지 않습니다.
- 응시 완료와 합격은 다릅니다. 조건부 면접은 합격 통지와 개인별 안내 확인 전까지 확정 일정으로 만들지 않습니다.
- AI는 실제 `planner_read`를 먼저 호출하고 응답의 `schedule_card_policy`와 저장 도구 스키마를 확인합니다. 수정 시 최신 `expected_updated_at`을 사용하고 저장 후 재조회합니다.
- 사용자 회고 Keep·Problem·Try는 ChatGPT 피드백 바로 아래에 위치합니다.

## 스택
- **Next.js 15** + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (DB / Auth / 기기 간 동기화)
- **Vercel** 배포

## 로컬 실행

```bash
npm install
cp .env.example .env.local
# .env.local에 Supabase 키 입력 (없으면 브라우저 로컬 모드)
npm run dev
```

## 구조

```
src/
├── app/
│   ├── globals.css     디자인 토큰
│   ├── layout.tsx
│   └── page.tsx        메인 페이지 (전체 조율)
├── components/
│   ├── ui/             공통 컴포넌트 (Card, Badge, Checkbox, Input...)
│   ├── today/          남은 시간, 타임라인, 작업 배치
│   ├── weekly/         DayCard, DayDetail
│   ├── goals/          GoalCard, GoalDetail
│   └── routine/        RoutineSidebar
├── hooks/
│   └── usePlanrStore.ts  로컬 캐시 + Supabase 동기화 상태관리
├── lib/
│   ├── dates.ts        날짜 유틸
│   ├── plannerTime.ts  가용 시간 계산
│   └── supabase.ts     Supabase 클라이언트
└── types/
    └── index.ts        TypeScript 타입
```

## Vercel 배포

```bash
npm i -g vercel
vercel
```

## Supabase 설정

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. `.env.local`에 URL과 ANON_KEY 입력
3. `supabase/schema.sql`을 SQL Editor에서 실행

동기화 데이터의 서버 레코드가 기준이며, 브라우저 저장소는 오프라인 캐시로 사용됩니다. 카테고리·Top 3·주간 문장·주간 기록도 같은 계정의 기기 사이에서 동기화됩니다.

## ChatGPT 일정·피드백 연동

오늘과 주간 일정을 **플래너** 화면에서 함께 확인합니다. 주간 카드는 일정·데드라인,
수면·컨디션·집중력·달성률만 표시하며, 목표·월간 계획은 별도 화면에 유지합니다.

로그인된 페이지는 WebMCP 도구를 노출합니다. ChatGPT의 브라우저에서 운영 사이트를
열고 최초 1회 Google 로그인을 마치면, 대화에서 다음 도구로 실제 계정 데이터를 관리할 수 있습니다.
별도 API 키나 관리자 권한은 필요하지 않습니다. 일반 브라우저의 로그인은 ChatGPT 브라우저와
공유되지 않습니다. 로그인 만료 시 다시 연결해야 합니다. 닫힌 브라우저에서 자동 실행되는 작업은 없습니다.

- `planner_read`: 기간별 일정·데드라인·할 일·삭제 기록·카테고리·목표·루틴·일일 기록 조회
- `planner_save_task`: 등록/수정/완료 처리, 최신 수정 시각 확인, 겹치는 일정 기본 차단
- `planner_delete_task` / `planner_restore_task`: 복원 가능한 삭제와 복원
- `planner_save_feedback`: ChatGPT 피드백 저장 (기존 자비스 기록과 독립)

시간은 `Asia/Seoul`, 날짜는 `YYYY-MM-DD`, 시간은 `HH:mm`입니다.
종료 시각이 시작보다 이르면 다음 날 종료로 처리합니다. 종료 시간이 미정이면
시간을 추측하지 않고 저장하되, 충돌 판정이 불완전하다고 안내합니다.
데드라인은 실행 시간을 차지하는 일정과 구분합니다. 수정/삭제에는 조회한
`expected_updated_at`을 전달해야 합니다. 날짜 이동은 목적 날짜에 새 ID로 등록하고
저장 성공을 확인한 다음 원본을 삭제합니다. 두 저장이 완료됐는지 각각 확인합니다.
새 ID는 재시도 때 그대로 유지해서 중복 등록을 방지합니다.

WebMCP가 없는 브라우저에서는 화면 상단 **ChatGPT 연동 → 연동 명령**의 JSON 입력으로
동일한 동작을 수행할 수 있습니다. 실행 결과는 서버 저장을 확인한 뒤에만 `saved: true`를 반환합니다.
Supabase의 기존 사용자별 RLS를 그대로 적용하며, JSON 스냅샷 비교와 최신 수정 시각 병합으로
다른 기기·AI의 변경을 덮어쓰지 않도록 처리합니다.

ChatGPT 피드백은 요청할 때 기록합니다. 예전 자비스 자동화 자체는 이 저장소에 없으므로
외부 자비스 실행기는 이 변경으로 중단되지 않습니다. 새 ChatGPT 피드백은 별도 필드에
저장되어 이후 자비스 기록에 덮어써지지 않습니다.

검증: `node tests/plannerAssistant.test.cjs` 및 `npm run build`.


## 브라우저 없는 비서 연결 (서버 API)

`POST /api/assistant`는 Google 로그인이나 열린 브라우저 없이 위와 같은 도구를 실행한다.
기본 상태는 비활성(503)이며, 인증되지 않은 요청은 401이다. 계정 ID는 서버 설정에서만
선택되며 요청의 `user_id`/SQL/임의 도구/임의 입력 필드는 거부한다. 원본 서비스 키와
비서 토큰은 브라우저, 저장소, 채팅, URL, 로그에 넣지 않는다.

운영 Vercel 프로젝트에 다음 **서버 전용 / Production 전용** 환경변수를 설정하고 재배포한다.

- `SUPABASE_SERVICE_ROLE_KEY`: 해당 Planner Supabase 프로젝트의 서버 서비스 키.
  서버 내부에서만 사용한다. 이 키 자체는 관리자 권한이므로 클라이언트에 전달하지 않는다.
- `PLANNER_ASSISTANT_USER_ID`: Supabase Authentication에서 확인한 Planner 소유자 계정
  `twws137701@gmail.com`의 UUID. 계정이 다르면 설정하지 않는다.
- `PLANNER_ASSISTANT_TOKEN_SHA256`: 별도 생성한 32바이트 이상 무작위 base64url 비서 토큰의
  SHA-256 (64자리 hex). 서버는 원본 토큰 대신 해시만 저장한다.

원본 토큰은 실행기의 보안 비밀 저장소에 `PLANNER_ASSISTANT_TOKEN`으로 보관한다.
다른 대화와 자동 브리핑 실행기도 이 보안 설정에 접근할 수 있도록 별도로 연결해야 한다.
코드 배포만으로 ChatGPT에 새로운 커넥터나 자격증명이 자동으로 설치되지는 않는다.
토큰 폐기는 Vercel에서 해시를 제거하거나 교체한 후 재배포하는 방식이다.

인증된 `GET /api/assistant`는 도구 목록과 준비 상태를 반환한다. 실제 데이터 연결 확인에는
`planner_read`를 반드시 사용한다. 준비 상태만으로 DB 저장 성공을 판단하지 않는다.
명령 본문은 `{ "tool": "planner_read", "input": { "from": "2026-10-05", "to": "2026-10-05" } }`
형식이다. `scripts/planner-assistant.mjs`는 stdin의 JSON 명령을 같은 API로 실행하며 토큰은
환경변수에서만 받는다. HTTP 성공 및 `saved: true`를 확인하고 다시 조회하여 검증한다.
수정·삭제에는 기존과 같은 `expected_updated_at`을 사용한다. 새 항목 재시도에는 같은 ID를 쓴다.

인증 경계 검사: `node tests/assistantApi.test.cjs`. 기존 저장 로직 검사:
`node tests/plannerAssistant.test.cjs`. 배포 전 `npm run build`.


## 조건부 채용 일정과 날짜 미정 카드 (2026-10-08)

- 채용 대상을 조사할 때 Notion 2026/2026 하반기 취업 준비/서류 DB에서 진행상황이 서류 불합격, 서류, 공란인 회사는 제외한다. 이번 대상: 포스코, 두산에너빌리티, LG전자, LIG넥스원, LG CNS, LS엠트론. 각 카드 상세의 Notion 원문과 공식 안내를 우선 확인한다.
- 확정 시험/면접은 Task, 제출 마감은 deadline. 공지된 월/주/기간은 planner_add_schedule_card의 timing=window, 원문 표현은 date_label에 저장한다. 개인 면접일은 추정하지 않는다.
- 발표 전 후속 전형/마감은 timing=undated로 date_from/date_to 없이 등록한다. DB 내부 날짜는 스키마 호환용이며 실제 일정이 아니다. 미정/기간 카드는 일반 목표와 오늘 할 일, 주간 통계에서 분리한다.
- 각 회사 단계는 dependencies=[{id:선행카드ID,requirement:passed}]로 연결한다. 포스코는 PAT I/PAT II 모두 충족해야 한다. 출석/응시 완료는 합격이 아니다.
- planner_read.schedule_cards의 discardedBy는 불합격이 전파된 원본 카드 ID다. 결과 failed를 저장하면 모든 후속 단계가 재귀적으로 일정에서 제외되고 폐기 기록에 보관된다. 결과 정정은 복구한다. 미확인/누락된 선행 일정은 임의로 불합격 처리하지 않는다.
- Task 결과는 planner_save_task와 expected_updated_at, 기간/미정 카드 결과는 planner_set_card_result와 최신 goals.categories를 expected_categories로 사용한다. 채팅에서 불합격을 알려주면 해당 단계 결과를 먼저 저장하고 이후 전형의 제외 여부를 실제 다시 조회한다.
- Notion과 Planner의 지속 자동 감시는 별도로 구성한 경우에만 동작한다. 노션의 상태가 바뀌었다는 확인 없이 탈락을 추정하거나 지속 감시 중이라고 말하지 않는다.

- 주차는 월~일입니다. `timing=window`는 4주 범위와 겹치는 예정 기간만 하단 일정 미정 영역에 `date_label`과 함께 표시합니다. `timing=undated`처럼 기간 근거가 없으면 임의 날짜로 포함하지 않습니다. 4주 이후 항목은 화면에서 제외하되 기록은 보존합니다.

- 목표·계획 일정 카드에서만 오늘 이전에 끝난 일정과 예정 기간을 숨깁니다. 오늘까지 이어지는 기간은 표시합니다. 플래너 주간 카드·저장 기록·선행 조건 조회는 그대로 보존합니다.

- 카드 상세는 일반 일정 중심으로 원문·안내 링크까지 표시합니다. 채용 결과·선행 조건·후속 전형은 비서 메타데이터로 보존하며 화면에는 표시하지 않습니다. 주차 제목은 `10월 3주차` 형태입니다. 월 경계 주는 목요일이 속한 월을 기준으로 합니다.


## 반복 수업의 화면별 표시 예외

- 사용자가 일부 반복 수업/출석체크를 목표·계획 카드에서만 제외하도록 요청하면 해당 Task의 schedule_details.hide_from_goal_cards=true를 저장한다. 원본 Task는 삭제하거나 일반 할 일로 바꾸지 않는다. important=true를 함께 저장하여 플래너 주간 카드에 표시하고 시간형 수업은 타임라인을 점유한다. 출석체크는 deadline/due_time으로 저장하며 시간 구간을 점유하지 않는다.
- 숨김 값은 일괄 수업 제목 필터가 아닌 항목별 예외다. 시험·과제·채용 등 다른 카드는 그대로 표시한다. 기간 한정 반복은 지정 기간 내 날짜별 Task로 저장하고 기간 밖에는 생성하지 않는다.
