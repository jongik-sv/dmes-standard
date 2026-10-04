#!/usr/bin/env node
/**
 * MDM 화면 렌더링 시간 측정 — `docs/perf-render/mdm-findings.md` 1차 스캔용.
 *
 * ★지시: 실행은 「측정 시작」 신호를 받은 뒤에 한다. 이 스크립트는 그 전까지 **문법 확인만** 한다.
 *
 * 무엇을 재는가 (지표 정의는 `docs/idea.md` 111~115 절에서 왔다)
 *   1. shellReadyMs        메뉴 잎 클릭 → 화면 틀(breadcrumb) 표시
 *   2. clickToRowMs        메뉴 잎 클릭 → 그리드 첫 행 표시   ← idea.md 의 "메뉴 클릭 → 그리드 첫 행"
 *   3. searchToRowMs       [조회] 클릭 → 그리드 첫 행 표시   (조회 대기를 분리한 값)
 *   4. longTaskCount/Sum/Max   PerformanceObserver 'longtask' (50ms 이상)
 *   5. apiCount/apiTotalMs/apiSlowest{url,ms}   CDP Network 도메인
 *   6. scriptMs/taskMs/layoutMs/recalcStyleMs/layoutCount/recalcStyleCount/nodeDelta
 *                           CDP Performance.getMetrics() 구간 델타
 *   7. renderCommits/renderCommitMs/renderTopIds   React <Profiler> 수집분(계측이 있을 때만)
 *      — 계측은 `react-profiler-instrument.example.tsx` 참고. 제품 코드에 넣지 않는다.
 *
 * 탭 상태 두 가지 (`RENDER_TAB_STATE`)
 *   - `cold` (기본) 화면마다 새 페이지를 열어 탭이 **처음 마운트**될 때를 잰다. 첫 방문 비용.
 *   - `warm`             한 페이지를 유지하고 모든 화면을 한 번 방문해 둔 뒤, 다른 탭에 숨어 있는
 *                        화면을 메뉴에서 다시 눌러 **다시 보이는** 비용만 잰다.
 *                        (use-portal-tabs.ts:190-196 — 이미 있는 탭은 setActiveTabId 만 한다.
 *                          재마운트가 없다. portal-shell.tsx:154 가 display 로 숨김만 한다.)
 *
 * 사용법
 *   node scripts/perf/render/measure-screens.mjs [회차] [--screen id] [--list]
 *   RENDER_ROUNDS=3 node scripts/perf/render/measure-screens.mjs
 *
 * 결과는 저장소 밖 `$PERF_OUT` 에 쓴다. 저장소에는 `env.txt` 와 요약문서만 커밋한다.
 */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance as monotonic } from "node:perf_hooks";

import { FIRST_ROW_SELECTOR, SCREENS, SHELL_SELECTOR, screenById } from "./screens.mjs";

const require_ = createRequire(import.meta.url);

// ── 환경 설정 ────────────────────────────────────────────────────────────────
// PC 고유 경로는 전부 환경 변수로 받는다. 여기 박아 두지 않는다(저장소가 여러 PC 에서 쓰인다).
const REPO = process.env.PERF_REPO ?? execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const OUT = process.env.PERF_OUT ?? path.join(process.env.TMPDIR ?? "/tmp", "dmes-perf", "render");
const BASE_URL = (process.env.RENDER_BASE_URL ?? "http://localhost:5300").replace(/\/+$/, "");
const LOGIN_USER = process.env.RENDER_LOGIN_USER ?? "admin";
const LOGIN_PASSWORD = process.env.RENDER_LOGIN_PASSWORD ?? "admin123";
const ROUNDS = Number(process.env.RENDER_ROUNDS ?? 3);
const TAB_STATE = process.env.RENDER_TAB_STATE ?? "cold";
const TIMEOUT = Number(process.env.RENDER_TIMEOUT_MS ?? 60_000);
const LOAD_LIMIT = Number(process.env.LOAD_LIMIT ?? 5);
const DO_TRACE = process.env.RENDER_TRACE === "1";
/** 실행 후 브라우저·컨텍스트를 남기지 않는다. 디버깅할 때만 1 로 둔다. */
const KEEP_OPEN = process.env.RENDER_KEEP_OPEN === "1";

