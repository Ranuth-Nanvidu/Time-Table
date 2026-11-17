(function (root) {
  const data = root.TIMETABLE;

  const KIND_LABEL = { lecture: 'Lecture', tutorial: 'Tutorial' };
  const pad = (value) => String(value).padStart(2, '0');
  const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

  const modules = [...new Set(data.sessions.map((session) => session.module))].sort();

  const sessions = data.sessions.map((session) => {
    const name = session.variant ? `${session.module} ${session.variant}` : session.module;
    const kindLabel = session.title ?? KIND_LABEL[session.kind];
    return {
      ...session,
      name,
      kindLabel,
      headline: `${name} ${kindLabel}`,
      place: session.online ? 'Online' : session.room,
      hours: (session.end - session.start) / 60,
      time: `${clock(session.start)}–${clock(session.end)}`,
      hue: modules.indexOf(session.module) % 5,
    };
  });

  const days = data.days
    .map((name, index) => ({ index, name, short: name.slice(0, 3) }))
    .filter((day) => sessions.some((session) => session.day === day.index));

  const dayStart = Math.min(...sessions.map((session) => session.start));
  const dayEnd = Math.max(...sessions.map((session) => session.end));

  const sessionsFor = (group) => sessions.filter((session) => session.groups.includes(group));

  const semester = data.semester ?? { start: null, weeks: null, holidays: [] };
  const holidays = new Map(semester.holidays.map((holiday) => [holiday.date, holiday.name]));
  const holidayOn = (isoDate) => holidays.get(isoDate) ?? null;
  const shortHoliday = (name) => name.replace(/ Full Moon Poya Day$/, ' Poya').replace(/ Festival Day$| Day$/, '');

  const sharedSessions = (groups) => sessions.filter((session) => groups.every((group) => session.groups.includes(group)));

  // Windows of at least 30 minutes, inside the timetable's day, when none of the groups has a class.
  function freeTogether(groups) {
    const windows = [];
    for (const day of days) {
      const busy = sessions
        .filter((session) => session.day === day.index && groups.some((group) => session.groups.includes(group)))
        .sort((a, b) => a.start - b.start);
      let cursor = dayStart;
      for (const session of [...busy, { start: dayEnd, end: dayEnd }]) {
        if (session.start - cursor >= 30) windows.push({ day: day.index, start: cursor, end: session.start });
        cursor = Math.max(cursor, session.end);
      }
    }
    return windows;
  }

  const roundHours = (minutes) => `${Math.round((minutes / 60) * 10) / 10} h`;

  function compareSummary(groups) {
    const shared = sharedSessions(groups);
    const free = freeTogether(groups);
    const longest = [...free].sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    return [
      { value: String(shared.length), label: 'Shared sessions' },
      { value: `${shared.reduce((total, session) => total + session.hours, 0)} h`, label: 'In class together' },
      { value: roundHours(free.reduce((total, window) => total + window.end - window.start, 0)), label: 'Free together' },
      longest
        ? { value: data.days[longest.day].slice(0, 3), label: `Longest gap, ${roundHours(longest.end - longest.start)}` }
        : { value: '–', label: 'No common gap' },
    ];
  }

  const cohortTitle = data.cohort.replace(/STAGE/i, 'Stage');
  const slug = (group) =>
    `${data.cohort}-group-${group}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  function summarise(group) {
    const own = sessionsFor(group);
    const sum = (list) => list.reduce((total, session) => total + session.hours, 0);
    const busiest = days
      .map((day) => ({ day, hours: sum(own.filter((session) => session.day === day.index)) }))
      .sort((a, b) => b.hours - a.hours)[0];
    return [
      { value: `${sum(own)} h`, label: 'Per week' },
      { value: String(own.length), label: 'Sessions' },
      { value: `${sum(own.filter((session) => session.online))} h`, label: 'Online' },
      { value: busiest.day.short, label: `Busiest day, ${busiest.hours} h` },
    ];
  }

  root.Timetable = {
    data,
    groups: data.groups,
    modules,
    sessions,
    days,
    dayStart,
    dayEnd,
    hourCount: (dayEnd - dayStart) / 60,
    cohortTitle,
    clock,
    slug,
    sessionsFor,
    summarise,
    semester,
    hasFeed: Boolean(semester.start && semester.weeks),
    holidayOn,
    shortHoliday,
    sharedSessions,
    freeTogether,
    compareSummary,
    roundHours,
  };
})(globalThis);
