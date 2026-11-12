// Automated UI check for the "Giới hạn AI Studio" tab (#limits).
// Run:  node tests/limits-ui.mjs            (needs Playwright, see below)
// Env:  PW_MODULE=<path to playwright or playwright-core>   SHOTS=<dir for screenshots>   AXE=<path to axe.min.js, optional>
// It serves index.html from this repo on 127.0.0.1 and replaces status.json with tests/fixtures/status.process.json
// plus the `aiLimits` object of tests/fixtures/limits.json (14 representative rows). One test also renders the
// repo's real status.json `aiLimits` (read only). Nothing is written to status.json.
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
const AL = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/limits.json'), 'utf8'));
const REAL = JSON.parse(fs.readFileSync(path.join(root, 'status.json'), 'utf8')).aiLimits;
const withLimits = JSON.stringify(Object.assign({}, base, {aiLimits: AL}));
const withoutLimits = JSON.stringify(base);
let current = withLimits;
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

async function open({w = 1280, h = 900, theme = 'light', scheme = 'light', seed = null, noStorageWrite = false, clipFail = false, hash = '#limits', lang = 'vi'} = {}) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}, colorScheme: scheme, deviceScaleFactor: 1});
  await ctx.addInitScript(([theme, seed, noStorageWrite, clipFail, lang]) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        if (theme) localStorage.setItem('xweb-theme', theme);
        localStorage.setItem('xweb-lang', lang);
        if (seed) localStorage.setItem('xw-al:', JSON.stringify(seed));
      }
    } catch {}
    window.__opened = []; window.__clip = [];
    window.open = (...a) => { window.__opened.push(a[0]); return null; };
    try { Object.defineProperty(navigator, 'clipboard', {value: {writeText: async t => { if (clipFail) throw new Error('denied'); window.__clip.push(t); }}, configurable: true}); } catch {}
    if (noStorageWrite) { Storage.prototype.setItem = function (k) { if (/^xw-al/.test(k)) throw new Error('quota'); }; }
  }, [theme, seed, noStorageWrite, clipFail, lang]);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url + m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + hash);
  await page.waitForSelector('#limitsBody > *', {state: 'attached'});
  page._ctx = ctx;
  return page;
}
const row = (p, id) => p.locator(`[data-al="${id}"]`);
const radio = (p, id, k) => row(p, id).locator(`input[type=radio][value="${k}"]`);
const pick = async (p, id, k) => { await radio(p, id, k).check({force: true}); };
const msg = p => p.locator('#alMsg').inputValue();
const info = p => p.locator('#alBarInfo').innerText();
const HEAD = /^## \[OWNER\] \d\d:\d\d ICT \d\d\/\d\d: chọn giới hạn AI Studio$/;
const lines = async p => { const m = await msg(p); const l = m.split('\n'); ok(HEAD.test(l[0]), 'header: ' + l[0]); return l.slice(1); };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name + '.png'), fullPage: true}); };
const ids = (p) => p.locator('.al-row').evaluateAll(l => l.map(e => e.dataset.al));
const MONEY = ['L10', 'L11'];
const BULK_OFF = ['L01', 'L02', 'L03', 'L04'];

