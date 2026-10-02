import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 컬럼 사전(columnMng) + 용어 인라인 등록 팝업(termRegPop) — TSK-04-04 design.md §3.5.
 *
 *   E1 표준 관리자: 메뉴 이동, breadcrumb, 빈 목록 상태(스모크 넷 1·2, 수용 기준 3).
 *   E2 표준 관리자: `원재료 코일두께 편차` 분해 → 4번째 `***` → 적용 → 저장 → 화면 선검사 오류(수용 기준 4).
 *   E3 표준 관리자: `***` → 팝업 유사어(오차)·약어 제안(DEV)·등록 → 미리보기 RMTL_COIL_THK_DEV·추천 도메인 THK_DEV.
 *   E4 표준 관리자: 적용 → 짧은 표시명 비움 → 시스템 행 2개 → 저장 → 목록에 새 행, 표시명 폴백(스모크 넷 3, 수용 기준 2).
 *   E5 표준 관리자: 다른 컬럼에 같은 ERP 필드명 → 서버 MDM018 오류 모달(스모크 넷 4, 수용 기준 1), 실제 필드명 검색·역분해.
 *   E6 담당자: 팝업 [등록] 비활성·안내 문구, [저장] 비활성, BFF 403(수용 기준 5).
 *
 * 전제(design.md §3.6): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고, mcm 기동 뒤
 * e2e/fixtures/mdm-rbac-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-columnMng-dict.sql 을 넣는다.
 * 이 spec 은 용어·컬럼을 만들기 때문에 **같은 mdm.db 로 다시 돌릴 수 없다**(새 mdm.db + 픽스처로 다시 시작).
 * 쓰기 단계는 모두 표준 관리자로 한다 — admin(SYSADMIN)은 서버가 거부한다(D1).
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const BREADCRUMB = "마루 MDM > 용어·도메인 > 컬럼 사전";
const PLACEHOLDER_ERROR = "미등록 용어(***)가 남아 있어 저장할 수 없습니다";
const SYSTEM_FIELD_ERROR = "한 시스템 안에서 필드명 하나는 컬럼 하나에만 붙일 수 있습니다";

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-04-04/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
}

async function openColumnMng(page: Page) {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  await item(/^마루 MDM$/).click({ timeout: 20_000 });
  await item(/^용어·도메인$/).click({ timeout: 20_000 });
  await item(/^컬럼 사전$/).click({ timeout: 20_000 });
  await expect(page.getByTestId("column-list")).toBeVisible({ timeout: 60_000 });
}

async function decompose(page: Page, input: string) {
  await page.getByTestId("gen-input").fill(input);
  await page.getByTestId("gen-decompose").click();
  await expect(page.getByTestId("token-row-1")).toBeVisible({ timeout: 20_000 });
}

