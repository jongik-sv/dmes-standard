import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 코드 편집(codeItemEdit) — TSK-06-03 design.md §4.9 화면 스모크 넷 + 카테고리 탭(TSK-06-04 design.md §3 스모크 넷,
 * 2026-09-28 카테고리 편집 화면을 합침 D-101 — 옛 mdm-codeCateEdit.spec.ts T1~T4 를 T7~T10 으로 옮겼다).
 *
 *   T1 담당자: 메뉴(마루 MDM > 마스터코드 > 코드 편집)로 화면이 열린다(스모크 넷 1, 수용 기준 3).
 *   T2 담당자: 빈 마루 코드는 빈 상태, E2E_PROC 는 서버 데이터와 기본 버전 v2.000 DRAFT(스모크 넷 2).
 *   T3 담당자: 코드 추가 → 저장 → 다시 읽은 그리드에 새 행·추가 배지·row_version 1(스모크 넷 3).
 *   T4 담당자: 코드 `A B` 저장 → 서버 거부 오류 모달 + 행 이슈(스모크 넷 4).
 *   T5 담당자: v1.000 RELEASED 는 읽기 전용 + 경미 수정(83 통과, 82 는 DRAFT에서 고치세요)(수용 기준 2·5·6).
 *   T6 담당자: E2E_STEEL 트리 보기 → KS-3 노드 → 이 노드로 편집 → 5행 거르기(수용 기준 4 화면).
 *   T7 담당자: 카테고리 탭 — 탭이 코드·트리·카테고리 셋이고, 마루 코드를 고르기 전에는 빈 상태다.
 *   T8 담당자: 카테고리 탭 — E2E_CATE 는 카테고리 목록(REGEX 1개·TABLE 1개)이 서버 데이터로 채워지고, E2E_CATE_EMPTY 는
 *              BASE 뿐인 빈 상태다. BASE 행에는 편집·닫기 버튼이 없다(06-04 수용 기준 2).
 *   T9 담당자: TABLE 카테고리에 코드 1건을 `>` 로 옮기고 상단 [저장] 한 번 → 소속 목록 갱신.
 *   T10 담당자: 정규식 문법 오류(`(` 미닫힘)를 저장 시도 → 오류 문구 + 카테고리 목록 행 이슈·탭 표시(06-04 수용 기준 1).
 *   T11 담당자: 코드 탭에서 추가만 하고 저장하지 않은 코드가 TABLE 카테고리 transfer 후보에 `미저장` 으로 보이고, 옮긴 뒤
 *              [저장] 한 번으로 코드와 소속이 함께 저장된다.
 *
 * 전제(design.md §4.11): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고, mcm 기동 뒤
 * e2e/fixtures/mdm-rbac-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-codeItemEdit.sql 과 e2e/fixtures/mdm-codeCateEdit.sql
 * (E2E_CATE·E2E_CATE_EMPTY) 을 넣는다. 이 spec 은 코드 행·소속을 만들기 때문에 **같은 mdm.db 로 다시 돌릴 수
 * 없다**(새 mdm.db + 픽스처로 다시 시작). dmc 에서 담당자는 CONFIRM 세트라 저장할 수 있고 표준 관리자는 READ 라
 * 저장이 403 이다. SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const SUFFIX = Date.now().toString(36).toUpperCase();

const BREADCRUMB = "마루 MDM > 마스터코드 > 코드 편집";
const SAVE_REJECTED = "코드 저장 검사를 통과하지 못했습니다";

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-06-03/screens", name);
const cateScreenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-06-04/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
}

async function openCodeItemEdit(page: Page) {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  await item(/^마루 MDM$/).click({ timeout: 20_000 });
  await item(/^마스터코드$/).click({ timeout: 20_000 });
  await item(/^코드 편집$/).click({ timeout: 20_000 });
  await expect(page.getByTestId("code-pick-keyword")).toBeVisible({ timeout: 60_000 });
}

