// Regression test (ChatGPT delta 13/11 16:30): prTable must be one atomic snapshot.
// Run: node tests/pr-table-consistency.mjs  (exit 1 on failure)
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('../status.json', import.meta.url), 'utf8'));
const t = d.hourly?.summary?.prTable;
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
ok(t && Array.isArray(t.items), 'prTable.items missing');
const ts = (s) => Date.parse(s);
ok(ts(t.checkedAt) <= ts(d.asOf), `prTable.checkedAt ${t.checkedAt} is later than asOf ${d.asOf}`);
ok(ts(d.asOf) <= ts(d.detailUpdatedAt) + 1000, `detailUpdatedAt ${d.detailUpdatedAt} is older than asOf ${d.asOf}`);
const keys = t.items.map((x) => `${x.repo}#${x.pr}`);
ok(new Set(keys).size === keys.length, 'duplicate repo#pr in prTable.items');
const merged = t.items.filter((x) => x.state === 'MERGED');
const open = t.items.filter((x) => x.state === 'OPEN');
ok(merged.length + open.length === t.items.length, 'item with state other than MERGED/OPEN');
const m = /^(\d+) PR .*đã merge.*; (\d+) PR .*đang mở.*?: (.*)$/.exec(t.summary || '');
ok(!!m, 'summary does not match the expected sentence shape');
if (m) {
  ok(Number(m[1]) === merged.length, `summary says ${m[1]} merged, items have ${merged.length}`);
  ok(Number(m[2]) === open.length, `summary says ${m[2]} open, items have ${open.length}`);
  const listed = [...m[3].matchAll(/(BE|FE) #(\d+)/g)].map((x) => `${x[1] === 'BE' ? 'xweb01' : 'Xweb01fe'}#${x[2]}`).sort();
  const real = open.map((x) => `${x.repo}#${x.pr}`).sort();
  ok(JSON.stringify(listed) === JSON.stringify(real), `summary open list ${listed} != items ${real}`);
}
for (const x of merged) ok(x.mergedAt && x.mergeCommit, `${x.repo}#${x.pr} merged without mergedAt/mergeCommit`);
for (const x of open) ok(!x.mergedAt && !x.mergeCommit, `${x.repo}#${x.pr} open with merge data`);
for (const x of t.items) ok(x.label === 'status:done' ? x.state === 'MERGED' : x.state === 'OPEN', `${x.repo}#${x.pr} label ${x.label} vs state ${x.state}`);
console.log(fails.length ? 'FAIL\n' + fails.join('\n') : `PASS ${t.items.length} items, ${merged.length} merged, ${open.length} open`);
process.exit(fails.length ? 1 : 0);