// ----------------------------------------------------------------------------------------------
const lm = await open();
await T('01 tab present after the hourly tab (vi), route #limits selects it, panel is a tabpanel; English twin name', async () => {
  const i = await lm.evaluate(() => ({
    tabs: [...document.querySelectorAll('#mainTabs [role=tab]')].map(t => t.querySelector('.board-tab-name').textContent),
    sel: document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab,
    panel: document.getElementById('view-limits').getAttribute('role'), ctl: document.getElementById('tab-limits').getAttribute('aria-controls'),
    hidden: ['roadmap', 'process', 'hourly', 'prod', 'owner'].map(v => document.getElementById('view-' + v).hidden),
  }));
  eq(i.tabs.indexOf('Giới hạn AI Studio'), i.tabs.indexOf('Việc chạy mỗi giờ') + 1, JSON.stringify(i.tabs));
  eq(i.sel, 'limits'); eq(i.panel, 'tabpanel'); eq(i.ctl, 'view-limits'); eq(i.hidden, [true, true, true, true, true]);
  await lm.locator('#lang').click();
  eq(await lm.locator('#tab-limits .board-tab-name').innerText(), 'AI Studio limits');
  await lm.locator('#lang').click(); await lm.waitForFunction(() => document.getElementById('limitsTitle').textContent === 'Giới hạn AI Studio');
});
await T('02 top callout shows every ownerAsk and the 5 risks as text; counts by kind and by recommendation are right', async () => {
  eq(await lm.locator('#alAsk li').allInnerTexts(), AL.ownerAsk);
  eq((await lm.locator('#alRisks li').allInnerTexts()).length, 5);
  ok((await lm.locator('#alRisks li').nth(2).innerText()).includes('<script>window.__xss=3</script>'), 'risk escaped as text');
  const k = await lm.locator('#alCountKind li').evaluateAll(l => l.map(e => e.dataset.kind + '=' + e.querySelector('b').textContent));
  const cnt = key => AL.items.filter(i => i.kind === key).length;
  eq(k, ['SETTING', 'CODE CONSTANT', 'BUILD-ENV', 'INFRA'].map(x => x + '=' + cnt(x)));
  const r = await lm.locator('#alCountRec li').evaluateAll(l => l.map(e => e.dataset.rec + '=' + e.querySelector('b').textContent));
  eq(r, ['giữ', 'bỏ giới hạn', 'nâng', 'cần mã'].map(x => x + '=' + AL.items.filter(i => i.recommend === x).length));
  ok(/14 giới hạn · 0 đã chọn/.test(await lm.locator('#alMeta').innerText()), await lm.locator('#alMeta').innerText());
});
await T('03 honest notice text exactly as agreed', async () => {
  eq(await lm.locator('#alNotice').innerText(), 'Anh chọn xong, bấm sao chép và dán lên #88; C0 áp dụng cài đặt đổi nóng ngay ở lần chạy kế tiếp, còn mục cần mã/bản phát hành sẽ thành PR và chờ QA độc lập rồi mới lên PROD.');
});
await T('04 groups by kind are collapsible; compact row shows id, title, current value, kind chip, recommend chip (icon + text)', async () => {
  const g = await lm.locator('details.al-group').evaluateAll(l => l.map(d => d.dataset.kind + ':' + d.querySelectorAll('.al-row').length));
  eq(g, ['SETTING:8', 'CODE CONSTANT:3', 'BUILD-ENV:2', 'INFRA:1']);
  const r = row(lm, 'L01'), t = await r.innerText();
  ok(t.includes('L01') && t.includes('Lượt AI / người / ngày (mặc định)') && t.includes('Giá trị hiện tại 500'), t);
  const chips = await r.locator('.al-meta .al-chip').evaluateAll(l => l.map(c => ({ic: c.querySelector('.al-ci').textContent, ia: c.querySelector('.al-ci').getAttribute('aria-hidden'), t: c.lastChild.textContent})));
  ok(chips.length === 3 && chips.every(c => c.ia === 'true' && c.ic && c.t), JSON.stringify(chips));
  ok(/Cài đặt/.test(chips[0].t) && /Khuyến nghị: bỏ giới hạn/.test(chips[1].t) && /Tắt được/.test(chips[2].t), JSON.stringify(chips));
  const first = lm.locator('details.al-group').first();
  await first.locator('summary').click(); eq(await first.evaluate(d => d.open), false); ok(!(await row(lm, 'L01').isVisible()), 'hidden when collapsed');
  ok(/Thu gọn tất cả/.test(await lm.locator('#alToggleAll').innerText()), 'toggle-all label');
  await first.locator('summary').click(); eq(await first.evaluate(d => d.open), true);
  await lm.locator('#alToggleAll').click(); eq(await lm.locator('details.al-group[open]').count(), 0); ok(/Mở tất cả/.test(await lm.locator('#alToggleAll').innerText()));
  await lm.locator('#alToggleAll').click(); eq(await lm.locator('details.al-group[open]').count(), 4);
});
await T('05 initial: nothing pending, preview placeholder, send/copy/undo-all disabled, no badge', async () => {
  ok(/Chưa có lựa chọn nào/.test(await info(lm))); ok(/Chưa có lựa chọn/.test(await msg(lm)));
  for (const id of ['alSend', 'alCopy', 'alUndoAll']) ok(await lm.locator('#' + id).isDisabled(), id);
  ok(!(await lm.locator('#limitsTabCount').isVisible()), 'badge');
  eq(await lm.evaluate(() => localStorage.getItem('xw-al:')), null);
});
await T('06 each choice kind produces its machine line: GIỮ / BỎ / GIÁ TRỊ <value> <unit> / KHUYẾN NGHỊ, in item order', async () => {
  await pick(lm, 'L06', 'rec'); await pick(lm, 'L01', 'off'); await pick(lm, 'L05', 'keep'); await pick(lm, 'L03', 'val');
  await lm.locator('#al-v-L03').fill('5000000');
  eq(await lines(lm), ['- L01: BỎ', '- L03: GIÁ TRỊ 5000000 tokens', '- L05: GIỮ', '- L06: KHUYẾN NGHỊ']);
  ok(/Chờ gửi: 4 lựa chọn/.test(await info(lm)), await info(lm));
  eq(await lm.locator('#limitsTabCount').innerText(), '4');
  ok(/4 lựa chọn chờ gửi/.test(await lm.locator('#tab-limits').getAttribute('aria-label')));
  eq(await row(lm, 'L01').getAttribute('data-choice'), 'off');
  eq(await lm.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('xw-al:')).c).sort()), ['L01', 'L03', 'L05', 'L06']);
});
await T('07 optional note is appended as " // note", newlines/extra spaces stripped; note kept when the choice changes', async () => {
  await row(lm, 'L01').locator('#al-n-L01').fill('  cứ  làm\nnhư\r\nvậy  ');
  eq((await lines(lm))[0], '- L01: BỎ // cứ làm như vậy');
  await pick(lm, 'L01', 'keep'); eq((await lines(lm))[0], '- L01: GIỮ // cứ làm như vậy');
  await row(lm, 'L01').locator('#al-n-L01').fill('a // b'); eq((await lines(lm))[0], '- L01: GIỮ // a // b');
});
await T('08 "Đặt giá trị…": empty value is flagged (aria-invalid + message) and kept out of the message; value is flattened, "//" collapsed; unit is the row unit', async () => {
  await pick(lm, 'L02', 'val');
  eq(await lm.locator('#al-v-L02').getAttribute('aria-invalid'), 'true'); ok(/Nhập giá trị/.test(await lm.locator('#al-e-L02').innerText()));
  ok(!(await lines(lm)).some(l => l.startsWith('- L02')), 'not in message'); ok(/1 hàng "Đặt giá trị" chưa nhập/.test(await info(lm)), await info(lm));
  await lm.locator('#al-v-L02').fill('  100 \n // 200 '); eq(await lm.locator('#al-v-L02').getAttribute('aria-invalid'), 'false');
  ok((await lines(lm)).includes('- L02: GIÁ TRỊ 100/200 count'), (await lines(lm)).join('|'));
  await pick(lm, 'L02', 'rec'); ok((await lines(lm)).includes('- L02: KHUYẾN NGHỊ'), 'switching away');
});
await T('09 each option has a visible label tied to its radio (radio group in a fieldset+legend); recommended option marked by text, not only colour', async () => {
  const o = await row(lm, 'L07').evaluate(r => ({leg: r.querySelector('legend').textContent, fs: r.querySelectorAll('fieldset').length,
    labels: [...r.querySelectorAll('label.al-opt')].map(l => l.innerText.replace(/\s+/g, ' ').trim()), names: new Set([...r.querySelectorAll('input[type=radio]')].map(i => i.name)).size,
    star: [...r.querySelectorAll('.al-star')].map(s => s.closest('label').querySelector('input').value)}));
  eq(o.fs, 1); eq(o.names, 1); ok(/Anh chọn cho L07/.test(o.leg), o.leg);
  ok(o.labels[0].startsWith('Giữ nguyên') && o.labels[1].startsWith('Bỏ giới hạn (tắt)') && o.labels[2].startsWith('Đặt giá trị…') && o.labels[3].startsWith('Theo khuyến nghị'), JSON.stringify(o.labels));
  eq(o.star, ['keep'], 'giữ -> Giữ nguyên marked'); ok(/★ khuyến nghị/.test(o.labels[0]));
  for (const [id, k] of [['L01', 'off'], ['L05', 'val'], ['L06', 'rec']]) eq(await row(lm, id).locator('.al-star').evaluateAll(l => l.map(s => s.closest('label').querySelector('input').value)), [k], id);
  ok(/giữ/.test(o.labels[3]), 'rec option names the recommendation');
});
await T('10 per-row undo removes only that row (and its note); undo-all clears everything; badge/preview reset', async () => {
  await row(lm, 'L01').locator('.al-pend .al-link').click();
  ok(!(await lines(lm)).some(l => l.startsWith('- L01')), 'L01 gone'); eq(await row(lm, 'L01').getAttribute('data-choice'), null);
  ok(await lm.evaluate(() => /^al-r-L01/.test(document.activeElement.name || '')), 'focus stays inside the row after undo');
  await lm.locator('#alUndoAll').click();
  ok(/Chưa có lựa chọn/.test(await msg(lm))); eq(await lm.locator('.al-row[data-choice]').count(), 0);
  eq(await lm.evaluate(() => JSON.parse(localStorage.getItem('xw-al:')).c), {}); ok(!(await lm.locator('#limitsTabCount').isVisible()), 'badge');
});
await T('11 money rows: lock + "giữ (giới hạn tiền)" text, no radio/input/choice; detected by unit money AND by title; token budget is not money', async () => {
  for (const id of MONEY) {
    const r = row(lm, id); eq(await r.getAttribute('data-money'), '1', id);
    eq(await r.locator('input').count(), 0, 'no inputs ' + id); eq(await r.locator('.al-lock svg').count(), 1);
    ok(/giữ \(giới hạn tiền\)/.test(await r.locator('.al-lock').innerText()), id);
  }
  ok((await row(lm, 'L13').locator('input[type=radio]').count()) === 4, 'ngân sách ngữ cảnh (token) is not money-locked');
  eq(await row(lm, 'L10').getAttribute('data-money'), '1'); eq(await row(lm, 'L12').getAttribute('data-money'), null);
});
await T('12 bulk "Áp dụng khuyến nghị": only rows without a choice, never money rows, never overrides an earlier choice', async () => {
  await pick(lm, 'L01', 'keep'); await pick(lm, 'L02', 'off');
  ok(/\(10\)/.test(await lm.locator('#alBulkRec').innerText()), await lm.locator('#alBulkRec').innerText());
  await lm.locator('#alBulkRec').click();
  const l = await lines(lm); eq(l.length, 12, l.join('|'));
  ok(l.includes('- L01: GIỮ') && l.includes('- L02: BỎ'), 'earlier choices kept');
  ok(l.includes('- L05: KHUYẾN NGHỊ') && l.includes('- L14: KHUYẾN NGHỊ'), 'others follow recommendation');
  ok(!l.some(x => /^- L1[01]:/.test(x)), 'money rows excluded');
  ok(await lm.locator('#alBulkRec').isDisabled(), 'nothing left to apply');
  eq(await lm.locator('.al-row[data-choice]').count(), 12);
});
await T('13 bulk "Bỏ giới hạn cho các hàng đếm lượt/token": exactly offPossible===true count/token rows; never false/unknown, mixed, money', async () => {
  await lm.locator('#alUndoAll').click();
  ok(/\(4\)/.test(await lm.locator('#alBulkOff').innerText()), await lm.locator('#alBulkOff').innerText());
  await lm.locator('#alBulkOff').click();
  eq(await lines(lm), BULK_OFF.map(i => `- ${i}: BỎ`));
  for (const id of ['L05', 'L06', 'L08', 'L09', 'L10', 'L11', 'L14']) eq(await row(lm, id).getAttribute('data-choice'), null, id + ' must stay unchosen');
  const offs = AL.items.filter(i => i.offPossible === true).map(i => i.id); ok(offs.includes('L09') && offs.includes('L14'), 'fixture has true-but-not-count rows');
});
await T('14 a single-row BỎ on a row that cannot be switched off is allowed but warned (becomes code/release work)', async () => {
  await lm.locator('#alUndoAll').click(); await pick(lm, 'L05', 'off');
  ok(/Không tắt được bằng cài đặt: chọn này sẽ thành việc cần mã/.test(await row(lm, 'L05').innerText()), 'warning');
  eq(await lines(lm), ['- L05: BỎ']); await lm.locator('#alUndoAll').click();
});
await T('15 filters: kind, recommend, text search (accent- and case-insensitive, all words), "chưa chọn", reset; counts update', async () => {
  await lm.locator('#alFKind').selectOption('INFRA'); eq(await ids(lm), ['L08']); ok(/Hiển thị 1\/14/.test(await lm.locator('#alShown').innerText()));
  eq(await lm.locator('details.al-group').count(), 1);
  await lm.locator('#alFReset').click(); eq((await ids(lm)).length, 14);
  await lm.locator('#alFRec').selectOption('cần mã'); eq(await ids(lm), ['L06']);
  await lm.locator('#alFRec').selectOption('nâng'); eq(await ids(lm), ['L05']);
  await lm.locator('#alFReset').click();
  await lm.locator('#alFQ').fill('LUOT ai'); eq(await ids(lm), ['L01', 'L02', 'L04']);
  await lm.locator('#alFQ').fill('tenant'); eq(await ids(lm), ['L04']);
  await lm.locator('#alFQ').fill('đậm'); eq(await ids(lm), ['L12'], 'matches current text');
  await lm.locator('#alFQ').fill('zzz khong'); eq(await ids(lm), []); ok(/Không có hàng nào khớp/.test(await lm.locator('#alGroups').innerText()));
  await lm.locator('#alFReset').click(); eq(await lm.locator('#alFQ').inputValue(), '');
  await pick(lm, 'L01', 'keep'); await lm.locator('#alFTodo').check();
  const v = await ids(lm); ok(!v.includes('L01') && !v.includes('L10') && !v.includes('L11') && v.length === 11, v.join(','));
  ok(/Hiển thị 11\/14/.test(await lm.locator('#alShown').innerText()));
  await lm.locator('#alFKind').selectOption('SETTING'); await lm.locator('#alFRec').selectOption('giữ'); eq(await ids(lm), ['L04', 'L12']);
  await lm.locator('#alFReset').click(); await lm.locator('#alUndoAll').click(); eq((await ids(lm)).length, 14);
});
await T('16 persistence: staged choices survive reload (prefix xw-al:), stale ids and money rows in storage are dropped', async () => {
  const p = await open({seed: {c: {L01: {k: 'off', v: '', n: 'ghi chú'}, L10: {k: 'off', v: '', n: ''}, ZZ99: {k: 'keep', v: '', n: ''}, L02: {k: 'weird', v: '', n: ''}, L03: {k: 'val', v: '7', n: ''}}, sent: ''}});
  eq(await lines(p), ['- L01: BỎ // ghi chú', '- L03: GIÁ TRỊ 7 tokens']);
  await pick(p, 'L05', 'keep'); await p.reload(); await p.waitForSelector('#limitsBody > *', {state: 'attached'});
  eq(await lines(p), ['- L01: BỎ // ghi chú', '- L03: GIÁ TRỊ 7 tokens', '- L05: GIỮ']);
  eq(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('xw-al:')).c)), ['L01', 'L03', 'L05']);
  await p._ctx.close();
});
await T('17 localStorage writes throwing: tab still works in memory (try/catch around storage)', async () => {
  const p = await open({noStorageWrite: true}); await pick(p, 'L01', 'off'); await pick(p, 'L05', 'keep');
  eq(await lines(p), ['- L01: BỎ', '- L05: GIỮ']); eq(await p.evaluate(() => localStorage.getItem('xw-al:')), null);
  await p.locator('#alBulkRec').click(); eq((await lines(p)).length, 12); await p._ctx.close();
});
await T('18 escaping: markup in title/current/what/offHow/danger/note/risks is shown as text, nothing executes, no injected elements', async () => {
  const p = await open(); await row(p, 'L12').locator('.al-exp').click(); await pick(p, 'L12', 'rec'); await row(p, 'L12').locator('#al-n-L12').fill('<img src=y onerror="window.__xss=9">');
  ok(await p.evaluate(() => window.__xss === undefined), 'xss ran');
  const r = row(p, 'L12'); eq(await r.locator('img,script,b,i,u').count(), 0, 'injected tags');
  const t = await r.innerText(); ok(t.includes('<img src=x onerror=') && t.includes('<b>đậm?</b>') && t.includes('<script>window.__xss=2</script>') && t.includes('<i>nghiêng</i>') && t.includes('<u>gạch</u>'), t);
  eq(await p.locator('#limitsBody .al-datanote b').count(), 0); ok((await p.locator('#alMeta').innerText()).length > 0);
  ok((await msg(p)).includes('- L12: KHUYẾN NGHỊ // <img src=y onerror="window.__xss=9">'), 'note text in message');
  eq(await p.locator('#limitsBody img,#limitsBody script').count(), 0); await p._ctx.close();
});
await T('19 details: what, where, offHow, danger, estimated hours, needs-release chip (icon + text), toggle with aria-expanded/controls', async () => {
  const r = row(lm, 'L05'), b = r.locator('.al-exp');
  eq(await b.getAttribute('aria-expanded'), 'false'); ok(!(await r.locator('.al-detail').isVisible()), 'closed');
  await b.click(); eq(await b.getAttribute('aria-expanded'), 'true'); eq(await b.getAttribute('aria-controls'), await r.locator('.al-detail').getAttribute('id'));
  const t = await r.locator('.al-detail').innerText();
  ok(t.includes('Mô tả L05') && t.includes('nơi/L05.kt:1') && t.includes('Cách bỏ L05') && t.includes('Rủi ro L05') && /2 giờ/.test(t) && t.includes('1000'), t);
  const chip = await r.locator('.al-detail .al-chip').evaluate(c => ({ic: c.querySelector('.al-ci').textContent, t: c.lastChild.textContent}));
  eq(chip, {ic: '⚑', t: 'Cần bản phát hành'});
  await row(lm, 'L01').locator('.al-exp').click(); ok(/Không cần bản phát hành/.test(await row(lm, 'L01').locator('.al-detail').innerText()));
  await row(lm, 'L08').locator('.al-exp').click(); ok(/Chưa rõ có cần bản phát hành/.test(await row(lm, 'L08').locator('.al-detail').innerText()));
  await pick(lm, 'L05', 'keep'); eq(await row(lm, 'L05').locator('.al-exp').getAttribute('aria-expanded'), 'true', 'open state survives re-render');
  await lm.locator('#alUndoAll').click();
});
await T('20 offPossible variants are shown as text chips: true "Tắt được", false "Không tắt được", unknown "Chưa rõ"', async () => {
  const f = id => row(lm, id).locator('.al-meta .al-chip').last().innerText();
  ok(/Tắt được bằng cài đặt/.test(await f('L01'))); ok(/Không tắt được bằng cài đặt/.test(await f('L05'))); ok(/Chưa rõ có tắt được/.test(await f('L08')));
  const ic = await lm.locator('.al-row').evaluateAll(l => new Set(l.map(r => r.dataset.off + r.querySelector('.al-meta .al-chip:last-child .al-ci').textContent)).size); eq(ic, 3);
});
await T('21 keyboard: arrow keys move through the radio group, Space/Enter work on buttons, tab order reaches note/undo after a choice', async () => {
  const p = await open(); await radio(p, 'L07', 'keep').focus(); await p.keyboard.press('ArrowDown');
  eq(await radio(p, 'L07', 'off').isChecked(), true); ok(await p.evaluate(() => document.activeElement.value === 'off' || document.activeElement.dataset.alf === 'L07:off'), 'focus kept after re-render');
  await p.keyboard.press('ArrowDown'); ok(/Chưa có lựa chọn/.test(await msg(p)), 'incomplete value not in message');
  eq(await radio(p, 'L07', 'val').isChecked(), true); ok(await p.evaluate(() => document.activeElement.id === 'al-v-L07'), 'focus moves to the value input');
  await p.keyboard.type('8 MiB'); eq(await lines(p), ['- L07: GIÁ TRỊ 8 MiB bytes']);
  const x = row(p, 'L07').locator('.al-exp'); await x.focus(); await p.keyboard.press('Enter'); eq(await x.getAttribute('aria-expanded'), 'true'); await p.keyboard.press('Space'); eq(await x.getAttribute('aria-expanded'), 'false');
  await row(p, 'L07').locator('.al-link').focus(); await p.keyboard.press('Enter'); eq(await row(p, 'L07').getAttribute('data-choice'), null);
  await p._ctx.close();
});
await T('22 copy: clipboard gets exactly the preview text; "Sao chép & mở #88" opens the #88 comment link; sent marker cleared by a new change', async () => {
  await pick(lm, 'L01', 'off'); await lm.locator('#alCopy').click();
  const clip = await lm.evaluate(() => window.__clip); eq(clip.length, 1); ok(HEAD.test(clip[0].split('\n')[0]), 'header'); eq(clip[0], await msg(lm), 'clipboard == preview');
  ok(/đã sao chép/.test(await info(lm)), await info(lm));
  await lm.locator('#alSend').click(); await lm.waitForFunction(() => window.__clip.length === 2);
  eq(await lm.evaluate(() => window.__opened), ['https://github.com/luan20495/xweb01/issues/88#issuecomment-new']);
  await pick(lm, 'L05', 'keep'); ok(!/đã sao chép/.test(await info(lm)), 'marker cleared'); await lm.locator('#alUndoAll').click();
});
await T('23 clipboard denied: text is selected and a manual-copy hint is shown; staged data kept', async () => {
  const p = await open({clipFail: true}); await pick(p, 'L01', 'off'); await p.locator('#alCopy').click();
  ok(/Ctrl\/Cmd\+C/.test(await p.locator('#alHint').innerText()), 'hint'); eq(await lines(p), ['- L01: BỎ']);
  ok(await p.evaluate(() => document.activeElement.id === 'alMsg'), 'textarea focused'); await p._ctx.close();
});
await T('24 missing aiLimits: friendly empty state, no errors, other tabs unaffected', async () => {
  current = withoutLimits; const p = await open(); ok(/Chưa có dữ liệu giới hạn/.test(await p.locator('#limitsBody').innerText()), 'empty');
  await p.locator('#tab-process').click(); await p.waitForSelector('.pc-g'); ok(await p.locator('.pc-g').count() >= 8, 'process tab still renders');
  await p._ctx.close(); current = withLimits;
});
await T('25 English twin: labels, notice, chips and bulk buttons translate; machine lines stay Vietnamese', async () => {
  const p = await open({lang: 'en'}); await p.waitForFunction(() => document.getElementById('limitsTitle').textContent === 'AI Studio limits');
  ok((await p.locator('#alNotice').innerText()).startsWith('Once you have chosen, copy and paste to #88'));
  ok(/Keep as is/.test(await row(p, 'L07').innerText()) && /Remove limit \(off\)/.test(await row(p, 'L07').innerText()) && /Set a value…/.test(await row(p, 'L07').innerText()) && /Follow recommendation/.test(await row(p, 'L07').innerText()));
  ok(/Apply the recommendation to every row not yet chosen/.test(await p.locator('#alBulkRec').innerText()) && /Remove the limit for run-count\/token rows/.test(await p.locator('#alBulkOff').innerText()));
  ok(/keep \(money limit\)/.test(await row(p, 'L10').innerText()));
  await pick(p, 'L03', 'off'); ok(/Pending: 1 choice/.test(await info(p)), await info(p)); eq(await lines(p), ['- L03: BỎ']); await p._ctx.close();
});
await T('26 existing tabs still switch correctly next to the new one (6 panels, one visible at a time, hash routing, arrow keys)', async () => {
  const p = await open({hash: '#roadmap/1'}); const V = ['roadmap', 'process', 'hourly', 'limits', 'prod', 'owner'];
  for (const v of V) {
    await p.locator('#tab-' + v).click();
    eq(await p.evaluate(vs => vs.filter(x => !document.getElementById('view-' + x).hidden), V), [v], 'visible after ' + v); ok((await p.evaluate(() => location.hash)).startsWith('#' + v), 'hash ' + v);
  }
  await p.locator('#tab-hourly').focus(); await p.keyboard.press('ArrowRight');
  eq(await p.evaluate(() => document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab), 'limits'); await p.keyboard.press('ArrowRight');
  eq(await p.evaluate(() => document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab), 'prod');
  await p.evaluate(() => { location.hash = '#limits'; }); await p.waitForFunction(() => !document.getElementById('view-limits').hidden);
  await p._ctx.close();
});
await T('27 real status.json aiLimits: 69 rows render, grouped, with only the money rows locked; bulk counts consistent with the data', async () => {
  current = JSON.stringify(Object.assign({}, base, {aiLimits: REAL})); const p = await open();
  eq(await p.locator('.al-row').count(), REAL.items.length); ok(REAL.items.length >= 60, 'rows');
  const locked = await p.locator('.al-row[data-money="1"]').evaluateAll(l => l.map(e => e.dataset.al)); ok(locked.length >= 2 && locked.length <= 6, locked.join(','));
  for (const id of locked) ok(/^L(31|63)$/.test(id) || /tiền|chi phí|ngân sách/i.test(REAL.items.find(i => i.id === id).title), id);
  await p.locator('#alBulkOff').click(); const l = await lines(p);
  for (const x of l) { const id = x.slice(2, 5); const it = REAL.items.find(i => i.id === id); ok(it.offPossible === true && !locked.includes(id), 'bulk off included ' + id); }
  ok(l.length >= 5, 'some rows'); await p.locator('#alBulkRec').click(); eq((await lines(p)).length, REAL.items.length - locked.length);
  await shot(p, 'limits-real-1280'); await p._ctx.close(); current = withLimits;
});
for (const [w, h] of [[1280, 900], [390, 844]]) for (const theme of ['light', 'dark']) {
  await T(`28 [${w}-${theme}] no horizontal scroll with everything open and chosen; controls >= 44px; nothing wider than the viewport`, async () => {
    const p = await open({w, h, theme, scheme: theme});
    await p.locator('#alBulkRec').click(); await p.locator('#alBulkOff').click(); await pick(p, 'L02', 'val'); await p.locator('#al-v-L02').fill('9'.repeat(60));
    for (const id of ['L12', 'L05']) await row(p, id).locator('.al-exp').click();
    await row(p, 'L12').locator('#al-n-L12').fill('n'.repeat(190));
    const m = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      wide: [...document.querySelectorAll('#view-limits *')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5 && getComputedStyle(e).position !== 'fixed' && !e.closest('.al-live')).map(e => e.className || e.tagName).slice(0, 5),
      small: [...document.querySelectorAll('#view-limits button,#view-limits input:not([type=checkbox]),#view-limits select,#view-limits textarea,#view-limits summary,#mainTabs [role=tab]')].filter(e => e.offsetParent).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(e => e.className || e.id).slice(0, 5)}));
    eq(m.sw, m.cw, 'horizontal scroll'); eq(m.wide, [], 'overflowing'); eq(m.small, [], 'small targets');
    eq(await p.locator('#mainTabs [role=tab]').count(), 6); await shot(p, `limits-${w}-${theme}`); await p._ctx.close();
  });
}
await T('29 dark theme uses dark surfaces for rows, notice and chips; recommend chips stay distinct (4 backgrounds)', async () => {
  const p = await open({theme: 'dark', scheme: 'dark'});
  const m = await p.evaluate(() => { const bg = s => getComputedStyle(document.querySelector(s)).backgroundColor; const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return (r * 299 + g * 587 + b * 114) / 1000; };
    return {row: lum(bg('.al-row')), page: lum(bg('body')), notice: lum(bg('.al-notice')), chips: new Set([...document.querySelectorAll('#alCountRec .al-chip')].map(c => getComputedStyle(c).backgroundColor)).size}; });
  ok(m.row < 80 && m.page < 80 && m.notice < 100, JSON.stringify(m)); eq(m.chips, 4); await p._ctx.close();
});
await T('30 [light/dark] axe-core: 0 serious/critical on the limits tab (with choices, details open, a money row, a value input)', async () => {
  if (!axeSrc) return 'NOT_RUN';
  const out = [];
  for (const theme of ['light', 'dark']) {
    const p = await open({theme, scheme: theme}); await pick(p, 'L03', 'val'); await pick(p, 'L01', 'off'); await row(p, 'L01').locator('.al-exp').click();
    await p.addScriptTag({content: axeSrc});
    const r = await p.evaluate(async () => (await axe.run('#view-limits', {runOnly: ['wcag2a', 'wcag2aa']})).violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ') + ' ' + (n.any[0] ? n.any[0].message : '')).join(' ; ')));
    if (r.length) out.push(theme + ' ' + r.join(','));
    await p._ctx.close();
  }
  ok(!out.length, out.join(' | '));
});
await T('31 no console errors during the whole run', async () => { eq(consoleErrors, []); });

await browser.close(); server.close();
const w = Math.max(...results.map(r => r[0].length));
for (const [n, s, d] of results) console.log(`${s.padEnd(8)} ${n.padEnd(w)}  ${d}`);
const c = k => results.filter(r => r[1] === k).length;
console.log(`\nPASS ${c('PASS')}  FAIL ${c('FAIL')}  NOT_RUN ${c('NOT_RUN')}${SHOTS ? '  screenshots: ' + SHOTS : ''}`);
process.exit(c('FAIL') ? 1 : 0);
