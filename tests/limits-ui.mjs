// Automated UI check for the "Giới hạn AI Studio" tab (#limits).
// Run:  node tests/limits-ui.mjs            (needs Playwright, see below)
// Env:  PW_MODULE=<path to playwright or playwright-core>   SHOTS=<dir for screenshots>   AXE=<path to axe.min.js, optional>
// It serves index.html from this repo on 127.0.0.1 and replaces status.json with tests/fixtures/status.process.json
// plus the `aiLimits` object of tests/fixtures/limits.json (14 representative rows incl. the enriched fields: group,
// dev, prod, impact, risk, mandatory, state). One test also renders the repo's real status.json `aiLimits` (read only). Nothing is written to status.json.
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
// the sticky dock may cover a row: centre it first, then tick (force: the native input is visually hidden behind its label)
const centre = l => l.evaluate(e => e.scrollIntoView({block: 'center', behavior: 'instant'}));
const pick = async (p, id, k) => { const r = radio(p, id, k); await centre(r); await r.check({force: true}); };
const msg = p => p.locator('#alMsg').inputValue();
const info = p => p.locator('#alBarInfo').innerText();
const HEAD = /^## \[OWNER\] \d\d:\d\d ICT \d\d\/\d\d: chọn giới hạn AI Studio$/;
const lines = async p => { const m = await msg(p); const l = m.split('\n'); ok(HEAD.test(l[0]), 'header: ' + l[0]); return l.slice(1); };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name + '.png'), fullPage: true}); };
const ids = (p) => p.locator('.al-row').evaluateAll(l => l.map(e => e.dataset.al));
const LOCKED = ['L10', 'L11', 'L14'];
const GROUPS = ['Lượt & token AI', 'Hàng đợi & build', 'File & ảnh', 'Hạ tầng & truyền tải', 'Kế hoạch chia bước & tool loop', 'Tiền & ngân sách', 'Prompt & văn bản', 'Tham chiếu & tìm kiếm'];
const chk = (p, id) => row(p, id).locator('input.al-sel');
const clean = p => p.evaluate(() => { document.querySelector('#alSelNone')?.click(); });

