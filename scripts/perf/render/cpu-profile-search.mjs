#!/usr/bin/env node
/**
 * 조회 응답 뒤 프런트 구간의 CPU 배분 — 가이드 R11(행마다 무거운 가공) 판정용.
 *
 * 왜 따로 있는가
 *   검증(docs/perf-render/mdm-findings-verification.md §8)은 응답 헤더 → 첫 행 ≈33ms 중 ≈20ms 바닥값의 성분
 *   (본문 파싱·행 가공·AG Grid 적재·React 커밋)을 나누지 못했다. trace 에 CPU 프로파일러가 없었기 때문이다.
 *   이 스크립트는 CDP `Profiler` 로 [조회](또는 [전체 보기]) 한 번을 표본 추출하고, **조회 응답 헤더 도착 뒤**
 *   표본만 모아 함수별 self·inclusive 시간을 낸다.
 *
 * 대상 서버는 `next build --profile --no-mangling` 번들이어야 함수 이름이 읽힌다(count-renders.mjs 와 같은 번들).
 * 프로파일러가 켜진 측정이라 절대값은 일반 번들보다 크다 — 배분(비율)과 순위로 읽는다.
 *
 * 동작(화면·회차마다 새 컨텍스트): 메뉴 진입 → (mode=full 이면 [조회] 를 먼저 한 번 하고) → 프로파일 시작 →
 *   [조회](mode=limit) 또는 [전체 보기](mode=full) 클릭 → 첫 행(또는 안내 띠 사라짐) + 다음 프레임 → 프로파일 멈춤.
 *   저장·삭제 단추는 누르지 않는다.
 *
 * 환경 변수: RENDER_BASE_URL(기본 http://localhost:5300) · RENDER_LOGIN_USER/PASSWORD(admin/admin123) ·
 *   RENDER_SCREENS(기본 columnMng,termMng) · CPU_MODES(기본 limit,full) · RENDER_ROUNDS(기본 3) ·
 *   CPU_SAMPLING_US(기본 100) · PERF_OUT(기본 $TMPDIR/dmes-perf/render-cpu) · PLAYWRIGHT_PATH
 * 결과: $PERF_OUT/cpu-profile.json(회차별 요약) + `<screen>-<mode>-r<n>.cpuprofile`(DevTools 로 열 수 있다) + 표준 출력 표.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SCREENS, SHELL_SELECTOR, VISIBLE_GRID, firstRowSelector } from "./screens.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.RENDER_BASE_URL ?? "http://localhost:5300").replace(/\/+$/, "");
const USER = process.env.RENDER_LOGIN_USER ?? "admin";
const PASSWORD = process.env.RENDER_LOGIN_PASSWORD ?? "admin123";
const OUT = process.env.PERF_OUT ?? path.join(process.env.TMPDIR ?? "/tmp", "dmes-perf", "render-cpu");
const ROUNDS = Number(process.env.RENDER_ROUNDS ?? 3);
const SAMPLING_US = Number(process.env.CPU_SAMPLING_US ?? 100);
const MODES = (process.env.CPU_MODES ?? "limit,full").split(",").map((s) => s.trim()).filter(Boolean);
const TIMEOUT = 60_000;
const ids = (process.env.RENDER_SCREENS ?? "columnMng,termMng").split(",").map((s) => s.trim()).filter(Boolean);
const targets = SCREENS.filter((s) => ids.includes(s.id));

function loadChromium() {
  const cands = [process.env.PLAYWRIGHT_PATH, path.join(HERE, "../../../src/frontend"), path.join(HERE, "../../src/frontend")].filter(Boolean);
  for (const c of cands) {
    try {
      return createRequire(path.join(c, "package.json"))("@playwright/test").chromium;
    } catch {}
    try {
      return createRequire(path.join(c, "package.json"))("playwright").chromium;
    } catch {}
  }
  throw new Error("playwright 모듈을 찾지 못했다. PLAYWRIGHT_PATH 를 준다.");
}

const round1 = (n) => Math.round(n * 10) / 10;
const isSearch = (screen, url, postData) =>
  screen.searchUrlPattern.test(url) && !(screen.searchUrlExclude?.test(postData ?? "") || screen.searchUrlExclude?.test(url));

async function login(context) {
  const csrf = await (await context.request.get(`${BASE_URL}/api/auth/csrf`)).json();
  const res = await context.request.post(`${BASE_URL}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrf.csrfToken}&userId=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASSWORD)}&callbackUrl=${encodeURIComponent(BASE_URL + "/portal")}&json=true`,
  });
  // 실패하면 재시도하지 않는다(5회 실패 시 계정 잠금).
  if (!res.ok()) { console.error(`로그인 실패 HTTP ${res.status()} — 재시도하지 않는다`); process.exit(1); }
}

const menuItem = (page, re) => page.locator(".tree-item .item-name:visible").filter({ hasText: re }).first();

async function clickTrail(page, screen) {
  for (let i = 0; i < screen.trail.length; i++) {
    const item = menuItem(page, screen.trail[i]);
    await item.waitFor({ state: "visible", timeout: TIMEOUT });
    if (i === screen.trail.length - 1) return item.click();
    const child = menuItem(page, screen.trail[i + 1]);
    if (await child.isVisible().catch(() => false)) continue;
    await item.click();
    await child.waitFor({ state: "visible", timeout: TIMEOUT });
  }
}

/** /api/ Resource Timing 수가 quietMs 동안 늘지 않을 때까지(최대 maxMs) 기다린다. */
async function apiQuiet(page, quietMs = 500, maxMs = 10_000) {
  await page.evaluate(
    ([quiet, max]) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        let last = -1;
        let since = t0;
        const tick = () => {
          const now = performance.now();
          const n = performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/")).length;
          if (n !== last) { last = n; since = now; }
          if (now - since >= quiet || now - t0 >= max) return resolve();
          setTimeout(tick, 50);
        };
        tick();
      }),
    [quietMs, maxMs]
  );
}

