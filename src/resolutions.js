/** Shared "Mark resolved" state. Marks stay with the phone number across daily packs. */

export const NOTE_MAX = 500;
export const NAME_MAX = 80;
export const GLOBAL_PACK_ID = 'global';
const NAME_KEY = 'pollard-resolver-name';
const STORAGE_PREFIX = 'pollard-resolutions:';
const PENDING_MS = 90000;
const POLL_MS = 60000;

/** Last 10 dial digits. The same caller keeps one resolution across data packs. */
export function rowKey(row) {
  const digits = String(row?.phone_digits ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

export function missedInstant(row) {
  const parsed = Date.parse(String(row?.last_missed_iso ?? '').trim());
  return Number.isNaN(parsed) ? NaN : parsed;
}

/**
 * 'resolved' when the latest mark is true and after this miss.
 * 'earlier' when that mark is older than this miss, so the caller is missed again.
 */
export function resolutionKind(row, item) {
  if (!item || item.resolved !== true) return 'open';
  const missed = missedInstant(row);
  const marked = Date.parse(String(item.resolved_at_iso || '').trim());
  if (Number.isNaN(missed) || Number.isNaN(marked)) return 'open';
  return marked > missed ? 'resolved' : 'earlier';
}

export function formatCentral(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const clock = `${get('hour')}:${get('minute')} ${get('dayPeriod')}`.trim();
  return `${get('weekday')} ${get('month')} ${get('day')}, ${get('year')} ${clock} CT`.replace(/\s+/g, ' ').trim();
}

export function formatCentralDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** "Previously resolved Nov 12, 2026: note" for a mark older than the latest miss. */
export function earlierLine(item) {
  const when = formatCentralDate(item?.resolved_at_iso);
  const note = String(item?.note || '').trim();
  if (!when && !note) return '';
  const detail = note && when ? `${when}: ${note}` : (when || note);
  return `Previously resolved ${detail}`;
}

/** "Resolved by X · time CT · note" with the empty pieces left out. */
export function resolvedSummary(item) {
  const who = String(item?.resolved_by || '').trim();
  const when = formatCentral(item?.resolved_at_iso);
  const note = String(item?.note || '').trim();
  const head = [who ? `Resolved by ${who}` : 'Resolved', when].filter(Boolean).join(' · ');
  return note ? `${head} · ${note}` : head;
}

export function normalizeResolution(raw) {
  const resolved = raw?.resolved === true || String(raw?.resolved || '').trim().toUpperCase() === 'TRUE';
  return {
    row_key: String(raw?.row_key || '').trim(),
    resolved,
    note: String(raw?.note || '').trim().slice(0, NOTE_MAX),
    resolved_by: String(raw?.resolved_by || '').trim().slice(0, NAME_MAX),
    resolved_at_iso: String(raw?.resolved_at_iso || '').trim(),
  };
}

function sameResolution(a, b) {
  return !!a?.resolved === !!b?.resolved
    && String(a?.note || '') === String(b?.note || '')
    && String(a?.resolved_by || '') === String(b?.resolved_by || '');
}

/**
 * Merge a sheet snapshot with optimistic writes.
 * `pending` maps row_key → { item, since }. Resolved false means undo.
 * Returns the map of rows that should still look resolved.
 */
export function mergeResolutions(pending, list, now = Date.now()) {
  const waiting = pending && typeof pending === 'object' ? { ...pending } : {};
  const server = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const item = normalizeResolution(raw);
    if (!item.row_key) continue;
    server.set(item.row_key, item);
  }
  const next = {};
  for (const [key, item] of server) {
    const pend = waiting[key];
    if (pend && now - pend.since < PENDING_MS && !sameResolution(pend.item, item)) {
      if (pend.item.resolved) next[key] = pend.item;
      continue;
    }
    delete waiting[key];
    if (item.resolved) next[key] = item;
  }
  for (const [key, pend] of Object.entries(waiting)) {
    if (now - pend.since >= PENDING_MS) {
      delete waiting[key];
      continue;
    }
    if (pend.item.resolved) next[key] = pend.item;
    else delete next[key];
  }
  return { map: next, pending: waiting };
}

function storageKey(id) {
  return `${STORAGE_PREFIX}${id}`;
}

export function readResolverName() {
  try {
    return String(localStorage.getItem(NAME_KEY) || '').slice(0, NAME_MAX);
  } catch {
    return '';
  }
}

export function writeResolverName(value) {
  const name = String(value || '').slice(0, NAME_MAX);
  try {
    if (name.trim()) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* private mode */
  }
  return name;
}

export function readLocalResolutions(id) {
  const keep = storageKey(id);
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX) && key !== keep) localStorage.removeItem(key);
    }
    const parsed = JSON.parse(localStorage.getItem(keep) || '{}');
    const map = {};
    if (!parsed || typeof parsed !== 'object') return map;
    for (const [key, value] of Object.entries(parsed)) {
      const item = normalizeResolution({ ...value, row_key: key });
      if (item.resolved) map[key] = item;
    }
    return map;
  } catch {
    return {};
  }
}

export function writeLocalResolutions(id, map) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(map));
  } catch {
    /* keep the in-memory copy */
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'follow' });
    if (!res.ok) throw new Error(`Could not load resolutions (${res.status}).`);
    const data = await res.json();
    if (!data || !Array.isArray(data.resolutions)) throw new Error('Resolution list was not valid.');
    return data.resolutions;
  } finally {
    clearTimeout(timer);
  }
}

