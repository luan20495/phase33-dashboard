// Automated UI check for the 4-tab shell: Lộ trình (#roadmap/1..6) · Quy trình & cấu hình (#process) · Đã lên PROD (#prod/done|on) · Chờ anh quyết (#owner).
// Run:  node tests/shell-ui.mjs      Env: PW_MODULE=<playwright-core path>  SHOTS=<dir for screenshots>  AXE=<path to axe.min.js, optional>
// Serves index.html from this repo on 127.0.0.1 and the REAL status.json (read-only; routed in memory, never written).
// Some cases feed a modified in-memory copy (no `batch`/`closed` fields, nothing closed, synthetic Owner decision card).
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
const REAL = fs.readFileSync(path.join(root, 'status.json'), 'utf8');
let axeSrc = '';
try { axeSrc = fs.readFileSync(process.env.AXE || require.resolve('axe-core/axe.min.js'), 'utf8'); } catch {}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream'});
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
let browser;
try { browser = await chromium.launch({channel: 'chrome'}); } catch { browser = await chromium.launch(); }

const results = []; const consoleErrors = [];
async function T(name, fn) {
  try { const r = await fn(); results.push([name, r === 'NOT_RUN' ? 'NOT_RUN' : 'PASS', typeof r === 'string' && r !== 'NOT_RUN' ? r : '']); }
  catch (e) { results.push([name, 'FAIL', String(e.message || e).split('\n')[0].slice(0, 240)]); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m || 'eq'}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

/** Synthetic status variants */
const variant = {
  real: () => JSON.parse(REAL),
  noFields: () => { // simulates an older status.json: no batch / closed / batchPlan / roadmap
    const d = JSON.parse(REAL); delete d.roadmap;
    for (const x of d.dailyWork.items) { delete x.batch; delete x.closed; delete x.batchPlan; delete x.closedAt; }
    for (const x of d.post33Backlog.items) { delete x.batch; delete x.closed; delete x.batchPart; }
    for (const x of d.features) delete x.closed; return d;
  },
  nothingClosed: () => { const d = JSON.parse(REAL); for (const x of d.dailyWork.items) x.closed = false; return d; },
  withDecision: () => {
    const d = JSON.parse(REAL);
    d.ownerActions.items.unshift({id: 'TEST-OD-1', kind: 'DECISION', priority: 'P1', status: 'OPEN', since: '2026-11-11T14:00:00+07:00', title: 'Thẻ quyết định thử nghiệm', detail: 'Chỉ dùng trong test.', options: [{key: 'A', label: 'Đồng ý', recommended: true, desc: 'Phương án A'}, {key: 'B', label: 'Từ chối', desc: 'Phương án B'}]});
    return d;
  },
};

async function open({w = 1440, h = 900, theme = 'light', scheme = 'light', hash = '', lang = 'vi', data = 'real'} = {}) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}, colorScheme: scheme, deviceScaleFactor: 1});
  await ctx.addInitScript(([theme, lang]) => {
    try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('xweb-theme', theme); localStorage.setItem('xweb-lang', lang); } } catch {}
    window.__opened = []; window.__clip = [];
    window.open = (...a) => { window.__opened.push(a[0]); return null; };
    try { Object.defineProperty(navigator, 'clipboard', {value: {writeText: async t => { window.__clip.push(t); }}, configurable: true}); } catch {}
  }, [theme, lang]);
  const page = await ctx.newPage();
  const body = JSON.stringify(variant[data]());
  await page.route('**/status.json', r => r.fulfill({status: 200, contentType: 'application/json', body}));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url + m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + hash);
  await page.waitForFunction(() => document.getElementById('prodOnCount')?.textContent !== '');
  page._ctx = ctx; return page;
}
const shot = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name + '.png')}); };
const hashOf = p => p.evaluate(() => location.hash);
const selTab = p => p.evaluate(() => document.querySelector('[data-board-tab][aria-selected="true"]')?.dataset.boardTab);
const cardIds = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(e => e.textContent), sel);

