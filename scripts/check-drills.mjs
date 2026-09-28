import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parsePack } from '../src/data.js';
import { buildDrill, dialedOtherRows } from '../src/drills.js';
import {
  NOT_IN_EXPORT,
  callbackFields,
  exportYear,
  indexActionByCaller,
  missedFields,
  neverFields,
  openLoopFields,
  splitWhen,
} from '../src/callFields.js';

const read = (name) => readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8');
const pack = parsePack({
  jsonText: read('latest.json'),
  aText: read('Missed_ownership_A_no_callback.csv'),
  bText: read('Missed_ownership_B_called_back.csv'),
  olText: read('open_loops_super.csv'),
  cbText: read('callback_hygiene_ultatel.csv'),
  exText: read('exclusions_method.csv'),
});

const k = pack.data.kpis;
assert.equal(pack.missedA.length, 347);
assert.equal(pack.missedB.length, 100);
assert.equal(pack.callbackAction.length, k.no_callback_24h_unique);
assert.equal(pack.callbackNever.length, k.never_company_dialed);
assert.equal(pack.openLoops.length, k.super_open_loops);
assert.equal(dialedOtherRows(pack).length, k.dialed_earlier_only + k.dialed_later_after_24h);

function expectRows(id, n) {
  const spec = buildDrill(id, pack);
  assert.ok(spec, id);
  assert.equal(spec.unavailable, undefined);
  assert.equal(spec.rows.length, n, id);
  if (spec.warnMismatch !== false) assert.equal(Number(spec.headline), spec.rows.length, id);
}

function expectUnavailable(id) {
  const spec = buildDrill(id, pack);
  assert.ok(spec, id);
  assert.equal(spec.unavailable, true, id);
  assert.ok(!spec.rows || spec.table === 'exclusion', `${id} should not invent call rows`);
  assert.match(spec.reason, /not in this export/i, id);
}

expectRows('no-callback', 141);
expectRows('never-dialed', 98);
expectRows('cleaned-na', 447);
expectRows('open-loops', 15);
expectRows('open-overlap', 7);
expectRows('open-super-only', 8);
expectRows('dialed-other', 43);

const raw = buildDrill('in-no-answer', pack);
assert.equal(raw.rows.length, 447);
assert.equal(raw.warnMismatch, false);
assert.equal(Number(raw.headline), 472);

for (const id of ['outbound', 'out-answered', 'out-na']) {
  assert.equal(buildDrill(id, pack), null, id);
}

for (const id of [
  'in-bound',
  'in-answered',
  'dialed-earlier',
  'dialed-later',
  'super-inbound',
  'super-transferred',
  'super-help',
  'super-talk',
  'super-avg',
  'super-actions',
  'super-sms',
  'super-activity',
]) {
  expectUnavailable(id);
}

const self = buildDrill('self-events', pack, { selfNumber: '(314) 665-2265' });
assert.equal(self.unavailable, true);
assert.equal(self.rows.length, 1);
assert.equal(Number(self.headline), 25);
assert.match(self.reason, /not in this export/i);

const ext = {};
for (const row of [...pack.missedA, ...pack.missedB]) {
  const key = row['Who should have taken it'];
  ext[key] = (ext[key] || 0) + 1;
}
assert.deepEqual(ext, pack.data.miss_by_extension);

const year = exportYear(pack.data.meta.window_label);
assert.equal(year, 2026);
const byCaller = indexActionByCaller(pack.callbackAction);

const firstMiss = missedFields(pack.missedA[0]);
assert.deepEqual(firstMiss, {
  caller: '(618) 823-2480',
  who: '76001 — 76001',
  date: 'Sat, Sep 26, 2026',
  time: '6:17 PM',
  yearInferred: false,
});

for (const row of [...pack.missedA, ...pack.missedB]) {
  const fields = missedFields(row);
  assert.ok(fields.caller.startsWith('('), row.Caller);
  assert.notEqual(fields.who, NOT_IN_EXPORT, row.Caller);
  assert.equal(fields.who, row['Who should have taken it']);
  assert.match(fields.date, /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, 2026$/, row['Miss datetime (PT)']);
  assert.match(fields.time, /^\d{1,2}:\d{2} [AP]M$/, row['Miss datetime (PT)']);
  assert.equal(fields.yearInferred, false);
  const parsed = splitWhen(row['Miss datetime (PT)']);
  const iso = row['Miss datetime (PT)'].match(/^(\d{4})-(\d{2})-(\d{2})/);
  const utc = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][utc.getUTCDay()];
  assert.equal(parsed.date.slice(0, 3), weekday, row['Miss datetime (PT)']);
}

const firstCallback = callbackFields(pack.callbackAction[0], year);
assert.deepEqual(firstCallback, {
  caller: '(636) 875-9696',
  who: '110 — Mara Pongayan Priagas',
  date: 'Fri, Sep 25, 2026',
  time: '12:10 PM',
  yearInferred: true,
});

for (const row of pack.callbackAction) {
  const fields = callbackFields(row, year);
  assert.equal(fields.who, row['Last extension tried'], row.Caller);
  assert.notEqual(fields.who, NOT_IN_EXPORT, row.Caller);
  assert.equal(fields.date.slice(0, 3), row['Last miss (PT)'].slice(0, 3), row.Caller);
  assert.equal(fields.yearInferred, true);
  assert.match(fields.date, /, 2026$/);
}

for (const row of pack.callbackNever) {
  const fields = neverFields(row, byCaller, year);
  assert.equal(fields.who, byCaller.get(row.Caller)['Last extension tried'], row.Caller);
  assert.equal(fields.date.slice(0, 3), row['Last miss (PT)'].slice(0, 3), row.Caller);
  assert.notEqual(fields.time, NOT_IN_EXPORT, row.Caller);
}

for (const row of dialedOtherRows(pack)) {
  const fields = callbackFields(row, year);
  assert.notEqual(fields.who, NOT_IN_EXPORT, row.Caller);
  assert.equal(fields.yearInferred, true);
}

const loopFields = pack.openLoops.map((row) => openLoopFields(row, byCaller, year));
const superOnly = loopFields.filter((fields) => fields.who === NOT_IN_EXPORT);
const overlap = loopFields.filter((fields) => fields.who !== NOT_IN_EXPORT);
assert.equal(superOnly.length, 8);
assert.equal(overlap.length, 7);
for (const fields of superOnly) {
  assert.equal(fields.date, NOT_IN_EXPORT);
  assert.equal(fields.time, NOT_IN_EXPORT);
  assert.equal(fields.yearInferred, false);
  assert.ok(fields.caller.startsWith('('));
}
for (const fields of overlap) {
  assert.notEqual(fields.date, NOT_IN_EXPORT);
  assert.notEqual(fields.time, NOT_IN_EXPORT);
  assert.equal(fields.yearInferred, true);
}

const jacob = openLoopFields(
  pack.openLoops.find((row) => row.Caller === '(636) 875-9696'),
  byCaller,
  year
);
assert.deepEqual(jacob, {
  caller: '(636) 875-9696',
  who: '110 — Mara Pongayan Priagas',
  date: 'Fri, Sep 25, 2026',
  time: '12:10 PM',
  yearInferred: true,
});

assert.equal(splitWhen('Thu Sep 24 8:30 AM', year).date, 'Thu, Sep 24, 2026');
assert.equal(splitWhen('Thu Sep 24 8:30 AM', year).time, '8:30 AM');
assert.equal(splitWhen('—', year).date, NOT_IN_EXPORT);

console.log('drill counts match the export');
