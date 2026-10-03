import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { PASSWORD, T, login } from "../support/common";
import { gridRows } from "../support/grid";

/** 대기 시간 상수·ag-grid 본문 행 찾기는 e2e/support 공용을 그대로 쓴다(스펙은 이 파일 한 곳에서 import 한다). */
export { T };
export { gridCells, gridRowById, gridRowByIndex, gridRows } from "../support/grid";

/**
 * 마루 MDM 사용자 여정 E2E 공용 부품.
 *
 * 원칙 — "사용자 입장":
 *   - 화면 이동은 사이드바 트리 클릭으로만 한다(화면 URL 로 page.goto 하지 않는다).
 *   - 데이터 생성·수정·삭제는 화면 조작으로만 한다(page.request · SQL 픽스처 금지).
 *   - 합격 판정은 사용자에게 보이는 것(그리드 행, 토스트, 모달, 배지)으로만 한다.
 *   - 네트워크는 5xx·페이지 오류 감지용으로 관찰만 한다.
 *
 * 시험 사용자는 00-setup.user.ts 가 admin 으로 포털 "사용자 관리" 화면에서 만든다.
 */

export const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5100";
export const OUT_DIR = path.resolve(__dirname, ".out");
export const AUTH_DIR = path.join(OUT_DIR, "auth");
export const SCREEN_DIR = path.join(OUT_DIR, "screens");
/** 여정 브라우저 창 크기(설정 use.viewport 와 같다) — 손으로 여는 컨텍스트에도 같은 크기를 준다. */
export const VIEWPORT = { width: 1600, height: 1000 };

export const ADMIN = { id: process.env.SMOKE_LOGIN_USER ?? "admin", pwd: PASSWORD };
/** commUserMng 가 새 계정에 주는 초기 비밀번호(CommUserMngService.DEFAULT_PASSWORD). */
export const INIT_PWD = "dmesInit!1";

export type Role = "admin" | "std" | "stw" | "stw2";

/** 시험 사용자 — 표준관리자(dma·dmb 편집), 담당자 2명(dmc·dmd·dme 편집·확정, 편집 넘기기 상대). */
export const USERS: Record<Exclude<Role, "admin">, { id: string; name: string; empNo: string; roleGroup: string }> = {
  std: { id: "E2E_USR_STD", name: "E2E 표준관리자", empNo: "E2EUSR01", roleGroup: "ROLE_GROUP_MDM_STD_ADMIN" },
  stw: { id: "E2E_USR_STW", name: "E2E 담당자", empNo: "E2EUSR02", roleGroup: "ROLE_GROUP_MDM_STEWARD" },
  stw2: { id: "E2E_USR_STW2", name: "E2E 담당자2", empNo: "E2EUSR03", roleGroup: "ROLE_GROUP_MDM_STEWARD" },
};

export const authFile = (role: Role) => path.join(AUTH_DIR, `${role}.json`);

/**
 * 사용자가 만든 시험 데이터 ID.
 *
 * ★실행 번호(RUN)를 붙이지 않는다 — 2026-09-28 정리. 이전에는 `E2E_USR_${tag}_${RUN}` 처럼 실행마다
 * 다른 접미어를 붙였는데, 그래서 (1) 같은 스크린을 두 번 돌리면 마루 코드 목록에 `E2E_USR_CD_L1H8E1`·
 * `E2E_USR_CD_L3R8S2` 처럼 실행치마다 한 벌씩 쌓였고(6회 실행 → 57건), (2) 그때 만든 인스턴스를
 * E2E 가 끝나고도 모른다. 어느 것이 이번 실행 것인지 화면에서 구분되지 않는다.
 *
 * 지금은 태그 하나 = ID 하나다. 재실행하면 같은 ID 를 다시 쓰므로 화면·DB 에 늘 한 벌만 남고,
 * 이전 실행치가 새 실행에 덮여써진다. 시험 데이터가 주 DB 에 남는 것 자체는 `E2E_` 접두로
 * 언제든 식별된다 — `tools/e2e-clean-data.sh` 가 그 접두로 한 번에 지운다.
 */
