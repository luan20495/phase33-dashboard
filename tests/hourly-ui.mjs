// Automated UI check for the "Việc chạy mỗi giờ" tab (#hourly).
// Run:  node tests/hourly-ui.mjs            (needs Playwright, see below)
// Env:  PW_MODULE=<path to playwright or playwright-core>   SHOTS=<dir for screenshots>   AXE=<path to axe.min.js, optional>
// It serves index.html from this repo on 127.0.0.1 and replaces status.json with tests/fixtures/status.process.json
// plus the `hourly` object of tests/fixtures/hourly.json (the real status.json is never read or written).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, {recursive: true});

function loadPlaywright() {
  const cands = [process.env.PW_MODULE, 'playwright', 'playwright-core'];
  try { cands.push(path.join(execSync('npm root -g', {encoding: 'utf8'}).trim(), '@playwright/cli/node_modules/playwright-core')); } catch {}
  for (const c of cands.filter(Boolean)) { try { return require(c); } catch {} }
  throw new Error('Playwright not found: set PW_MODULE=<path to playwright-core>');
}
const {chromium} = loadPlaywright();
const base = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/status.process.json'), 'utf8'));
const HR = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/hourly.json'), 'utf8'));
const withHourly = JSON.stringify(Object.assign({}, base, {hourly: HR}));
const withoutHourly = JSON.stringify(base);
let current = withHourly;
let axeSrc = '';
try { axeSrc = fs.readFileSync(process.env.AXE || require.resolve('axe-core/axe.min.js'), 'utf8'); } catch {}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/status.json') { res.writeHead(200, {'content-type': 'application/json'}); return res.end(current); }
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'});
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let browser;
try { browser = await chromium.launch({channel: 'chrome'}); } catch { browser = await chromium.launch(); }

const results = [];
const consoleErrors = [];
async function T(name, fn) {
  try { const r = await fn(); results.push([name, r === 'NOT_RUN' ? 'NOT_RUN' : 'PASS', typeof r === 'string' && r !== 'NOT_RUN' ? r : '']); }
  catch (e) { results.push([name, 'FAIL', String(e.message || e).split('\n')[0].slice(0, 260)]); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ? m + ': ' : 'eq: ') + 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };

async function open({w = 1280, h = 900, theme = 'light', scheme = 'light', seed = null, noStorageWrite = false, clipFail = false, hash = '#hourly'} = {}) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}, colorScheme: scheme, deviceScaleFactor: 1});
  await ctx.addInitScript(([theme, seed, noStorageWrite, clipFail]) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        if (theme) localStorage.setItem('xweb-theme', theme);
        if (seed) localStorage.setItem('xw-hr:', JSON.stringify(seed));
      }
    } catch {}
    window.__opened = []; window.__clip = [];
    window.open = (...a) => { window.__opened.push(a[0]); return null; };
    try { Object.defineProperty(navigator, 'clipboard', {value: {writeText: async t => { if (clipFail) throw new Error('denied'); window.__clip.push(t); }}, configurable: true}); } catch {}
    if (noStorageWrite) { Storage.prototype.setItem = function (k) { if (/^xw-hr/.test(k)) throw new Error('quota'); }; }
  }, [theme, seed, noStorageWrite, clipFail]);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url + m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + hash);
  await page.waitForSelector('#hourlyBody > *', {state: 'attached'});
  page._ctx = ctx;
  return page;
}
const card = (p, id) => p.locator(`[data-hr="${id}"]`);
const sw = (p, id) => card(p, id).locator('[role=switch]');
const msg = p => p.locator('#hrMsg').inputValue();
const pend = async p => (await p.locator('#hrBarInfo').innerText());
const HEAD = /^## \[OWNER\] \d\d:\d\d ICT \d\d\/\d\d: cập nhật việc chạy hằng giờ$/;
const lines = async p => { const m = await msg(p); const l = m.split('\n'); ok(HEAD.test(l[0]), 'header: ' + l[0]); return l.slice(1); };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name + '.png'), fullPage: true}); };
async function addTask(p, title, detail = '') {
  await p.locator('#hrNewTitle').fill(title); await p.locator('#hrNewDetail').fill(detail); await p.locator('#hrAdd').click();
}

