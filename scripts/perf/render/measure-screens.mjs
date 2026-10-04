#!/usr/bin/env node
/**
 * MDM 화면 렌더링 시간 측정 — `docs/perf-render/mdm-findings.md` 1차 스캔용.
 *
 * ★지시: 실행은 「측정 시작」 신호를 받은 뒤에 한다. 이 스크립트는 그 전까지 **문법 확인만** 한다.
 *
 * 무엇을 재는가 (지표 정의는 `docs/idea.md` 111~115 절에서 왔고, 우선순위는 조정 지시 2-1 에서 정해졌다)
 *   ★주 지표★
 *   1. searchToRowMs        [조회] 클릭 → 그리드 첫 행 표시. 1건 이상인 화면의 본 지표다.
 *      (지시 2-1: 사용자가 실제로 기다리는 구간이므로 이것을 본 지표로 쓴다)
 *   2. searchResponseToEmptyMs   조회 응답 → 그리드 빈 상태 표시. **0건 화면의 본 지표**다.
 *      (조회 응답과 DOM 표시 시각의 시계 축이 달라서, 측정 시작점에서 두 축을 맞추는 장치가 있다)
 *   보조 지표
 *   3. shellReadyMs        메뉴 잎 클릭 → 화면 틀(breadcrumb) 표시. 함께 낸다.
 *      clickToRowMs        메뉴 잎 클릭 → 첫 행. **참고값으로만** 둔다(조회 대기 시간이 섞인다).
 *   나머지
 *   4. longTaskCount/Sum/Max   PerformanceObserver 'longtask' (50ms 이상)
 *   5. apiCount/apiTotalMs/apiSlowest{url,ms}   CDP Network 도메인
 *   6. scriptMs/taskMs/layoutMs/recalcStyleMs/layoutCount/recalcStyleCount/nodeDelta
 *                           CDP Performance.getMetrics() 구간 델타
 *   7. renderCommits/renderCommitMs/renderTopIds   React <Profiler> 수집분(계측이 있을 때만)
 *      — 계측은 `react-profiler-instrument.example.tsx` 참고. 제품 코드에 넣지 않는다.
 *
 * 탭 상태 (`RENDER_TAB_STATE`)
 *   - `cold` (기본, **1차 스캔은 이것만**) 화면마다 새 페이지를 열어 탭이 **처음 마운트**될 때를 잰다.
 *     첫 방문 비용. 지시 2-2.
 *   - `warm`  한 페이지를 유지하고 모든 화면을 예열 방문해 둔 뒤, 다른 탭에 숨어 있는 화면을 메뉴에서
 *     다시 눌러 **다시 보이는** 비용만 잰다. **2차에서 느린 Top 3 에 대해서만** 돌린다(지시 2-2).
 *     (use-portal-tabs.ts:190-196 — 이미 있는 탭은 setActiveTabId 만 한다. 재마운트가 없다.
 *      portal-shell.tsx:154 가 display 로 숨김만 한다. 즉 숨은 탭의 화면은 살아 있다.)
 *
 * 계정 (지시 2-3)
 *   admin / admin123 **만** 쓴다. 다른 계정은 쓰지 않는다 — 비밀번호를 틀리면 잠기고 5회 실패 시 잠긴다.
 *   로그인이 한 번이라도 실패하면 이 스크립트는 곧장 끝난다(재시도하지 않는다). 그때 report.md 에 보고한다.
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
import { performance as perfHooks } from "node:perf_hooks";

/**
 * 측정용 단조 시계(ms).
 *
 * `node:perf_hooks` 의 `performance.now()` 을 쓴다 — 벽시계가 아니라 단조 시계라 NTP 보정으로
 * 값이 뒤로 가지 않는다. (Node 16 에는 전역 `performance` 가 이미 있으나, 명시적으로
 * `perf_hooks` 에서 가져와 어느 런타임에서도 같게 쓴다.)
 */
const monotonic = () => perfHooks.now();

import { SCREENS, SHELL_SELECTOR, VISIBLE_GRID, emptyOverlaySelector, firstRowSelector, listGridRoot, screenById } from "./screens.mjs";

// 사용처는 loadChromium() 이 만들 때마다 path 를 넣는다(기본 경로로 고정하지 않는다).

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
/** ★지시 3★ 측정기 보정 회차 — 200ms 바쁜 루프를 주입해 long task 관측기를 검증한다. */
const CALIBRATE = process.env.RENDER_CALIBRATE === "1";
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