/** 논리명 칸이 글자 그대로 같은 목록 행(부분 문자열로 다른 행이 걸리지 않게). */
function listRow(page: Page, columnName: string): Locator {
  const exact = new RegExp(`^${columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return page
    .getByTestId("column-list")
    .locator(".ag-center-cols-container .ag-row")
    .filter({ has: page.locator('.ag-cell[col-id="columnName"]', { hasText: exact }) });
}

/** 시스템 그리드 n번째(0부터) 행의 셀. */
function systemCell(page: Page, rowIndex: number, colId: string): Locator {
  return page
    .getByTestId("system-grid")
    .locator(`.ag-center-cols-container .ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`);
}

async function addSystemRow(page: Page, rowIndex: number, systemCode: string, fieldName?: string) {
  await page.getByTestId("system-grid").getByRole("button", { name: "행추가" }).click();
  const systemCellLocator = systemCell(page, rowIndex, "systemCode");
  await expect(systemCellLocator).toBeVisible({ timeout: 10_000 });
  await systemCellLocator.click();
  await systemCellLocator.locator("select").selectOption(systemCode);
  await expect(systemCellLocator).toHaveText(systemCode, { timeout: 5_000 });
  if (fieldName !== undefined) {
    const fieldCell = systemCell(page, rowIndex, "physName");
    await fieldCell.click();
    const editor = fieldCell.locator("input");
    await editor.fill(fieldName);
    await editor.press("Enter");
    await expect(fieldCell).toHaveText(fieldName, { timeout: 5_000 });
  }
}

async function errorModalText(page: Page): Promise<Locator> {
  const modal = page.locator(".error-modal__body");
  await expect(modal).toBeVisible({ timeout: 20_000 });
  return modal;
}

async function closeErrorModal(page: Page) {
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.locator(".error-modal__body")).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test.describe("mdm columnMng — 컬럼 사전", () => {
  test.setTimeout(150_000);

  test("E1 표준 관리자: 메뉴로 화면이 열리고 빈 목록 상태가 보인다", async ({ page }) => {
    await login(page, STDADMIN);
    await openColumnMng(page);

    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await expect(page.getByTestId("column-list-empty")).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: screenshot("dma-columnMng-empty.png"), fullPage: true });
  });

  test("E2~E4 표준 관리자: 분해 → *** 저장 거부 → 인라인 등록 → 저장", async ({ page }) => {
    await login(page, STDADMIN);
    await openColumnMng(page);

    // E2 — 미등록 토큰은 *** 로 남고 저장이 막힌다.
    await decompose(page, "원재료 코일두께 편차");
    await expect(page.getByTestId("token-row-4")).toBeVisible();
    await expect(page.getByTestId("token-placeholder-4")).toBeVisible();
    await expect(page.getByTestId("gen-preview")).toHaveText("RMTL_COIL_THK_***");
    await expect(page.getByTestId("gen-domain")).toHaveValue("");
    await page.getByTestId("gen-apply").click();
    await expect(page.getByTestId("form-phys-name")).toHaveValue("RMTL_COIL_THK_***");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(await errorModalText(page)).toContainText(PLACEHOLDER_ERROR);
    await page.screenshot({ path: screenshot("dma-columnMng-generate.png"), fullPage: true });
    await closeErrorModal(page);
    await expect(page.getByTestId("column-list-empty")).toBeVisible();

    // E3 — *** 자리에서 팝업 → 유사어 확인 → 약어 제안 → 등록.
    await page.getByTestId("token-placeholder-4").click();
    const pop = page.getByTestId("term-pop");
    await expect(pop).toBeVisible({ timeout: 20_000 });
    await expect(pop.getByTestId("term-pop-similar")).toContainText("오차", { timeout: 20_000 });
    await expect(pop.getByTestId("term-pop-term-name")).toHaveValue("편차");
    await expect(pop.getByTestId("term-pop-sense-no")).toHaveValue("1");
    await pop.getByTestId("term-pop-eng-name").fill("Deviation");
    await pop.getByTestId("term-pop-abbr-suggest").click();
    await expect(pop.getByTestId("term-pop-abbr")).toHaveValue("DEV", { timeout: 20_000 });
    await pop.getByTestId("term-pop-definition").fill("기준값과 실제값의 차이");
    await page.screenshot({ path: screenshot("dma-termRegPop.png"), fullPage: true });
    await page.getByTestId("term-pop-reg").click();
    await expect(page.getByTestId("term-pop")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId("gen-preview")).toHaveText("RMTL_COIL_THK_DEV", { timeout: 20_000 });
    await expect(page.getByTestId("gen-domain").locator("option:checked")).toHaveText("두께 편차 (THK_DEV)");

    // E4 — 적용 → 짧은 표시명 비움 → 시스템 행 2개 → 저장.
    await page.getByTestId("gen-apply").click();
    await expect(page.getByTestId("form-phys-name")).toHaveValue("RMTL_COIL_THK_DEV");
    await expect(page.getByTestId("form-label-short")).toHaveValue("코일두께편차");
    await page.getByTestId("form-label-short").fill("");
    await addSystemRow(page, 0, "MES", "RMTL_COIL_THK_DEV");
    await addSystemRow(page, 1, "ERP");
    await expect(systemCell(page, 1, "physName")).toHaveText("ZZ_RMTL_COIL_THK_DEV");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다")).toBeVisible({ timeout: 20_000 });
    const saved = listRow(page, "원재료 코일 두께 편차");
    await expect(saved).toHaveCount(1, { timeout: 20_000 });
    await expect(saved.locator('.ag-cell[col-id="labels"]')).toHaveText(
      "원재료 코일 두께 편차 / 원재료 코일 두께 편차 / 원재료 코일 두께 편차",
    );
    await expect(saved.locator('.ag-cell[col-id="systemFields"]')).toHaveText("ERP:ZZ_RMTL_COIL_THK_DEV, MES:RMTL_COIL_THK_DEV");
    await page.screenshot({ path: screenshot("dma-columnMng-saved.png"), fullPage: true });
  });

  test("E5 표준 관리자: 같은 시스템 필드명의 두 번째 등록은 서버가 거부한다", async ({ page }) => {
    await login(page, STDADMIN);
    await openColumnMng(page);
    // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 앞 시나리오가 저장한 컬럼이 보인다.
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(listRow(page, "원재료 코일 두께 편차")).toHaveCount(1, { timeout: 20_000 });

    await page.getByRole("button", { name: "신규", exact: true }).click();
    await decompose(page, "코일 두께");
    await expect(page.getByTestId("gen-preview")).toHaveText("COIL_THK");
    await page.getByTestId("gen-apply").click();
    await expect(page.getByTestId("form-domain")).toHaveValue("코일 두께");
    await addSystemRow(page, 0, "ERP", "ZZ_RMTL_COIL_THK_DEV");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(await errorModalText(page)).toContainText(SYSTEM_FIELD_ERROR);
    await expect(page.locator(".error-modal__body")).toContainText("ERP·ZZ_RMTL_COIL_THK_DEV");
    await page.screenshot({ path: screenshot("dma-columnMng-dup-error.png"), fullPage: true });
    await closeErrorModal(page);
    await expect(listRow(page, "코일 두께")).toHaveCount(0);

    // 실제 필드명 검색(대소문자 무시)으로 기존 컬럼을 찾는다.
    await page.getByTestId("column-search-keyword").fill("zz_rmtl_coil_thk_dev");
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(page.getByTestId("column-list").locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 20_000 });
    await expect(listRow(page, "원재료 코일 두께 편차")).toHaveCount(1);

    // 역분해 — 용어로 분해가 안 되는 실제 필드명은 시스템 매핑에서 찾는다.
    await page.getByTestId("gen-direction").selectOption("REVERSE");
    await decompose(page, "ZZ_RMTL_COIL_THK_DEV");
    await expect(page.getByTestId("gen-duplicates")).toContainText("SYSTEM_FIELD");
    await expect(page.getByTestId("gen-duplicates")).toContainText("ERP");
  });

  test("E6 담당자: 인라인 등록과 저장을 할 수 없다", async ({ page }) => {
    await login(page, STEWARD);
    await openColumnMng(page);

    await expect(page.getByRole("button", { name: "저장", exact: true })).toBeDisabled({ timeout: 20_000 });
    await decompose(page, "코일 너비");
    await page.getByTestId("token-placeholder-2").click();
    const pop = page.getByTestId("term-pop");
    await expect(pop).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("term-pop-reg")).toBeDisabled();
    await expect(pop.getByTestId("term-pop-no-permission")).toHaveText(
      "용어 등록은 표준 관리자만 할 수 있습니다. 표준 관리자에게 요청하세요",
    );
    await page.screenshot({ path: screenshot("dma-termRegPop-steward.png"), fullPage: true });

    const reg = await page.request.post(`${BASE_URL}/api/mdm/oasis/termRegPop/reg`, {
      data: { meta: { menuId: "termRegPop" }, params: { termName: "너비", senseNo: 1, definition: "d", engAbbr: "WID" } },
    });
    expect(reg.status()).toBe(403);
    expect((await reg.json()).error?.code).toBe("FORBIDDEN");
    const save = await page.request.post(`${BASE_URL}/api/mdm/oasis/columnMng/save`, {
      data: { meta: { menuId: "columnMng" }, params: { columnName: "코일" }, grids: { systems: { rows: [] }, terms: { rows: [] } } },
    });
    expect(save.status()).toBe(403);
    expect((await save.json()).error?.code).toBe("FORBIDDEN");
  });
});