async function chooseCode(page: Page, id: string) {
  await page.getByTestId("code-pick-keyword").fill(id);
  await page.getByTestId("code-pick-keyword").press("Enter");
  await page.getByTestId(`code-pick-${id}`).click({ timeout: 20_000 });
  await expect(page.getByTestId("code-current")).toContainText(id, { timeout: 20_000 });
}

async function openCateTab(page: Page) {
  await page.getByTestId("code-tab-cate").click();
  await expect(page.getByTestId("cate-tab")).toBeVisible({ timeout: 20_000 });
}

function grid(page: Page): Locator {
  return page.getByTestId("code-grid");
}

/** 코드 칸이 글자 그대로 같은 그리드 행. */
function gridRow(page: Page, code: string): Locator {
  const exact = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return grid(page).locator(".ag-center-cols-container .ag-row")
    .filter({ has: page.locator('.ag-cell[col-id="code"]', { hasText: exact }) });
}

async function editCell(page: Page, rowIndex: number, colId: string, value: string) {
  const cell = grid(page).locator(`.ag-center-cols-container .ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`);
  await expect(cell).toBeVisible({ timeout: 10_000 });
  const editor = cell.locator("input");
  // 새 행을 넣은 직후에는 그리드가 다시 그려지는 중이라 첫 클릭이 편집을 시작하지 못할 수 있다 — 열릴 때까지 누른다.
  await expect(async () => {
    await cell.click();
    await expect(editor).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await editor.fill(value);
  await editor.press("Enter");
  await expect(cell).toHaveText(value, { timeout: 5_000 });
}

async function addCode(page: Page, code: string, name?: string) {
  await page.getByTestId("code-add").click();
  await editCell(page, 0, "code", code);
  if (name !== undefined) await editCell(page, 0, "name", name);
}

test.describe.configure({ mode: "serial" });

test.describe("mdm codeItemEdit — 코드 편집", () => {
  test.setTimeout(150_000);

  test("T1 담당자: 메뉴로 화면이 열린다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);

    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await page.screenshot({ path: screenshot("dmc-codeItemEdit-open.png"), fullPage: true });
  });

  test("T2 담당자: 빈 상태와 서버 데이터", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);

    await chooseCode(page, "E2E_EMPTY");
    await expect(page.getByTestId("code-grid-empty")).toHaveText("보일 코드가 없습니다", { timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmc-codeItemEdit-empty.png"), fullPage: true });

    await chooseCode(page, "E2E_PROC");
    for (const code of ["1P", "82", "83"]) {
      await expect(gridRow(page, code)).toHaveCount(1, { timeout: 20_000 });
    }
    await expect(page.getByTestId("code-ver-select")).toHaveValue("2.000");
    await expect(page.getByTestId("code-ver-select").locator("option:checked")).toHaveText("v2.000 DRAFT");
    await expect(page.getByTestId("code-grid-empty")).toHaveCount(0);
  });

  test("T3 담당자: 코드 추가 → 저장 → 다시 읽은 그리드에 반영", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);
    await chooseCode(page, "E2E_PROC");
    await expect(gridRow(page, "1P")).toHaveCount(1, { timeout: 20_000 });

    const code = `T${SUFFIX}`;
    await addCode(page, code, "E2E 추가");
    await page.getByRole("button", { name: "저장", exact: true }).click();

    await expect(page.getByText("저장했습니다")).toBeVisible({ timeout: 20_000 });
    await expect(gridRow(page, code)).toHaveCount(1, { timeout: 20_000 });
    await expect(gridRow(page, code).locator('.ag-cell[col-id="__change"]')).toContainText("추가");
    await expect(page.getByTestId("code-row-version")).toHaveText("row_version = 1");
    await page.screenshot({ path: screenshot("dmc-codeItemEdit-saved.png"), fullPage: true });
  });

  test("T4 담당자: 콤마·공백 코드는 서버가 거부하고 행에 이슈가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);
    await chooseCode(page, "E2E_PROC");
    await expect(gridRow(page, "1P")).toHaveCount(1, { timeout: 20_000 });

    await addCode(page, "A B");
    await page.getByRole("button", { name: "저장", exact: true }).click();

    const modal = page.locator(".error-modal__body");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal).toContainText(SAVE_REJECTED);
    await expect(page.getByTestId("code-row-issue-A B")).toContainText("콤마·공백", { timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmc-codeItemEdit-error.png"), fullPage: true });
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByTestId("code-row-version")).toHaveText("row_version = 1");
  });

  test("T5 담당자: RELEASED 는 읽기 전용이고 경미 수정만 한다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);
    await chooseCode(page, "E2E_PROC");
    await expect(gridRow(page, "1P")).toHaveCount(1, { timeout: 20_000 });

    await page.getByTestId("code-ver-select").selectOption("1.000");
    await expect(page.getByTestId("code-ver-select")).toHaveValue("1.000");
    await expect(page.getByTestId("patch-panel")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "저장", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("code-add")).toHaveCount(0);

    await gridRow(page, "83").locator('.ag-cell[col-id="code"]').click();
    await expect(page.getByTestId("patch-code")).toHaveValue("83");
    await expect(page.getByTestId("patch-code")).toBeDisabled();
    await page.getByTestId("patch-name").fill("3CGL-E2E");
    await page.getByTestId("patch-save").click();
    await expect(page.getByText("경미 수정했습니다")).toBeVisible({ timeout: 20_000 });
    await expect(gridRow(page, "83").locator('.ag-cell[col-id="name"]')).toHaveText("3CGL-E2E", { timeout: 20_000 });

    await gridRow(page, "82").locator('.ag-cell[col-id="code"]').click();
    await expect(page.getByTestId("patch-code")).toHaveValue("82");
    await expect(page.getByTestId("patch-save")).toBeDisabled();
    await expect(page.getByTestId("patch-blocked")).toHaveText("DRAFT에서 고치세요");
    await page.screenshot({ path: screenshot("dmc-codeItemEdit-patch.png"), fullPage: true });
  });

  test("T6 담당자: 트리 보기에서 노드를 골라 그 아래만 편집한다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);
    await chooseCode(page, "E2E_STEEL");
    await expect(gridRow(page, "KS-9")).toHaveCount(1, { timeout: 20_000 });

    await page.getByTestId("code-tab-tree").click();
    const tree = page.getByTestId("code-tree");
    const roots = tree.locator('[role="treeitem"][data-level="1"] > .tree-item .tree-item__label');
    await expect(roots).toHaveText(["JIS (2건)", "KS (6건)"], { timeout: 20_000 });
    await tree.locator(".tree-item").filter({ hasText: /^KS-3 \(5건\)$/ }).click();
    await page.screenshot({ path: screenshot("dmc-codeItemEdit-tree.png"), fullPage: true });

    await page.getByTestId("code-tree-to-grid").click();
    await expect(grid(page)).toBeVisible();
    await expect(page.getByTestId("code-filter-chip")).toContainText("KS-3 아래");
    await expect(grid(page).locator(".ag-center-cols-container .ag-row")).toHaveCount(5, { timeout: 20_000 });
  });
  test("T7 담당자: 탭은 코드·트리·카테고리 셋이고 마루 코드를 고르기 전 카테고리 탭은 빈 상태다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);

    await expect(page.getByTestId("code-tab-grid")).toHaveText("코드");
    await expect(page.getByTestId("code-tab-tree")).toHaveText("트리");
    await expect(page.getByTestId("code-tab-cate")).toHaveText("카테고리");
    await page.getByTestId("code-tab-cate").click();
    await expect(page.getByTestId("cate-empty")).toHaveText("마루 코드를 고르세요");
    await page.screenshot({ path: cateScreenshot("dmc-codeItemEdit-cate-open.png"), fullPage: true });
  });

  test("T8 담당자: 카테고리 탭 — 서버 데이터와 빈 상태, BASE 는 편집·닫기 버튼이 없다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);

    await chooseCode(page, "E2E_CATE");
    await openCateTab(page);
    await expect(page.getByTestId("cate-row-RGX1")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-row-TBL1")).toBeVisible();
    await expect(page.getByTestId("cate-close-BASE")).toHaveCount(0);
    await expect(page.getByTestId("cate-close-RGX1")).toHaveCount(1);
    await page.screenshot({ path: cateScreenshot("dmc-codeItemEdit-cate-list.png"), fullPage: true });

    await chooseCode(page, "E2E_CATE_EMPTY");
    await expect(page.getByTestId("cate-row-BASE")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-list").locator('[data-testid^="cate-row-"]')).toHaveCount(1);
    await page.getByTestId("cate-row-BASE").click();
    await expect(page.getByTestId("cate-base-readonly")).toBeVisible();
    await page.screenshot({ path: cateScreenshot("dmc-codeItemEdit-cate-empty.png"), fullPage: true });
  });

  test("T9 담당자: TABLE 카테고리에 코드를 옮기고 [저장] 한 번이면 소속 목록이 갱신된다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);
    await chooseCode(page, "E2E_CATE");
    await openCateTab(page);

    await page.getByTestId("cate-row-TBL1").click();
    await expect(page.getByTestId("cate-transfer")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-transfer-item-available-B")).toBeVisible();
    await page.getByTestId("cate-transfer-item-available-B").click();
    await page.getByTestId("cate-transfer-move-right").click();
    await expect(page.getByTestId("cate-transfer-item-member-B")).toBeVisible();

    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: cateScreenshot("dmc-codeItemEdit-cate-saved.png"), fullPage: true });

    // 다시 읽은 소속 목록에 B 가 반영됐는지 재조회로 확인한다.
    await chooseCode(page, "E2E_CATE");
    await openCateTab(page);
    await page.getByTestId("cate-row-TBL1").click();
    await expect(page.getByTestId("cate-transfer-item-member-B")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-transfer-item-member-A")).toBeVisible();
  });

  test("T10 담당자: 정규식 문법 오류는 저장이 거부되고 오류 문구·카테고리 이슈가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);
    await chooseCode(page, "E2E_CATE");
    await openCateTab(page);

    await page.getByTestId("cate-row-RGX1").click();
    await expect(page.getByTestId("cate-regex-edit")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("cate-regex-expr").fill("(");

    await page.getByRole("button", { name: "저장", exact: true }).click();
    const modal = page.locator(".error-modal__body");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal).toContainText(SAVE_REJECTED);
    await page.screenshot({ path: cateScreenshot("dmc-codeItemEdit-cate-error.png"), fullPage: true });
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByTestId("cate-row-issue-RGX1")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("code-tab-cate-issue")).toBeVisible();
  });

  test("T11 담당자: 저장하지 않은 새 코드도 TABLE 후보에 보이고 [저장] 한 번으로 코드와 소속이 함께 저장된다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeItemEdit(page);
    await chooseCode(page, "E2E_CATE");
    await expect(gridRow(page, "A")).toHaveCount(1, { timeout: 20_000 });

    const code = `N${SUFFIX}`;
    await addCode(page, code, "E2E 새 코드");
    await openCateTab(page);
    await page.getByTestId("cate-row-TBL1").click();
    await page.getByTestId("cate-transfer-search").fill(code);
    await expect(page.getByTestId(`cate-transfer-item-available-${code}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`cate-transfer-mark-${code}`)).toHaveText("미저장");
    await page.getByTestId(`cate-transfer-item-available-${code}`).click();
    await page.getByTestId("cate-transfer-move-right").click();
    await expect(page.getByTestId(`cate-transfer-item-member-${code}`)).toBeVisible();

    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("cate-row-TBL1").click();
    await page.getByTestId("cate-transfer-search").fill(code);
    await expect(page.getByTestId(`cate-transfer-item-member-${code}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`cate-transfer-mark-${code}`)).toHaveCount(0);
  });
});