export const uid = (tag: string) => `E2E_USR_${tag}`;

/**
 * 유일성 제약이 걸린 칸(용어 표기·영문 약어·도메인 표준명 등)에 쓰는 고정 접미.
 *
 * `uid()` 와 달리 ID 로 쓰지 않는다 — 밑줄이 금지된 칸이 있고(NamingRules.TERM_NAME), 값을 고르는
 * 칸이라 "이전 실행 것이 화면에 남아 있으면 그 값을 고르면 된다" 로도 충분하지 않기 때문이다.
 * 화면 목록에 시험 데이터가 한 벌만 보인다는 요구를 여기서 얻는다.
 * 아무래도 고정이므로 `E2E` + 대문자 영숫자만 쓴다(한글·밑줄·특수문자 금지 대상 칸이 있다).
 */
export const RUN = "E2EX";

/** 이 규약이 지키려는 것 — 시험 데이터 ID 는 위 접두로 시작하고 길이는 50자 이하다(룰 변수명 규칙과 같다). */
export const E2E_ID_PREFIX = "E2E_";

// ─────────────────────────── 로그인 ───────────────────────────

/** 로그인 화면에서 로그인하고 포털로 넘어가길(T.LONG) 기다린다 — e2e/support/common 의 login 에 이 파일의 BASE_URL 을 넘긴다. */
export async function loginUI(page: Page, id: string, pwd: string) {
  await login(page, id, { baseUrl: BASE_URL, password: pwd });
}

/**
 * 역할별 로그인 상태로 새 페이지를 연다. 품질 감시(Watcher)와 버튼 누름 기록을 붙여 돌려준다.
 * 로그인은 setup 에서 한 번만 하고 storageState 를 재사용한다(동시 로그인 SQLITE_BUSY 회피).
 */
export async function openAs(browser: Browser, role: Role, testInfo: TestInfo): Promise<{ page: Page; watcher: Watcher }> {
  const file = authFile(role);
  if (!fs.existsSync(file)) throw new Error(`${file} 이 없다 — setup 프로젝트(00-setup.user.ts)를 먼저 돌린다`);
  const context = await browser.newContext({ storageState: file, viewport: VIEWPORT });
  await context.addInitScript(installClickRecorder);
  const page = await context.newPage();
  const watcher = new Watcher(page, testInfo);
  await page.goto(`${BASE_URL}/portal`);
  await expect(page.locator(".sidebar-container")).toBeVisible({ timeout: 60_000 });
  return { page, watcher };
}

// ─────────────────────────── 화면 이동 ───────────────────────────

/** 지금 보이는 탭의 화면. 비활성 탭은 display:none 으로 DOM 에 남으므로 늘 이 범위 안에서 찾는다. */
export const screen = (page: Page): Locator => page.locator(".portal-shell__tab-page:visible");

/** 보이는 data-testid 요소. */
export const tid = (page: Page, id: string): Locator => page.locator(`[data-testid="${id}"]:visible`);

/** 사이드바 트리 노드(li) — 바로 아래 .tree-item 의 이름이 정확히 text 인 것. scope 안의 직계 계층만 본다. */
const menuNode = (scope: Locator, text: string) =>
  scope
    .locator(
      `xpath=./ul/li[./div[contains(@class,"tree-item")]/span[contains(@class,"item-name") and normalize-space()=${xpathLiteral(text)}]]`,
    )
    .first();

/**
 * 포털 탭 줄에서 제목이 title 인 화면 탭을 닫는다(그 탭이 열려 있지 않으면 실패한다). 닫은 화면은 다음에 메뉴로 열 때 새로 그려 서버 값을 읽는다 —
 * 저장하지 않은 입력을 남기는 화면(같은 행을 다시 골라도 입력 유지)에서 "저장되지 않았다" 를 볼 때 쓴다.
 */
