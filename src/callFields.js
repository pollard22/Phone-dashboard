/** Display fields for call and open-loop lists. Values come from the loaded export. */

export const NOT_IN_EXPORT = 'Not in this export';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function exportYear(windowLabel) {
  const match = String(windowLabel || '').match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function yearFillNote(windowLabel) {
  const label = String(windowLabel || '').trim();
  return label
    ? `Source cells have month and day only. The year is filled from the export window: ${label}.`
    : 'Source cells have month and day only. The year is filled from the export window.';
}

function isBlank(value) {
  const s = String(value ?? '').trim();
  return !s || s === '—' || s === '–' || s === '-' || s === '−';
}

function formatDate(year, month, day) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[month - 1]} ${day}, ${year}`;
}

function formatTime(hour, minute, ampm) {
  return `${Number(hour)}:${String(minute).padStart(2, '0')} ${ampm.toUpperCase()}`;
}

/**
 * Split a PT timestamp into date and time.
 * `2026-09-26 06:17 PM` → Sat, Sep 26, 2026 / 6:17 PM
 * `Fri Sep 25 12:10 PM` → Fri, Sep 25, {year} / 12:10 PM (year from the export window)
 */
export function splitWhen(raw, yearFallback) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (isBlank(s)) {
    return { date: NOT_IN_EXPORT, time: NOT_IN_EXPORT, yearInferred: false, missing: true };
  }

  let match = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}) ([AP]M)$/i);
  if (match) {
    return {
      date: formatDate(Number(match[1]), Number(match[2]), Number(match[3])),
      time: formatTime(match[4], match[5], match[6]),
      yearInferred: false,
      missing: false,
    };
  }

  match = s.match(
    /^(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) )?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?: (\d{1,2}):(\d{2}) ([AP]M))?$/i
  );
  if (match && yearFallback) {
    const month = MONTH_INDEX[match[1].toLowerCase()] + 1;
    const hasTime = Boolean(match[3]);
    return {
      date: formatDate(yearFallback, month, Number(match[2])),
      time: hasTime ? formatTime(match[3], match[4], match[5]) : NOT_IN_EXPORT,
      yearInferred: true,
      missing: false,
    };
  }

  return { date: NOT_IN_EXPORT, time: NOT_IN_EXPORT, yearInferred: false, missing: true };
}

function destination(value) {
  return isBlank(value) ? NOT_IN_EXPORT : String(value).trim();
}

export function missedFields(row) {
  const when = splitWhen(row['Miss datetime (PT)']);
  return {
    caller: row.Caller || '',
    who: destination(row['Who should have taken it']),
    date: when.date,
    time: when.time,
    yearInferred: when.yearInferred,
  };
}

export function callbackFields(row, year) {
  const when = splitWhen(row['Last miss (PT)'], year);
  return {
    caller: row.Caller || '',
    who: destination(row['Last extension tried']),
    date: when.date,
    time: when.time,
    yearInferred: when.yearInferred,
  };
}

export function indexActionByCaller(actionRows) {
  const map = new Map();
  for (const row of actionRows || []) {
    if (row?.Caller && !map.has(row.Caller)) map.set(row.Caller, row);
  }
  return map;
}

export function neverFields(row, actionByCaller, year) {
  const action = actionByCaller.get(row.Caller);
  const when = splitWhen(row['Last miss (PT)'], year);
  return {
    caller: row.Caller || '',
    who: action ? destination(action['Last extension tried']) : NOT_IN_EXPORT,
    date: when.date,
    time: when.time,
    yearInferred: when.yearInferred,
  };
}

export function openLoopFields(row, actionByCaller, year) {
  const action = actionByCaller.get(row.Caller);
  const when = splitWhen(row['Last Ultatel miss (PT)'], year);
  return {
    caller: row.Caller || '',
    who: action ? destination(action['Last extension tried']) : NOT_IN_EXPORT,
    date: when.missing ? NOT_IN_EXPORT : when.date,
    time: when.missing ? NOT_IN_EXPORT : when.time,
    yearInferred: !when.missing && when.yearInferred,
  };
}

export function displayedCallFields(kind, row, actionByCaller, year) {
  if (kind === 'missed') return missedFields(row);
  if (kind === 'callback') return callbackFields(row, year);
  if (kind === 'never') return neverFields(row, actionByCaller, year);
  if (kind === 'loops') return openLoopFields(row, actionByCaller, year);
  return null;
}
