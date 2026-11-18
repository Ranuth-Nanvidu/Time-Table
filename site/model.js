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
      meetings: session.meetings ?? [],
    };
  });

  const days = data.days
    .map((name, index) => ({ index, name, short: name.slice(0, 3) }))
    .filter((day) => sessions.some((session) => session.day === day.index));

  const dayStart = Math.min(...sessions.map((session) => session.start));
  const dayEnd = Math.max(...sessions.map((session) => session.end));

  const sessionsFor = (group) => sessions.filter((session) => session.groups.includes(group));

  // The Teams links a session offers to any of `groups`. A group split across meetings gets more than one.
  const meetingsFor = (session, groups) =>
    session.meetings.filter((meeting) => meeting.groups.some((group) => groups.includes(group)));

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
  const slugify = (text) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const slug = (group) => slugify(`${data.cohort}-group-${group}`);

  function summariseSessions(list) {
    const sum = (items) => items.reduce((total, session) => total + session.hours, 0);
    const busiest = days
      .map((day) => ({ day, hours: sum(list.filter((session) => session.day === day.index)) }))
      .sort((a, b) => b.hours - a.hours)[0];
    return [
      { value: `${sum(list)} h`, label: 'Per week' },
      { value: String(list.length), label: 'Sessions' },
      { value: `${sum(list.filter((session) => session.online))} h`, label: 'Online' },
      busiest && busiest.hours
        ? { value: busiest.day.short, label: `Busiest day, ${busiest.hours} h` }
        : { value: '–', label: 'Busiest day' },
    ];
  }

  const summarise = (group) => summariseSessions(sessionsFor(group));

  const overlaps = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end;

  // What a student must attend each week, one entry per module part, such as "CM2607 Tutorial".
  // `need` is how many of `options` a group takes, the most any one group takes.
  const KIND_ORDER = ['lecture', 'tutorial'];
  const componentKey = (session) => [session.module, session.variant ?? '', session.kind, session.title ?? ''].join('|');
  const components = [...new Set(sessions.map(componentKey))]
    .map((key) => {
      const options = sessions
        .filter((session) => componentKey(session) === key)
        .sort((a, b) => a.day - b.day || a.start - b.start);
      const need = Math.max(...data.groups.map((group) => options.filter((session) => session.groups.includes(group)).length));
      const [first] = options;
      return { key, module: first.module, name: first.name, kind: first.kind, kindLabel: first.kindLabel, hue: first.hue, need, options };
    })
    .filter((component) => component.need > 0)
    .sort(
      (a, b) =>
        a.module.localeCompare(b.module) ||
        a.name.localeCompare(b.name) ||
        (KIND_ORDER.indexOf(a.kind) + 1 || 9) - (KIND_ORDER.indexOf(b.kind) + 1 || 9),
    );
  const componentOf = (session) => components.find((component) => component.key === componentKey(session));

  // A part with no choice, such as a lecture every group attends together, is always in a custom week.
  const isFixed = (component) => component.options.length <= component.need;

  // The sessions of a custom week from the ids a person chose, as custom.html stores them.
  function customWeek(ids) {
    const chosen = new Set();
    for (const component of components) {
      if (isFixed(component)) {
        component.options.forEach((option) => chosen.add(option.id));
        continue;
      }
      const options = component.options.map((option) => option.id);
      ids.filter((id) => options.includes(id)).slice(0, component.need).forEach((id) => chosen.add(id));
    }
    return sessions.filter((session) => chosen.has(session.id));
  }

  // Calendar dates as `YYYY-MM-DD` strings. Weekdays count from Monday = 0.
  const DAY_MS = 86400000;
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const addDays = (iso, count) => new Date(Date.parse(`${iso}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
  const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
  const weekdayOf = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const mondayOf = (iso) => addDays(iso, -weekdayOf(iso));

  // The date, weekday and minutes past midnight in the timetable's own time zone.
  function zoneNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: data.timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const part = (type) => parts.find((entry) => entry.type === type).value;
    return {
      day: WEEKDAYS.indexOf(part('weekday')),
      minutes: Number(part('hour')) * 60 + Number(part('minute')),
      date: `${part('year')}-${part('month')}-${part('day')}`,
    };
  }

  root.Timetable = {
    dates: { addDays, daysBetween, weekdayOf, mondayOf, zoneNow },
    isFixed,
    customWeek,
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
    slugify,
    sessionsFor,
    meetingsFor,
    summarise,
    summariseSessions,
    overlaps,
    components,
    componentOf,
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