export async function closeScreenTab(page: Page, title: string) {
  const exact = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const tab = page.locator(".tabs-bar .tab-item").filter({ has: page.locator(".tab-title", { hasText: exact }) });
  await expect(tab, `닫을 "${title}" 탭이 열려 있어야 한다`).toHaveCount(1);
  await tab.hover();
  await tab.locator(".tab-close").click();
  await expect(tab).toHaveCount(0);
}

/**
 * 사이드바 트리를 사용자처럼 클릭해 화면을 연다.
 * 예: openMenu(page, ["마루 MDM", "마스터코드", "마루 코드"], "codeMng").
 * 폴더명(2026-09-28): 용어·도메인(dma) · 레이아웃(dmb) · 마스터코드(dmc) · 마스터데이터(dmd) · 업무기준(dme).
 * 같은 이름의 리프(카테고리 편집·버전 확정)가 여러 폴더에 있으므로 폴더 범위 안에서만 찾는다.
 * 폴더가 이미 펼쳐져 있으면 다시 누르지 않는다(누르면 접힌다).
 */
export async function openMenu(page: Page, trail: string[], screenId: string) {
  // 사이드바 최상위 ul 의 부모에서 출발한다.
  let scope = page.locator(".sidebar-container ul").first().locator("xpath=..");
  for (let i = 0; i < trail.length; i++) {
    const node = menuNode(scope, trail[i]);
    const item = node.locator("xpath=./div[contains(@class,'tree-item')]");
    await expect(item, `메뉴 "${trail.slice(0, i + 1).join(" > ")}"`).toBeVisible({ timeout: 20_000 });
    const isLeaf = i === trail.length - 1;
    const expanded = !isLeaf && (await node.locator("xpath=./ul").isVisible().catch(() => false));
    if (!expanded) await item.click();
    scope = node;
  }
  await expect(footerScreenId(page)).toHaveText(screenId, { timeout: 60_000 });
  await waitIdle(page);
}

export const footerScreenId = (page: Page) => screen(page).locator(".page-layout__footer-screen-id").first();
export const breadcrumb = (page: Page) => screen(page).locator(".page-layout__footer-breadcrumb").first();

/** 열린 MDI 탭을 모두 닫는다(홈 탭 제외). 탭의 × 는 마우스를 올려야 눌리므로(TabsBar.css pointer-events) 탭에 먼저 올린다. */
export async function closeAllTabs(page: Page) {
  const tabs = page.locator(".tabs-bar .tab-item").filter({ has: page.locator(".tab-close") });
  for (let n = await tabs.count(); n > 0; n = await tabs.count()) {
    await tabs.first().hover();
    await tabs.first().locator(".tab-close").click();
    await expect(tabs).toHaveCount(n - 1);
  }
}

/** 로딩 표시가 사라지고 네트워크가 잠잠해질 때까지 기다린다. */
export async function waitIdle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await expect(page.locator(".portal-shell__loading:visible")).toHaveCount(0, { timeout: 30_000 });
}

// ─────────────────────────── 공용 조작 ───────────────────────────

/** 보이는 화면 안의 버튼(이름 정확히 일치). */
export const button = (page: Page, name: string | RegExp) =>
  screen(page).getByRole("button", { name, exact: typeof name === "string" });

/** 열린 Mantine 모달(가장 위). */
export const modal = (page: Page) => page.locator(".mantine-Modal-content:visible").last();

/** 확인 모달에서 버튼을 누른다(예: "확인", "삭제", "취소"). */
export async function answerConfirm(page: Page, name: string | RegExp = /^(확인|예|삭제|저장)$/) {
  const m = modal(page);
  await expect(m).toBeVisible();
  await m.getByRole("button", { name }).click();
  await expect(m).toBeHidden();
}

