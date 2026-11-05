import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { renderPage } from '../src/render.js';
import {
  displayGroupEntries,
  filterRows,
  groupLabel,
  mentionsCallbackWindow,
  sinceMiss,
  superCallView,
} from '../src/format.js';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const data = JSON.parse(read('public/data/latest.json'));
const summary = data.summary;

assert.equal(summary.window_label, 'Oct 29–Nov 4, 2026 (Central Time)');
assert.equal(summary.total_calls, 420);
assert.equal(summary.answered_calls, 370);
assert.equal(summary.answered_by_super + summary.answered_by_staff, 370);
assert.equal(summary.unanswered_callers, 62);
assert.equal(summary.called_back, 26);
assert.equal(summary.not_called_back, 36);
assert.equal(data.not_called_back.length, 36);
assert.equal(data.called_back.length, 26);
assert.equal(
  Object.values(data.not_called_back_by_group).reduce((sum, n) => sum + n, 0),
  36
);
assert.equal(
  Object.values(summary.not_called_back_by_missed_type).reduce((sum, n) => sum + n, 0),
  36
);
assert.equal(groupLabel('Leasing'), 'Leasing');
assert.equal(groupLabel('Maintenance or Renewals (Tiffany 100)'), 'Tiffany');
assert.equal(groupLabel('Tiffany 100'), 'Tiffany');
assert.equal(groupLabel('Maintenance + Maintenance or Renewals (Tiffany 100)'), 'Maintenance');
assert.equal(groupLabel('Maintenance + Tiffany 100'), 'Maintenance');
assert.equal(groupLabel('Mel 104 then Tiffany 100'), 'Maintenance');
assert.equal(groupLabel('Junior + Leasing'), 'Junior');
assert.equal(groupLabel('Direct line — Junior Ruiz (112) + Leasing'), 'Junior');
assert.equal(groupLabel('Emergency line'), 'Emergency line');
assert.equal(groupLabel('Renewals & Current Resident Issues'), 'Renewals');
assert.equal(groupLabel('Direct line — Rania Lombera (107)'), 'Rania');
assert.equal(groupLabel('Direct line — Junior Ruiz (112)'), 'Junior');
assert.equal(groupLabel('Direct line — Mercedes Recio (108)'), 'Renewals');
assert.equal(groupLabel('Applications (106)'), 'Applications');
assert.equal(groupLabel('Main line (Super AI receptionist)'), 'Main line');
assert.equal(groupLabel('Direct line — Alex Example (200)'), 'Alex');
for (const label of ['Leasing', 'Tiffany', 'Maintenance', 'Renewals', 'Applications', 'Main line', 'Rania', 'Junior', 'Alex']) {
  assert.equal(/\d/.test(label), false, label);
}
const shownGroups = displayGroupEntries(data.not_called_back_by_group);
assert.deepEqual(Object.fromEntries(shownGroups), {
  Leasing: 22,
  Tiffany: 5,
  'Main line': 4,
  Maintenance: 2,
  'Emergency line': 1,
  Junior: 1,
  Rania: 1,
});
assert.equal(shownGroups.reduce((sum, [, n]) => sum + n, 0), 36);
for (const [group, count] of shownGroups) {
  assert.equal(filterRows(data.not_called_back, group).length, count, group);
}
for (const [type, count] of Object.entries(summary.not_called_back_by_missed_type)) {
  assert.equal(filterRows(data.not_called_back, '', type).length, count, type);
}
assert.equal(filterRows(data.not_called_back, 'Leasing', 'Went to voicemail').length > 0, true);

for (const row of data.not_called_back) {
  assert.equal(mentionsCallbackWindow(sinceMiss(row)), false, row.phone);
}

