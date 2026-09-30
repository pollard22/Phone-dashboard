/**
 * Placeholder numbers for the Overview layout demo.
 * Nothing here is an Ultatel or HireSuper measurement.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DIDS = ['101 — Front desk', '102 — Leasing', '110 — Manager line'];

function phone(n) {
  return `(555) 010-${String(n).padStart(4, '0')}`;
}

function when(isoDate, minuteOfDay) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  return {
    date: `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[month - 1]} ${day}, ${year}`,
    time: `${hour}:${String(minute).padStart(2, '0')} ${ampm}`,
    sortKey: Date.UTC(year, month - 1, day) / 1000 + minuteOfDay,
  };
}

function minuteOfDay(day, index, span) {
  if (span === '24h' && day.endsWith('-09-29')) return 15 * 60 + ((index * 17) % (8 * 60));
  if (span === '24h') return 8 * 60 + ((index * 17) % (7 * 60));
  return 8 * 60 + ((index * 19) % (10 * 60));
}

function buildWindow(spec) {
  const callers = Array.from({ length: spec.unique }, (_, i) => {
    let bucket = 'called-back';
    let detail = 'Called back within 24h';
    if (i >= spec.calledBack && i < spec.calledBack + spec.never) {
      bucket = 'never';
      detail = 'Not called back · never company-dialed';
    } else if (i >= spec.calledBack) {
      bucket = 'outside-24h';
      detail = 'Not called back · dialed outside 24h';
    }
    return {
      caller: phone(spec.callerStart + i),
      who: DIDS[i % DIDS.length],
      bucket,
      detail,
    };
  });

  const eventCallerIndexes = [...callers.map((_, i) => i), ...Array.from({ length: spec.extraRepeats }, (_, i) => i)];
  const missed = eventCallerIndexes.map((callerIndex, eventIndex) => {
    const caller = callers[callerIndex];
    const day = spec.days[(callerIndex + eventIndex) % spec.days.length];
    return {
      caller: caller.caller,
      who: caller.who,
      ...when(day, minuteOfDay(day, eventIndex + callerIndex, spec.span)),
      detail: 'No answer',
      kind: 'missed',
      bucket: caller.bucket,
    };
  });

  const latest = new Map();
  for (const row of missed) {
    const prev = latest.get(row.caller);
    if (!prev || row.sortKey > prev.sortKey) latest.set(row.caller, row);
  }

  const callerRows = callers.map((caller) => {
    const last = latest.get(caller.caller);
    return {
      caller: caller.caller,
      who: caller.who,
      date: last.date,
      time: last.time,
      sortKey: last.sortKey,
      detail: caller.detail,
      kind: 'caller',
      bucket: caller.bucket,
    };
  });

  const answered = Array.from({ length: spec.answered }, (_, i) => ({
    caller: phone(spec.answeredStart + i),
    who: DIDS[i % DIDS.length],
    ...when(spec.days[i % spec.days.length], minuteOfDay(spec.days[i % spec.days.length], i, spec.span)),
    detail: 'Answered',
    kind: 'answered',
    bucket: 'answered',
  }));

  const excluded = Array.from({ length: spec.excluded }, (_, i) => ({
    caller: phone(spec.excludedStart + i),
    who: 'Company / self From',
    ...when(spec.days[i % spec.days.length], minuteOfDay(spec.days[i % spec.days.length], 40 + i, spec.span)),
    detail: 'No answer · excluded From',
    kind: 'excluded',
    bucket: 'excluded',
  }));

  const byRecent = (rows) => [...rows].sort((a, b) => b.sortKey - a.sortKey);
  const calledBack = callerRows.filter((row) => row.bucket === 'called-back');
  const notCalledBack = callerRows.filter((row) => row.bucket !== 'called-back');
  const neverDialed = callerRows.filter((row) => row.bucket === 'never');
  const superLoops = spec.superNotes
    ? spec.superNotes.map((note, i) => ({
        caller: phone(spec.superStart + i),
        who: DIDS[i % DIDS.length],
        ...when(spec.days[spec.days.length - 1], 15 * 60 + i * 25),
        detail: note,
        kind: 'super',
        bucket: 'super',
      }))
    : null;

  const rows = {
    received: byRecent([...answered, ...missed, ...excluded]),
    answered: byRecent(answered),
    notPickedUp: byRecent([...missed, ...excluded]),
    missed: byRecent(missed),
    eligible: byRecent(callerRows),
    calledBack: byRecent(calledBack),
    notCalledBack: byRecent(notCalledBack),
    neverDialed: byRecent(neverDialed),
    superLoops,
  };

  const kpis = {
    received: rows.received.length,
    answered: rows.answered.length,
    notPickedUp: rows.notPickedUp.length,
    cleaned: rows.missed.length,
    excluded: excluded.length,
    eligible: rows.eligible.length,
    calledBack: rows.calledBack.length,
    notCalledBack: rows.notCalledBack.length,
    neverDialed: rows.neverDialed.length,
    outside24h: callerRows.filter((row) => row.bucket === 'outside-24h').length,
    superLoops: superLoops ? superLoops.length : null,
  };

  return {
    id: spec.id,
    label: spec.label,
    rangeLabel: spec.rangeLabel,
    kpis,
    rows,
  };
}

export function formatPct(part, whole) {
  if (!whole) return '—';
  const rounded = Math.round((part / whole) * 1000) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

const WEEK_DAYS = [
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
];

export const DEMO_WINDOWS = {
  '7d': buildWindow({
    id: '7d',
    span: '7d',
    label: 'Last 7 days',
    rangeLabel: 'Demo · Sep 24–30, 2026',
    days: WEEK_DAYS,
    answered: 280,
    answeredStart: 1,
    unique: 80,
    calledBack: 52,
    never: 18,
    extraRepeats: 40,
    callerStart: 2001,
    excluded: 20,
    excludedStart: 8001,
    superStart: 7001,
    superNotes: [
      'Demo · failed transfer, Action Required',
      'Demo · message taken for the team',
      'Demo · ring with no handoff',
      'Demo · Action Required after a failed transfer',
    ],
  }),
  '24h': buildWindow({
    id: '24h',
    span: '24h',
    label: 'Last 24 hours',
    rangeLabel: 'Demo · Sep 29, 3:00 PM – Sep 30, 3:00 PM',
    days: ['2026-09-29', '2026-09-30'],
    answered: 31,
    answeredStart: 3001,
    unique: 10,
    calledBack: 6,
    never: 2,
    extraRepeats: 5,
    callerStart: 4001,
    excluded: 2,
    excludedStart: 8101,
    superNotes: null,
  }),
};

function assertWindow(windowPack) {
  const { kpis, rows, id } = windowPack;
  const fail = (message) => {
    throw new Error(`Demo window ${id}: ${message}`);
  };
  if (kpis.received !== kpis.answered + kpis.notPickedUp) fail('received != answered + not picked up');
  if (kpis.notPickedUp !== kpis.cleaned + kpis.excluded) fail('not picked up != cleaned + excluded');
  if (kpis.eligible !== kpis.calledBack + kpis.notCalledBack) fail('eligible split');
  if (kpis.notCalledBack !== kpis.neverDialed + kpis.outside24h) fail('no-callback split');
  if (rows.received.length !== kpis.received) fail('received rows');
  if (rows.answered.length !== kpis.answered) fail('answered rows');
  if (rows.notPickedUp.length !== kpis.notPickedUp) fail('not picked up rows');
  if (rows.missed.length !== kpis.cleaned) fail('cleaned rows');
  if (rows.calledBack.length !== kpis.calledBack) fail('called back rows');
  if (rows.notCalledBack.length !== kpis.notCalledBack) fail('not called back rows');
  if (rows.neverDialed.length !== kpis.neverDialed) fail('never dialed rows');
  if (rows.eligible.length !== kpis.eligible) fail('eligible rows');
  const notCalled = new Set(rows.notCalledBack.map((row) => row.caller));
  for (const row of rows.neverDialed) {
    if (!notCalled.has(row.caller)) fail(`never-dialed caller ${row.caller} missing from no-callback`);
  }
  if (kpis.superLoops == null) {
    if (rows.superLoops) fail('24h super rows should be omitted');
  } else if (rows.superLoops.length !== kpis.superLoops) {
    fail('super rows');
  }
}

for (const windowPack of Object.values(DEMO_WINDOWS)) assertWindow(windowPack);

export function demoWindow(id) {
  return DEMO_WINDOWS[id] || DEMO_WINDOWS['7d'];
}
