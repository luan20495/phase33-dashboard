// Automated UI check for the "Máy phụ (làn build/test)" box at the top of the #process tab.
// Run:  node tests/lane-ui.mjs      Env: PW_MODULE=<playwright-core path>  SHOTS=<dir for screenshots>
// Serves index.html on 127.0.0.1 with tests/fixtures/status.process.json (+ an in-memory `lane` key) and, for two cases, the REAL status.json
// (read-only, routed in memory, never written).
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
const FIX = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/status.process.json'), 'utf8'));
const REAL = fs.readFileSync(path.join(root, 'status.json'), 'utf8');
const LANE = {
  title: 'Máy phụ (làn build/test)', updatedAt: '2026-11-13T00:05:00+07:00', status: 'IN_SETUP',
  summary: 'Máy phụ đầu tiên đang được dựng: làn CHƯA sẵn sàng và CHƯA xác minh. ' + 'Một đoạn rất dài không có dấu cách '.repeat(1) + 'x'.repeat(120),
  links: [
    {label: 'Runbook thêm máy mới', url: 'https://github.com/example/dashboard/blob/main/docs/lane/RUNBOOK-NEW-MACHINE.md'},
    {label: 'Nhật ký', url: 'https://github.com/example/dashboard/blob/main/docs/lane/LANE-FIRST-MACHINE-LOG.md'},
    {label: 'Liên kết không an toàn phải bị bỏ', url: 'javascript:alert(1)'},
    {label: 'http thường cũng bị bỏ', url: 'http://example.com/x'}
  ]
};
let mode = 'fixture'; // fixture | nolane | real | status:<S>
function body() {
  if (mode === 'real') return REAL;
  const d = JSON.parse(JSON.stringify(FIX));
  if (mode === 'nolane') return JSON.stringify(d);
  d.lane = JSON.parse(JSON.stringify(LANE));
  if (mode.startsWith('status:')) d.lane.status = mode.slice(7);
  return JSON.stringify(d);
}
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/status.json') { res.writeHead(200, {'content-type': 'application/json'}); return res.end(body()); }
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
async function open({w = 1280, h = 900, theme = 'light', scheme = 'light', m = 'fixture'} = {}) {
  mode = m;
  const ctx = await browser.newContext({viewport: {width: w, height: h}, colorScheme: scheme, deviceScaleFactor: 1});
  await ctx.addInitScript(theme => { try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); if (theme) localStorage.setItem('xweb-theme', theme); } } catch {} }, theme);
  const page = await ctx.newPage();
  page.on('console', x => { if (x.type() === 'error' && !/favicon/.test(x.location().url + x.text())) consoleErrors.push(x.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '#process');
  await page.waitForSelector('#processBody .pc-g, #processBody .owner-empty');
  page._ctx = ctx;
  return page;
}
const shot = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name + '.png'), fullPage: false}); };
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

// ----------------------------------------------------------------------------------------------
const p0 = await open();
await T('01 box exists as the FIRST child of #processBody and is collapsed by default', async () => {
  ok(await p0.locator('#processBody > details.ln-box').count() === 1, 'one box');
  ok(await p0.evaluate(() => document.getElementById('processBody').firstElementChild.id) === 'laneBox', 'first child');
  ok(!(await p0.locator('#laneBox').evaluate(d => d.open)), 'should be closed');
  ok(!(await p0.locator('#laneBox .ln-body').isVisible()), 'body hidden while closed');
});
await T('02 summary: title + status chip text, >= 44px high, keyboard (Enter/Space) toggles', async () => {
  const s = p0.locator('#laneBox > summary');
  ok(/Máy phụ \(làn build\/test\)/.test(await s.innerText()), await s.innerText());
  ok((await s.locator('.ln-chip').innerText()) === 'Đang dựng, chưa xác minh', 'chip');
  const h = (await s.boundingBox()).height; ok(h >= 43.5, 'h=' + h);
  await s.focus(); await p0.keyboard.press('Enter'); ok(await p0.locator('#laneBox').evaluate(d => d.open), 'Enter opens');
  await p0.keyboard.press('Space'); ok(!(await p0.locator('#laneBox').evaluate(d => d.open)), 'Space closes');
  await p0.keyboard.press('Enter');
});
await T('03 open: updatedAt line (ICT), summary, only https links rendered with rel=noopener noreferrer, >= 44px', async () => {
  ok(/Cập nhật .*ICT/.test(await p0.locator('#laneBox .ln-meta').innerText()), 'meta');
  ok(/CHƯA sẵn sàng và CHƯA xác minh/.test(await p0.locator('#laneBox .ln-body').innerText()), 'summary');
  const l = await p0.locator('#laneBox .ln-links a').evaluateAll(a => a.map(x => ({t: x.textContent, h: x.getAttribute('href'), r: x.rel, g: x.target, bh: x.getBoundingClientRect().height})));
  ok(l.length === 2, JSON.stringify(l));
  ok(l.every(x => x.h.startsWith('https://') && /noopener/.test(x.r) && /noreferrer/.test(x.r) && x.g === "_blank" && x.bh >= 43.5), JSON.stringify(l));
});
await T('04 the rest of the Process tab still works (groups, search) and is not touched', async () => {
  ok(await p0.locator('.pc-g').count() >= 8, 'groups');
  await p0.locator('#pcSearch').fill('agents.max');
  ok(await p0.locator('.pc-it:visible').count() === 2, 'search filters 2 items');
  ok(await p0.locator('#laneBox').isVisible(), 'box stays visible while searching');
  await p0.locator('#pcSearch').press('Escape');
});
await T('05 status chips map: READY / BLOCKED / NOT_RUN / unknown value', async () => {
  const out = {};
  for (const [s, want] of [['READY', 'Sẵn sàng'], ['BLOCKED', 'Bị chặn'], ['NOT_RUN', 'Chưa chạy'], ['WHATEVER', 'Chưa rõ trạng thái']]) {
    const p = await open({m: 'status:' + s}); out[s] = await p.locator('#laneBox .ln-chip').innerText(); ok(out[s] === want, s + ' -> ' + out[s]); await p._ctx.close();
  }
});
await T('06 no `lane` key: no box, no error, tab still renders', async () => {
  const p = await open({m: 'nolane'}); ok(await p.locator('#laneBox').count() === 0, 'no box'); ok(await p.locator('.pc-g').count() >= 8, 'groups'); await p._ctx.close();
});
await T('07 REAL status.json: box present with 4 https links to the lane docs and a known status chip', async () => {
  const p = await open({m: 'real'});
  ok(await p.locator('#laneBox').count() === 1, 'box');
  await p.locator('#laneBox > summary').click();
  const h = await p.locator('#laneBox .ln-links a').evaluateAll(a => a.map(x => x.getAttribute('href')));
  ok(h.length === 4 && h.every(x => /^https:\/\/github\.com\/[^/]+\/phase33-dashboard\/blob\/main\/docs\/lane\/[A-Za-z0-9._-]+$/.test(x)), JSON.stringify(h));
  ok(h.some(x => x.endsWith('/RUNBOOK-NEW-MACHINE.md')), 'runbook link');
  ok(['Đang dựng, chưa xác minh', 'Sẵn sàng', 'Bị chặn', 'Chưa chạy'].includes(await p.locator('#laneBox .ln-chip').innerText()), 'chip text is a known status label');
  await p._ctx.close();
});
await p0.close(); await p0._ctx.close();