/** 토스트 문구가 뜨는지 본다. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator(".mantine-Notification-root").filter({ hasText: text }).first()).toBeVisible({ timeout: 15_000 });
}

/** 보이는 오류 모달(ErrorModal) 본문. */
export const errorBody = (page: Page) => page.locator(".error-modal__body:visible");

/** 모달이 다 떠오른 뒤(열림 애니메이션 끝) 찍는다 — 반투명한 중간 프레임이 찍히지 않게. */
export async function snapModal(page: Page, name: string) {
  const m = modal(page);
  await expect(m).toBeVisible();
  await expect
    .poll(() => m.evaluate((el) => Number(getComputedStyle(el).opacity) * (el.getAnimations().length ? 0 : 1)))
    .toBe(1);
  await snap(page, name);
}

export interface ErrorModalOptions {
  /**
   * 닫는 방법(inModal 이 아닐 때).
   *   "exact"(기본) — [확인] 을 이름 완전 일치로 누르고 오류 본문이 사라졌는지 본다. 등록 팝업 위에 뜬 오류창도 다룬다
   *     (닫힌 뒤 "마지막 보이는 모달"을 다시 찾으면 아래의 등록 팝업을 가리켜 toBeHidden 이 실패한다).
   *   "answerConfirm" — answerConfirm(page, "확인"): 가장 위 모달이 닫혔는지 본다.
   */
  close?: "exact" | "answerConfirm";
  /** 오류 본문을 가장 위 모달 안에서 찾고, shot 은 열림 애니메이션을 기다리지 않고 바로 찍는다(snap). */
  inModal?: boolean;
}

/** 오류 모달 문구를 보고(부분 일치 toContainText) [확인]으로 닫는다. shot 을 주면 닫기 전에 스크린샷을 남긴다. */
export async function expectErrorModal(page: Page, text: string | RegExp, shot?: string, opts: ErrorModalOptions = {}) {
  if (opts.inModal) {
    const m = modal(page);
    await expect(m.locator(".error-modal__body")).toContainText(text, { timeout: 20_000 });
    if (shot) await snap(page, shot);
    await m.getByRole("button", { name: "확인", exact: true }).click();
    await expect(m.locator(".error-modal__body")).toHaveCount(0);
    return;
  }
  await expect(errorBody(page)).toContainText(text, { timeout: 20_000 });
  if (shot) await snapModal(page, shot);
  if (opts.close === "answerConfirm") {
    await answerConfirm(page, "확인");
    return;
  }
  await modal(page).getByRole("button", { name: "확인", exact: true }).click();
  await expect(errorBody(page)).toHaveCount(0);
}

/** 의도한 업무 오류(4xx) 직후 — 모인 문제가 4xx 네트워크 콘솔 줄뿐인지 본다(5xx·페이지 예외는 남기지 않는다). */
export function expectOnly4xx(watcher: Watcher, label: string) {
  const rest = watcher.drain().filter((p) => !/status of 4\d\d/.test(p));
  expect(rest, `${label}: 의도한 4xx 외의 오류가 없어야 한다`).toEqual([]);
}

/** 오늘에서 days 만큼 뺀 날의 0시 — 적용 시작 칸(DateTimePicker, 6e506cc9) 입력값(yyyy-MM-dd HH:mm:ss)과 서버 표기(yyyy-MM-dd). */
export function daysAgo(days: number): { input: string; date: string } {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { input: `${date} 00:00:00`, date };
}

/** ag-grid 안에서 셀 값으로 행을 찾는다. colId 를 주면 그 열만 본다. */
export function gridRow(grid: Locator, value: string, colId?: string): Locator {
  const cell = colId ? `.ag-cell[col-id="${colId}"]` : ".ag-cell";
  return gridRows(grid)
    .filter({ has: grid.page().locator(cell, { hasText: new RegExp(`^\\s*${escapeRe(value)}\\s*$`) }) });
}

