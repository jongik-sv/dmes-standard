#!/usr/bin/env node
/**
 * 홈 대시보드 위젯 동작별 React 렌더 횟수·네트워크 요청 세기 — widget-render-findings 측정용.
 *
 * 왜 따로 있는가
 *   count-renders.mjs 는 MDM 목록 화면(메뉴 trail 진입 → 조회 → 행 클릭 → 탭 복귀)용이다. 홈은 포털 부팅 직후
 *   뜨는 화면이라 진입 동작 자체가 다르고(메뉴 클릭 없음), 잴 동작도 위젯 중심이라 시나리오를 새로 둔다.
 *   렌더 집계 방식(가짜 DevTools 훅, profiling 번들)은 count-renders.mjs 와 완전히 같은 규칙을 복사해 쓴다.
 *
 * 동작(회차마다 새 컨텍스트·새 로그인):
 *   1-home-entry      /portal 부팅 → 홈 위젯 보드가 조용해질 때까지(커밋·/api/ 둘 다 조용)
 *   2-widget-interact 공지 위젯 목록 항목 클릭(선택만, 읽기 동작). 없으면 알림 필터 클릭
 *   3-open-menu-tab   다른 메뉴(용어 관리) 열기 — 숨은 홈 탭이 남아 있는 상태
 *   4-home-tab-back   탭 줄 「홈화면」 으로 복귀
 *   5-resize          뷰포트 1600 → 1200 폭 축소(숨은 탭 없이 홈이 보인 상태)
 *   6-idle-60s        가만히 60초(폴링·타이머 관찰)
 *
 * 네트워크: 동작 구간마다 /api/ 요청(method·path·시작 시각)을 남긴다 — 중복 호출(같은 method+path 여러 번) 판정용.
 *
 * 환경 변수: RENDER_BASE_URL(기본 http://localhost:5300) · RENDER_LOGIN_USER/PASSWORD(admin/admin123) ·
 *   RENDER_ROUNDS(기본 3) · PERF_OUT(기본 $TMPDIR/dmes-perf/render-home) · PLAYWRIGHT_PATH
 * 결과: $PERF_OUT/home-renders.json(회차별 커밋·요청 원자료) + 표준 출력 요약(회차 중앙값).
 * 저장·삭제·위젯 편집·로그아웃은 하지 않는다(공용 로컬 DB).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SCREENS, VISIBLE_GRID, SHELL_SELECTOR } from "./screens.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.RENDER_BASE_URL ?? "http://localhost:5300").replace(/\/+$/, "");
const USER = process.env.RENDER_LOGIN_USER ?? "admin";
const PASSWORD = process.env.RENDER_LOGIN_PASSWORD ?? "admin123";
const OUT = process.env.PERF_OUT ?? path.join(process.env.TMPDIR ?? "/tmp", "dmes-perf", "render-home");
const TIMEOUT = 60_000;
const ROUNDS = Number(process.env.RENDER_ROUNDS ?? 3);
/** ⑤ 창 폭 축소 대상(px). */
const RESIZE_WIDTH = Number(process.env.RENDER_RESIZE_WIDTH ?? 1200);

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

/** 페이지 로드 전에 심는 가짜 DevTools 훅 — count-renders.mjs 와 같은 규칙. 첫 구간을 홈 진입으로 둔다.
 *  count-renders.mjs 와의 차이: 탐색에 커밋당 방문 집합(seen)과 깊이 상한(1000)을 뒀다. 홈 부팅 중 일시적
 *  fiber 트리 상태에서 방어 없는 탐색이 폭주(렌더러 99% CPU 의 JIT 자기재귀, chrome-headless-shell SIGTRAP
 *  크래시)하는 것을 관측했고, 방어를 넣은 판은 102커밋·깊이 152 로 유한하게 끝나는 것을 확인했다. 정상
 *  트리(순환·공유 없음)에서는 집계 의미가 그대로다. */
