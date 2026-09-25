import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * mdm dmd/dataEdit(마루 데이터 수정) smoke — TSK-07-02 design.md §3.3 스모크 넷.
 *
 *   1. 메뉴 이동 — 담당자(e2e_mdm_steward)로 로그인해 사이드바에서 화면을 연다(dmd 쓰기는 EDIT 세트라 담당자만, F2).
 *   2. select 로 마루 데이터를 고르면 헤더가 채워진다.
 *   3. 헤더 저장 1건 → 다시 불러온 값에 반영된다.
 *   4. 잘못된 키 패턴 정규식으로 저장 시도 → 오류 모달.
 *
 * 픽스처: e2e/fixtures/mdm-dataMng.sql 의 E2E_DM_CUST(이름 "거래처", lvl_cnt 0, 카테고리 없음) — dataMng·dataCateEdit
 * spec 이 쓰는 E2E_DM_PORT 는 건드리지 않는다(공유 픽스처 행 보존, design.md §2). 서버 절차는 design.md 「E2E 서버 절차」.
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(127.0.0.1:5100 은 메인 체크아웃 포털이라 쓰지 않는다, F23).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const NEW_NAME = `거래처 E2E ${SUFFIX}`;

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
  for (const name of [/^마루 MDM$/, /^마스터데이터$/, /^마루 데이터 수정$/]) {
    const node = item(name);
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();
  }
  await expect(page.getByTestId("data-edit-pick")).toBeVisible({ timeout: 60_000 });
}

function waitAction(page: Page, action: string) {
  return page.waitForResponse(
    (r) => r.url().includes(`/api/mdm/oasis/dataEdit/${action}`) && r.status() === 200,
    { timeout: 30_000 },
  );
}

async function choose(page: Page, id: string) {
  const viewed = waitAction(page, "view");
  const input = page.getByTestId("data-edit-pick").locator('input:not([type="hidden"])');
  await input.click();
  await input.fill(id);
  await page.getByRole("option", { name: new RegExp(`^${id} `) }).first().click();
  await viewed;
}

test.describe("mdm dmd/dataEdit", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
  });

  test("1. 메뉴 이동", async ({ page }) => {
    await expect(page).toHaveURL(/\/portal/);
    await expect(page.getByTestId("data-edit-empty")).toBeVisible();
  });

  test("2. select 로 고르면 헤더가 채워진다", async ({ page }) => {
    await choose(page, "E2E_DM_CUST");
    await expect(page.getByTestId("data-edit-name")).toHaveValue("거래처");
    await expect(page.getByTestId("data-edit-status")).toHaveText("INUSE");
    await page.screenshot({ path: screenshot("dmd-dataEdit-view.png") });
  });

  test("3. 헤더 저장 1건 → 다시 불러온 값에 반영된다", async ({ page }) => {
    await choose(page, "E2E_DM_CUST");
    await page.getByTestId("data-edit-name").fill(NEW_NAME);
    const saved = waitAction(page, "save");
    await page.getByTestId("data-edit-save").click();
    await saved;

    await expect(page.getByTestId("data-edit-name")).toHaveValue(NEW_NAME);
    await page.screenshot({ path: screenshot("dmd-dataEdit-save.png") });
  });

  test("4. 잘못된 키 패턴 정규식은 저장을 거부한다", async ({ page }) => {
    await choose(page, "E2E_DM_CUST");
    await page.getByTestId("data-edit-pattern").fill("[");
    await page.getByTestId("data-edit-save").click();

    await expect(page.getByText("키 패턴 정규식이 올바르지 않습니다")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataEdit-invalid-pattern.png") });
  });
});