/** ag-grid 표시 행 수(가상화 때문에 화면에 그려진 행만 센다). */
export const gridRowCount = (grid: Locator) => gridRows(grid).count();

// ─────────────────────────── 품질 감시 ───────────────────────────

/**
 * 콘솔 오류·페이지 예외·5xx 응답을 모은다. 4xx 는 오류 시나리오(중복 등록 등)에서 정상이므로 모으지 않는다.
 * 테스트 끝에 assertClean() 으로 확인한다.
 */
export class Watcher {
  readonly problems: string[] = [];
  /** 브라우저 기본 대화상자(window.confirm·alert) 문구 — 나온 순서대로. */
  readonly dialogs: string[] = [];
  private nextDialog: "accept" | "dismiss" = "accept";
  /** 알려진 개발 서버 소음(StrictMode 경고 등). 이 목록에 없는 콘솔 오류는 모두 문제로 본다. */
  static ignore: RegExp[] = [
    /Download the React DevTools/,
    /\[Fast Refresh\]/,
    /favicon/,
    /ResizeObserver loop/,
    // 의도한 4xx(중복 등록 등) 뒤 브라우저가 남기는 문구. 4xx 자체는 오류 시나리오에서 정상이고, 5xx 는 response 로 따로 잡는다.
    /Failed to load resource: the server responded with a status of 4\d\d/,
  ];

  constructor(private readonly page: Page, private readonly testInfo: TestInfo) {
    // Playwright 는 window.confirm 을 기본으로 "취소" 처리한다. 사용자는 보통 "확인" 을 누르므로 수락하고 문구를 남긴다.
    // "취소" 를 눌러 보는 단계는 직전에 dismissNextDialog() 를 부른다.
    page.on("dialog", (dialog) => {
      this.dialogs.push(dialog.message());
      const action = this.nextDialog;
      this.nextDialog = "accept";
      void (action === "accept" ? dialog.accept() : dialog.dismiss());
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (Watcher.ignore.some((re) => re.test(text))) return;
      this.problems.push(`console.error: ${text.slice(0, 300)}`);
    });
    page.on("pageerror", (err) => this.problems.push(`pageerror: ${err.message.slice(0, 300)}`));
    page.on("response", (res) => {
      if (res.status() >= 500) this.problems.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
    });
  }

  /** 다음 브라우저 기본 대화상자 한 번을 "취소" 로 닫는다. */
  dismissNextDialog() {
    this.nextDialog = "dismiss";
  }

  /** 지금까지 모인 문제를 비우고 돌려준다(의도한 오류 단계 직후 호출). */
  drain(): string[] {
    return this.problems.splice(0, this.problems.length);
  }

  assertClean(label = "화면") {
    const list = this.drain();
    if (list.length) this.testInfo.annotations.push({ type: "problems", description: list.join("\n") });
    expect(list, `${label}: 콘솔 오류·페이지 예외·5xx 가 없어야 한다`).toEqual([]);
  }
}

export interface LayoutOptions {
  /** 검사에서 뺄 요소 선택자(의도적으로 가로 스크롤하는 영역 등). */
  exclude?: string[];
  /** 버튼·입력 높이 기준(px). UI-Visual-Standard §4 = 26. */
  controlHeight?: number;
}

/**
 * 보이는 화면이 "깔끔한지" 본다 — UI-Visual-Standard 기준. 위반 목록을 모아 한 번에 실패시킨다.
 *   L1 문서·탭 페이지에 가로 넘침이 없다.
 *   L2 버튼·라벨·그리드 머리글 글자가 잘리지 않는다(scrollWidth > clientWidth + 1).
 *   L3 같은 줄 버튼·입력끼리 겹치지 않는다.
 *   L4 그리드·패널이 0 크기로 접혀 있지 않다(높이 40px 이상).
 *   L5 화면 안 버튼·입력 높이가 26px(±2)이다(아이콘 버튼·체크박스 제외).
 *   L6 화면 요소가 보이는 탭 영역 밖으로 삐져나가지 않는다.
 *   L7 보이는 버튼을 다른 요소가 덮지 않는다(누를 수 있다).
 */
