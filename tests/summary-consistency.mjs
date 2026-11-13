// Regression test (ChatGPT delta 13/11 20:13): hourly.summary sections must come from the SAME snapshot as prTable.
// Run: node tests/summary-consistency.mjs (exit 1 on failure)
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('../status.json', import.meta.url), 'utf8'));
const s = d.hourly?.summary; const t = s?.prTable; const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const ts = (x) => Date.parse(x);
ok(ts(s.checkedAt) <= ts(d.asOf) + 1000, `summary.checkedAt ${s.checkedAt} later than asOf ${d.asOf}`);
ok(Math.abs(ts(s.checkedAt) - ts(t.checkedAt)) <= 120000, `summary.checkedAt ${s.checkedAt} and prTable.checkedAt ${t.checkedAt} are not the same snapshot (>2 min apart)`);
const open = new Set(t.items.filter((x) => x.state === 'OPEN').map((x) => `${x.repo === 'xweb01' ? 'BE' : 'FE'} #${x.pr}`));
const merged = new Set(t.items.filter((x) => x.state === 'MERGED').map((x) => `${x.repo === 'xweb01' ? 'BE' : 'FE'} #${x.pr}`));
const line = (s.blockers || []).find((b) => /^PR đang mở chưa merge:/.test(b));
ok(!!line, 'blockers has no "PR đang mở chưa merge:" line');
if (line) {
  const head = line.split(';')[0];
  const listed = new Set([...head.matchAll(/(BE|FE) #(\d+)/g)].map((m) => `${m[1]} #${m[2]}`));
  for (const x of listed) ok(open.has(x), `blockers lists ${x} as open but prTable says it is not OPEN`);
  for (const x of open) ok(listed.has(x), `prTable has ${x} OPEN but blockers does not list it`);
}
for (const b of s.blockers || []) for (const m of b.matchAll(/(?:^|[^A-Za-z])(BE|FE) #(\d+)[^;]*?\b(OPEN|chưa có mã)\b/g)) ok(!merged.has(`${m[1]} #${m[2]}`), `blockers calls merged ${m[1]} #${m[2]} open/no-code`);
ok(!/#27[78]\/#27[78]|NO-37[^;]*CHƯA có mã/.test(JSON.stringify(s.blockers)), 'blockers still carries the stale NO-37 "no code" text');
ok(typeof s.uiux?.staleNote === 'string' || ts(s.uiux?.checkedAt) >= ts(d.asOf) - 3600000, 'uiux is older than 1 h and has no staleNote');
console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'PASS summary consistent with prTable'); process.exit(fails.length ? 1 : 0);
