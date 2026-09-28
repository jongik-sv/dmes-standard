import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  RUN,
  USERS,
  Watcher,
  answerConfirm,
  assertAllButtonsPressed,
  breadcrumb,
  button,
  checkLayout,
  escapeRe,
  expectToast,
  footerScreenId,
  gridRow,
  modal,
  openAs,
  openMenu,
  resetClicks,
  screen,
  snap,
  tid,
  uid,
  waitIdle,
  type LayoutOptions,
} from "./support";

/**
 * 마루 MDM > 마스터코드(dmc) 사용자 여정 E2E.
 *
 * 담당자(stw)가 화면만으로 마루 코드 하나의 일생을 끝까지 다룬다.
 *   마루 코드 등록(codeMng) → 헤더·라벨 수정, 해제·선점, 두 사용자 잠금·충돌(codeEdit)
 *   → 코드 행 입력·수정·되돌리기(codeItemEdit) → 카테고리 추가·소속·정규식(codeCateEdit)
 *   → 검사·확정(codeConfirm) → 새 버전에서 행 삭제·카테고리 닫기·경미 수정 → 새 버전 삭제·복원 → 폐기.
 *
 * 구조
 *   A "여정"  — serial. 한 페이지를 공유하며 앞 단계가 만든 데이터를 이어 쓴다.
 *   B "연결·권한" — 테스트마다 스스로 코드를 등록하는 독립 테스트. 화면 간 인계·넘기기·읽기 전용처럼
 *     실패해도 여정을 끊으면 안 되는 확인을 둔다.
 * 배치 검사(checkLayout) 위반은 여정을 멈추지 않게 모아 두었다가 마지막 TC-DMC-LAY-99 에서 한꺼번에 단언한다.
 */

const TRAIL = (leaf: string) => ["마루 MDM", "마스터코드", leaf];
const MENU = {
  codeMng: "마루 코드",
  codeEdit: "마루 코드 수정",
  codeItemEdit: "코드 편집",
  codeCateEdit: "카테고리 편집",
  codeConfirm: "버전 확정",
} as const;
type ScreenId = keyof typeof MENU;

const STW = USERS.stw.id;
const STW2 = USERS.stw2.id;

/** 오늘에서 days 만큼 뺀 날의 0시 — datetime-local 입력값(yyyy-MM-ddTHH:mm)과 서버 표기(yyyy-MM-dd). */
function daysAgo(days: number): { input: string; date: string } {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { input: `${date}T00:00`, date };
}

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

const errorBody = (page: Page) => page.locator(".error-modal__body:visible");

/** 모달이 다 떠오른 뒤(열림 애니메이션 끝) 찍는다 — 반투명한 중간 프레임이 찍히지 않게. */
async function snapModal(page: Page, name: string) {
  const m = modal(page);
  await expect(m).toBeVisible();
  await expect
    .poll(() => m.evaluate((el) => Number(getComputedStyle(el).opacity) * (el.getAnimations().length ? 0 : 1)))
    .toBe(1);
  await snap(page, name);
}

/** 오류 모달 문구를 보고 [확인]으로 닫는다. */
async function expectErrorModal(page: Page, text: string | RegExp, shot?: string) {
  await expect(errorBody(page)).toContainText(text, { timeout: 20_000 });
  if (shot) await snapModal(page, shot);
  await answerConfirm(page, "확인");
}

/** 네이티브 Select 에서 값을 고른다(옵션이 채워질 때까지 기다린다). */
async function choose(page: Page, testId: string, value: string) {
  const sel = tid(page, testId);
  await expect(sel.locator(`option[value="${value}"]`)).toHaveCount(1, { timeout: 20_000 });
  await sel.selectOption(value);
  await waitIdle(page);
}

/** codeEdit 의 마루 코드 ComboBox(검색형)에서 코드를 고른다. */
async function pickCode(page: Page, id: string) {
  const input = tid(page, "code-pick").locator('input:not([type="hidden"])');
  await input.click();
  await input.fill(id);
  await page.getByRole("option", { name: new RegExp(`^${escapeRe(id)} `) }).first().click();
  await expect(tid(page, "header-name")).toBeVisible({ timeout: 30_000 });
  await waitIdle(page);
}

const versionRow = (page: Page, ver: string) => tid(page, `version-row-${ver}`);

async function selectVersion(page: Page, ver: string) {
  await versionRow(page, ver).click();
  await expect(versionRow(page, ver)).toHaveAttribute("aria-selected", "true");
}

/** codeMng 등록 카드로 마루 코드를 등록한다. 등록 뒤 열리는 codeEdit 탭까지 기다린다. */
async function registerCode(page: Page, id: string, name: string, lvl = "0", desc = "") {
  await go(page, "codeMng");
  await tid(page, "code-reg-id").fill(id);
  await tid(page, "code-reg-name").fill(name);
  if (desc) await tid(page, "code-reg-desc").fill(desc);
  await tid(page, "code-reg-lvl").selectOption(lvl);
  await tid(page, "code-reg-save").click();
  await expectToast(page, "등록했습니다");
  await expect(footerScreenId(page)).toHaveText("codeEdit", { timeout: 60_000 });
  await expect(tid(page, "version-list")).toContainText("v1.000", { timeout: 30_000 });
  await waitIdle(page);
}

// ── ag-grid 셀 편집 ──

