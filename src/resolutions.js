/** Shared "Mark resolved" state. The sheet is used when config.json has a URL. */

export const NOTE_MAX = 500;
export const NAME_MAX = 80;
const NAME_KEY = 'pollard-resolver-name';
const STORAGE_PREFIX = 'pollard-resolutions:';
const PENDING_MS = 90000;
const POLL_MS = 60000;

export function packId(data) {
  const windowLabel = String(data?.summary?.window_label || data?.meta?.window_label || '').trim();
  const generated = String(data?.meta?.generated_at || '').trim();
  return [windowLabel, generated].filter(Boolean).join('|');
}

export function rowKey(row) {
  const digits = String(row?.phone_digits ?? '').replace(/\D/g, '');
  const when = String(row?.last_missed_iso ?? '').trim();
  if (!digits || !when) return '';
  return `${digits}|${when}`;
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

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
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
    }, 8000);
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
  try {
    return await fetchJson(url);
  } catch {
    return fetchJsonp(url);
  }
}

export async function postResolution(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (res.type === 'opaque') return;
  if (!res.ok) throw new Error(`Could not save the resolution (${res.status}).`);
  const text = await res.text();
  if (!text) return;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return;
  }
  if (data && data.ok === false) throw new Error(data.error || 'Could not save the resolution.');
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
      id = packId(data);
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
          await postResolution(endpoint, {
            pack_id: id,
            row_key: item.row_key,
            resolved: true,
            note: item.note,
            resolved_by: item.resolved_by,
          });
        } catch {
          /* optimistic until the next poll confirms or expires */
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
          await postResolution(endpoint, {
            pack_id: id,
            row_key: rowKeyValue,
            resolved: false,
            note: item.note,
            resolved_by: item.resolved_by,
          });
        } catch {
          /* poll will restore the row if the undo never landed */
        }
        return;
      }
      rememberLocal();
    },
  };
}