function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    const callback = `__pollardResolutions_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const script = document.createElement('script');
    const request = new URL(url);
    request.searchParams.set('callback', callback);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Resolution list timed out.'));
    }, 15000);
    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }
    window[callback] = (data) => {
      cleanup();
      if (!data || !Array.isArray(data.resolutions)) {
        reject(new Error('Resolution list was not valid.'));
        return;
      }
      resolve(data.resolutions);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Could not load resolutions.'));
    };
    script.src = request.toString();
    document.head.appendChild(script);
  });
}

export async function loadSharedResolutions(endpoint, id) {
  const url = new URL(endpoint);
  url.searchParams.set('pack_id', id);
  url.searchParams.set('_', String(Date.now()));
  try {
    return await fetchJson(url);
  } catch {
    return fetchJsonp(url);
  }
}

function listMatchesPost(list, payload) {
  const want = payload.resolved === true;
  const note = String(payload.note || '').trim().slice(0, NOTE_MAX);
  const resolvedBy = String(payload.resolved_by || '').trim().slice(0, NAME_MAX);
  const item = (Array.isArray(list) ? list : [])
    .map((row) => normalizeResolution(row))
    .filter((row) => row.row_key === payload.row_key)
    .pop();
  if (!item) return !want;
  if (item.resolved !== want) return false;
  if (!want) return true;
  return item.note === note && item.resolved_by === resolvedBy;
}

export async function postResolution(endpoint, payload) {
  const body = JSON.stringify({
    pack_id: payload.pack_id,
    row_key: payload.row_key,
    resolved: payload.resolved === true,
    note: String(payload.note || ''),
    resolved_by: String(payload.resolved_by || ''),
  });
  const init = {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  };
  let accepted = false;
  try {
    const res = await fetch(endpoint, init);
    if (res.type !== 'opaque' && res.ok) {
      const text = await res.text();
      if (text) {
        try {
          const data = JSON.parse(text);
          if (data && data.ok === false) throw new Error(data.error || 'Could not save the resolution.');
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
        }
      }
      accepted = true;
    }
  } catch (err) {
    if (String(err?.message || '').startsWith('Could not save')) throw err;
  }
  if (!accepted) {
    await fetch(endpoint, { ...init, mode: 'no-cors' });
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const list = await loadSharedResolutions(endpoint, payload.pack_id);
    if (listMatchesPost(list, payload)) return list;
    await sleep(400);
  }
  throw new Error('The shared list did not show that update.');
}

export async function loadEndpoint() {
  try {
    const base = import.meta.env.BASE_URL || '/';
    const url = new URL('config.json', new URL(base, window.location.origin));
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return '';
    const config = await res.json();
    return String(config?.resolutionsEndpoint || '').trim();
  } catch {
    return '';
  }
}

export function createResolutionStore() {
  let id = '';
  let endpoint = '';
  let shared = false;
  let map = {};
  let pending = {};
  let timer = 0;
  let onChange = () => {};

  function publish() {
    onChange({ map, shared });
  }

  function rememberLocal() {
    if (!shared) writeLocalResolutions(id, map);
  }

  function applyConfirmed(list, key) {
    const rest = { ...pending };
    delete rest[key];
    const merged = mergeResolutions(rest, list);
    pending = merged.pending;
    map = merged.map;
    publish();
  }

  async function refresh() {
    if (!shared || !endpoint) return;
    try {
      const list = await loadSharedResolutions(endpoint, id);
      const merged = mergeResolutions(pending, list);
      pending = merged.pending;
      map = merged.map;
      publish();
    } catch {
      /* keep the last good list */
    }
  }

  return {
    get shared() {
      return shared;
    },
    get map() {
      return map;
    },
    async start(data, notify) {
      onChange = typeof notify === 'function' ? notify : () => {};
      id = GLOBAL_PACK_ID;
      endpoint = await loadEndpoint();
      if (!endpoint) {
        shared = false;
        map = readLocalResolutions(id);
        return;
      }
      try {
        const list = await loadSharedResolutions(endpoint, id);
        shared = true;
        const merged = mergeResolutions({}, list);
        map = merged.map;
        timer = window.setInterval(refresh, POLL_MS);
      } catch {
        shared = false;
        endpoint = '';
        map = readLocalResolutions(id);
      }
    },
    async save(rowKeyValue, note, resolvedBy) {
      const item = normalizeResolution({
        row_key: rowKeyValue,
        resolved: true,
        note,
        resolved_by: resolvedBy,
        resolved_at_iso: new Date().toISOString(),
      });
      if (!item.row_key) return;
      map = { ...map, [item.row_key]: item };
      if (shared) {
        pending = { ...pending, [item.row_key]: { item, since: Date.now() } };
        try {
          const list = await postResolution(endpoint, {
            pack_id: id,
            row_key: item.row_key,
            resolved: true,
            note: item.note,
            resolved_by: item.resolved_by,
          });
          applyConfirmed(list, item.row_key);
        } catch {
          const rest = { ...pending };
          delete rest[item.row_key];
          pending = rest;
          const next = { ...map };
          delete next[item.row_key];
          map = next;
          publish();
        }
        return;
      }
      rememberLocal();
    },
    async undo(rowKeyValue, resolvedBy) {
      const previous = map[rowKeyValue];
      if (!previous) return;
      const item = { ...previous, resolved: false, resolved_by: resolvedBy || previous.resolved_by };
      const rest = { ...map };
      delete rest[rowKeyValue];
      map = rest;
      if (shared) {
        pending = { ...pending, [rowKeyValue]: { item, since: Date.now() } };
        try {
          const list = await postResolution(endpoint, {
            pack_id: id,
            row_key: rowKeyValue,
            resolved: false,
            note: item.note,
            resolved_by: item.resolved_by,
          });
          applyConfirmed(list, rowKeyValue);
        } catch {
          const rest = { ...pending };
          delete rest[rowKeyValue];
          pending = rest;
          map = { ...map, [rowKeyValue]: previous };
          publish();
        }
        return;
      }
      rememberLocal();
    },
  };
}