for (const [w, h, theme, scheme] of [[320, 640, 'light', 'light'], [320, 640, 'dark', 'dark'], [375, 800, 'light', 'light'], [768, 900, 'dark', 'dark'], [1024, 800, 'light', 'light'], [1440, 900, 'dark', 'dark'], [1440, 900, 'light', 'light']]) {
  const tag = `${w}-${theme}`;
  const p = await open({w, h, theme, scheme});
  await p.locator('#laneBox > summary').click();
  await shot(p, `lane-${tag}`);
  await T(`10 [${tag}] no horizontal scroll, box inside the viewport, links inside the box`, async () => {
    const m = await p.evaluate(() => { const b = document.getElementById('laneBox').getBoundingClientRect(); const bad = [...document.querySelectorAll('#laneBox *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > b.right + 0.5 || r.left < b.left - 0.5); }).map(e => e.className || e.tagName); return {sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, l: b.left, r: b.right, vw: innerWidth, bad}; });
    ok(m.sw <= m.cw + 1, JSON.stringify(m)); ok(m.l >= -0.5 && m.r <= m.vw + 0.5, JSON.stringify(m)); ok(m.bad.length === 0, JSON.stringify(m.bad));
  });
  await T(`11 [${tag}] text contrast >= 4.5:1 inside the box (summary, chip, text, links)`, async () => {
    const c = await p.evaluate(contrastFn); ok(c.bad.length === 0, JSON.stringify(c.bad)); return `${c.n} text nodes checked in the Process tab`;
  });
  await T(`12 [${tag}] summary + links >= 44px, chip not clipped, theme is ${theme}`, async () => {
    ok(await p.evaluate(() => document.documentElement.dataset.theme) === theme, 'theme');
    const t = await p.evaluate(() => [...document.querySelectorAll('#laneBox > summary, #laneBox .ln-links a')].map(e => e.getBoundingClientRect().height).filter(h => h < 43.5));
    ok(t.length === 0, JSON.stringify(t));
    const clip = await p.evaluate(() => { const c = document.querySelector('#laneBox .ln-chip'); return c.scrollWidth > c.clientWidth + 1; }); ok(!clip, 'chip clipped');
  });
  await p._ctx.close();
}
await T('13 OS dark scheme with theme=auto: box usable', async () => {
  const p = await open({scheme: 'dark', theme: 'auto'}); ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark');
  await p.locator('#laneBox > summary').click(); ok(await p.locator('#laneBox .ln-links a').first().isVisible(), 'links visible'); await p._ctx.close();
});
await T('14 no console errors during the whole run', async () => { ok(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ')); });

await browser.close(); server.close();
const w = Math.max(...results.map(r => r[0].length));
for (const [n, s, d] of results) console.log(`${s.padEnd(8)} ${n.padEnd(w)}  ${d}`);
const c = k => results.filter(r => r[1] === k).length;
console.log(`\nPASS ${c('PASS')}  FAIL ${c('FAIL')}  NOT_RUN ${c('NOT_RUN')}${SHOTS ? '  screenshots: ' + SHOTS : ''}`);
process.exit(c('FAIL') ? 1 : 0);
