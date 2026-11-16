import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'Raw Time Table');
const outFile = join(root, 'site', 'data.js');

const fail = (message) => {
  throw new Error(`build-data: ${message}`);
};

const decode = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const clockToMinutes = (clock) => {
  const match = clock.match(/^(\d{1,2})\.(\d{2})(am|pm)$/);
  if (!match) fail(`unreadable clock time "${clock}"`);
  const hour = (Number(match[1]) % 12) + (match[3] === 'pm' ? 12 : 0);
  return hour * 60 + Number(match[2]);
};

const groupLetter = (label) => {
  const match = label.match(/^\[Group ([A-Z])\]$/);
  if (!match) fail(`unreadable group label "${label}"`);
  return match[1];
};

const ACTIVITY = /^([0-9A-Z]+)(?:\[([A-Z]+)\])?\s+(.+)$/;
const KINDS = { LEC: 'lecture', TUT: 'tutorial' };

function parseCell(lines, cohort) {
  let audience = null;
  if (lines[0] === cohort) {
    audience = 'all';
    lines = lines.slice(1);
  } else if (lines[0].startsWith('[Group')) {
    audience = lines[0].split(',').map((part) => groupLetter(part.trim()));
    lines = lines.slice(1);
  }

  const activity = lines[0].match(ACTIVITY);
  if (!activity) fail(`unreadable activity "${lines[0]}"`);
  const [, module, variant = null, rest] = activity;
  const [head, ...tags] = rest.split(',').map((part) => part.trim());

  const session = {
    module,
    variant,
    kind: KINDS[head] ?? 'session',
    title: KINDS[head] ? null : head.charAt(0).toUpperCase() + head.slice(1),
    online: tags.includes('[ONLINE]'),
    staff: (lines[1] ?? '').split(',').map((name) => name.trim()).filter(Boolean),
    room: null,
    audience,
    statedTime: null,
  };

  const timeTag = tags.find((tag) => /^\[\d/.test(tag));
  if (timeTag) {
    const [from, to] = timeTag.slice(1, -1).split('-').map((part) => part.trim());
    session.statedTime = [clockToMinutes(from), clockToMinutes(to)];
  }

  if (lines[2]) {
    const room = lines[2].match(/^([A-Z]+)\s*-\s*(\w+)$/);
    if (!room) fail(`unreadable room "${lines[2]}"`);
    session.room = `${room[1]}-${room[2]}`;
  }
  if (lines.length > 3) fail(`unexpected extra lines in cell: ${lines.join(' | ')}`);
  return session;
}

function parseTable(tableHtml, cohort) {
  const group = groupLetter(decode(tableHtml.match(/<span class="name">(.*?)<\/span>/)[1]));
  const days = [...tableHtml.matchAll(/<th class="xAxis">(.*?)<\/th>/g)].map((m) => decode(m[1]));
  const cells = [];

  for (const row of tableHtml.matchAll(/<tr>\s*<th class="yAxis">(\d\d:\d\d)<\/th>([\s\S]*?)<\/tr>/g)) {
    const start = toMinutes(row[1]);
    const slots = [...row[2].matchAll(/<!-- span -->|<td(?: rowspan="(\d+)")?>([\s\S]*?)<\/td>/g)];
    if (slots.length !== days.length) fail(`group ${group} ${row[1]}: ${slots.length} slots for ${days.length} days`);

    slots.forEach((slot, day) => {
      if (slot[0] === '<!-- span -->') return;
      const lines = slot[2].split(/<br\s*\/?>/).map(decode).filter(Boolean);
      if (lines.length === 1 && lines[0] === '---') return;
      const hours = Number(slot[1] ?? 1);
      const session = parseCell(lines, cohort);
      const end = start + hours * 60;
      if (session.statedTime && (session.statedTime[0] !== start || session.statedTime[1] !== end)) {
        fail(`group ${group} ${days[day]} ${row[1]}: grid says ${start}-${end}, text says ${session.statedTime.join('-')}`);
      }
      delete session.statedTime;
      cells.push({ ...session, group, day, start, end });
    });
  }
  return { group, days, cells };
}

function build(html) {
  const institution = decode(html.match(/<th>Institution name:<\/th>\s*<td>(.*?)<\/td>/)[1]);
  const cohort = decode(html.match(/<li>\s*Year ([\s\S]*?)<ul>/)[1]);
  const generated = decode(html.match(/Timetable generated with (.*?)<\/td>/)[1]);
  const tables = [...html.matchAll(/<table id="table_\d+"[\s\S]*?<\/table>/g)].map((m) => parseTable(m[0], cohort));
  if (!tables.length) fail('no group tables found');

  const groups = tables.map((table) => table.group);
  const merged = new Map();

  for (const table of tables) {
    for (const cell of table.cells) {
      const { group, audience, ...session } = cell;
      const declared = audience === 'all' ? groups : audience ?? [group];
      const key = JSON.stringify([session, declared]);
      const entry = merged.get(key) ?? { ...session, groups: declared, seenIn: [] };
      entry.seenIn.push(group);
      merged.set(key, entry);
    }
  }

  const sessions = [...merged.values()]
    .map(({ seenIn, ...session }) => {
      if (seenIn.join() !== session.groups.join()) {
        fail(`${session.module} day ${session.day} ${session.start}: declared for ${session.groups}, found in ${seenIn}`);
      }
      return session;
    })
    .sort((a, b) => a.day - b.day || a.start - b.start || a.groups[0].localeCompare(b.groups[0]))
    .map((session, index) => ({ id: `s${String(index + 1).padStart(2, '0')}`, ...session }));

  return { institution, cohort, generated, timezone: 'Asia/Colombo', days: tables[0].days, groups, sessions };
}

const sources = readdirSync(rawDir).filter((name) => name.endsWith('.html'));
if (sources.length !== 1) fail(`expected one .html file in "Raw Time Table", found ${sources.length}`);

const data = build(readFileSync(join(rawDir, sources[0]), 'utf8'));
writeFileSync(
  outFile,
  `// Generated by scripts/build-data.mjs from "Raw Time Table/${sources[0]}". Do not edit by hand.\nwindow.TIMETABLE = ${JSON.stringify(data, null, 2)};\n`,
);

for (const group of data.groups) {
  const own = data.sessions.filter((session) => session.groups.includes(group));
  const hours = own.reduce((total, session) => total + (session.end - session.start) / 60, 0);
  console.log(`Group ${group}: ${own.length} sessions, ${hours} h/week`);
}
console.log(`${data.sessions.length} distinct sessions written to site/data.js`);