/** performance.getEntriesByType('longtask') 는 브라우저 안에만 있다 — 페이지 로드 전에 심어 둔다. */
const LONGTASK_INIT_SCRIPT = `
(() => {
  window.__LONGTASKS__ = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__LONGTASKS__.push({ startTime: e.startTime, duration: e.duration, name: e.name });
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch (_) { /* longtask 미지원 환경 — 없는 채로 진행 */ }
  // React <Profiler> 계측이 넣어 주는 배열. 없으면 그대로 undefined 다.
  window.__RENDER_PROFILER__ = window.__RENDER_PROFILER__ || null;
})();
`;

// ── 유틸 ────────────────────────────────────────────────────────────────────
const log = (...a) => console.error("[render-perf]", ...a);

function die(msg) {
  console.error("[render-perf] " + msg);
  process.exit(1);
}

/** 1분 load average. 없으면 빈 문자열(그래도 저장은 한다). */
function load1() {
  try {
    const out = execFileSync("uptime", { encoding: "utf8" });
    const m = out.match(/load averages?:\s*([\d.]+)/);
    return m ? Number(m[1]) : NaN;
  } catch {
    return NaN;
  }
}

function acPower() {
  try {
    return execFileSync("pmset", ["-g", "ps"], { encoding: "utf8" }).trim();
  } catch {
    return "(pmset 없음)";
  }
}

/** @playwright/test 또는 playwright 에서 chromium 을 꺼낸다. 어느 쪽이든 warn 하고 끝내지 않는다. */
async function loadChromium() {
  for (const spec of ["@playwright/test", "playwright", "playwright-core"]) {
    try {
      const mod = require_(spec);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium?.launch) return chromium;
    } catch {
      /* 다음 후보 */
    }
  }
  die(
    "playwright 를 찾지 못했다. 이 스크립트는 src/frontend 의 node_modules 를 본다.\n" +
      "  → 그 폴더에서 실행하거나, PLAYWRIGHT_PATH 환경 변수로 playwright 모듈 경로를 준다."
  );
}

/** CDP Performance.getMetrics 의 이름 → 값 */
async function perfMetrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const out = {};
  for (const m of metrics) out[m.name] = m.value;
  return out;
}

function deltaMetrics(before, after) {
  const keys = [
    "ScriptDuration",
    "TaskDuration",
    "LayoutDuration",
    "RecalcStyleDuration",
    "LayoutCount",
    "RecalcStyleCount",
    "Nodes",
    "JSHeapUsedSize",
  ];
  const out = {};
  for (const k of keys) if (before[k] !== undefined && after[k] !== undefined) out[k] = after[k] - before[k];
  return out;
}

// ── API 호출 수집 ───────────────────────────────────────────────────────────
/**
 * CDP Network 도메인으로 요청 단위 시간을 모은다. requestWillBeSent 의 timestamp 는
 * monotonic 이고 loadingFinished 도 같은 축이라 그냥 빼면 된다(초 단위 → ms 로 ×1000).
 */
function attachNetworkCollector(cdp, sink) {
  const pending = new Map();
  const onRequest = (e) => {
    pending.set(e.requestId, { url: e.request.url, method: e.request.method, start: e.timestamp, postData: e.request.postData ?? "" });
  };
  const onDone = (e) => {
    const p = pending.get(e.requestId);
    if (!p) return;
    pending.delete(e.requestId);
    sink.push({ url: p.url, method: p.method, postData: p.postData, status: e.status ?? 0, ms: (e.timestamp - p.start) * 1000 });
  };
  const onFail = (e) => {
    const p = pending.get(e.requestId);
    if (!p) return;
    pending.delete(e.requestId);
    sink.push({ url: p.url, method: p.method, postData: p.postData, status: 0, ms: (e.timestamp - p.start) * 1000, failed: true });
  };
  cdp.on("Network.requestWillBeSent", onRequest);
  cdp.on("Network.loadingFinished", onDone);
  cdp.on("Network.loadingFailed", onFail);
  return () => {
    cdp.off("Network.requestWillBeSent", onRequest);
    cdp.off("Network.loadingFinished", onDone);
    cdp.off("Network.loadingFailed", onFail);
  };
}

const isApiCall = (c) => c.url.includes("/api/") && !c.failed;
const isSearchCall = (screen, c) =>
  screen.searchUrlPattern.test(c.url) && !(screen.searchUrlExclude?.test(c.postData) || screen.searchUrlExclude?.test(c.url));

