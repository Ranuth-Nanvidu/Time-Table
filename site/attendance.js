(function () {
  const T = window.Timetable;
  const A = window.Attendance;
  const { addDays, daysBetween, mondayOf, zoneNow } = T.dates;
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

  const STORE_KEY = 'tt-attendance';
  const STATUSES = { a: 'Attended', m: 'Missed', c: 'Cancelled' };
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const RECENT_DAYS = 3;
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`;
  const prettyDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const longDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const formatIso = (formatter, iso) => formatter.format(new Date(`${iso}T00:00:00Z`));

  const byId = new Map(T.sessions.map((session) => [session.id, session]));
  const partByKey = new Map(T.components.map((component) => [component.key, component]));
  const customIds = () => (store.get('tt-custom') ?? '').split(/[+,\s]+/).filter((id) => byId.has(id));
  const hasCustom = () => customIds().length > 0;

  function defaults() {
    const today = zoneNow().date;
    const since = T.semester.start ?? mondayOf(today);
    const until = T.semester.start && T.semester.weeks ? addDays(T.semester.start, T.semester.weeks * 7 - 1) : addDays(since, 12 * 7 - 1);
    const group = store.get('tt-group');
    const source = T.groups.includes(group) ? group : hasCustom() ? 'custom' : T.groups[0];
    return { v: 1, source, since, until, target: 80, marks: {} };
  }

  // Keeps only well-formed parts of a saved or imported record. Returns null if it isn't one at all.
  function clean(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || !raw.marks || typeof raw.marks !== 'object') return null;
    const base = defaults();
    const marks = {};
    for (const [key, mark] of Object.entries(raw.marks)) {
      const [date, id] = key.split('|');
      if (ISO.test(date) && id && mark && STATUSES[mark.s] && typeof mark.k === 'string') marks[key] = { s: mark.s, k: mark.k };
    }
    const since = ISO.test(raw.since) ? raw.since : base.since;
    const until = ISO.test(raw.until) && raw.until >= since ? raw.until : base.until;
    const target = Number.isFinite(raw.target) && raw.target >= 50 && raw.target <= 100 ? Math.round(raw.target) : base.target;
    const source = raw.source === 'custom' || T.groups.includes(raw.source) ? raw.source : base.source;
    return { v: 1, source, since, until, target, marks };
  }

  function load() {
    try {
      return clean(JSON.parse(store.get(STORE_KEY))) ?? defaults();
    } catch (error) {
      return defaults();
    }
  }

  let state = load();
  const save = () => store.set(STORE_KEY, JSON.stringify(state));

  const sourceSessions = () =>
    state.source === 'custom' && hasCustom() ? T.customWeek(customIds()) : T.sessionsFor(state.source === 'custom' ? T.groups[0] : state.source);
  const sourceName = () => (state.source === 'custom' ? 'your custom week' : `Group ${state.source}`);

  // Everything one render needs, worked out once.
  function snapshot() {
    const now = zoneNow();
    const sessions = sourceSessions();
    const planned = A.occurrences(sessions, state.since, state.until);
    const plannedKeys = new Set(planned.map((occurrence) => occurrence.key));
    const due = planned.filter((occurrence) => A.isDue(occurrence, now));
    const unmarked = due.filter((occurrence) => !state.marks[occurrence.key]);
    const upcoming = planned.find((occurrence) => !A.isDue(occurrence, now));
    const foreign = Object.keys(state.marks).filter((key) => !plannedKeys.has(key)).length;
    const keys = new Set([...planned.map((occurrence) => occurrence.part), ...Object.values(state.marks).map((mark) => mark.k)]);
    const RANK = { below: 0, close: 1, safe: 2 };
    const parts = [...keys]
      .filter(Boolean)
      .map((key) => A.partStats(key, state.marks, planned, state.target))
      .sort((a, b) => RANK[a.state] - RANK[b.state] || a.canMiss - b.canMiss || a.key.localeCompare(b.key));
    return { now, planned, due, unmarked, upcoming, foreign, parts };
  }

  // Display details for a mark key, even when its session has left the timetable.
  function describe(key, partKey) {
    const [date, id] = key.split('|');
    const session = byId.get(id);
    const part = partByKey.get(partKey) ?? (session && T.componentOf(session));
    return {
      date,
      session,
      name: part?.name ?? session?.name ?? partKey.split('|')[0],
      kindLabel: part?.kindLabel ?? session?.kindLabel ?? '',
      hue: part?.hue ?? session?.hue ?? 0,
    };
  }

  function markButtons(key, current, label) {
    return (
      `<div class="mark-buttons" role="group" aria-label="${esc(label)}">` +
      Object.entries(STATUSES)
        .map(
          ([status, text]) =>
            `<button class="mark mark-${status}" type="button" data-key="${esc(key)}" data-status="${status}" aria-pressed="${current === status}">${text}</button>`,
        )
        .join('') +
      '</div>'
    );
  }

  function rowHTML(key, partKey, current) {
    const info = describe(key, partKey);
    const { session } = info;
    const time = session ? `${T.clock(session.start)}<span>${T.clock(session.end)}</span>` : '–';
    const meta = session ? [session.place, session.staff.join(', ')].filter(Boolean).join(' · ') : 'No longer in the timetable';
    return (
      `<li class="att-row${current ? ` is-${current}` : ''}" style="--hue:var(--m${info.hue})">` +
      `<div class="att-time">${time}</div>` +
      `<div class="att-what"><span class="code">${esc(info.name)}</span> <span class="att-kind">${esc(info.kindLabel)}</span>` +
      `<div class="att-meta">${esc(meta)}</div></div>` +
      markButtons(key, current, `${info.name} ${info.kindLabel}, ${formatIso(prettyDay, info.date)}`) +
      '</li>'
    );
  }

  const groupByDate = (items) => {
    const days = new Map();
    for (const item of items) {
      if (!days.has(item.date)) days.set(item.date, []);
      days.get(item.date).push(item);
    }
    return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  };

  function renderSource() {
    const options = [...T.groups.map((group) => ({ value: group, text: group, label: `Group ${group}` }))];
    if (hasCustom()) options.push({ value: 'custom', text: 'My week', label: 'My custom week' });
    $('#source').innerHTML = options
      .map(
        (option) =>
          `<button class="compare-toggle${option.value === 'custom' ? ' is-wide' : ''}" type="button" data-source="${option.value}" ` +
          `aria-pressed="${option.value === state.source}" aria-label="${option.label}">${option.text}</button>`,
      )
      .join('');
  }

  function renderSummary(view) {
    const { now, unmarked, upcoming } = view;
    const notices = [];
    const holiday = T.holidayOn(now.date);
    if (holiday) notices.push(`No classes today: ${holiday}`);
    if (state.since > now.date) notices.push(`Tracking starts ${formatIso(prettyDay, state.since)}`);
    const today = unmarked.filter((occurrence) => occurrence.date === now.date);

    let label;
    let title;
    let meta;
    if (unmarked.length) {
      const oldest = unmarked[0].date;
      label = 'Waiting for a mark';
      title = `${unmarked.length} <em>${unmarked.length === 1 ? 'class' : 'classes'}</em>`;
      meta = oldest === now.date ? 'All from today.' : `The oldest is from ${formatIso(prettyDay, oldest)}.`;
    } else {
      label = 'All caught up';
      title = upcoming ? `${esc(upcoming.session.name)} <em>${esc(upcoming.session.kindLabel)}</em>` : 'Nothing left <em>to mark</em>';
      meta = upcoming
        ? `Next to mark: ${upcoming.date === now.date ? 'today' : formatIso(prettyDay, upcoming.date)}, ${T.clock(upcoming.session.end)}.`
        : `No more classes before ${formatIso(prettyDay, state.until)}.`;
    }
    const summary = $('#summary');
    summary.style.setProperty('--hue', unmarked.length ? 'var(--m2)' : 'var(--m1)');
    summary.innerHTML =
      notices.map((notice) => `<p class="next-notice">${esc(notice)}</p>`).join('') +
      `<p class="eyebrow next-label"><span class="pulse"></span><span>${label}</span></p>` +
      `<p class="next-title">${title}</p>` +
      `<p class="next-meta">${esc(meta)}</p>` +
      (today.length
        ? `<button class="button button-solid next-join" type="button" data-all="${now.date}">Mark today's ${plural(today.length, 'class')} attended</button>`
        : '');
  }

  function renderStats(view) {
    const attended = view.parts.reduce((total, part) => total + part.attended, 0);
    const missed = view.parts.reduce((total, part) => total + part.missed, 0);
    const risky = view.parts.filter((part) => part.state !== 'safe').length;
    const overall = attended + missed ? `${Math.floor((attended / (attended + missed)) * 100)}%` : '–';
    const stats = [
      { value: overall, label: 'Overall' },
      { value: String(attended), label: 'Attended' },
      { value: String(missed), label: 'Missed' },
      { value: String(risky), label: risky === 1 ? 'Part at risk' : 'Parts at risk' },
    ];
    $('#stats').innerHTML = stats.map((stat) => `<div class="stat"><dd>${esc(stat.value)}</dd><dt>${esc(stat.label)}</dt></div>`).join('');
    $('#range').textContent =
      `${sourceName()[0].toUpperCase()}${sourceName().slice(1)} · ${formatIso(dayMonthYear, state.since)} to ${formatIso(dayMonthYear, state.until)} · target ${state.target}%`;
  }

  function renderDue(view) {
    const days = groupByDate(view.unmarked);
    $('#due-note').textContent = view.unmarked.length ? 'Holidays are skipped. Mark a class Cancelled if it didn\'t run.' : '';
    const dayHTML = ([date, list]) =>
      `<section class="att-day"><h3>${esc(formatIso(longDay, date))}` +
      `${date === view.now.date ? '<mark>Today</mark>' : ''}` +
      `<button class="compare-clear" type="button" data-all="${date}">All attended</button></h3>` +
      `<ul class="att-list">${list.map((occurrence) => rowHTML(occurrence.key, occurrence.part, null)).join('')}</ul></section>`;
    // The latest days stay open. Older ones fold away so a late start doesn't bury the totals below.
    const recent = days.slice(0, RECENT_DAYS);
    const older = days.slice(RECENT_DAYS);
    const olderCount = older.reduce((total, [, list]) => total + list.length, 0);
    const wasOpen = $('#due .att-older')?.open ?? false;
    $('#due').innerHTML = days.length
      ? recent.map(dayHTML).join('') +
        (older.length
          ? `<details class="att-week att-older"${wasOpen ? ' open' : ''}><summary><span>Older</span>` +
            `<small>${plural(olderCount, 'class')} from ${formatIso(prettyDay, older[older.length - 1][0])} to ${formatIso(prettyDay, older[0][0])}</small></summary>` +
            older.map(dayHTML).join('') +
            '</details>'
          : '')
      : `<p class="att-empty">${state.since > view.now.date ? 'Nothing yet. Classes appear here once tracking starts and each class has begun.' : 'Every class so far has a mark.'}</p>`;
  }

  function partCard(part) {
    const info = partByKey.get(part.key);
    const name = info?.name ?? part.key.split('|')[0];
    const kindLabel = info?.kindLabel ?? '';
    const pct = part.pct === null ? null : Math.floor(part.pct);
    let verdict;
    if (part.state === 'below') {
      verdict = `Below ${state.target}%: ${plural(part.missed, 'miss')} of ${part.total}, only ${part.allowed} allowed`;
    } else if (part.canMiss === 0) {
      verdict = 'No more misses allowed';
    } else {
      verdict = `Can still miss ${part.canMiss} of ${part.total}`;
    }
    return (
      `<article class="module-card att-card is-${part.state}" style="--hue:var(--m${info?.hue ?? 0})">` +
      `<div class="module-head"><span class="code">${esc(name)} <span class="att-kind">${esc(kindLabel)}</span></span>` +
      `<span class="att-pct">${pct === null ? '–' : `${pct}%`}</span></div>` +
      `<div class="att-meter" role="img" aria-label="${pct === null ? 'Nothing marked yet' : `${pct}% attended`}, target ${state.target}%" style="--target:${state.target}%">` +
      `<span style="width:${pct ?? 0}%"></span><i></i></div>` +
      `<p class="att-verdict">${esc(verdict)}</p>` +
      `<p class="att-meta">${part.attended} attended · ${part.missed} missed${part.cancelled ? ` · ${part.cancelled} cancelled` : ''}</p>` +
      '</article>'
    );
  }

  function renderParts(view) {
    $('#parts').innerHTML = view.parts.map(partCard).join('');
    $('#parts-note').textContent = view.foreign
      ? `Includes ${plural(view.foreign, 'mark')} from another timetable or date range.`
      : `"Can still miss" counts the whole semester, up to ${formatIso(prettyDay, state.until)}.`;
  }

  function renderHistory(view) {
    const weeks = new Map();
    for (const [key, mark] of Object.entries(state.marks)) {
      const date = key.split('|')[0];
      const monday = mondayOf(date);
      if (!weeks.has(monday)) weeks.set(monday, []);
      weeks.get(monday).push({ key, mark, date });
    }
    const thisMonday = mondayOf(view.now.date);
    const opened = new Set([...document.querySelectorAll('#history .att-week[open]')].map((week) => week.dataset.week));
    const seen = new Set([...document.querySelectorAll('#history .att-week')].map((week) => week.dataset.week));
    const sorted = [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    $('#history').innerHTML = sorted.length
      ? sorted
          .map(([monday, list], index) => {
            const count = (status) => list.filter((item) => item.mark.s === status).length;
            const offset = daysBetween(thisMonday, monday) / 7;
            const title = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : `Week of ${formatIso(prettyDay, monday)}`;
            const order = (a, b) => b.date.localeCompare(a.date) || (describe(a.key, a.mark.k).session?.start ?? 0) - (describe(b.key, b.mark.k).session?.start ?? 0);
            const days = groupByDate(list.sort(order));
            return (
              `<details class="att-week" data-week="${monday}"${(opened.has(monday) || (index === 0 && !seen.has(monday))) ? ' open' : ''}><summary><span>${esc(title)}</span>` +
              `<small>${count('a')} attended · ${count('m')} missed${count('c') ? ` · ${count('c')} cancelled` : ''}</small></summary>` +
              days
                .map(
                  ([date, items]) =>
                    `<p class="eyebrow att-date">${esc(formatIso(prettyDay, date))}</p>` +
                    `<ul class="att-list">${items.map((item) => rowHTML(item.key, item.mark.k, item.mark.s)).join('')}</ul>`,
                )
                .join('') +
              '</details>'
            );
          })
          .join('')
      : '<p class="att-empty">Your marks will appear here.</p>';
  }

  function render() {
    const view = snapshot();
    renderSource();
    renderSummary(view);
    renderStats(view);
    renderDue(view);
    renderParts(view);
    renderHistory(view);
    return view;
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

  // Finds the part a mark belongs to: from the class itself, else from an earlier mark.
  function partFor(key) {
    const session = byId.get(key.split('|')[1]);
    return (session && A.partKey(session)) ?? state.marks[key]?.k ?? null;
  }

  function setMark(key, status) {
    const current = state.marks[key]?.s;
    if (current === status) delete state.marks[key];
    else {
      const k = partFor(key);
      if (!k) return;
      state.marks[key] = { s: status, k };
    }
    save();
    render();
    // Keep keyboard focus on the same row if it is still on the page.
    const again = document.querySelector(`.mark[data-key="${CSS.escape(key)}"][data-status="${status}"]`);
    again?.focus();
  }

  function markAll(date) {
    const view = snapshot();
    const list = view.unmarked.filter((occurrence) => occurrence.date === date);
    for (const occurrence of list) state.marks[occurrence.key] = { s: 'a', k: occurrence.part };
    save();
    render();
    toast(`Marked ${plural(list.length, 'class')} attended`);
  }

  // Settings
  const dialog = $('#settings-dialog');
  const field = (id) => $(`#setting-${id}`);

  function renderSettingsSummary() {
    const since = field('since').value;
    const until = field('until').value;
    const target = Number(field('target').value);
    if (!ISO.test(since) || !ISO.test(until) || until < since) {
      $('#settings-summary').textContent = 'The end date must be on or after the start date.';
      return;
    }
    const count = A.occurrences(sourceSessions(), since, until).length;
    $('#settings-summary').textContent =
      `${plural(count, 'class')} for ${sourceName()} in this range, holidays left out.` +
      (target >= 50 && target <= 100 ? ` At ${target}%, you can miss about ${Math.floor((count * (100 - target)) / 100)} in total.` : '');
  }

  function openSettings() {
    field('target').value = state.target;
    field('since').value = state.since;
    field('until').value = state.until;
    resetArmed(false);
    renderSettingsSummary();
    dialog.showModal();
  }

  function saveSettings() {
    const since = field('since').value;
    const until = field('until').value;
    const target = Number(field('target').value);
    if (!ISO.test(since) || !ISO.test(until) || until < since || !(target >= 50 && target <= 100)) {
      toast('Settings not saved: check the dates and target.');
      return;
    }
    state = { ...state, since, until, target: Math.round(target) };
    save();
    render();
    toast('Settings saved');
  }

  let resetTimer;
  function resetArmed(armed) {
    const button = $('#reset');
    clearTimeout(resetTimer);
    button.dataset.armed = String(armed);
    button.textContent = armed ? 'Press again to erase' : 'Erase all marks';
    if (armed) resetTimer = setTimeout(() => resetArmed(false), 4000);
  }

  $('#reset').addEventListener('click', () => {
    if ($('#reset').dataset.armed !== 'true') {
      resetArmed(true);
      return;
    }
    const count = Object.keys(state.marks).length;
    state = { ...state, marks: {} };
    save();
    render();
    resetArmed(false);
    dialog.close('cancel');
    toast(`Erased ${plural(count, 'mark')}`);
  });

  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const filename = `epoch-attendance-${zoneNow().date}.json`;
    download(blob, filename);
    toast(`Saved ${filename}`);
  });

  $('#import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    let imported = null;
    try {
      imported = clean(JSON.parse(await file.text()));
    } catch (error) {}
    if (!imported) {
      toast('That file is not an Epoch attendance backup.');
      return;
    }
    state = imported;
    save();
    render();
    dialog.close('cancel');
    toast(`Imported ${plural(Object.keys(state.marks).length, 'mark')}`);
  });

  $('#settings-form').addEventListener('input', renderSettingsSummary);
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'save') saveSettings();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });

  // Page events
  document.addEventListener('click', (event) => {
    const mark = event.target.closest('.mark[data-key]');
    if (mark) {
      setMark(mark.dataset.key, mark.dataset.status);
      return;
    }
    const all = event.target.closest('[data-all]');
    if (all) {
      markAll(all.dataset.all);
      return;
    }
    const source = event.target.closest('[data-source]');
    if (source && source.dataset.source !== state.source) {
      state = { ...state, source: source.dataset.source };
      save();
      render();
      $(`[data-source="${source.dataset.source}"]`)?.focus();
    }
  });

  $('#open-settings').addEventListener('click', openSettings);

  $('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    store.set('tt-theme', theme);
  });

  $('#institution').textContent = T.data.institution;
  $('#source-note').textContent = `Source: timetable generated with ${T.data.generated}.`;

  if (state.source === 'custom' && !hasCustom()) state = { ...state, source: T.groups[0] };
  render();

  // Classes become markable as they start, so refresh once a minute while nothing is focused in a dialog.
  setInterval(() => {
    if (!dialog.open && !document.activeElement?.matches('.mark')) render();
  }, 60000);
  window.addEventListener('storage', (event) => {
    if (event.key !== STORE_KEY && event.key !== 'tt-custom') return;
    state = load();
    render();
  });
})();
