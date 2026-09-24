import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * 카테고리 편집(codeCateEdit) — TSK-06-04 design.md §3 화면 스모크 넷.
 *
 *   T1 담당자: 메뉴(마루 MDM > 마스터코드 > 카테고리 편집)로 화면이 열린다(스모크 넷 1, 수용 기준 3).
 *   T2 담당자: E2E_CATE 는 카테고리 목록(REGEX 1개·TABLE 1개)이 서버 데이터로 채워지고, E2E_CATE_EMPTY 는 BASE 뿐인
 *              빈 상태다(스모크 넷 2). BASE 행에는 편집·닫기 버튼이 없다(수용 기준 2).
 *   T3 담당자: TABLE 카테고리에 코드 1건을 `>` 로 옮기고 저장 → 소속 목록 갱신(스모크 넷 3).
 *   T4 담당자: 정규식 문법 오류(`(` 미닫힘)를 저장 시도 → 오류 문구 노출(스모크 넷 4, 수용 기준 1).
 *
 * 전제(design.md §"서버·E2E 기동 방법"): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고, mcm 기동
 * 뒤 e2e/fixtures/mdm-rbac-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-codeCateEdit.sql 을 넣는다. 이 spec 은 E2E_CATE 의
 * TABLE 소속을 저장하므로 **같은 mdm.db 로 다시 돌릴 수 없다**. SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const BREADCRUMB = "마루 MDM > 마스터코드 > 카테고리 편집";
const SAVE_REJECTED = "코드 저장 검사를 통과하지 못했습니다";

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-06-04/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
}

async function openCodeCateEdit(page: Page) {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  await item(/^마루 MDM$/).click({ timeout: 20_000 });
  await item(/^마스터코드$/).click({ timeout: 20_000 });
  await item(/^카테고리 편집$/).click({ timeout: 20_000 });
  await expect(page.getByTestId("cate-maru-select")).toBeVisible({ timeout: 60_000 });
}

async function chooseCode(page: Page, id: string) {
  await expect(page.getByTestId("cate-maru-select").locator(`option[value="${id}"]`)).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("cate-maru-select").selectOption(id);
  await page.getByRole("button", { name: "조회", exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("mdm codeCateEdit — 카테고리 편집", () => {
  test.setTimeout(150_000);

  test("T1 담당자: 메뉴로 화면이 열린다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeCateEdit(page);

    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await page.screenshot({ path: screenshot("dmc-codeCateEdit-open.png"), fullPage: true });
  });

  test("T2 담당자: 서버 데이터와 빈 상태, BASE 는 편집·닫기 버튼이 없다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeCateEdit(page);

    await chooseCode(page, "E2E_CATE");
    await expect(page.getByTestId("cate-row-RGX1")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-row-TBL1")).toBeVisible();
    await expect(page.getByTestId("cate-close-BASE")).toHaveCount(0);
    await expect(page.getByTestId("cate-close-RGX1")).toHaveCount(1);
    await page.screenshot({ path: screenshot("dmc-codeCateEdit-list.png"), fullPage: true });

    await chooseCode(page, "E2E_CATE_EMPTY");
    await expect(page.getByTestId("cate-row-BASE")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-list").locator('[data-testid^="cate-row-"]')).toHaveCount(1);
    await page.screenshot({ path: screenshot("dmc-codeCateEdit-empty.png"), fullPage: true });
  });

  test("T3 담당자: TABLE 카테고리에 코드를 옮기고 저장하면 소속 목록이 갱신된다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeCateEdit(page);
    await chooseCode(page, "E2E_CATE");

    await page.getByTestId("cate-row-TBL1").click();
    await expect(page.getByTestId("cate-transfer")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-transfer-item-available-B")).toBeVisible();
    await page.getByTestId("cate-transfer-item-available-B").click();
    await page.getByTestId("cate-transfer-move-right").click();
    await expect(page.getByTestId("cate-transfer-item-member-B")).toBeVisible();

    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmc-codeCateEdit-saved.png"), fullPage: true });

    // 다시 읽은 소속 목록에 B 가 반영됐는지 재조회로 확인한다.
    await chooseCode(page, "E2E_CATE");
    await page.getByTestId("cate-row-TBL1").click();
    await expect(page.getByTestId("cate-transfer-item-member-B")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-transfer-item-member-A")).toBeVisible();
  });

  test("T4 담당자: 정규식 문법 오류는 저장이 거부되고 오류 문구가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeCateEdit(page);
    await chooseCode(page, "E2E_CATE");

    await page.getByTestId("cate-row-RGX1").click();
    await expect(page.getByTestId("cate-regex-edit")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("cate-regex-expr").fill("(");

    await page.getByRole("button", { name: "저장", exact: true }).click();
    const modal = page.locator(".error-modal__body");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal).toContainText(SAVE_REJECTED);
    await page.screenshot({ path: screenshot("dmc-codeCateEdit-error.png"), fullPage: true });
    await page.getByRole("button", { name: "확인" }).click();
  });
});