/* ---------- structure ---------- */
await T('01 four main tabs in order, real tablist with roles/aria, heading has no "Phase 3.3"', async () => {
  const p = await open();
  const info = await p.evaluate(() => ({
    title: document.title, h1: document.querySelector('h1').textContent,
    list: document.querySelector('#mainTabs').getAttribute('role'),
    tabs: [...document.querySelectorAll('#mainTabs [role=tab]')].map(t => ({n: t.querySelector('.board-tab-name').textContent, sel: t.getAttribute('aria-selected'), c: t.getAttribute('aria-controls'), tab: t.tabIndex})),
    panels: ['view-roadmap', 'view-process', 'view-prod', 'view-owner'].map(id => document.getElementById(id)?.getAttribute('role')),
    sub: document.getElementById('boardSubtitle').textContent, text: document.body.innerText,
  }));
  eq(info.tabs.map(t => t.n), ['Lộ trình', 'Quy trình & cấu hình', 'Đã lên PROD', 'Chờ anh quyết']);
  eq(info.tabs.map(t => t.c), ['view-roadmap', 'view-process', 'view-prod', 'view-owner']);
  eq(info.tabs.map(t => t.tab), [0, -1, -1, -1]); eq(info.tabs.map(t => t.sel), ['true', 'false', 'false', 'false']);
  eq(info.panels, ['tabpanel', 'tabpanel', 'tabpanel', 'tabpanel']); eq(info.list, 'tablist');
  ok(/Bảng điều hành/.test(info.h1) && /Bảng điều hành/.test(info.title), info.h1 + ' / ' + info.title);
  ok(!/Phase 3\.3/.test(info.h1 + info.title + info.sub), 'Phase 3.3 still in header');
  ok(/Lộ trình, triển khai và nghiệm thu theo bằng chứng/.test(info.sub));
  eq(await p.locator('#batchTabs [role=tab]').count(), 6);
  await shot(p, 'shell-roadmap-1440'); await p._ctx.close();
});

await T('02 hash routing + legacy redirects (#phase33 #remaining #today)', async () => {
  const cases = [['#roadmap', 'roadmap', '#roadmap'], ['#roadmap/4', 'roadmap', '#roadmap/4'], ['#process', 'process', '#process'], ['#prod/done', 'prod', '#prod/done'], ['#prod/on', 'prod', '#prod/on'], ['#owner', 'owner', '#owner'],
    ['#phase33', 'prod', '#prod/on'], ['#remaining', 'roadmap', '#roadmap/1'], ['#today', 'roadmap', '#roadmap/1']];
  for (const [h, view, want] of cases) {
    const p = await open({hash: h});
    eq([await selTab(p), await hashOf(p)], [view, want], 'route ' + h);
    ok(await p.locator('#view-' + view).isVisible(), 'panel visible ' + h);
    await p._ctx.close();
  }
  const p = await open({hash: '#roadmap'});
  await p.evaluate(() => { location.hash = '#prod/done'; }); await p.waitForTimeout(80);
  eq(await selTab(p), 'prod'); eq(await p.evaluate(() => document.querySelector('[data-prod-tab][aria-selected=true]').dataset.prodTab), 'done');
  await p._ctx.close();
});

