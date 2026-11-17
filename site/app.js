(function () {
  const T = window.Timetable;
  const $ = (selector) => document.querySelector(selector);

  const esc = (text) =>
    String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {}
    },
  };

  const DAY_MS = 86400000;
  const LOOKAHEAD_DAYS = 21;
  const addDays = (iso, count) => new Date(Date.parse(`${iso}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
  const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
  const weekdayOf = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const prettyDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const prettyDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const formatIso = (formatter, iso) => formatter.format(new Date(`${iso}T00:00:00Z`));

  // "#B" shows one group. "#B+C+D" compares B with C and D.
  function parseHash() {
    let text = '';
    try {
      text = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    } catch (error) {}
    const [group = '', ...rest] = text.split(/[+,\s]+/);
    if (!T.groups.includes(group)) return { group: null, compare: [] };
    return { group, compare: T.groups.filter((other) => other !== group && rest.includes(other)) };
  }

  const initial = parseHash();
  const state = {
    group: [initial.group, store.get('tt-group')].find((group) => T.groups.includes(group)) ?? T.groups[0],
    compare: initial.compare,
    pinned: null,
    hovered: null,
  };
  const comparing = () => state.compare.length > 0;
  const party = () => [state.group, ...state.compare];

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function zoneNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: T.data.timezone,
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

  const thisWeek = (now, dayIndex) => addDays(now.date, dayIndex - now.day);

  // Today, or the first day of the semester while that is still ahead.
  const searchFrom = (now) => (T.semester.start && T.semester.start > now.date ? T.semester.start : now.date);

  // Walks forward over real dates, skipping holidays, until `pick(weekday, after)` returns something with a `start`.
  function walkDays(now, pick) {
    const from = searchFrom(now);
    for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
      const date = addDays(from, offset);
      if (T.holidayOn(date)) continue;
      const found = pick(weekdayOf(date), date === now.date ? now.minutes : -1);
      if (found) return { ...found, live: false, date, wait: daysBetween(now.date, date) * 1440 + found.start - now.minutes };
    }
    return null;
  }

  // `items` are sessions or free windows: anything with day, start and end, sorted by day then start.
  function nextOf(items, now) {
    if (!T.holidayOn(now.date) && searchFrom(now) === now.date) {
      const live = items.find((item) => item.day === now.day && item.start <= now.minutes && now.minutes < item.end);
      if (live) return { item: live, start: live.start, live: true, date: now.date, wait: live.end - now.minutes };
    }
    return walkDays(now, (day, after) => {
      const item = items.find((entry) => entry.day === day && entry.start > after);
      return item && { item, start: item.start };
    });
  }

  function span(minutes) {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
    const days = Math.round(minutes / 1440);
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  const dayName = (session) => T.data.days[session.day];
  const groupList = (session) => `Group${session.groups.length > 1 ? 's' : ''} ${session.groups.join(', ')}`;
  const staffShort = (session) =>
    session.staff.length > 3 ? `${session.staff.slice(0, 3).join(', ')} +${session.staff.length - 3}` : session.staff.join(', ');
  const windowTime = (window) => `${T.clock(window.start)}–${T.clock(window.end)}`;

  const dotsHTML = (session) =>
    `<span class="dots" role="img" aria-label="${groupList(session)}" title="${groupList(session)}">` +
    T.groups.map((group) => `<i${session.groups.includes(group) ? ' class="on"' : ''}></i>`).join('') +
    '</span>';

  const codeHTML = (session) =>
    `<span class="code">${esc(session.module)}${session.variant ? `<sup>${esc(session.variant)}</sup>` : ''}</span>`;

  const holidayHTML = (date) => {
    const name = T.holidayOn(date);
    return name ? `<mark class="holiday-tag" title="${esc(name)}">${esc(T.shortHoliday(name))}</mark>` : '';
  };

  const tooltip = (session) =>
    [session.headline, `${dayName(session)} ${session.time}`, session.place, session.staff.join(', '), groupList(session)]
      .filter(Boolean)
      .join('\n');

  const tileAttrs = (session, layout, index, style = '') =>
    `class="tile ${layout} is-${session.kind}" data-module="${esc(session.module)}" title="${esc(tooltip(session))}" ` +
    `style="--hue:var(--m${session.hue});--i:${index};${style}"`;

  function renderPicker() {
    $('#picker').innerHTML = T.groups
      .map(
        (group) =>
          `<input type="radio" name="group" id="group-${group}" value="${group}"${group === state.group ? ' checked' : ''} />` +
          `<label for="group-${group}" aria-label="Group ${group}">${group}</label>`,
      )
      .join('');
  }

  function renderCompare() {
    $('#compare').innerHTML = T.groups
      .filter((group) => group !== state.group)
      .map(
        (group) =>
          `<button class="compare-toggle" type="button" data-group="${group}" aria-pressed="${state.compare.includes(group)}" ` +
          `aria-label="Compare with Group ${group}">${group}</button>`,
      )
      .join('');
    $('#compare-clear').hidden = !comparing();
  }

  function renderStats() {
    const stats = comparing() ? T.compareSummary(party()) : T.summarise(state.group);
    $('#stats').innerHTML = stats
      .map((stat) => `<div class="stat"><dd>${esc(stat.value)}</dd><dt>${esc(stat.label)}</dt></div>`)
      .join('');
  }

  function renderChips(tiles) {
    $('#chips').innerHTML = T.modules
      .map((module) => ({ module, list: tiles.filter((session) => session.module === module) }))
      .filter((entry) => entry.list.length)
      .map(
        ({ module, list }) =>
          `<button class="chip" type="button" data-module="${esc(module)}" aria-pressed="false" style="--hue:var(--m${list[0].hue})">` +
          `${esc(module)}<span>${list.reduce((total, session) => total + session.hours, 0)} h</span></button>`,
      )
      .join('');
  }

  const percentOfDay = (minutes) => ((minutes - T.dayStart) / (T.dayEnd - T.dayStart)) * 100;

  function renderGrid(tiles, free, now) {
    const grid = $('#grid');
    const column = (dayIndex) => T.days.findIndex((day) => day.index === dayIndex) + 2;
    grid.style.setProperty('--days', T.days.length);
    grid.style.setProperty('--hours', T.hourCount);

    const heads = T.days.map(
      (day) =>
        `<div class="day-head${day.index === now.day ? ' is-today' : ''}" style="grid-column:${column(day.index)};grid-row:1">` +
        `<span>${day.name}</span>${holidayHTML(thisWeek(now, day.index))}</div>`,
    );
    const hourLabels = Array.from(
      { length: T.hourCount + 1 },
      (_, hour) => `<span style="top:calc(${hour} * var(--row))">${T.clock(T.dayStart + hour * 60)}</span>`,
    );
    const lanes = T.days.map((day, position) => {
      const classes = ['lane'];
      if (day.index === now.day) classes.push('is-today');
      if (position === T.days.length - 1) classes.push('is-last');
      if (T.holidayOn(thisWeek(now, day.index))) classes.push('is-holiday');
      return `<div class="${classes.join(' ')}" style="grid-column:${column(day.index)}"></div>`;
    });
    const blocks = tiles.map((session, index) => {
      const row = (session.start - T.dayStart) / 60 + 2;
      const place = `grid-column:${column(session.day)};grid-row:${row} / span ${session.hours}`;
      return (
        `<article ${tileAttrs(session, 'block', index, place)} data-span="${session.hours}" tabindex="0">` +
        `<div class="block-top">${codeHTML(session)}${dotsHTML(session)}</div>` +
        `<div class="block-kind">${esc(session.kindLabel)}</div>` +
        `<div class="block-meta"><span>${session.time}</span><span>${esc([session.place, staffShort(session)].filter(Boolean).join(' · '))}</span></div>` +
        '</article>'
      );
    });
    const gaps = free.map((window, index) => {
      const top = percentOfDay(window.start);
      const height = percentOfDay(window.end) - top;
      const short = window.end - window.start < 60;
      return (
        `<div class="free" style="grid-column:${column(window.day)}">` +
        `<div class="free-slot${short ? ' is-short' : ''}" style="--top:${top}%;--height:${height}%;--i:${tiles.length + index}" ` +
        `title="Free together, ${T.data.days[window.day]} ${windowTime(window)}">` +
        `<strong>Free together</strong><span>${windowTime(window)} · ${T.roundHours(window.end - window.start)}</span></div></div>`
      );
    });

    grid.innerHTML = [...heads, `<div class="hours" aria-hidden="true">${hourLabels.join('')}</div>`, ...lanes, ...gaps, ...blocks].join('');
  }

  function renderAgenda(tiles, free, now) {
    let index = 0;
    $('#agenda').innerHTML = T.days
      .map((day) => {
        const list = tiles.filter((session) => session.day === day.index);
        const gaps = free.filter((window) => window.day === day.index);
        const hours = list.reduce((total, session) => total + session.hours, 0);
        const freeMinutes = gaps.reduce((total, window) => total + window.end - window.start, 0);
        const rows = [
          ...list.map((session) => ({
            start: session.start,
            html:
              `<article ${tileAttrs(session, 'row', index++)}>` +
              `<div class="row-time">${T.clock(session.start)}<span>${T.clock(session.end)}</span></div>` +
              `<div>${codeHTML(session)}<div class="row-kind">${esc(session.kindLabel)}</div>` +
              `<div class="row-meta">${esc([session.place, session.staff.join(', ')].filter(Boolean).join(' · '))}</div></div>` +
              dotsHTML(session) +
              '</article>',
          })),
          ...gaps.map((window) => ({
            start: window.start,
            html:
              `<div class="row free-row" style="--i:${index++}">` +
              `<div class="row-time">${T.clock(window.start)}<span>${T.clock(window.end)}</span></div>` +
              `<div><span class="code">Free together</span><div class="row-meta">${T.roundHours(window.end - window.start)} with no classes</div></div>` +
              '</div>',
          })),
        ]
          .sort((a, b) => a.start - b.start)
          .map((row) => row.html);
        const summary = comparing() ? `${T.roundHours(freeMinutes)} free` : list.length ? `${hours} h` : 'Free';
        const empty = comparing() ? 'No shared classes and no common gap.' : 'No classes.';
        return (
          `<section class="agenda-day"><h3>${day.name}${day.index === now.day ? '<mark>Today</mark>' : ''}` +
          `${holidayHTML(thisWeek(now, day.index))}<small>${summary}</small></h3>` +
          (rows.join('') || `<p class="agenda-empty">${empty}</p>`) +
          '</section>'
        );
      })
      .join('');
  }

  function cardWhen(result, now, dayIndex) {
    return daysBetween(now.date, result.date) >= 6 ? formatIso(prettyDay, result.date) : T.data.days[dayIndex];
  }

  function renderLive() {
    const now = zoneNow();
    const next = $('#next');
    const holiday = T.holidayOn(now.date);
    const notices = [];
    if (holiday) notices.push(`No classes today: ${holiday}`);
    else if (searchFrom(now) !== now.date) notices.push(`Semester 1 starts ${formatIso(prettyDay, T.semester.start)}`);

    let label;
    let title;
    let meta;
    let hue;
    const result = comparing()
      ? nextOf(T.freeTogether(party()), now)
      : nextOf(T.sessionsFor(state.group), now);

    if (!result) {
      label = comparing() ? 'Free together' : 'Next up';
      title = comparing() ? 'No common free time' : 'No classes ahead';
      meta = `Nothing in the next ${LOOKAHEAD_DAYS / 7} weeks.`;
      hue = 'var(--ink)';
    } else if (comparing()) {
      const window = result.item;
      label = result.live ? 'Free together now' : "Next time you're all free";
      title = `${esc(windowTime(window))} <em>${esc(T.roundHours(window.end - window.start))}</em>`;
      meta = [cardWhen(result, now, window.day), `Groups ${party().join(', ')}`].map(esc).join(' · ');
      hue = 'var(--ink)';
    } else {
      const session = result.item;
      label = result.live ? 'Happening now' : 'Next up';
      title = `${esc(session.name)} <em>${esc(session.kindLabel)}</em>`;
      meta = [`${cardWhen(result, now, session.day)} ${session.time}`, session.place, staffShort(session)].filter(Boolean).map(esc).join(' · ');
      hue = `var(--m${session.hue})`;
    }

    next.classList.toggle('is-live', Boolean(result?.live));
    next.style.setProperty('--hue', hue);
    next.innerHTML =
      notices.map((notice) => `<p class="next-notice">${esc(notice)}</p>`).join('') +
      `<p class="eyebrow next-label"><span class="pulse"></span><span>${label}</span>` +
      (result ? `<span>${result.live ? `${span(result.wait)} left` : `in ${span(result.wait)}`}</span>` : '') +
      '</p>' +
      `<p class="next-title">${title}</p>` +
      `<p class="next-meta">${meta}</p>`;

    const grid = $('#grid');
    grid.querySelector('.now')?.remove();
    const position = T.days.findIndex((day) => day.index === now.day);
    if (position >= 0 && now.minutes >= T.dayStart && now.minutes <= T.dayEnd) {
      const marker = document.createElement('div');
      marker.className = 'now';
      marker.style.gridColumn = position + 2;
      marker.style.setProperty('--at', `${percentOfDay(now.minutes)}%`);
      grid.append(marker);
    }
  }

  function applyFocus() {
    const focus = state.hovered ?? state.pinned;
    document.querySelectorAll('.tile').forEach((tile) => {
      tile.classList.toggle('is-dim', Boolean(focus) && tile.dataset.module !== focus);
    });
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.module === state.pinned));
    });
  }

  function renderGroup() {
    const now = zoneNow();
    const groups = party();
    const tiles = comparing() ? T.sharedSessions(groups) : T.sessionsFor(state.group);
    const free = comparing() ? T.freeTogether(groups) : [];
    if (!tiles.some((session) => session.module === state.pinned)) state.pinned = null;
    state.hovered = null;
    document.title = comparing()
      ? `Epoch · Groups ${groups.join(' + ')} · ${T.cohortTitle}`
      : `Epoch · Group ${state.group} · ${T.cohortTitle}`;
    $('#board').setAttribute('aria-label', comparing() ? `Shared timetable for groups ${groups.join(', ')}` : 'Weekly timetable');
    $('#download-image-label').textContent = comparing() ? `Save Group ${state.group} image` : 'Save as image';
    $('#open-calendar-label').textContent = comparing() ? `Add Group ${state.group} to calendar` : 'Add to calendar';
    $('#legend-free').hidden = !comparing();
    renderStats();
    renderChips(tiles);
    renderGrid(tiles, free, now);
    renderAgenda(tiles, free, now);
    renderLive();
    applyFocus();
  }

  const writeHash = () => history.replaceState(null, '', `#${party().join('+')}`);

  function setView(group, compare) {
    if (!T.groups.includes(group)) return;
    const others = T.groups.filter((other) => other !== group && compare.includes(other));
    if (group === state.group && others.join() === state.compare.join()) return;
    state.group = group;
    state.compare = others;
    store.set('tt-group', group);
    writeHash();
    $(`#group-${group}`).checked = true;
    renderCompare();
    renderGroup();
  }

  let toastTimer;
  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('is-visible'), 2600);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function saveImage(button) {
    button.disabled = true;
    try {
      const canvas = await T.renderPoster(state.group);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const filename = `${T.slug(state.group)}.png`;
      download(blob, filename);
      toast(`Saved ${filename}`);
    } catch (error) {
      console.error(error);
      toast('Could not create the image. Try again.');
    } finally {
      button.disabled = false;
    }
  }

  const dialog = $('#calendar-dialog');
  const startInput = $('#calendar-start');
  const weeksInput = $('#calendar-weeks');
  const feedAvailable = T.hasFeed && /^https?:$/.test(location.protocol);
  if (T.semester.weeks) weeksInput.value = T.semester.weeks;

  function feedLinks() {
    const https = new URL(`cal/${T.slug(state.group)}.ics`, location.href).href;
    const webcal = https.replace(/^https?:/, 'webcal:');
    return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
  }

  function applyCalendarMode() {
    const mode = feedAvailable && $('#mode-subscribe').checked ? 'subscribe' : 'download';
    $('#calendar-mode').hidden = !feedAvailable;
    $('#pane-subscribe').hidden = mode !== 'subscribe';
    $('#pane-download').hidden = mode !== 'download';
    $('#calendar-download').hidden = mode !== 'download';
    $('#calendar-cancel').textContent = mode === 'subscribe' ? 'Done' : 'Cancel';
  }

  function calendarOptions() {
    const weeks = Math.round(Number(weeksInput.value));
    if (!startInput.value || !(weeks >= 1 && weeks <= 30)) return null;
    return {
      startDate: startInput.value,
      weeks,
      reminderMinutes: Number($('#calendar-reminder').value),
      holidays: T.semester.holidays,
    };
  }

  function renderCalendarSummary() {
    const options = calendarOptions();
    const summary = $('#calendar-summary');
    if (!options) {
      summary.textContent = 'Pick a start date and between 1 and 30 weeks.';
      return;
    }
    const own = T.sessionsFor(state.group);
    const firsts = own.map((session) => TimetableICS.firstOccurrence(options.startDate, session.day).getTime());
    const first = new Date(Math.min(...firsts));
    const last = new Date(Math.max(...firsts) + (options.weeks - 1) * 7 * DAY_MS);
    const skipped = own.reduce(
      (total, session) => total + TimetableICS.holidayDates(options.startDate, session.day, options.weeks, options.holidays).length,
      0,
    );
    summary.textContent =
      `${own.length} sessions a week for ${options.weeks} week${options.weeks === 1 ? '' : 's'}. ` +
      `First class ${prettyDate.format(first)}, last class ${prettyDate.format(last)}.` +
      (skipped ? ` ${skipped} class${skipped === 1 ? '' : 'es'} skipped for holidays.` : '');
  }

  function openCalendar() {
    const now = zoneNow();
    if (!startInput.value) startInput.value = T.semester.start ?? thisWeek(now, 0);
    dialog.returnValue = '';
    $('#calendar-title').textContent = `Add Group ${state.group} to your calendar`;
    if (feedAvailable) {
      const links = feedLinks();
      $('#subscribe-google').href = links.google;
      $('#subscribe-webcal').href = links.webcal;
      $('#feed-url').textContent = links.https;
    }
    applyCalendarMode();
    renderCalendarSummary();
    dialog.showModal();
  }

  function saveCalendar() {
    const options = calendarOptions();
    if (!options) return;
    const text = TimetableICS.buildCalendar({ timetable: T, group: state.group, ...options });
    const filename = `${T.slug(state.group)}.ics`;
    download(new Blob([text], { type: 'text/calendar;charset=utf-8' }), filename);
    toast(`Saved ${filename}`);
  }

  $('#institution').textContent = T.data.institution;
  $('#cohort').innerHTML = esc(T.cohortTitle).replace(/(Stage.*)$/, '<em>$1</em>');
  $('#source').textContent = `Source: timetable generated with ${T.data.generated}.`;
  $('#legend-range').textContent = `${T.groups[0]} to ${T.groups[T.groups.length - 1]}`;
  renderPicker();
  renderCompare();
  renderGroup();
  writeHash();
  setInterval(renderLive, 30000);

  $('#picker').addEventListener('change', (event) => setView(event.target.value, state.compare));
  window.addEventListener('hashchange', () => {
    const { group, compare } = parseHash();
    if (group) setView(group, compare);
  });

  $('#compare').addEventListener('click', (event) => {
    const toggle = event.target.closest('.compare-toggle');
    if (!toggle) return;
    const group = toggle.dataset.group;
    const compare = state.compare.includes(group) ? state.compare.filter((other) => other !== group) : [...state.compare, group];
    setView(state.group, compare);
    $(`.compare-toggle[data-group="${group}"]`)?.focus();
  });
  $('#compare-clear').addEventListener('click', () => setView(state.group, []));

  $('#chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.pinned = state.pinned === chip.dataset.module ? null : chip.dataset.module;
    applyFocus();
  });
  $('#chips').addEventListener('pointerover', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip || event.pointerType !== 'mouse') return;
    state.hovered = chip.dataset.module;
    applyFocus();
  });
  $('#chips').addEventListener('pointerleave', () => {
    state.hovered = null;
    applyFocus();
  });

  $('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    store.set('tt-theme', theme);
  });

  $('#download-image').addEventListener('click', (event) => saveImage(event.currentTarget));
  $('#open-calendar').addEventListener('click', openCalendar);
  const refreshCalendar = () => {
    applyCalendarMode();
    renderCalendarSummary();
  };
  $('#calendar-form').addEventListener('input', refreshCalendar);
  $('#calendar-form').addEventListener('change', refreshCalendar);
  $('#subscribe-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(feedLinks().https);
      toast('Feed link copied');
    } catch (error) {
      toast('Could not copy. Select the link below instead.');
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'download') saveCalendar();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
})();
