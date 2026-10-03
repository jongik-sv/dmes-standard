import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { BASE_URL, T, login, walkMenuPath, type LoginOptions } from "./support/common";

/**
 * mdm dma/termMng(용어 관리) smoke — TSK-04-02 design.md §3.1.
 *
 * 스모크 넷:
 *   1. 메뉴 이동.
 *   2. 빈 상태.
 *   3. 등록 1회 + 채워짐 + 유사어 추천(A-RECO, 1차 문자열) + "동의어로 확정"(D12(a)).
 *   4. 서버 오류 노출 — (표기, 의미 번호) 중복 저장 거부(I6).
 */

const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const SUFFIX = Date.now().toString(36);
const NOMATCH_KEYWORD = `__E2E_NOMATCH_${SUFFIX}__`;
const TERM1_NAME = `테스트용어${SUFFIX}`;
const TERM1_DEF = `e2e 확인용 ${SUFFIX}`;
const TERM2_NAME = `테스트용어${SUFFIX}B`; // TERM1_NAME 을 포함(부분 일치 0.9, I18)
const TERM2_DEF = `e2e 확인용 ${SUFFIX} 두번째`;

const screenshot = (name: string) =>
  path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-04-02/screens", name);

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW };

async function openTermMng(page: Page) {
  await walkMenuPath(page, [/^마루 MDM$/, /^용어·도메인$/, /^용어 관리$/]);

  await expect(page.getByRole("button", { name: "등록" })).toBeVisible({ timeout: 60_000 });
}

function searchField(page: Page, label: string) {
  return page.locator(".search-field", { hasText: label });
}

function detailRow(page: Page, label: string) {
  return page.locator("tr", { hasText: label });
}

/**
 * [조회] 를 누르고 search 응답이 돌아올 때까지 기다린다. 진입할 때 목록은 비어 있어 "0건" 이 처음부터 보이므로, 응답을 기다리지 않으면
 * 조회가 돌지 않아도 건수 단언이 통과한다. 진입 때 콤보 값만 받는 호출(optionsOnly)은 요청 본문으로 거른다.
 */
async function clickSearchAndWait(page: Page) {
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/mdm/oasis/termMng/search") &&
      r.request().method() === "POST" &&
      !(r.request().postData() ?? "").includes("optionsOnly") &&
      r.status() === 200,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "조회" }).click();
  await response;
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dma/termMng smoke", () => {
  test.setTimeout(150_000);

  test("T1 메뉴 이동: 용어 관리 화면이 열린다", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
    await openTermMng(page);
    await page.screenshot({ path: screenshot("dma-termMng-open.png"), fullPage: true });
  });

  test("T2 빈 상태: 없는 키워드로 검색하면 빈 상태가 보인다", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
    await openTermMng(page);

    await searchField(page, "검색어").locator("input").fill(NOMATCH_KEYWORD);
    await clickSearchAndWait(page);
    // 화면에 GridPanel 이 둘(용어 목록·유사어 추천)이라 "0건" 이 두 번 보인다 — 용어 목록 패널의 건수만 본다.
    const termListCount = page
      .locator(".grid-panel")
      .filter({ has: page.locator(".grid-panel-title", { hasText: "용어 목록" }) })
      .locator(".grid-panel-count");
    await expect(termListCount).toHaveText("0건", { timeout: 20_000 });

    await page.screenshot({ path: screenshot("dma-termMng-empty.png"), fullPage: true });
  });

  test("T3 등록 + 유사어 추천 + 동의어 확정", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
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
    await login(page, STDADMIN, LOGIN_OPTS);
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
