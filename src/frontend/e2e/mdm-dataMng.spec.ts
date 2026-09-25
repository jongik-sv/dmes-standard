import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * mdm dmd/dataMng(마루 데이터 조회·등록) smoke — TSK-07-02 design.md §3.3 스모크 넷.
 *
 *   1. 메뉴 이동 — 담당자(e2e_mdm_steward)로 로그인해 사이드바에서 화면을 연다(dmd 쓰기는 EDIT 세트라 담당자만, F2).
 *   2. 목록 — 결과 그리드에 픽스처 행이 보인다.
 *   3. 등록 1건 → dataEdit 탭이 열리고 방금 등록한 ID 가 자동 로드됨을 확인(D7 인계 메커니즘).
 *   4. 서버 오류 노출 — 중복 ID 재등록(MDM011 모달, F15 문구).
 *
 * 픽스처: e2e/fixtures/mdm-dataMng.sql(mdm.db, dataEdit·dataCateEdit 와 공유). 서버 절차는 design.md 「E2E 서버 절차」.
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(127.0.0.1:5100 은 메인 체크아웃 포털이라 쓰지 않는다, F23).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const NEW_ID = `E2EDM${SUFFIX}`;

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-07-02/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
}

async function openScreen(page: Page) {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  for (const name of [/^마루 MDM$/, /^마스터데이터$/, /^마루 데이터$/]) {
    const node = item(name);
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();
  }
  await expect(page.getByTestId("data-mng-list")).toBeVisible({ timeout: 60_000 });
}

function waitAction(page: Page, action: string) {
  return page.waitForResponse(
    (r) => r.url().includes(`/api/mdm/oasis/dataMng/${action}`) && r.status() === 200,
    { timeout: 30_000 },
  );
}

test.describe("mdm dmd/dataMng", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
  });

  test("1~2. 메뉴 이동·목록", async ({ page }) => {
    await expect(page).toHaveURL(/\/portal/);
    const searched = waitAction(page, "search");
    await page.getByTestId("data-mng-search-id").fill("E2E_DM");
    await page.getByRole("button", { name: "조회" }).first().click();
    await searched;
    await expect(page.getByText("E2E_DM_PORT")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataMng-list.png") });
  });

  test("3. 등록 1건 → dataEdit 탭이 열리고 방금 등록한 ID 가 자동 로드된다(D7)", async ({ page }) => {
    const registered = waitAction(page, "reg");
    await page.getByTestId("data-mng-reg-id").fill(NEW_ID);
    await page.getByTestId("data-mng-reg-name").fill("E2E 등록 테스트");
    await page.getByTestId("data-mng-reg-pattern").fill("^[0-9A-Z]{1,20}$");
    await page.getByTestId("data-mng-reg-save").click();
    await registered;

    // dataEdit 탭이 새로 열리고 방금 등록한 ID 가 자동 로드된다(D7, sessionStorage 인계 — 탭이 새로 만들어지는 경우).
    await expect(page.getByText("마루 데이터 수정")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(NEW_ID)).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataMng-register-handoff.png") });
  });

  test("4. 중복 ID 재등록은 MDM011 문구로 거부된다", async ({ page }) => {
    await page.getByTestId("data-mng-reg-id").fill("E2E_DM_PORT");
    await page.getByTestId("data-mng-reg-name").fill("중복 시도");
    await page.getByTestId("data-mng-reg-pattern").fill("^[0-9A-Z]{1,20}$");
    await page.getByTestId("data-mng-reg-save").click();

    await expect(page.getByText("마루 코드·마루 데이터에 같은 ID 가 있습니다")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataMng-duplicate-id.png") });
  });
});