export async function checkLayout(page: Page, label: string, opts: LayoutOptions = {}) {
  await waitIdle(page);
  const { out: violations, shared } = await page.evaluate(
    ({ exclude, controlHeight }) => {
      const out: string[] = [];
      const shared: string[] = [];
      const root = [...document.querySelectorAll<HTMLElement>(".portal-shell__tab-page")].find(
        (el) => getComputedStyle(el).display !== "none",
      );
      if (!root) return { out: ["보이는 탭 페이지가 없다"], shared };
      const excluded = (el: Element) => exclude.some((sel) => el.closest(sel));
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      };
      const name = (el: Element) =>
        (el.getAttribute("data-testid") ||
          el.getAttribute("aria-label") ||
          (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30) ||
          el.className.toString().slice(0, 40)) as string;

      // L1
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth + 1) out.push(`L1 문서 가로 넘침 ${doc.scrollWidth - doc.clientWidth}px`);
      if (root.scrollWidth > root.clientWidth + 1) out.push(`L1 탭 페이지 가로 넘침 ${root.scrollWidth - root.clientWidth}px`);

      // L2 — 글자 잘림
      const textEls = root.querySelectorAll<HTMLElement>(
        "button .mantine-Button-label, button, label, .mantine-InputWrapper-label, .ag-header-cell-text, .grid-panel-title, .page-layout__title",
      );
      for (const el of textEls) {
        if (!visible(el) || excluded(el)) continue;
        if (el.tagName === "BUTTON" && el.querySelector(".mantine-Button-label")) continue;
        if (el.scrollWidth > el.clientWidth + 1 && (el.textContent ?? "").trim())
          out.push(`L2 글자 잘림: "${name(el)}" (${el.scrollWidth}>${el.clientWidth})`);
      }

      // L3 — 겹침(버튼·입력 박스끼리)
      const ctrls = [...root.querySelectorAll<HTMLElement>("button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea")]
        .filter((el) => visible(el) && !excluded(el) && !el.closest(".ag-root-wrapper") && !el.closest(".mantine-Popover-dropdown"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }));
      for (let i = 0; i < ctrls.length; i++) {
        for (let j = i + 1; j < ctrls.length; j++) {
          const a = ctrls[i], b = ctrls[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          // 입력 칸 안 오른쪽 구역에 붙은 그 입력 자신의 단추([지우기] 등 Mantine Input section)는 그 입력의 일부다 — 서로 다른 컨트롤의 겹침이 아니다.
          const ownSection = (x: Element, y: Element) => {
            const wrap = x.closest('[class*="Input-section"]')?.closest('[class*="Input-wrapper"]');
            return !!wrap && wrap === y.closest('[class*="Input-wrapper"]');
          };
          if (ownSection(a.el, b.el) || ownSection(b.el, a.el)) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 2 && h > 2) out.push(`L3 겹침: "${name(a.el)}" ↔ "${name(b.el)}"`);
        }
      }

      // L4 — 접힌 그리드·패널
      for (const el of root.querySelectorAll<HTMLElement>(".ag-root-wrapper, .grid-panel, .content-panel")) {
        if (excluded(el) || getComputedStyle(el).display === "none") continue;
        const r = el.getBoundingClientRect();
        if (r.height < 40 || r.width < 40) out.push(`L4 접힌 영역: ${el.className.toString().split(" ")[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }

      // L5 — 컨트롤 높이. 화면 머리 버튼(.page-layout .btn)은 공통 CSS 가 높이 없이 padding 만 줘서 모든 화면이 23px 이다
      // (2026-09-28 확인). 화면 결함이 아니라 공통 결함이므로 실패 대신 shared 경고로 남긴다.
      for (const { el, r } of ctrls) {
        const iconOnly = el.tagName === "BUTTON" && !(el.textContent ?? "").trim();
        if (iconOnly || el.tagName === "TEXTAREA" || el.closest(".mantine-Tabs-list, .mantine-SegmentedControl-root")) continue;
        if (Math.abs(r.height - controlHeight) <= 2) continue;
        const msg = `L5 높이 ${Math.round(r.height)}px(기준 ${controlHeight}): "${name(el)}"`;
        if (el.closest(".page-layout__header-buttons")) shared.push(msg);
        else out.push(msg);
      }

      // L6 — 영역 밖 삐짐
      const rr = root.getBoundingClientRect();
      for (const { el, r } of ctrls) {
        if (r.right > rr.right + 1 || r.left < rr.left - 1) out.push(`L6 탭 영역 밖: "${name(el)}"`);
      }
      // L7 — 가려진 버튼: 보이는 영역 안 버튼의 가운데를 다른 요소가 덮고 있으면 사용자는 누를 수 없다.
      // 모달이 열려 있으면 덮는 것이 정상이므로 건너뛰고, 토스트·Next.js 개발 도구가 덮은 경우는 일시적이라 뺀다.
      const modalOpen = [...document.querySelectorAll("[role=dialog]")].some(visible);
      if (!modalOpen) {
        for (const { el, r } of ctrls) {
          if (el.tagName !== "BUTTON") continue;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
          const hit = document.elementFromPoint(cx, cy);
          if (!hit || el.contains(hit) || hit.contains(el)) continue;
          if (hit.closest(".mantine-Notifications-root, nextjs-portal")) continue;
          out.push(`L7 가려진 버튼: "${name(el)}" ← ${(hit.className || hit.tagName).toString().split(" ")[0]}`);
        }
      }
      return { out: [...new Set(out)], shared: [...new Set(shared)] };
    },
    { exclude: opts.exclude ?? [], controlHeight: opts.controlHeight ?? 26 },
  );
  if (shared.length) test.info().annotations.push({ type: "shared-layout", description: `${label}: ${shared.join(" / ")}` });
  expect(violations, `${label}: 화면 배치 위반`).toEqual([]);
}

/**
 * 지금 화면에 보이지 않는 컨트롤 — 안쪽 스크롤 영역(룰 화면·세트 편집의 본문, 확정 폼)에서 가운데가 그 영역 밖으로 밀려난 것.
 * checkLayout 은 창 밖만 건너뛰므로, 스크롤로 머리·꼬리 뒤에 숨은 컨트롤을 "가려진 버튼(L7)"·"겹침(L3)" 으로 센다.
 * 사용자에게 보이지 않는 상태라 그 순간의 배치 검사에서 뺀다(측정만 하는 evaluate — DOM 은 바꾸지 않는다).
 */
export async function scrolledOut(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = [...document.querySelectorAll<HTMLElement>(".portal-shell__tab-page")].find((el) => getComputedStyle(el).display !== "none");
    if (!root) return [];
    const path = (el: Element): string => {
      const parts: string[] = [];
      for (let e: Element | null = el; e && e.parentElement && e !== document.body; e = e.parentElement) {
        parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`);
      }
      return `body > ${parts.join(" > ")}`;
    };
    const out: string[] = [];
    for (const el of root.querySelectorAll("button, input, select, textarea")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest(".ag-root-wrapper")) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (!/(auto|scroll)/.test(`${cs.overflowX} ${cs.overflowY}`)) continue;
        const ar = a.getBoundingClientRect();
        if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) {
          out.push(path(el));
          break;
        }
      }
    }
    return out;
  });
}