const html = renderPage(data, { list: 'missed', group: '', type: '' });
assert.match(html, /Oct 29–Nov 4, 2026 \(Central Time\)/);
assert.match(html, /Calls received[\s\S]*?>420</);
assert.match(html, /Calls answered[\s\S]*?>370</);
assert.match(html, /Super 353 · Staff 17/);
assert.match(html, /Voicemail is not counted as answered/);
assert.match(html, /Callers not answered[\s\S]*?>62</);
assert.match(html, /People, not calls/);
assert.match(html, /Called back[\s\S]*?>26</);
assert.match(html, /Not called back yet[\s\S]*?>36</);
assert.match(html, /People, not calls/);
assert.doesNotMatch(html, /never called/i);
assert.doesNotMatch(html, /incl\. 75 callers whose transfer from Super went unanswered/);
assert.doesNotMatch(html, /class="reconcile"/);
assert.match(html, /Super transfer not answered[\s\S]*?<strong>23<\/strong>/);
assert.match(html, /Went to voicemail[\s\S]*?<strong>8<\/strong>/);
assert.match(html, /Rang, not answered[\s\S]*?<strong>5<\/strong>/);
assert.match(html, /What happened/);
assert.match(html, /Tiffany <strong>5<\/strong>/);
assert.match(html, /Main line <strong>4<\/strong>/);
assert.match(html, /Maintenance <strong>2<\/strong>/);
assert.match(html, /Rania <strong>1<\/strong>/);
assert.match(html, /Junior <strong>1<\/strong>/);
assert.match(html, /Emergency line <strong>1<\/strong>/);
assert.match(html, /Leasing <strong>22<\/strong>/);
assert.doesNotMatch(html, /Tiffany 100|Rania Lombera|Junior Ruiz|Super AI receptionist/);
assert.match(html, /Super call links open in Super and need you to be signed in\./);
assert.equal((html.match(/class="super-link"/g) || []).length, 17);
assert.equal((html.match(/View call ↗/g) || []).length, 17);
assert.match(html, /target="_blank" rel="noopener noreferrer"/);
assert.match(html, /Removing name from lease/);
assert.equal((html.match(/Direct line — no Super call/g) || []).length, 2);
assert.equal((html.match(/class="super-link-note"/g) || []).length, 3);
assert.equal(superCallView({ super_link: 'javascript:alert(1)', super_link_status: 'linked' }).kind, 'empty');
assert.match(html, /\(573\) 908-9202/);
assert.doesNotMatch(html, /Super transfers nobody picked up/);
assert.doesNotMatch(html, /couldn't be tied to a caller/);
assert.equal(mentionsCallbackWindow(html), false);
assert.doesNotMatch(html, /Open loops|Ultatel stale|Cleaned|IN no answer|Needs human help|AI talk time/i);
assert.equal((html.match(/<tr>/g) || []).length, 37);
assert.match(html, />6d 11h</);

const leasing = renderPage(data, { list: 'missed', group: 'Leasing', type: '' });
assert.match(leasing, />22 callers</);
assert.equal((leasing.match(/<tr>/g) || []).length, 23);

const typed = renderPage(data, { list: 'missed', group: '', type: 'Went to voicemail' });
assert.equal((typed.match(/<tr>/g) || []).length, 9);

const calledHtml = renderPage(data, { list: 'called', group: '', type: '' });
assert.match(calledHtml, /\(636\) 384-9797/);
assert.match(calledHtml, /Wed Nov 4, 2026 3:25 PM CT/);
assert.match(calledHtml, /<th scope="col">Called back<\/th>/);
assert.equal((calledHtml.match(/<tr>/g) || []).length, 27);
assert.equal(mentionsCallbackWindow(calledHtml), false);

const evil = structuredClone(data);
evil.not_called_back[0].caller_name = '<img src=x onerror=alert(1)>';
const escaped = renderPage(evil, {});
assert.equal(escaped.includes('<img'), false);
assert.match(escaped, /&lt;img src=x onerror=alert\(1\)&gt;/);

for (const file of ['src/main.js', 'src/render.js', 'src/format.js', 'src/style.css']) {
  const source = read(file);
  assert.doesNotMatch(source, /chart\.js|super_open_loops|ultatel_inbound|miss_by_extension|stale-note/);
}

assert.ok(read('public/data/called_back.csv').length > 0);
assert.ok(read('public/data/transfer_failed.csv').length > 0);

console.log('owner page matches the Nov 5 pack');
