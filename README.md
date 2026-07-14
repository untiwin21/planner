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