const HOOK_SCRIPT = `
(() => {
  const COMP = new Set([0, 1, 11, 15]);
  const rc = (window.__RC__ = { seg: "1-home-entry", commits: [] });
  const nameOf = (f) => {
    const t = f.type;
    if (!t) return "?";
    if (typeof t === "string") return t;
    return t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)) || "Anonymous";
  };
  const ownerPath = (f) => {
    const out = [];
    for (let p = f.return; p && out.length < 3; p = p.return) if (COMP.has(p.tag)) out.push(nameOf(p));
    return out.join("<");
  };
  const seen = new Set();
  function walk(next, prev, acc, depth) {
    if (seen.has(next) || depth > 1000) return;
    seen.add(next);
    if (COMP.has(next.tag) && (next.flags & 1) === 1) acc.push([nameOf(next), "update", next.selfBaseDuration ?? null, ownerPath(next)]);
    if (next.child === prev.child) return;
    for (let c = next.child; c; c = c.sibling) {
      if (c.alternate) walk(c, c.alternate, acc, depth + 1);
      else mount(c, acc, depth + 1);
    }
  }
  function mount(f, acc, depth) {
    if (seen.has(f) || depth > 1000) return;
    seen.add(f);
    if (COMP.has(f.tag)) acc.push([nameOf(f), "mount", f.selfBaseDuration ?? null, ownerPath(f)]);
    for (let c = f.child; c; c = c.sibling) mount(c, acc, depth + 1);
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    checkDCE() {},
    inject(r) { const id = (this._id = (this._id || 0) + 1); this.renderers.set(id, r); return id; },
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      try {
        seen.clear();
        const cur = root.current;
        const acc = [];
        if (cur.alternate) walk(cur, cur.alternate, acc, 0); else mount(cur, acc, 0);
        rc.commits.push({ seg: rc.seg, t: performance.now(), dur: cur.actualDuration ?? null, comps: acc });
      } catch (e) { rc.commits.push({ seg: rc.seg, t: performance.now(), error: String(e) }); }
    },
  };
})();
`;

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

/** 마지막 커밋 뒤 quietMs 동안 새 커밋이 없을 때까지(최대 maxMs). count-renders.mjs 와 같다. */
async function settle(page, quietMs = 800, maxMs = 10_000) {
  const start = Date.now();
  let last = -1;
  let stableSince = Date.now();
  while (Date.now() - start < maxMs) {
    const n = await page.evaluate(() => window.__RC__.commits.length);
    if (n !== last) { last = n; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= quietMs) return;
    await page.waitForTimeout(100);
  }
}

/** /api/ 요청이 quietMs 동안 늘지 않을 때까지(최대 maxMs) — RENDER_HOME_IDLE 과 같은 생각. */
async function apiQuiet(page, quietMs = 500, maxMs = 15_000) {
  const start = Date.now();
  let last = -1;
  let stableSince = Date.now();
  while (Date.now() - start < maxMs) {
    const n = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/")).length);
    if (n !== last) { last = n; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= quietMs) return;
    await page.waitForTimeout(100);
  }
}

const seg = (page, name) => page.evaluate((n) => { window.__RC__.seg = n; }, name);

async function login(context) {
  const csrf = await (await context.request.get(`${BASE_URL}/api/auth/csrf`)).json();
  const res = await context.request.post(`${BASE_URL}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrf.csrfToken}&userId=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASSWORD)}&callbackUrl=${encodeURIComponent(BASE_URL + "/portal")}&json=true`,
  });
  // 실패하면 재시도하지 않는다(5회 실패 시 계정 잠금).
  if (!res.ok()) { console.error(`로그인 실패 HTTP ${res.status()} — 재시도하지 않는다`); process.exit(1); }
}