/**
 * playwright 모듈에서 chromium 을 꺼낸다.
 *
 * 이 스크립트는 `scripts/perf/render/` 에 있고 워크트리 루트에서 실행하므로,
 * Node 의 기본 탐색으로는 `src/frontend/node_modules` 가 보이지 않는다(pnpm 워크스페이스).
 * 그래서 후보를 순서대로 붙여 본다: `PLAYWRIGHT_PATH`(환경 변수) → 이 스크립트 기준
 * `../../src/frontend` → `../../../src/frontend`(저장소 루트 밖 실행 대비).
 */
const PLAYWRIGHT_ROOTS = [
  process.env.PLAYWRIGHT_PATH,
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../src/frontend"),
  path.resolve(process.cwd(), "src/frontend"),
  process.cwd(),
].filter(Boolean);

async function loadChromium() {
  const tried = [];
  for (const root of PLAYWRIGHT_ROOTS) {
    for (const spec of ["@playwright/test", "playwright", "playwright-core"]) {
      const req = createRequire(path.join(root, "__resolve__.js"));
      try {
        const mod = req(spec);
        const chromium = mod.chromium ?? mod.default?.chromium;
        if (chromium?.launch) {
          if (tried.length) log(`찾은 경로: ${root} → ${spec}`);
          return chromium;
        }
      } catch {
        tried.push(`${root} → ${spec}`);
      }
    }
  }
  die(
    "playwright 를 찾지 못했다. 본 후보를 전부 시도했다:\n" +
      tried.map((t) => `  - ${t}`).join("\n") +
      "\n  → PLAYWRIGHT_PATH 로 playwright 모듈이 있는 폴더를 준다."
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
    pending.set(e.requestId, {
      url: e.request.url,
      method: e.request.method,
      start: e.timestamp,
      // wallTime 은 epoch 초다. 응답 완료 시각을 Node 의 Date.now() 축으로 옮길 때 쓴다
      // (0건 화면의 "조회 응답 → 빈 상태" 구간을 재려면 이 축이 필요하다).
      wallStart: e.wallTime,
      postData: e.request.postData ?? "",
    });
  };
  // ★status 는 `responseReceived` 에서 온다★ `loadingFinished` 에는 없다.
  //   첫 실행에서 status 가 전부 0 으로 기록돼 404·500 을 구분할 수 없었다.
  const onResponse = (e) => {
    const p = pending.get(e.requestId);
    if (p) p.status = e.response?.status ?? 0;
  };
  const finish = (e, failed) => {
    const p = pending.get(e.requestId);
    if (!p) return;
    pending.delete(e.requestId);
    const ms = (e.timestamp - p.start) * 1000;
    sink.push({
      url: p.url,
      method: p.method,
      postData: p.postData,
      status: p.status ?? 0,
      ms,
      // epoch 밀리초. wallTime 이 없는 경우(undefined)는 이 축을 쓰지 않는다.
      wallEndMs: typeof p.wallStart === "number" ? p.wallStart * 1000 + ms : null,
      failed,
    });
  };
  const onDone = (e) => finish(e, false);
  const onFail = (e) => finish(e, true);
  cdp.on("Network.requestWillBeSent", onRequest);
  cdp.on("Network.responseReceived", onResponse);
  cdp.on("Network.loadingFinished", onDone);
  cdp.on("Network.loadingFailed", onFail);
  return () => {
    cdp.off("Network.requestWillBeSent", onRequest);
    cdp.off("Network.responseReceived", onResponse);
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
  // ★지시 2-3: 로그인 실패가 한 번이라도 나면 재시도하지 않고 즉시 끝낸다.
  //   반복 시도하면 계정이 잠긴다(5회 실패 시 잠금). 여기서 멈추고 report.md 에 보고한다.
  if (!res.ok()) {
    die(
      `로그인 실패: HTTP ${res.status()} (user=${LOGIN_USER}).\n` +
        "  ★재시도하지 않는다★ — 반복하면 계정이 잠긴다.\n" +
        "  지시 2-3 에 따라 admin / admin123 만 쓴다. 이 실패를 그대로 report.md 에 보고한다.\n" +
        `  본문(앞 200자): ${(await res.text().catch(() => "")).slice(0, 200)}`
    );
  }
  return res.text().then((t) => JSON.parse(t));
}

/** 사이드바 메뉴 항목(보이는 것만). e2e/support/common.ts menuItem 과 같은 규칙. */
function menuItem(page, re) {
  return page.locator(".tree-item .item-name:visible").filter({ hasText: re }).first();
}

/**
 * 메뉴 경로를 위에서 아래로 누른다. 마지막(잎) 클릭 직후의 시각을 돌려준다 — 측정의 t0.
 *
 * ★두 시계 축을 함께 돌려준다.
 *   - `t0`      node `performance.now()` 축. 이 스크립트가 재는 모든 값의 기준.
 *   - `t0Wall`  `Date.now()` epoch ms 축. CDP `Network` 의 `wallTime` 과 맞추는 용도.
 *                (0건 화면의 "조회 응답 완료 → 빈 상태 표시" 구간은 CDP 응답 시각과 페이지 내 DOM
 *                 표시 시각을 빼야 하는데, DOM 시각은 t0 축이고 CDP 응답 시각은 epoch 축이다.
 *                 측정 시작점에서 두 축의 차이를 한 번 잡아 서로 옮긴다.)
 */
/**
 * 메뉴 경로를 위에서 아래로 연다. 마지막(잎) 항목 클릭 직후의 시각을 돌려준다 — 측정의 t0.
 *
 * ★상위 항목을 "늘상 누르면" 안 된다★ 메뉴 트리 펼침 상태는 포털이 저장한다. 그래서 두 번째 화면부터는
 *   이미 펼쳐져 있는 트리를 **한 번 더 누르면 접힌다.** 첫 실행에서 12건이 여기서 실패했다
 *   (termMng 은 통과하고 뒤의 4개가 하위 항목 대기 timeout).
 *   → 하위 항목이 이미 보이면 상위를 누르지 않는다. e2e 의 `openMenu` 이 같은 이유로 그런다
 *   (`e2e/support/common.ts:113-121`).
 *
 * ★두 시계 축을 함께 돌려준다.
 *   - `t0`      node `performance.now()` 축. 이 스크립트가 재는 모든 값의 기준.
 *   - `t0Wall`  `Date.now()` epoch ms 축. CDP `Network` 의 `wallTime` 과 맞추는 용도.
 *                (0건 화면의 "조회 응답 완료 → 빈 상태 표시" 구간은 CDP 응답 시각과 페이지 내 DOM
 *                 표시 시각을 빼야 하는데, DOM 시각은 t0 축이고 CDP 응답 시각은 epoch 축이다.
 *                 측정 시작점에서 두 축의 차이를 한 번 잡아 서로 옮긴다.)
 */
async function clickTrail(page, screen) {
  for (let i = 0; i < screen.trail.length; i++) {
    const item = menuItem(page, screen.trail[i]);
    await item.waitFor({ state: "visible", timeout: TIMEOUT });
    const isLeaf = i === screen.trail.length - 1;
    if (isLeaf) {
      const t0 = monotonic();
      const t0Wall = Date.now();
      await item.click();
      return { t0, t0Wall };
    }
    // 하위가 이미 펼쳐져 있으면 이 노드는 건드리지 않는다(누르면 접힌다).
    const child = menuItem(page, screen.trail[i + 1]);
    if (await child.isVisible().catch(() => false)) continue;
    await item.click();
    await child.waitFor({ state: "visible", timeout: TIMEOUT });
  }
  const t0 = monotonic();
  return { t0, t0Wall: Date.now() };
}

/**
 * 메뉴 트리가 준비됐는지 기다린다.
 *
 * ★이게 없으면 측정이 조용히 망가진다★ 포털은 메뉴를 클라이언트에서 `secUser/myMenusTree`
 * 응답으로 채운다. 트리가 오기 전의 `.item-name` 을 누르면 **클릭이 아무 일도 하지 않는다**
 * (hydrate 전이라 이벤트 리스너가 없다). 그러면 하위 항목이 영영 안 나타나 `clickTrail` 이 timeout 난다.
 *
 * 루트 항목(`공통관리`·`마루 MDM` 등)만 몇 개 보이는 상태가 "트리 로드 완료" 신호다.
 * 루트만 있고 하위가 0인 상태는 아직 로딩 중이다. 트리 항목이 3개 이상 뜰 때까지 기다린다.
 */
async function waitMenuReady(page, menuReady) {
  const t = Math.min(TIMEOUT, 30_000);
  // 포털은 메뉴를 클라이언트에서 `secUser/myMenusTree` 응답으로 채운다. 응답 전에는 루트 항목만
  // SSR 초기값으로 보인다(관측: 정확히 3개 — 공통관리·로그 분석·마루 MDM).
  // 그러므로 "항목 3개 이상" 은 준비 신호가 아니다(첫 로드에서 이미 만족한다).
  // ★응답 대기를 goto 전에 걸어 두고 여기서 회수한다★ (goto 뒤에 걸면 이미 끝난 응답을 놓친다)
  await menuReady.catch(() => {});
  // 트리 항목이 그려졌는지.
  await page.waitForFunction(() => document.querySelectorAll(".tree-item .item-name").length >= 3, undefined, {
    timeout: t,
  });
}

/** `myMenusTree` 응답을 **goto 전에** 걸어 두는 대기열 하나. 여러 번 호출해도 하나만 만든다. */
function pendingMenuResponse(page) {
  const KEY = Symbol.for("render-perf:menu-response");
  if (page[KEY]) return page[KEY];
  page[KEY] = page.waitForResponse((r) => r.url().includes("myMenusTree") && r.status() === 200, { timeout: 60_000 });
  return page[KEY];
}

/**
 * 화면 틀(breadcrumb)이 섰는지.
 *
 * ★숨겨진 탭의 breadcrumb 도 조회된다★ portal-shell.tsx:154 가 숨겨진 탭을 마운트된 채 두므로
 * 문서 전체에서 breadcrumb 을 찾으면 예전 탭 것이 먼저 나올 수 있다. `VISIBLE_GRID` 접두로
 * 현재 보이는 탭 안에 있는지만 본다.
 */
async function waitShell(page, screen) {
  await page
    .locator(`${VISIBLE_GRID}${SHELL_SELECTOR}`)
    .filter({ hasText: screen.breadcrumb })
    .first()
    .waitFor({ state: "visible", timeout: TIMEOUT });
  return monotonic();
}

async function firstRowVisible(page, screen) {
  const row = page.locator(firstRowSelector(screen)).first();
  return (await row.count()) > 0 && (await row.isVisible().catch(() => false));
}

async function waitFirstRow(page, screen) {
  await page.locator(firstRowSelector(screen)).first().waitFor({ state: "visible", timeout: TIMEOUT });
  return monotonic();
}

/**
 * 목록 그리드가 화면에 존재하는지 **확인만** 한다 — 없으면 경고하고 계속한다(예외로 끝내지 않는다).
 *
 * ★왜 부드럽게 넘어가는가★ `layoutConfirm` 은 조회 결과가 0건이면 그리드를 아예 만들지 않는다
 * (`page.tsx:313-330` — 0건이면 `<p/>` 로 갈음). 즉 "그리드 없음"이 정상 상태일 수 있다.
 * 이걸 예외로 바꾸면 0건 화면을 정상적으로 "0건"으로 측정할 수 없다.
 * 그래서 신호가 필요하면 `row_mode`(row/empty/timeout) 으로 판단한다.
 */
async function listGridPresent(page, screen) {
  const n = await page.locator(listGridRoot(screen)).count();
  if (n === 0) {
    log(`  ${screen.id}: shell 시점에 목록 그리드가 없다 — 0건 화면일 수 있다(listPanelTitle 확인 필요).`);
  }
  return n;
}

/**
 * 목록 그리드의 "행 없음" 오버레이 — 0건 화면의 도착 신호.
 * `AgDataGrid.tsx:1792-1801` 이 `noRowsOverlayComponent` 로 `.ag-overlay-no-rows-wrapper` 를 그린다.
 * ★목록 그리드로 한정해야 한다★ 같은 화면 안의 다른 그리드(용어 관리의 '유사어 추천' 등)는
 *   항상 비어 있어, 그 오버레이를 잡으면 "조회 결과 0건" 으로 잘못 읽힌다(2026-10-04 실제 발생).
 */
async function emptyOverlayVisible(page, screen) {
  const el = page.locator(emptyOverlaySelector(screen)).first();
  return (await el.count()) > 0 && (await el.isVisible().catch(() => false));
}

async function waitEmptyOverlay(page, screen) {
  await page.locator(emptyOverlaySelector(screen)).first().waitFor({ state: "visible", timeout: TIMEOUT });
  return monotonic();
}

/** 0건 화면의 주 지표 — "조회 응답 → 빈 상태 표시". */
function searchResponseToEmptyMs(calls, screen, tEmpty, t0, t0Wall) {
  const resp = [...calls].filter((c) => isSearchCall(screen, c)).pop();
  // wallEndMs 가 없으면(CDP wallTime 미제공) 이 구간은 못 잰다 — 값을 빈칸으로 두고 사유를 남긴다.
  if (!resp || resp.wallEndMs == null) return null;
  const respMono = t0 + (resp.wallEndMs - t0Wall);
  return round1(tEmpty - respMono);
}

/**
 * ★측정기 보정 회차★ (지시 3)
 *
 * 페이지 안에서 **일부러 200ms 짜리 바쁜 루프**를 한 번 돌린다. 제품 코드는 건드리지 않고
 * `page.evaluate` 로 주입한다. 바쁜 루프는 메인 스레드를 연속으로 점유하므로
 * `PerformanceObserver('longtask')` 가 반드시 잡아야 한다(기준 50ms).
 *
 * 판정:
 *   - long task 1건(약 200ms) 이 잡히면 → ** 측정기는 정상.** 1차 스캔의 long task 0 은
 *     (나) "화면 렌더가 실제로 가볍다" 로 판정한다.
 *   - 잡히지 않으면 → ** 측정기 결함.** 등록 시점·buffered 옵션·trace 카테고리를 고친다.
 *
 * @returns {Promise<number|null>} 실제로 걸린 시간(ms). evaluate 가 막히면 null.
 */
async function runCalibration(page) {
  const t = monotonic();
  try {
    // ★`setTimeout(0)` 안에서 돌린다★ `page.evaluate` 의 최상위 코드에서 돌리면
    // **long task 로 기록되지 않는다**(2026-10-04 실측: 같은 200ms 루프가 evaluate 직렬 실행에서는 0건,
    // setTimeout/rAF 안에서는 정확히 200ms 1건으로 잡혔다).
    // evaluate 의 실행 컨텍스트는 브라우저가 "task" 로 계상하는 프레임(task) 안에 들어가지 않는 것으로
    // 보인다. 검증을 위해 넣는 루프인데 관측되지 않으면 판정 자체가 불가능해진다.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            const end = performance.now() + 200;
            let x = 0;
            while (performance.now() < end) x += Math.sqrt(x + 1);
            resolve(x);
          }, 0);
        })
    );
  } catch {
    return null;
  }
  return round1(monotonic() - t);
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

  const { t0, t0Wall } = await clickTrail(page, screen);
  const tShell = await waitShell(page, screen);
  // 목록 그리드가 실제로 있는가 — 셀렉터가 틀리면 아래 모든 지표가 무의미해진다.
  await listGridPresent(page, screen);

  let tRow = null;
  let tEmpty = null;
  let searchToRowMs = null;
  let searchToEmptyMs = null;
  let searched = false;
  let rowMode = "";
  let searchCallCount = null;
  let searchCallMs = null;
  let invalidSearch = 0;

  // MDM 목록 화면은 진입 시 자동 조회를 하지 않는다. 첫 행이 이미 있으면 조회 없이 끝난 것으로 본다.
  if (await firstRowVisible(page, screen)) {
    tRow = monotonic();
    rowMode = "row-at-entry";
  } else if (screen.needsSearch) {
    // 조회 단추도 **보이는 탭 안에서만** 찾는다(숨겨진 탭에 같은 이름의 단추가 있을 수 있다).
    const btn = page.locator(`${VISIBLE_GRID}button`).filter({ hasText: /^조회$/ }).first();
    await btn.waitFor({ state: "visible", timeout: TIMEOUT });
    const tSearch = monotonic();
    await btn.click();
    searched = true;
    // ★지시 2-1: 1건 이상이면 "조회 → 첫 행"(주 지표). 0건이면 "조회 응답 → 빈 상태 표시" 로 잰다.
    //   둘이 동시에 뜨는 걸 기다렸다가 어느 쪽인지 본다 — 렌더 순서가 흔들리는 화면이 있으면
    //   rows 지표가 그때 비어 있게 두고 사유를 적는다.
    const outcome = await Promise.race([
      waitFirstRow(page, screen).then(() => "row"),
      waitEmptyOverlay(page, screen).then(() => "empty"),
    ]).catch(() => null);

    if (outcome === "row") {
      tRow = monotonic();
      searchToRowMs = round1(tRow - tSearch);
      rowMode = "row";
    } else if (outcome === "empty") {
      tEmpty = monotonic();
      searchToEmptyMs = round1(tEmpty - tSearch);
      rowMode = "empty";
    } else {
      rowMode = "timeout";
      log(`  ${screen.id}: 조회 후 첫 행도 빈 상태도 보이지 않았다 — timeout 으로 기록한다.`);
    }

    // ★지시 3: 조회를 눌렀다는 건 **클릭 성공이 아니라 POST 가 나갔는지** 로 확인한다.
    //   단추를 눌렀어도 네트워크 요청이 안 나간 경우가 있다(비활성 상태, 가드 로직, 다른 탭의 단추).
    //   그러면 searchToRowMs 는 "조회 대기가 아니라 다른 무엇의 대기" 다 — 무효로 표시한다.
    const searchCalls = calls.filter((c) => isSearchCall(screen, c));
    searchCallCount = searchCalls.length;
    searchCallMs = round1(searchCalls.reduce((acc, c) => acc + c.ms, 0));
    if (searchCallCount === 0) {
      log(`  ${screen.id}: ★조회 POST 가 나가지 않았다 — 회차를 무효로 표시한다.`);
      invalidSearch = 1;
    }
  }

  // ★지시 3: 측정기 보정 회차★ 조회 직후 페이지 안에서 200ms 짜리 바쁜 루프를 한 번 돌린다.
  //   제품 코드 수정 없이 page.evaluate 로 주입한다. 50ms 이상이면 long task 로 잡혀야 하는데
  //   잡히지 않으면 측정기(longtask PerformanceObserver) 결함이다.
  //   1차 스캔에서 long task 가 0건으로 나온 것을 (가)측정기 결함 / (나)실제로 렌더가 가벼움 으로
  //   나누는 판정 수단이다.
  let calibrateMs = null;
  if (CALIBRATE) {
    calibrateMs = await runCalibration(page);
    log(`  ${screen.id}: 보정 ${calibrateMs}ms 바쁜 루프 주입 완료`);
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
    /** 보조 지표 — 화면 골격 비용(데이터와 무관). 지시 2-1 에서 "함께 낸다". */
    shellReadyMs: round1(tShell - t0),
    /** 참고값 — 지시 2-1 에서 "참고값으로만 둔다". 원 지표였으나 조회 대기 시간을 섞는다. */
    clickToRowMs: tRow === null ? "" : round1(tRow - t0),
    /** ★주 지표(1건 이상인 화면)★ 조회 클릭 → 그리드 첫 행. */
    primaryMetric: rowMode === "empty" ? "searchResponseToEmptyMs" : "searchToRowMs",
    searchToRowMs: searchToRowMs ?? "",
    /** ★주 지표(0건인 화면)★ 조회 응답 → 그리드 빈 상태 표시. */
    searchResponseToEmptyMs: searchToRowMs === null ? searchResponseToEmptyMs(calls, screen, tEmpty ?? monotonic(), t0, t0Wall) : "",
    /** 참고 — 조회 클릭 → 빈 상태 표시(응답 대기 포함). */
    searchToEmptyMs: searchToEmptyMs ?? "",
    row_mode: rowMode,
    searched: searched ? 1 : 0,
    /** ★지시 3★ 조회 POST 가 실제로 나갔는지. 1 이면 정상, 1 이 아니면 이 회차의 검색 지표는 무효. */
    searchCallCount,
    searchCallMs,
    invalidSearch,
    /** ★지시 3★ 보정 회차에서 주입한 바쁜 루프 실측 시간(ms). null 이면 주입 실패. */
    calibrateMs,
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
    `calibrate: ${CALIBRATE ? "1" : "0"}`,
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
            // 메뉴 트리 응답 대기를 **goto 전에** 건다. goto 뒤에 걸면 이미 끝난 응답을 놓친다.
            const menuReady = pendingMenuResponse(page);
            await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
            await waitMenuReady(page, menuReady);
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
        const menuReady = pendingMenuResponse(page);
        await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
        await waitMenuReady(page, menuReady);

        for (const screen of targets) {
          await clickTrail(page, screen);
          await waitShell(page, screen);
          if (screen.needsSearch && !(await firstRowVisible(page, screen))) {
            const b = page.locator(`${VISIBLE_GRID}button`).filter({ hasText: /^조회$/ }).first();
            await b.waitFor({ state: "visible", timeout: TIMEOUT });
            await b.click();
            await waitFirstRow(page, screen).catch(() => {});
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