// ----------------------------------------------------------------------------------------------
const lm = await open();
const stateOf = p => p.locator('.al-row').evaluateAll(l => Object.fromEntries(l.map(r => [r.dataset.al, r.dataset.state])));
await T('01 tab sits IMMEDIATELY after "Quy trình & cấu hình" (before the hourly tab), route #limits selects it, panel is a tabpanel; English twin name', async () => {
  const i = await lm.evaluate(() => ({
    tabs: [...document.querySelectorAll('#mainTabs [role=tab]')].map(t => t.dataset.boardTab),
    names: [...document.querySelectorAll('#mainTabs [role=tab]')].map(t => t.querySelector('.board-tab-name').textContent),
    panels: [...document.querySelectorAll('.board-view')].map(v => v.id),
    sel: document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab,
    panel: document.getElementById('view-limits').getAttribute('role'), ctl: document.getElementById('tab-limits').getAttribute('aria-controls'),
    hidden: ['roadmap', 'process', 'hourly', 'prod', 'owner'].map(v => document.getElementById('view-' + v).hidden),
  }));
  eq(i.tabs, ['roadmap', 'process', 'limits', 'hourly', 'prod', 'owner']); eq(i.names[2], 'Giới hạn AI Studio'); eq(i.names[1], 'Quy trình & cấu hình');
  eq(i.panels, ['view-roadmap', 'view-process', 'view-limits', 'view-hourly', 'view-prod', 'view-owner']);
  eq(i.sel, 'limits'); eq(i.panel, 'tabpanel'); eq(i.ctl, 'view-limits'); eq(i.hidden, [true, true, true, true, true]);
  await lm.locator('#lang').click();
  eq(await lm.locator('#tab-limits .board-tab-name').innerText(), 'AI Studio limits');
  await lm.locator('#lang').click(); await lm.waitForFunction(() => document.getElementById('limitsTitle').textContent === 'Giới hạn AI Studio');
});
await T('02 top callout shows every ownerAsk and the 5 risks as text; counts by state, kind, recommendation and mandatory are right', async () => {
  eq(await lm.locator('#alAsk li').allInnerTexts(), AL.ownerAsk);
  eq((await lm.locator('#alRisks li').allInnerTexts()).length, 5);
  ok((await lm.locator('#alRisks li').nth(2).innerText()).includes('<script>window.__xss=3</script>'), 'risk escaped as text');
  const k = await lm.locator('#alCountKind li').evaluateAll(l => l.map(e => e.dataset.kind + '=' + e.querySelector('b').textContent));
  const cnt = key => AL.items.filter(i => i.kind === key).length;
  eq(k, ['SETTING', 'CODE CONSTANT', 'BUILD-ENV', 'INFRA'].map(x => x + '=' + cnt(x)));
  const r = await lm.locator('#alCountRec li').evaluateAll(l => l.map(e => e.dataset.rec + '=' + e.querySelector('b').textContent));
  eq(r, ['giữ', 'bỏ giới hạn', 'nâng', 'cần mã'].map(x => x + '=' + AL.items.filter(i => i.recommend === x).length));
  eq(await lm.locator('#alCountState li[data-state]').evaluateAll(l => l.map(e => e.dataset.state + '=' + e.querySelector('b').textContent)), ['proposed=11', 'approved=1', 'applied=1', 'verified=1']);
  eq(await lm.locator('#alCountMand li').evaluateAll(l => l.map(e => e.dataset.mand + '=' + e.querySelector('b').textContent)), ['yes=3', 'no=11']);
  ok(/Chờ gửi: 0/.test(await lm.locator('#alCountPend').innerText()), 'pending count chip');
  ok(/14 giới hạn · 0 đã chọn/.test(await lm.locator('#alMeta').innerText()), await lm.locator('#alMeta').innerText());
});
await T('03 honest notice exactly as agreed; one sentence says staged choices are "chờ gửi", not an approval; legend explains the 4 states and that DEV is the code default', async () => {
  eq(await lm.locator('#alNotice').innerText(), 'Anh chọn xong, bấm sao chép và dán lên #88; C0 áp dụng cài đặt đổi nóng ngay ở lần chạy kế tiếp, còn mục cần mã/bản phát hành sẽ thành PR và chờ QA độc lập rồi mới lên PROD.');
  eq(await lm.locator('#alPendNote').innerText(), 'Lựa chọn anh bấm trên trang này chỉ là "chờ gửi" (lưu trong trình duyệt), chưa phải duyệt, cho đến khi anh dán tin nhắn lên #88.');
  const l = await lm.locator('#alLegend li').evaluateAll(x => x.map(e => e.dataset.state + '|' + e.innerText.replace(/\s+/g, ' ')));
  eq(l.map(x => x.split('|')[0]), ['proposed', 'approved', 'applied', 'verified']);
  ok(/Đề xuất/.test(l[0]) && /Đã duyệt/.test(l[1]) && /Đã áp dụng/.test(l[2]) && /REPORTED/.test(l[2]) && /Đã kiểm chứng/.test(l[3]) && /độc lập/.test(l[3]), l.join(' / '));
  const dn = await lm.locator('#alDevNote').innerText(); ok(/mặc định đọc từ mã nguồn/.test(dn) && /chưa được đọc/.test(dn), dn);
});
await T('04 list is grouped by `group` (collapsible); compact row: id, title, PROD value, DEV (code default) value, impact / risk / recommend / state chips with icon + text', async () => {
  const g = await lm.locator('details.al-group').evaluateAll(l => l.map(d => d.dataset.group + ':' + d.querySelectorAll('.al-row').length));
  eq(g, ['Lượt & token AI:4', 'Hàng đợi & build:1', 'File & ảnh:2', 'Hạ tầng & truyền tải:1', 'Kế hoạch chia bước & tool loop:1', 'Tiền & ngân sách:2', 'Prompt & văn bản:1', 'Tham chiếu & tìm kiếm:1', ':1']);
  const r = row(lm, 'L01'), t = await r.innerText();
  ok(t.includes('L01') && t.includes('Lượt AI / người / ngày (mặc định)'), t);
  const v = await r.locator('.al-v').evaluateAll(l => l.map(e => e.querySelector('.al-vl').textContent + '=' + e.querySelector('.al-vv').textContent));
  eq(v, ['PROD (giá trị gần nhất đã biết)=Giá trị PROD L01: 500', 'DEV: mặc định trong mã=Mặc định trong mã L01: 50']);
  const chips = await r.locator('.al-meta .al-chip').evaluateAll(l => l.map(c => ({ic: c.querySelector('.al-ci').textContent, ia: c.querySelector('.al-ci').getAttribute('aria-hidden'), t: c.lastChild.textContent})));
  ok(chips.length === 6 && chips.every(c => c.ia === 'true' && c.ic && c.t), JSON.stringify(chips));
  ok(/Đã áp dụng/.test(chips[0].t) && /Ảnh hưởng: Cao/.test(chips[1].t) && /Rủi ro: Trung bình/.test(chips[2].t) && /Khuyến nghị: bỏ giới hạn/.test(chips[3].t) && /Cài đặt/.test(chips[4].t) && /Tắt được/.test(chips[5].t), JSON.stringify(chips));
  eq(await lm.locator('details.al-group').count(), 9);
  const first = lm.locator('details.al-group').first();
  await first.locator('summary').click(); eq(await first.evaluate(d => d.open), false); ok(!(await row(lm, 'L01').isVisible()), 'hidden when collapsed');
  await lm.waitForFunction(() => /Mở tất cả/.test(document.getElementById('alToggleAll').textContent), null, {timeout: 5000});
  await first.locator('summary').click(); eq(await first.evaluate(d => d.open), true);
  await lm.waitForFunction(() => /Thu gọn tất cả/.test(document.getElementById('alToggleAll').textContent), null, {timeout: 5000});
  await lm.locator('#alToggleAll').click(); eq(await lm.locator('details.al-group[open]').count(), 0); ok(/Mở tất cả/.test(await lm.locator('#alToggleAll').innerText()));
  await lm.locator('#alToggleAll').click(); eq(await lm.locator('details.al-group[open]').count(), 9);
});
await T('05 values: UNKNOWN is shown as "chưa rõ"; a row with none of the new fields (L13) still renders with "chưa rõ"/"—" chips and the legacy "Hiện tại" line; no error', async () => {
  const v = await row(lm, 'L08').locator('.al-vv').allInnerTexts(); eq(v, ['chưa rõ', 'chưa rõ']);
  eq(await row(lm, 'L08').locator('.al-vv.al-unk').count(), 2);
  const r13 = row(lm, 'L13'); eq(await r13.locator('.al-vals').count(), 0); ok(/Hiện tại: /.test(await r13.locator('.al-cur').innerText()), 'legacy current');
  const c = await r13.locator('.al-meta .al-chip').allInnerTexts();
  ok(c.some(x => /Ảnh hưởng: chưa rõ/.test(x)) && c.some(x => /Rủi ro: chưa rõ/.test(x)) && c.some(x => /Đề xuất/.test(x)), c.join('|'));
  eq(await r13.getAttribute('data-state'), 'proposed'); eq(await r13.locator('input[type=radio]').count(), 4, 'L13 is not locked');
  ok(/Chưa phân nhóm/.test(await lm.locator('details.al-group[data-group=""] summary').innerText()), 'ungrouped row goes to its own group'); eq(await lm.locator('details.al-group[data-group=""] .al-row').evaluateAll(l => l.map(e => e.dataset.al)), ['L13']);
  eq(await lm.locator('#alGroupChips .al-gchip').count(), 9, 'ungrouped has no chip');
});
await T('06 initial: nothing pending, preview placeholder, send/copy/undo-all disabled, sticky dock hidden, no badge', async () => {
  ok(/Chưa có lựa chọn nào/.test(await info(lm))); ok(/Chưa có lựa chọn/.test(await msg(lm)));
  for (const id of ['alSend', 'alCopy', 'alUndoAll']) ok(await lm.locator('#' + id).isDisabled(), id);
  ok(!(await lm.locator('#alDock').isVisible()), 'dock hidden'); ok(!(await lm.locator('#limitsTabCount').isVisible()), 'badge');
  eq(await lm.evaluate(() => localStorage.getItem('xw-al:')), null);
});
await T('07 each choice kind produces its machine line: GIỮ / BỎ / GIÁ TRỊ <value> <unit> / KHUYẾN NGHỊ, in item order; state of the row is NOT changed by staging', async () => {
  const before = await stateOf(lm);
  await pick(lm, 'L06', 'rec'); await pick(lm, 'L01', 'off'); await pick(lm, 'L05', 'keep'); await pick(lm, 'L03', 'val');
  await lm.locator('#al-v-L03').fill('5000000');
  eq(await lines(lm), ['- L01: BỎ', '- L03: GIÁ TRỊ 5000000 tokens', '- L05: GIỮ', '- L06: KHUYẾN NGHỊ']);
  ok(/Chờ gửi: 4 lựa chọn/.test(await info(lm)), await info(lm));
  eq(await lm.locator('#limitsTabCount').innerText(), '4'); ok(/4 lựa chọn chờ gửi/.test(await lm.locator('#tab-limits').getAttribute('aria-label')));
  ok(await lm.locator('#alDock').isVisible(), 'dock visible'); ok(/Chờ gửi: 4/.test(await lm.locator('#alDockInfo').innerText()));
  eq(await row(lm, 'L01').getAttribute('data-choice'), 'off');
  eq(await stateOf(lm), before, 'approved/applied states come from data only');
  ok(/chờ gửi: BỎ/.test(await row(lm, 'L01').locator('.al-pend').innerText()), 'pending chip text');
  eq(await lm.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('xw-al:')).c).sort()), ['L01', 'L03', 'L05', 'L06']);
});
await T('08 optional note is appended as " // note", newlines/extra spaces stripped; note kept when the choice changes', async () => {
  await row(lm, 'L01').locator('#al-n-L01').fill('  cứ  làm\nnhư\r\nvậy  ');
  eq((await lines(lm))[0], '- L01: BỎ // cứ làm như vậy');
  await pick(lm, 'L01', 'keep'); eq((await lines(lm))[0], '- L01: GIỮ // cứ làm như vậy');
  await row(lm, 'L01').locator('#al-n-L01').fill('a // b'); eq((await lines(lm))[0], '- L01: GIỮ // a // b');
});
await T('09 "Đặt giá trị…": empty value is flagged and kept out of the message; value is flattened, "//" collapsed; unit is the row unit', async () => {
  await pick(lm, 'L02', 'val');
  eq(await lm.locator('#al-v-L02').getAttribute('aria-invalid'), 'true'); ok(/Nhập giá trị/.test(await lm.locator('#al-e-L02').innerText()));
  ok(!(await lines(lm)).some(l => l.startsWith('- L02')), 'not in message'); ok(/1 hàng "Đặt giá trị" chưa nhập/.test(await info(lm)), await info(lm));
  await lm.locator('#al-v-L02').fill('  100 \n // 200 '); eq(await lm.locator('#al-v-L02').getAttribute('aria-invalid'), 'false');
  ok((await lines(lm)).includes('- L02: GIÁ TRỊ 100/200 count'), (await lines(lm)).join('|'));
  await pick(lm, 'L02', 'rec'); ok((await lines(lm)).includes('- L02: KHUYẾN NGHỊ'), 'switching away');
});
await T('10 each option has a visible label tied to its radio (fieldset+legend); recommended option marked by text, not only colour', async () => {
  const o = await row(lm, 'L07').evaluate(r => ({leg: r.querySelector('legend').textContent, fs: r.querySelectorAll('fieldset').length,
    labels: [...r.querySelectorAll('label.al-opt')].map(l => l.innerText.replace(/\s+/g, ' ').trim()), names: new Set([...r.querySelectorAll('input[type=radio]')].map(i => i.name)).size,
    star: [...r.querySelectorAll('.al-star')].map(s => s.closest('label').querySelector('input').value)}));
  eq(o.fs, 1); eq(o.names, 1); ok(/Anh chọn cho L07/.test(o.leg), o.leg);
  ok(o.labels[0].startsWith('Giữ nguyên') && o.labels[1].startsWith('Bỏ giới hạn (tắt)') && o.labels[2].startsWith('Đặt giá trị…') && o.labels[3].startsWith('Theo khuyến nghị'), JSON.stringify(o.labels));
  eq(o.star, ['keep'], 'giữ -> Giữ nguyên marked'); ok(/★ khuyến nghị/.test(o.labels[0]));
  for (const [id, k] of [['L01', 'off'], ['L05', 'val'], ['L06', 'rec']]) eq(await row(lm, id).locator('.al-star').evaluateAll(l => l.map(s => s.closest('label').querySelector('input').value)), [k], id);
});
await T('11 per-row undo removes only that row; undo-all clears everything; badge/preview/dock reset', async () => {
  await row(lm, 'L01').locator('.al-pend .al-link').click();
  ok(!(await lines(lm)).some(l => l.startsWith('- L01')), 'L01 gone'); eq(await row(lm, 'L01').getAttribute('data-choice'), null);
  ok(await lm.evaluate(() => /^al-r-L01/.test(document.activeElement.name || '')), 'focus stays inside the row after undo');
  await lm.locator('#alUndoAll').click();
  ok(/Chưa có lựa chọn/.test(await msg(lm))); eq(await lm.locator('.al-row[data-choice]').count(), 0);
  eq(await lm.evaluate(() => JSON.parse(localStorage.getItem('xw-al:')).c), {}); ok(!(await lm.locator('#limitsTabCount').isVisible()), 'badge'); ok(!(await lm.locator('#alDock').isVisible()), 'dock');
});
await T('12 LOCKED rows (mandatory===true, plus the money safety net by unit/title): lock icon + "Bắt buộc giữ: <reason>", no radio/value/note control, no Bỏ/Đặt giá trị; mandatory non-money row is locked too; token budget is not', async () => {
  for (const id of LOCKED) {
    const r = row(lm, id); eq(await r.getAttribute('data-locked'), '1', id);
    eq(await r.locator('input[type=radio],input[type=text],fieldset').count(), 0, 'no choice controls ' + id); eq(await r.locator('.al-lock svg').count(), 1);
    ok(await r.locator('input.al-sel').count() === 1, 'still selectable so bulk can report it as skipped');
  }
  ok(/Bắt buộc giữ: Trần tiền bảo vệ chi phí/.test(await row(lm, 'L10').locator('.al-lock').innerText()), await row(lm, 'L10').locator('.al-lock').innerText());
  ok(/Bắt buộc giữ: Giới hạn an toàn bắt buộc/.test(await row(lm, 'L14').locator('.al-lock').innerText()), 'non-money mandatory');
  ok(/Bắt buộc giữ: giới hạn tiền, luôn giữ/.test(await row(lm, 'L11').locator('.al-lock').innerText()), 'safety net without a mandatory flag');
  eq(await row(lm, 'L10').getAttribute('data-money'), '1'); eq(await row(lm, 'L14').getAttribute('data-money'), null); eq(await row(lm, 'L12').getAttribute('data-locked'), null);
  ok((await row(lm, 'L13').locator('input[type=radio]').count()) === 4, 'ngân sách ngữ cảnh (token) is not locked');
});
await T('13 4-step state indicator per row (Đề xuất → Đã duyệt → Đã áp dụng → Đã kiểm chứng): done / current / todo by text+marker, aria-label, aria-current', async () => {
  const f = id => row(lm, id).locator('.al-step').evaluateAll(l => l.map(s => s.dataset.s + ':' + s.dataset.st + ':' + s.querySelector('.al-sn').textContent));
  eq(await f('L01'), ['proposed:done:✓', 'approved:done:✓', 'applied:cur:3', 'verified:todo:4']);
  eq(await f('L02'), ['proposed:done:✓', 'approved:done:✓', 'applied:done:✓', 'verified:cur:4']);
  eq(await f('L03'), ['proposed:done:✓', 'approved:cur:2', 'applied:todo:3', 'verified:todo:4']);
  eq(await f('L05'), ['proposed:cur:1', 'approved:todo:2', 'applied:todo:3', 'verified:todo:4']);
  eq(await row(lm, 'L01').locator('.al-steps').getAttribute('aria-label'), 'Trạng thái: Đã áp dụng, bước 3 trên 4');
  eq(await row(lm, 'L01').locator('.al-step[aria-current="step"]').innerText().then(t => t.replace(/\s+/g, ' ')), '3 Đã áp dụng');
  eq(await row(lm, 'L05').locator('.al-step .al-sl').allInnerTexts(), ['Đề xuất', 'Đã duyệt', 'Đã áp dụng', 'Đã kiểm chứng']);
});
await T('14 filters: group chips (aria-pressed), kind, recommend, state, mandatory, text search (accent/case-insensitive, also group/DEV/PROD text), "chưa chọn", reset; counts update', async () => {
  const chips = await lm.locator('#alGroupChips .al-gchip').allInnerTexts(); eq(chips.length, 9); eq(chips[0], 'Tất cả nhóm (14)'); ok(chips.includes('Lượt & token AI (4)'));
  eq(await lm.locator('#alGroupChips .al-gchip[aria-pressed="true"]').count(), 1);
  await lm.locator('#alGroupChips .al-gchip', {hasText: 'Lượt & token AI'}).click(); eq(await ids(lm), ['L01', 'L02', 'L03', 'L04']);
  eq(await lm.locator('#alGroupChips .al-gchip[aria-pressed="true"]').innerText().then(t => t.replace(/^✓\s*/, '')), 'Lượt & token AI (4)'); ok(/Hiển thị 4\/14/.test(await lm.locator('#alShown').innerText()));
  await lm.locator('#alFState').selectOption('applied'); eq(await ids(lm), ['L01']);
  await lm.locator('#alFReset').click(); eq((await ids(lm)).length, 14); eq(await lm.locator('#alGroupChips .al-gchip[aria-pressed="true"]').count(), 1);
  await lm.locator('#alFState').selectOption('verified'); eq(await ids(lm), ['L02']);
  await lm.locator('#alFState').selectOption('approved'); eq(await ids(lm), ['L03']);
  await lm.locator('#alFReset').click();
  await lm.locator('#alFMand').selectOption('yes'); eq(await ids(lm), LOCKED);
  await lm.locator('#alFMand').selectOption('no'); eq((await ids(lm)).length, 11); ok(!(await ids(lm)).some(i => LOCKED.includes(i)));
  await lm.locator('#alGroupChips .al-gchip', {hasText: 'Tiền & ngân sách'}).click(); eq(await ids(lm), []); ok(/Không có hàng nào khớp/.test(await lm.locator('#alGroups').innerText()));
  await lm.locator('#alFReset').click();
  await lm.locator('#alFKind').selectOption('INFRA'); eq(await ids(lm), ['L08']); eq(await lm.locator('details.al-group').count(), 1);
  await lm.locator('#alFReset').click(); await lm.locator('#alFRec').selectOption('cần mã'); eq(await ids(lm), ['L06']);
  await lm.locator('#alFRec').selectOption('nâng'); eq(await ids(lm), ['L05']); await lm.locator('#alFReset').click();
  await lm.locator('#alFQ').fill('LUOT ai'); eq(await ids(lm), ['L01', 'L02', 'L03', 'L04'], 'title or group name');
  await lm.locator('#alFQ').fill('tenant'); eq(await ids(lm), ['L04']);
  await lm.locator('#alFQ').fill('đậm'); eq(await ids(lm), ['L12'], 'matches current text');
  await lm.locator('#alFQ').fill('tham chieu'); eq(await ids(lm), ['L14'], 'matches group name');
  await lm.locator('#alFQ').fill('mac dinh trong ma L07'); eq(await ids(lm), ['L07'], 'matches DEV text');
  await lm.locator('#alFQ').fill('zzz khong'); eq(await ids(lm), []);
  await lm.locator('#alFReset').click(); eq(await lm.locator('#alFQ').inputValue(), '');
  await pick(lm, 'L01', 'keep'); await lm.locator('#alFTodo').check();
  const v = await ids(lm); ok(!v.includes('L01') && !LOCKED.some(i => v.includes(i)) && v.length === 10, v.join(','));
  await lm.locator('#alFKind').selectOption('SETTING'); await lm.locator('#alFRec').selectOption('giữ'); eq(await ids(lm), ['L04', 'L12']);
  await lm.locator('#alFReset').click(); await lm.locator('#alUndoAll').click(); eq((await ids(lm)).length, 14);
});
await T('15 bulk approval: select all filtered -> bulk "Theo khuyến nghị" shows a confirm with touched/skipped counts and why; Cancel changes nothing; OK stages only non-locked rows as "chờ gửi"', async () => {
  await lm.locator('#alSelAll').check();
  eq(await lm.locator('input.al-sel:checked').count(), 14); ok(/Đã chọn 14 hàng/.test(await lm.locator('#alSelInfo').innerText()));
  ok(await lm.locator('#alDock').isVisible(), 'dock');
  await lm.locator('#alBulkRec').click(); await lm.locator('#alConfirm[open]').waitFor();
  ok(/Xác nhận "Theo khuyến nghị" cho 14 hàng đã chọn/.test(await lm.locator('#alCfT').innerText()), await lm.locator('#alCfT').innerText());
  ok(/Sẽ đưa vào "chờ gửi": 11 hàng/.test(await lm.locator('#alCfTouch').innerText())); ok(/Bỏ qua: 3 hàng/.test(await lm.locator('#alCfSkip').innerText()));
  ok(/3 hàng bắt buộc giữ/.test(await lm.locator('#alCfWhy').innerText()), await lm.locator('#alCfWhy').innerText()); ok(/chưa phải duyệt/.test(await lm.locator('#alCfBody').innerText()));
  await lm.locator('#alCfCancel').click(); ok(/Chưa có lựa chọn/.test(await msg(lm)), 'cancel stages nothing'); eq(await lm.locator('input.al-sel:checked').count(), 14, 'selection kept after cancel');
  await lm.locator('#alBulkRec').click(); await lm.locator('#alCfOk').click();
  const l = await lines(lm); eq(l.length, 11, l.join('|')); ok(l.every(x => x.endsWith(': KHUYẾN NGHỊ')), 'all KHUYẾN NGHỊ'); ok(!l.some(x => /^- L1[014]:/.test(x)), 'locked rows excluded');
  eq(await lm.locator('input.al-sel:checked').count(), 0, 'selection cleared'); eq(await lm.locator('.al-row[data-choice]').count(), 11); ok(/Chờ gửi: 11/.test(await lm.locator('#alDockInfo').innerText()));
  eq(await stateOf(lm).then(s => s.L01 + s.L05), 'appliedproposed', 'row states unchanged by a bulk stage');
});
await T('16 bulk "Bỏ giới hạn" only touches offPossible===true non-locked rows; others are skipped with the reason; "Giữ nguyên" skips locked; overwrite of a staged choice is announced; no-op when nothing valid', async () => {
  await lm.locator('#alUndoAll').click(); await pick(lm, 'L01', 'keep');
  await lm.locator('#alSelAll').check(); await lm.locator('#alBulkOff').click(); await lm.locator('#alConfirm[open]').waitFor();
  ok(/Sẽ đưa vào "chờ gửi": 5 hàng/.test(await lm.locator('#alCfTouch').innerText()), await lm.locator('#alCfTouch').innerText());
  const why = await lm.locator('#alCfWhy').innerText(); ok(/3 hàng bắt buộc giữ/.test(why) && /6 hàng không tắt được bằng cài đặt/.test(why), why);
  ok(/Ghi đè 1 lựa chọn đang chờ gửi/.test(await lm.locator('#alCfOver').innerText())); await lm.locator('#alCfOk').click();
  eq(await lines(lm), ['- L01: BỎ', '- L02: BỎ', '- L03: BỎ', '- L04: BỎ', '- L09: BỎ']);
  for (const id of ['L05', 'L06', 'L07', 'L08', 'L12', 'L13', ...LOCKED]) eq(await row(lm, id).getAttribute('data-choice'), null, id + ' must stay unchosen');
  await lm.locator('#alUndoAll').click(); await lm.locator('#alSelAll').check(); await lm.locator('#alBulkKeep').click(); await lm.locator('#alCfOk').click();
  const k = await lines(lm); eq(k.length, 11); ok(k.every(x => x.endsWith(': GIỮ')), 'keep');
  await lm.locator('#alSelAll').check(); await lm.locator('#alBulkKeep').click(); await lm.locator('#alConfirm[open]').waitFor();
  ok(/11 hàng đã đúng lựa chọn này/.test(await lm.locator('#alCfWhy').innerText()), await lm.locator('#alCfWhy').innerText()); ok(await lm.locator('#alCfOk').isDisabled(), 'nothing to apply');
  ok(/Không có hàng nào hợp lệ/.test(await lm.locator('#alCfBody').innerText())); await lm.locator('#alCfCancel').click();
  await lm.locator('#alSelNone').click(); await lm.locator('#alUndoAll').click();
});
await T('17 quick-select helpers: "chưa chọn" selects only unlocked unchosen rows, "lượt/token tắt được" selects exactly L01-L04, "Bỏ chọn" clears; selection follows the filter', async () => {
  await lm.locator('#alSelOff').click(); eq(await lm.locator('input.al-sel:checked').evaluateAll(l => l.map(c => c.dataset.alf.slice(4))), ['L01', 'L02', 'L03', 'L04']);
  await lm.locator('#alBulkOff').click(); await lm.locator('#alCfOk').click(); eq(await lines(lm), ['- L01: BỎ', '- L02: BỎ', '- L03: BỎ', '- L04: BỎ']);
  await lm.locator('#alSelTodo').click(); eq(await lm.locator('input.al-sel:checked').count(), 7, 'unlocked, unchosen: 14-3-4');
  await lm.locator('#alSelNone').click(); eq(await lm.locator('input.al-sel:checked').count(), 0); ok(!(await lm.locator('#alBulkRec').isVisible()), 'bulk bar hidden without selection');
  await lm.locator('#alGroupChips .al-gchip', {hasText: 'File & ảnh'}).click(); await lm.locator('#alSelAll').check(); await lm.locator('#alFReset').click();
  eq(await lm.locator('input.al-sel:checked').evaluateAll(l => l.map(c => c.dataset.alf.slice(4))), ['L06', 'L07'], 'select-all-filtered only selected the filtered rows');
  ok(await lm.locator('#alSelAll').evaluate(c => c.indeterminate), 'tri-state'); await lm.locator('#alSelNone').click(); await lm.locator('#alUndoAll').click();
});
await T('18 a single-row BỎ on a row that cannot be switched off is allowed but warned (becomes code/release work); locked rows cannot be staged at all', async () => {
  await pick(lm, 'L05', 'off');
  ok(/Không tắt được bằng cài đặt: chọn này sẽ thành việc cần mã/.test(await row(lm, 'L05').innerText()), 'warning');
  eq(await lines(lm), ['- L05: BỎ']); await lm.locator('#alUndoAll').click();
});
await T('19 persistence: staged choices survive reload (prefix xw-al:); stale ids and locked rows (mandatory or money) in storage are dropped', async () => {
  const p = await open({seed: {c: {L01: {k: 'off', v: '', n: 'ghi chú'}, L10: {k: 'off', v: '', n: ''}, L14: {k: 'keep', v: '', n: ''}, L11: {k: 'off', v: '', n: ''}, ZZ99: {k: 'keep', v: '', n: ''}, L02: {k: 'weird', v: '', n: ''}, L03: {k: 'val', v: '7', n: ''}}, sent: ''}});
  eq(await lines(p), ['- L01: BỎ // ghi chú', '- L03: GIÁ TRỊ 7 tokens']);
  await pick(p, 'L05', 'keep'); await p.reload(); await p.waitForSelector('#limitsBody > *', {state: 'attached'});
  eq(await lines(p), ['- L01: BỎ // ghi chú', '- L03: GIÁ TRỊ 7 tokens', '- L05: GIỮ']);
  eq(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('xw-al:')).c)), ['L01', 'L03', 'L05']);
  await p._ctx.close();
});
await T('20 localStorage writes throwing: tab and bulk approval still work in memory', async () => {
  const p = await open({noStorageWrite: true}); await pick(p, 'L01', 'off'); await pick(p, 'L05', 'keep');
  eq(await lines(p), ['- L01: BỎ', '- L05: GIỮ']); eq(await p.evaluate(() => localStorage.getItem('xw-al:')), null);
  await p.locator('#alSelAll').check(); await p.locator('#alBulkRec').click(); await p.locator('#alCfOk').click(); eq((await lines(p)).length, 11); await p._ctx.close();
});
await T('21 escaping: markup in title/current/what/offHow/danger/impactNote/riskNote/dev/note/risks is shown as text, nothing executes, no injected elements', async () => {
  const p = await open(); await row(p, 'L12').locator('.al-exp').click(); await pick(p, 'L12', 'rec'); await row(p, 'L12').locator('#al-n-L12').fill('<img src=y onerror="window.__xss=9">');
  ok(await p.evaluate(() => window.__xss === undefined), 'xss ran');
  const r = row(p, 'L12'); eq(await r.locator('img,script,b,i,u').count(), 0, 'injected tags');
  const t = await r.innerText(); ok(t.includes('<img src=x onerror=') && t.includes('<b>đậm?</b>') && t.includes('<script>window.__xss=2</script>') && t.includes('<i>nghiêng</i>') && t.includes('<u>gạch</u>'), t);
  ok(t.includes('<b>ảnh hưởng</b> <script>window.__xss=4</script>') && t.includes('<i>rủi ro</i> <img src=x onerror="window.__xss=5">') && t.includes('<u>dev</u>'), 'new fields as text');
  eq(await p.locator('#limitsBody .al-datanote b').count(), 0); ok((await p.locator('#alMeta').innerText()).length > 0);
  ok((await msg(p)).includes('- L12: KHUYẾN NGHỊ // <img src=y onerror="window.__xss=9">'), 'note text in message');
  eq(await p.locator('#limitsBody img,#limitsBody script').count(), 0); await p._ctx.close();
});
await T('22 details: what, where, offHow, danger, impactNote, riskNote, stateNote, full PROD/DEV values, estimated hours, needs-release chip; toggle with aria-expanded/controls', async () => {
  const r = row(lm, 'L05'), b = r.locator('.al-exp');
  eq(await b.getAttribute('aria-expanded'), 'false'); ok(!(await r.locator('.al-detail').isVisible()), 'closed');
  await b.click(); eq(await b.getAttribute('aria-expanded'), 'true'); eq(await b.getAttribute('aria-controls'), await r.locator('.al-detail').getAttribute('id'));
  const t = await r.locator('.al-detail').innerText();
  ok(t.includes('Mô tả L05') && t.includes('nơi/L05.kt:1') && t.includes('Cách bỏ L05') && t.includes('Rủi ro L05') && t.includes('Ảnh hưởng người dùng L05') && t.includes('Ghi chú rủi ro L05') && /2 giờ/.test(t) && t.includes('1000'), t);
  ok(t.includes('Giá trị PROD L05: 500') && t.includes('Mặc định trong mã L05: 50'), 'full values');
  const chip = await r.locator('.al-detail .al-chip').evaluate(c => ({ic: c.querySelector('.al-ci').textContent, t: c.lastChild.textContent}));
  eq(chip, {ic: '⚑', t: 'Cần bản phát hành'});
  await row(lm, 'L01').locator('.al-exp').click(); const t1 = await row(lm, 'L01').locator('.al-detail').innerText();
  ok(/Không cần bản phát hành/.test(t1) && t1.includes('Ghi chú trạng thái L01'), t1);
  await row(lm, 'L08').locator('.al-exp').click(); ok(/Chưa rõ có cần bản phát hành/.test(await row(lm, 'L08').locator('.al-detail').innerText()));
  eq((await row(lm, 'L08').locator('.al-detail').innerText()).includes('Giá trị PROD'), false, 'UNKNOWN value is not repeated in details');
  await pick(lm, 'L05', 'keep'); eq(await row(lm, 'L05').locator('.al-exp').getAttribute('aria-expanded'), 'true', 'open state survives re-render');
  await lm.locator('#alUndoAll').click();
});
await T('23 offPossible variants are shown as text chips: true "Tắt được", false "Không tắt được", unknown "Chưa rõ"', async () => {
  const f = id => row(lm, id).locator('.al-meta .al-chip').last().innerText();
  ok(/Tắt được bằng cài đặt/.test(await f('L01'))); ok(/Không tắt được bằng cài đặt/.test(await f('L05'))); ok(/Chưa rõ có tắt được/.test(await f('L08')));
  const ic = await lm.locator('.al-row').evaluateAll(l => new Set(l.map(r => r.dataset.off + r.querySelector('.al-meta .al-chip:last-child .al-ci').textContent)).size); eq(ic, 3);
});
await T('24 keyboard: arrow keys move through the radio group, Space/Enter work on buttons and row checkbox, tab order reaches note/undo after a choice', async () => {
  const p = await open(); await radio(p, 'L07', 'keep').focus(); await p.keyboard.press('ArrowDown');
  eq(await radio(p, 'L07', 'off').isChecked(), true); ok(await p.evaluate(() => document.activeElement.value === 'off' || document.activeElement.dataset.alf === 'L07:off'), 'focus kept after re-render');
  await p.keyboard.press('ArrowDown'); ok(/Chưa có lựa chọn/.test(await msg(p)), 'incomplete value not in message');
  eq(await radio(p, 'L07', 'val').isChecked(), true); ok(await p.evaluate(() => document.activeElement.id === 'al-v-L07'), 'focus moves to the value input');
  await p.keyboard.type('8 MiB'); eq(await lines(p), ['- L07: GIÁ TRỊ 8 MiB bytes']);
  const x = row(p, 'L07').locator('.al-exp'); await x.focus(); await p.keyboard.press('Enter'); eq(await x.getAttribute('aria-expanded'), 'true'); await p.keyboard.press('Space'); eq(await x.getAttribute('aria-expanded'), 'false');
  await row(p, 'L07').locator('.al-link').focus(); await p.keyboard.press('Enter'); eq(await row(p, 'L07').getAttribute('data-choice'), null);
  await centre(chk(p, 'L06')); await chk(p, 'L06').focus(); await p.keyboard.press('Space'); ok(await chk(p, 'L06').isChecked(), 'space ticks the row'); ok(/Đã chọn 1 hàng/.test(await p.locator('#alSelInfo').innerText()));
  await p.locator('#alBulkKeep').focus(); await p.keyboard.press('Enter'); await p.locator('#alConfirm[open]').waitFor();
  ok(await p.evaluate(() => document.activeElement.id === 'alCfOk'), 'focus inside the dialog'); await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.getElementById('alConfirm').open); ok(/Chưa có lựa chọn/.test(await msg(p)), 'Escape cancels, nothing staged');
  ok(await p.evaluate(() => document.activeElement.id === 'alBulkKeep'), 'focus returns to the opener'); await p._ctx.close();
});
await T('25 copy: clipboard gets exactly the preview text; both send buttons open the #88 comment link; sent marker cleared by a new change', async () => {
  await pick(lm, 'L01', 'off'); await lm.locator('#alCopy').click();
  const clip = await lm.evaluate(() => window.__clip); eq(clip.length, 1); ok(HEAD.test(clip[0].split('\n')[0]), 'header'); eq(clip[0], await msg(lm), 'clipboard == preview');
  ok(/đã sao chép/.test(await info(lm)), await info(lm));
  await lm.locator('#alSend').click(); await lm.waitForFunction(() => window.__clip.length === 2);
  await lm.locator('#alDockSend').click(); await lm.waitForFunction(() => window.__clip.length === 3);
  eq(await lm.evaluate(() => window.__opened), Array(2).fill('https://github.com/luan20495/xweb01/issues/88#issuecomment-new'));
  await pick(lm, 'L05', 'keep'); ok(!/đã sao chép/.test(await info(lm)), 'marker cleared'); await lm.locator('#alUndoAll').click();
});
await T('26 clipboard denied: text is selected and a manual-copy hint is shown; staged data kept', async () => {
  const p = await open({clipFail: true}); await pick(p, 'L01', 'off'); await p.locator('#alCopy').click();
  ok(/Ctrl\/Cmd\+C/.test(await p.locator('#alHint').innerText()), 'hint'); eq(await lines(p), ['- L01: BỎ']);
  ok(await p.evaluate(() => document.activeElement.id === 'alMsg'), 'textarea focused'); await p._ctx.close();
});
await T('27 missing aiLimits: friendly empty state, no errors, other tabs unaffected', async () => {
  current = withoutLimits; const p = await open(); ok(/Chưa có dữ liệu giới hạn/.test(await p.locator('#limitsBody').innerText()), 'empty');
  await p.locator('#tab-process').click(); await p.waitForSelector('.pc-g'); ok(await p.locator('.pc-g').count() >= 8, 'process tab still renders');
  await p._ctx.close(); current = withLimits;
});
await T('28 English twin: labels, notice, pending sentence, legend, chips, bulk buttons and dialog translate; machine lines stay Vietnamese', async () => {
  const p = await open({lang: 'en'}); await p.waitForFunction(() => document.getElementById('limitsTitle').textContent === 'AI Studio limits');
  ok((await p.locator('#alNotice').innerText()).startsWith('Once you have chosen, copy and paste to #88'));
  ok(/only "pending"/.test(await p.locator('#alPendNote').innerText()), 'pending sentence');
  ok(/Proposed/.test(await p.locator('#alLegend').innerText()) && /Verified/.test(await p.locator('#alLegend').innerText()) && /Code default \(DEV\)/.test(await p.locator('#alDevNote').innerText()));
  const t = await row(p, 'L07').innerText();
  ok(/Keep as is/.test(t) && /Remove limit \(off\)/.test(t) && /Set a value…/.test(t) && /Follow recommendation/.test(t) && /Impact: Low/.test(t) && /Risk: Medium/.test(t) && /Proposed \(1\/4\)/.test(t) && /PROD \(last known value\)/.test(t) && /DEV: code default/.test(t), t);
  ok(/Must keep: Trần tiền bảo vệ chi phí/.test(await row(p, 'L10').innerText()), 'lock english');
  await p.locator('#alSelAll').check(); ok(/14 rows selected/.test(await p.locator('#alSelInfo').innerText()));
  await p.locator('#alBulkOff').click(); await p.locator('#alConfirm[open]').waitFor(); ok(/Will be put in "pending": 5 rows/.test(await p.locator('#alCfTouch').innerText()), await p.locator('#alCfTouch').innerText()); ok(/Skipped: 9 rows/.test(await p.locator('#alCfSkip').innerText()));
  await p.locator('#alCfOk').click(); eq((await lines(p)).length, 5); ok(/Pending: 5 choices/.test(await info(p)), await info(p));
  eq((await lines(p))[0], '- L01: BỎ'); await p._ctx.close();
});
await T('29 existing tabs still switch correctly in the new order (6 panels, one visible at a time, hash routing, arrow keys, Home/End)', async () => {
  const p = await open({hash: '#roadmap/1'}); const V = ['roadmap', 'process', 'limits', 'hourly', 'prod', 'owner'];
  for (const v of V) {
    await p.locator('#tab-' + v).click();
    eq(await p.evaluate(vs => vs.filter(x => !document.getElementById('view-' + x).hidden), V), [v], 'visible after ' + v); ok((await p.evaluate(() => location.hash)).startsWith('#' + v), 'hash ' + v);
  }
  const sel = () => p.evaluate(() => document.querySelector('[data-board-tab][aria-selected="true"]').dataset.boardTab);
  await p.locator('#tab-process').focus(); await p.keyboard.press('ArrowRight'); eq(await sel(), 'limits'); await p.keyboard.press('ArrowRight'); eq(await sel(), 'hourly');
  await p.keyboard.press('ArrowLeft'); eq(await sel(), 'limits'); await p.keyboard.press('End'); eq(await sel(), 'owner'); await p.keyboard.press('Home'); eq(await sel(), 'roadmap');
  await p.evaluate(() => { location.hash = '#limits'; }); await p.waitForFunction(() => !document.getElementById('view-limits').hidden);
  await p._ctx.close();
});
await T('30 real status.json aiLimits: all rows render (69 once enriched), every mandatory/money row locked, group chips, bulk never touches locked or non-offPossible rows, counts consistent', async () => {
  current = JSON.stringify(Object.assign({}, base, {aiLimits: REAL})); const p = await open();
  const n = REAL.items.length; eq(await p.locator('.al-row').count(), n); ok(n === 69, 'expected 69 rows, got ' + n);
  const locked = await p.locator('.al-row[data-locked="1"]').evaluateAll(l => l.map(e => e.dataset.al));
  const mand = REAL.items.filter(i => i.mandatory === true).map(i => i.id);
  for (const id of mand) ok(locked.includes(id), 'mandatory row locked ' + id);
  for (const id of locked) ok(mand.includes(id) || /tiền|chi phí|ngân sách/i.test(REAL.items.find(i => i.id === id).title) || REAL.items.find(i => i.id === id).unit === 'money', 'unexpected lock ' + id);
  const enriched = REAL.items.every(i => i.group && i.state && 'prod' in i && 'dev' in i && i.impact && i.risk && typeof i.mandatory === 'boolean');
  if (enriched) {
    eq(await p.locator('#alGroupChips .al-gchip').count(), 11, '10 groups + all'); eq(await p.locator('details.al-group').count(), 10);
    eq(await p.locator('#alCountState li[data-state] b').allInnerTexts(), ['proposed', 'approved', 'applied', 'verified'].map(s => String(REAL.items.filter(i => i.state === s).length)));
    for (const id of ['L01', 'L02', 'L09', 'L10', 'L11']) { eq(await row(p, id).getAttribute('data-state'), 'applied', id); ok(/REPORTED|báo/i.test(await row(p, id).innerText() + (await row(p, id).locator('.al-detail').textContent())), 'stateNote ' + id); }
  }
  await p.locator('#alSelAll').check(); await p.locator('#alBulkOff').click(); await p.locator('#alCfOk').click(); const l = await lines(p);
  for (const x of l) { const id = x.slice(2, 5); const it = REAL.items.find(i => i.id === id); ok(it.offPossible === true && !locked.includes(id), 'bulk off included ' + id); }
  eq(l.length, REAL.items.filter(i => i.offPossible === true && !locked.includes(i.id)).length);
  await p.locator('#alUndoAll').click(); await p.locator('#alSelAll').check(); await p.locator('#alBulkRec').click(); await p.locator('#alCfOk').click(); eq((await lines(p)).length, n - locked.length);
  await shot(p, 'limits-real-1280'); await p._ctx.close(); current = withLimits;
});
await T('31 [390] mobile: tab strip is ONE scrollable row with all 6 tabs reachable and >= 44px; filters collapsed in a panel (search stays visible); rows are cards with >= 44px targets', async () => {
  const p = await open({w: 390, h: 844});
  const m = await p.evaluate(() => { const nav = document.getElementById('mainTabs'), t = [...nav.querySelectorAll('[role=tab]')].map(x => x.getBoundingClientRect());
    return {tops: new Set(t.map(r => Math.round(r.top))).size, h: Math.min(...t.map(r => r.height)), scroll: nav.scrollWidth > nav.clientWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, count: t.length}; });
  eq(m.tops, 1, 'single row'); ok(m.h >= 44, 'tab height ' + m.h); ok(m.scroll, 'strip scrolls'); eq(m.sw, m.cw, 'page hscroll'); eq(m.count, 6);
  await p.locator('#tab-owner').click(); ok(await p.locator('#tab-owner').evaluate(t => { const r = t.getBoundingClientRect(), n = t.parentElement.getBoundingClientRect(); return r.left >= n.left - 1 && r.right <= n.right + 1; }), 'selected tab scrolled into view');
  await p.locator('#tab-limits').click();
  ok(!(await p.locator('#alFPanel').isVisible()), 'filter panel collapsed'); ok(await p.locator('#alFQ').isVisible(), 'search visible'); eq(await p.locator('#alFToggle').getAttribute('aria-expanded'), 'false');
  await p.locator('#alFToggle').click(); ok(await p.locator('#alFPanel').isVisible()); eq(await p.locator('#alFToggle').getAttribute('aria-expanded'), 'true');
  const g = await p.locator('#alGroupChips .al-gchip').evaluateAll(l => l.map(e => e.getBoundingClientRect().height)); ok(g.length === 9 && Math.min(...g) >= 43.5, 'chip heights ' + g.join(','));
  await p.locator('#alGroupChips .al-gchip', {hasText: 'File & ảnh'}).click(); eq(await ids(p), ['L06', 'L07']); ok(/Bộ lọc \(1\)/.test(await p.locator('#alFToggle').innerText()), await p.locator('#alFToggle').innerText());
  await p.locator('#alFToggle').click(); ok(!(await p.locator('#alFPanel').isVisible()), 'collapses again'); await p.locator('#alFReset').evaluate(b => b.click());
  const r = row(p, 'L01'); const bb = await r.boundingBox(); ok(bb.width <= 390 - 8, 'card width ' + bb.width);
  const sm = await r.evaluate(e => [...e.querySelectorAll('button,input:not([type=checkbox]),label.al-selw,label.al-opt,summary')].filter(x => x.offsetParent).filter(x => { const q = x.getBoundingClientRect(); return q.height < 43.5 || q.width < 43.5; }).map(x => x.className || x.tagName));
  eq(sm, [], 'row targets'); await p._ctx.close();
});
await T('32 [390] mobile: sticky dock shows pending count + send button while scrolled far from the top, stays inside the viewport, bulk row appears with selection', async () => {
  const p = await open({w: 390, h: 844}); await pick(p, 'L01', 'off');
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); });
  const near = async () => p.evaluate(() => { const r = document.getElementById('alDock').getBoundingClientRect(); return {b: r.bottom, h: r.height, t: r.top, vh: innerHeight, vis: !document.getElementById('alDock').hidden}; });
  let d = await near(); ok(d.vis && d.b <= d.vh && d.b > d.vh - 24, 'dock pinned to the bottom at the top of the page ' + JSON.stringify(d));
  ok(/Chờ gửi: 1/.test(await p.locator('#alDockInfo').innerText())); ok(await p.locator('#alDockSend').isEnabled());
  const sb = await p.locator('#alDockSend').boundingBox(); ok(sb.height >= 43.5, 'send height');
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight / 2)); await p.waitForTimeout(150); d = await near(); ok(d.b <= d.vh && d.b > d.vh - 24, 'still pinned mid page ' + JSON.stringify(d));
  await centre(chk(p, 'L05')); await chk(p, 'L05').check({force: true}); ok(await p.locator('#alBulkRec').isVisible()); d = await near(); ok(d.b <= d.vh && d.h < 200, 'dock with bulk row fits ' + JSON.stringify(d));
  const bs = await p.locator('#alDock button').evaluateAll(l => l.filter(x => x.offsetParent).map(x => x.getBoundingClientRect().height)); ok(Math.min(...bs) >= 43.5, 'dock buttons ' + bs.join(','));
  await p.locator('#alBulkKeep').click(); await p.locator('#alConfirm[open]').waitFor();
  const dl = await p.locator('#alConfirm').boundingBox(); ok(dl.x >= 0 && dl.x + dl.width <= 390 && dl.y >= 0 && dl.y + dl.height <= 844, 'dialog inside viewport ' + JSON.stringify(dl));
  ok((await p.locator('#alCfOk').boundingBox()).height >= 43.5); await p.locator('#alCfOk').click(); eq(await lines(p), ['- L01: BỎ', '- L05: GIỮ']); await p._ctx.close();
});
for (const [w, h] of [[1280, 900], [390, 844]]) for (const theme of ['light', 'dark']) {
  await T(`33 [${w}-${theme}] no horizontal scroll with everything open and chosen; controls >= 44px; nothing wider than the viewport`, async () => {
    const p = await open({w, h, theme, scheme: theme});
    await p.locator('#alSelAll').check({force: true}); await p.locator('#alBulkRec').click(); await p.locator('#alCfOk').click(); await pick(p, 'L02', 'val'); await p.locator('#al-v-L02').fill('9'.repeat(60));
    for (const id of ['L12', 'L05']) await row(p, id).locator('.al-exp').click();
    await row(p, 'L12').locator('#al-n-L12').fill('n'.repeat(190));
    if (w < 721) await p.locator('#alFToggle').click();
    const m = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      wide: [...document.querySelectorAll('#view-limits *')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5 && getComputedStyle(e).position !== 'fixed' && !e.closest('.al-live')).map(e => e.className || e.tagName).slice(0, 5),
      small: [...document.querySelectorAll('#view-limits button,#view-limits input:not([type=checkbox]),#view-limits select,#view-limits textarea,#view-limits summary,#view-limits label.al-selw,#view-limits label.al-opt,#mainTabs [role=tab]')].filter(e => e.offsetParent).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(e => e.className || e.id).slice(0, 5)}));
    eq(m.sw, m.cw, 'horizontal scroll'); eq(m.wide, [], 'overflowing'); eq(m.small, [], 'small targets');
    eq(await p.locator('#mainTabs [role=tab]').count(), 6); await shot(p, `limits-${w}-${theme}`); await p._ctx.close();
  });
}
await T('34 dark theme uses dark surfaces for rows, notice, dock and chips; recommend chips stay distinct (4 backgrounds)', async () => {
  const p = await open({theme: 'dark', scheme: 'dark'}); await pick(p, 'L01', 'off');
  const m = await p.evaluate(() => { const bg = s => getComputedStyle(document.querySelector(s)).backgroundColor; const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return (r * 299 + g * 587 + b * 114) / 1000; };
    return {row: lum(bg('.al-row')), page: lum(bg('body')), notice: lum(bg('.al-notice')), dock: lum(bg('.al-dock')), chips: new Set([...document.querySelectorAll('#alCountRec .al-chip')].map(c => getComputedStyle(c).backgroundColor)).size}; });
  ok(m.row < 80 && m.page < 80 && m.notice < 100 && m.dock < 80, JSON.stringify(m)); eq(m.chips, 4); await p._ctx.close();
});
await T('35 [light/dark x desktop/390] axe-core: 0 serious/critical on the limits tab and on the tab strip (choices, details open, locked row, value input, filter panel, open dialog)', async () => {
  if (!axeSrc) return 'NOT_RUN';
  const out = [];
  for (const [theme, w] of [['light', 1280], ['dark', 1280], ['light', 390], ['dark', 390]]) {
    const p = await open({theme, scheme: theme, w, h: w > 500 ? 900 : 844}); await pick(p, 'L03', 'val'); await pick(p, 'L01', 'off'); await row(p, 'L01').locator('.al-exp').click();
    if (w < 721) await p.locator('#alFToggle').click();
    await centre(chk(p, 'L05')); await chk(p, 'L05').check({force: true});
    await p.addScriptTag({content: axeSrc});
    const run = () => p.evaluate(async () => (await axe.run(['#view-limits', '#mainTabs'], {runOnly: ['wcag2a', 'wcag2aa']})).violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id + ':' + v.nodes.map(n => n.target.join(' ') + ' ' + (n.any[0] ? n.any[0].message : '')).join(' ; ')));
    const r = await run(); if (r.length) out.push(theme + w + ' ' + r.join(','));
    await p.locator('#alBulkRec').click(); await p.locator('#alConfirm[open]').waitFor();
    const r2 = await p.evaluate(async () => (await axe.run('#alConfirm', {runOnly: ['wcag2a', 'wcag2aa']})).violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id));
    if (r2.length) out.push(theme + w + ' dialog ' + r2.join(','));
    await p._ctx.close();
  }
  ok(!out.length, out.join(' | '));
});
await T('36 no console errors during the whole run', async () => { eq(consoleErrors, []); });

await browser.close(); server.close();
const w = Math.max(...results.map(r => r[0].length));
for (const [n, s, d] of results) console.log(`${s.padEnd(8)} ${n.padEnd(w)}  ${d}`);
const c = k => results.filter(r => r[1] === k).length;
console.log(`\nPASS ${c('PASS')}  FAIL ${c('FAIL')}  NOT_RUN ${c('NOT_RUN')}${SHOTS ? '  screenshots: ' + SHOTS : ''}`);
process.exit(c('FAIL') ? 1 : 0);
