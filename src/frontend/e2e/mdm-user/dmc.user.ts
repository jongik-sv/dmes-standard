import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  RUN,
  USERS,
  Watcher,
  answerConfirm,
  assertAllButtonsPressed,
  breadcrumb,
  button,
  closeScreenTab,
  checkLayout,
  daysAgo,
  expectErrorModal,
  expectToast,
  footerScreenId,
  gridRow,
  gridRowById,
  gridRowByIndex,
  gridRows,
  modal,
  openAs,
  openMenu,
  resetClicks,
  screen,
  snap,
  snapModal,
  tid,
  uid,
  waitIdle,
  type LayoutOptions,
} from "./support";
import { fillDateTime } from "../support/mdm-e2e";

/**
 * 마루 MDM > 마스터코드(dmc) 사용자 여정 E2E.
 *
 * 담당자(stw)가 화면만으로 마루 코드 하나의 일생을 끝까지 다룬다. 2026-09-28 D-101 로 화면은 셋이다.
 *   마루 코드(codeMng) — 왼쪽 목록, 오른쪽 고른 코드의 상세(등록은 목록 헤더 [코드 등록] 팝업)(헤더·라벨·버전 카드, 옛 codeEdit).
 *     등록 → 조회 → 목록 행으로 상세 열기 → 헤더·라벨 수정, 해제·선점, 두 사용자 잠금·충돌
 *   → 코드 편집(codeItemEdit) [코드]·[트리] 탭 — 코드 행 입력·수정·되돌리기
 *   → 같은 화면 [카테고리] 탭 — 카테고리 추가·소속·정규식(저장은 머리 [저장] 하나, 옛 codeCateEdit)
 *   → 버전 확정(codeConfirm) — 검사·확정
 *   → 새 버전에서 행 삭제·카테고리 닫기·경미 수정 → 새 버전 삭제·복원 → 폐기.
 *
 * 구조
 *   A "여정"  — serial. 한 페이지를 공유하며 앞 단계가 만든 데이터를 이어 쓴다.
 *   B "연결·권한" — 테스트마다 스스로 코드를 등록하는 독립 테스트. 화면 간 인계·넘기기·코드 삭제·읽기 전용처럼
 *     실패해도 여정을 끊으면 안 되는 확인을 둔다.
 * 배치 검사(checkLayout) 위반은 여정을 멈추지 않게 모아 두었다가 마지막 TC-DMC-LAY-99 에서 한꺼번에 단언한다.
 */

const TRAIL = (leaf: string) => ["마루 MDM", "마스터코드", leaf];
const MENU = {
  codeMng: "마루 코드",
  codeItemEdit: "코드 편집",
  codeConfirm: "버전 확정",
} as const;
type ScreenId = keyof typeof MENU;

const STW = USERS.stw.id;
const STW2 = USERS.stw2.id;
/** D2 보류: [넘기기]는 담당자 조회 수단이 생길 때까지 꺼져 있고 이 문구로 이유를 알린다(m-mdm src/shell/handover.ts). */
const HANDOVER_PENDING = "넘기기는 준비 중입니다. 넘겨받는 사람의 담당자 여부를 확인할 수단이 아직 없습니다.";
/** codeMng 오른쪽에 아무것도 고르지 않았을 때의 안내. */
const DETAIL_GUIDE = "목록에서 마루 코드를 고르거나 [코드 등록] 을 누르세요";

// ─────────────────────────── 지역 부품 ───────────────────────────

async function go(page: Page, id: ScreenId) {
  await openMenu(page, TRAIL(MENU[id]), id);
}

/** 배치 위반을 모은다(여정을 멈추지 않는다). 위반 화면은 스크린샷을 남긴다. */
const layoutIssues: string[] = [];
async function layout(page: Page, label: string, opts?: LayoutOptions) {
  try {
    await checkLayout(page, label, opts);
  } catch (e) {
    layoutIssues.push(`${label}\n${(e as Error).message.split("\n").slice(0, 30).join("\n")}`);
    await snap(page, `dmc-layout-${label.replace(/[^\w가-힣-]+/g, "_")}`);
  }
}

/** codeMng 목록 헤더 [코드 등록] 으로 등록 팝업을 연다(열 때마다 새로 마운트되어 칸이 빈 채로 시작한다). */
async function openCodeRegister(page: Page) {
  await page.locator("#btn_code_reg").click();
  await expect(tid(page, "code-register-form")).toBeVisible({ timeout: 20_000 });
}

/** 등록 팝업을 [취소]로 닫는다. 고른 코드·상세는 그대로다. */
async function cancelCodeRegister(page: Page) {
  await tid(page, "code-reg-cancel").click();
  await expect(tid(page, "code-register-form")).toHaveCount(0, { timeout: 20_000 });
}

/** 네이티브 Select 에서 값을 고른다(옵션이 채워질 때까지 기다린다). */
async function choose(page: Page, testId: string, value: string) {
  const sel = tid(page, testId);
  await expect(sel.locator(`option[value="${value}"]`)).toHaveCount(1, { timeout: 20_000 });
  await sel.selectOption(value);
  await waitIdle(page);
}

/** 코드 편집 조회칸의 마루 코드 고르기 — 칸에 넣고 Enter 로 찾아 드롭다운의 그 코드를 누른다. */
async function pickCode(page: Page, id: string) {
  await tid(page, "code-pick-keyword").fill(id);
  await tid(page, "code-pick-keyword").press("Enter");
  await tid(page, `code-pick-${id}`).click({ timeout: 20_000 });
  await waitIdle(page);
}

const codeListRow = (page: Page, id: string) => gridRow(tid(page, "code-list"), id, "maruCodeId");

/**
 * codeMng 목록 행의 칸 값을 본다. 목록이 좁아 오른쪽 열은 가로로 밀어야 그려지므로 사용자처럼 밀어 보고, 행을 ID 칸으로
 * 찾으므로 본 뒤에는 맨 왼쪽으로 되돌린다.
 */
async function expectListCell(page: Page, id: string, colId: string, text: string) {
  const grid = tid(page, "code-list");
  const row = codeListRow(page, id);
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  await revealColumn(grid, row, colId);
  await expect(cellOf(row, colId)).toHaveText(text, { timeout: 20_000 });
  await scrollGridLeft(grid);
}

/**
 * codeMng 목록을 그 ID 로 좁혀 행을 눌러 오른쪽 상세를 (다시) 연다. [조회]는 목록만 다시 읽으므로 상세를 새로 읽을 때도
 * 이것을 쓴다. 행을 누르면 고른 버전이 풀리니 버전 조작 전에는 selectVersion 을 다시 부른다.
 */
async function openCode(page: Page, id: string) {
  await tid(page, "code-search-status").selectOption("");
  await tid(page, "code-search-keyword").fill(id);
  await button(page, "조회").click();
  const row = codeListRow(page, id);
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  // ID 칸은 [코드 편집] 화면을 여는 링크다(d3532f39) — 상세는 행의 다른 칸(이름)을 눌러 연다.
  await row.locator('.ag-cell[col-id="maruCodeName"]').click();
  await waitIdle(page);
  await expect(tid(page, "header-name")).toBeVisible({ timeout: 30_000 });
  await expect(tid(page, "version-list")).toBeVisible({ timeout: 30_000 });
}

/** 확정 대기 목록·검사 결과 표는 AgDataGrid 다 — 행은 row-id(목록은 "ID-버전", 검사는 검사 번호)로 찾는다. */
const rowById = (page: Page, gridTestId: string, rowId: string) => gridRowById(tid(page, gridTestId), rowId);
const cfRow = (page: Page, id: string, ver: string) => rowById(page, "cf-list", `${id}-${ver}`);
const cfCheckRow = (page: Page, no: string) => rowById(page, "cf-checks", no);

/** 버전 목록도 AgDataGrid 다 — 행 키(rowKey)는 버전 값이다. */
const versionRow = (page: Page, ver: string) => rowById(page, "version-list", ver);

async function selectVersion(page: Page, ver: string) {
  await versionRow(page, ver).click();
  await expect(versionRow(page, ver)).toHaveClass(/ag-row-highlighted/);
}

/** codeMng [코드 등록] 팝업으로 마루 코드를 등록한다. 등록 뒤 같은 화면 오른쪽에 뜨는 상세까지 기다린다. */
async function registerCode(page: Page, id: string, name: string, lvl = "0", desc = "") {
  await go(page, "codeMng");
  await openCodeRegister(page);
  await tid(page, "code-reg-id").fill(id);
  await tid(page, "code-reg-name").fill(name);
  if (desc) await tid(page, "code-reg-desc").fill(desc);
  await tid(page, "code-reg-lvl").selectOption(lvl);
  await tid(page, "code-reg-save").click();
  await expectToast(page, "등록했습니다");
  await expect(tid(page, "code-register-form")).toHaveCount(0);
  await expect(tid(page, "header-name")).toHaveValue(name, { timeout: 30_000 });
  await expect(tid(page, "version-list")).toContainText("v1.000", { timeout: 30_000 });
  await expect(footerScreenId(page)).toHaveText("codeMng");
  await waitIdle(page);
}

// ── codeItemEdit 탭 ──

type ItemTab = "grid" | "tree" | "cate" | "test";

/**
 * codeItemEdit 의 탭을 누른다 — 왼쪽은 [코드]·[트리], 오른쪽은 [카테고리 편집]·[코드 테스트]다(ade3851f: 카테고리가 왼쪽
 * 세 번째 탭에서 오른쪽 탭의 표로 옮겨졌고, 옛 카테고리 미리보기는 [코드 테스트] 탭이 됐다).
 */
async function openTab(page: Page, tab: ItemTab) {
  const tabId = { grid: "code-tab-grid", tree: "code-tab-tree", cate: "code-right-tab-cate", test: "code-right-tab-test" }[tab];
  await tid(page, tabId).click();
  const body = { grid: "code-grid", tree: "code-tree", cate: "cate-tab", test: "code-preview-cate" }[tab];
  await expect(tid(page, body)).toBeVisible({ timeout: 20_000 });
}

// ── [카테고리 편집] 탭(ade3851f) — 카테고리 표·소속 표·[카테고리 추가] 팝업·TABLE [편집] 팝업 ──

/**
 * 카테고리 표의 행. `cate-list` 감싸개는 높이가 0 이라(flex 자식, 표는 절대 위치) Playwright 가 보이지 않는 요소로 본다 —
 * `:visible` 을 붙이는 tid() 로 찾으면 안을 못 보고, 그 안에 대한 toHaveCount(0) 은 늘 통과(거짓 통과)한다. 보이기 조건 없이 찾는다.
 */
const cateList = (page: Page) => screen(page).locator('[data-testid="cate-list"]');
const cateRows = (page: Page) => gridRows(cateList(page));
/** 카테고리 표의 한 행 — ID 칸 안쪽 span 이 `cate-row-{cateId}` 다. */
const cateRow = (page: Page, cateId: string) => cateRows(page).filter({ has: page.locator(`[data-testid="cate-row-${cateId}"]`) });
const cateCell = (page: Page, cateId: string, colId: string) => cateRow(page, cateId).locator(`.ag-cell[col-id="${colId}"]`);
/** 아래 "소속 — {cateId}" 표 — REGEX 는 고른 식의 서버 해석(compare) 결과로 맞는 코드를, TABLE 은 소속 코드를 보인다. */
const memberPanel = (page: Page) =>
  screen(page).locator(".grid-panel").filter({ has: page.locator(".grid-panel-title", { hasText: /^소속 — / }) });

/** 카테고리를 고른다. ID·이름 칸은 한 번 누르면 편집이 열리므로 편집 칸이 아닌 [해당] 칸을 누른다. */
async function selectCate(page: Page, cateId: string) {
  await cateCell(page, cateId, "matchCount").click();
  await expect(memberPanel(page).locator(".grid-panel-title")).toContainText(`소속 — ${cateId}`);
}

/** [카테고리 추가] 팝업으로 카테고리를 더한다(저장은 머리 [저장]이 한다). */
async function addCategory(page: Page, cateId: string, name: string, kind: "TABLE" | "REGEX") {
  await tid(page, "cate-add").click();
  await expect(tid(page, "cate-add-id")).toBeVisible();
  await tid(page, "cate-add-id").fill(cateId);
  await tid(page, "cate-add-name").fill(name);
  await tid(page, "cate-add-kind").selectOption(kind);
  await tid(page, "cate-add-submit").click();
  await expect(page.getByTestId("cate-add-id")).toHaveCount(0);
  await expect(cateRow(page, cateId)).toHaveCount(1);
}

/** 카테고리 표의 글자 칸을 한 번 눌러 편집하고 Enter 로 마친다. */
async function editCateText(page: Page, cateId: string, colId: string, value: string) {
  const cell = cateCell(page, cateId, colId);
  const editor = cell.locator("input");
  await expect(async () => {
    await cell.click();
    await expect(editor).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await editor.fill(value);
  await editor.press("Enter");
  await expect.poll(() => cateCellText(cell), { timeout: 5_000 }).toBe(value);
}

/**
 * 카테고리 칸 글자 — 저장이 거부된 행은 이름 칸 아래에 이슈 문구(cate-row-issue-*)가 붙으므로(CategoryTab) 그 요소를 뺀 글자를 정확히 비교한다.
 */
async function cateCellText(cell: Locator): Promise<string> {
  return cell.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-testid^="cate-row-issue-"]').forEach((n) => n.remove());
    return (copy.textContent ?? "").trim();
  });
}