function summarize(commits) {
  const bySeg = {};
  for (const c of commits) {
    const s = (bySeg[c.seg] ??= { commits: 0, durSum: 0, comps: {} });
    s.commits++;
    s.durSum += c.dur ?? 0;
    for (const [name, kind, self, owner] of c.comps ?? []) {
      const k = `${name}`;
      const e = (s.comps[k] ??= { renders: 0, mounts: 0, selfMs: 0, owners: new Set() });
      if (kind === "mount") e.mounts++; else e.renders++;
      e.selfMs += self ?? 0;
      if (owner) e.owners.add(owner);
    }
  }
  for (const s of Object.values(bySeg)) {
    s.durSum = Math.round(s.durSum * 10) / 10;
    s.top = Object.entries(s.comps)
      .map(([name, e]) => ({ name, renders: e.renders, mounts: e.mounts, selfMs: Math.round(e.selfMs * 10) / 10, owners: [...e.owners].slice(0, 3) }))
      .sort((a, b) => b.renders + b.mounts - (a.renders + a.mounts) || b.selfMs - a.selfMs)
      .slice(0, 40);
    delete s.comps;
  }
  return bySeg;
}

/** 구간별 요청을 method+path 로 묶어 { 호출 수, 정렬된 목록 } 을 낸다. */
function requestSummary(requests) {
  const bySeg = {};
  for (const r of requests) {
    const s = (bySeg[r.seg] ??= {});
    const key = `${r.method} ${r.path}`;
    (s[key] ??= []).push(r.status);
  }
  return bySeg;
}

const away = SCREENS.find((s) => s.id === "termMng") ?? SCREENS[0];
const HOME_TAB = ".tabs-bar .home-tab";
const WIDGET_BOARD = '[data-testid="home-widgets"]';

