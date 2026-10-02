import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * mdm dma/termMng(용어 관리) smoke — TSK-04-02 design.md §3.1.
 *
 * 스모크 넷:
 *   1. 메뉴 이동.
 *   2. 빈 상태.
 *   3. 등록 1회 + 채워짐 + 유사어 추천(A-RECO, 1차 문자열) + "동의어로 확정"(D12(a)).
 *   4. 서버 오류 노출 — (표기, 의미 번호) 중복 저장 거부(I6).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const SUFFIX = Date.now().toString(36);
const NOMATCH_KEYWORD = `__E2E_NOMATCH_${SUFFIX}__`;
const TERM1_NAME = `테스트용어${SUFFIX}`;
const TERM1_DEF = `e2e 확인용 ${SUFFIX}`;
const TERM2_NAME = `테스트용어${SUFFIX}B`; // TERM1_NAME 을 포함(부분 일치 0.9, I18)
const TERM2_DEF = `e2e 확인용 ${SUFFIX} 두번째`;

const screenshot = (name: string) =>
  path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-04-02/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
}

async function openTermMng(page: Page) {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();

  const moduleFolder = item(/^마루 MDM$/);
  await expect(moduleFolder).toBeVisible({ timeout: 20_000 });
  await moduleFolder.click();

  const groupFolder = item(/^용어·도메인$/);
  await expect(groupFolder).toBeVisible({ timeout: 20_000 });
  await groupFolder.click();

  const leaf = item(/^용어 관리$/);
  await expect(leaf).toBeVisible({ timeout: 20_000 });
  await leaf.click();

  await expect(page.getByRole("button", { name: "등록" })).toBeVisible({ timeout: 60_000 });
}

function searchField(page: Page, label: string) {
  return page.locator(".search-field", { hasText: label });
}

function detailRow(page: Page, label: string) {
  return page.locator("tr", { hasText: label });
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dma/termMng smoke", () => {
  test.setTimeout(150_000);

  test("T1 메뉴 이동: 용어 관리 화면이 열린다", async ({ page }) => {
    await login(page, STDADMIN);
    await openTermMng(page);
    await page.screenshot({ path: screenshot("dma-termMng-open.png"), fullPage: true });
  });

  test("T2 빈 상태: 없는 키워드로 검색하면 빈 상태가 보인다", async ({ page }) => {
    await login(page, STDADMIN);
    await openTermMng(page);

    await searchField(page, "검색어").locator("input").fill(NOMATCH_KEYWORD);
    await page.getByRole("button", { name: "조회" }).click();
    await expect(page.getByText("0건")).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: screenshot("dma-termMng-empty.png"), fullPage: true });
  });

  test("T3 등록 + 유사어 추천 + 동의어 확정", async ({ page }) => {
    await login(page, STDADMIN);
    await openTermMng(page);

    await searchField(page, "검색어").locator("input").fill("");
    await page.getByRole("button", { name: "조회" }).click();

    // 첫 번째 용어 등록.
    await page.getByRole("button", { name: "등록" }).click();
    await detailRow(page, "표기").locator("input").fill(TERM1_NAME);
    await detailRow(page, "의미 번호").locator("input").fill("1");
    await detailRow(page, "정의").locator("textarea").fill(TERM1_DEF);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText(TERM1_NAME, { exact: true })).toBeVisible({ timeout: 20_000 });

    // 두 번째 용어 등록 중 — 표기 입력이 끝나면 디바운스 후 compare 호출을 기다린다.
    await page.getByRole("button", { name: "등록" }).click();
    const recommendResponse = page.waitForResponse(
      (r) => r.url().includes("/api/mdm/oasis/termMng/compare") && r.status() === 200,
      { timeout: 20_000 },
    );
    await detailRow(page, "표기").locator("input").fill(TERM2_NAME);
    await detailRow(page, "정의").locator("textarea").fill(TERM2_DEF);
    await recommendResponse;

    // 1차 추천 후보로 방금 등록한 용어가 뜬다.
    const recoGrid = page.getByLabel("유사어 추천");
    await expect(recoGrid.locator('[data-testid^="reco-candidate-1-"]', { hasText: TERM1_NAME })).toBeVisible({
      timeout: 20_000,
    });

    // 동의어로 확정 — 추천 그리드 행의 표기 칸에 reco-candidate-{stage}-{termId} testid 가 있다. 그 행의 확정 버튼을 누른다.
    await recoGrid
      .locator(".ag-row", { has: page.locator('[data-testid^="reco-candidate-1-"]', { hasText: TERM1_NAME }) })
      .getByRole("button", { name: "동의어로 확정" })
      .click();
    await expect(detailRow(page, "동의어").locator("input")).toHaveValue(new RegExp(TERM1_NAME));

    await detailRow(page, "의미 번호").locator("input").fill("2");
    await page.getByRole("button", { name: "저장" }).click();
    // TERM1_NAME 은 그리드에서 term1 자신의 표기 칸과 term2 의 동의어 칸(방금 확정) 두 곳에 나타날 수
    // 있으므로 .first() 로 "어딘가에 보인다"만 확인한다.
    await expect(page.getByText(TERM1_NAME, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(TERM2_NAME, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: screenshot("dma-termMng-registered.png"), fullPage: true });
  });

  test("T4 서버 오류 노출: (표기, 의미 번호) 중복 저장은 거부된다", async ({ page }) => {
    await login(page, STDADMIN);
    await openTermMng(page);

    await page.getByRole("button", { name: "등록" }).click();
    await detailRow(page, "표기").locator("input").fill(TERM1_NAME);
    await detailRow(page, "의미 번호").locator("input").fill("1"); // T3 에서 이미 등록한 조합.
    await detailRow(page, "정의").locator("textarea").fill("중복 시도");
    await page.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("같은 표기·의미 번호의 용어가 이미 있습니다.")).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: screenshot("dma-termMng-error.png"), fullPage: true });
  });
});