await T('03 keyboard: arrows/Home/End move + select main tabs and sub-tabs (roving tabindex)', async () => {
  const p = await open();
  await p.locator('#tab-roadmap').focus(); await p.keyboard.press('ArrowRight');
  eq(await selTab(p), 'process'); eq(await p.evaluate(() => document.activeElement.id), 'tab-process');
  await p.keyboard.press('End'); eq(await selTab(p), 'owner'); await p.keyboard.press('ArrowRight'); eq(await selTab(p), 'roadmap');
  await p.keyboard.press('ArrowLeft'); eq(await selTab(p), 'owner'); await p.keyboard.press('Home'); eq(await selTab(p), 'roadmap');
  await p.locator('#rtab-1').focus(); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  eq(await hashOf(p), '#roadmap/3'); eq(await p.evaluate(() => document.activeElement.id), 'rtab-3');
  await p.keyboard.press('End'); eq(await hashOf(p), '#roadmap/6'); await p.keyboard.press('ArrowRight'); eq(await hashOf(p), '#roadmap/1');
  const tabindexes = await p.evaluate(() => [...document.querySelectorAll('#batchTabs [role=tab]')].map(t => t.tabIndex)); eq(tabindexes, [0, -1, -1, -1, -1, -1]);
  await p.locator('#tab-prod').click(); await p.locator('#ptab-done').focus(); await p.keyboard.press('ArrowRight'); eq(await hashOf(p), '#prod/on'); await p.keyboard.press('ArrowLeft'); eq(await hashOf(p), '#prod/done');
  await p._ctx.close();
});

/* ---------- roadmap content ---------- */
await T('04 roadmap: batch membership (D1.x, D2..D6, T-items, LEG/P4 tags, features not ON) and per-batch counts', async () => {
  const p = await open({hash: '#roadmap/1'});
  const batch = async n => { await p.locator('#rtab-' + n).click(); return p.evaluate(() => ({txt: document.getElementById('batchPanel').innerText, cards: [...document.querySelectorAll('#batchPanel .today-title,#batchPanel .legacy-id,#batchPanel .progress-name')].map(e => e.textContent), bar: (() => { const b = document.querySelector('#batchPanel [role=progressbar]'); return b && [b.getAttribute('aria-valuenow'), b.getAttribute('aria-valuemax')]; })(), head: document.querySelector('#batchPanel h2')?.textContent})); };
  const b1 = await batch(1), b2 = await batch(2), b3 = await batch(3);
  eq(await p.evaluate(() => [document.querySelectorAll('#batchPanel .progress-card').length, +document.querySelectorAll('#batchPanel .found-num')[2].textContent]).then(a => a[0] === a[1]), true, 'only not-ON features listed');
  const b4 = await batch(4), b5 = await batch(5), b6 = await batch(6);
  ok(b1.cards.some(c => /^1\.2 T36/.test(c)) && b1.cards.some(c => /^1\.10 /.test(c)) && b1.cards.some(c => /^T37 ·/.test(c)), 'batch 1 items');
  ok(b2.cards.some(c => /^T23 ·/.test(c)) && b2.cards.some(c => /^T30 ·/.test(c)) && b2.cards.some(c => /^T10 ·/.test(c)), 'batch 2 T items');
  ok(!b2.cards.some(c => /^D2/.test(c) || /Các T còn lại/.test(c)), 'D2 plan item must not be a card');
  ok(b3.cards.includes('LEG-01') && b3.cards.includes('P4-02') && b3.cards.includes('P4-03'), 'batch 3 backlog');
  ok(b3.cards.some(c => /Quản trị ngân sách/.test(c)) && b3.cards.some(c => /Ghi dữ liệu qua REST/.test(c)), 'batch 3: not-yet-ON features listed');
  ok(b4.cards.includes('LEG-17') && b4.cards.includes('LEG-04') && !b4.cards.includes('LEG-01'), 'batch 4');
  ok(b5.cards.includes('P4-01') && b5.cards.includes('P4-02') && b5.cards.includes('P4-03') && b5.cards.includes('P4-04'), 'batch 5 incl. shared P4-02/03');
  ok(b6.cards.includes('LEG-10') && b6.cards.includes('P4-06'), 'batch 6');
  ok(/Phần của đợt này: phần trùng/.test(b3.txt) && /Phần của đợt này: phần riêng/.test(b5.txt), 'part labels on both batches');
  for (const [n, b] of [[1, b1], [2, b2], [3, b3], [4, b4], [5, b5], [6, b6]]) { ok(b.head && /\S/.test(b.head), 'head ' + n); ok(/Dự kiến:/.test(b.txt), 'eta ' + n); ok(b.bar && +b.bar[1] > 0, 'bar max ' + n); }
  eq(b3.bar[1], '29'); ok(+b4.bar[1] === 5 && +b6.bar[1] === 6 && +b5.bar[1] === 4, 'counts ' + [b4.bar, b5.bar, b6.bar]);
  ok(!/T35 ·/.test(b1.txt + b2.txt), 'closed T35 is not on the roadmap');
  ok(!/Phase 3\.3/.test(b3.head + ''), 'no Phase 3.3 heading');
  await p._ctx.close();
});

