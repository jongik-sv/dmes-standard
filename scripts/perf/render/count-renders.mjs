#!/usr/bin/env node
/**
 * 화면 동작별 React 렌더 횟수 세기 — 중복 렌더링 찾기용.
 *
 * 왜 따로 있는가
 *   measure-screens.mjs 는 시간을 잰다. 이 스크립트는 **시간을 재지 않고** 동작마다 React 커밋 수와
 *   커밋별로 다시 그려진 컴포넌트를 센다. 계측 비용이 크므로 두 스크립트를 한 실행에 섞지 않는다.
 *
 * 방법
 *   페이지 로드 전에 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 을 흉내 낸 객체를 심는다. react-dom 은 프로덕션
 *   번들에서도 이 훅에 커밋마다 `onCommitFiberRoot` 를 부른다. 훅은 React DevTools 와 같은 규칙으로
 *   "이번 커밋에서 실제로 함수가 실행된 컴포넌트"를 고른다.
 *     - 이전 커밋과 child 포인터가 같으면 하위 트리는 건너뛴(bailout) 것이다.
 *     - 아니면 자식마다 PerformedWork 플래그(1)가 서 있으면 렌더된 것이다. alternate 가 없으면 새로 마운트.
 *   제품 코드는 고치지 않는다. 대상 서버는 `next build --profile` 로 만든 번들이어야 actualDuration·
 *   selfBaseDuration 이 채워진다(일반 프로덕션 번들이면 횟수만 나온다). dev 서버는 StrictMode 이중 렌더가
 *   섞이므로 쓰지 않는다.
 *
 * 동작(화면마다 새 컨텍스트): ① 메뉴 클릭 진입 ② [조회] 클릭 ③ 목록 첫 행 클릭(선택만, 저장 없음)
 *   ④ 다른 화면으로 갔다가 이 화면 탭으로 돌아오기(warm 탭 전환). 동작 사이는 화면이 조용해질 때까지 기다린다.
 *
 * 환경 변수: RENDER_BASE_URL(기본 http://localhost:5300) · RENDER_LOGIN_USER/PASSWORD(admin/admin123) ·
 *   RENDER_SCREENS(콤마 id) · PERF_OUT(결과 폴더, 기본 $TMPDIR/dmes-perf/render-count) · PLAYWRIGHT_PATH
 * 결과: $PERF_OUT/renders.json (동작별 커밋·컴포넌트 목록) + 표준 출력 요약.
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
const OUT = process.env.PERF_OUT ?? path.join(process.env.TMPDIR ?? "/tmp", "dmes-perf", "render-count");
const TIMEOUT = 60_000;
const ids = (process.env.RENDER_SCREENS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const targets = ids.length ? SCREENS.filter((s) => ids.includes(s.id)) : SCREENS;

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

/** 페이지 로드 전에 심는 가짜 DevTools 훅. window.__RC__ 에 동작(seg)별 커밋을 쌓는다. */
const HOOK_SCRIPT = `
(() => {
  const COMP = new Set([0, 1, 11, 15]); // Function·Class·ForwardRef·SimpleMemo
  const rc = (window.__RC__ = { seg: "boot", commits: [] });
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
  function walk(next, prev, acc) {
    if (COMP.has(next.tag) && (next.flags & 1) === 1) acc.push([nameOf(next), "update", next.selfBaseDuration ?? null, ownerPath(next)]);
    if (next.child === prev.child) return; // 하위 트리 bailout
    for (let c = next.child; c; c = c.sibling) {
      if (c.alternate) walk(c, c.alternate, acc);
      else mount(c, acc);
    }
  }
  function mount(f, acc) {
    if (COMP.has(f.tag)) acc.push([nameOf(f), "mount", f.selfBaseDuration ?? null, ownerPath(f)]);
    for (let c = f.child; c; c = c.sibling) mount(c, acc);
  }
  let nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    checkDCE() {},
    inject(r) { const id = nextId++; this.renderers.set(id, r); return id; },
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      try {
        const cur = root.current;
        const acc = [];
        if (cur.alternate) walk(cur, cur.alternate, acc); else mount(cur, acc);
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

/** 마지막 커밋 뒤 quietMs 동안 새 커밋이 없을 때까지(최대 maxMs) 기다린다. */
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
      .sort((a, b) => b.renders - a.renders || b.selfMs - a.selfMs)
      .slice(0, 40);
    delete s.comps;
  }
  return bySeg;
}

const chromium = loadChromium();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = {};
try {
  for (const screen of targets) {
    const context = await browser.newContext();
    await login(context);
    await context.addInitScript(HOOK_SCRIPT);
    const page = await context.newPage();
    const menuResp = page.waitForResponse((r) => r.url().includes("myMenusTree") && r.status() === 200, { timeout: TIMEOUT });
    await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await menuResp.catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll(".tree-item .item-name").length >= 3, undefined, { timeout: TIMEOUT });
    await settle(page);

    await seg(page, "1-enter");
    await clickTrail(page, screen);
    await page.locator(`${VISIBLE_GRID}${SHELL_SELECTOR}`).filter({ hasText: screen.breadcrumb }).first().waitFor({ state: "visible", timeout: TIMEOUT });
    await settle(page);

    const row = page.locator(firstRowSelector(screen)).first();
    if (screen.needsSearch) {
      await seg(page, "2-search");
      const btn = page.locator(`${VISIBLE_GRID}button`).filter({ hasText: /^조회$/ }).first();
      await btn.click();
      await row.waitFor({ state: "visible", timeout: TIMEOUT }).catch(() => {});
      await settle(page);
    }

    if (await row.isVisible().catch(() => false)) {
      await seg(page, "3-row-select");
      // 첫 셀(체크박스·편집 열을 피해 두 번째 셀)을 한 번 누른다. 저장·확정 단추는 누르지 않는다.
      const cell = row.locator(".ag-cell").nth(1);
      await (await cell.count() ? cell : row).click();
      await settle(page);
    }

    // ④ warm 탭 전환: 다른 화면을 연 뒤 이 화면 탭으로 메뉴를 눌러 돌아온다.
    const away = SCREENS.find((s) => s.id !== screen.id && s.id !== "layoutConfirm") ?? SCREENS[0];
    await seg(page, "x-away");
    await clickTrail(page, away);
    await page.locator(`${VISIBLE_GRID}${SHELL_SELECTOR}`).filter({ hasText: away.breadcrumb }).first().waitFor({ state: "visible", timeout: TIMEOUT });
    await settle(page);
    await seg(page, "4-tab-back");
    await clickTrail(page, screen);
    await page.locator(`${VISIBLE_GRID}${SHELL_SELECTOR}`).filter({ hasText: screen.breadcrumb }).first().waitFor({ state: "visible", timeout: TIMEOUT });
    await settle(page);

    const commits = await page.evaluate(() => window.__RC__.commits);
    results[screen.id] = { summary: summarize(commits), commits };
    const s = results[screen.id].summary;
    console.log(`\n## ${screen.id}`);
    for (const [k, v] of Object.entries(s)) {
      if (k === "boot" || k === "x-away") continue;
      const dup = v.top.filter((c) => c.renders >= 2).slice(0, 8).map((c) => `${c.name}×${c.renders}(${c.selfMs}ms)`).join(", ");
      console.log(`${k}: commits=${v.commits} dur=${v.durSum}ms | 2회 이상: ${dup}`);
    }
    await context.close();
  }
} finally {
  fs.writeFileSync(path.join(OUT, "renders.json"), JSON.stringify(results, null, 1));
  await browser.close();
}