const codeGrid = (page: Page) => tid(page, "code-grid");
const newRow = (grid: Locator) => grid.locator('.ag-center-cols-container .ag-row[row-index="0"]');
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

  // ─────────── codeMng — 마루 코드 ───────────

  test("TC-DMC-MNG-01 마루 코드 화면 배치 — 메뉴로 열면 검색영역·목록·등록 카드가 보인다", async () => {
    await go(page, "codeMng");
    await resetClicks(page); // 이 화면 버튼 커버리지를 여기서부터 센다
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터코드 > 마루 코드");
    await expect(tid(page, "code-search-keyword")).toBeVisible();
    await expect(tid(page, "code-search-status")).toHaveValue("");
    await expect(tid(page, "code-list")).toBeVisible();
    await expect(tid(page, "code-reg-source")).toHaveText("MDM");
    await expect(tid(page, "code-reg-lvl")).toHaveValue("0");
    await expect(tid(page, "code-reg-save")).toBeEnabled();
    // 이 화면에는 삭제 수단이 없다 — 마루 코드는 codeEdit 의 [폐기]로만 끝낸다(TC-DMC-EDT-12).
    await expect(button(page, /^(삭제|폐기)$/)).toHaveCount(0);
    await layout(page, "codeMng");
    await snap(page, "dmc-codeMng-01-initial");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-02 필수값·ID 형식 오류는 알아듣기 쉬운 문구로 막힌다", async () => {
    await tid(page, "code-reg-save").click();
    await expectErrorModal(page, "마루 코드 ID 와 이름을 입력하세요.", "dmc-codeMng-02-required");

    await tid(page, "code-reg-id").fill("e2e usr.bad");
    await tid(page, "code-reg-name").fill(NAME);
    await tid(page, "code-reg-save").click();
    await expectErrorModal(page, /점·콤마·공백|영문 대문자/, "dmc-codeMng-02-bad-id");
    // 실패하면 입력값을 그대로 둔다 — 사용자가 고쳐서 다시 저장한다.
    await expect(tid(page, "code-reg-id")).toHaveValue("e2e usr.bad");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-03 등록(C) — ID·이름·설명·계층 칸 수를 넣고 저장하면 수정 탭이 그 코드로 열린다", async () => {
    await tid(page, "code-reg-id").fill(CODE);
    await tid(page, "code-reg-name").fill(NAME);
    await tid(page, "code-reg-desc").fill("E2E 사용자 여정으로 만든 코드");
    await tid(page, "code-reg-lvl").selectOption("2");
    await tid(page, "code-reg-save").click();
    await expectToast(page, "등록했습니다");

    await expect(footerScreenId(page)).toHaveText("codeEdit", { timeout: 60_000 });
    const list = tid(page, "version-list");
    await expect(list).toContainText("v1.000", { timeout: 30_000 });
    await expect(versionRow(page, "1.000")).toContainText("MAJOR");
    await expect(versionRow(page, "1.000")).toContainText("작성 중");
    await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
    await expect(tid(page, "header-name")).toHaveValue(NAME);
    await expect(tid(page, "header-lvl")).toHaveValue("2");
    watcher.assertClean("codeMng→codeEdit");
  });

  test("TC-DMC-MNG-04 조회(R) — 키워드·상태 조건을 바꿔 가며 방금 만든 코드를 찾는다", async () => {
    await go(page, "codeMng");
    // 등록이 끝나면 등록 카드는 비워진다.
    await expect(tid(page, "code-reg-id")).toHaveValue("");
    await expect(tid(page, "code-reg-name")).toHaveValue("");
    await expect(tid(page, "code-reg-lvl")).toHaveValue("0");

    const list = tid(page, "code-list");
    await tid(page, "code-search-keyword").fill(CODE);
    await button(page, "조회").click();
    const row = gridRow(list, CODE, "maruCodeId");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.locator('.ag-cell[col-id="maruCodeName"]')).toHaveText(NAME);
    await expect(row.locator('.ag-cell[col-id="sourceKind"]')).toHaveText("MDM");
    await expect(row.locator('.ag-cell[col-id="status"]')).toHaveText("CREATED");
    await expect(row.locator('.ag-cell[col-id="currentVerLabel"]')).toHaveText("미확정");
    await expect(row.locator('.ag-cell[col-id="unappliedLabel"]')).toHaveText("v1.000 DRAFT");
    await expect(screen(page).locator(".grid-panel-count").first()).toHaveText("1건");
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

  test("TC-DMC-MNG-05 같은 ID 로 다시 등록하면 중복 문구가 보인다", async () => {
    await tid(page, "code-reg-id").fill(CODE);
    await tid(page, "code-reg-name").fill("중복 등록");
    await tid(page, "code-reg-save").click();
    await expectErrorModal(page, "마루 코드·마루 데이터에 같은 ID 가 있습니다", "dmc-codeMng-05-dup");
    await tid(page, "code-reg-id").fill("");
    await tid(page, "code-reg-name").fill("");
    await assertAllButtonsPressed(page, "codeMng");
    watcher.assertClean("codeMng");
  });

  test("TC-DMC-MNG-06 목록의 ID 링크를 누르면 수정 탭이 그 코드로 열린다", async () => {
    await tid(page, "code-search-keyword").fill(CODE);
    await button(page, "조회").click();
    const row = gridRow(tid(page, "code-list"), CODE, "maruCodeId");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await row.locator(".mdm-link-button").click();
    await expect(footerScreenId(page)).toHaveText("codeEdit", { timeout: 60_000 });
    await expect(tid(page, "header-name")).toHaveValue(NAME, { timeout: 30_000 });
    watcher.assertClean("codeMng→codeEdit");
  });

  // ─────────── codeEdit — 마루 코드 수정 ───────────

  test("TC-DMC-EDT-01 마루 코드 수정 화면 배치 — 헤더·라벨·버전 카드가 보인다", async () => {
    await go(page, "codeEdit");
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터코드 > 마루 코드 수정");
    await expect(tid(page, "header-status")).toHaveText("CREATED");
    for (let i = 1; i <= 10; i++) await expect(tid(page, `label-attr${String(i).padStart(2, "0")}`)).toBeVisible();
    await layout(page, "codeEdit");
    await snap(page, "dmc-codeEdit-01-initial");
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-EDT-02 버전 버튼은 선택한 버전·소유자·미적용 수에 따라 켜지고 꺼진다", async () => {
    // 선택 전: 버전 조작 버튼은 모두 꺼져 있다.
    for (const b of ["ver-delete", "ver-lock", "ver-unlock", "ver-handover", "ver-confirm-move", "ver-item-edit", "ver-cate-edit"]) {
      await expect(tid(page, b), b).toBeDisabled();
    }
    // 미적용 DRAFT 가 있어 새 버전·폐기는 막히고 안내가 보인다.
    await expect(tid(page, "ver-new-major")).toBeDisabled();
    await expect(tid(page, "ver-new-minor")).toBeDisabled();
    await expect(tid(page, "ver-new-hint")).toHaveText("미적용 버전 v1.000 DRAFT 이 있어 새 버전을 만들 수 없습니다");
    await expect(tid(page, "header-deprecate")).toBeDisabled();
    await expect(tid(page, "header-save")).toBeEnabled();

    // 내 DRAFT 를 고르면 삭제·해제·넘기기·이동 버튼이 켜지고 선점은 꺼진다.
    await selectVersion(page, "1.000");
    for (const b of ["ver-delete", "ver-unlock", "ver-handover", "ver-confirm-move", "ver-item-edit", "ver-cate-edit"]) {
      await expect(tid(page, b), b).toBeEnabled();
    }
    await expect(tid(page, "ver-lock")).toBeDisabled();
    await layout(page, "codeEdit 버전 선택");
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-EDT-03 수정(U) — 이름·설명·라벨을 고쳐 저장하면 다시 조회해도 남는다", async () => {
    await tid(page, "header-name").fill(NAME2);
    await tid(page, "header-desc").fill("열연·냉연 강종 분류(E2E)");
    await tid(page, "header-lvl").selectOption("2");
    await tid(page, "label-attr01").fill("규격");
    await tid(page, "label-attr02").fill("강종");
    await tid(page, "header-save").click();
    await expectToast(page, "저장했습니다");

    await button(page, "조회").click();
    await waitIdle(page);
    await expect(tid(page, "header-name")).toHaveValue(NAME2);
    await expect(tid(page, "header-desc")).toHaveValue("열연·냉연 강종 분류(E2E)");
    await expect(tid(page, "label-attr01")).toHaveValue("규격");
    await expect(tid(page, "label-attr02")).toHaveValue("강종");
    await expect(tid(page, "label-attr03")).toHaveValue("");
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-EDT-04 이름을 비우고 저장하면 이름 규칙 문구가 보이고 값은 바뀌지 않는다", async () => {
    await tid(page, "header-name").fill("");
    await tid(page, "header-save").click();
    await expectErrorModal(page, "이름은 1~100자여야 합니다", "dmc-codeEdit-04-name-required");
    await button(page, "조회").click();
    await expect(tid(page, "header-name")).toHaveValue(NAME2, { timeout: 20_000 });
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-EDT-05 해제하면 선점 가능이 되고, 다시 선점하면 편집 중(나)로 돌아온다", async () => {
    await selectVersion(page, "1.000");
    await tid(page, "ver-unlock").click();
    await expectToast(page, "해제했습니다");
    await expect(versionRow(page, "1.000")).toContainText("선점 가능");
    await expect(tid(page, "ver-lock")).toBeEnabled();
    for (const b of ["ver-delete", "ver-unlock", "ver-handover", "ver-confirm-move", "ver-item-edit", "ver-cate-edit"]) {
      await expect(tid(page, b), b).toBeDisabled();
    }
    await snap(page, "dmc-codeEdit-05-unlocked");

    await tid(page, "ver-lock").click();
    await expectToast(page, "선점했습니다");
    await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
    await expect(tid(page, "ver-unlock")).toBeEnabled();
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-EDT-06 두 사용자 — 남이 잡은 DRAFT 는 잠김으로 보이고, 풀면 선점을 넘겨받는다", async ({ browser }, testInfo) => {
    const other = await openAs(browser, "stw2", testInfo);
    const p2 = other.page;
    try {
      await go(p2, "codeEdit");
      await pickCode(p2, CODE);
      await expect(versionRow(p2, "1.000")).toContainText(`잠김 · ${STW} 편집 중`);
      await selectVersion(p2, "1.000");
      for (const b of ["ver-lock", "ver-unlock", "ver-delete", "ver-handover", "ver-confirm-move", "ver-item-edit", "ver-cate-edit"]) {
        await expect(tid(p2, b), `${b}(stw2)`).toBeDisabled();
      }
      await snap(p2, "dmc-codeEdit-06-locked-by-other");

      // stw 가 해제 → stw2 가 조회 후 선점
      await selectVersion(page, "1.000");
      await tid(page, "ver-unlock").click();
      await expectToast(page, "해제했습니다");
      await button(p2, "조회").click();
      await expect(versionRow(p2, "1.000")).toContainText("선점 가능", { timeout: 20_000 });
      await selectVersion(p2, "1.000");
      await tid(p2, "ver-lock").click();
      await expectToast(p2, "선점했습니다");
      await expect(versionRow(p2, "1.000")).toContainText("편집 중(나)");

      // stw 화면에서는 stw2 가 편집 중으로 보이고 선점할 수 없다.
      await button(page, "조회").click();
      await expect(versionRow(page, "1.000")).toContainText(`잠김 · ${STW2} 편집 중`, { timeout: 20_000 });
      await selectVersion(page, "1.000");
      await expect(tid(page, "ver-lock")).toBeDisabled();
      await expect(tid(page, "ver-item-edit")).toBeDisabled();

      // stw2 가 해제하고 stw 가 다시 선점한다.
      await tid(p2, "ver-unlock").click();
      await expectToast(p2, "해제했습니다");
      await button(page, "조회").click();
      await expect(versionRow(page, "1.000")).toContainText("선점 가능", { timeout: 20_000 });
      await selectVersion(page, "1.000");
      await tid(page, "ver-lock").click();
      await expectToast(page, "선점했습니다");
      await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
      other.watcher.assertClean("codeEdit(stw2)");
    } finally {
      await p2.context().close();
    }
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-EDT-07 두 사용자 — 남이 먼저 헤더를 저장했으면 충돌 문구가 보이고 닫으면 최신 값으로 다시 불러온다", async ({ browser }, testInfo) => {
    const other = await openAs(browser, "stw2", testInfo);
    const p2 = other.page;
    try {
      await go(p2, "codeEdit");
      await pickCode(p2, CODE);
      await tid(p2, "header-name").fill(`${NAME2} (stw2)`);
      await tid(p2, "header-save").click();
      await expectToast(p2, "저장했습니다");
      other.watcher.assertClean("codeEdit(stw2)");
    } finally {
      await p2.context().close();
    }

    // stw 화면은 옛 값을 들고 있다.
    await expect(tid(page, "header-name")).toHaveValue(NAME2);
    await tid(page, "header-desc").fill("stw 가 늦게 고친 설명");
    await tid(page, "header-save").click();
    await expectErrorModal(page, "다른 사용자가 수정했습니다", "dmc-codeEdit-07-conflict");
    await expect(tid(page, "header-name")).toHaveValue(`${NAME2} (stw2)`, { timeout: 20_000 });
    await expect(tid(page, "header-desc")).toHaveValue("열연·냉연 강종 분류(E2E)");

    // 최신 값 위에서 다시 고친다.
    await tid(page, "header-name").fill(NAME2);
    await tid(page, "header-save").click();
    await expectToast(page, "저장했습니다");
    await expect(tid(page, "header-name")).toHaveValue(NAME2);
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-EDT-08 넘기기 대화상자 — 받는 사람을 비우면 넘기기가 꺼지고, 취소하면 아무것도 바뀌지 않는다", async () => {
    await selectVersion(page, "1.000");
    await tid(page, "ver-handover").click();
    const m = modal(page);
    await expect(m).toContainText("DRAFT 넘기기");
    await expect(tid(page, "handover-ok")).toBeDisabled();
    await tid(page, "handover-user").fill(STW2);
    await expect(tid(page, "handover-ok")).toBeEnabled();
    await snapModal(page, "dmc-codeEdit-08-handover-modal");
    await m.getByRole("button", { name: "취소", exact: true }).click();
    await expect(m).toBeHidden();
    await expect(versionRow(page, "1.000")).toContainText("편집 중(나)");
    watcher.assertClean("codeEdit");
  });

  // ─────────── codeItemEdit — 코드 편집(v1.000) ───────────

  test("TC-DMC-ITM-01 [코드 편집]으로 코드 편집 화면을 열고 마루 코드·버전을 고르면 빈 DRAFT 가 보인다", async () => {
    await selectVersion(page, "1.000");
    await tid(page, "ver-item-edit").click();
    await expect(footerScreenId(page)).toHaveText("codeItemEdit", { timeout: 60_000 });
    await waitIdle(page);
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터코드 > 코드 편집");
    // 사용자가 고른다(화면 인계는 TC-DMC-LNK-01 에서 따로 본다).
    await choose(page, "code-maru-select", CODE);
    await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
    await expect(tid(page, "code-ver-select").locator("option:checked")).toHaveText("v1.000 DRAFT");
    await expect(tid(page, "code-grid-empty")).toHaveText("보일 코드가 없습니다");
    await expect(screen(page).getByText(`편집 가능 · 소유자 ${STW}`)).toBeVisible();
    await rowVersion(page, "code-row-version");
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

  test("TC-DMC-ITM-02 변경 없이 저장·콤마·공백 코드는 알아듣기 쉬운 문구로 막히고 행에 이슈가 보인다", async () => {
    const before = await rowVersion(page, "code-row-version");
    await button(page, "저장").click();
    await expectErrorModal(page, "저장할 변경이 없습니다");

    await addCodeRow(page, { code: "A B", name: "공백 코드" });
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
    // 순서(seq)는 새 행에서 입력이 되지 않는 앱 결함이 있어(TC-DMC-ITM-09) 여기서는 넣지 않는다 — 경미 수정에서 넣는다.
    await addCodeRow(page, {
      code: "HR01", name: "열연 1호", alterName: "HR1", lvl1: "HR", attr01: "KS", attr02: "SS400", description: "E2E 열연",
    });
    await addCodeRow(page, { code: "HR02", name: "열연 2호", lvl1: "HR", attr01: "JIS" });
    await addCodeRow(page, { code: "CR01", name: "냉연 1호", lvl1: "CR", lvl2: "CRA" });
    await addCodeRow(page, { code: "TMP1", name: "임시" });
    await expect(screen(page).locator(".grid-panel-count").first()).toHaveText("4건");
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

  test("TC-DMC-ITM-04 조회(R) — 트리 보기·노드 거르기·닫힌 코드·카테고리 미리보기로 방금 넣은 코드를 본다", async () => {
    // 트리
    await screen(page).getByRole("tab", { name: "트리 보기" }).click();
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

    // 거르기
    await expect(tid(page, "code-filter-chip")).toContainText("HR 아래");
    await expect(codeGrid(page).locator(".ag-center-cols-container .ag-row")).toHaveCount(2);
    // 거르는 중에 추가하면 계층 칸이 그 노드 경로로 채워진다 — 확인만 하고 취소한다.
    await tid(page, "code-add").click();
    await expect(cellOf(newRow(codeGrid(page)), "lvl1")).toHaveText("HR");
    await newRow(codeGrid(page)).getByRole("button", { name: "취소" }).click();
    await expect(codeGrid(page).locator(".ag-center-cols-container .ag-row")).toHaveCount(2);
    await tid(page, "code-filter-clear").click();
    await expect(tid(page, "code-filter-chip")).toHaveCount(0);
    await expect(codeGrid(page).locator(".ag-center-cols-container .ag-row")).toHaveCount(4);

    // 닫힌 코드 보기 — v1.000 은 닫힌 행이 없어 그대로다.
    await tid(page, "code-closed-toggle").getByText("닫힌 코드 보기").click();
    await expect(tid(page, "code-closed-toggle").locator("input")).toBeChecked();
    await expect(codeGrid(page).locator(".ag-center-cols-container .ag-row")).toHaveCount(4);
    await tid(page, "code-closed-toggle").getByText("닫힌 코드 보기").click();
    await expect(tid(page, "code-closed-toggle").locator("input")).not.toBeChecked();

    // 카테고리 미리보기 — BASE 는 모든 코드가 해당한다.
    await expect(tid(page, "code-preview-cate")).toHaveValue("BASE");
    await expect(tid(page, "code-preview-title")).toContainText(`CODE_LIST("${CODE}", "BASE") · v1.000 · 4 / 4건 해당`);
    await choose(page, "code-preview-step-0", "HR");
    await expect(tid(page, "code-preview-step-1").locator("option")).toContainText(["HR01 (코드, 열연 1호)", "HR02 (코드, 열연 2호)"]);
    await tid(page, "code-preview-mode").getByText("목록·근거").click();
    const previewGrid = tid(page, "code-preview");
    await expect(previewGrid.locator(".ag-center-cols-container .ag-row")).toHaveCount(4, { timeout: 20_000 });
    await expect(gridRow(previewGrid, "CR01", "code").locator('.ag-cell[col-id="path"]')).toHaveText("CR > CRA");
    await snap(page, "dmc-codeItemEdit-04-preview-list");
    await tid(page, "code-preview-mode").getByText("콤보").click();
    await expect(tid(page, "code-preview-step-0")).toBeVisible();

    // 조회 버튼으로 다시 읽어도 같다.
    await button(page, "조회").click();
    await expect(codeGrid(page).locator(".ag-center-cols-container .ag-row")).toHaveCount(4, { timeout: 20_000 });
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-ITM-05 수정(U) — 저장된 행의 이름·약칭을 고쳐 저장하면 조회 뒤에도 남는다", async () => {
    const grid = codeGrid(page);
    const before = await rowVersion(page, "code-row-version");
    // 저장된 행을 고친 뒤 [취소]로 되돌리는 흐름은 동작 칸이 갱신되지 않는 앱 결함이 있어 TC-DMC-ITM-10 에서 따로 본다.
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
    await expect(codeGrid(page).locator(".ag-center-cols-container .ag-row")).toHaveCount(3);
    // 탭 버튼으로 트리 보기에 갔다가 코드 편집 탭으로 돌아온다.
    await screen(page).getByRole("tab", { name: "트리 보기" }).click();
    await expect(tid(page, "code-tree")).toBeVisible();
    await screen(page).getByRole("tab", { name: "코드 편집" }).click();
    await expect(codeGrid(page)).toBeVisible();
    await assertAllButtonsPressed(page, "codeItemEdit");
    watcher.assertClean("codeItemEdit");
  });

  // ─────────── codeCateEdit — 카테고리 편집(v1.000) ───────────

  test("TC-DMC-CAT-01 [카테고리 편집]으로 카테고리 화면을 열고 코드를 고르면 BASE 만 있다", async () => {
    await go(page, "codeEdit");
    await selectVersion(page, "1.000");
    await tid(page, "ver-cate-edit").click();
    await expect(footerScreenId(page)).toHaveText("codeCateEdit", { timeout: 60_000 });
    await waitIdle(page);
    await resetClicks(page);
    await expect(breadcrumb(page)).toContainText("마루 MDM > 마스터코드 > 카테고리 편집");
    await choose(page, "cate-maru-select", CODE);
    await expect(tid(page, "cate-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
    await expect(tid(page, "cate-row-BASE")).toBeVisible();
    await expect(tid(page, "cate-list").locator('[data-testid^="cate-row-"]')).toHaveCount(1);
    // BASE 는 편집·닫기를 할 수 없다.
    await expect(tid(page, "cate-close-BASE")).toHaveCount(0);
    await expect(tid(page, "cate-base-readonly")).toHaveText("BASE 는 예약 카테고리라 편집·닫기를 할 수 없습니다");
    await layout(page, "codeCateEdit");
    await snap(page, "dmc-codeCateEdit-01-initial");
    watcher.assertClean("codeCateEdit");
  });

  test("TC-DMC-CAT-02 등록(C) — TABLE·REGEX 카테고리를 추가하고 정규식을 바꾸면 미리보기가 따라 바뀐다", async () => {
    const before = await rowVersion(page, "cate-row-version");
    // 빈 ID·이름으로는 추가되지 않는다.
    await tid(page, "cate-add-submit").click();
    await expect(tid(page, "cate-list").locator('[data-testid^="cate-row-"]')).toHaveCount(1);

    await tid(page, "cate-add-id").fill("TBL_HR");
    await tid(page, "cate-add-name").fill("열연 묶음");
    await tid(page, "cate-add-kind").selectOption("TABLE");
    await tid(page, "cate-add-submit").click();
    await expect(tid(page, "cate-row-TBL_HR")).toContainText("추가");
    await expect(tid(page, "cate-transfer")).toBeVisible();
    await expect(tid(page, "cate-preview")).toContainText("TABLE 카테고리는 소속 목록이 곧 결과입니다");

    await tid(page, "cate-add-id").fill("RGX_CR");
    await tid(page, "cate-add-name").fill("냉연 식");
    await tid(page, "cate-add-kind").selectOption("REGEX");
    await tid(page, "cate-add-submit").click();
    await expect(tid(page, "cate-row-RGX_CR")).toContainText("추가");
    await expect(tid(page, "cate-regex-edit")).toBeVisible();
    await expect(tid(page, "cate-regex-name")).toHaveValue("냉연 식");
    await expect(tid(page, "cate-regex-target")).toHaveValue("CODE");
    await expect(tid(page, "cate-regex-expr")).toHaveValue(".*");
    await expect(tid(page, "cate-preview-summary")).toHaveText("3 / 3건 해당", { timeout: 20_000 });

    await tid(page, "cate-regex-expr").fill("CR.*");
    await expect(tid(page, "cate-preview-summary")).toHaveText("1 / 3건 해당", { timeout: 20_000 });
    await tid(page, "cate-regex-target").selectOption("LVL1");
    await tid(page, "cate-regex-expr").fill("HR");
    await expect(tid(page, "cate-preview-summary")).toHaveText("2 / 3건 해당", { timeout: 20_000 });
    await tid(page, "cate-regex-expr").fill("CR");
    await expect(tid(page, "cate-preview-summary")).toHaveText("1 / 3건 해당", { timeout: 20_000 });
    await expect(gridRow(tid(page, "cate-preview"), "CR01", "code").locator('.ag-cell[col-id="hitMark"]')).toHaveText("●");
    await layout(page, "codeCateEdit REGEX 편집");
    await snap(page, "dmc-codeCateEdit-02-regex");

    // 빈 TABLE 카테고리 하나를 남겨 확정 검사 2-2 경고를 받는다(TC-DMC-CNF-04).
    await tid(page, "cate-add-id").fill("TMP_EMPTY");
    await tid(page, "cate-add-name").fill("빈 묶음");
    await tid(page, "cate-add-kind").selectOption("TABLE");
    await tid(page, "cate-add-submit").click();

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    for (const c of ["TBL_HR", "RGX_CR", "TMP_EMPTY"]) {
      await expect(tid(page, `cate-row-${c}`), c).toBeVisible({ timeout: 20_000 });
      await expect(tid(page, `cate-row-${c}`)).not.toContainText("추가");
    }
    await expectRowVersionAbove(page, "cate-row-version", before);
    watcher.assertClean("codeCateEdit");
  });

  test("TC-DMC-CAT-03 TABLE 소속 — 검색·1차 필터·전체선택·Shift 범위·>·>>·<·<< 로 옮기고 저장한다", async () => {
    await tid(page, "cate-row-TBL_HR").locator("span").first().click();
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
    await layout(page, "codeCateEdit TABLE 소속");
    await snap(page, "dmc-codeCateEdit-03-transfer");

    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await button(page, "조회").click();
    await waitIdle(page);
    await tid(page, "cate-row-TBL_HR").locator("span").first().click();
    await expect(item("member", "HR01")).toBeVisible({ timeout: 20_000 });
    await expect(item("member", "HR02")).toBeVisible();
    await expect(item("available", "CR01")).toBeVisible();
    watcher.assertClean("codeCateEdit");
  });

  test("TC-DMC-CAT-04 수정(U) — 틀린 정규식은 미리보기·저장에서 막히고, [취소]로 되돌린 뒤 이름만 고쳐 저장한다", async () => {
    await tid(page, "cate-row-RGX_CR").locator("span").first().click();
    await expect(tid(page, "cate-regex-expr")).toHaveValue("CR");
    await tid(page, "cate-regex-name").fill("냉연 식 수정");
    await tid(page, "cate-regex-expr").fill("(");
    await expect(tid(page, "cate-row-RGX_CR")).toContainText("수정");
    await expect(tid(page, "cate-preview-invalid")).toHaveText("정규식 문법 오류로 해석하지 못했습니다", { timeout: 20_000 });
    await button(page, "저장").click();
    await expectErrorModal(page, "코드 저장 검사를 통과하지 못했습니다", "dmc-codeCateEdit-04-bad-regex");

    await tid(page, "cate-undo-RGX_CR").click();
    await expect(tid(page, "cate-regex-expr")).toHaveValue("CR");
    await expect(tid(page, "cate-row-RGX_CR")).not.toContainText("수정");

    await tid(page, "cate-regex-name").fill("냉연 식 수정");
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await button(page, "조회").click();
    await waitIdle(page);
    await expect(tid(page, "cate-row-RGX_CR")).toContainText("냉연 식 수정");
    watcher.assertClean("codeCateEdit");
  });

  test("TC-DMC-CAT-05 닫기 — [닫기]로 표시했다 [취소]하면 그대로, 금지 문자 ID 는 저장에서 거부된다", async () => {
    // 닫기 표시 중에는 [닫기] 버튼 대신 [취소]가 보이고 배지 "닫기"가 붙는다.
    await tid(page, "cate-close-TMP_EMPTY").click();
    await expect(tid(page, "cate-close-TMP_EMPTY")).toHaveCount(0);
    await expect(tid(page, "cate-row-TMP_EMPTY")).toContainText("닫기");
    await tid(page, "cate-undo-TMP_EMPTY").click();
    await expect(tid(page, "cate-undo-TMP_EMPTY")).toHaveCount(0);
    await expect(tid(page, "cate-close-TMP_EMPTY")).toBeVisible();
    // REGEX·TABLE 카테고리도 같은 방식으로 닫았다가 되돌릴 수 있다(저장하지 않는다).
    for (const c of ["RGX_CR", "TBL_HR"]) {
      await tid(page, `cate-close-${c}`).click();
      await expect(tid(page, `cate-undo-${c}`), c).toBeVisible();
      await tid(page, `cate-undo-${c}`).click();
      await expect(tid(page, `cate-close-${c}`), c).toBeVisible();
    }

    await tid(page, "cate-add-id").fill("BAD ID");
    await tid(page, "cate-add-name").fill("공백 ID");
    await tid(page, "cate-add-kind").selectOption("TABLE");
    await tid(page, "cate-add-submit").click();
    await button(page, "저장").click();
    await expectErrorModal(page, "코드 저장 검사를 통과하지 못했습니다", "dmc-codeCateEdit-05-bad-id");
    await tid(page, "cate-undo-BAD ID").click();
    await expect(tid(page, "cate-row-BAD ID")).toHaveCount(0);
    await assertAllButtonsPressed(page, "codeCateEdit");
    watcher.assertClean("codeCateEdit");
  });

  // ─────────── codeConfirm — 버전 확정(v1.000) ───────────

  test("TC-DMC-CNF-01 [확정 이동]으로 버전 확정 화면이 그 DRAFT 로 열린다", async () => {
    await go(page, "codeEdit");
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
    await expect(tid(page, `cf-row-${CODE}-1.000`)).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, `cf-row-${CODE}-1.000`)).toContainText(NAME2);
    await expect(tid(page, `cf-row-${CODE}-1.000`)).toContainText(STW);
    await tid(page, "cf-keyword").fill(`${CODE}_NONE`);
    await tid(page, "cf-search").click();
    await expect(tid(page, "cf-list-empty")).toHaveText("확정할 DRAFT 가 없습니다", { timeout: 20_000 });
    await tid(page, "cf-keyword").fill(CODE);
    await tid(page, "cf-search").click();
    await tid(page, `cf-row-${CODE}-1.000`).click();
    await expect(tid(page, `cf-row-${CODE}-1.000`)).toHaveAttribute("aria-selected", "true");
    watcher.assertClean("codeConfirm");
  });

  test("TC-DMC-CNF-03 검사 — 일시 없이 검사하면 안내, 검사 뒤 일시를 바꾸면 확정이 꺼지고 다시 검사해야 켜진다", async () => {
    await expect(tid(page, "cf-confirm")).toBeDisabled();
    await tid(page, "cf-validate").click();
    await expect(tid(page, "cf-error")).toHaveText("적용 시작 일시를 입력하세요");

    await tid(page, "cf-apply-from").fill(CONFIRM1.input);
    await tid(page, "cf-validate").click();
    await expect(tid(page, "cf-checks")).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "cf-check-status-3")).toHaveText("면제");
    await expect(tid(page, "cf-check-status-4")).toHaveText("면제");
    await expect(tid(page, "cf-check-status-2-2")).toHaveText("경고");
    await expect(tid(page, "cf-check-2-2")).toContainText("TMP_EMPTY");
    await expect(tid(page, "cf-check-status-1")).toHaveText("통과");
    await expect(tid(page, "cf-confirm")).toBeEnabled();

    await tid(page, "cf-apply-from").fill(CONFIRM1B.input);
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
    await expect(tid(page, `cf-row-${CODE}-1.000`)).toHaveCount(0);
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
    const row = gridRow(tid(page, "code-list"), CODE, "maruCodeId");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.locator('.ag-cell[col-id="maruCodeName"]')).toHaveText(NAME2);
    await expect(row.locator('.ag-cell[col-id="status"]')).toHaveText("INUSE");
    await expect(row.locator('.ag-cell[col-id="currentVerLabel"]')).toHaveText("v1.000");
    await expect(row.locator('.ag-cell[col-id="unappliedLabel"]')).toHaveText("없음");
    await tid(page, "code-search-status").selectOption("CREATED");
    await button(page, "조회").click();
    await expect(tid(page, "code-list-empty")).toBeVisible({ timeout: 20_000 });
    watcher.assertClean("codeMng");
  });

  // ─────────── 새 버전 v1.001 ───────────

  test("TC-DMC-EDT-09 새 버전 — 대화상자에서 종류·내용을 바꿔 보고 [취소], 다시 열어 빈 minor 버전을 만든다", async () => {
    await go(page, "codeEdit");
    await button(page, "조회").click();
    await waitIdle(page);
    await expect(tid(page, "header-status")).toHaveText("INUSE");
    // CR01 이 2차 칸(CRA)을 쓰므로 계층 칸 수를 1 로 줄이면 거부된다.
    await tid(page, "header-lvl").selectOption("1");
    await tid(page, "header-save").click();
    await expectErrorModal(page, "LVL2 에 값이 있는 코드가 있어 계층 칸 수를 1 로 줄일 수 없습니다", "dmc-codeEdit-09-lvl-reduce");
    await button(page, "조회").click();
    await expect(tid(page, "header-lvl")).toHaveValue("2", { timeout: 20_000 });
    await expect(versionRow(page, "1.000")).toContainText("확정");
    await expect(versionRow(page, "1.000")).toContainText(`${CONFIRM1B.date} 00:00:00`);
    await selectVersion(page, "1.000");
    // 확정 버전을 고르면 버전 조작 버튼은 모두 꺼지고, 새 버전·폐기가 켜진다.
    for (const b of ["ver-delete", "ver-lock", "ver-unlock", "ver-handover", "ver-confirm-move", "ver-item-edit", "ver-cate-edit"]) {
      await expect(tid(page, b), b).toBeDisabled();
    }
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
    await snapModal(page, "dmc-codeEdit-09-newver-modal");
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
    watcher.assertClean("codeEdit");
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
    const before = await rowVersion(page, "code-row-version");
    for (const c of ["HR01", "HR02", "CR01"]) {
      await expect(codeRow(page, c), c).toHaveCount(1);
      await expect(codeRow(page, c).getByRole("button", { name: "삭제" })).toBeVisible();
    }

    // 삭제: HR02 는 TBL_HR 소속이라 확인을 묻는다 — [취소]하면 아무 변경도 남지 않는다(저장해 보면 "저장할 변경이 없습니다").
    await codeRow(page, "HR02").getByRole("button", { name: "삭제" }).click();
    await expect(modal(page)).toContainText("카테고리 1개에서 함께 빠집니다. 삭제할까요?");
    await snapModal(page, "dmc-codeItemEdit-07-delete-confirm");
    await answerConfirm(page, "취소");
    await button(page, "저장").click();
    await expectErrorModal(page, "저장할 변경이 없습니다");

    // 수정: CR01 이름
    await editCell(codeGrid(page), codeRow(page, "CR01"), "name", "냉연 1호 변경");

    // [확인]이면 삭제로 표시된다.
    await codeRow(page, "HR02").getByRole("button", { name: "삭제" }).click();
    await answerConfirm(page, "확인");
    // 저장 전 "삭제" 배지는 TC-DMC-ITM-11 에서 따로 본다(행 칸이 갱신되지 않는 결함이 있으면 여정을 멈추지 않게).

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
    await screen(page).getByRole("tab", { name: "트리 보기" }).click();
    await expect(tid(page, "code-tree")).toContainText("HR01");
    await screen(page).getByRole("tab", { name: "코드 편집" }).click();
    await expect(codeGrid(page)).toBeVisible();
    await assertAllButtonsPressed(page, "codeItemEdit(RELEASED)");
    watcher.assertClean("codeItemEdit");
  });

  test("TC-DMC-CAT-06 삭제(D) — 새 버전에서 빈 카테고리를 닫고 저장하면 목록에서 빠진다", async () => {
    await go(page, "codeEdit");
    await selectVersion(page, "1.001");
    await tid(page, "ver-cate-edit").click();
    await expect(footerScreenId(page)).toHaveText("codeCateEdit", { timeout: 60_000 });
    await button(page, "조회").click();
    await waitIdle(page);
    await choose(page, "cate-ver-select", "1.001");
    await rowVersion(page, "cate-row-version");
    // HR02 를 지웠으니 TBL_HR 소속은 HR01 만 남는다.
    await tid(page, "cate-row-TBL_HR").locator("span").first().click();
    await expect(tid(page, "cate-transfer-item-member-HR01")).toBeVisible();
    await expect(tid(page, "cate-transfer-item-member-HR02")).toHaveCount(0);

    await tid(page, "cate-close-TMP_EMPTY").click();
    await expect(tid(page, "cate-undo-TMP_EMPTY")).toBeVisible();
    await button(page, "저장").click();
    await expectToast(page, "저장했습니다");
    await expect(tid(page, "cate-row-TMP_EMPTY")).toHaveCount(0, { timeout: 20_000 });
    await expect(tid(page, "cate-row-TBL_HR")).toBeVisible();
    watcher.assertClean("codeCateEdit");
  });

  test("TC-DMC-CNF-05 새 버전 검사 — 직전 대비 변경·카테고리 변화가 보이고, 직전보다 이른 일시는 거부된다", async () => {
    await go(page, "codeEdit");
    await selectVersion(page, "1.001");
    await tid(page, "ver-confirm-move").click();
    await expect(footerScreenId(page)).toHaveText("codeConfirm", { timeout: 60_000 });
    // 사용자가 목록에서 고른다(이미 열린 탭으로의 인계는 TC-DMC-LNK-03 에서 따로 본다).
    await tid(page, "cf-keyword").fill(CODE);
    await tid(page, "cf-search").click();
    await tid(page, `cf-row-${CODE}-1.001`).click();
    await expect(tid(page, "cf-target")).toHaveText(`${CODE} v1.001 MINOR`, { timeout: 20_000 });
    await expect(tid(page, "cf-previous")).toHaveText(`직전 RELEASED v1.000 · ${CONFIRM1B.date} 00:00:00`);
    const diff = tid(page, "cf-diff");
    await expect(diff).toContainText("HR02");
    await expect(diff).toContainText("삭제");
    await expect(diff).toContainText("냉연 1호 변경");
    await expect(tid(page, "cf-cate-TBL_HR")).toContainText("빠짐 HR02");
    await expect(tid(page, "cf-cate-TBL_HR")).toHaveAttribute("data-reduced", "true");

    await tid(page, "cf-apply-from").fill(TOO_EARLY.input);
    await tid(page, "cf-validate").click();
    await expect(tid(page, "cf-check-status-3")).toHaveText("거부", { timeout: 20_000 });
    await expect(tid(page, "cf-check-3")).toHaveAttribute("data-rejected", "true");
    await expect(tid(page, "cf-check-status-4")).toHaveText("통과");
    await expect(tid(page, "cf-confirm")).toBeDisabled();
    await layout(page, "codeConfirm 거부");
    await snap(page, "dmc-codeConfirm-05-rejected");
    watcher.assertClean("codeConfirm");
  });

  test("TC-DMC-EDT-10 삭제(D) — 새 버전 DRAFT 를 [취소] 한 번 뒤 삭제하면 확정 버전만 남는다", async () => {
    await go(page, "codeEdit");
    // 다른 화면을 거쳐 돌아왔다 — 누름 기록은 화면 구분 없이 하나라서, 폐기(EDT-12)까지의 codeEdit 커버리지를 여기서부터 다시 센다.
    await resetClicks(page);
    await button(page, "조회").click();
    await waitIdle(page);
    await selectVersion(page, "1.001");
    await tid(page, "ver-delete").click();
    await expect(modal(page)).toContainText("v1.001 DRAFT 를 삭제할까요? 이 버전에서 바꾼 코드·카테고리도 되돌립니다.");
    await snapModal(page, "dmc-codeEdit-10-delete-confirm");
    await answerConfirm(page, "취소");
    await expect(versionRow(page, "1.001")).toBeVisible();

    await tid(page, "ver-delete").click();
    await answerConfirm(page, "확인");
    await expectToast(page, "삭제했습니다");
    await expect(versionRow(page, "1.001")).toHaveCount(0, { timeout: 20_000 });
    await expect(versionRow(page, "1.000")).toBeVisible();
    await expect(tid(page, "ver-new-hint")).toHaveCount(0);
    watcher.assertClean("codeEdit");
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
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-EDT-12 폐기 — [취소]면 그대로, [확인]하면 DEPRECATED 가 되고 새 버전을 만들 수 없다", async () => {
    await expect(tid(page, "header-deprecate")).toBeEnabled();
    await tid(page, "header-deprecate").click();
    await expect(modal(page)).toContainText("폐기하면 새 버전을 만들 수 없습니다. 폐기할까요?");
    await snapModal(page, "dmc-codeEdit-12-deprecate-confirm");
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
    await layout(page, "codeEdit 폐기 뒤");
    await snap(page, "dmc-codeEdit-12-deprecated");
    await assertAllButtonsPressed(page, "codeEdit");
    watcher.assertClean("codeEdit");
  });

  test("TC-DMC-MNG-08 폐기 반영 — 상태 DEPRECATED 로 조회되고 INUSE 조건에서는 빠진다", async () => {
    await go(page, "codeMng");
    await tid(page, "code-search-keyword").fill(CODE);
    await tid(page, "code-search-status").selectOption("DEPRECATED");
    await button(page, "조회").click();
    const row = gridRow(tid(page, "code-list"), CODE, "maruCodeId");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.locator('.ag-cell[col-id="status"]')).toHaveText("DEPRECATED");
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

test.describe("dmc 화면 연결·넘기기·읽기 전용", () => {
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
      await expect(tid(page, "code-maru-select"), "넘겨받은 마루 코드").toHaveValue(id, { timeout: 20_000 });
      await expect(tid(page, "code-ver-select"), "넘겨받은 버전").toHaveValue("1.000");
      watcher.assertClean("codeEdit→codeItemEdit");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-LNK-02 [카테고리 편집]으로 열면 카테고리 화면에 그 마루 코드·버전이 골라져 있다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    try {
      const id = uid("LK2");
      await registerCode(page, id, `E2E 인계2 ${RUN}`);
      await selectVersion(page, "1.000");
      await tid(page, "ver-cate-edit").click();
      await expect(footerScreenId(page)).toHaveText("codeCateEdit", { timeout: 60_000 });
      await waitIdle(page);
      await snap(page, "dmc-link-02-codeCateEdit");
      await expect(tid(page, "cate-maru-select"), "넘겨받은 마루 코드").toHaveValue(id, { timeout: 20_000 });
      await expect(tid(page, "cate-ver-select"), "넘겨받은 버전").toHaveValue("1.000");
      watcher.assertClean("codeEdit→codeCateEdit");
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
      watcher.assertClean("codeEdit→codeConfirm");
    } finally {
      await page.context().close();
    }
  });

  test("TC-DMC-EDT-13 넘기기 — 내 DRAFT 를 다른 담당자에게 넘기면 그 사람이 편집 중이 된다", async ({ browser }, testInfo) => {
    const { page, watcher } = await openAs(browser, "stw", testInfo);
    const other = await openAs(browser, "stw2", testInfo);
    try {
      const id = uid("HND");
      await registerCode(page, id, `E2E 넘기기 ${RUN}`);
      await selectVersion(page, "1.000");
      await tid(page, "ver-handover").click();
      await tid(page, "handover-user").fill(STW2);
      await tid(page, "handover-ok").click();
      await waitIdle(page);
      await snap(page, "dmc-handover-result");
      await expect(errorBody(page), "넘기기 거부 문구").toHaveCount(0);
      await expectToast(page, "넘겼습니다");
      await expect(versionRow(page, "1.000")).toContainText(`잠김 · ${STW2} 편집 중`, { timeout: 20_000 });
      await expect(tid(page, "ver-item-edit")).toBeDisabled();

      await go(other.page, "codeEdit");
      await pickCode(other.page, id);
      await expect(versionRow(other.page, "1.000")).toContainText("편집 중(나)");
      watcher.assertClean("codeEdit");
      other.watcher.assertClean("codeEdit(stw2)");
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
      await choose(page, "code-maru-select", id);
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
      await choose(page, "code-maru-select", id);
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
      await choose(page, "code-maru-select", id);
      await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
      await addCodeRow(page, { code: "D1", name: "지울 행" });
      await button(page, "저장").click();
      await expectToast(page, "저장했습니다");
      await go(page, "codeConfirm");
      await tid(page, "cf-keyword").fill(id);
      await tid(page, "cf-search").click();
      await tid(page, `cf-row-${id}-1.000`).click();
      await tid(page, "cf-apply-from").fill(daysAgo(3).input);
      await tid(page, "cf-validate").click();
      await expect(tid(page, "cf-confirm")).toBeEnabled({ timeout: 20_000 });
      await tid(page, "cf-confirm").click();
      await tid(page, "cf-modal-ok").click();
      await expectToast(page, "확정했습니다");
      // 새 minor 버전에서 D1 을 삭제로 표시한다.
      await go(page, "codeEdit");
      await button(page, "조회").click();
      await waitIdle(page);
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

  test("TC-DMC-RO-01 표준관리자(std)는 dmc 를 조회만 한다 — 등록·수정·편집·검사·확정 버튼이 막힌다", async ({ browser }, testInfo) => {
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
      // codeMng — 조회는 되고(권한 조회가 끝났다는 뜻) 등록 저장은 꺼져 있다.
      await go(page, "codeMng");
      await expect(button(page, "조회")).toBeEnabled({ timeout: 30_000 });
      await tid(page, "code-search-keyword").fill(id);
      await button(page, "조회").click();
      await expect(gridRow(tid(page, "code-list"), id, "maruCodeId")).toHaveCount(1, { timeout: 20_000 });
      await expect(tid(page, "code-reg-save")).toBeDisabled();
      await snap(page, "dmc-ro-codeMng");

      // codeEdit — 헤더 입력과 모든 버튼이 꺼져 있다.
      await go(page, "codeEdit");
      await pickCode(page, id);
      await expect(tid(page, "header-name")).toBeDisabled();
      await expect(tid(page, "label-attr01")).toBeDisabled();
      await expect(tid(page, "header-save")).toBeDisabled();
      await expect(tid(page, "header-deprecate")).toBeDisabled();
      await selectVersion(page, "1.000");
      for (const b of ["ver-new-major", "ver-new-minor", "ver-delete", "ver-lock", "ver-unlock", "ver-handover", "ver-confirm-move", "ver-item-edit", "ver-cate-edit"]) {
        await expect(tid(page, b), `${b}(std)`).toBeDisabled();
      }
      await snap(page, "dmc-ro-codeEdit");

      // codeItemEdit — 읽기 전용, 저장·코드 추가가 없다.
      await go(page, "codeItemEdit");
      await choose(page, "code-maru-select", id);
      await expect(tid(page, "code-ver-select")).toHaveValue("1.000", { timeout: 20_000 });
      await expect(screen(page).getByText("읽기 전용 · diff 보기")).toBeVisible();
      await expect(button(page, "저장")).toHaveCount(0);
      await expect(tid(page, "code-add")).toHaveCount(0);

      // codeCateEdit — 저장·카테고리 추가가 없다.
      await go(page, "codeCateEdit");
      await choose(page, "cate-maru-select", id);
      await expect(tid(page, "cate-row-BASE")).toBeVisible({ timeout: 20_000 });
      await expect(screen(page).getByText("읽기 전용", { exact: true })).toBeVisible();
      await expect(button(page, "저장")).toHaveCount(0);
      await expect(tid(page, "cate-add-submit")).toHaveCount(0);

      // codeConfirm — 남의 DRAFT 를 골라도 검사·확정이 꺼져 있다.
      await go(page, "codeConfirm");
      await tid(page, "cf-keyword").fill(id);
      await tid(page, "cf-search").click();
      await tid(page, `cf-row-${id}-1.000`).click();
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
