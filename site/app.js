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

  const groupFromHash = () => location.hash.slice(1).toUpperCase();
  const state = {
    group: [groupFromHash(), store.get('tt-group')].find((group) => T.groups.includes(group)) ?? T.groups[0],
    pinned: null,
    hovered: null,
  };

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

  function upcoming(own, now) {
    const week = 7 * 1440;
    const live = own.find((session) => session.day === now.day && session.start <= now.minutes && now.minutes < session.end);
    if (live) return { session: live, live: true, wait: live.end - now.minutes };
    const at = now.day * 1440 + now.minutes;
    return own
      .map((session) => ({ session, live: false, wait: (session.day * 1440 + session.start - at + week) % week }))
      .sort((a, b) => a.wait - b.wait)[0];
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

  const dotsHTML = (session) =>
    `<span class="dots" role="img" aria-label="${groupList(session)}" title="${groupList(session)}">` +
    T.groups.map((group) => `<i${session.groups.includes(group) ? ' class="on"' : ''}></i>`).join('') +
    '</span>';

  const codeHTML = (session) =>
    `<span class="code">${esc(session.module)}${session.variant ? `<sup>${esc(session.variant)}</sup>` : ''}</span>`;

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

  function renderStats() {
    $('#stats').innerHTML = T.summarise(state.group)
      .map((stat) => `<div class="stat"><dd>${esc(stat.value)}</dd><dt>${esc(stat.label)}</dt></div>`)
      .join('');
  }

  function renderChips(own) {
    $('#chips').innerHTML = T.modules
      .map((module) => ({ module, list: own.filter((session) => session.module === module) }))
      .filter((entry) => entry.list.length)
      .map(
        ({ module, list }) =>
          `<button class="chip" type="button" data-module="${esc(module)}" aria-pressed="false" style="--hue:var(--m${list[0].hue})">` +
          `${esc(module)}<span>${list.reduce((total, session) => total + session.hours, 0)} h</span></button>`,
      )
      .join('');
  }

  function renderGrid(own, now) {
    const grid = $('#grid');
    const column = (dayIndex) => T.days.findIndex((day) => day.index === dayIndex) + 2;
    grid.style.setProperty('--days', T.days.length);
    grid.style.setProperty('--hours', T.hourCount);

    const heads = T.days.map(
      (day) =>
        `<div class="day-head${day.index === now.day ? ' is-today' : ''}" style="grid-column:${column(day.index)};grid-row:1">${day.name}</div>`,
    );
    const hourLabels = Array.from(
      { length: T.hourCount + 1 },
      (_, hour) => `<span style="top:calc(${hour} * var(--row))">${T.clock(T.dayStart + hour * 60)}</span>`,
    );
    const lanes = T.days.map(
      (day, position) =>
        `<div class="lane${day.index === now.day ? ' is-today' : ''}${position === T.days.length - 1 ? ' is-last' : ''}" style="grid-column:${column(day.index)}"></div>`,
    );
    const blocks = own.map((session, index) => {
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

    grid.innerHTML = [...heads, `<div class="hours" aria-hidden="true">${hourLabels.join('')}</div>`, ...lanes, ...blocks].join('');
  }

  function renderAgenda(own, now) {
    let index = 0;
    $('#agenda').innerHTML = T.days
      .map((day) => {
        const list = own.filter((session) => session.day === day.index);
        const hours = list.reduce((total, session) => total + session.hours, 0);
        const rows = list.map(
          (session) =>
            `<article ${tileAttrs(session, 'row', index++)}>` +
            `<div class="row-time">${T.clock(session.start)}<span>${T.clock(session.end)}</span></div>` +
            `<div>${codeHTML(session)}<div class="row-kind">${esc(session.kindLabel)}</div>` +
            `<div class="row-meta">${esc([session.place, session.staff.join(', ')].filter(Boolean).join(' · '))}</div></div>` +
            dotsHTML(session) +
            '</article>',
        );
        return (
          `<section class="agenda-day"><h3>${day.name}${day.index === now.day ? '<mark>Today</mark>' : ''}` +
          `<small>${list.length ? `${hours} h` : 'Free'}</small></h3>` +
          (rows.join('') || '<p class="agenda-empty">No classes.</p>') +
          '</section>'
        );
      })
      .join('');
  }

  function renderLive() {
    const now = zoneNow();
    const own = T.sessionsFor(state.group);
    const { session, live, wait } = upcoming(own, now);
    const next = $('#next');
    next.classList.toggle('is-live', live);
    next.style.setProperty('--hue', `var(--m${session.hue})`);
    next.innerHTML =
      `<p class="eyebrow next-label"><span class="pulse"></span><span>${live ? 'Happening now' : 'Next up'}</span>` +
      `<span>${live ? `${span(wait)} left` : `in ${span(wait)}`}</span></p>` +
      `<p class="next-title">${esc(session.name)} <em>${esc(session.kindLabel)}</em></p>` +
      `<p class="next-meta">${[`${dayName(session)} ${session.time}`, session.place, staffShort(session)].filter(Boolean).map(esc).join(' · ')}</p>`;

    const grid = $('#grid');
    grid.querySelector('.now')?.remove();
    const position = T.days.findIndex((day) => day.index === now.day);
    if (position >= 0 && now.minutes >= T.dayStart && now.minutes <= T.dayEnd) {
      const marker = document.createElement('div');
      marker.className = 'now';
      marker.style.gridColumn = position + 2;
      marker.style.setProperty('--at', `${((now.minutes - T.dayStart) / (T.dayEnd - T.dayStart)) * 100}%`);
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
    const own = T.sessionsFor(state.group);
    const now = zoneNow();
    if (!own.some((session) => session.module === state.pinned)) state.pinned = null;
    state.hovered = null;
    document.title = `Epoch · Group ${state.group} · ${T.cohortTitle}`;
    renderStats();
    renderChips(own);
    renderGrid(own, now);
    renderAgenda(own, now);
    renderLive();
    applyFocus();
  }

  function selectGroup(group) {
    if (!T.groups.includes(group) || group === state.group) return;
    state.group = group;
    store.set('tt-group', group);
    history.replaceState(null, '', `#${group}`);
    $(`#group-${group}`).checked = true;
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
  const prettyDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  function calendarOptions() {
    const weeks = Math.round(Number(weeksInput.value));
    if (!startInput.value || !(weeks >= 1 && weeks <= 30)) return null;
    return { startDate: startInput.value, weeks, reminderMinutes: Number($('#calendar-reminder').value) };
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
    const last = new Date(Math.max(...firsts) + (options.weeks - 1) * 7 * 86400000);
    summary.textContent =
      `${own.length} sessions a week for ${options.weeks} week${options.weeks === 1 ? '' : 's'}. ` +
      `First class ${prettyDate.format(first)}, last class ${prettyDate.format(last)}.`;
  }

  function openCalendar() {
    const now = zoneNow();
    if (!startInput.value) {
      const monday = new Date(`${now.date}T00:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() - now.day);
      startInput.value = monday.toISOString().slice(0, 10);
    }
    dialog.returnValue = '';
    $('#calendar-title').textContent = `Add Group ${state.group} to your calendar`;
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
  renderGroup();
  history.replaceState(null, '', `#${state.group}`);
  setInterval(renderLive, 30000);

  $('#picker').addEventListener('change', (event) => selectGroup(event.target.value));
  window.addEventListener('hashchange', () => selectGroup(groupFromHash()));

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
  $('#calendar-form').addEventListener('input', renderCalendarSummary);
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'download') saveCalendar();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
})();