function summarizeApi(calls) {
  const api = calls.filter(isApiCall);
  const sorted = [...api].sort((a, b) => b.ms - a.ms);
  return {
    apiCount: api.length,
    apiTotalMs: round1(api.reduce((s, c) => s + c.ms, 0)),
    apiSlowestUrl: sorted[0]?.url ?? "",
    apiSlowestMs: round1(sorted[0]?.ms ?? 0),
    apiCalls: api,
  };
}

const round1 = (n) => Math.round(n * 10) / 10;

// ── 페이지 조작 ─────────────────────────────────────────────────────────────
/** next-auth CSRF + credentials 콜백으로 세션 쿠키를 받는다. 로그인 화면 렌더 비용을 측정 구간에서 빼기 위함. */
async function loginByApi(context, baseUrl) {
  const csrfResp = await context.request.get(`${baseUrl}/api/auth/csrf`);
  if (!csrfResp.ok()) die(`CSRF 요청 실패: ${csrfResp.status()} ${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();
  const body =
    `csrfToken=${csrfToken}&userId=${encodeURIComponent(LOGIN_USER)}` +
    `&password=${encodeURIComponent(LOGIN_PASSWORD)}` +
    `&callbackUrl=${encodeURIComponent(baseUrl + "/portal")}&json=true`;
  const res = await context.request.post(`${baseUrl}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: body,
  });
  if (!res.ok()) die(`로그인 실패: ${res.status()} (user=${LOGIN_USER}). 비밀번호를 RENDER_LOGIN_PASSWORD 로 주거나 계정을 바꾼다.`);
  return res.text().then((t) => JSON.parse(t));
}

/** 사이드바 메뉴 항목(보이는 것만). e2e/support/common.ts menuItem 과 같은 규칙. */
function menuItem(page, re) {
  return page.locator(".tree-item .item-name:visible").filter({ hasText: re }).first();
}

/** 메뉴 경로를 위에서 아래로 누른다. 마지막(잎) 클릭 직후의 시각을 돌려준다 — 측정의 t0. */
async function clickTrail(page, screen) {
  for (let i = 0; i < screen.trail.length; i++) {
    const item = menuItem(page, screen.trail[i]);
    await item.waitFor({ state: "visible", timeout: TIMEOUT });
    if (i === screen.trail.length - 1) {
      const t0 = monotonic();
      await item.click();
      return t0;
    }
    await item.click();
  }
  return monotonic();
}

/** 화면 틀(breadcrumb)이 섰는지. */
async function waitShell(page, screen) {
  await page
    .locator(SHELL_SELECTOR)
    .filter({ hasText: screen.breadcrumb })
    .first()
    .waitFor({ state: "visible", timeout: TIMEOUT });
  return monotonic();
}

async function firstRowVisible(page) {
  const row = page.locator(FIRST_ROW_SELECTOR).first();
  return (await row.count()) > 0 && (await row.isVisible().catch(() => false));
}

async function waitFirstRow(page) {
  await page.locator(FIRST_ROW_SELECTOR).first().waitFor({ state: "visible", timeout: TIMEOUT });
  return monotonic();
}

async function readLongTasks(page) {
  return page.evaluate(() => (window.__LONGTASKS__ ?? []).map((e) => ({ startTime: e.startTime, duration: e.duration })));
}

async function readProfiler(page) {
  return page.evaluate(() => {
    const p = window.__RENDER_PROFILER__;
    if (!p || !Array.isArray(p.commits)) return null;
    return p;
  });
}

async function clearBuffers(page) {
  await page.evaluate(() => {
    window.__LONGTASKS__ = [];
    if (window.__RENDER_PROFILER__) window.__RENDER_PROFILER__.commits.length = 0;
  });
}

// ── trace (선택) ────────────────────────────────────────────────────────────
async function startTrace(cdp) {
  if (!DO_TRACE) return null;
  const chunks = [];
  const onData = (e) => chunks.push(...e.value);
  const onDone = () => cdp.off("Tracing.dataCollected", onData);
  cdp.on("Tracing.dataCollected", onData);
  cdp.once("Tracing.tracingComplete", onDone);
  await cdp.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: { includedCategories: ["devtools.timeline", "v8.execute", "disabled-by-default-devtools.timeline"] },
  });
  return {
    async stop() {
      await cdp.send("Tracing.end");
      // tracingComplete 까지 조금 기다린다.
      await new Promise((r) => setTimeout(r, 500));
      return chunks;
    },
  };
}

