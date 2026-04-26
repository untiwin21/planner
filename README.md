# Planr

주간 플래너 + 단기 목표 + 루틴 관리 앱

## 스택
- **Next.js 15** + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (DB / Auth — 나중에 연동)
- **Vercel** 배포

## 로컬 실행

```bash
npm install
cp .env.example .env.local
# .env.local에 Supabase 키 입력 (지금은 없어도 localStorage로 동작)
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
│   ├── weekly/         DayCard, DayDetail
│   ├── goals/          GoalCard, GoalDetail
│   └── routine/        RoutineSidebar
├── hooks/
│   └── usePlanrStore.ts  localStorage 기반 상태관리
├── lib/
│   ├── dates.ts        날짜 유틸
│   └── supabase.ts     Supabase 클라이언트
└── types/
    └── index.ts        TypeScript 타입
```

## Vercel 배포

```bash
npm i -g vercel
vercel
```

## Supabase 연동 (나중에)

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. `.env.local`에 URL과 ANON_KEY 입력
3. `usePlanrStore.ts`에서 localStorage → Supabase API로 교체