/**
 * 프로파일 표본을 시각과 함께 펼친다. CDP Profiler 의 startTime·timeDeltas 는 µs 이고
 * Network 이벤트 timestamp(초)와 같은 monotonic 축이다.
 */
function analyze(profile, fromUs, toUs) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => {
    const f = n.callFrame;
    const file = f.url ? f.url.split("/").pop().split("?")[0] : "";
    return `${f.functionName || "(anonymous)"}${file ? ` ${file}:${f.lineNumber + 1}` : ""}`;
  };
  const self = new Map();
  const incl = new Map();
  const byFile = new Map();
  let total = 0;
  let idle = 0;
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    if (t < fromUs || t > toUs) continue;
    // 표본 하나의 길이 = 다음 표본까지의 간격(마지막은 표본 간격으로 본다).
    const dt = (profile.timeDeltas[i + 1] ?? SAMPLING_US) / 1000;
    const node = byId.get(profile.samples[i]);
    const name = node.callFrame.functionName;
    total += dt;
    if (name === "(idle)") { idle += dt; continue; }
    const l = label(node);
    self.set(l, (self.get(l) ?? 0) + dt);
    // 파일(청크) 단위 self 합 — 청크가 어느 패키지인지는 chunkKinds 로 붙인다. url 없는 함수는 native·엔진 몫이다.
    const file = node.callFrame.url ? node.callFrame.url.split("/").pop().split("?")[0] : name.startsWith("(") ? name : "(native) " + name;
    byFile.set(file, (byFile.get(file) ?? 0) + dt);
    const seen = new Set();
    for (let id = node.id; id !== undefined; id = parent.get(id)) {
      const ln = label(byId.get(id));
      if (seen.has(ln)) continue;
      seen.add(ln);
      incl.set(ln, (incl.get(ln) ?? 0) + dt);
    }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, round1(v)]);
  return { windowMs: round1(total), idleMs: round1(idle), busyMs: round1(total - idle), byFile: top(byFile, 20), selfTop: top(self, 25), inclTop: top(incl, 40) };
}