/**
 * ag-grid 가 가로로 넘치는 표를 처음 그리거나 굴릴 때, 스크롤 막대를 겹쳐 그리는 환경(macOS — ag-apple-scrollbar)은 숨은 가로 막대를
 * 0.5초쯤 드러내(ag-scrollbar-scrolling) 맨 아래 행 위를 덮는다. 그동안 그 행·버튼을 누르면 막대가 가로챈다(Playwright 는 다시 굴리며
 * 재시도해 막대가 또 드러난다). 사람처럼 막대가 다시 숨은 뒤 누른다. inner 는 그 표 안의 요소다.
 */
export async function waitGridScrollbarSettled(inner: Locator) {
  const hscroll = inner.locator("xpath=ancestor-or-self::div[contains(concat(' ', normalize-space(@class), ' '), ' ag-root-wrapper ')][1]").locator(".ag-body-horizontal-scroll");
  await expect(hscroll).toHaveCount(1);
  await expect(hscroll).not.toHaveClass(/ag-scrollbar-(scrolling|active)/);
}

// ─────────────────────────── 버튼 커버리지 ───────────────────────────

/** 브라우저에 설치 — 캡처 단계에서 누른 버튼 키를 window.__mdmClicked 에 모은다. */
function installClickRecorder() {
  const w = window as unknown as { __mdmClicked?: string[] };
  w.__mdmClicked = [];
  document.addEventListener(
    "click",
    (e) => {
      const b = (e.target as Element | null)?.closest?.("button, [role=button]");
      if (!b) return;
      const key =
        b.getAttribute("data-testid") ||
        b.getAttribute("aria-label") ||
        (b.textContent ?? "").trim().replace(/\s+/g, " ") ||
        b.getAttribute("title") ||
        "";
      w.__mdmClicked!.push(key);
    },
    true,
  );
}