const chromium = loadChromium();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const rounds = [];
try {
  for (let round = 1; round <= ROUNDS; round++) {
    const load1 = os.loadavg()[0];
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await login(context);
    await context.addInitScript(HOOK_SCRIPT);
    const page = await context.newPage();

    // 네트워크 기록 — 현재 구간 이름은 Node 쪽 미러로 붙인다.
    let curSeg = "1-home-entry";
    const requests = [];
    page.on("request", (r) => {
      const url = r.url();
      if (!url.includes("/api/")) return;
      requests.push({ seg: curSeg, method: r.method(), path: new URL(url).pathname + new URL(url).search, ts: Date.now() });
    });
    page.on("response", (res) => {
      const url = res.url();
      if (!url.includes("/api/")) return;
      const hit = [...requests].reverse().find((r) => r.path === new URL(url).pathname + new URL(url).search && !r.status);
      if (hit) hit.status = res.status();
    });

    // ① 홈 진입 — 포털 부팅부터 홈 위젯 보드가 조용해질 때까지.
    await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await page.waitForFunction(() => document.querySelectorAll(".tree-item .item-name").length >= 3, undefined, { timeout: TIMEOUT }).catch(() => {});
    await page.locator(`${WIDGET_BOARD} .cm-widget`).first().waitFor({ state: "visible", timeout: TIMEOUT });
    await apiQuiet(page);
    await settle(page);

    // ② 위젯 상호작용(읽기) — 공지 목록 둘째 항목 클릭(선택만). 없으면 알림 필터로 대체.
    const noticeRows = page.locator('[data-testid="home-notice-list"] li');
    const filterBtn = page.locator('[data-testid="home-notification-filter"] button');
    curSeg = "2-widget-interact";
    await seg(page, "2-widget-interact");
    let interactNote = "";
    if ((await noticeRows.count()) >= 2) {
      await noticeRows.nth(1).click();
      interactNote = "notice-row-select";
    } else if (await filterBtn.count()) {
      await filterBtn.nth(1).click();
      interactNote = "notification-filter";
    } else {
      interactNote = "skipped(공지·알림 위젯 없음)";
    }
    await settle(page);
    await apiQuiet(page, 300, 5_000);

    // ③ 다른 메뉴 탭 열기(숨은 홈 탭 유지).
    curSeg = "3-open-menu-tab";
    await seg(page, "3-open-menu-tab");
    await clickTrail(page, away);
    await page.locator(`${VISIBLE_GRID}${SHELL_SELECTOR}`).filter({ hasText: away.breadcrumb }).first().waitFor({ state: "visible", timeout: TIMEOUT });
    await settle(page);
    await apiQuiet(page, 300, 5_000);

    // ④ 홈 탭 복귀.
    curSeg = "4-home-tab-back";
    await seg(page, "4-home-tab-back");
    await page.locator(HOME_TAB).click();
    await page.locator(`${WIDGET_BOARD} .cm-widget`).first().waitFor({ state: "visible", timeout: TIMEOUT });
    await settle(page);
    await apiQuiet(page, 300, 5_000);

    // ⑤ 창 크기 변경(1600 → 1200).
    curSeg = "5-resize";
    await seg(page, "5-resize");
    await page.setViewportSize({ width: RESIZE_WIDTH, height: 900 });
    await settle(page);

    // ⑥ 가만히 60초 — 폴링·타이머가 도는지.
    curSeg = "6-idle-60s";
    await seg(page, "6-idle-60s");
    await page.waitForTimeout(60_000);
    await settle(page, 800, 2_000);

    const commits = await page.evaluate(() => window.__RC__.commits);
    rounds.push({
      round,
      load1,
      interactNote,
      apiCounts: (() => {
        const counts = {};
        for (const r of requests) {
          const key = `${r.seg} ${r.method} ${r.path}`;
          counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
      })(),
      summary: summarize(commits),
      requests,
      commits,
    });
    const s = rounds[rounds.length - 1].summary;
    console.log(`\n## round ${round} (load1=${load1.toFixed(2)}, interact=${interactNote})`);
    for (const [k, v] of Object.entries(s)) {
      const top = v.top.slice(0, 6).map((c) => `${c.name} r${c.renders}/m${c.mounts}`).join(", ");
      console.log(`${k}: commits=${v.commits} dur=${v.durSum}ms | ${top}`);
    }
    const keyApis = requests.filter((r) => /secWidget|secFavorite|widgetDef|noticeBoard|auth\/me/.test(r.path));
    for (const g of ["1-home-entry", "4-home-tab-back"]) {
      const inSeg = keyApis.filter((r) => r.seg === g);
      if (inSeg.length) console.log(`${g} 핵심 요청: ${inSeg.map((r) => `${r.method} ${r.path.split("/api/")[1]}`).join(" | ")}`);
    }
    await context.close();
  }
} finally {
  fs.writeFileSync(path.join(OUT, "home-renders.json"), JSON.stringify({ baseUrl: BASE_URL, rounds }, null, 1));
  await browser.close();
}

// 회차 중앙값 요약.
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const segNames = ["1-home-entry", "2-widget-interact", "3-open-menu-tab", "4-home-tab-back", "5-resize", "6-idle-60s"];
console.log(`\n# 중앙값 (${rounds.length}회) — ${BASE_URL}`);
for (const name of segNames) {
  const commits = rounds.map((r) => r.summary[name]?.commits ?? 0);
  const dur = rounds.map((r) => r.summary[name]?.durSum ?? 0);
  console.log(`${name}: commits 중앙값 ${median(commits)} (${commits.join("/")}) dur 중앙값 ${median(dur)}ms (${dur.map((d) => `${d}ms`).join("/")})`);
}
const apiMedian = {};
for (const r of rounds) {
  for (const [key, n] of Object.entries(r.apiCounts)) {
    (apiMedian[key] ??= []).push(n);
  }
}
const apiKeys = [...new Set(rounds.flatMap((r) => Object.keys(r.apiCounts)))].filter((k) =>
  /secWidget|secFavorite|widgetDef|noticeBoard|auth\/me/.test(k),
);
for (const key of apiKeys) {
  console.log(`${key}: 중앙값 ${median(apiMedian[key])} (${apiMedian[key].join("/")})`);
}
