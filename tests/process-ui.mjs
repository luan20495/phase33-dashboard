// Automated UI check for the "Quy trình & cấu hình" tab (#process).
// Run:  node tests/process-ui.mjs            (needs Playwright, see below)
// Env:  PW_MODULE=<path to playwright or playwright-core>   SHOTS=<dir for screenshots>   AXE=<path to axe.min.js, optional>
// It serves index.html from this repo on 127.0.0.1 and replaces status.json with tests/fixtures/status.process.json
// (the real status.json is never read or written). Chrome is used when installed (channel "chrome"), else Playwright Chromium.
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
const fixture = fs.readFileSync(path.join(root, 'tests/fixtures/status.process.json'), 'utf8');
const FX = JSON.parse(fixture).process;
const ITEM = Object.fromEntries(FX.groups.flatMap(g => (g.items || []).map(i => [i.id, i])));
let axeSrc = '';
try { axeSrc = fs.readFileSync(process.env.AXE || require.resolve('axe-core/axe.min.js'), 'utf8'); } catch {}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/status.json') { res.writeHead(200, {'content-type': 'application/json'}); return res.end(fixture); }
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
  catch (e) { results.push([name, 'FAIL', String(e.message || e).split('\n')[0].slice(0, 220)]); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

async function open({w = 1280, h = 900, theme = 'light', scheme = 'light', seed = null, ui = null} = {}) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}, colorScheme: scheme, deviceScaleFactor: 1});
  await ctx.addInitScript(([theme, seed, ui]) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        if (theme) localStorage.setItem('xweb-theme', theme);
        if (seed) localStorage.setItem('xw-pc:', JSON.stringify(seed));
        if (ui) localStorage.setItem('xw-pc-ui:', JSON.stringify(ui));
      }
    } catch {}
    window.__opened = []; window.__clip = [];
    window.open = (...a) => { window.__opened.push(a[0]); return null; };
    try { Object.defineProperty(navigator, 'clipboard', {value: {writeText: async t => { window.__clip.push(t); }}, configurable: true}); } catch {}
  }, [theme, seed, ui]);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url + m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '#process');
  await page.waitForSelector('.pc-g');
  page._ctx = ctx;
  return page;
}
const row = (p, id) => p.locator(`[data-pc="${id}"]`);
const grp = (p, id) => p.locator(`[data-group="${id}"]`);
async function openGroup(p, id) { const b = grp(p, id).locator('.pc-gbtn'); if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click(); }
const shot = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name + '.png'), fullPage: false}); };
const shotFull = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name + '.png'), fullPage: true}); };

async function prepareBusy(p) {
  // open everything and create drafts in every flavour so that all visual variants exist
  await p.locator('.pc-textbtn', {hasText: 'Mở tất cả'}).click();
  await p.locator('.pc-help,.pc-hist,.pc-imp').evaluateAll(l => l.forEach(d => d.open = true));
  await row(p, 'agents.heavy_one').locator('[role=switch]').click();
  await row(p, 'agents.min').locator('input').fill('9');
  await row(p, 'agents.max').locator('input').fill('99');
  await row(p, 'agents.on_hung').locator('.pc-seg label').nth(1).click();
  await row(p, 'git.flow').locator('textarea').fill('Luồng mới ngắn hơn');
  await row(p, 'disk.t_light').locator('input').fill('120');
}

