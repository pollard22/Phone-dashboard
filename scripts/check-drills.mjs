import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parsePack } from '../src/data.js';
import { buildDrill, dialedOtherRows } from '../src/drills.js';

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

for (const id of [
  'in-bound',
  'in-answered',
  'outbound',
  'out-answered',
  'out-na',
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

console.log('drill counts match the export');
