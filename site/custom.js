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

  const STORE_KEY = 'tt-custom';
  const DAY_MS = 86400000;
  const prettyDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  const byId = new Map(T.sessions.map((session) => [session.id, session]));
  const modules = [...new Set(T.components.map((component) => component.module))];
  // A part with no choice, such as a lecture every group attends together, is always picked.
  const isFixed = (component) => component.options.length <= component.need;
  const totalNeed = T.components.reduce((total, component) => total + component.need, 0);

  // Component key to the ids of the sessions picked for it.
  const picks = new Map();

  function load(ids) {
    for (const component of T.components) picks.set(component.key, isFixed(component) ? component.options.map((option) => option.id) : []);
    for (const id of ids) {
      const session = byId.get(id);
      const component = session && T.componentOf(session);
      if (!component || isFixed(component)) continue;
      const list = picks.get(component.key);
      if (!list.includes(id) && list.length < component.need) list.push(id);
    }
  }

  const chosen = () => T.sessions.filter((session) => picks.get(T.componentOf(session)?.key)?.includes(session.id));
  // Only the choices a person made go in the link. Fixed parts are added back on load.
  const choiceIds = () => chosen().filter((session) => !isFixed(T.componentOf(session))).map((session) => session.id);
  const pickedCount = () => [...picks.values()].reduce((total, list) => total + list.length, 0);

  const parseIds = (text) => text.split(/[+,\s]+/).filter((id) => byId.has(id));

  function hashIds() {
    try {
      return parseIds(decodeURIComponent(location.hash.slice(1)));
    } catch (error) {
      return [];
    }
  }

  function save() {
    const ids = choiceIds();
    store.set(STORE_KEY, ids.join('+'));
    history.replaceState(null, '', ids.length ? `#${ids.join('+')}` : location.pathname + location.search);
  }

  const clashesOf = (session, others) => others.filter((other) => other.id !== session.id && T.overlaps(other, session));

  // Pairs of picked sessions that overlap, each pair once.
  function clashPairs(list) {
    const pairs = [];
    list.forEach((session, index) => {
      for (const other of list.slice(index + 1)) if (T.overlaps(session, other)) pairs.push([session, other]);
    });
    return pairs;
  }

  const dayShort = (session) => T.data.days[session.day].slice(0, 3);
  const groupList = (session) => `Group${session.groups.length > 1 ? 's' : ''} ${session.groups.join(', ')}`;
  const staffShort = (session) =>
    session.staff.length > 3 ? `${session.staff.slice(0, 3).join(', ')} +${session.staff.length - 3}` : session.staff.join(', ');
  const partLabel = (component) =>
    component.name === component.module ? component.kindLabel : `${component.name.slice(component.module.length + 1)} ${component.kindLabel}`;

  const dotsHTML = (session) =>
    `<span class="dots" role="img" aria-label="${groupList(session)}" title="${groupList(session)}">` +
    T.groups.map((group) => `<i${session.groups.includes(group) ? ' class="on"' : ''}></i>`).join('') +
    '</span>';

  const codeHTML = (session) =>
    `<span class="code">${esc(session.module)}${session.variant ? `<sup>${esc(session.variant)}</sup>` : ''}</span>`;

  function partHTML(component, current) {
    const list = picks.get(component.key);
    const type = component.need === 1 ? 'radio' : 'checkbox';
    const fixed = isFixed(component);
    // Picking a radio option replaces the current pick, so that pick can't clash with it.
    const others = current.filter((session) => !(component.need === 1 && T.componentOf(session) === component));
    const hint = fixed
      ? 'Same for everyone'
      : component.need === 1
        ? `Pick 1 of ${component.options.length}`
        : `Pick ${component.need} of ${component.options.length}`;

    const options = component.options.map((option) => {
      const checked = list.includes(option.id);
      const clash = clashesOf(option, others);
      const disabled = fixed || (type === 'checkbox' && !checked && list.length >= component.need);
      return (
        `<input class="slot-input" type="${type}" name="${esc(component.key)}" id="slot-${option.id}" value="${option.id}"` +
        `${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} />` +
        `<label class="slot${clash.length ? ' has-clash' : ''}" for="slot-${option.id}">` +
        `<span class="slot-time">${dayShort(option)} ${option.time}</span>` +
        `<span class="slot-meta">${esc([option.place, staffShort(option)].filter(Boolean).join(' · '))}</span>` +
        `<span class="slot-groups">${dotsHTML(option)}${option.groups.length === T.groups.length ? 'All groups' : groupList(option)}</span>` +
        (clash.length ? `<span class="slot-clash">Clashes with ${clash.map((session) => esc(session.headline)).join(', ')}</span>` : '') +
        '</label>'
      );
    });

    return (
      `<fieldset class="part${list.length >= component.need ? ' is-done' : ''}">` +
      `<legend><span>${esc(partLabel(component))}</span><small>${hint}</small></legend>` +
      `<div class="slots">${options.join('')}</div></fieldset>`
    );
  }

  function renderModules(current) {
    $('#modules').innerHTML = modules
      .map((module) => {
        const parts = T.components.filter((component) => component.module === module);
        const need = parts.reduce((total, component) => total + component.need, 0);
        const got = parts.reduce((total, component) => total + picks.get(component.key).length, 0);
        return (
          `<article class="module-card${got >= need ? ' is-done' : ''}" style="--hue:var(--m${parts[0].hue})">` +
          `<header class="module-head"><span class="code">${esc(module)}</span>` +
          `<span class="module-count">${got} of ${plural(need, 'session')}</span></header>` +
          parts.map((component) => partHTML(component, current)).join('') +
          '</article>'
        );
      })
      .join('');
  }

  function renderProgress(current) {
    const picked = pickedCount();
    const left = totalNeed - picked;
    const pairs = clashPairs(current);
    let title;
    if (left > 0) title = `${left} <em>${left === 1 ? 'part' : 'parts'} left</em>`;
    else if (pairs.length) title = `Complete, <em>with clashes</em>`;
    else title = `Ready <em>to save</em>`;
    const meta = pairs.length
      ? pairs.map(([a, b]) => `${a.headline} and ${b.headline} overlap on ${T.data.days[a.day]}`).join('. ') + '.'
      : left > 0
        ? 'Pick a slot for each part below, or start from a group and swap the slots you want.'
        : `All ${plural(totalNeed, 'session')} picked, with no clashes.`;

    const progress = $('#progress');
    progress.classList.toggle('has-clash', pairs.length > 0);
    progress.innerHTML =
      `<p class="eyebrow next-label"><span>Your week</span><span>${picked} of ${totalNeed} picked</span></p>` +
      `<p class="next-title">${title}</p>` +
      `<div class="meter" role="progressbar" aria-label="Sessions picked" aria-valuemin="0" aria-valuemax="${totalNeed}" aria-valuenow="${picked}">` +
      `<span style="width:${(picked / totalNeed) * 100}%"></span></div>` +
      `<p class="next-meta">${esc(meta)}</p>`;
  }

  function renderStartGroups() {
    const mine = choiceIds().sort().join();
    $('#start-groups').innerHTML = T.groups
      .map((group) => {
        const theirs = T.sessionsFor(group)
          .filter((session) => !isFixed(T.componentOf(session)))
          .map((session) => session.id)
          .sort()
          .join();
        return (
          `<button class="compare-toggle" type="button" data-group="${group}" aria-pressed="${theirs === mine}" ` +
          `aria-label="Start from Group ${group}'s slots">${group}</button>`
        );
      })
      .join('');
  }

  function renderStats(current) {
    $('#stats').innerHTML = T.summariseSessions(current)
      .map((stat) => `<div class="stat"><dd>${esc(stat.value)}</dd><dt>${esc(stat.label)}</dt></div>`)
      .join('');
  }

  const tooltip = (session) =>
    [session.headline, `${T.data.days[session.day]} ${session.time}`, session.place, session.staff.join(', '), groupList(session)]
      .filter(Boolean)
      .join('\n');

  // Overlapping tiles share their day column side by side, so a clash stays visible.
  function laneOf(session, list) {
    const overlapping = list.filter((other) => T.overlaps(other, session)).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    return { lane: overlapping.indexOf(session), lanes: overlapping.length };
  }

  function renderGrid(list) {
    const grid = $('#grid');
    const column = (dayIndex) => T.days.findIndex((day) => day.index === dayIndex) + 2;
    grid.style.setProperty('--days', T.days.length);
    grid.style.setProperty('--hours', T.hourCount);

    const heads = T.days.map(
      (day) => `<div class="day-head" style="grid-column:${column(day.index)};grid-row:1"><span>${day.name}</span></div>`,
    );
    const hourLabels = Array.from(
      { length: T.hourCount + 1 },
      (_, hour) => `<span style="top:calc(${hour} * var(--row))">${T.clock(T.dayStart + hour * 60)}</span>`,
    );
    const lanes = T.days.map(
      (day, position) => `<div class="lane${position === T.days.length - 1 ? ' is-last' : ''}" style="grid-column:${column(day.index)}"></div>`,
    );
    const blocks = list.map((session, index) => {
      const row = (session.start - T.dayStart) / 60 + 2;
      const { lane, lanes: count } = laneOf(session, list);
      const clash = count > 1;
      return (
        `<article class="tile block is-${session.kind}${clash ? ' is-clash' : ''}" data-span="${session.hours}" tabindex="0" ` +
        `title="${esc((clash ? 'Clash\n' : '') + tooltip(session))}" ` +
        `style="--hue:var(--m${session.hue});--i:${index};--lane:${lane};--lanes:${count};grid-column:${column(session.day)};grid-row:${row} / span ${session.hours}">` +
        `<div class="block-top">${codeHTML(session)}${dotsHTML(session)}</div>` +
        `<div class="block-kind">${esc(session.kindLabel)}</div>` +
        `<div class="block-meta"><span>${session.time}</span><span>${esc([session.place, staffShort(session)].filter(Boolean).join(' · '))}</span></div>` +
        '</article>'
      );
    });
    grid.innerHTML = [...heads, `<div class="hours" aria-hidden="true">${hourLabels.join('')}</div>`, ...lanes, ...blocks].join('');
  }

  function renderAgenda(list) {
    let index = 0;
    $('#agenda').innerHTML = T.days
      .map((day) => {
        const today = list.filter((session) => session.day === day.index);
        const hours = today.reduce((total, session) => total + session.hours, 0);
        const rows = today.map((session) => {
          const clash = list.some((other) => other !== session && T.overlaps(other, session));
          return (
            `<article class="tile row is-${session.kind}${clash ? ' is-clash' : ''}" style="--hue:var(--m${session.hue});--i:${index++}" title="${esc(tooltip(session))}">` +
            `<div class="row-time">${T.clock(session.start)}<span>${T.clock(session.end)}</span></div>` +
            `<div>${codeHTML(session)}<div class="row-kind">${esc(session.kindLabel)}${clash ? ' · Clash' : ''}</div>` +
            `<div class="row-meta">${esc([session.place, session.staff.join(', ')].filter(Boolean).join(' · '))}</div></div>` +
            dotsHTML(session) +
            '</article>'
          );
        });
        return (
          `<section class="agenda-day"><h3>${day.name}<small>${today.length ? `${hours} h` : 'Free'}</small></h3>` +
          (rows.join('') || '<p class="agenda-empty">No classes picked.</p>') +
          '</section>'
        );
      })
      .join('');
  }

  function update({ persist = true } = {}) {
    const current = chosen();
    if (persist) save();
    renderProgress(current);
    renderStartGroups();
    renderModules(current);
    renderStats(current);
    renderGrid(current);
    renderAgenda(current);
  }

  // Fills every open part without adding a clash, backtracking when an early choice boxes a later part in.
  // When no clash-free week exists around the current picks, fills what it can.
  function fillRest() {
    const slots = T.components
      .flatMap((component) => Array.from({ length: component.need - picks.get(component.key).length }, () => component))
      .sort((a, b) => a.options.length - b.options.length);
    if (!slots.length) {
      toast('Every part already has a slot');
      return;
    }
    const taken = chosen();
    const fits = (option) => !taken.some((session) => session.id === option.id || T.overlaps(session, option));
    const solve = (index) => {
      if (index === slots.length) return true;
      for (const option of slots[index].options) {
        if (!fits(option)) continue;
        taken.push(option);
        if (solve(index + 1)) return true;
        taken.pop();
      }
      return false;
    };
    let added;
    const before = taken.length;
    if (solve(0)) {
      added = taken.slice(before);
    } else {
      added = [];
      for (const component of slots) {
        const option = component.options.find(fits);
        if (option) {
          taken.push(option);
          added.push(option);
        }
      }
    }
    for (const session of added) picks.get(T.componentOf(session).key).push(session.id);
    update();
    const missed = slots.length - added.length;
    toast(
      missed
        ? `Filled ${plural(added.length, 'part')}. ${plural(missed, 'part')} ${missed === 1 ? 'has' : 'have'} no slot that fits around your picks.`
        : `Filled ${plural(added.length, 'part')} with no clashes`,
    );
  }

  let toastTimer;
  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3200);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const fileBase = () => T.slugify(`${T.data.cohort}-custom-timetable`);
  const leftNote = () => {
    const left = totalNeed - pickedCount();
    return left ? ` ${plural(left, 'part')} still without a slot.` : '';
  };

  async function saveImage(button) {
    const current = chosen();
    if (!current.length) {
      toast('Pick at least one slot first');
      return;
    }
    button.disabled = true;
    try {
      const canvas = await T.renderPoster(null, { sessions: current, word: 'My', mark: 'Week', stats: T.summariseSessions(current) });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const filename = `${fileBase()}.png`;
      download(blob, filename);
      toast(`Saved ${filename}.${leftNote()}`);
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
  if (T.semester.weeks) weeksInput.value = T.semester.weeks;

  function thisMonday() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: T.data.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  }

  function calendarOptions() {
    const weeks = Math.round(Number(weeksInput.value));
    if (!startInput.value || !(weeks >= 1 && weeks <= 30)) return null;
    return { startDate: startInput.value, weeks, reminderMinutes: Number($('#calendar-reminder').value), holidays: T.semester.holidays };
  }

  function renderCalendarSummary() {
    const options = calendarOptions();
    const summary = $('#calendar-summary');
    if (!options) {
      summary.textContent = 'Pick a start date and between 1 and 30 weeks.';
      return;
    }
    const current = chosen();
    const firsts = current.map((session) => TimetableICS.firstOccurrence(options.startDate, session.day).getTime());
    const first = new Date(Math.min(...firsts));
    const last = new Date(Math.max(...firsts) + (options.weeks - 1) * 7 * DAY_MS);
    const skipped = current.reduce(
      (total, session) => total + TimetableICS.holidayDates(options.startDate, session.day, options.weeks, options.holidays).length,
      0,
    );
    summary.textContent =
      `${plural(current.length, 'session')} a week for ${plural(options.weeks, 'week')}. ` +
      `First class ${prettyDate.format(first)}, last class ${prettyDate.format(last)}.` +
      (skipped ? ` ${skipped} class${skipped === 1 ? '' : 'es'} skipped for holidays.` : '') +
      leftNote();
  }

  function openCalendar() {
    if (!chosen().length) {
      toast('Pick at least one slot first');
      return;
    }
    if (!startInput.value) startInput.value = T.semester.start ?? thisMonday();
    dialog.returnValue = '';
    renderCalendarSummary();
    dialog.showModal();
  }

  function saveCalendar() {
    const options = calendarOptions();
    if (!options) return;
    const text = TimetableICS.buildCalendar({
      timetable: T,
      sessions: chosen(),
      name: 'Custom timetable',
      uid: fileBase(),
      ...options,
    });
    const filename = `${fileBase()}.ics`;
    download(new Blob([text], { type: 'text/calendar;charset=utf-8' }), filename);
    toast(`Saved ${filename}`);
  }

  $('#institution').textContent = T.data.institution;
  $('#source').textContent = `Source: timetable generated with ${T.data.generated}.`;
  $('#legend-range').textContent = `${T.groups[0]} to ${T.groups[T.groups.length - 1]}`;

  const fromHash = hashIds();
  load(fromHash.length ? fromHash : parseIds(store.get(STORE_KEY) ?? ''));
  update();

  window.addEventListener('hashchange', () => {
    load(hashIds());
    update();
  });

  $('#modules').addEventListener('change', (event) => {
    const input = event.target.closest('.slot-input');
    const session = input && byId.get(input.value);
    if (!session) return;
    const component = T.componentOf(session);
    const list = picks.get(component.key);
    if (input.type === 'radio') picks.set(component.key, [session.id]);
    else if (input.checked && !list.includes(session.id)) list.push(session.id);
    else if (!input.checked) picks.set(component.key, list.filter((id) => id !== session.id));
    update();
    $(`#slot-${session.id}`)?.focus();
  });

  $('#start-groups').addEventListener('click', (event) => {
    const button = event.target.closest('[data-group]');
    if (!button) return;
    load(T.sessionsFor(button.dataset.group).map((session) => session.id));
    update();
    $(`#start-groups [data-group="${button.dataset.group}"]`)?.focus();
    toast(`Started from Group ${button.dataset.group}. Swap any slot below.`);
  });
  $('#fill-rest').addEventListener('click', fillRest);
  $('#clear-all').addEventListener('click', () => {
    load([]);
    update();
    toast('Cleared your picks');
  });

  $('#copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link copied. Anyone who opens it sees your picks.');
    } catch (error) {
      toast('Could not copy. Copy the address bar instead.');
    }
  });

  $('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    store.set('tt-theme', theme);
  });

  $('#download-image').addEventListener('click', (event) => saveImage(event.currentTarget));
  $('#open-calendar').addEventListener('click', openCalendar);
  $('#calendar-form').addEventListener('input', renderCalendarSummary);
  $('#calendar-form').addEventListener('change', renderCalendarSummary);
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'download') saveCalendar();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
})();
