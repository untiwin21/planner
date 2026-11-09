'use strict';
(function (root) {
  const keys = [
    'execution',
    'onTime',
    'studyStart',
    'calibration',
    'action',
    'kpt',
    'sleep',
    'routines',
  ];
  const weights = {
    execution: 25,
    onTime: 10,
    studyStart: 10,
    calibration: 15,
    action: 20,
    kpt: 5,
    sleep: 10,
    routines: 5,
  };
  // Preserve retired values in existing files, without using them in current scores.
  const storedKeys = [
    ...keys,
    'starts',
    'returns',
    'advance',
    'transfer',
    'project',
    'career',
    'learning',
    'communication',
  ];
  function pair(value) {
    if (value == null) {
      return null;
    }
    if (
      !value ||
      !Number.isInteger(value.done) ||
      !Number.isInteger(value.total) ||
      value.done < 0 ||
      value.total < 0 ||
      value.done > value.total ||
      value.total > 10000
    ) {
      throw new Error('완료 수는 전체 수 이하의 0 이상 정수여야 합니다.');
    }
    return { done: value.done, total: value.total };
  }
  function ratio(values) {
    const ps = values.map(pair).filter((p) => p && p.total > 0);
    const done = ps.reduce((s, p) => s + p.done, 0);
    const total = ps.reduce((s, p) => s + p.total, 0);
    return { done, total, rate: total ? Math.round((done / total) * 100) : null };
  }
  function week(weekRecord) {
    if (!weekRecord || typeof weekRecord !== 'object') {
      throw new Error('주간 기록 형식을 확인하세요.');
    }
    const out = Object.fromEntries(storedKeys.map((k) => [k, pair(weekRecord[k])]));
    out.restDays = weekRecord.restDays == null ? null : weekRecord.restDays;
    if (
      out.restDays !== null &&
      (!Number.isInteger(out.restDays) || out.restDays < 0 || out.restDays > 7)
    ) {
      throw new Error('휴식 기록은 0~7일로 입력하세요.');
    }
    if (typeof weekRecord.note !== 'string' || weekRecord.note.length > 4000) {
      throw new Error('근거는 4,000자 이하로 입력하세요.');
    }
    if ((keys.some((k) => out[k]?.total > 0) || out.restDays !== null) && !weekRecord.note.trim()) {
      throw new Error('수치의 근거와 확인 방법을 남겨 주세요.');
    }
    out.note = weekRecord.note.trim();
    out.updatedAt = typeof weekRecord.updatedAt === 'string' ? weekRecord.updatedAt : '';
    return out;
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function addDays(dateValue, dayOffset) {
    return new Date(new Date(dateValue + 'T00:00:00Z').getTime() + dayOffset * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  function today() {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (t) => p.find((x) => x.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function monday(dateValue) {
    return addDays(dateValue, -((new Date(dateValue + 'T00:00:00Z').getUTCDay() + 6) % 7));
  }
  function validate(planData) {
    if (
      !planData ||
      planData.kind !== 'my-vision-plan-review' ||
      planData.version !== 2 ||
      !validDate(planData.cycleStart)
    ) {
      throw new Error('Plan 평가용 파일인지 확인하세요.');
    }
    const weeks = {};
    for (const [n, w] of Object.entries(planData.weeks || {})) {
      if (!/^(?:[1-9]|1[0-2])$/.test(n)) {
        throw new Error('주차는 1~12만 가능합니다.');
      }
      weeks[n] = week(w);
    }
    let profile = null;
    if (planData.profile != null) {
      const p = planData.profile;
      if (
        typeof p.title !== 'string' ||
        p.title.length > 150 ||
        typeof p.scope !== 'string' ||
        p.scope.length > 2000 ||
        !Array.isArray(p.observations) ||
        p.observations.length > 15
      ) {
        throw new Error('개인 분석 형식을 확인하세요.');
      }
      profile = {
        title: p.title,
        scope: p.scope,
        observations: p.observations.map((o) => {
          if (
            !o ||
            ['title', 'source', 'finding', 'measure'].some(
              (k) => typeof o[k] !== 'string' || o[k].length > 1800,
            )
          ) {
            throw new Error('분석 근거 형식을 확인하세요.');
          }
          return { title: o.title, source: o.source, finding: o.finding, measure: o.measure };
        }),
      };
    }
    if (
      planData.history != null &&
      (!Array.isArray(planData.history) || planData.history.length > 1000)
    ) {
      throw new Error('수정 이력을 확인하세요.');
    }
    const history = (planData.history || []).map((h) => {
      if (
        !h ||
        !Number.isInteger(h.week) ||
        h.week < 1 ||
        h.week > 12 ||
        !validDate(h.cycleStart)
      ) {
        throw new Error('수정 이력을 확인하세요.');
      }
      return { week: h.week, cycleStart: h.cycleStart, record: week(h.record) };
    });
    const goals = planData.goals == null ? Array(6).fill('') : planData.goals;
    if (
      !Array.isArray(goals) ||
      goals.length !== 6 ||
      goals.some((g) => typeof g !== 'string' || g.length > 100)
    ) {
      throw new Error('목표는 6개까지, 각각 100자 이내로 입력하세요.');
    }
    const goalCriteria = planData.goalCriteria == null ? Array(6).fill('') : planData.goalCriteria;
    if (
      !Array.isArray(goalCriteria) ||
      goalCriteria.length !== 6 ||
      goalCriteria.some((g) => typeof g !== 'string' || g.length > 2000)
    ) {
      throw new Error('목표 달성 기준은 각각 2,000자 이내로 입력하세요.');
    }
    const list = (v, n, max, required = false) =>
      Array.isArray(v) &&
      v.length === n &&
      v.every((s) => typeof s === 'string' && s.length <= max && (!required || s.trim()));
    function extraFields(p, required) {
      const milestoneExtras = p.milestoneExtras ?? Array.from({ length: 3 }, () => []);
      const weekExtras = p.weekExtras ?? Array.from({ length: 12 }, () => []);
      const seen = new Set();
      if (
        !Array.isArray(milestoneExtras) ||
        milestoneExtras.length !== 3 ||
        !Array.isArray(weekExtras) ||
        weekExtras.length !== 12
      ) {
        throw new Error('추가 목표 형식을 확인하세요.');
      }
      const months = milestoneExtras.map((xs) => {
        if (
          !Array.isArray(xs) ||
          xs.length > 49 ||
          xs.some((s) => typeof s !== 'string' || s.length > 300 || (required && !s.trim()))
        ) {
          throw new Error('추가 목표는 항목당 300자, 구간당 50개까지 입력하세요.');
        }
        return xs.map((s) => (required ? s.trim() : s));
      });
      const extraWeeks = weekExtras.map((xs) => {
        if (!Array.isArray(xs) || xs.length > 49) {
          throw new Error('주간 목표는 주차당 50개까지 입력하세요.');
        }
        return xs.map((x) => {
          if (
            !x ||
            typeof x.id !== 'string' ||
            !/^[a-zA-Z0-9_-]{1,48}$/.test(x.id) ||
            seen.has(x.id) ||
            typeof x.title !== 'string' ||
            x.title.length > 300 ||
            (required && !x.title.trim())
          ) {
            throw new Error('추가 주간 목표 형식을 확인하세요.');
          }
          seen.add(x.id);
          return { id: x.id, title: required ? x.title.trim() : x.title };
        });
      });
      return { milestoneExtras: months, weekExtras: extraWeeks };
    }
    const goalPlans = planData.goalPlans ?? Array(6).fill(null);
    const goalDrafts = planData.goalDrafts ?? Array(6).fill(null);
    if (
      !Array.isArray(goalPlans) ||
      goalPlans.length !== 6 ||
      !Array.isArray(goalDrafts) ||
      goalDrafts.length !== 6
    ) {
      throw new Error('목표 계획 형식을 확인하세요.');
    }
    const plans = goalPlans.map((p) => {
      if (p == null) {
        return null;
      }
      if (
        typeof p.id !== 'string' ||
        !p.id ||
        p.id.length > 80 ||
        !list(p.milestones, 3, 300) ||
        !list(p.weeks, 12, 300)
      ) {
        throw new Error('4주 단계 3개와 주간 목표 12개를 모두 작성하세요.');
      }
      return {
        id: p.id,
        milestones: p.milestones.map((s) => s.trim()),
        weeks: p.weeks.map((s) => s.trim()),
        ...extraFields(p, true),
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : '',
      };
    });
    const drafts = goalDrafts.map((p) => {
      if (p == null) {
        return null;
      }
      if (
        typeof p.title !== 'string' ||
        p.title.length > 100 ||
        typeof p.criteria !== 'string' ||
        p.criteria.length > 2000 ||
        !list(p.milestones, 3, 300) ||
        !list(p.weeks, 12, 300) ||
        !Number.isInteger(p.step) ||
        p.step < 0 ||
        p.step > 5
      ) {
        throw new Error('작성 중인 목표 형식을 확인하세요.');
      }
      return {
        title: p.title,
        criteria: p.criteria,
        milestones: [...p.milestones],
        weeks: [...p.weeks],
        ...extraFields(p, false),
        planId: typeof p.planId === 'string' && p.planId.length <= 80 ? p.planId : null,
        step: p.step,
      };
    });
    const tasks = planData.tasks == null ? [] : planData.tasks;
    if (!Array.isArray(tasks) || tasks.length > 5000) {
      throw new Error('할 일은 파일당 5,000개까지 지원합니다.');
    }
    const ids = new Set();
    const normalizedTasks = tasks.map((t) => {
      const assigned = t?.date ?? null;
      if (
        !t ||
        typeof t.id !== 'string' ||
        !t.id ||
        t.id.length > 100 ||
        ids.has(t.id) ||
        (assigned !== null && !validDate(assigned)) ||
        typeof t.title !== 'string' ||
        !t.title.trim() ||
        t.title.length > 300 ||
        typeof t.done !== 'boolean' ||
        (t.goal !== null && (!Number.isInteger(t.goal) || t.goal < 0 || t.goal > 5))
      ) {
        throw new Error('할 일 형식을 확인하세요.');
      }
      const derived = assigned
        ? Math.floor((Date.parse(assigned) - Date.parse(planData.cycleStart)) / 604800000) + 1
        : 0;
      const weekNumber = t.week ?? (derived >= 1 && derived <= 12 ? derived : null);
      if (
        weekNumber !== null &&
        (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 12)
      ) {
        throw new Error('할 일의 주차를 확인하세요.');
      }
      if (weekNumber === null && !assigned) {
        throw new Error('할 일의 주차를 확인하세요.');
      }
      if (
        assigned &&
        weekNumber !== null &&
        (assigned < addDays(planData.cycleStart, (weekNumber - 1) * 7) ||
          assigned > addDays(planData.cycleStart, weekNumber * 7 - 1))
      ) {
        throw new Error('해당 주차 안의 요일을 선택하세요.');
      }
      const dueDate = t.dueDate ?? assigned ?? addDays(planData.cycleStart, weekNumber * 7 - 1);
      if (!validDate(dueDate)) {
        throw new Error('완료 기준일을 확인하세요.');
      }
      const completedAt = t.done ? (t.completedAt ?? null) : null;
      if (
        completedAt !== null &&
        (typeof completedAt !== 'string' || !Number.isFinite(Date.parse(completedAt)))
      ) {
        throw new Error('완료 시각을 확인하세요.');
      }
      if (t.dueLocked !== undefined && typeof t.dueLocked !== 'boolean') {
        throw new Error('완료 기준 상태를 확인하세요.');
      }
      if (t.kind !== undefined && !['task', 'weekly-goal', 'task-group'].includes(t.kind)) {
        throw new Error('할 일 종류를 확인하세요.');
      }
      if (t.kind === 'weekly-goal' && (assigned !== null || t.parentId != null)) {
        throw new Error('주간 목표는 세분화한 뒤 실행 할 일을 요일에 배치하세요.');
      }
      if (
        t.parentId != null &&
        (typeof t.parentId !== 'string' || t.parentId.length > 100 || t.parentId === t.id)
      ) {
        throw new Error('상위 주간 목표를 확인하세요.');
      }
      if (t.planId != null && (typeof t.planId !== 'string' || t.planId.length > 80)) {
        throw new Error('연결된 목표 계획을 확인하세요.');
      }
      if (
        t.brainDumpDraft != null &&
        (typeof t.brainDumpDraft !== 'string' || t.brainDumpDraft.length > 30000)
      ) {
        throw new Error('브레인덤프는 30,000자 이내로 입력하세요.');
      }
      if (
        t.categoryId != null &&
        (typeof t.categoryId !== 'string' || !t.categoryId || t.categoryId.length > 100)
      ) {
        throw new Error('플래너 카테고리를 확인하세요.');
      }
      const carried = t.carryHistory ?? [];
      if (!Array.isArray(carried) || carried.length > 11) {
        throw new Error('이월 이력을 확인하세요.');
      }
      const carryHistory = carried.map((h, i) => {
        if (
          !h ||
          !Number.isInteger(h.fromWeek) ||
          h.fromWeek < 1 ||
          h.fromWeek > 11 ||
          h.toWeek !== h.fromWeek + 1 ||
          (i && h.fromWeek !== carried[i - 1].toWeek) ||
          typeof h.at !== 'string' ||
          !Number.isFinite(Date.parse(h.at)) ||
          (i && Date.parse(h.at) < Date.parse(carried[i - 1].at)) ||
          (h.fromDate !== null &&
            (!validDate(h.fromDate) ||
              h.fromDate < addDays(planData.cycleStart, (h.fromWeek - 1) * 7) ||
              h.fromDate > addDays(planData.cycleStart, h.fromWeek * 7 - 1)))
        ) {
          throw new Error('이월 순서와 이전 날짜를 확인하세요.');
        }
        if (
          h.done !== undefined &&
          (h.done !== true ||
            (h.completedAt !== null &&
              (typeof h.completedAt !== 'string' || !Number.isFinite(Date.parse(h.completedAt)))))
        ) {
          throw new Error('이월 전 완료 기록을 확인하세요.');
        }
        return {
          fromWeek: h.fromWeek,
          toWeek: h.toWeek,
          fromDate: h.fromDate,
          at: h.at,
          ...(h.done ? { done: true, completedAt: h.completedAt } : {}),
        };
      });
      if (
        carryHistory.length &&
        (weekNumber !== carryHistory.at(-1).toWeek ||
          t.kind === 'weekly-goal' ||
          t.dueLocked !== true)
      ) {
        throw new Error('이월한 할 일의 주차와 최초 기한을 확인하세요.');
      }
      const moved = t.dayMoves ?? [];
      if (!Array.isArray(moved) || moved.length > 500) {
        throw new Error('일별 이월 이력을 확인하세요.');
      }
      const dayMoves = moved.map((h) => {
        if (
          !h ||
          !validDate(h.fromDate) ||
          !validDate(h.toDate) ||
          h.toDate !== addDays(h.fromDate, 1) ||
          h.fromDate < planData.cycleStart ||
          h.toDate > addDays(planData.cycleStart, 83) ||
          typeof h.at !== 'string' ||
          !Number.isFinite(Date.parse(h.at))
        ) {
          throw new Error('일별 이월 날짜를 확인하세요.');
        }
        return { fromDate: h.fromDate, toDate: h.toDate, at: h.at };
      });
      const discardedAt = t.discardedAt ?? null;
      const changed = t.scheduleChanges ?? [];
      if (!Array.isArray(changed) || changed.length > 500) {
        throw new Error('계획 변경 이력을 확인하세요.');
      }
      const scheduleChanges = changed.map((entry, index) => {
        if (
          !entry ||
          !['replan', 'carry'].includes(entry.mode) ||
          !validDate(entry.fromDate) ||
          !validDate(entry.toDate) ||
          entry.fromDate === entry.toDate ||
          !validDate(entry.fromDueDate) ||
          !validDate(entry.toDueDate) ||
          (entry.mode === 'replan'
            ? entry.toDueDate !== entry.toDate
            : entry.toDueDate !== entry.fromDueDate) ||
          typeof entry.at !== 'string' ||
          !Number.isFinite(Date.parse(entry.at)) ||
          (index && Date.parse(entry.at) < Date.parse(changed[index - 1].at)) ||
          t.kind === 'weekly-goal'
        ) {
          throw new Error('계획 변경 날짜와 평가 기준을 확인하세요.');
        }
        return {
          fromDate: entry.fromDate,
          toDate: entry.toDate,
          fromDueDate: entry.fromDueDate,
          toDueDate: entry.toDueDate,
          mode: entry.mode,
          at: entry.at,
        };
      });
      if (
        discardedAt !== null &&
        (typeof discardedAt !== 'string' ||
          !Number.isFinite(Date.parse(discardedAt)) ||
          !t.archived ||
          t.done ||
          t.kind === 'weekly-goal')
      ) {
        throw new Error('폐기 기록을 확인하세요.');
      }
      const deletedAt = t.deletedAt ?? null;
      if (
        deletedAt !== null &&
        (typeof deletedAt !== 'string' ||
          !Number.isFinite(Date.parse(deletedAt)) ||
          !t.archived ||
          discardedAt !== null ||
          t.kind === 'weekly-goal')
      ) {
        throw new Error('삭제 기록을 확인하세요.');
      }
      const sortOrder = t.sortOrder ?? null;
      if (
        sortOrder !== null &&
        (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000000)
      ) {
        throw new Error('세부항목 순서를 확인하세요.');
      }
      const groupId = t.groupId ?? null;
      if (
        groupId !== null &&
        (typeof groupId !== 'string' ||
          !groupId ||
          groupId.length > 100 ||
          groupId === t.id ||
          (t.kind !== undefined && t.kind !== 'task'))
      ) {
        throw new Error('할 일 묶음을 확인하세요.');
      }
      ids.add(t.id);
      return {
        dayMoves,
        scheduleChanges,
        discardedAt,
        deletedAt,
        sortOrder,
        groupId,
        carryHistory,
        categoryId: t.categoryId ?? null,
        categoryOverride: t.categoryOverride === true,
        id: t.id,
        date: assigned,
        week: weekNumber,
        dueDate,
        dueLocked: t.dueLocked ?? assigned !== null,
        title: t.title.trim(),
        done: t.done,
        completedAt,
        goal: t.goal,
        archived: t.archived === true,
        updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : '',
        remoteDate: validDate(t.remoteDate) ? t.remoteDate : null,
        remoteUpdatedAt:
          Number.isSafeInteger(t.remoteUpdatedAt) && t.remoteUpdatedAt >= 0
            ? t.remoteUpdatedAt
            : null,
        syncedAt: typeof t.syncedAt === 'string' ? t.syncedAt : '',
        kind: t.kind ?? 'task',
        parentId: t.parentId ?? null,
        planId: t.planId ?? null,
        decomposed: t.decomposed === true,
        brainDumpDraft: t.brainDumpDraft ?? '',
      };
    });
    const byId = new Map(normalizedTasks.map((t) => [t.id, t]));
    for (const t of normalizedTasks) {
      if (t.parentId && (!byId.has(t.parentId) || byId.get(t.parentId).kind !== 'weekly-goal')) {
        throw new Error('실행 할 일의 상위 목표가 없습니다.');
      }
      if (t.groupId) {
        const group = byId.get(t.groupId);
        if (
          !group ||
          group.kind !== 'task-group' ||
          group.parentId !== t.parentId ||
          (!t.archived &&
            !group.archived &&
            (group.week !== t.week || group.date !== t.date || group.categoryId !== t.categoryId))
        ) {
          throw new Error('묶음과 하위 할 일의 주차·요일·카테고리를 확인하세요.');
        }
      }
    }
    return {
      kind: planData.kind,
      version: 2,
      cycleStart: planData.cycleStart,
      cycleAnchorVersion: planData.cycleAnchorVersion === 1 ? 1 : 0,
      profile,
      weeks,
      history,
      goals: goals.map((g) => g.trim()),
      goalCriteria: goalCriteria.map((g) => g.trim()),
      goalPlans: plans,
      goalDrafts: drafts,
      tasks: normalizedTasks,
    };
  }
  function koreaDate(timestamp) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp));
  }
  function record(planData, weekNumber, currentDate = today(), evidence = null) {
    const w = { ...(planData.weeks[weekNumber] || {}) };
    const s = addDays(planData.cycleStart, (weekNumber - 1) * 7);
    const e = addDays(s, 6);
    const active = (planData.tasks || []).filter(
      (t) => (!t.archived || t.discardedAt) && t.kind !== 'weekly-goal' && t.kind !== 'task-group',
    );
    const tasks = active.filter(
      (t) =>
        (t.week === weekNumber || (!t.week && t.date >= s && t.date <= e)) &&
        !t.carryHistory?.some((entry) => entry.done),
    );
    const outgoing = active.filter(
      (t) =>
        t.carryHistory?.some((h) => h.fromWeek === weekNumber) &&
        !t.carryHistory.some((h) => h.done && h.fromWeek < weekNumber),
    );
    if (tasks.length || outgoing.length) {
      w.execution = {
        done:
          tasks.filter((t) => t.done).length +
          outgoing.filter((t) => t.carryHistory.find((h) => h.fromWeek === weekNumber)?.done)
            .length,
        total: tasks.length + outgoing.length,
      };
    }
    // Preserve failed attempts in their original weeks; a later completion cannot erase them.
    // Punctuality is assessed only once, in the task's first week, without repeated carry penalties.
    const timely = [
      ...tasks.filter((t) => !t.carryHistory?.length),
      ...outgoing
        .filter((t) => t.carryHistory[0].fromWeek === weekNumber)
        .map((t) => {
          const entry = t.carryHistory[0];
          return {
            ...t,
            done: entry.done === true,
            completedAt: entry.done ? entry.completedAt : null,
            dueDate:
              t.scheduleChanges?.find((change) => Date.parse(change.at) > Date.parse(entry.at))
                ?.fromDueDate ?? t.dueDate,
          };
        }),
    ];
    const assessable = timely.filter(
      (t) => (t.done && t.completedAt) || (!t.done && (t.dueDate ?? t.date ?? e) < currentDate),
    );
    if (tasks.length || outgoing.length) {
      w.onTime = assessable.length
        ? {
            done: assessable.filter(
              (t) => t.done && koreaDate(t.completedAt) <= (t.dueDate ?? t.date ?? e),
            ).length,
            total: assessable.length,
          }
        : timely.length
          ? null
          : { done: 0, total: 0 };
    }
    w.onTimeUnknown = timely.filter((t) => t.done && !t.completedAt).length;
    if (
      evidence?.cycleStart === planData.cycleStart &&
      evidence.asOf >= s &&
      evidence.asOf <= currentDate &&
      evidence.weeks?.[weekNumber]
    ) {
      w.evidence = evidence.weeks[weekNumber];
      w.evidencePending = evidence.asOf < (e < currentDate ? e : currentDate);
      for (const key of keys.slice(2)) {
        const m = w.evidence[key];
        w[key] =
          m?.eligible === 0
            ? { done: 0, total: 0 }
            : m?.score != null
              ? { done: Math.round(m.score * 100), total: 10000 }
              : null;
      }
    }
    return w;
  }
  function score(weekRecord) {
    let covered = 0;
    let applicable = 0;
    let earned = 0;
    for (const key of keys) {
      const p = pair(weekRecord?.[key]);
      if (!p) {
        continue;
      }
      const m = weekRecord?.evidence?.[key];
      covered += weights[key] * (m?.eligible ? m.observed / m.eligible : 1);
      if (p.total) {
        applicable += weights[key];
        earned += (weights[key] * p.done) / p.total;
      }
    }
    covered = Math.round(covered * 10) / 10;
    return {
      value: applicable ? Math.round((earned / applicable) * 100) : null,
      coverage: covered,
      provisional: covered < 100 || !!weekRecord?.onTimeUnknown || !!weekRecord?.evidencePending,
    };
  }
  function dashboard(planData, currentDate, evidence = null) {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      const start = addDays(planData.cycleStart, i * 7);
      const end = addDays(start, 6);
      const w = record(planData, n, currentDate, evidence);
      return {
        n,
        start,
        end,
        record: w,
        score: start <= currentDate ? score(w) : { value: null, coverage: 0, provisional: true },
        future: start > currentDate,
        closed: end < currentDate,
      };
    });
    const observed = rows.filter((r) => !r.future && r.score.value !== null);
    const elapsed = rows.filter((r) => !r.future);
    const total = observed.length
      ? Math.round(observed.reduce((s, r) => s + r.score.value, 0) / observed.length)
      : null;
    const provisional = elapsed.some(
      (r) => !r.closed || r.score.value === null || r.score.provisional,
    );
    const closed = rows.filter((r) => r.closed);
    let forecast = null;
    // A simple trend estimate, never presented as an AI prediction.
    if (closed.length === 12) {
      if (closed.every((r) => r.score.value !== null && !r.score.provisional)) {
        forecast = total;
      }
    } else if (
      closed.length >= 3 &&
      closed.every((r) => r.score.value !== null && !r.score.provisional)
    ) {
      const recent = closed.slice(-4);
      const meanX = recent.reduce((s, r) => s + r.n, 0) / recent.length;
      const meanY = recent.reduce((s, r) => s + r.score.value, 0) / recent.length;
      const slope =
        recent.reduce((s, r) => s + (r.n - meanX) * (r.score.value - meanY), 0) /
        recent.reduce((s, r) => s + (r.n - meanX) ** 2, 0);
      const sum =
        closed.reduce((s, r) => s + r.score.value, 0) +
        rows
          .filter((r) => !r.closed)
          .reduce((s, r) => s + Math.max(0, Math.min(100, meanY + slope * (r.n - meanX))), 0);
      forecast = Math.round(sum / 12);
    }
    const coverage = elapsed.length
      ? Math.round(elapsed.reduce((s, r) => s + r.score.coverage, 0) / elapsed.length)
      : 0;
    return {
      rows,
      total,
      provisional,
      coverage,
      forecast,
      recordedWeeks: observed.length,
      current: rows.find((r) => r.start <= currentDate && r.end >= currentDate)?.n ?? null,
      ended: rows[11].end < currentDate,
    };
  }
  function summarize(planData, currentDate) {
    const ws = Object.entries(planData.weeks)
      .filter(([n]) => addDays(planData.cycleStart, (+n - 1) * 7) <= currentDate)
      .map(([, w]) => w);
    return Object.fromEntries(
      keys
        .map((k) => [k, ratio(ws.map((w) => w[k]))])
        .concat([
          ['rhythm', ratio(ws.flatMap((w) => [w.starts, w.returns]))],
          ['recordedWeeks', ws.filter((w) => keys.some((k) => w[k]?.total > 0)).length],
        ]),
    );
  }
  const api = {
    keys,
    weights,
    pair,
    ratio,
    week,
    validDate,
    addDays,
    today,
    monday,
    validate,
    summarize,
    record,
    score,
    dashboard,
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PlanMetrics = api;
  }
})(typeof globalThis === 'object' ? globalThis : this);