/** 버튼 누름 기록을 비운다 — 화면을 옮길 때 불러, 앞 화면에서 누른 같은 이름의 버튼(조회·저장)이 뒤 화면 커버리지로 잘못 인정되지 않게 한다. */
export async function resetClicks(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __mdmClicked?: string[] }).__mdmClicked = [];
  });
}

/**
 * 보이는 화면의 활성 버튼 중 이번 흐름에서 한 번도 누르지 않은 것이 없어야 한다.
 * allow 에는 일부러 누르지 않는 버튼을 이유와 함께 적는다({ "엑셀": "파일 다운로드 — 별도 확인" }).
 * 비활성 버튼은 누를 수 없으므로 목록에서 뺀다(비활성 조건은 각 스펙이 따로 단언한다).
 */
export async function assertAllButtonsPressed(page: Page, label: string, allow: Record<string, string> = {}) {
  const { visibleKeys, clicked } = await page.evaluate(() => {
    // installClickRecorder 의 키 규칙과 같다.
    const key = (b: Element) =>
      b.getAttribute("data-testid") ||
      b.getAttribute("aria-label") ||
      (b.textContent ?? "").trim().replace(/\s+/g, " ") ||
      b.getAttribute("title") ||
      "";
    const root = [...document.querySelectorAll<HTMLElement>(".portal-shell__tab-page")].find(
      (el) => getComputedStyle(el).display !== "none",
    );
    const keys = root
      ? [...root.querySelectorAll("button")]
          .filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && !(b as HTMLButtonElement).disabled && !b.closest(".ag-root-wrapper");
          })
          .map(key)
          .filter(Boolean)
      : [];
    return { visibleKeys: [...new Set(keys)], clicked: (window as unknown as { __mdmClicked?: string[] }).__mdmClicked ?? [] };
  });
  const pressed = new Set(clicked);
  const missing = visibleKeys.filter((k) => !pressed.has(k) && !(k in allow));
  expect(missing, `${label}: 누르지 않은 버튼(allow 에 이유 없이 빠짐)`).toEqual([]);
}

// ─────────────────────────── 스크린샷 ───────────────────────────

/** 사람이 눈으로 보는 용도의 전체 화면 스크린샷. .out/screens/{name}.png */
export async function snap(page: Page, name: string) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREEN_DIR, `${name}.png`) });
}

function xpathLiteral(s: string) {
  return s.includes('"') ? `'${s}'` : `"${s}"`;
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