await T('05 roadmap falls back gracefully when batch/closed fields are absent (older status.json)', async () => {
  const p = await open({data: 'noFields', hash: '#roadmap/1'});
  const get = async n => { await p.locator('#rtab-' + n).click(); return p.evaluate(() => [...document.querySelectorAll('#batchPanel .today-title,#batchPanel .legacy-id')].map(e => e.textContent)); };
  ok((await get(1)).some(c => /^1\.2 /.test(c)), 'D1.x by id');
  const b2 = await get(2); ok(b2.some(c => /^T23 ·/.test(c)), 'IN_PROGRESS/PLANNED default to batch 2');
  const b3 = await get(3); ok(b3.includes('LEG-01'), 'LEG by next-tag'); ok((await get(5)).includes('P4-02'), 'two-batch tag');
  ok(/Đợt 3/.test(await p.locator('#rtab-3').innerText()), 'tab label');
  eq(await p.locator('#batchPanel h2').count(), 1);
  await p._ctx.close();
});

/* ---------- prod ---------- */
await T('06 Đã lên PROD > Hoàn tất lists only T35 (closed); T35 is also absent from "chưa hoàn tất"', async () => {
  const p = await open({hash: '#prod/done'});
  const t = await p.evaluate(() => ({cards: [...document.querySelectorAll('#prodDoneBody .today-title')].map(e => e.textContent), n: document.getElementById('prodDoneCount').textContent, pill: document.querySelector('#prodDoneBody .pill-closed')?.textContent}));
  eq(t.cards.length, 1); ok(/^T35 ·/.test(t.cards[0]), t.cards[0]); eq(t.n, '1'); ok(/HOÀN TẤT/.test(t.pill));
  await p.locator('#ptab-on').click();
  const on = await p.evaluate(() => [...document.querySelectorAll('#prodOnWork .today-title')].map(e => e.textContent));
  ok(on.length >= 10 && on.every(x => !/^T35 ·/.test(x)) && on.some(x => /^T32 ·/.test(x)), 'on list ' + on.length);
  ok(await p.locator('#progressItems .progress-card').count() === 15, 'progress filter default = ON (15)');
  await p.locator('[data-progress-filter=all]').click(); eq(await p.locator('#progressItems .progress-card').count(), 19);
  await p.locator('[data-progress-filter=remaining]').click(); eq(await p.locator('#progressItems .progress-card').count(), 4);
  ok(/ON không có nghĩa là hoàn tất/.test(await p.locator('#prodOnNote').innerText()) && /E2E độc lập PROD 0\/19, UAT 0\/19/.test(await p.locator('#prodOnNote').innerText()), 'ON != DONE live counts');
  ok(await p.locator('#stats .stat').count() === 4, 'stats kept');
  await p._ctx.close();
});

await T('07 empty state when nothing is closed + detail drawer opens/closes from a progress card', async () => {
  const p = await open({data: 'nothingClosed', hash: '#prod/done'});
  const t = await p.locator('#prodDoneBody .empty-state').innerText(); ok(/Chưa có mục hoàn tất/.test(t) && /QA\/SEC độc lập/.test(t), t);
  await p.locator('#ptab-on').click(); await p.locator('#progressItems .progress-card').first().click();
  ok(await p.locator('#detailShell').isVisible(), 'drawer open'); await p.keyboard.press('Escape'); ok(!(await p.locator('#detailShell').isVisible()), 'drawer closed');
  eq(await p.evaluate(() => document.activeElement.className.includes('progress-card')), true, 'focus returns');
  await p._ctx.close();
});

