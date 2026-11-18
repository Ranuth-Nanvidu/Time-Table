// Attendance counting with no DOM, so it can be checked in Node. Needs model.js loaded first.
(function (root) {
  const T = root.Timetable;
  const { addDays, weekdayOf } = T.dates;

  const markKey = (date, session) => `${date}|${session.id}`;
  const partKey = (session) => T.componentOf(session)?.key ?? null;

  // Every class of `sessions` on the non-holiday dates from `from` to `to`, both included, in date then time order.
  function occurrences(sessions, from, to) {
    const list = [];
    if (!from || !to || from > to) return list;
    const byDay = new Map();
    for (const session of sessions) {
      if (!byDay.has(session.day)) byDay.set(session.day, []);
      byDay.get(session.day).push(session);
    }
    for (const day of byDay.values()) day.sort((a, b) => a.start - b.start);
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (T.holidayOn(date)) continue;
      for (const session of byDay.get(weekdayOf(date)) ?? []) {
        list.push({ key: markKey(date, session), date, session, part: partKey(session) });
      }
    }
    return list;
  }

  // Classes that have started by `now`, from zoneNow().
  const isDue = (occurrence, now) =>
    occurrence.date < now.date || (occurrence.date === now.date && occurrence.session.start <= now.minutes);

  // `marks` maps a mark key to { s: 'a' | 'm' | 'c', k: part key }. Cancelled classes don't count either way.
  // `planned` is every class of the part from tracking start to semester end.
  function partStats(key, marks, planned, target) {
    let attended = 0;
    let missed = 0;
    let cancelled = 0;
    for (const mark of Object.values(marks)) {
      if (mark.k !== key) continue;
      if (mark.s === 'a') attended += 1;
      else if (mark.s === 'm') missed += 1;
      else if (mark.s === 'c') cancelled += 1;
    }
    const scheduled = planned.filter((occurrence) => occurrence.part === key && marks[occurrence.key]?.s !== 'c').length;
    // Marks from another timetable can push the counted classes past what this one schedules.
    const total = Math.max(scheduled, attended + missed);
    const allowed = Math.floor((total * (100 - target)) / 100 + 1e-9);
    const canMiss = allowed - missed;
    const marked = attended + missed;
    return {
      key,
      attended,
      missed,
      cancelled,
      total,
      allowed,
      canMiss,
      pct: marked ? (attended / marked) * 100 : null,
      state: canMiss < 0 ? 'below' : canMiss <= 1 ? 'close' : 'safe',
    };
  }

  root.Attendance = { markKey, partKey, occurrences, isDue, partStats };
})(globalThis);