/** 첫 행(mode=limit) 또는 안내 띠 사라짐(mode=full) 과 그다음 프레임을 페이지 시계로 남긴다. */
async function armDone(page, screen, mode) {
  const tab = await page.locator(VISIBLE_GRID.trim()).first().elementHandle();
  await page.evaluate(
    ([tab, title, mode]) => {
      const st = (window.__CPUCLK__ = { click: null, done: null, frame: null });
      const listScope = () => {
        if (!title) return tab;
        const p = [...tab.querySelectorAll(".grid-panel")].find((g) => (g.querySelector(".grid-panel-title")?.textContent ?? "").includes(title));
        return p ? p.querySelector(".grid-panel-content") ?? p : null;
      };
      const ready = () => {
        if (mode === "full") return !tab.querySelector('[data-testid$="-limit"]');
        const r = listScope()?.querySelector(".ag-center-cols-container .ag-row[row-id]");
        return !!(r && r.getClientRects().length);
      };
      document.addEventListener("click", (e) => { if (st.click === null) st.click = e.timeStamp; }, { capture: true, once: true });
      const mo = new MutationObserver(() => {
        if (st.click === null || st.done !== null || !ready()) return;
        st.done = performance.now();
        mo.disconnect();
        requestAnimationFrame(() => { st.frame = performance.now(); });
      });
      mo.observe(tab, { childList: true, subtree: true, attributes: true });
    },
    [tab, screen.listPanelTitle ?? null, mode]
  );
}

/**
 * 청크 파일 이름 → 소속 패키지. 프로파일의 url 은 해시 청크라 그대로는 못 읽는다. 대상 서버의 청크를 한 번 받아
 * 특징 문자열로 분류한다(ag-grid-community·react-dom·@mantine/core·화면 이름). 실패하면 빈 값.
 */
const chunkKinds = new Map();
async function kindOf(file) {
  if (!file.endsWith(".js")) return "";
  if (chunkKinds.has(file)) return chunkKinds.get(file);
  let kind = "";
  try {
    const text = await (await fetch(`${BASE_URL}/_next/static/chunks/${file}`)).text();
    const marks = [["ag-grid-community", "AG Grid"], ["react-dom", "React"], ["@mantine/core", "Mantine"]];
    kind = marks.filter(([m]) => text.includes(m)).map(([, k]) => k).join("+");
    for (const t of targets) if (text.includes(t.id)) kind = (kind ? kind + "+" : "") + `화면(${t.id})`;
  } catch {}
  chunkKinds.set(file, kind);
  return kind;
}