/** 카테고리 표의 선택 칸(대상 칸 등)을 한 번 눌러 고른다. */
async function editCateSelect(page: Page, cateId: string, colId: string, value: string, label: string) {
  const cell = cateCell(page, cateId, colId);
  const editor = cell.locator("select");
  await expect(async () => {
    await cell.click();
    await expect(editor).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await editor.selectOption(value);
  await expect(editor).toHaveCount(0, { timeout: 5_000 });
  await expect(cell).toHaveText(label, { timeout: 5_000 });
}

/** TABLE 카테고리의 [편집] 으로 소속 편집 팝업(transfer-list)을 연다. */
async function openTransfer(page: Page, cateId: string) {
  await selectCate(page, cateId);
  await tid(page, `cate-edit-${cateId}`).click();
  await expect(tid(page, "cate-transfer")).toBeVisible({ timeout: 20_000 });
}

async function closeTransfer(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(page.locator('[data-testid="cate-transfer"]')).toHaveCount(0);
}

// ── ag-grid 셀 편집 ──

const codeGrid = (page: Page) => tid(page, "code-grid");
const newRow = (grid: Locator) => gridRowByIndex(grid, 0);
const cellOf = (row: Locator, colId: string) => row.locator(`.ag-cell[col-id="${colId}"]`);

/** 열 가상화로 아직 그려지지 않은 열이면 가로로 밀어 그리게 한다. */
async function revealColumn(grid: Locator, row: Locator, colId: string) {
  const cell = cellOf(row, colId);
  if (await cell.count()) return;
  const hscroll = grid.locator(".ag-body-horizontal-scroll-viewport").first();
  for (let x = 0; x <= 4000; x += 250) {
    await hscroll.evaluate((el, v) => (el.scrollLeft = v), x);
    if (await cell.count()) return;
  }
}

/** 가로 스크롤을 맨 왼쪽으로 되돌린다. */
async function scrollGridLeft(grid: Locator) {
  const hscroll = grid.locator(".ag-body-horizontal-scroll-viewport");
  if (await hscroll.count()) await hscroll.first().evaluate((el) => (el.scrollLeft = 0));
}

/** 한 번 클릭 편집 — 편집기가 열릴 때까지 누르고 값을 넣은 뒤 Enter. */
async function editCell(grid: Locator, row: Locator, colId: string, value: string) {
  await revealColumn(grid, row, colId);
  const cell = cellOf(row, colId);
  const editor = cell.locator("input");
  await expect(async () => {
    await cell.click();
    await expect(editor).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  // 사용자처럼 한 글자씩 친다(숫자 편집기는 fill 로 넣은 값을 받지 않는 경우가 있다).
  await editor.fill("");
  await editor.pressSequentially(value);
  await editor.press("Enter");
  await expect(cell).toContainText(value, { timeout: 5_000 });
}

interface CodeRowInput {
  code: string;
  name?: string;
  alterName?: string;
  seq?: string;
  lvl1?: string;
  lvl2?: string;
  attr01?: string;
  attr02?: string;
  description?: string;
}

/** [코드 추가]로 맨 위에 새 행을 넣고 칸을 채운다. */
async function addCodeRow(page: Page, input: CodeRowInput) {
  const grid = codeGrid(page);
  await tid(page, "code-add").click();
  const row = newRow(grid);
  await expect(row).toBeVisible();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) await editCell(grid, row, key, value);
    await scrollGridLeft(grid);
  }
}

const codeRow = (page: Page, code: string) => gridRow(codeGrid(page), code, "code");

/** 상태 줄의 "row_version = n" 값. 저장마다 늘어나는지만 본다(선점·해제도 늘리므로 절대값은 보지 않는다). */
async function rowVersion(page: Page, testId: "code-row-version" | "cate-row-version"): Promise<number> {
  const el = tid(page, testId);
  await expect(el).toHaveText(/^row_version = \d+$/, { timeout: 20_000 });
  return Number((await el.textContent())!.replace(/\D+/g, ""));
}

async function expectRowVersionAbove(page: Page, testId: "code-row-version" | "cate-row-version", before: number) {
  await expect.poll(() => rowVersion(page, testId), { timeout: 20_000 }).toBeGreaterThan(before);
}

// ═══════════════════════════ A. 여정 ═══════════════════════════

test.describe("dmc 마스터코드 사용자 여정", () => {
  test.describe.configure({ mode: "serial" });

  const CODE = uid("CD");
  const NAME = `E2E 사용자 코드 ${RUN}`;
  const NAME2 = `E2E 강종 코드 ${RUN}`;
  const CONFIRM1 = daysAgo(7);
  const CONFIRM1B = daysAgo(6);
  const TOO_EARLY = daysAgo(40);

  let page: Page;
  let watcher: Watcher;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ page, watcher } = await openAs(browser, "stw", testInfo));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  // ─────────── codeMng — 마루 코드(목록·등록) ───────────

  test("TC-DMC-MNG-01 마루 코드 화면 배치 — 메뉴로 열면 검색영역·목록·[코드 등록]이 보이고 오른쪽은 안내만 있다", async () => {
    await go(page, "codeMng");
    await resetClicks(page); // 이 화면 버튼 커버리지를 여기서부터 센다
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터코드 > 마루 코드");
    await expect(tid(page, "code-search-keyword")).toBeVisible();
    await expect(tid(page, "code-search-status")).toHaveValue("");
    await expect(tid(page, "code-list")).toBeVisible();
    await expect(page.locator("#btn_code_reg")).toBeEnabled();
    // 아무것도 고르지 않았으면 오른쪽은 안내뿐이다 — 등록 팝업·상세·삭제·폐기 버튼이 없다.
    await expect(screen(page).getByText(DETAIL_GUIDE)).toBeVisible();
    await expect(tid(page, "code-register-form")).toHaveCount(0);
    await expect(tid(page, "code-reg-id")).toHaveCount(0);
    await expect(tid(page, "header-name")).toHaveCount(0);
    await expect(button(page, /^(삭제|폐기)$/)).toHaveCount(0);
    await layout(page, "codeMng");
    await snap(page, "dmc-codeMng-01-initial");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-02 [코드 등록]으로 등록 팝업을 열고, 필수값·ID 형식 오류는 알아듣기 쉬운 문구로 막힌다", async () => {
    await openCodeRegister(page);
    // 팝업을 열어도 오른쪽 안내는 그대로다(선택·상세를 건드리지 않는다).
    await expect(screen(page).getByText(DETAIL_GUIDE)).toBeVisible();
    await expect(tid(page, "code-reg-source")).toHaveText("MDM");
    await expect(tid(page, "code-reg-lvl")).toHaveValue("0");
    await expect(tid(page, "code-reg-save")).toBeEnabled();
    await layout(page, "codeMng 등록 팝업");

    await tid(page, "code-reg-save").click();
    await expectErrorModal(page, "마루 코드 ID 와 이름을 입력하세요.", "dmc-codeMng-02-required");

    await tid(page, "code-reg-id").fill("e2e usr.bad");
    await tid(page, "code-reg-name").fill(NAME);
    await tid(page, "code-reg-save").click();
    await expectErrorModal(page, /점·콤마·공백|영문 대문자/, "dmc-codeMng-02-bad-id");
    // 실패하면 팝업은 열린 채 입력값을 그대로 둔다 — 사용자가 고쳐서 다시 등록한다. 팝업은 MNG-03 으로 열린 채 이어진다.
    await expect(tid(page, "code-register-form")).toBeVisible();
    await expect(tid(page, "code-reg-id")).toHaveValue("e2e usr.bad");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-03 등록(C) — ID·이름·설명·계층 칸 수를 넣고 등록하면 팝업이 닫히고 같은 화면 오른쪽에 그 코드의 상세가 뜬다", async () => {
    // MNG-02 에서 열린 팝업을 이어 쓴다(입력값은 아래에서 다시 채운다).
    await expect(tid(page, "code-register-form")).toBeVisible();
    await tid(page, "code-reg-id").fill(CODE);
    await tid(page, "code-reg-name").fill(NAME);
    await tid(page, "code-reg-desc").fill("E2E 사용자 여정으로 만든 코드");
    await tid(page, "code-reg-lvl").selectOption("2");
    await tid(page, "code-reg-save").click();
    await expectToast(page, "등록했습니다");

    // 새 탭을 열지 않는다 — 팝업이 닫히고 같은 화면 오른쪽에 상세가 뜬다.
    await expect(tid(page, "code-register-form")).toHaveCount(0);
    await expect(tid(page, "header-name")).toHaveValue(NAME, { timeout: 30_000 });
    await expect(footerScreenId(page)).toHaveText("codeMng");
    await expect(tid(page, "code-reg-id")).toHaveCount(0);
    const list = tid(page, "version-list");
    await expect(list).toContainText("v1.000", { timeout: 30_000 });
    await expect(versionRow(page, "1.000")).toContainText("MAJOR");
    await expect(versionRow(page, "1.000")).toContainText("작성 중");
    await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
    await expect(tid(page, "header-lvl")).toHaveValue("2");
    await snap(page, "dmc-codeMng-03-registered");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-04 조회(R) — 키워드·상태 조건을 바꿔 가며 방금 만든 코드를 찾는다", async () => {
    const list = tid(page, "code-list");
    await tid(page, "code-search-keyword").fill(CODE);
    await button(page, "조회").click();
    const row = codeListRow(page, CODE);
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expectListCell(page, CODE, "maruCodeName", NAME);
    await expectListCell(page, CODE, "sourceKind", "MDM");
    await expectListCell(page, CODE, "status", "CREATED");
    await expectListCell(page, CODE, "currentVerLabel", "미확정");
    await expectListCell(page, CODE, "unappliedLabel", "v1.000 DRAFT");
    await expect(list.locator(".grid-panel-count").first()).toHaveText("1건");
    await layout(page, "codeMng 목록 채워짐");

    // 상태 INUSE 로 좁히면 빠진다.
    await tid(page, "code-search-status").selectOption("INUSE");
    await button(page, "조회").click();
    await expect(tid(page, "code-list-empty")).toHaveText("조회된 마루 코드가 없습니다", { timeout: 20_000 });
    await snap(page, "dmc-codeMng-04-empty");

    // DEPRECATED 도 빠진다.
    await tid(page, "code-search-status").selectOption("DEPRECATED");
    await button(page, "조회").click();
    await expect(tid(page, "code-list-empty")).toBeVisible({ timeout: 20_000 });

    // CREATED 로 바꾸면 다시 나온다.
    await tid(page, "code-search-status").selectOption("CREATED");
    await button(page, "조회").click();
    await expect(row).toHaveCount(1, { timeout: 20_000 });

    // 이름 일부 + Enter, ID 소문자(대소문자 무시)로도 찾는다.
    await tid(page, "code-search-status").selectOption("");
    await tid(page, "code-search-keyword").fill(`사용자 코드 ${RUN}`);
    await tid(page, "code-search-keyword").press("Enter");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await tid(page, "code-search-keyword").fill(CODE.toLowerCase());
    await button(page, "조회").click();
    await expect(row).toHaveCount(1, { timeout: 20_000 });

    // 없는 조건이면 빈 상태.
    await tid(page, "code-search-keyword").fill(`${CODE}_NONE`);
    await button(page, "조회").click();
    await expect(tid(page, "code-list-empty")).toBeVisible({ timeout: 20_000 });
    // 초기화 버튼은 이 화면에 없다(보고서 참고).
    await expect(button(page, "초기화")).toHaveCount(0);
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-05 같은 ID 로 다시 등록하면 중복 문구가 보이고, [취소]는 등록 팝업만 닫는다", async () => {
    // [코드 등록]을 누르면 등록 팝업이 빈 칸으로 다시 열린다. 오른쪽 상세는 MNG-03 에서 등록한 코드 그대로다
    // (조회는 목록만 다시 읽고 선택을 바꾸지 않는다 — codeMng loadList).
    await openCodeRegister(page);
    await expect(tid(page, "code-reg-id")).toHaveValue("");
    await expect(tid(page, "code-reg-name")).toHaveValue("");
    await expect(tid(page, "code-reg-lvl")).toHaveValue("0");
    await expect(tid(page, "header-name")).toHaveValue(NAME);

    await tid(page, "code-reg-id").fill(CODE);
    await tid(page, "code-reg-name").fill("중복 등록");
    await tid(page, "code-reg-save").click();
    await expectErrorModal(page, "마루 코드·마루 데이터에 같은 ID 가 있습니다", "dmc-codeMng-05-dup");
    await tid(page, "code-reg-id").fill("");
    await tid(page, "code-reg-name").fill("");
    // [취소]는 팝업만 닫는다(고른 코드의 상세는 그대로). 다시 열면 칸이 비어 있다.
    await cancelCodeRegister(page);
    await expect(tid(page, "header-name")).toHaveValue(NAME);
    await openCodeRegister(page);
    await expect(tid(page, "code-reg-id")).toHaveValue("");
    await expect(tid(page, "code-reg-name")).toHaveValue("");
    // 뒤 테스트가 목록을 누를 수 있도록 팝업을 닫아 두고, 버튼 커버리지는 팝업이 닫힌 상태에서 본다.
    await cancelCodeRegister(page);
    // 등록한 코드의 상세가 오른쪽에 떠 있다 — 그 버튼은 이어지는 시험에서 누른다.
    await assertAllButtonsPressed(page, "codeMng", {
      "header-save": "헤더 저장은 TC-DMC-EDT-03 에서 누른다",
      "header-delete-code": "코드 삭제는 TC-DMC-EDT-14 에서 누른다(이 여정의 코드는 확정까지 이어 간다)",
    });
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-06 목록 행을 누르면 오른쪽 상세가 그 코드로 바뀐다(새 탭을 열지 않는다)", async () => {
    await expect(tid(page, "code-register-form")).toHaveCount(0);
    await openCode(page, CODE);
    await expect(tid(page, "header-name")).toHaveValue(NAME, { timeout: 30_000 });
    await expect(tid(page, "code-reg-id")).toHaveCount(0);
    await expect(footerScreenId(page)).toHaveText("codeMng");
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터코드 > 마루 코드");
    watcher.assertClean("codeMng");
  });

  // ─────────── codeMng — 오른쪽 상세(옛 codeEdit) ───────────

  test("TC-DMC-EDT-01 마루 코드 상세 배치 — 오른쪽에 헤더·라벨·버전 카드가 보인다", async () => {
    await resetClicks(page);
    await expect(tid(page, "header-status")).toHaveText("CREATED");
    for (let i = 1; i <= 10; i++) await expect(tid(page, `label-attr${String(i).padStart(2, "0")}`)).toBeVisible();
    await expect(tid(page, "version-list")).toBeVisible();
    await layout(page, "codeMng 상세");
    await snap(page, "dmc-codeMng-detail-01-initial");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-02 버전 버튼은 선택한 버전·소유자·미적용 수에 따라 켜지고 꺼진다", async () => {
    // 선택 전: 버전 조작 버튼은 [코드 편집]까지 모두 꺼져 있다.
    for (const b of ["ver-delete", "ver-lock", "ver-unlock", "ver-handover", "ver-confirm-move", "ver-item-edit"]) {
      await expect(tid(page, b), b).toBeDisabled();
    }
    // 미적용 DRAFT 가 있어 새 버전은 막히고 안내가 보인다.
    await expect(tid(page, "ver-new-major")).toBeDisabled();
    await expect(tid(page, "ver-new-minor")).toBeDisabled();
    await expect(tid(page, "ver-new-hint")).toHaveText("미적용 버전 v1.000 DRAFT 이 있어 새 버전을 만들 수 없습니다");
    // 확정된 적 없는 코드라 [폐기] 대신 [삭제]가 선다(D-102). 삭제 동작은 TC-DMC-EDT-14 에서 따로 본다.
    await expect(tid(page, "header-deprecate")).toHaveCount(0);
    await expect(tid(page, "header-save")).toBeEnabled();

    // 내 DRAFT 를 고르면 삭제·해제·이동 버튼이 켜지고 선점은 꺼진다. 넘기기는 준비 중이라 꺼져 있다(D2 보류).
    await selectVersion(page, "1.000");
    for (const b of ["ver-delete", "ver-unlock", "ver-confirm-move", "ver-item-edit"]) {
      await expect(tid(page, b), b).toBeEnabled();
    }
    await expect(tid(page, "ver-lock")).toBeDisabled();
    await expect(tid(page, "ver-handover")).toBeDisabled();
    // [카테고리 편집]은 [코드 편집] 하나로 합쳐 없어졌다(D-101).
    await expect(tid(page, "ver-cate-edit")).toHaveCount(0);
    await layout(page, "codeMng 상세 버전 선택");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-03 수정(U) — 이름·설명·라벨을 고쳐 저장하면 목록 행으로 다시 열어도 남는다", async () => {
    await tid(page, "header-name").fill(NAME2);
    await tid(page, "header-desc").fill("열연·냉연 강종 분류(E2E)");
    await tid(page, "header-lvl").selectOption("2");
    await tid(page, "label-attr01").fill("규격");
    await tid(page, "label-attr02").fill("강종");
    await tid(page, "header-save").click();
    await expectToast(page, "저장했습니다");
    // 저장하면 목록도 다시 읽어 새 이름이 보인다.
    await expect(codeListRow(page, CODE)).toHaveCount(1, { timeout: 20_000 });
    await expectListCell(page, CODE, "maruCodeName", NAME2);

    await openCode(page, CODE);
    await expect(tid(page, "header-name")).toHaveValue(NAME2);
    await expect(tid(page, "header-desc")).toHaveValue("열연·냉연 강종 분류(E2E)");
    await expect(tid(page, "label-attr01")).toHaveValue("규격");
    await expect(tid(page, "label-attr02")).toHaveValue("강종");
    await expect(tid(page, "label-attr03")).toHaveValue("");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-04 이름을 비우고 저장하면 이름 규칙 문구가 보이고 값은 바뀌지 않는다", async () => {
    await tid(page, "header-name").fill("");
    await tid(page, "header-save").click();
    await expectErrorModal(page, "이름은 1~100자여야 합니다", "dmc-codeMng-detail-04-name-required");
    // 같은 행을 다시 골라 다시 읽어도 저장하지 않은 입력(빈 이름)은 남는다(a4f0e79d — ruleMng 과 같은 규칙).
    await openCode(page, CODE);
    await expect(tid(page, "header-name")).toHaveValue("");
    // 거부된 값은 저장되지 않았다 — 화면을 닫고 메뉴로 다시 열면 서버 값(NAME2)이 보인다.
    await closeScreenTab(page, "마루 코드");
    await go(page, "codeMng");
    await openCode(page, CODE);
    await expect(tid(page, "header-name")).toHaveValue(NAME2, { timeout: 20_000 });
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-05 해제하면 선점 가능이 되고, 다시 선점하면 편집 중(나)로 돌아온다", async () => {
    await selectVersion(page, "1.000");
    await tid(page, "ver-unlock").click();
    await expectToast(page, "해제했습니다");
    await expect(versionRow(page, "1.000")).toContainText("선점 가능");
    await expect(tid(page, "ver-lock")).toBeEnabled();
    for (const b of ["ver-delete", "ver-unlock", "ver-handover", "ver-confirm-move"]) {
      await expect(tid(page, b), b).toBeDisabled();
    }
    // [코드 편집]은 버전을 고르면 소유와 무관하게 켜진다(D-101 — 편집 가능 여부는 코드 편집 화면이 판단).
    await expect(tid(page, "ver-item-edit")).toBeEnabled();
    await snap(page, "dmc-codeMng-detail-05-unlocked");

    await tid(page, "ver-lock").click();
    await expectToast(page, "선점했습니다");
    await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
    await expect(tid(page, "ver-unlock")).toBeEnabled();
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-06 두 사용자 — 남이 잡은 DRAFT 는 잠김으로 보이고, 풀면 선점을 넘겨받는다", async ({ browser }, testInfo) => {
    const other = await openAs(browser, "stw2", testInfo);
    const p2 = other.page;
    try {
      await go(p2, "codeMng");
      await openCode(p2, CODE);
      await expect(versionRow(p2, "1.000")).toContainText(`잠김 · ${STW} 편집 중`);
      await selectVersion(p2, "1.000");
      for (const b of ["ver-lock", "ver-unlock", "ver-delete", "ver-handover", "ver-confirm-move"]) {
        await expect(tid(p2, b), `${b}(stw2)`).toBeDisabled();
      }
      await snap(p2, "dmc-codeMng-detail-06-locked-by-other");

      // stw 가 해제 → stw2 가 다시 열어 선점
      await selectVersion(page, "1.000");
      await tid(page, "ver-unlock").click();
      await expectToast(page, "해제했습니다");
      await openCode(p2, CODE);
      await expect(versionRow(p2, "1.000")).toContainText("선점 가능", { timeout: 20_000 });
      await selectVersion(p2, "1.000");
      await tid(p2, "ver-lock").click();
      await expectToast(p2, "선점했습니다");
      await expect(versionRow(p2, "1.000")).toContainText("편집 중(나)");

      // stw 화면에서는 stw2 가 편집 중으로 보이고 선점·확정 이동을 할 수 없다.
      await openCode(page, CODE);
      await expect(versionRow(page, "1.000")).toContainText(`잠김 · ${STW2} 편집 중`, { timeout: 20_000 });
      await selectVersion(page, "1.000");
      await expect(tid(page, "ver-lock")).toBeDisabled();
      await expect(tid(page, "ver-confirm-move")).toBeDisabled();

      // stw2 가 해제하고 stw 가 다시 선점한다.
      await tid(p2, "ver-unlock").click();
      await expectToast(p2, "해제했습니다");
      await openCode(page, CODE);
      await expect(versionRow(page, "1.000")).toContainText("선점 가능", { timeout: 20_000 });
      await selectVersion(page, "1.000");
      await tid(page, "ver-lock").click();
      await expectToast(page, "선점했습니다");
      await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
      other.watcher.assertClean("codeMng(stw2)");
    } finally {
      await p2.context().close();
    }
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-07 두 사용자 — 남이 먼저 헤더를 저장했으면 충돌 문구가 보이고 닫으면 최신 값으로 다시 불러온다", async ({ browser }, testInfo) => {
    const other = await openAs(browser, "stw2", testInfo);
    const p2 = other.page;
    try {
      await go(p2, "codeMng");
      await openCode(p2, CODE);
      await tid(p2, "header-name").fill(`${NAME2} (stw2)`);
      await tid(p2, "header-save").click();
      await expectToast(p2, "저장했습니다");
      other.watcher.assertClean("codeMng(stw2)");
    } finally {
      await p2.context().close();
    }

    // stw 화면은 옛 값을 들고 있다.
    await expect(tid(page, "header-name")).toHaveValue(NAME2);
    await tid(page, "header-desc").fill("stw 가 늦게 고친 설명");
    await tid(page, "header-save").click();
    await expectErrorModal(page, "다른 사용자가 수정했습니다", "dmc-codeMng-detail-07-conflict");
    await expect(tid(page, "header-name")).toHaveValue(`${NAME2} (stw2)`, { timeout: 20_000 });
    await expect(tid(page, "header-desc")).toHaveValue("열연·냉연 강종 분류(E2E)");

    // 최신 값 위에서 다시 고친다.
    await tid(page, "header-name").fill(NAME2);
    await tid(page, "header-save").click();
    await expectToast(page, "저장했습니다");
    await expect(tid(page, "header-name")).toHaveValue(NAME2);
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-08 넘기기(보류, D2) — 내 DRAFT 여도 [넘기기(준비 중)]가 꺼져 있고, 올려 보면 이유를 알린다", async () => {
    await selectVersion(page, "1.000");
    await expect(tid(page, "ver-handover")).toHaveText("넘기기(준비 중)");
    await expect(tid(page, "ver-handover")).toBeDisabled();
    await expect(tid(page, "ver-handover-wrap")).toHaveAttribute("title", HANDOVER_PENDING);
    await tid(page, "ver-handover-wrap").hover();
    await expect(modal(page)).toHaveCount(0);
    await snap(page, "dmc-codeMng-detail-08-handover-pending");
    await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
    watcher.assertClean("codeMng");
  });

  // ─────────── codeItemEdit [코드]·[트리] 탭 — 코드 편집(v1.000) ───────────

  test("TC-DMC-ITM-01 [코드 편집]으로 코드 편집 화면을 열고 마루 코드·버전을 고르면 빈 DRAFT 가 보인다", async () => {
    await selectVersion(page, "1.000");
    await tid(page, "ver-item-edit").click();
    await expect(footerScreenId(page)).toHaveText("codeItemEdit", { timeout: 60_000 });
    await waitIdle(page);
    // 여기부터 카테고리 탭(TC-DMC-CAT-05)까지 한 화면이라 버튼 커버리지를 한 번에 센다.
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터코드 > 코드 편집");
    // [코드 편집]은 마루 코드·버전을 넘겨 이 화면이 그 코드를 연다(화면 인계는 TC-DMC-LNK-01 에서 따로 본다). 인계가 끝나 위 칸이
    // 그 코드를 보인 뒤 사용자가 [찾기]로 다시 고른다 — IdPicker 는 인계 때 아직 오지 않은 찾기는 살리지만 이미 열린 찾기 목록은
    // 닫는다(3ee724b4, Local-Rules §34 설계). 여기서는 칸에 넣고 [찾기] 로 찾는다 — Enter 로 찾는 길은 pickCode 가 쓴다.
    await expect(tid(page, "code-current")).toContainText(CODE, { timeout: 20_000 });
    await expect(tid(page, "code-pick-keyword")).toHaveValue(CODE);
    await waitIdle(page);
    await tid(page, "code-pick-keyword").fill(CODE);
    await screen(page).getByRole("button", { name: "찾기", exact: true }).click();
    await tid(page, `code-pick-${CODE}`).click({ timeout: 20_000 });
    await waitIdle(page);
    await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
    await expect(tid(page, "code-ver-select").locator("option:checked")).toHaveText("v1.000 DRAFT");
    await expect(tid(page, "code-grid-empty")).toHaveText("보일 코드가 없습니다");
    await expect(screen(page).getByText(`편집 가능 · 소유자 ${STW}`)).toBeVisible();
    await rowVersion(page, "code-row-version");
    // 왼쪽 [코드]·[트리], 오른쪽 [카테고리 편집]·[코드 테스트] 탭이 있다(D-101, ade3851f 로 카테고리는 오른쪽 탭).
    for (const t of ["code-tab-grid", "code-tab-tree", "code-right-tab-cate", "code-right-tab-test"]) await expect(tid(page, t), t).toBeVisible();
    // lvl_cnt 2·라벨 규격·강종이 열로 보인다.
    const headers = codeGrid(page).locator(".ag-header-cell-text");
    for (const h of ["코드", "이름", "약칭", "순서", "1차", "2차", "규격", "강종"]) {
      await expect(headers.filter({ hasText: new RegExp(`^${h}$`) })).toHaveCount(1);
    }
    await expect(headers.filter({ hasText: /^3차$/ })).toHaveCount(0);
    await layout(page, "codeItemEdit");
    await snap(page, "dmc-codeItemEdit-01-initial");
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-ITM-02 변경이 없으면 [저장]이 꺼져 있고, 콤마·공백 코드는 알아듣기 쉬운 문구로 막히고 행에 이슈가 보인다", async () => {
    const before = await rowVersion(page, "code-row-version");
    await expect(button(page, "저장")).toBeDisabled();

    await addCodeRow(page, { code: "A B", name: "공백 코드" });
    await expect(button(page, "저장")).toBeEnabled();
    await button(page, "저장").click();
    await expectErrorModal(page, "코드 저장 검사를 통과하지 못했습니다", "dmc-codeItemEdit-02-rejected");
    await expect(tid(page, "code-row-issue-A B")).toContainText("콤마·공백", { timeout: 20_000 });
    await layout(page, "codeItemEdit 오류 행");
    // 화면에서만 넣은 행은 [취소]로 뺀다.
    await codeRow(page, "A B").getByRole("button", { name: "취소" }).click();
    await expect(codeRow(page, "A B")).toHaveCount(0);
    // 거부된 저장은 아무것도 바꾸지 않았다.
    expect(await rowVersion(page, "code-row-version")).toBe(before);
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-ITM-03 등록(C) — 코드값·이름·약칭·순서·계층·추가 컬럼을 넣고 저장한다", async () => {
    const before = await rowVersion(page, "code-row-version");
    // 새 행의 순서(seq) 입력은 TC-DMC-ITM-09 에서 따로 본다 — 여정에서는 경미 수정(TC-DMC-ITM-08)에서 넣는다.
    await addCodeRow(page, {
      code: "HR01", name: "열연 1호", alterName: "HR1", lvl1: "HR", attr01: "KS", attr02: "SS400", description: "E2E 열연",
    });
    await addCodeRow(page, { code: "HR02", name: "열연 2호", lvl1: "HR", attr01: "JIS" });
    await addCodeRow(page, { code: "CR01", name: "냉연 1호", lvl1: "CR", lvl2: "CRA" });
    await addCodeRow(page, { code: "TMP1", name: "임시" });
    await expect(codeGrid(page).locator(".grid-panel-count").first()).toHaveText("4건");
    await snap(page, "dmc-codeItemEdit-03-editing");
    await layout(page, "codeItemEdit 편집 중");

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await expectRowVersionAbove(page, "code-row-version", before);
    for (const c of ["HR01", "HR02", "CR01", "TMP1"]) {
      await expect(codeRow(page, c), c).toHaveCount(1);
      await expect(cellOf(codeRow(page, c), "__change")).toContainText("추가");
    }
    const hr01 = codeRow(page, "HR01");
    await expect(cellOf(hr01, "name")).toHaveText("열연 1호");
    await expect(cellOf(hr01, "alterName")).toHaveText("HR1");
    await expect(cellOf(hr01, "lvl1")).toHaveText("HR");
    await revealColumn(codeGrid(page), hr01, "attr02");
    await expect(cellOf(hr01, "attr02")).toHaveText("SS400");
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-ITM-04 조회(R) — [트리] 탭·노드 거르기·닫힌 코드·카테고리 미리보기로 방금 넣은 코드를 본다", async () => {
    // 트리
    await openTab(page, "tree");
    const tree = tid(page, "code-tree");
    const roots = tree.locator('[role="treeitem"][data-level="1"] > .tree-item .tree-item__label');
    await expect(roots).toHaveText(["· TMP1 임시", "CR (1건)", "HR (2건)"], { timeout: 20_000 });
    await expect(tree.getByText("· HR01 열연 1호")).toBeVisible();
    await screen(page).getByRole("button", { name: "모두 접기" }).click();
    await expect(tree.getByText("· HR01 열연 1호")).toBeHidden();
    await screen(page).getByRole("button", { name: "모두 펴기" }).click();
    await expect(tree.getByText("· HR01 열연 1호")).toBeVisible();
    await expect(tid(page, "code-tree-to-grid")).toBeDisabled();
    await tree.locator(".tree-item").filter({ hasText: /^HR \(2건\)$/ }).click();
    await expect(tid(page, "code-tree-to-grid")).toBeEnabled();
    await layout(page, "codeItemEdit 트리");
    await snap(page, "dmc-codeItemEdit-04-tree");
    await tid(page, "code-tree-to-grid").click();

    // 거르기 — [이 노드로 편집]은 [코드] 탭으로 돌아온다.
    await expect(codeGrid(page)).toBeVisible();
    await expect(tid(page, "code-filter-chip")).toContainText("HR 아래");
    await expect(gridRows(codeGrid(page))).toHaveCount(2);
    // 거르는 중에 추가하면 계층 칸이 그 노드 경로로 채워진다 — 확인만 하고 취소한다.
    await tid(page, "code-add").click();
    await expect(cellOf(newRow(codeGrid(page)), "lvl1")).toHaveText("HR");
    await newRow(codeGrid(page)).getByRole("button", { name: "취소" }).click();
    await expect(gridRows(codeGrid(page))).toHaveCount(2);
    await tid(page, "code-filter-clear").click();
    await expect(tid(page, "code-filter-chip")).toHaveCount(0);
    await expect(gridRows(codeGrid(page))).toHaveCount(4);

    // 닫힌 코드 보기 — v1.000 은 닫힌 행이 없어 그대로다.
    await tid(page, "code-closed-toggle").getByText("닫힌 코드 보기").click();
    await expect(tid(page, "code-closed-toggle").locator("input")).toBeChecked();
    await expect(gridRows(codeGrid(page))).toHaveCount(4);
    await tid(page, "code-closed-toggle").getByText("닫힌 코드 보기").click();
    await expect(tid(page, "code-closed-toggle").locator("input")).not.toBeChecked();

    // 카테고리 미리보기 — 오른쪽 [코드 테스트] 탭이다(ade3851f). BASE 는 모든 코드가 해당한다.
    await openTab(page, "test");
    await expect(tid(page, "code-preview-cate")).toHaveValue("BASE");
    await expect(tid(page, "code-preview-title")).toContainText(`CODE_LIST("${CODE}", "BASE") · v1.000 · 4 / 4건 해당`);
    await choose(page, "code-preview-step-0", "HR");
    await expect(tid(page, "code-preview-step-1").locator("option")).toContainText(["HR01 (코드, 열연 1호)", "HR02 (코드, 열연 2호)"]);
    await tid(page, "code-preview-mode").getByText("목록·근거").click();
    const previewGrid = tid(page, "code-preview");
    await expect(gridRows(previewGrid)).toHaveCount(4, { timeout: 20_000 });
    await expect(gridRow(previewGrid, "CR01", "code").locator('.ag-cell[col-id="path"]')).toHaveText("CR > CRA");
    await snap(page, "dmc-codeItemEdit-04-preview-list");
    await tid(page, "code-preview-mode").getByText("콤보").click();
    await expect(tid(page, "code-preview-step-0")).toBeVisible();

    // 조회 버튼으로 다시 읽어도 같다.
    await button(page, "조회").click();
    await expect(gridRows(codeGrid(page))).toHaveCount(4, { timeout: 20_000 });
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-ITM-05 수정(U) — 저장된 행의 이름·약칭을 고쳐 저장하면 조회 뒤에도 남는다", async () => {
    const grid = codeGrid(page);
    const before = await rowVersion(page, "code-row-version");
    // 저장된 행을 고친 뒤 [취소]로 되돌리는 흐름은 TC-DMC-ITM-10 에서 따로 본다.
    await editCell(grid, codeRow(page, "HR02"), "name", "열연 2호 고급");
    await editCell(grid, codeRow(page, "HR02"), "alterName", "HR2");
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await button(page, "조회").click();
    await expect(cellOf(codeRow(page, "HR02"), "name")).toHaveText("열연 2호 고급", { timeout: 20_000 });
    await expect(cellOf(codeRow(page, "HR02"), "alterName")).toHaveText("HR2");
    await expectRowVersionAbove(page, "code-row-version", before);
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-ITM-06 삭제(D) — DRAFT 에서 추가한 행을 [되돌리기]하면 사라진다", async () => {
    await codeRow(page, "TMP1").getByRole("button", { name: "되돌리기" }).click();
    await expectToast(page, "되돌렸습니다");
    await expect(codeRow(page, "TMP1")).toHaveCount(0, { timeout: 20_000 });
    await expect(gridRows(codeGrid(page))).toHaveCount(3);
    // 탭 버튼으로 [트리] 탭에 갔다가 [코드] 탭으로 돌아오고, 오른쪽은 [코드 테스트] → [카테고리 편집] 으로 둔다.
    await openTab(page, "tree");
    await openTab(page, "grid");
    await openTab(page, "test");
    await openTab(page, "cate");
    // 오른쪽 [카테고리 편집] 탭은 코드 탭과 나란히 늘 보인다(ade3851f) — 그 안의 버튼은 이어지는 카테고리 장에서 누른다.
    await assertAllButtonsPressed(page, "codeItemEdit [코드] 탭", {
      "cate-add": "카테고리 추가는 TC-DMC-CAT-02 에서 누른다",
    });
    watcher.assertClean("codeItemEdit");
  });

  // ─────────── codeItemEdit [카테고리] 탭 — 카테고리 편집(v1.000, 옛 codeCateEdit) ───────────

  test("TC-DMC-CAT-01 [카테고리] 탭을 열면 위의 마루 코드·버전 그대로 BASE 만 있다", async () => {
    await openTab(page, "cate");
    // 카테고리 탭은 자체 마루 코드·버전 Select 없이 화면 위의 것을 쓴다.
    await expect(tid(page, "code-current")).toContainText(CODE);
    await expect(tid(page, "code-ver-select")).toHaveValue("1.000");
    await expect(tid(page, "cate-tab")).toContainText("카테고리·소속 변경은 코드 변경과 함께 상단 [저장] 한 번으로 저장합니다");
    await expect(tid(page, "cate-row-BASE")).toBeVisible();
    await expect(cateRows(page)).toHaveCount(1);
    await rowVersion(page, "cate-row-version");
    // BASE 는 편집·닫기를 할 수 없다.
    await selectCate(page, "BASE");
    await expect(cateList(page).getByTestId("cate-close-BASE")).toHaveCount(0);
    await expect(cateList(page).getByTestId("cate-edit-BASE")).toHaveCount(0);
    await expect(tid(page, "cate-base-readonly")).toHaveText("BASE 는 예약 카테고리라 편집·닫기를 할 수 없습니다");
    // 변경이 없으니 머리 [저장]은 꺼져 있다.
    await expect(button(page, "저장")).toBeDisabled();
    await layout(page, "codeItemEdit 카테고리 탭");
    await snap(page, "dmc-codeItemEdit-cate-01-initial");
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-CAT-02 등록(C) — TABLE·REGEX 카테고리를 추가하고 정규식·대상 칸을 바꾸면 아래 소속 표가 서버 해석을 따라 바뀐다", async () => {
    const before = await rowVersion(page, "cate-row-version");
    // 빈 ID·이름으로는 추가되지 않는다 — 팝업 칸 아래에 무엇이 빠졌는지 알린다.
    await tid(page, "cate-add").click();
    await tid(page, "cate-add-submit").click();
    await expect(modal(page)).toContainText("카테고리 ID를 입력하세요");
    await expect(modal(page)).toContainText("카테고리 이름을 입력하세요");
    await tid(page, "cate-add-cancel").click();
    await expect(page.getByTestId("cate-add-id")).toHaveCount(0);
    await expect(cateRows(page)).toHaveCount(1);

    // TABLE — 저장 전 새 행은 [취소] 가 보이고, TABLE 이라 [편집](소속 팝업)이 있다.
    await addCategory(page, "TBL_HR", "열연 묶음", "TABLE");
    await expect(tid(page, "cate-undo-TBL_HR")).toBeVisible();
    await expect(tid(page, "cate-edit-TBL_HR")).toBeVisible();
    // 카테고리만 바꿔도 머리 [저장]이 켜진다.
    await expect(button(page, "저장")).toBeEnabled();

    // REGEX — 처음 식은 ".*"·대상 칸 "코드"(CategoryAddModal). 고르면 아래 소속 표에 맞는 코드가 보인다(서버 compare).
    await addCategory(page, "RGX_CR", "냉연 식", "REGEX");
    await expect(tid(page, "cate-undo-RGX_CR")).toBeVisible();
    await expect(cateCell(page, "RGX_CR", "cateName")).toHaveText("냉연 식");
    await expect(cateCell(page, "RGX_CR", "defExpr")).toHaveText(".*");
    await expect(cateCell(page, "RGX_CR", "defTarget")).toHaveText("코드");
    await selectCate(page, "RGX_CR");
    const members = memberPanel(page);
    await expect(members.locator(".grid-panel-count")).toHaveText("3건", { timeout: 20_000 });

    await editCateText(page, "RGX_CR", "defExpr", "CR.*");
    await expect(members.locator(".grid-panel-count")).toHaveText("1건", { timeout: 20_000 });
    await editCateSelect(page, "RGX_CR", "defTarget", "LVL1", "1차");
    await editCateText(page, "RGX_CR", "defExpr", "HR");
    await expect(members.locator(".grid-panel-count")).toHaveText("2건", { timeout: 20_000 });
    await editCateText(page, "RGX_CR", "defExpr", "CR");
    await expect(members.locator(".grid-panel-count")).toHaveText("1건", { timeout: 20_000 });
    await expect(gridRow(members, "CR01", "code")).toHaveCount(1);
    await layout(page, "codeItemEdit 카테고리 REGEX 편집");
    await snap(page, "dmc-codeItemEdit-cate-02-regex");

    // 빈 TABLE 카테고리 하나를 남겨 확정 검사 2-2 경고를 받는다(TC-DMC-CNF-04).
    await addCategory(page, "TMP_EMPTY", "빈 묶음", "TABLE");

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    // 저장하면 새 행 표시([취소])가 없어지고 [닫기] 가 선다.
    for (const c of ["TBL_HR", "RGX_CR", "TMP_EMPTY"]) {
      await expect(tid(page, `cate-row-${c}`), c).toBeVisible({ timeout: 20_000 });
      await expect(tid(page, `cate-undo-${c}`), c).toHaveCount(0);
      await expect(tid(page, `cate-close-${c}`), c).toBeVisible();
    }
    await expectRowVersionAbove(page, "cate-row-version", before);
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-CAT-03 TABLE 소속 — 검색·1차 필터·전체선택·Shift 범위·>·>>·<·<< 로 옮기고 머리 [저장]으로 저장한다", async () => {
    // TABLE 소속은 행의 [편집] 팝업(transfer-list)에서 고친다(ade3851f).
    await openTransfer(page, "TBL_HR");
    const avail = tid(page, "cate-transfer-available");
    const member = tid(page, "cate-transfer-member");
    const item = (side: string, code: string) => tid(page, `cate-transfer-item-${side}-${code}`);
    await expect(avail).toContainText("가능 3건");
    await expect(member).toContainText("소속 0건");
    await expect(tid(page, "cate-transfer-move-right")).toBeDisabled();
    await expect(tid(page, "cate-transfer-move-left")).toBeDisabled();

    // 검색 "HR" → 전체선택 → >
    await tid(page, "cate-transfer-search").fill("HR");
    await expect(avail).toContainText("가능 2건");
    await avail.locator('input[type="checkbox"]').first().check();
    await expect(tid(page, "cate-transfer-move-right")).toBeEnabled();
    await tid(page, "cate-transfer-move-right").click();
    await expect(item("member", "HR01")).toBeVisible();
    await expect(item("member", "HR02")).toBeVisible();
    await tid(page, "cate-transfer-search").fill("");

    // 1차 필터 CR → >> 는 보이는 것(CR01)만 옮기고, << 는 보이는 소속(CR01)만 뺀다.
    await choose(page, "cate-transfer-lvl1", "CR");
    await tid(page, "cate-transfer-move-right-all").click();
    await expect(item("member", "CR01")).toBeVisible();
    await tid(page, "cate-transfer-move-left-all").click();
    await expect(item("available", "CR01")).toBeVisible();
    await tid(page, "cate-transfer-lvl1").selectOption("");
    await expect(member).toContainText("소속 2건");

    // 소속 HR02 하나를 < 로 빼고, 가능 쪽 CR01~HR02 를 Shift 로 한꺼번에 골라 > 로 옮긴다.
    await item("member", "HR02").click();
    await tid(page, "cate-transfer-move-left").click();
    await expect(item("available", "HR02")).toBeVisible();
    await item("available", "CR01").click();
    await item("available", "HR02").click({ modifiers: ["Shift"] });
    await tid(page, "cate-transfer-move-right").click();
    await expect(member).toContainText("소속 3건");
    // CR01 은 다시 뺀다 → 소속 HR01·HR02
    await item("member", "CR01").click();
    await tid(page, "cate-transfer-move-left").click();
    await expect(member).toContainText("소속 2건");
    await snap(page, "dmc-codeItemEdit-cate-03-transfer");
    await closeTransfer(page);
    // 팝업을 닫아도 소속 변경은 남아 아래 소속 표에 보인다(저장 전).
    await expect(memberPanel(page).locator(".grid-panel-count")).toHaveText("2건");
    await layout(page, "codeItemEdit 카테고리 TABLE 소속");

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await button(page, "조회").click();
    await waitIdle(page);
    await expect(tid(page, "cate-tab")).toBeVisible();
    await openTransfer(page, "TBL_HR");
    await expect(item("member", "HR01")).toBeVisible({ timeout: 20_000 });
    await expect(item("member", "HR02")).toBeVisible();
    await expect(item("available", "CR01")).toBeVisible();
    await closeTransfer(page);
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-CAT-04 수정(U) — 틀린 정규식은 저장에서 막혀 그 행에 이슈가 보이고, [취소]로 되돌린 뒤 이름만 고쳐 저장한다", async () => {
    await selectCate(page, "RGX_CR");
    await expect(cateCell(page, "RGX_CR", "defExpr")).toHaveText("CR");
    await editCateText(page, "RGX_CR", "cateName", "냉연 식 수정");
    await editCateText(page, "RGX_CR", "defExpr", "(");
    // 저장 전 변경은 [닫기] 대신 [취소] 로 보인다.
    await expect(tid(page, "cate-undo-RGX_CR")).toBeVisible();
    await expect(cateList(page).getByTestId("cate-close-RGX_CR")).toHaveCount(0);
    await button(page, "저장").click();
    await expectErrorModal(page, "코드 저장 검사를 통과하지 못했습니다", "dmc-codeItemEdit-cate-04-bad-regex");
    await expect(tid(page, "cate-row-issue-RGX_CR")).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "code-right-tab-cate-issue")).toBeVisible();

    await tid(page, "cate-undo-RGX_CR").click();
    await expect(cateCell(page, "RGX_CR", "defExpr")).toHaveText("CR");
    await expect.poll(() => cateCellText(cateCell(page, "RGX_CR", "cateName"))).toBe("냉연 식");
    await expect(cateList(page).getByTestId("cate-undo-RGX_CR")).toHaveCount(0);

    await editCateText(page, "RGX_CR", "cateName", "냉연 식 수정");
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await button(page, "조회").click();
    await waitIdle(page);
    await expect(cateCell(page, "RGX_CR", "cateName")).toHaveText("냉연 식 수정", { timeout: 20_000 });
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-CAT-05 닫기 — [닫기]로 표시했다 [취소]하면 그대로, 금지 문자 ID 는 저장에서 거부된다", async () => {
    // 닫기 표시 중에는 [닫기] 버튼 대신 [취소]가 보인다.
    await tid(page, "cate-close-TMP_EMPTY").click();
    await expect(cateList(page).getByTestId("cate-close-TMP_EMPTY")).toHaveCount(0);
    await expect(tid(page, "cate-undo-TMP_EMPTY")).toBeVisible();
    await tid(page, "cate-undo-TMP_EMPTY").click();
    await expect(cateList(page).getByTestId("cate-undo-TMP_EMPTY")).toHaveCount(0);
    await expect(tid(page, "cate-close-TMP_EMPTY")).toBeVisible();
    // REGEX·TABLE 카테고리도 같은 방식으로 닫았다가 되돌릴 수 있다(저장하지 않는다).
    for (const c of ["RGX_CR", "TBL_HR"]) {
      await tid(page, `cate-close-${c}`).click();
      await expect(tid(page, `cate-undo-${c}`), c).toBeVisible();
      await tid(page, `cate-undo-${c}`).click();
      await expect(tid(page, `cate-close-${c}`), c).toBeVisible();
    }

    await addCategory(page, "BAD ID", "공백 ID", "TABLE");
    await button(page, "저장").click();
    await expectErrorModal(page, "코드 저장 검사를 통과하지 못했습니다", "dmc-codeItemEdit-cate-05-bad-id");
    await tid(page, "cate-undo-BAD ID").click();
    await expect(cateList(page).getByTestId("cate-row-BAD ID")).toHaveCount(0);
    await assertAllButtonsPressed(page, "codeItemEdit [카테고리] 탭");
    watcher.assertClean("codeItemEdit");
  });

  // ─────────── codeConfirm — 버전 확정(v1.000) ───────────

  test("TC-DMC-CNF-01 [확정 이동]으로 버전 확정 화면이 그 DRAFT 로 열린다", async () => {
    await go(page, "codeMng");
    await openCode(page, CODE);
    await selectVersion(page, "1.000");
    await tid(page, "ver-confirm-move").click();
    await expect(footerScreenId(page)).toHaveText("codeConfirm", { timeout: 60_000 });
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터코드 > 버전 확정");
    await expect(tid(page, "cf-target")).toHaveText(`${CODE} v1.000 MAJOR`, { timeout: 20_000 });
    await expect(tid(page, "cf-form")).toContainText("편집 중(나)");
    await expect(tid(page, "cf-previous")).toHaveText("최초 버전 — 적용 순서 검사를 하지 않습니다");
    // 직전 RELEASED 가 없으니 모든 행이 추가로 보인다.
    for (const c of ["HR01", "HR02", "CR01"]) await expect(tid(page, "cf-diff")).toContainText(c);
    await expect(tid(page, "cf-cate-summary")).toContainText("TBL_HR");
    await layout(page, "codeConfirm");
    await snap(page, "dmc-codeConfirm-01-initial");
    watcher.assertClean("codeConfirm");
  });

  test("TC-DMC-CNF-02 조회(R) — 확정 대기 목록을 검색어로 좁히고 풀어 본다", async () => {
    await tid(page, "cf-keyword").fill(CODE);
    await tid(page, "cf-search").click();
    await expect(cfRow(page, CODE, "1.000")).toBeVisible({ timeout: 20_000 });
    await expect(cfRow(page, CODE, "1.000")).toContainText(NAME2);
    await expect(cfRow(page, CODE, "1.000")).toContainText(STW);
    await tid(page, "cf-keyword").fill(`${CODE}_NONE`);
    await tid(page, "cf-search").click();
    await expect(tid(page, "cf-list-empty")).toHaveText("확정할 DRAFT 가 없습니다", { timeout: 20_000 });
    await tid(page, "cf-keyword").fill(CODE);
    await tid(page, "cf-search").click();
    await cfRow(page, CODE, "1.000").click();
    await expect(cfRow(page, CODE, "1.000")).toHaveClass(/ag-row-highlighted/);
    watcher.assertClean("codeConfirm");
  });

  test("TC-DMC-CNF-03 검사 — 일시 없이 검사하면 안내, 검사 뒤 일시를 바꾸면 확정이 꺼지고 다시 검사해야 켜진다", async () => {
    await expect(tid(page, "cf-confirm")).toBeDisabled();
    await tid(page, "cf-validate").click();
    await expect(tid(page, "cf-error")).toHaveText("적용 시작 일시를 입력하세요");

    await fillDateTime(tid(page, "cf-apply-from"), CONFIRM1.input);
    await tid(page, "cf-validate").click();
    await expect(tid(page, "cf-checks")).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "cf-check-status-3")).toHaveText("면제");
    await expect(tid(page, "cf-check-status-4")).toHaveText("면제");
    await expect(tid(page, "cf-check-status-2-2")).toHaveText("경고");
    await expect(cfCheckRow(page, "2-2")).toContainText("TMP_EMPTY");
    await expect(tid(page, "cf-check-status-1")).toHaveText("통과");
    await expect(tid(page, "cf-confirm")).toBeEnabled();

    await fillDateTime(tid(page, "cf-apply-from"), CONFIRM1B.input);
    await expect(tid(page, "cf-confirm")).toBeDisabled();
    await tid(page, "cf-validate").click();
    await expect(tid(page, "cf-confirm")).toBeEnabled({ timeout: 20_000 });
    await layout(page, "codeConfirm 검사 결과");
    await snap(page, "dmc-codeConfirm-03-checked");
    watcher.assertClean("codeConfirm");
  });

  test("TC-DMC-CNF-04 확정 — 대화상자 [취소]는 아무것도 바꾸지 않고, 경고 확인 뒤 [확인]하면 RELEASED 가 된다", async () => {
    await tid(page, "cf-confirm").click();
    const m = modal(page);
    await expect(m).toContainText("버전 확정");
    await expect(m).toContainText(`${CODE} v1.000 을(를) ${CONFIRM1B.date} 00:00:00 부터 적용하도록 확정합니다.`);
    await expect(tid(page, "cf-modal-warnings")).toContainText("TMP_EMPTY");
    await expect(tid(page, "cf-future-warning")).toHaveCount(0);
    await expect(tid(page, "cf-modal-ok")).toBeDisabled();
    await snapModal(page, "dmc-codeConfirm-04-modal");
    await m.getByRole("button", { name: "취소", exact: true }).click();
    await expect(m).toBeHidden();
    await expect(tid(page, "cf-form").locator('.mdm-status-badge[data-status="DRAFT"]')).toBeVisible();

    await tid(page, "cf-confirm").click();
    await tid(page, "cf-ack").getByText("경고를 확인했습니다").click();
    await expect(tid(page, "cf-modal-ok")).toBeEnabled();
    await tid(page, "cf-modal-ok").click();
    await expectToast(page, "확정했습니다");
    await expect(tid(page, "cf-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "cf-released")).toContainText(`적용 구간 ${CONFIRM1B.date} 00:00:00 ~ 9999-12-31`);
    await expect(tid(page, "cf-released")).toContainText(`확정자 ${STW}`);
    await expect(tid(page, "cf-validate")).toBeDisabled();
    await expect(tid(page, "cf-confirm")).toBeDisabled();
    await expect(cfRow(page, CODE, "1.000")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
    await layout(page, "codeConfirm 확정 뒤");
    await snap(page, "dmc-codeConfirm-04-released");
    await assertAllButtonsPressed(page, "codeConfirm");
    watcher.assertClean("codeConfirm");
  });

  test("TC-DMC-MNG-07 확정된 버전 조회 — 목록에 현재 버전 v1.000·상태 INUSE·미적용 없음으로 보인다", async () => {
    await go(page, "codeMng");
    await tid(page, "code-search-keyword").fill(CODE);
    await tid(page, "code-search-status").selectOption("INUSE");
    await button(page, "조회").click();
    const row = codeListRow(page, CODE);
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expectListCell(page, CODE, "maruCodeName", NAME2);
    await expectListCell(page, CODE, "status", "INUSE");
    await expectListCell(page, CODE, "currentVerLabel", "v1.000");
    await expectListCell(page, CODE, "unappliedLabel", "없음");
    await tid(page, "code-search-status").selectOption("CREATED");
    await button(page, "조회").click();
    await expect(tid(page, "code-list-empty")).toBeVisible({ timeout: 20_000 });
    watcher.assertClean("codeMng");
  });

  // ─────────── 새 버전 v1.001 ───────────

  test("TC-DMC-EDT-09 새 버전 — 대화상자에서 종류·내용을 바꿔 보고 [취소], 다시 열어 빈 minor 버전을 만든다", async () => {
    await openCode(page, CODE);
    await expect(tid(page, "header-status")).toHaveText("INUSE");
    // 확정된 적이 있으니 [삭제] 대신 [폐기]가 선다(D-102).
    await expect(tid(page, "header-delete-code")).toHaveCount(0);
    await expect(tid(page, "header-deprecate")).toBeVisible();
    // CR01 이 2차 칸(CRA)을 쓰므로 계층 칸 수를 1 로 줄이면 거부된다.
    await tid(page, "header-lvl").selectOption("1");
    await tid(page, "header-save").click();
    await expectErrorModal(page, "LVL2 에 값이 있는 코드가 있어 계층 칸 수를 1 로 줄일 수 없습니다", "dmc-codeMng-detail-09-lvl-reduce");
    // 같은 행을 다시 골라도 저장하지 않은 입력(1)은 남는다(a4f0e79d). 거부된 값은 저장되지 않았다 — 화면을 닫고 다시 열면 2 다.
    await openCode(page, CODE);
    await expect(tid(page, "header-lvl")).toHaveValue("1");
    await closeScreenTab(page, "마루 코드");
    await go(page, "codeMng");
    await openCode(page, CODE);
    await expect(tid(page, "header-lvl")).toHaveValue("2", { timeout: 20_000 });
    await expect(versionRow(page, "1.000")).toContainText("확정");
    await expect(versionRow(page, "1.000")).toContainText(`${CONFIRM1B.date} 00:00:00`);
    await selectVersion(page, "1.000");
    // 확정 버전을 고르면 [코드 편집] 말고 버전 조작 버튼은 모두 꺼지고, 새 버전·폐기가 켜진다.
    for (const b of ["ver-delete", "ver-lock", "ver-unlock", "ver-handover", "ver-confirm-move"]) {
      await expect(tid(page, b), b).toBeDisabled();
    }
    await expect(tid(page, "ver-item-edit")).toBeEnabled();
    await expect(tid(page, "ver-new-hint")).toHaveCount(0);
    await expect(tid(page, "header-deprecate")).toBeEnabled();
    await expect(tid(page, "ver-new-major")).toBeEnabled();

    await tid(page, "ver-new-minor").click();
    const m = modal(page);
    await expect(m).toContainText("새 버전");
    await expect(tid(page, "newver-number")).toHaveText("v1.001");
    await expect(tid(page, "newver-content-restore-1.000")).toContainText("v1.000 내용으로 채우기(복원)");
    await tid(page, "newver-kind-major").getByText("major").click();
    await expect(tid(page, "newver-number")).toHaveText("v2.000");
    await tid(page, "newver-kind-minor").getByText("minor").click();
    await expect(tid(page, "newver-number")).toHaveText("v1.001");
    await tid(page, "newver-content-restore-1.000").getByText(/복원/).click();
    await tid(page, "newver-content-empty").getByText("빈 버전").click();
    await snapModal(page, "dmc-codeMng-detail-09-newver-modal");
    await m.getByRole("button", { name: "취소", exact: true }).click();
    await expect(m).toBeHidden();
    await expect(versionRow(page, "1.001")).toHaveCount(0);

    await tid(page, "ver-new-minor").click();
    await expect(tid(page, "newver-number")).toHaveText("v1.001");
    await tid(page, "newver-ok").click();
    await expectToast(page, "새 버전을 만들었습니다");
    await expect(versionRow(page, "1.001")).toContainText("MINOR", { timeout: 20_000 });
    await expect(versionRow(page, "1.001")).toContainText("작성 중");
    await expect(versionRow(page, "1.001")).toContainText("편집 중(나)");
    await expect(tid(page, "ver-new-hint")).toContainText("미적용 버전 v1.001 DRAFT");
    await expect(tid(page, "header-deprecate")).toBeDisabled();
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-ITM-07 삭제(D) — 새 버전에서 이어받은 행을 고치고, 카테고리 소속 행을 확인 뒤 삭제해 저장한다", async () => {
    await selectVersion(page, "1.001");
    await tid(page, "ver-item-edit").click();
    await expect(footerScreenId(page)).toHaveText("codeItemEdit", { timeout: 60_000 });
    await resetClicks(page); // v1.001·RELEASED 구간 커버리지(ITM-08 끝에서 단언)
    await button(page, "조회").click();
    await waitIdle(page);
    await choose(page, "code-ver-select", "1.001");
    await expect(tid(page, "code-ver-select").locator("option:checked")).toHaveText("v1.001 DRAFT");
    await openTab(page, "grid");
    const before = await rowVersion(page, "code-row-version");
    for (const c of ["HR01", "HR02", "CR01"]) {
      await expect(codeRow(page, c), c).toHaveCount(1);
      await expect(codeRow(page, c).getByRole("button", { name: "삭제" })).toBeVisible();
    }

    // 삭제: HR02 는 TBL_HR 소속이라 확인을 묻는다 — [취소]하면 아무 변경도 남지 않아 [저장]이 꺼져 있다.
    await codeRow(page, "HR02").getByRole("button", { name: "삭제" }).click();
    await expect(modal(page)).toContainText("카테고리 1개에서 함께 빠집니다. 삭제할까요?");
    await snapModal(page, "dmc-codeItemEdit-07-delete-confirm");
    await answerConfirm(page, "취소");
    await expect(button(page, "저장")).toBeDisabled();

    // 수정: CR01 이름
    await editCell(codeGrid(page), codeRow(page, "CR01"), "name", "냉연 1호 변경");

    // [확인]이면 삭제로 표시된다.
    await codeRow(page, "HR02").getByRole("button", { name: "삭제" }).click();
    await answerConfirm(page, "확인");
    // 저장 전 "삭제" 배지는 TC-DMC-ITM-11 에서 따로 본다(여정을 멈추지 않게).

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await expectRowVersionAbove(page, "code-row-version", before);
    // 수정 행은 옛 값에 취소선을 긋고 새 값을 보인다.
    await expect(cellOf(codeRow(page, "CR01"), "__change")).toContainText("수정");
    await expect(cellOf(codeRow(page, "CR01"), "name")).toContainText("냉연 1호");
    await expect(cellOf(codeRow(page, "CR01"), "name")).toContainText("냉연 1호 변경");
    await layout(page, "codeItemEdit 새 버전 diff");
    await snap(page, "dmc-codeItemEdit-07-v1001");

    // 닫힌 코드 보기로 지운 행을 흐리게 본다.
    await tid(page, "code-closed-toggle").getByText("닫힌 코드 보기").click();
    await expect(codeGrid(page).locator(".code-item-edit__row--closed")).toContainText("HR02", { timeout: 20_000 });
    await tid(page, "code-closed-toggle").getByText("닫힌 코드 보기").click();
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-ITM-08 확정 버전 경미 수정 — 이름·약칭·순서·설명만 고치고, 새 버전이 고친 행은 막힌다", async () => {
    await choose(page, "code-ver-select", "1.000");
    await expect(screen(page).getByText("읽기 전용 · diff 보기")).toBeVisible();
    await expect(button(page, "저장")).toHaveCount(0);
    await expect(tid(page, "code-add")).toHaveCount(0);
    await expect(tid(page, "patch-panel")).toContainText("그리드에서 고칠 행을 고르세요.");

    await cellOf(codeRow(page, "HR01"), "code").click();
    await expect(tid(page, "patch-code")).toHaveValue("HR01");
    await expect(tid(page, "patch-code")).toBeDisabled();
    await expect(tid(page, "patch-lvl1")).toHaveValue("HR");
    await expect(tid(page, "patch-lvl1")).toBeDisabled();
    await expect(tid(page, "patch-attr01")).toHaveValue("KS");
    await expect(tid(page, "patch-attr01")).toBeDisabled();
    await tid(page, "patch-name").fill("열연 1호 경미");
    await tid(page, "patch-alter-name").fill("HR-1");
    await tid(page, "patch-seq").fill("5");
    await tid(page, "patch-description").fill("경미 수정(E2E)");
    await layout(page, "codeItemEdit 경미 수정");
    await snap(page, "dmc-codeItemEdit-08-patch");
    await tid(page, "patch-save").click();
    await expectToast(page, "경미 수정했습니다");
    await expect(cellOf(codeRow(page, "HR01"), "name")).toHaveText("열연 1호 경미", { timeout: 20_000 });
    await expect(cellOf(codeRow(page, "HR01"), "alterName")).toHaveText("HR-1");
    await expect(cellOf(codeRow(page, "HR01"), "seq")).toHaveText("5");

    // CR01 은 v1.001 DRAFT 에서 고쳤으니 경미 수정할 수 없다.
    await cellOf(codeRow(page, "CR01"), "code").click();
    await expect(tid(page, "patch-code")).toHaveValue("CR01");
    await expect(tid(page, "patch-save")).toBeDisabled();
    await expect(tid(page, "patch-blocked")).toHaveText("DRAFT에서 고치세요");

    // RELEASED 의 [카테고리] 탭은 목록·미리보기만 — 추가 폼·닫기가 없다.
    await openTab(page, "cate");
    await expect(tid(page, "cate-row-TBL_HR")).toBeVisible({ timeout: 20_000 });
    // [카테고리 추가] 버튼(추가 팝업을 여는 것, ade3851f)이 없고 닫기도 없다.
    await expect(screen(page).getByTestId("cate-add")).toHaveCount(0);
    await expect(cateList(page).locator('[data-testid^="cate-close-"]')).toHaveCount(0);
    await openTab(page, "tree");
    await expect(tid(page, "code-tree")).toContainText("HR01");
    await openTab(page, "grid");
    // 오른쪽 [코드 테스트] 탭 — 확정 버전에서도 카테고리 미리보기는 볼 수 있다.
    await openTab(page, "test");
    await openTab(page, "cate");
    await assertAllButtonsPressed(page, "codeItemEdit(RELEASED)", {
      찾기: "마루 코드 [찾기] 는 TC-DMC-ITM-01 에서 누른다(이 구간은 ITM-07 에서 누름 기록을 비웠다)",
    });
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-CAT-06 삭제(D) — 새 버전 [카테고리] 탭에서 빈 카테고리를 닫고 머리 [저장]하면 목록에서 빠진다", async () => {
    await choose(page, "code-ver-select", "1.001");
    await expect(tid(page, "code-ver-select").locator("option:checked")).toHaveText("v1.001 DRAFT");
    await openTab(page, "cate");
    await rowVersion(page, "cate-row-version");
    // HR02 를 지웠으니 TBL_HR 소속은 HR01 만 남는다(소속은 [편집] 팝업에서 본다, ade3851f).
    await openTransfer(page, "TBL_HR");
    await expect(tid(page, "cate-transfer-item-member-HR01")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="cate-transfer-item-member-HR02"]')).toHaveCount(0);
    await closeTransfer(page);

    await tid(page, "cate-close-TMP_EMPTY").click();
    await expect(tid(page, "cate-undo-TMP_EMPTY")).toBeVisible();
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await expect(tid(page, "cate-row-TMP_EMPTY")).toHaveCount(0, { timeout: 20_000 });
    await expect(tid(page, "cate-row-TBL_HR")).toBeVisible();
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-CNF-05 새 버전 검사 — 직전 대비 변경·카테고리 변화가 보이고, 직전보다 이른 일시는 거부된다", async () => {
    await go(page, "codeMng");
    await openCode(page, CODE);
    await selectVersion(page, "1.001");
    await tid(page, "ver-confirm-move").click();
    await expect(footerScreenId(page)).toHaveText("codeConfirm", { timeout: 60_000 });
    // 사용자가 목록에서 고른다(이미 열린 탭으로의 인계는 TC-DMC-LNK-03 에서 따로 본다).
    await tid(page, "cf-keyword").fill(CODE);
    await tid(page, "cf-search").click();
    await cfRow(page, CODE, "1.001").click();
    await expect(tid(page, "cf-target")).toHaveText(`${CODE} v1.001 MINOR`, { timeout: 20_000 });
    await expect(tid(page, "cf-previous")).toHaveText(`직전 RELEASED v1.000 · ${CONFIRM1B.date} 00:00:00`);
    const diff = tid(page, "cf-diff");
    await expect(diff).toContainText("HR02");
    await expect(diff).toContainText("삭제");
    await expect(diff).toContainText("냉연 1호 변경");
    await expect(tid(page, "cf-cate-TBL_HR")).toContainText("빠짐 HR02");
    await expect(tid(page, "cf-cate-TBL_HR")).toHaveAttribute("data-reduced", "true");

    await fillDateTime(tid(page, "cf-apply-from"), TOO_EARLY.input);
    await tid(page, "cf-validate").click();
    await expect(tid(page, "cf-check-status-3")).toHaveText("거부", { timeout: 20_000 });
    await expect(tid(page, "cf-check-status-3")).toHaveAttribute("data-rejected", "true");
    await expect(tid(page, "cf-check-status-4")).toHaveText("통과");
    await expect(tid(page, "cf-confirm")).toBeDisabled();
    await layout(page, "codeConfirm 거부");
    await snap(page, "dmc-codeConfirm-05-rejected");
    watcher.assertClean("codeConfirm");
  });

  test("TC-DMC-EDT-10 삭제(D) — 새 버전 DRAFT 를 [취소] 한 번 뒤 삭제하면 확정 버전만 남는다", async () => {
    await go(page, "codeMng");
    // 다른 화면을 거쳐 돌아왔다 — 누름 기록은 화면 구분 없이 하나라서, 폐기(EDT-12)까지의 상세 커버리지를 여기서부터 다시 센다.
    await resetClicks(page);
    await openCode(page, CODE);
    await selectVersion(page, "1.001");
    await tid(page, "ver-delete").click();
    await expect(modal(page)).toContainText("v1.001 DRAFT 를 삭제할까요? 이 버전에서 바꾼 코드·카테고리도 되돌립니다.");
    await snapModal(page, "dmc-codeMng-detail-10-delete-confirm");
    await answerConfirm(page, "취소");
    await expect(versionRow(page, "1.001")).toBeVisible();

    await tid(page, "ver-delete").click();
    await answerConfirm(page, "확인");
    await expectToast(page, "삭제했습니다");
    await expect(versionRow(page, "1.001")).toHaveCount(0, { timeout: 20_000 });
    await expect(versionRow(page, "1.000")).toBeVisible();
    await expect(tid(page, "ver-new-hint")).toHaveCount(0);
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-11 복원 — v1.000 내용으로 채운 새 major 버전을 만들었다가 지운다", async () => {
    await tid(page, "ver-new-major").click();
    await expect(tid(page, "newver-number")).toHaveText("v2.000");
    await tid(page, "newver-content-restore-1.000").getByText(/복원/).click();
    await tid(page, "newver-ok").click();
    await expectToast(page, "새 버전을 만들었습니다");
    await expect(versionRow(page, "2.000")).toContainText("(v1.000 복원)", { timeout: 20_000 });
    await expect(versionRow(page, "2.000")).toContainText("MAJOR");

    await selectVersion(page, "2.000");
    await tid(page, "ver-delete").click();
    await answerConfirm(page, "확인");
    await expectToast(page, "삭제했습니다");
    await expect(versionRow(page, "2.000")).toHaveCount(0, { timeout: 20_000 });
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-EDT-12 폐기 — [취소]면 그대로, [확인]하면 DEPRECATED 가 되고 새 버전을 만들 수 없다", async () => {
    await expect(tid(page, "header-deprecate")).toBeEnabled();
    await tid(page, "header-deprecate").click();
    await expect(modal(page)).toContainText("폐기하면 새 버전을 만들 수 없습니다. 폐기할까요?");
    await snapModal(page, "dmc-codeMng-detail-12-deprecate-confirm");
    await answerConfirm(page, "취소");
    await expect(tid(page, "header-status")).toHaveText("INUSE");

    await tid(page, "header-deprecate").click();
    await answerConfirm(page, "확인");
    await expectToast(page, "폐기했습니다");
    await expect(tid(page, "header-status")).toHaveText("DEPRECATED", { timeout: 20_000 });
    await expect(tid(page, "ver-new-major")).toBeDisabled();
    await expect(tid(page, "ver-new-minor")).toBeDisabled();
    await expect(tid(page, "header-deprecate")).toBeDisabled();
    // 폐기 뒤에도 헤더 경미 수정은 된다(설계 D10).
    await tid(page, "header-desc").fill("폐기된 코드(E2E)");
    await tid(page, "header-save").click();
    await expectToast(page, "저장했습니다");
    await expect(tid(page, "header-status")).toHaveText("DEPRECATED");
    await expect(tid(page, "header-desc")).toHaveValue("폐기된 코드(E2E)");
    await layout(page, "codeMng 상세 폐기 뒤");
    await snap(page, "dmc-codeMng-detail-12-deprecated");
    await assertAllButtonsPressed(page, "codeMng 상세", {
      "코드 등록": "등록 팝업 열기 — TC-DMC-MNG-02·05 에서 눌렀다",
    });
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-08 폐기 반영 — 상태 DEPRECATED 로 조회되고 INUSE 조건에서는 빠진다", async () => {
    await go(page, "codeMng");
    await tid(page, "code-search-keyword").fill(CODE);
    await tid(page, "code-search-status").selectOption("DEPRECATED");
    await button(page, "조회").click();
    const row = codeListRow(page, CODE);
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expectListCell(page, CODE, "status", "DEPRECATED");
    await tid(page, "code-search-status").selectOption("INUSE");
    await button(page, "조회").click();
    await expect(tid(page, "code-list-empty")).toBeVisible({ timeout: 20_000 });
    await snap(page, "dmc-codeMng-08-deprecated");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-LAY-99 여정 중 모든 화면 배치가 표준을 지킨다", async () => {
    expect(layoutIssues, "화면 배치 위반(스크린샷: .out/screens/dmc-layout-*)").toEqual([]);
  });
});

// ═══════════════════════════ B. 연결·권한 ═══════════════════════════

test.describe("dmc 화면 연결·넘기기·코드 삭제·읽기 전용", () => {
  // 서로 기대지 않는다 — 하나가 실패해도 나머지는 돈다. 테스트마다 스스로 코드를 등록한다.
  test.describe.configure({ mode: "default" });

  test("TC-DMC-LNK-01 [코드 편집]으로 열면 코드 편집 화면에 그 마루 코드·버전이 골라져 있다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("LK1");
      await registerCode(page, id, `E2E 인계1 ${RUN}`);
      await selectVersion(page, "1.000");
      await tid(page, "ver-item-edit").click();
      await expect(footerScreenId(page)).toHaveText("codeItemEdit", { timeout: 60_000 });
      await waitIdle(page);
      await snap(page, "dmc-link-01-codeItemEdit");
      await expect(tid(page, "code-current"), "넘겨받은 마루 코드").toContainText(id, { timeout: 20_000 });
      await expect(tid(page, "code-ver-select"), "넘겨받은 버전").toHaveValue("1.000");
      watcher.assertClean("codeMng→codeItemEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-LNK-02 [코드 편집]으로 연 화면의 [카테고리] 탭은 넘겨받은 마루 코드·버전의 카테고리를 보인다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("LK2");
      await registerCode(page, id, `E2E 인계2 ${RUN}`);
      await selectVersion(page, "1.000");
      await tid(page, "ver-item-edit").click();
      await expect(footerScreenId(page)).toHaveText("codeItemEdit", { timeout: 60_000 });
      await waitIdle(page);
      await openTab(page, "cate");
      await snap(page, "dmc-link-02-codeItemEdit-cate");
      await expect(tid(page, "code-current"), "넘겨받은 마루 코드").toContainText(id, { timeout: 20_000 });
      await expect(tid(page, "code-ver-select"), "넘겨받은 버전").toHaveValue("1.000");
      await expect(tid(page, "cate-row-BASE"), "넘겨받은 코드의 BASE").toBeVisible({ timeout: 20_000 });
      await expect(tid(page, "cate-row-version")).toHaveText(/^row_version = \d+$/);
      await expect(tid(page, "cate-add")).toBeVisible();
      watcher.assertClean("codeMng→codeItemEdit[카테고리]");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-LNK-03 이미 열린 버전 확정 탭으로 [확정 이동]해도 그 DRAFT 로 바뀐다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("LK3");
      await go(page, "codeConfirm"); // 탭을 먼저 연다
      await registerCode(page, id, `E2E 인계3 ${RUN}`);
      await selectVersion(page, "1.000");
      await tid(page, "ver-confirm-move").click();
      await expect(footerScreenId(page)).toHaveText("codeConfirm", { timeout: 60_000 });
      await expect(tid(page, "cf-target"), "넘겨받은 DRAFT").toHaveText(`${id} v1.000 MAJOR`, { timeout: 20_000 });
      watcher.assertClean("codeMng→codeConfirm");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-EDT-13 넘기기(보류, D2) — 넘길 수 없으니 DRAFT 는 내 편집 중으로 남고, 다른 담당자에게는 잠김으로 보인다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    const other = await openAs(browser, "stw2", testInfo);
    try {
      const id = uid("HND");
      await registerCode(page, id, `E2E 넘기기 ${RUN}`);
      await selectVersion(page, "1.000");
      // 넘겨받는 사람의 담당자 여부를 확인할 수단이 없어(서버가 늘 MDM005) 버튼을 꺼 두었다.
      await expect(tid(page, "ver-handover")).toBeDisabled();
      await expect(tid(page, "ver-handover-wrap")).toHaveAttribute("title", HANDOVER_PENDING);
      await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
      await snap(page, "dmc-handover-pending");

      await go(other.page, "codeMng");
      await openCode(other.page, id);
      await expect(versionRow(other.page, "1.000")).toContainText(`잠김 · ${STW} 편집 중`);
      await selectVersion(other.page, "1.000");
      await expect(tid(other.page, "ver-handover")).toBeDisabled();
      // 남이 잡은 DRAFT 여도 [코드 편집]은 켜져 있다 — 코드 편집 화면이 읽기 전용으로 연다(D-101).
      await expect(tid(other.page, "ver-item-edit")).toBeEnabled();
      await tid(other.page, "ver-item-edit").click();
      await expect(footerScreenId(other.page)).toHaveText("codeItemEdit", { timeout: 60_000 });
      await expect(tid(other.page, "code-current")).toContainText(id, { timeout: 20_000 });
      await expect(screen(other.page).getByText("읽기 전용 · diff 보기")).toBeVisible();
      await expect(button(other.page, "저장")).toHaveCount(0);
      watcher.assertClean("codeMng");
      other.watcher.assertClean("codeMng·codeItemEdit(stw2)");
    } finally {
      await page.context().close();
      await other.page.context().close();
    }
  });

  test("TC-DMC-EDT-14 코드 삭제(D-102) — 확정된 적 없는 코드는 [폐기] 자리에 [삭제]가 있고, 남이 DRAFT 를 잡고 있으면 거부되며, 풀리면 지워져 목록에서 사라진다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    const other = await openAs(browser, "stw2", testInfo);
    try {
      const id = uid("DLC");
      await registerCode(page, id, `E2E 코드삭제 ${RUN}`);
      await expect(tid(page, "header-deprecate")).toHaveCount(0);
      await expect(tid(page, "header-delete-code")).toHaveText("삭제");
      await expect(tid(page, "header-delete-code")).toBeEnabled();

      // [취소]하면 아무것도 바뀌지 않는다.
      await tid(page, "header-delete-code").click();
      await expect(modal(page)).toContainText("이 마루 코드를 삭제하면 되돌릴 수 없습니다. 삭제할까요?");
      await snapModal(page, "dmc-codeMng-delete-code-confirm");
      await answerConfirm(page, "취소");
      await expect(tid(page, "header-name")).toBeVisible();
      await expect(versionRow(page, "1.000")).toBeVisible();

      // stw 가 DRAFT 를 풀고 stw2 가 잡는다. 소유자 없는 DRAFT 는 삭제를 막지 않으니 stw 화면의 [삭제]는 켜진 채다.
      await selectVersion(page, "1.000");
      await tid(page, "ver-unlock").click();
      await expectToast(page, "해제했습니다");
      await expect(tid(page, "header-delete-code")).toBeEnabled();
      await go(other.page, "codeMng");
      await openCode(other.page, id);
      await selectVersion(other.page, "1.000");
      await tid(other.page, "ver-lock").click();
      await expectToast(other.page, "선점했습니다");

      // stw 는 다시 읽지 않은 화면에서 [삭제] → 서버가 남의 DRAFT 를 이유로 거부한다.
      await tid(page, "header-delete-code").click();
      // 확인 대화상자가 닫히자마자 오류 모달이 떠서 answerConfirm(닫힘 대기)을 쓰지 않는다.
      await modal(page).getByRole("button", { name: "확인" }).click();
      await expectErrorModal(page, new RegExp(`${STW2}.*편집 중이라 삭제할 수 없습니다`), "dmc-codeMng-delete-code-rejected");
      // 다시 열면 남이 잡은 DRAFT 가 보이고 [삭제]는 꺼져 있다.
      await openCode(page, id);
      await expect(versionRow(page, "1.000")).toContainText(`잠김 · ${STW2} 편집 중`);
      await expect(tid(page, "header-delete-code")).toBeDisabled();

      // stw2 가 풀면 stw 가 지울 수 있다.
      await tid(other.page, "ver-unlock").click();
      await expectToast(other.page, "해제했습니다");
      await openCode(page, id);
      await expect(tid(page, "header-delete-code")).toBeEnabled();
      await tid(page, "header-delete-code").click();
      await answerConfirm(page, "확인");
      await expectToast(page, "삭제했습니다");
      await expect(screen(page).getByText(DETAIL_GUIDE)).toBeVisible({ timeout: 20_000 });
      await expect(tid(page, "header-name")).toHaveCount(0);
      await tid(page, "code-search-keyword").fill(id);
      await button(page, "조회").click();
      await expect(tid(page, "code-list-empty")).toBeVisible({ timeout: 20_000 });
      await snap(page, "dmc-codeMng-delete-code-done");
      watcher.assertClean("codeMng");
      other.watcher.assertClean("codeMng(stw2)");
    } finally {
      await page.context().close();
      await other.page.context().close();
    }
  });

  test("TC-DMC-ITM-09 새 코드 행에 순서(seq)를 입력하면 그 값이 셀에 남고 저장된다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("SEQ");
      await registerCode(page, id, `E2E 순서 ${RUN}`);
      await go(page, "codeItemEdit");
      await pickCode(page, id);
      await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
      await tid(page, "code-add").click();
      const row = newRow(codeGrid(page));
      await editCell(codeGrid(page), row, "code", "S1");
      await editCell(codeGrid(page), row, "name", "순서 시험");
      try {
        await editCell(codeGrid(page), row, "seq", "3");
      } finally {
        await snap(page, "dmc-codeItemEdit-09-seq");
      }
      await button(page, "저장").click();
      await expectToast(page, "저장했습니다");
      await expect(cellOf(codeRow(page, "S1"), "seq")).toHaveText("3", { timeout: 20_000 });
      watcher.assertClean("codeItemEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-ITM-10 저장된 코드 행을 고치면 동작 칸이 [취소]로 바뀌고 누르면 원래 값으로 돌아온다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("UND");
      await registerCode(page, id, `E2E 취소 ${RUN}`);
      await go(page, "codeItemEdit");
      await pickCode(page, id);
      await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
      await addCodeRow(page, { code: "U1", name: "원래 이름" });
      await button(page, "저장").click();
      await expectToast(page, "저장했습니다");
      await expect(codeRow(page, "U1")).toHaveCount(1, { timeout: 20_000 });

      await editCell(codeGrid(page), codeRow(page, "U1"), "name", "잘못 고침");
      await snap(page, "dmc-codeItemEdit-10-edited");
      await expect(codeRow(page, "U1").getByRole("button", { name: "취소" }), "고친 행의 [취소]").toBeVisible({ timeout: 5_000 });
      await codeRow(page, "U1").getByRole("button", { name: "취소" }).click();
      await expect(cellOf(codeRow(page, "U1"), "name")).toHaveText("원래 이름");
      watcher.assertClean("codeItemEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-ITM-11 새 버전에서 이어받은 행을 [삭제]하면 저장 전에 삭제 배지와 [취소]가 보인다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("DEL");
      await registerCode(page, id, `E2E 삭제표시 ${RUN}`);
      // v1.000 에 행 하나를 넣고 확정한다.
      await go(page, "codeItemEdit");
      await pickCode(page, id);
      await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
      await addCodeRow(page, { code: "D1", name: "지울 행" });
      await button(page, "저장").click();
      await expectToast(page, "저장했습니다");
      await go(page, "codeConfirm");
      await tid(page, "cf-keyword").fill(id);
      await tid(page, "cf-search").click();
      await cfRow(page, id, "1.000").click();
      await fillDateTime(tid(page, "cf-apply-from"), daysAgo(3).input);
      await tid(page, "cf-validate").click();
      await expect(tid(page, "cf-confirm")).toBeEnabled({ timeout: 20_000 });
      await tid(page, "cf-confirm").click();
      await tid(page, "cf-modal-ok").click();
      await expectToast(page, "확정했습니다");
      // 새 minor 버전에서 D1 을 삭제로 표시한다.
      await go(page, "codeMng");
      await openCode(page, id);
      await tid(page, "ver-new-minor").click();
      await tid(page, "newver-ok").click();
      await expectToast(page, "새 버전을 만들었습니다");
      await go(page, "codeItemEdit");
      await button(page, "조회").click();
      await waitIdle(page);
      await choose(page, "code-ver-select", "1.001");
      await codeRow(page, "D1").getByRole("button", { name: "삭제" }).click();
      await snap(page, "dmc-codeItemEdit-11-marked");
      await expect(cellOf(codeRow(page, "D1"), "__change"), "삭제 배지").toContainText("삭제", { timeout: 5_000 });
      await expect(codeRow(page, "D1").getByRole("button", { name: "취소" }), "삭제 표시 행의 [취소]").toBeVisible();
      watcher.assertClean("codeItemEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-CAT-07 정규식 문법 오류는 저장 전에 [카테고리 편집] 탭에서 바로 알린다 — 기능설계서 §4.4 cate-preview-invalid", async ({ browser }, testInfo) => {
    // 옛 TC-DMC-CAT-04 앞부분의 단언을 그대로 옮겼다. ade3851f 가 카테고리 미리보기 영역(cate-preview)을 없애면서 이 안내도
    // 화면에서 빠졌다가, 기능설계서(codeItemEdit §4.4 :169·:201)대로 4be86b2a 가 [카테고리 편집] 탭에 되살렸다(지금은 통과).
    // 여정 장(serial)의 뒤 단계와 엮이지 않게 독립 시험으로 둔다. 같은 일을 하는 dmd 카테고리 탭은 cate-regex-invalid 로 알린다.
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("RGXINV");
      await registerCode(page, id, `E2E 정규식 오류 ${RUN}`);
      await go(page, "codeItemEdit");
      await pickCode(page, id);
      await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
      await openTab(page, "cate");
      await addCategory(page, "RGX_BAD", "정규식 오류", "REGEX");
      await selectCate(page, "RGX_BAD");
      await editCateText(page, "RGX_BAD", "defExpr", "(");
      await expect(tid(page, "cate-undo-RGX_BAD")).toBeVisible();
      await snap(page, "dmc-codeItemEdit-cate-07-invalid-regex");
      await expect(tid(page, "cate-preview-invalid")).toHaveText("정규식 문법 오류로 해석하지 못했습니다", { timeout: 20_000 });
      watcher.assertClean("codeItemEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-ITM-12 머리 [저장]이 거부되면 이슈가 있는 탭 이름 옆에 경고 아이콘이 붙는다([코드]·[카테고리])", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("ISS");
      await registerCode(page, id, `E2E 탭이슈 ${RUN}`);
      await go(page, "codeItemEdit");
      await pickCode(page, id);
      await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
      await expect(screen(page).getByTestId("code-tab-grid-issue")).toHaveCount(0);
      await expect(screen(page).getByTestId("code-right-tab-cate-issue")).toHaveCount(0);

      // 코드 행 이슈 → [코드] 탭 아이콘
      await addCodeRow(page, { code: "A B", name: "공백 코드" });
      await button(page, "저장").click();
      await expectErrorModal(page, "코드 저장 검사를 통과하지 못했습니다");
      await expect(tid(page, "code-tab-grid-issue"), "[코드] 탭 경고 아이콘").toBeVisible({ timeout: 20_000 });
      await codeRow(page, "A B").getByRole("button", { name: "취소" }).click();

      // 카테고리 이슈 → [카테고리 편집] 탭 아이콘과 그 행의 이슈 문구(카테고리는 오른쪽 탭, ade3851f)
      await openTab(page, "cate");
      await addCategory(page, "BAD ID", "공백 ID", "TABLE");
      await button(page, "저장").click();
      await expectErrorModal(page, "코드 저장 검사를 통과하지 못했습니다");
      await expect(tid(page, "code-right-tab-cate-issue"), "[카테고리 편집] 탭 경고 아이콘").toBeVisible({ timeout: 20_000 });
      await expect(tid(page, "cate-row-issue-BAD ID"), "그 카테고리 행의 이슈 문구").toContainText("점·콤마·공백");
      await snap(page, "dmc-codeItemEdit-12-tab-issues");
      watcher.assertClean("codeItemEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-RO-01 표준관리자(std)는 dmc 를 조회만 한다 — 등록·수정·검사·확정 버튼이 막히고 [코드 편집]은 읽기 전용으로 연다", async ({ browser }, testInfo) => {
    const owner = await openAs(browser, "stw", testInfo);
    const id = uid("RO");
    try {
      await registerCode(owner.page, id, `E2E 읽기전용 ${RUN}`, "1");
      owner.watcher.assertClean("codeMng(stw)");
    } finally {
      await owner.page.context().close();
    }

    const { page, watcher } = await openAs(browser, "std", testInfo);
    try {
      // codeMng — 조회는 되고(권한 조회가 끝났다는 뜻) [코드 등록]은 보이지만 꺼져 있다.
      await go(page, "codeMng");
      await expect(button(page, "조회")).toBeEnabled({ timeout: 30_000 });
      await expect(page.locator("#btn_code_reg")).toBeDisabled();
      await snap(page, "dmc-ro-codeMng");

      // codeMng 오른쪽 상세 — 헤더 입력과 쓰기 버튼이 꺼져 있고 [코드 편집](조회)만 켜진다.
      await openCode(page, id);
      await expect(tid(page, "header-name")).toBeDisabled();
      await expect(tid(page, "label-attr01")).toBeDisabled();
      await expect(tid(page, "header-save")).toBeDisabled();
      await expect(tid(page, "header-delete-code")).toBeDisabled();
      await selectVersion(page, "1.000");
      for (const b of ["ver-new-major", "ver-new-minor", "ver-delete", "ver-lock", "ver-unlock", "ver-handover", "ver-confirm-move"]) {
        await expect(tid(page, b), `${b}(std)`).toBeDisabled();
      }
      await expect(tid(page, "ver-item-edit"), "ver-item-edit(std) — 조회 권한으로 연다").toBeEnabled();
      await snap(page, "dmc-ro-codeMng-detail");

      // codeItemEdit — [코드 편집]으로 열면 읽기 전용, 저장·코드 추가가 없다.
      await tid(page, "ver-item-edit").click();
      await expect(footerScreenId(page)).toHaveText("codeItemEdit", { timeout: 60_000 });
      await expect(tid(page, "code-current")).toContainText(id, { timeout: 20_000 });
      await expect(tid(page, "code-ver-select")).toHaveValue("1.000");
      await expect(screen(page).getByText("읽기 전용 · diff 보기")).toBeVisible();
      await expect(button(page, "저장")).toHaveCount(0);
      await expect(tid(page, "code-add")).toHaveCount(0);

      // [카테고리] 탭 — 목록은 보이고 추가·닫기가 없다.
      await openTab(page, "cate");
      await expect(tid(page, "cate-row-BASE")).toBeVisible({ timeout: 20_000 });
      // [카테고리 추가] 버튼(추가 팝업을 여는 것, ade3851f)이 없고 닫기도 없다.
      await expect(screen(page).getByTestId("cate-add")).toHaveCount(0);
      await expect(cateList(page).locator('[data-testid^="cate-close-"]')).toHaveCount(0);
      await snap(page, "dmc-ro-codeItemEdit-cate");

      // codeConfirm — 남의 DRAFT 를 골라도 검사·확정이 꺼져 있다.
      await go(page, "codeConfirm");
      await tid(page, "cf-keyword").fill(id);
      await tid(page, "cf-search").click();
      await cfRow(page, id, "1.000").click();
      await expect(tid(page, "cf-target")).toContainText(id, { timeout: 20_000 });
      await expect(tid(page, "cf-form")).toContainText(`잠김 · ${STW} 편집 중`);
      await expect(tid(page, "cf-validate")).toBeDisabled();
      await expect(tid(page, "cf-confirm")).toBeDisabled();
      await snap(page, "dmc-ro-codeConfirm");
      watcher.assertClean("dmc(std)");
    } finally {
      await page.context().close();
    }
  });
});