// ── 한 화면 측정 ────────────────────────────────────────────────────────────
async function measureScreen(page, cdp, screen, calls, round) {
  await clearBuffers(page);

  const before = await perfMetrics(cdp);
  const trace = await startTrace(cdp);

  const t0 = await clickTrail(page, screen);
  const tShell = await waitShell(page, screen);

  let tRow = null;
  let searchToRowMs = null;
  let searched = false;

  // MDM 목록 화면은 진입 시 자동 조회를 하지 않는다. 첫 행이 이미 있으면 조회 없이 끝난 것으로 본다.
  if (await firstRowVisible(page)) {
    tRow = monotonic();
  } else if (screen.needsSearch) {
    const btn = page.getByRole("button", { name: "조회", exact: true }).first();
    await btn.waitFor({ state: "visible", timeout: TIMEOUT });
    const tSearch = monotonic();
    await btn.click();
    searched = true;
    tRow = await waitFirstRow(page);
    searchToRowMs = round1(tRow - tSearch);
  }

  const after = await perfMetrics(cdp);
  const traceChunks = trace ? await trace.stop() : null;

  const longTasks = await readLongTasks(page);
  const profiler = await readProfiler(page);
  const api = summarizeApi(calls);

  const row = {
    round,
    screen: screen.id,
    label: screen.label,
    tab_state: TAB_STATE,
    shellReadyMs: round1(tShell - t0),
    clickToRowMs: tRow === null ? "" : round1(tRow - t0),
    searchToRowMs: searchToRowMs ?? "",
    searched: searched ? 1 : 0,
    longTaskCount: longTasks.length,
    longTaskSumMs: round1(longTasks.reduce((s, e) => s + e.duration, 0)),
    longTaskMaxMs: round1(longTasks.reduce((m, e) => Math.max(m, e.duration), 0)),
    scriptMs: round1(after.ScriptDuration - before.ScriptDuration),
    taskMs: round1(after.TaskDuration - before.TaskDuration),
    layoutMs: round1(after.LayoutDuration - before.LayoutDuration),
    recalcStyleMs: round1(after.RecalcStyleDuration - before.RecalcStyleDuration),
    layoutCount: after.LayoutCount - before.LayoutCount,
    recalcStyleCount: after.RecalcStyleCount - before.RecalcStyleCount,
    nodeDelta: after.Nodes - before.Nodes,
    heapDeltaMB: round1((after.JSHeapUsedSize - before.JSHeapUsedSize) / 1e6),
    ...api,
    renderCommits: profiler?.commits?.length ?? "",
    renderCommitMs: profiler ? round1(profiler.commits.reduce((s, c) => s + (c.actualDuration ?? 0), 0)) : "",
    renderTopIds: profiler?.topIds ? JSON.stringify(profiler.topIds).slice(0, 400) : "",
    load1: load1(),
    rc: 0,
    keep: 1,
    error: "",
  };

  if (load1() > LOAD_LIMIT) {
    row.keep = 0;
    log(`  load>${LOAD_LIMIT} — 이 회차는 버린다: ${screen.id}`);
  }

  if (traceChunks) {
    const dir = path.join(OUT, "trace");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${screen.id}-r${round}-${TAB_STATE}.json`);
    fs.writeFileSync(file, JSON.stringify(traceChunks));
    row.traceFile = file;
  }

  return row;
}

// ── 실행 ────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--list")) {
    for (const s of SCREENS) console.log(`${s.id}\t${s.label}\t${s.breadcrumb}`);
    return;
  }
  const onlyIdx = argv.indexOf("--screen");
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : process.env.RENDER_SCREENS ?? "";
  const roundsArg = argv.find((a) => /^\d+$/.test(a));
  const rounds = Number(roundsArg ?? ROUNDS);
  if (!Number.isFinite(rounds) || rounds < 1) die(`회차 수가 이상하다: ${roundsArg ?? ROUNDS}`);

  const targets = only
    ? only.split(",").map((id) => {
        const s = screenById(id.trim());
        if (!s) die(`알 수 없는 화면 id: ${id}`);
        return s;
      })
    : SCREENS;

  if (!Number.isFinite(LOAD_LIMIT)) die("LOAD_LIMIT 이 숫자가 아니다.");

  const chromium = await loadChromium();
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const rows = [];
  const envLines = [
    `started: ${new Date().toISOString()}`,
    `repo: ${REPO}`,
    `out: ${OUT}`,
    `base_url: ${BASE_URL}`,
    `user: ${LOGIN_USER}`,
    `rounds: ${rounds}`,
    `tab_state: ${TAB_STATE}`,
    `timeout_ms: ${TIMEOUT}`,
    `load_limit: ${LOAD_LIMIT}`,
    `trace: ${DO_TRACE ? "1" : "0"}`,
    `screens: ${targets.map((s) => s.id).join(",")}`,
    `ac: ${acPower()}`,
  ];

  try {
    for (let round = 1; round <= rounds; round++) {
      log(`── 회차 ${round}/${rounds} (tab_state=${TAB_STATE})`);

      if (TAB_STATE === "cold") {
        // 화면마다 새 페이지 — 탭이 처음 마운트되는 상태를 잰다.
        const context = await browser.newContext();
        await loginByApi(context, BASE_URL);
        await context.addInitScript(LONGTASK_INIT_SCRIPT);
        for (const screen of targets) {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send("Performance.enable");
          await cdp.send("Network.enable");
          const calls = [];
          const detach = attachNetworkCollector(cdp, calls);
          try {
            await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
            const row = await measureScreen(page, cdp, screen, calls, round);
            rows.push(row);
            log(
              `  ${screen.id}: shell ${row.shellReadyMs}ms · click→row ${row.clickToRowMs || "n/a"}ms · ` +
                `longTask ${row.longTaskCount}/${row.longTaskSumMs}ms · api ${row.apiCount}/${row.apiTotalMs}ms`
            );
            fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
          } catch (e) {
            log(`  ${screen.id}: 실패 — ${e.message}`);
            rows.push({
              round,
              screen: screen.id,
              label: screen.label,
              tab_state: TAB_STATE,
              keep: 0,
              rc: 1,
              error: String(e.message).slice(0, 300),
            });
          } finally {
            detach();
            await page.close().catch(() => {});
          }
        }
        await context.close();
      } else {
        // warm: 한 페이지를 유지한다. 1회차 방문은 예열(기록하지 않음), 2회차 방문이 측정이다.
        const context = await browser.newContext();
        await loginByApi(context, BASE_URL);
        await context.addInitScript(LONGTASK_INIT_SCRIPT);
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Performance.enable");
        await cdp.send("Network.enable");
        await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

        for (const screen of targets) {
          await clickTrail(page, screen);
          await waitShell(page, screen);
          if (screen.needsSearch && !(await firstRowVisible(page))) {
            const b = page.getByRole("button", { name: "조회", exact: true }).first();
            await b.waitFor({ state: "visible", timeout: TIMEOUT });
            await b.click();
            await waitFirstRow(page).catch(() => {});
          }
        }
        log("  예열 방문 끝 — 이제 각 화면을 다시 눌러 측정한다(숨어 있던 탭을 다시 보이는 비용).");

        for (let i = 0; i < targets.length; i++) {
          const screen = targets[i];
          // 측정할 화면이 현재 활성 탭이면(=방금 연 곳) 숨어 있지 않다. 다른 화면으로 먼저 이동한다.
          const away = targets[(i + 1) % targets.length];
          await clickTrail(page, away);
          await waitShell(page, away);

          const calls = [];
          const detach = attachNetworkCollector(cdp, calls);
          try {
            const row = await measureScreen(page, cdp, screen, calls, round);
            rows.push(row);
            log(
              `  ${screen.id}: shell ${row.shellReadyMs}ms · click→row ${row.clickToRowMs || "n/a"}ms · ` +
                `longTask ${row.longTaskCount}/${row.longTaskSumMs}ms · api ${row.apiCount}/${row.apiTotalMs}ms`
            );
            fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
          } catch (e) {
            log(`  ${screen.id}: 실패 — ${e.message}`);
            rows.push({
              round,
              screen: screen.id,
              label: screen.label,
              tab_state: TAB_STATE,
              keep: 0,
              rc: 1,
              error: String(e.message).slice(0, 300),
            });
          } finally {
            detach();
          }
        }
        await context.close();
      }
    }
  } finally {
    envLines.push(`ended: ${new Date().toISOString()}`);
    fs.writeFileSync(path.join(OUT, "env.txt"), envLines.join("\n") + "\n");
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
    if (!KEEP_OPEN) await browser.close().catch(() => {});
    log(`결과: ${path.join(OUT, "results.json")}`);
    log(`환경: ${path.join(OUT, "env.txt")}`);
  }

  const failed = rows.filter((r) => r.rc !== 0).length;
  log(failed ? `실패 ${failed}건 — results.json 의 error 를 본다.` : "모든 측정 성공.");
}

main().catch((e) => {
  console.error("[render-perf] 예기치 못한 오류:", e);
  process.exit(1);
});
