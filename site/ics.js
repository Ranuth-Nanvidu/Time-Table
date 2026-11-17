(function (root) {
  const pad = (value) => String(value).padStart(2, '0');

  const escapeText = (text) =>
    text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  // RFC 5545 caps a content line at 75 octets. Every character this file emits is ASCII.
  const fold = (line) => line.match(/.{1,73}/g).join('\r\n ');

  const utcStamp = (date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');

  function firstOccurrence(startDate, day) {
    const [year, month, date] = startDate.split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1, date));
    const weekday = (first.getUTCDay() + 6) % 7;
    first.setUTCDate(first.getUTCDate() + ((day - weekday + 7) % 7));
    return first;
  }

  const localStamp = (date, minutes) =>
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;

  const isoDate = (date) => date.toISOString().slice(0, 10);

  // The weekly dates of one session, from its first class through `weeks` repeats, that land on a holiday.
  function holidayDates(startDate, day, weeks, holidays) {
    const closed = new Set(holidays.map((holiday) => holiday.date));
    const first = firstOccurrence(startDate, day);
    const dates = [];
    for (let week = 0; week < weeks; week += 1) {
      const date = new Date(first.getTime() + week * 7 * 86400000);
      if (closed.has(isoDate(date))) dates.push(date);
    }
    return dates;
  }

  function buildCalendar({ timetable, group, startDate, weeks, reminderMinutes = 0, holidays = [], feed = false, now = new Date() }) {
    const { data } = timetable;
    const zone = data.timezone;
    const calendarName = `${timetable.cohortTitle} Group ${group}`;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Timetable//Group Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeText(calendarName)}`,
      `X-WR-TIMEZONE:${zone}`,
      ...(feed ? ['REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H'] : []),
      'BEGIN:VTIMEZONE',
      `TZID:${zone}`,
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0530',
      'TZOFFSETTO:+0530',
      'TZNAME:+0530',
      'END:STANDARD',
      'END:VTIMEZONE',
    ];

    for (const session of timetable.sessionsFor(group)) {
      const date = firstOccurrence(startDate, session.day);
      const details = [
        session.staff.length ? `Staff: ${session.staff.join(', ')}` : null,
        `Groups: ${session.groups.join(', ')}`,
        `${data.cohort}, ${data.institution}`,
      ].filter(Boolean);

      lines.push(
        'BEGIN:VEVENT',
        `UID:${timetable.slug(group)}-${session.day}-${session.start}-${session.name.replace(/\s/g, '')}-${session.kind}@timetable`,
        `DTSTAMP:${utcStamp(now)}`,
        `DTSTART;TZID=${zone}:${localStamp(date, session.start)}`,
        `DTEND;TZID=${zone}:${localStamp(date, session.end)}`,
        `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
      );
      // EXDATE instances still count toward COUNT, so the series keeps its full length in weeks.
      const skipped = holidayDates(startDate, session.day, weeks, holidays);
      if (skipped.length) {
        lines.push(`EXDATE;TZID=${zone}:${skipped.map((day) => localStamp(day, session.start)).join(',')}`);
      }
      lines.push(`SUMMARY:${escapeText(session.headline)}`);
      if (session.place) lines.push(`LOCATION:${escapeText(session.place)}`);
      lines.push(`DESCRIPTION:${escapeText(details.join('\n'))}`);
      if (reminderMinutes > 0) {
        lines.push(
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeText(session.headline)}`,
          `TRIGGER:-PT${reminderMinutes}M`,
          'END:VALARM',
        );
      }
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  root.TimetableICS = { buildCalendar, firstOccurrence, holidayDates, isoDate };
})(globalThis);