/* ---------- owner ---------- */
await T('08 Chờ anh quyết: decision card flow still produces the exact "[OWNER] ... duyệt từ dashboard" message, red dot + count', async () => {
  const p = await open({data: 'withDecision', hash: '#owner'});
  const dot = await p.evaluate(() => ({cls: document.getElementById('tab-owner').className, n: document.getElementById('ownerTabCount').textContent, label: document.getElementById('tab-owner').getAttribute('aria-label'), dotShown: getComputedStyle(document.querySelector('.owner-alert-dot')).display}));
  ok(/has-owner-actions/.test(dot.cls) && dot.n === '1' && /Chờ anh quyết: 1/.test(dot.label) && dot.dotShown !== 'none', JSON.stringify(dot));
  const card = p.locator('.owner-action-card', {hasText: 'Thẻ quyết định thử nghiệm'});
  await card.locator('input[value=A]').check(); await card.locator('.od-note').fill('ghi chú thử');
  const msg = await p.locator('.od-msg').inputValue();
  ok(/^## \[OWNER\] \d\d:\d\d ICT \d\d\/\d\d: duyệt từ dashboard\n- TEST-OD-1: chọn A \(Đồng ý\)\. Ghi chú: ghi chú thử$/.test(msg), msg);
  await p.locator('.od-btn', {hasText: 'Sao chép'}).click();
  eq(await p.evaluate(() => window.__clip[0]), msg, 'clipboard');
  await p.locator('.od-btn.od-primary').click(); await p.waitForTimeout(60);
  ok((await p.evaluate(() => window.__opened[0])) === 'https://github.com/luan20495/xweb01/issues/88#issuecomment-new', 'opens GitHub #88 comment');
  ok(await p.locator('#odFab').isHidden() === false, 'fab visible on owner tab');
  await p.locator('#tab-roadmap').click(); ok(await p.locator('#odFab').isHidden(), 'fab hidden elsewhere');
  await p.locator('#tab-owner').click(); ok(await p.locator('#odFab').isVisible(), 'fab back on owner tab');
  await shot(p, 'shell-owner-1440'); await p._ctx.close();
});

await T('09 Process tab is still reachable and rendered by the shell', async () => {
  const p = await open({hash: '#process'}); ok(await p.locator('.pc-g').count() > 0, 'groups'); await p._ctx.close();
});

/* ---------- i18n / theme ---------- */
await T('10 language toggle (vi/en) and theme cycle; labels switch, hash and tab state persist', async () => {
  const p = await open({hash: '#prod/on'});
  await p.locator('#lang').click(); await p.waitForFunction(() => document.documentElement.lang === 'en');
  const en = await p.evaluate(() => ({tabs: [...document.querySelectorAll('#mainTabs .board-tab-name')].map(e => e.textContent), h: document.querySelector('h1').textContent, sub: document.getElementById('boardSubtitle').textContent, subtabs: [...document.querySelectorAll('#prodTabs .sub-name')].map(e => e.textContent), title: document.title}));
  eq(en.tabs, ['Roadmap', 'Process & settings', 'Live on PROD', 'Awaiting you']); ok(/Delivery Control/.test(en.h) && /Delivery Control/.test(en.title), en.h);
  ok(/evidence first/.test(en.sub)); eq(en.subtabs, ['Closed', 'Live, not closed']); eq(await hashOf(p), '#prod/on');
  await p.locator('#tab-roadmap').click(); await p.waitForSelector('#batchPanel .batch-head');
  ok(/Target:/.test(await p.locator('#batchPanel .batch-kicker').innerText()), 'roadmap en');
  const th = []; for (let i = 0; i < 3; i++) { await p.locator('#theme').click(); th.push(await p.evaluate(() => document.documentElement.dataset.theme)); }
  eq(th, ['dark', 'light', 'light']); // light -> dark -> auto (light scheme) -> light
  await p._ctx.close();
});

/* ---------- responsive, a11y ---------- */
const VIEWS = [['roadmap/1', 'view-roadmap'], ['roadmap/3', 'view-roadmap'], ['process', 'view-process'], ['prod/done', 'view-prod'], ['prod/on', 'view-prod']];
for (const [w, h] of [[1440, 900], [390, 844], [360, 740]]) {
  for (const theme of ['light', 'dark']) {
    await T(`11 [${w}-${theme}] no horizontal scroll in every tab + sub-tab; tabs/sub-tabs >= 44px; no console errors`, async () => {
      const p = await open({w, h, theme, scheme: theme});
      for (const [hv, id] of [...VIEWS, ['owner', 'view-owner']]) {
        await p.evaluate(x => { location.hash = '#' + x; }, hv); await p.waitForTimeout(60);
        ok(await p.locator('#' + id).isVisible(), 'visible ' + hv);
        const o = await p.evaluate(() => ({doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: document.body.scrollWidth - document.documentElement.clientWidth}));
        ok(o.doc <= 0 && o.body <= 0, `h-scroll on #${hv}: ${JSON.stringify(o)}`);
        const small = await p.evaluate(() => [...document.querySelectorAll('#mainTabs [role=tab],.sub-nav [role=tab]:not([hidden])')].filter(t => t.offsetParent).filter(t => { const r = t.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(t => t.id));
        ok(!small.length, 'small targets ' + small);
      }
      await shot(p, `shell-prod-${w}-${theme}`); await p._ctx.close();
    });
  }
}
await T('12 sticky main tab bar on mobile (stays in view after scroll)', async () => {
  const p = await open({w: 390, h: 844, hash: '#prod/on'}); await p.evaluate(() => window.scrollTo(0, 1200)); await p.waitForTimeout(80);
  const top = await p.evaluate(() => document.querySelector('.tabbar').getBoundingClientRect().top); ok(Math.abs(top) < 2, 'tabbar top=' + top); await p._ctx.close();
});
await T('13 reduced motion: no transition on tabs', async () => {
  const ctx = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}}); const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForSelector('#batchPanel .batch-head');
  const d = await p.evaluate(() => getComputedStyle(document.querySelector('.board-tab')).transitionDuration); ok(/^0s(, 0s)*$/.test(d), d); await ctx.close();
});
for (const theme of ['light', 'dark']) {
  await T(`14 [${theme}] axe-core: 0 serious/critical on every tab (wcag2a/aa)`, async () => {
    if (!axeSrc) return 'NOT_RUN';
    const p = await open({theme, scheme: theme}); await p.evaluate(axeSrc); const bad = [];
    for (const [hv] of [...VIEWS, ['owner']]) {
      await p.evaluate(x => { location.hash = '#' + x; }, hv); await p.waitForTimeout(450); // let the view-enter animation finish
      const v = await p.evaluate(async () => (await axe.run(document, {runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']})).violations.filter(x => ['serious', 'critical'].includes(x.impact)).map(x => x.id + ':' + x.nodes.length + ':' + x.nodes[0].target.join(' ').slice(0, 60) + ' ' + (x.nodes[0].any[0]?.message || '').slice(0, 110)));
      if (v.length) bad.push(hv + ' -> ' + v.join('; '));
    }
    ok(!bad.length, bad.join(' | ')); await p._ctx.close();
  });
}
await T('15 no console errors during the whole run', async () => { ok(!consoleErrors.length, consoleErrors.slice(0, 3).join(' | ')); });

await browser.close(); server.close();
const w = Math.max(...results.map(r => r[0].length));
for (const [n, s, d] of results) console.log(`${s.padEnd(8)} ${n.padEnd(w)}  ${d}`);
const c = k => results.filter(r => r[1] === k).length;
console.log(`\nPASS ${c('PASS')}  FAIL ${c('FAIL')}  NOT_RUN ${c('NOT_RUN')}${SHOTS ? '  screenshots: ' + SHOTS : ''}`);
process.exit(c('FAIL') ? 1 : 0);