const chromium = loadChromium();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const screen of targets) {
    for (const mode of MODES) {
      for (let round = 1; round <= ROUNDS; round++) {
        const context = await browser.newContext();
        await login(context);
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        const reqs = new Map();
        cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { url: e.request.url, postData: e.request.postData ?? "", sent: e.timestamp }));
        cdp.on("Network.responseReceived", (e) => { const r = reqs.get(e.requestId); if (r) r.headers = e.timestamp; });
        cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) { r.finished = e.timestamp; r.bytes = e.encodedDataLength; } });

        const menuResp = page.waitForResponse((r) => r.url().includes("myMenusTree") && r.status() === 200, { timeout: TIMEOUT });
        await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
        await menuResp.catch(() => {});
        await page.waitForFunction(() => document.querySelectorAll(".tree-item .item-name").length >= 3, undefined, { timeout: TIMEOUT });
        await apiQuiet(page);
        await clickTrail(page, screen);
        await page.locator(`${VISIBLE_GRID}${SHELL_SELECTOR}`).filter({ hasText: screen.breadcrumb }).first().waitFor({ state: "visible", timeout: TIMEOUT });
        await apiQuiet(page);

        const searchBtn = page.locator(`${VISIBLE_GRID}button`).filter({ hasText: /^조회$/ }).first();
        let btn = searchBtn;
        if (mode === "full") {
          await searchBtn.click();
          await page.locator(firstRowSelector(screen)).first().waitFor({ state: "visible", timeout: TIMEOUT });
          await apiQuiet(page);
          btn = page.locator(`${VISIBLE_GRID}[data-testid$="-limit-show-all"]`).first();
          if (!(await btn.isVisible().catch(() => false))) {
            console.log(`  ${screen.id} r${round}: [전체 보기] 단추가 없다(잘리지 않음) — full 건너뜀`);
            await context.close();
            break;
          }
        } else {
          await btn.waitFor({ state: "visible", timeout: TIMEOUT });
          await page.waitForFunction((el) => !el.disabled, await btn.elementHandle(), { timeout: TIMEOUT });
        }
        const before = new Set(reqs.keys());
        await armDone(page, screen, mode);
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: SAMPLING_US });
        await cdp.send("Profiler.start");
        await btn.click();
        await page.waitForFunction(() => window.__CPUCLK__?.frame != null, undefined, { timeout: TIMEOUT });
        const { profile } = await cdp.send("Profiler.stop");
        await cdp.send("Profiler.disable");
        const clk = await page.evaluate(() => window.__CPUCLK__);

        const search = [...reqs].filter(([id, r]) => !before.has(id) && isSearch(screen, r.url, r.postData)).map(([, r]) => r).pop();
        if (!search?.headers) {
          console.log(`  ${screen.id} ${mode} r${round}: 조회 응답을 못 찾았다 — 이 회차 건너뜀`);
          await context.close();
          continue;
        }
        const end = profile.endTime;
        const fromHeaders = analyze(profile, search.headers * 1e6, end);
        const fromFinished = analyze(profile, (search.finished ?? search.headers) * 1e6, end);
        for (const a of [fromHeaders, fromFinished]) for (const e of a.byFile) e.push(await kindOf(e[0]));
        const file = path.join(OUT, `${screen.id}-${mode}-r${round}.cpuprofile`);
        fs.writeFileSync(file, JSON.stringify(profile));
        const row = {
          screen: screen.id,
          mode,
          round,
          clickToDoneMs: round1(clk.done - clk.click),
          clickToFrameMs: round1(clk.frame - clk.click),
          ttfbMs: round1((search.headers - search.sent) * 1000),
          headersToFinishedMs: round1(((search.finished ?? search.headers) - search.headers) * 1000),
          bytes: search.bytes ?? null,
          windowFromUs: search.headers * 1e6,
          afterHeaders: fromHeaders,
          afterFinished: fromFinished,
          profileFile: file,
        };
        results.push(row);
        fs.writeFileSync(path.join(OUT, "cpu-profile.json"), JSON.stringify(results, null, 1));
        console.log(
          `  ${screen.id} ${mode} r${round}: 클릭→완료 ${row.clickToDoneMs}ms(프레임 ${row.clickToFrameMs}) · TTFB ${row.ttfbMs} · ` +
            `헤더 뒤 창 ${fromHeaders.windowMs}ms 중 바쁨 ${fromHeaders.busyMs}ms · 본문 뒤 바쁨 ${fromFinished.busyMs}ms · ${row.bytes}B`
        );
        await context.close();
      }
    }
  }
} finally {
  fs.writeFileSync(path.join(OUT, "cpu-profile.json"), JSON.stringify(results, null, 1));
  await browser.close();
}

// 화면·모드별로 마지막 회차의 상위 함수를 보인다(회차별 값은 cpu-profile.json).
for (const r of results.filter((x, i, a) => a.findLastIndex((y) => y.screen === x.screen && y.mode === x.mode) === i)) {
  console.log(`\n## ${r.screen} · ${r.mode} · r${r.round} — 응답 헤더 뒤 바쁨 ${r.afterHeaders.busyMs}ms`);
  console.log("파일(청크)별 self:");
  for (const [k, v, kind] of r.afterHeaders.byFile.slice(0, 10)) console.log(`  ${v}ms  ${k}${kind ? ` [${kind}]` : ""}`);
  console.log("self 상위:");
  for (const [k, v] of r.afterHeaders.selfTop.slice(0, 15)) console.log(`  ${v}ms  ${k}`);
  console.log("inclusive 상위:");
  for (const [k, v] of r.afterHeaders.inclTop.slice(0, 25)) console.log(`  ${v}ms  ${k}`);
}