// ----------------------------------------------------------------------------------------------
const lm = await open();
await T('01 tab present in the tab bar (vi), route #hourly selects it, panel is a tabpanel; English twin name', async () => {
  const info = await lm.evaluate(() => ({
    tabs: [...document.querySelectorAll('#mainTabs [role=tab]')].map(t => t.querySelector('.board-tab-name').textContent),
    sel: document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab,
    panel: document.getElementById('view-hourly').getAttribute('role'), ctl: document.getElementById('tab-hourly').getAttribute('aria-controls'),
    hidden: ['roadmap', 'process', 'limits', 'prod', 'owner'].map(v => document.getElementById('view-' + v).hidden),
  }));
  ok(info.tabs.includes('Việc chạy mỗi giờ'), JSON.stringify(info.tabs)); eq(info.sel, 'hourly'); eq(info.panel, 'tabpanel'); eq(info.ctl, 'view-hourly');
  eq(info.hidden, [true, true, true, true, true]);
  eq(info.tabs.indexOf('Việc chạy mỗi giờ'), info.tabs.indexOf('Giới hạn AI Studio') + 1, 'hourly follows the limits tab');
  await lm.locator('#lang').click();
  eq(await lm.locator('#tab-hourly .board-tab-name').innerText(), 'Hourly tasks');
  await lm.locator('#lang').click();
});
await T('02 one card per task; title, detail, switch (role/aria-checked/name), last-run time + chip', async () => {
  eq(await lm.locator('.hr-card').count(), HR.tasks.length);
  for (const t of HR.tasks) {
    const c = card(lm, t.id), s = sw(lm, t.id);
    eq(await s.getAttribute('aria-checked'), String(t.enabled), t.id);
    const name = await s.evaluate(e => e.getAttribute('aria-labelledby').split(' ').map(i => document.getElementById(i).textContent).join(' '));
    ok(name.includes(t.title) && /BẬT|TẮT/.test(name), 'accessible name: ' + name);
    ok((await c.locator('.hr-title').innerText()) === t.title, 'title ' + t.id);
    if (t.detail) ok((await c.locator('.hr-detail').innerText()) === t.detail, 'detail ' + t.id);
  }
  const last = card(lm, 'H4').locator('.hr-last');
  const txt = await last.innerText(); ok(/Lần chạy gần nhất:/.test(txt) && /10:00/.test(txt) && /OK/.test(txt) && /Không có gì mới/.test(txt), txt);
  ok(await last.locator('time').getAttribute('datetime') === '2026-11-12T03:00:00.000Z', 'datetime');
});
await T('03 result chips: 4 results distinct by icon + text + colour (not colour only), legend lists all 4', async () => {
  await lm.locator('#hrToggleAll').click();
  const chips = await lm.locator('[data-hr="H1"] .hr-run .hr-chip').evaluateAll(l => l.map(c => ({r: c.dataset.r, ic: c.querySelector('.hr-ci').textContent, ia: c.querySelector('.hr-ci').getAttribute('aria-hidden'), t: c.lastChild.textContent, bg: getComputedStyle(c).backgroundColor})));
  const by = Object.fromEntries(chips.map(c => [c.r, c]));
  eq(Object.keys(by).sort(), ['changed', 'failed', 'ok', 'skipped']);
  eq(new Set(Object.values(by).map(c => c.ic)).size, 4, 'icons'); eq(new Set(Object.values(by).map(c => c.t)).size, 4, 'texts'); eq(new Set(Object.values(by).map(c => c.bg)).size, 4, 'bg');
  ok(chips.every(c => c.ia === 'true'), 'icon aria-hidden');
  eq(['ok', 'changed', 'skipped', 'failed'].map(k => by[k].t), ['OK', 'Có thay đổi', 'Bỏ qua', 'Lỗi']);
  eq(await lm.locator('.hr-legend .hr-chip').count(), 4); ok(await lm.locator('.hr-legend').isVisible(), 'legend visible');
});
await T('04 max-10: task with 12 runs shows exactly 10, newest first, oldest 2 dropped, "older not shown" note', async () => {
  const rows = await lm.locator('[data-hr="H1"] .hr-run .hr-sum').allInnerTexts();
  eq(rows.length, 10); eq(rows[0], 'Run 12'); eq(rows[9], 'Run 3'); ok(!rows.includes('Run 1') && !rows.includes('Run 2'), 'oldest shown');
  const sm = await lm.locator('[data-hr="H1"] .hr-runs > summary').innerText(); ok(/10\/10/.test(sm) && /còn 2 lần cũ hơn/.test(sm), sm);
  eq(await lm.locator('[data-hr="H5"] .hr-run .hr-sum').allInnerTexts(), ['Ok three', 'Failed two', 'Skipped one'], '3 runs newest first');
});
await T('05 empty runs: "chưa có lần chạy" in last-run line and in the history, no list items', async () => {
  const c = card(lm, 'H2');
  ok(/chưa có lần chạy/.test(await c.locator('.hr-last').innerText()), 'last line');
  ok(/chưa có lần chạy/.test(await c.locator('.hr-runs').innerText()), 'runs');
  eq(await c.locator('.hr-run').count(), 0);
});
await T('06 escaping: markup in title/detail/summary/note is shown as text, nothing executes, no injected elements', async () => {
  ok(await lm.evaluate(() => window.__xss === undefined), 'xss ran');
  const c = card(lm, 'H3');
  eq(await c.locator('img,script,b').count(), 0, 'injected tags');
  ok((await c.locator('.hr-title').innerText()).startsWith('<img src=x onerror='), 'title as text');
  ok((await c.locator('.hr-detail').innerText()).includes('<script>'), 'detail as text');
  ok((await c.locator('.hr-last').innerText()).includes('<b>not bold</b>'), 'summary as text');
  eq(await lm.locator('#hourlyBody .hr-datanote b').count(), 0); ok((await lm.locator('.hr-datanote').innerText()).includes('<b>bold?</b>'), 'note as text');
});
await T('07 honest notice, data updated time (ICT) and counts shown', async () => {
  eq(await lm.locator('.hr-notice').innerText(), 'Công tắc có hiệu lực sau khi anh gửi tin nhắn lên #88 và C0 áp dụng ở lần chạy kế tiếp (C0 đọc danh sách này trước mỗi lần chạy).');
  const u = await lm.locator('#hrUpdated').innerText(); ok(/13:30/.test(u) && /12\/11\/2026/.test(u) && /ICT/.test(u), u);
  ok(/5 việc · 3 đang BẬT/.test(await lm.locator('.hr-meta').innerText()), 'counts');
  ok(/Dữ liệu cập nhật: .*13:30/.test(await card(lm, 'H4').locator('.hr-foot').innerText()), 'per-card updated');
  ok(/Fixture history entry/.test(await lm.locator('.hr-hist').textContent()), 'history');
});
await T('08 initially nothing pending: preview empty, send/copy/undo disabled, no tab badge', async () => {
  ok(/Chưa có thay đổi nào chờ gửi/.test(await pend(lm)));
  ok(/Chưa có thay đổi/.test(await msg(lm)));
  for (const id of ['hrSend', 'hrCopy', 'hrUndoAll']) ok(await lm.locator('#' + id).isDisabled(), id);
  ok(!(await lm.locator('#hourlyTabCount').isVisible()), 'badge');
});
await T('09 flip a switch: aria-checked flips, "chờ gửi" chip, pending count, message line, tab badge', async () => {
  await sw(lm, 'H1').click();
  eq(await sw(lm, 'H1').getAttribute('aria-checked'), 'false');
  ok(/chờ gửi: TẮT/.test(await card(lm, 'H1').locator('.hr-pend').innerText()), 'chip');
  ok(/Chờ gửi: 1 thay đổi/.test(await pend(lm)));
  eq(await lines(lm), ['- H1: TẮT']);
  eq(await lm.locator('#hourlyTabCount').innerText(), '1');
  ok(/1 thay đổi chờ gửi/.test(await lm.locator('#tab-hourly').getAttribute('aria-label')));
});
await T('10 flip twice back to original -> no line, pending 0, controls disabled again', async () => {
  await sw(lm, 'H1').click();
  eq(await sw(lm, 'H1').getAttribute('aria-checked'), 'true');
  ok(/Chưa có thay đổi nào/.test(await pend(lm))); ok(/Chưa có thay đổi/.test(await msg(lm)));
  ok(await lm.locator('#hrSend').isDisabled(), 'send'); ok(!(await lm.locator('#hourlyTabCount').isVisible()), 'badge');
  eq(await lm.evaluate(() => JSON.parse(localStorage.getItem('xw-hr:')).sw), {}, 'no stale entry');
});
await T('11 flip OFF->ON and ON->OFF produce BẬT / TẮT; keyboard Space and Enter toggle the switch', async () => {
  await sw(lm, 'H2').focus(); await lm.keyboard.press('Space');
  ok(await lm.evaluate(() => document.activeElement.dataset.hrSw === 'H2'), 'focus kept after re-render');
  await lm.keyboard.press('Enter');
  eq(await sw(lm, 'H2').getAttribute('aria-checked'), 'false', 'Space then Enter = back to original');
  await lm.keyboard.press('Space');
  eq(await lines(lm), ['- H2: BẬT']);
  await sw(lm, 'H3').click();
  eq(await lines(lm), ['- H2: BẬT', '- H3: TẮT']);
  eq(await lm.evaluate(() => document.getElementById('hrBarInfo').textContent.includes('2')), true);
});
await T('12 per-card undo and "Hoàn tác tất cả" clear staged switches', async () => {
  await card(lm, 'H2').locator('.hr-pend .hr-link').click();
  eq(await lines(lm), ['- H3: TẮT']); eq(await sw(lm, 'H2').getAttribute('aria-checked'), 'false');
  await lm.locator('#hrUndoAll').click();
  ok(/Chưa có thay đổi/.test(await msg(lm))); eq(await sw(lm, 'H3').getAttribute('aria-checked'), 'true');
});
await T('13 add task: appears as "mới, chờ C0 gán mã" (no id), message "- THÊM: title | detail", whitespace collapsed, form reset', async () => {
  await addTask(lm, '  Việc   mới  thử ', 'Chi tiết\n  nhiều   dòng');
  const c = lm.locator('[data-hr-new]'); eq(await c.count(), 1);
  ok(/mới, chờ C0 gán mã/.test(await c.innerText()), 'badge'); eq(await c.locator('.hr-id').innerText(), '—');
  eq(await lines(lm), ['- THÊM: Việc mới thử | Chi tiết nhiều dòng']);
  eq(await lm.locator('#hrNewTitle').inputValue(), ''); ok(/Đã thêm/.test(await lm.locator('#hrAddOk').innerText()), 'ok msg');
  ok(await lm.evaluate(() => document.activeElement.id === 'hrNewTitle'), 'focus back to title');
  eq(await lm.locator('#hourlyTabCount').innerText(), '1');
});
await T('14 add validation: empty, >120, detail >400, "|" in title, duplicate title; nothing staged; empty detail allowed', async () => {
  const err = () => lm.locator('#hrErr').innerText();
  await addTask(lm, '   ', 'x'); ok(/Cần nhập tên việc/.test(await err()), await err());
  await lm.locator('#hrNewTitle').evaluate(e => { e.removeAttribute('maxlength'); e.value = 'a'.repeat(121); }); await lm.locator('#hrAdd').click(); ok(/tối đa 120/.test(await err()), await err());
  await lm.locator('#hrNewTitle').evaluate(e => { e.value = 'a'.repeat(120); });
  await lm.locator('#hrNewDetail').evaluate(e => { e.removeAttribute('maxlength'); e.value = 'd'.repeat(401); }); await lm.locator('#hrAdd').click(); ok(/tối đa 400/.test(await err()), await err());
  await lm.locator('#hrNewTitle').evaluate(e => { e.value = 'a | b'; }); await lm.locator('#hrNewDetail').fill(''); await lm.locator('#hrAdd').click(); ok(/\|/.test(await err()), await err());
  await lm.locator('#hrNewTitle').fill('task WITH twelve RUNS'); await lm.locator('#hrAdd').click(); ok(/cùng tên/.test(await err()), 'dup of existing: ' + await err());
  await lm.locator('#hrNewTitle').fill('  việc   mới thử'); await lm.locator('#hrAdd').click(); ok(/cùng tên/.test(await err()), 'dup of staged: ' + await err());
  eq((await lines(lm)).length, 1, 'still only the first add');
  ok(await lm.locator('#hrNewTitle').getAttribute('aria-invalid') === 'true', 'aria-invalid');
  await lm.locator('#hrNewTitle').fill('a'.repeat(120)); await lm.locator('#hrAdd').click();
  eq((await lines(lm))[1], '- THÊM: ' + 'a'.repeat(120) + ' |', 'max title, empty detail');
  await lm.locator('#hrUndoAll').click();
});
await T('15 add: "Bỏ việc này" removes a staged new task', async () => {
  await addTask(lm, 'Tạm thời', 'x'); await lm.locator('[data-hr-new] .hr-link').click();
  eq(await lm.locator('[data-hr-new]').count(), 0); ok(/Chưa có thay đổi/.test(await msg(lm)));
});
await T('16 delete: confirm step (nothing staged until confirmed), Cancel, Esc, confirm -> "- XÓA: id", switch disabled, undo', async () => {
  await lm.locator('[data-hrf="del:H2"]').click();
  const cf = card(lm, 'H2').locator('.hr-confirm'); ok(await cf.isVisible(), 'confirm shown');
  ok(/Xóa việc H2/.test(await cf.innerText()), 'text'); ok(/Chưa có thay đổi/.test(await msg(lm)), 'nothing staged yet');
  ok(await lm.evaluate(() => document.activeElement.dataset.hrf === 'cancel:H2'), 'focus on safe Cancel');
  await lm.keyboard.press('Escape'); eq(await cf.count(), 0, 'Esc closes');
  await lm.locator('[data-hrf="del:H2"]').click(); await lm.locator('[data-hrf="cancel:H2"]').click(); eq(await cf.count(), 0, 'cancel');
  ok(/Chưa có thay đổi/.test(await msg(lm)));
  await lm.locator('[data-hrf="del:H2"]').click(); await lm.locator('[data-hrf="yes:H2"]').click();
  eq(await lines(lm), ['- XÓA: H2']);
  eq(await sw(lm, 'H2').getAttribute('aria-disabled'), 'true'); ok(/Chờ xóa|chờ gửi: XÓA/i.test(await card(lm, 'H2').innerText()), 'chip');
  await sw(lm, 'H2').click({force: true}); eq(await lines(lm), ['- XÓA: H2'], 'disabled switch does nothing');
  await card(lm, 'H2').locator('.hr-pend .hr-link').click();
  ok(/Chưa có thay đổi/.test(await msg(lm)), 'undo delete'); eq(await card(lm, 'H2').locator('.hr-confirm').count(), 0);
});
await T('17 mixed: flips + add + delete -> exact format and order; deleting a flipped task drops its flip line; pending count', async () => {
  await sw(lm, 'H3').click(); await sw(lm, 'H5').click(); await sw(lm, 'H1').click();
  await addTask(lm, 'Thêm một', 'Mô tả một'); await addTask(lm, 'Thêm hai', '');
  await lm.locator('[data-hrf="del:H4"]').click(); await lm.locator('[data-hrf="yes:H4"]').click();
  eq(await lines(lm), ['- H1: TẮT', '- H3: TẮT', '- H5: BẬT', '- THÊM: Thêm một | Mô tả một', '- THÊM: Thêm hai |', '- XÓA: H4']);
  ok(/Chờ gửi: 6 thay đổi/.test(await pend(lm)), await pend(lm)); eq(await lm.locator('#hourlyTabCount').innerText(), '6');
  await lm.locator('[data-hrf="del:H3"]').click(); await lm.locator('[data-hrf="yes:H3"]').click();
  eq(await lines(lm), ['- H1: TẮT', '- H5: BẬT', '- THÊM: Thêm một | Mô tả một', '- THÊM: Thêm hai |', '- XÓA: H3', '- XÓA: H4'], 'flip of deleted H3 dropped');
  await shot(lm, 'hourly-1280-mixed');
});
await T('18 staged changes survive reload (xw-hr: key); stale entries are pruned (switch already at original, unknown ids)', async () => {
  await lm.reload(); await lm.waitForSelector('.hr-card');
  eq((await lines(lm)).length, 6, 'restored');
  const key = await lm.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('xw-hr')));
  eq(key, ['xw-hr:']);
  const p = await open({seed: {sw: {H1: true, H2: true, ZZ: false}, add: [{k: 'a', title: 'Task without runs', detail: ''}, {k: 'b', title: 'Còn lại', detail: 'x'}], del: {ZZ: true}}});
  eq(await lines(p), ['- H2: BẬT', '- THÊM: Còn lại | x'], 'H1 = original, ZZ unknown, dup title all dropped');
  await p._ctx.close();
});
await T('19 copy: clipboard gets exactly the preview text, sent marker shown; "Sao chép & mở #88" opens the #88 comment link and copies', async () => {
  await lm.locator('#hrCopy').click();
  const clip = await lm.evaluate(() => window.__clip); eq(clip.length, 1); ok(HEAD.test(clip[0].split('\n')[0]), 'header');
  eq(clip[0], await msg(lm), 'clipboard == preview');
  ok(/đã sao chép, chờ C0 áp dụng/.test(await pend(lm)), await pend(lm));
  await lm.locator('#hrUndoAll').click();
  await sw(lm, 'H5').click();
  await lm.locator('#hrSend').click(); await lm.waitForFunction(() => window.__clip.length === 2);
  eq(await lm.evaluate(() => window.__opened), ['https://github.com/luan20495/xweb01/issues/88#issuecomment-new']);
  eq((await lm.evaluate(() => window.__clip[1])).split('\n').slice(1), ['- H5: BẬT']);
  await sw(lm, 'H5').click(); ok(!/đã sao chép/.test(await pend(lm)), 'marker cleared on new change');
});
await T('20 clipboard denied: text is selected and a manual-copy hint is shown; staged data kept', async () => {
  const p = await open({clipFail: true}); await sw(p, 'H2').click(); await p.locator('#hrCopy').click();
  ok(/Ctrl\/Cmd\+C/.test(await p.locator('#hrHint').innerText()), 'hint'); eq(await lines(p), ['- H2: BẬT']);
  ok(await p.evaluate(() => document.activeElement.id === 'hrMsg'), 'textarea focused'); await p._ctx.close();
});
await T('21 localStorage writes throwing: tab still works in memory (try/catch around storage)', async () => {
  const p = await open({noStorageWrite: true}); await sw(p, 'H2').click(); await addTask(p, 'Bộ nhớ', 'x');
  eq(await lines(p), ['- H2: BẬT', '- THÊM: Bộ nhớ | x']); eq(await p.evaluate(() => localStorage.getItem('xw-hr:')), null); await p._ctx.close();
});
await T('22 missing/invalid hourly data: friendly empty state, other tabs unaffected', async () => {
  current = withoutHourly; const p = await open(); ok(/Chưa có dữ liệu/.test(await p.locator('#hourlyBody').innerText()), 'empty');
  await p.locator('#tab-process').click(); await p.waitForSelector('.pc-g'); ok(await p.locator('.pc-g').count() >= 8, 'process tab still renders');
  await p._ctx.close(); current = withHourly;
});
await T('23 English twin: tab, notice, chips, titleEn/detailEn/summaryEn used, "Pending" bar and legend', async () => {
  const p = await open(); await p.locator('#lang').click(); await p.waitForFunction(() => document.querySelector('.hr-notice')?.textContent.startsWith('A switch takes effect'));
  eq(await card(p, 'H4').locator('.hr-title').innerText(), 'Task with English twin'); eq(await card(p, 'H4').locator('.hr-detail').innerText(), 'English description');
  ok(/Nothing new/.test(await card(p, 'H4').locator('.hr-last').innerText()), 'summaryEn');
  eq(await p.locator('.hr-legend .hr-chip').allInnerTexts().then(a => a.map(x => x.replace(/^\S\s*/, ''))), ['OK', 'Changed', 'Skipped', 'Failed']);
  await sw(p, 'H2').click(); ok(/Pending: 1 change/.test(await pend(p)), await pend(p));
  eq((await lines(p)), ['- H2: BẬT'], 'machine-readable lines stay Vietnamese in English UI');
  ok(/Last run:/.test(await card(p, 'H4').innerText()), 'last run label'); await p._ctx.close();
});
await T('24 responsive 390px: no horizontal scroll (idle, busy, open histories), controls >= 44px, nothing wider than the viewport', async () => {
  const p = await open({w: 390, h: 844});
  await p.locator('#hrToggleAll').click(); await sw(p, 'H1').click(); await addTask(p, 'Một tên việc khá dài để thử xuống dòng trên điện thoại ' + 'x'.repeat(60), 'y'.repeat(200)); await p.locator('[data-hrf="del:H5"]').click();
  const m = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    wide: [...document.querySelectorAll('#view-hourly *')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5 && getComputedStyle(e).position !== 'fixed' && !e.closest('.hr-live')).map(e => e.className || e.tagName).slice(0, 5),
    small: [...document.querySelectorAll('#view-hourly button,#view-hourly input,#view-hourly textarea,#view-hourly summary,#mainTabs [role=tab]')].filter(e => e.offsetParent).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5; }).map(e => e.className || e.id).slice(0, 5)}));
  eq(m.sw, m.cw, 'horizontal scroll'); eq(m.wide, [], 'overflowing'); eq(m.small, [], 'small targets');
  eq(await p.locator('#mainTabs [role=tab]').count(), 6); await shot(p, 'hourly-390');
  await p._ctx.close();
});
await T('25 dark theme: card/chip/notice use dark surfaces, chips still distinct; light stays light', async () => {
  const p = await open({theme: 'dark'}); await p.locator('#hrToggleAll').click();
  eq(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const m = await p.evaluate(() => { const bg = s => getComputedStyle(document.querySelector(s)).backgroundColor; const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return (r * 299 + g * 587 + b * 114) / 1000; };
    return {card: lum(bg('.hr-card')), page: lum(bg('body')), chips: new Set([...document.querySelectorAll('[data-hr="H1"] .hr-run .hr-chip')].map(c => getComputedStyle(c).backgroundColor)).size, notice: lum(bg('.hr-notice')), sw: bg('[data-hr="H1"] .hr-sw-t')}; });
  ok(m.card < 80 && m.page < 80 && m.notice < 100, JSON.stringify(m)); eq(m.chips, 4); await shot(p, 'hourly-1280-dark'); await p._ctx.close();
});
await T('26 existing tabs still switch correctly alongside the new ones (6 panels, one visible at a time, hash routing)', async () => {
  const p = await open({hash: '#roadmap/1'});
  for (const v of ['roadmap', 'process', 'limits', 'hourly', 'prod', 'owner']) {
    await p.locator('#tab-' + v).click();
    const vis = await p.evaluate(() => ['roadmap', 'process', 'limits', 'hourly', 'prod', 'owner'].filter(x => !document.getElementById('view-' + x).hidden));
    eq(vis, [v], 'visible views after ' + v); ok((await p.evaluate(() => location.hash)).startsWith('#' + v), 'hash for ' + v);
  }
  await p.locator('#tab-limits').focus(); await p.keyboard.press('ArrowRight');
  eq(await p.evaluate(() => document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab), 'hourly', 'arrow keys move across the new tab');
  await p.keyboard.press('ArrowRight');
  eq(await p.evaluate(() => document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab), 'prod');
  await p.keyboard.press('ArrowLeft');
  eq(await p.evaluate(() => document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab), 'hourly');
  await p._ctx.close();
});
await T('27 [light/dark] axe-core: 0 serious/critical on the hourly tab', async () => {
  if (!axeSrc) return 'NOT_RUN';
  const out = [];
  for (const theme of ['light', 'dark']) {
    const p = await open({theme}); await p.locator('#hrToggleAll').click(); await sw(p, 'H1').click(); await addTask(p, 'Axe', 'x'); await p.locator('[data-hrf="del:H5"]').click();
    await p.addScriptTag({content: axeSrc});
    const r = await p.evaluate(async () => (await axe.run('#view-hourly', {runOnly: ['wcag2a', 'wcag2aa']})).violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ') + ' ' + (n.any[0] ? n.any[0].message : '')).join(' ; ')));
    if (r.length) out.push(theme + ' ' + r.join(','));
    await p._ctx.close();
  }
  ok(!out.length, out.join(' | '));
});
await T('28 no console errors during the whole run', async () => { eq(consoleErrors, []); });

await browser.close(); server.close();
const w = Math.max(...results.map(r => r[0].length));
for (const [n, s, d] of results) console.log(`${s.padEnd(8)} ${n.padEnd(w)}  ${d}`);
const c = k => results.filter(r => r[1] === k).length;
console.log(`\nPASS ${c('PASS')}  FAIL ${c('FAIL')}  NOT_RUN ${c('NOT_RUN')}${SHOTS ? '  screenshots: ' + SHOTS : ''}`);
process.exit(c('FAIL') ? 1 : 0);