// ----------------------------------------------------------------------------------------------
const lm = await open();
await T('01 groups collapsed by default (+ count badge, no open group)', async () => {
  const n = await lm.locator('.pc-g').count(), open = await lm.locator('.pc-gbtn[aria-expanded="true"]').count();
  ok(n >= 8, 'groups=' + n); ok(open === 0, 'open=' + open);
  ok(await grp(lm, 'agents').locator('.pc-badge').first().innerText() === '10 mục', 'count badge');
  ok(!(await row(lm, 'agents.min').isVisible()), 'items should be hidden while collapsed');
});
await T('02 common chips = groups with common:true; chip jump opens + focuses group', async () => {
  const want = FX.groups.filter(g => g.common === true).map(g => g.title);
  const got = await lm.locator('.pc-chip').evaluateAll(l => l.map(c => c.firstChild.textContent));
  ok(JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  await lm.locator('.pc-chip[data-jump="sso"]').click();
  ok((await grp(lm, 'sso').locator('.pc-gbtn').getAttribute('aria-expanded')) === 'true', 'not expanded');
  ok(await lm.evaluate(() => document.activeElement.closest('[data-group]')?.dataset.group === 'sso'), 'focus not on sso header');
  await lm.locator('.pc-gbtn[aria-expanded="true"]').first().click(); // collapse again
});
await T('03 group header: Enter/Space toggle, aria-expanded, state persisted in xw-pc-ui', async () => {
  const b = grp(lm, 'git').locator('.pc-gbtn'); await b.focus();
  await lm.keyboard.press('Enter'); ok((await b.getAttribute('aria-expanded')) === 'true', 'Enter');
  await lm.keyboard.press('Space'); ok((await b.getAttribute('aria-expanded')) === 'false', 'Space');
  await lm.keyboard.press('Enter');
  const ui = await lm.evaluate(() => JSON.parse(localStorage.getItem('xw-pc-ui:')));
  ok(ui.open.git === true, JSON.stringify(ui));
  await lm.reload(); await lm.waitForSelector('.pc-g');
  ok((await grp(lm, 'git').locator('.pc-gbtn').getAttribute('aria-expanded')) === 'true', 'not restored');
  ok((await grp(lm, 'agents').locator('.pc-gbtn').getAttribute('aria-expanded')) === 'false', 'agents should stay closed');
});
await T('04 search "agents.max" filters + auto-expands; clear restores user state', async () => {
  await lm.locator('#pcSearch').fill('agents.max');
  const vis = await lm.locator('.pc-it:visible').evaluateAll(l => l.map(x => x.dataset.pc));
  ok(JSON.stringify(vis) === JSON.stringify(['agents.max', 'agents.max_extra']), JSON.stringify(vis));
  ok((await grp(lm, 'agents').locator('.pc-gbtn').getAttribute('aria-expanded')) === 'true', 'auto-expand');
  ok(await lm.locator('.pc-g:visible').count() === 1, 'only one group should remain');
  ok(/Tìm thấy 2 mục trong 1 nhóm/.test(await lm.locator('.pc-status').innerText()), 'aria-live count');
  await lm.locator('#pcSearch').press('Escape');
  ok(await lm.locator('#pcSearch').inputValue() === '', 'Esc clears');
  ok((await grp(lm, 'agents').locator('.pc-gbtn').getAttribute('aria-expanded')) === 'false', 'agents back to collapsed');
  await lm.locator('#pcSearch').fill('khong-co-gi-nhu-vay');
  ok(await lm.locator('.pc-empty').isVisible(), 'empty state');
  await lm.locator('.pc-empty button').click();
  ok(await lm.locator('.pc-g:visible').count() >= 8, 'restored');
  await lm.locator('#pcSearch').fill('phien dang nhap'); // diacritics-insensitive
  ok(await grp(lm, 'sso').isVisible(), 'diacritics-insensitive match on group title');
  await lm.locator('#pcSearch').fill('');
});
await T('05 switch: role=switch, aria-checked, Space/Enter toggle, draft marker', async () => {
  await openGroup(lm, 'agents');
  const sw = row(lm, 'agents.heavy_one').locator('[role=switch]');
  ok((await sw.getAttribute('aria-checked')) === 'true', 'initial');
  ok((await sw.getAttribute('aria-labelledby')) !== null, 'name');
  await sw.focus(); await lm.keyboard.press('Space');
  ok((await sw.getAttribute('aria-checked')) === 'false', 'Space');
  ok(/Bản nháp \(chưa gửi\)/.test(await row(lm, 'agents.heavy_one').innerText()), 'draft marker');
  await lm.keyboard.press('Enter');
  ok((await sw.getAttribute('aria-checked')) === 'true', 'Enter');
  ok(!/Bản nháp/.test(await row(lm, 'agents.heavy_one').innerText()), 'marker removed when back to original');
  ok(await lm.evaluate(() => !('agents.heavy_one' in JSON.parse(localStorage.getItem('xw-pc:') || '{}'))), 'draft key removed');
});
await T('06 number stepper: +/- and arrow keys respect min/max; spinbutton role', async () => {
  const r = row(lm, 'agents.max'), inp = r.locator('input');
  ok((await inp.getAttribute('role')) === 'spinbutton' && (await inp.getAttribute('aria-valuemax')) === '10', 'aria');
  await r.locator('button', {hasText: '+'}).click(); ok(await inp.inputValue() === '7', '+ -> 7');
  await inp.focus(); await lm.keyboard.press('ArrowDown'); await lm.keyboard.press('ArrowDown'); ok(await inp.inputValue() === '5', 'arrow down');
  await inp.fill('10'); ok(await r.locator('button', {hasText: '+'}).isDisabled(), '+ disabled at max');
  await r.locator('.pc-undo').click(); ok(await inp.inputValue() === '6', 'undo restores 6');
  ok(await lm.evaluate(() => !('agents.max' in JSON.parse(localStorage.getItem('xw-pc:') || '{}'))), 'draft removed');
});
await T('07 number validation: out of range / decimal / empty / letters -> inline error, send blocked', async () => {
  const r = row(lm, 'agents.max'), inp = r.locator('input');
  await inp.fill('99'); ok(/từ 1 đến 10/.test(await r.locator('.pc-msg.err').innerText()), 'range msg');
  ok((await inp.getAttribute('aria-invalid')) === 'true', 'aria-invalid');
  for (const [v, re] of [['3.5', /số nguyên/], ['', /Nhập một số nguyên/], ['abc', /số nguyên/], ['0', /từ 1 đến 10/]]) {
    await inp.fill(v); ok(re.test(await r.locator('.pc-msg.err').innerText()), 'msg for ' + JSON.stringify(v));
  }
  await inp.fill('99');
  await lm.locator('.pc-bar .prim').click({force: true}); // aria-disabled: handler must refuse
  ok(await lm.evaluate(() => window.__opened.length === 0 && window.__clip.length === 0), 'must not open/copy with invalid draft');
  ok(/chưa hợp lệ/.test(await lm.locator('.pc-bar-i').innerText()), 'bar says invalid');
  ok(/lỗi/.test(await grp(lm, 'agents').locator('.pc-badge.is-err').innerText()), 'group error badge');
  await r.locator('.pc-undo').click();
});
await T('08 text: required non-empty (inline error), textarea only for long text', async () => {
  await openGroup(lm, 'git');
  const t = row(lm, 'git.flow').locator('textarea'); await t.fill('   ');
  ok(/Không được để trống/.test(await row(lm, 'git.flow').locator('.pc-msg.err').innerText()), 'required');
  await row(lm, 'git.flow').locator('.pc-undo').click();
  await openGroup(lm, 'edge');
  ok(await row(lm, 'edge.short').locator('input[type=text]').count() === 1 && await row(lm, 'edge.short').locator('textarea').count() === 0, 'short text uses input');
  ok(await row(lm, 'agents.hourly').locator('textarea').count() === 1, 'long text uses textarea');
});
await T('09 select: segmented radiogroup (<=3 short options), native select for many options', async () => {
  const r = row(lm, 'agents.on_hung');
  ok(await r.locator('[role=radiogroup]').count() === 1 && await r.locator('input[type=radio]').count() === 2, 'segmented');
  await r.locator('.pc-seg label').nth(1).click();
  ok(/mới: Báo Owner/.test(await r.locator('.pc-cur').innerText()), 'draft shown');
  await r.locator('.pc-undo').click();
  ok(await r.locator('input[type=radio]').nth(0).isChecked(), 'undo');
  ok(await row(lm, 'edge.many').locator('select').count() === 1, 'native select');
  await row(lm, 'edge.many').locator('select').selectOption('D'); ok(await row(lm, 'edge.many').locator('.pc-mk').count() === 1, 'marker');
  await row(lm, 'edge.many').locator('.pc-undo').click();
});
await T('10 conflict warnings: agents.min=9 vs max=6 names both items (warning, not blocking)', async () => {
  await row(lm, 'agents.min').locator('input').fill('9');
  const w = await row(lm, 'agents.min').locator('.pc-msg.warn').innerText();
  ok(/Số agent tối thiểu|tối thiểu/i.test(w) && /agents\.min|\(9\)/.test(w) && /\(6\)/.test(w), w);
  ok(await row(lm, 'agents.max').locator('.pc-msg.warn').count() === 1, 'warning on both items');
  ok((await lm.locator('.pc-bar .prim').getAttribute('aria-disabled')) === 'false', 'not blocked by a conflict');
  ok(await grp(lm, 'agents').locator('.pc-badge.is-warn').isVisible(), 'group warn badge');
  await row(lm, 'agents.min').locator('.pc-undo').click();
  ok(await row(lm, 'agents.max').locator('.pc-msg.warn').count() === 0, 'warning gone');
  await row(lm, 'agents.max_extra').locator('input').fill('5'); // 6 > 5
  ok(await row(lm, 'agents.max').locator('.pc-msg.warn').count() === 1, 'max <= max_extra rule');
  await row(lm, 'agents.max_extra').locator('.pc-undo').click();
});
await T('11 conflict warnings: disk chain (monitor>light>active>aggressive>=urgent)', async () => {
  await openGroup(lm, 'disk');
  await row(lm, 'disk.t_light').locator('input').fill('120');
  ok(await row(lm, 'disk.t_monitor').locator('.pc-msg.warn').count() === 1 && await row(lm, 'disk.t_light').locator('.pc-msg.warn').count() === 1, 'monitor<=light');
  await row(lm, 'disk.t_light').locator('.pc-undo').click();
  await row(lm, 'disk.t_urgent').locator('input').fill('30'); // aggressive(20) >= urgent(30) violated
  ok(await row(lm, 'disk.t_aggressive').locator('.pc-msg.warn').count() === 1, 'aggressive>=urgent');
  await row(lm, 'disk.t_urgent').locator('input').fill('20'); // equal is allowed
  ok(await row(lm, 'disk.t_aggressive').locator('.pc-msg.warn').count() === 0, 'equal allowed');
  await row(lm, 'disk.t_active').locator('input').fill('20'); // active must be > aggressive
  ok(await row(lm, 'disk.t_active').locator('.pc-msg.warn').count() === 1, 'active>aggressive');
  await lm.locator('.pc-bar .dng').click(); await lm.locator('.pc-bar .dng').click();
});
await T('12 conflict warnings: sso minutes vs days*1440', async () => {
  await openGroup(lm, 'sso');
  await row(lm, 'sso.idle_days').locator('input').fill('10'); // 14400 < 43200
  ok(await row(lm, 'sso.backend_idle_min').locator('.pc-msg.warn').count() === 1, 'idle');
  ok(/14400/.test(await row(lm, 'sso.backend_idle_min').locator('.pc-msg.warn').innerText()), 'text has limit');
  await row(lm, 'sso.max_days').locator('input').fill('100');
  ok(await row(lm, 'sso.backend_abs_min').locator('.pc-msg.warn').count() === 1, 'abs');
  await row(lm, 'sso.backend_idle_min').locator('input').fill('1000');
  ok(await row(lm, 'sso.backend_idle_min').locator('.pc-msg.warn').count() === 0, 'resolved when minutes lowered');
  await lm.locator('.pc-bar .dng').click(); await lm.locator('.pc-bar .dng').click();
  ok(await lm.locator('.pc-bar').isHidden(), 'undo all hides bar');
});
await T('13 message format: byte-for-byte as before for a changed bool and number (also equals old pcMessage)', async () => {
  await row(lm, 'agents.heavy_one').locator('[role=switch]').click();
  await row(lm, 'agents.max').locator('input').fill('7');
  await lm.locator('.pc-bar .prim').click();
  const clip = await lm.evaluate(() => window.__clip[0]);
  const A = ITEM['agents.heavy_one'], B = ITEM['agents.max'];
  const want = /^## \[OWNER\] \d\d:\d\d ICT \d\d\/\d\d: cập nhật cấu hình từ dashboard\n/;
  ok(want.test(clip), 'header: ' + JSON.stringify(clip.split('\n')[0]));
  const body = clip.split('\n').slice(1).join('\n');
  const expected = `- agents.max (${B.label}): 6 → 7\n- agents.heavy_one (${A.label}): true → false`; // item order of status.json
  ok(body === expected, JSON.stringify(body));
  let oldSrc = '';
  try { oldSrc = execSync('git show origin/main:index.html', {cwd: root, encoding: 'utf8', maxBuffer: 1 << 28}); } catch {}
  const m = oldSrc.match(/function pcMessage\(groups\)\{[^\n]*\}\n/);
  if (m) {
    const old = await lm.evaluate(src => { const f = new Function(src + '; return pcMessage(payload.process.groups.filter(g => Array.isArray(g.items)))'); return f(); }, m[0]);
    ok(old.split('\n').slice(1).join('\n') === body, 'differs from old pcMessage: ' + old);
  }
  ok(await lm.evaluate(() => { const s = JSON.parse(localStorage.getItem('xw-pc:')); return JSON.stringify(s) === '{"agents.heavy_one":false,"agents.max":"7"}'; }), 'localStorage xw-pc: shape');
  ITEM.__msg = clip;
});
await T('14 send flow: copies + opens #88, shows "Đã sao chép, chờ Claude áp dụng", never "Đã áp dụng"; wording says copy/open only', async () => {
  const opened = await lm.evaluate(() => ({o: window.__opened, url: ODREPO}));
  ok(opened.o.length === 1 && opened.o[0] === opened.url, 'opened ' + JSON.stringify(opened.o));
  ok(/Đã sao chép, chờ Claude áp dụng/.test(await row(lm, 'agents.max').innerText()), 'sent marker');
  ok(!/Bản nháp/.test(await row(lm, 'agents.max').innerText()), 'no draft marker once copied');
  const st = await row(lm, 'agents.max').locator('.pc-state').innerText();
  ok(st === 'Đã áp dụng', 'state chip must keep status.json state (was ' + st + ' in the fixture), it is the data state not the draft');
  ok(!(await row(lm, 'agents.max').locator('.pc-mk').innerText()).includes('Đã áp dụng'), 'marker must not claim applied');
  ok(/chỉ sao chép/i.test(await lm.locator('.pc-bar').innerText()), 'wording: only copies');
  ok(/chưa có gì được áp dụng|chưa áp dụng/i.test(await lm.locator('.pc-bar').innerText()), 'wording: not applied');
  ok(/Đã sao chép, chờ Claude áp dụng/.test(await lm.locator('.pc-bar-i').innerText()), 'bar summary');
  // editing after copy goes back to draft
  await row(lm, 'agents.max').locator('input').fill('8');
  ok(/Bản nháp/.test(await row(lm, 'agents.max').innerText()), 'draft again after edit');
});
await T('15 preview sheet: diff list old -> new with state, undo inside, Esc closes and returns focus', async () => {
  const btn = lm.locator('.pc-bar button', {hasText: 'Xem trước thay đổi'}); await btn.focus(); await btn.press('Enter');
  const d = lm.locator('dialog.pc-sheet'); ok(await d.isVisible(), 'open');
  ok((await d.getAttribute('aria-labelledby')) === 'pcSheetT', 'labelled');
  const txt = await d.innerText();
  ok(/Cũ/.test(txt) && /Mới/.test(txt) && /agents\.max/.test(txt) && /agents\.heavy_one/.test(txt), 'diff content');
  ok(/Đã áp dụng/.test(txt), 'state chip shown in diff');
  ok(/Đã sao chép, chờ Claude áp dụng/.test(txt) && /Bản nháp \(chưa gửi\)/.test(txt), 'markers shown');
  await shot(lm, 'sheet-desktop-light');
  await d.locator('.pc-undo').first().click();
  ok(await d.locator('.pc-di').count() === 1, 'one left after undo');
  await lm.keyboard.press('Escape');
  ok(!(await d.isVisible()), 'Esc closes');
  ok(await lm.evaluate(() => document.activeElement?.textContent?.includes('Xem trước thay đổi')), 'focus returned to opener');
});
await T('16 undo per item and undo all (2-step confirm) restore original values', async () => {
  await lm.locator('.pc-bar .dng').click();
  ok(/Bấm lại/.test(await lm.locator('.pc-bar .dng').innerText()), 'asks confirm');
  await lm.locator('.pc-bar .dng').click();
  ok(await lm.evaluate(() => localStorage.getItem('xw-pc:') === '{}'), 'storage cleared');
  ok(await lm.locator('.pc-it.is-changed').count() === 0 && await lm.locator('.pc-it .pc-mk').count() === 0, 'no changed rows');
  ok(await row(lm, 'agents.max').locator('input').inputValue() === '6', 'value restored');
});
await T('17 states: chip text only from data; missing state => "Chưa rõ trạng thái"; legend lists 4 states + 2 markers', async () => {
  for (const [id, want] of [['agents.min', 'Đã áp dụng'], ['sso.backend_idle_min', 'Chờ áp dụng'], ['sso.remember_me', 'Đề xuất'], ['sso.idle_days', 'Đã xác minh'], ['edge.nolabel', 'Chưa rõ trạng thái']]) {
    if (id.startsWith('sso')) await openGroup(lm, 'sso'); if (id.startsWith('edge')) await openGroup(lm, 'edge');
    const got = await row(lm, id).locator('.pc-state').first().innerText(); ok(got === want, id + ' ' + got);
  }
  const lg = await lm.locator('.pc-legend').evaluate(e => { e.closest('details').open = true; return e.innerText; });
  for (const s of ['Đề xuất', 'Chờ áp dụng', 'Đã áp dụng', 'Đã xác minh', 'Bản nháp (chưa gửi)', 'Đã sao chép, chờ Claude áp dụng']) ok(lg.includes(s), 'legend ' + s);
  ok(/Bằng chứng: Đo ngày 10\/11/.test(await row(lm, 'edge.short').innerText()), 'evidence shown');
});
await T('18 read-only items: plain value + lock icon + evidence, no input/button', async () => {
  const r = row(lm, 'edge.ro');
  ok(await r.locator('.pc-lock').count() === 1, 'lock'); ok(await r.locator('input,textarea,select,[role=switch],.pc-step').count() === 0, 'no control');
  ok(/42/.test(await r.innerText()) && /Số đo mẫu/.test(await r.innerText()) && /Chỉ đọc/.test(await r.innerText()), 'value+evidence+label');
  await openGroup(lm, 'deploy'); ok(await row(lm, 'deploy.release_name').locator('.pc-lock').count() === 1, 'real ro item');
});
await T('19 impact ("Tác động khi thay đổi") is collapsible secondary text', async () => {
  const d = row(lm, 'agents.min').locator('details.pc-imp'); ok(await d.count() === 1, 'details'); ok(await d.locator('p').isHidden(), 'collapsed by default');
  await d.locator('summary').click(); ok(await d.locator('p').isVisible(), 'opens'); ok(/Tác động khi thay đổi/.test(await d.innerText()), 'title');
  await d.locator('summary').click();
});
await T('20 tolerant to missing fields / unknown types / bool as string / empty groups', async () => {
  ok(await row(lm, 'edge.nolabel').locator('.pc-label').innerText() === 'edge.nolabel', 'label falls back to id');
  ok(await row(lm, 'edge.weird').locator('input[type=text]').count() === 1, 'unknown type -> text');
  ok((await row(lm, 'edge.boolstr').locator('[role=switch]').getAttribute('aria-checked')) === 'true', 'bool "true" string');
  ok(await grp(lm, 'edge-empty').locator('.pc-badge').first().innerText() === '0 mục', 'empty group');
  ok(await lm.locator('.pc-g').count() === FX.groups.length, 'every group rendered');
});
await T('21 history: collapsed, lists process.history', async () => {
  const h = lm.locator('details.pc-hist'); ok(!(await h.evaluate(e => e.open)), 'collapsed'); ok(/Lịch sử thay đổi \(1\)/.test(await h.locator('summary').innerText()), 'count');
  await h.locator('summary').click(); ok(/Chốt bộ tiêu chuẩn/.test(await h.innerText()), 'entry');
});
await T('22 old drafts (seeded in xw-pc:) are honoured after upgrade and key name is unchanged', async () => {
  const p = await open({seed: {'agents.max': '7', 'agents.heavy_one': false, 'unknown.item': 'x'}});
  await p.locator('.pc-textbtn', {hasText: 'Mở tất cả'}).click();
  ok(await p.locator('.pc-it.is-changed').count() === 2, 'changed=' + await p.locator('.pc-it.is-changed').count());
  ok(/Đã sửa 2 mục/.test(await p.locator('.pc-bar-i').innerText()), 'bar');
  ok((await p.locator('.pc-badge.is-changed:visible').allInnerTexts()).join() === '2 đã sửa', 'group badge');
  ok(await p.evaluate(() => PCKEY) === 'xw-pc:', 'PCKEY');
  await p._ctx.close();
});
await T('23 keyboard: logical tab order, visible focus ring on controls', async () => {
  const p = await open(); await p.locator('#pcSearch').focus();
  const seq = [];
  for (let i = 0; i < 9; i++) { await p.keyboard.press('Tab'); seq.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return {tag: a.tagName, cls: a.className, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, pos: [...document.querySelectorAll('*')].indexOf(a)}; })); }
  ok(seq.every((s, i) => i === 0 || s.pos > seq[i - 1].pos), 'DOM order ' + JSON.stringify(seq.map(s => s.cls)));
  ok(seq.every(s => s.ring), 'focus ring on ' + JSON.stringify(seq.filter(s => !s.ring).map(s => s.cls)));
  await p._ctx.close();
});
await T('24 no console errors / page errors during the whole run', async () => { ok(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ')); });

// ---------------- responsive / theme / a11y on a busy page ------------------------------------
const contrastFn = () => {
  const parse = c => { let m = c.match(/^rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = c.match(/^color\(srgb ([^)]+)\)/); if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; } return null; };
  const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map(i => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a); };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const bgOf = e => { const stack = []; for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } } let b = [255, 255, 255, 1]; for (const c of stack.reverse()) b = over(c, b); return b; };
  const bad = []; let n = 0, skipped = 0;
  const scope = [document.getElementById('view-process'), document.querySelector('dialog.pc-sheet[open]')].filter(Boolean);
  for (const s of scope) for (const e of s.querySelectorAll('*')) {
    if (![...e.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())) continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height || e.closest('.sr,[hidden],:disabled,[aria-disabled="true"]')) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity < 1) continue;
    const fg = parse(cs.color), bg = bgOf(e); if (!fg) { skipped++; continue; }
    const f = over(fg, bg), L1 = lum(f), L2 = lum(bg), cr = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); n++;
    if (cr < 4.5) bad.push(`${e.className || e.tagName}:"${e.textContent.trim().slice(0, 24)}" ${cr.toFixed(2)}`);
  }
  return {n, skipped, bad: bad.slice(0, 8)};
};
const targetsFn = () => {
  const bad = []; const scope = [document.getElementById('view-process'), document.querySelector('dialog.pc-sheet[open]')].filter(Boolean);
  for (const s of scope) for (const e of s.querySelectorAll('button,summary,select,input:not([type=radio]),textarea,a[href],[role=switch]')) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height || e.closest('[hidden]')) continue;
    if (r.height < 43.5 || r.width < 43.5) bad.push(`${e.className || e.tagName}:${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const e of document.querySelectorAll('#view-process .pc-seg span')) { const r = e.getBoundingClientRect(); if (r.width && r.height < 43.5) bad.push('seg ' + Math.round(r.height)); }
  return bad.slice(0, 8);
};
const overflowFn = () => {
  const vw = document.documentElement.clientWidth, off = [];
  for (const e of document.querySelectorAll('#view-process *')) { if (e.closest('.pc-chips,.sr,[hidden]')) continue; const r = e.getBoundingClientRect(); if (r.width && r.right > vw + 1) off.push((e.className || e.tagName) + ':' + Math.round(r.right)); }
  return {doc: document.documentElement.scrollWidth - vw, body: document.body.scrollWidth - vw, off: off.slice(0, 5)};
};
const a11yFn = () => {
  const bad = []; const nameOf = e => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') && [...e.getAttribute('aria-labelledby').split(' ')].map(i => document.getElementById(i)?.textContent).join(' ')) || e.textContent || e.title || '').trim();
  for (const e of document.querySelectorAll('#view-process button,#view-process input:not([type=radio]),#view-process select,#view-process textarea,#view-process [role=switch],#view-process summary')) { if (e.closest('[hidden],.sr')) continue; if (!nameOf(e)) bad.push('noname ' + e.className); }
  for (const e of document.querySelectorAll('#view-process [role=switch]')) if (!['true', 'false'].includes(e.getAttribute('aria-checked'))) bad.push('switch aria-checked');
  for (const e of document.querySelectorAll('#view-process .pc-gbtn')) if (!['true', 'false'].includes(e.getAttribute('aria-expanded')) || !document.getElementById(e.getAttribute('aria-controls'))) bad.push('group aria');
  for (const e of document.querySelectorAll('#view-process input[type=radio]')) if (!e.closest('[role=radiogroup]')) bad.push('radio outside group');
  for (const e of document.querySelectorAll('#view-process [aria-live]')) { /* present */ }
  if (!document.querySelector('#view-process [role=status][aria-live=polite]')) bad.push('no live region');
  const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i); if (dup.length) bad.push('dup ids ' + dup.slice(0, 3));
  return bad;
};

for (const [vw, vh] of [[1280, 900], [390, 844], [320, 700]]) for (const theme of ['light', 'dark']) {
  const tag = `${vw}-${theme}`;
  const p = await open({w: vw, h: vh, theme});
  await T(`30 [${tag}] data-theme=${theme} applied`, async () => ok(await p.evaluate(() => document.documentElement.dataset.theme) === theme));
  await shot(p, `collapsed-${tag}`);
  await prepareBusy(p);
  await shotFull(p, `busy-full-${tag}`);
  await T(`31 [${tag}] no horizontal scroll (page + tab, groups open, drafts, errors)`, async () => { const o = await p.evaluate(overflowFn); ok(o.doc <= 0 && o.body <= 0 && o.off.length === 0, JSON.stringify(o)); });
  await T(`32 [${tag}] text contrast >= 4.5:1`, async () => { const c = await p.evaluate(contrastFn); ok(c.bad.length === 0 && c.n > 100, JSON.stringify(c)); return `${c.n} text nodes`; });
  await T(`33 [${tag}] touch targets >= 44px`, async () => { const t = await p.evaluate(targetsFn); ok(t.length === 0, JSON.stringify(t)); });
  await T(`34 [${tag}] accessible names / roles / aria`, async () => { const b = await p.evaluate(a11yFn); ok(b.length === 0, JSON.stringify(b)); });
  if (axeSrc && vw === 1280) await T(`35 [${tag}] axe-core (wcag2a/aa, view-process)`, async () => {
    await p.evaluate(axeSrc);
    const r = await p.evaluate(async () => (await axe.run('#view-process', {runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']})).violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes[0].html.slice(0, 80)));
    ok(r.length === 0, r.join(' | '));
  }); else if (!axeSrc && vw === 1280) results.push([`35 [${tag}] axe-core`, 'NOT_RUN', 'axe-core not installed (set AXE=path/to/axe.min.js)']);
  // sheet at this size
  await p.locator('.pc-bar button', {hasText: 'Xem trước thay đổi'}).click();
  await p.waitForTimeout(250);
  await shot(p, `sheet-${tag}`);
  await T(`36 [${tag}] sheet fits viewport, no horizontal scroll, contrast/targets ok`, async () => {
    const m = await p.evaluate(() => { const r = document.querySelector('dialog.pc-sheet').getBoundingClientRect(); return {t: r.top, r: r.right, l: r.left, b: r.bottom, vw: innerWidth, vh: innerHeight}; });
    ok(m.l >= -0.5 && m.r <= m.vw + 0.5 && m.b <= m.vh + 0.5 && m.t >= -0.5, JSON.stringify(m));
    const c = await p.evaluate(contrastFn); ok(c.bad.length === 0, JSON.stringify(c.bad)); const t = await p.evaluate(targetsFn); ok(t.length === 0, JSON.stringify(t));
  });
  await p.keyboard.press('Escape');
  await p._ctx.close();
}
await T('36b focused buttons keep their own background (no white flash in dark)', async () => {
  const p = await open({theme: 'dark'});
  await p.locator('[data-pc="agents.heavy_one"]').waitFor({state: 'attached'}); await p.locator('.pc-textbtn', {hasText: 'Mở tất cả'}).click();
  await row(p, 'agents.heavy_one').locator('[role=switch]').click();
  const bad = [];
  for (const sel of ['.pc-bar .prim', '.pc-bar .dng', '.pc-chip', '.pc-gbtn', '.pc-textbtn', '[data-pc="agents.min"] .pc-step button', '[data-pc="agents.heavy_one"] .pc-undo', '[data-pc="agents.heavy_one"] .pc-sw']) {
    const l = p.locator(sel).first(); await l.focus(); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab');
    const bg = await l.evaluate(e => getComputedStyle(e).backgroundColor); if (bg === 'rgb(255, 255, 255)') bad.push(sel);
  }
  ok(!bad.length, bad.join(', ')); await p._ctx.close();
});
await T('37 prefers-color-scheme: dark with theme=auto -> dark', async () => {
  const p = await open({scheme: 'dark', theme: 'auto'}); ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark'); await p._ctx.close();
});
await T('38 reduced motion + keyboard-only complete flow: search -> change switch -> preview -> Esc', async () => {
  const p = await open(); await p.locator('#pcSearch').focus(); await p.keyboard.type('agents.heavy'); await p.keyboard.press('Tab'); // clear button
  await p.evaluate(() => document.querySelector('[data-pc="agents.heavy_one"] [role=switch]').focus()); await p.keyboard.press('Space');
  ok(/Đã sửa 1 mục/.test(await p.locator('.pc-bar-i').innerText()), 'bar');
  await p.locator('.pc-bar button', {hasText: 'Xem trước'}).focus(); await p.keyboard.press('Enter'); ok(await p.locator('dialog.pc-sheet').isVisible(), 'sheet');
  await p.keyboard.press('Escape'); ok(!(await p.locator('dialog.pc-sheet').isVisible()), 'closed'); await p._ctx.close();
});

await browser.close(); server.close();
const w = Math.max(...results.map(r => r[0].length));
for (const [n, s, d] of results) console.log(`${s.padEnd(8)} ${n.padEnd(w)}  ${d}`);
const c = k => results.filter(r => r[1] === k).length;
console.log(`\nPASS ${c('PASS')}  FAIL ${c('FAIL')}  NOT_RUN ${c('NOT_RUN')}${SHOTS ? '  screenshots: ' + SHOTS : ''}`);
process.exit(c('FAIL') ? 1 : 0);
