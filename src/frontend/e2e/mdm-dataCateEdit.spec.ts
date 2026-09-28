import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * mdm dmd/dataCateEdit(카테고리 편집) smoke — TSK-07-02 design.md §3.3 스모크 넷(구현 단위 B3, 작성만 — 실행은
 * 마지막 단위 I). 세 화면(dataMng·dataEdit·dataCateEdit) 중 이 spec 은 자기 전용 마루 데이터(E2E_DC_PORT, 접두
 * `E2E_DC_`)만 쓴다 — B2(dataEdit) e2e 가 마루 데이터를 폐기하는 시나리오를 가질 수 있어 공유 행을 쓰지 않는다.
 *
 *   1. 메뉴 이동 — 담당자(e2e_mdm_steward)로 로그인해 사이드바에서 화면을 연다(dmd 쓰기는 EDIT 세트라 담당자만, F2).
 *   2. 목록 — 마루 데이터를 고르면 카테고리 목록(BASE 포함)이 보인다.
 *   3. REGEX 카테고리 등록 1건 → 목록 재조회로 반영 확인.
 *   4. 서버 오류 노출 — 잘못된 REGEX 문법 저장 거부 모달(04 mdm-codeItemEdit.spec.ts T10 과 같은 패턴).
 *
 * 픽스처: e2e/fixtures/mdm-dataMng.sql(mdm.db, dataMng·dataEdit 와 공유하되 이 spec 전용 행은 E2E_DC_ 접두).
 * 서버 절차는 design.md 「E2E 서버 절차」. SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(127.0.0.1:5100 은 메인
 * 체크아웃 포털이라 쓰지 않는다, F23).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const NEW_CATE_ID = `DC${SUFFIX}`;

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
  for (const name of [/^마루 MDM$/, /^마스터데이터$/, /^카테고리 편집$/]) {
    const node = item(name);
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();
  }
  await expect(page.getByTestId("cate-edit-maru-data")).toBeVisible({ timeout: 60_000 });
}

function waitAction(page: Page, action: string) {
  return page.waitForResponse(
    (r) => r.url().includes(`/api/mdm/oasis/dataCateEdit/${action}`) && r.status() === 200,
    { timeout: 30_000 },
  );
}

async function selectMaruData(page: Page) {
  const searched = waitAction(page, "search");
  await page.getByTestId("cate-edit-maru-data").selectOption("E2E_DC_PORT");
  await searched;
}

test.describe("mdm dmd/dataCateEdit", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
  });

  test("1~2. 메뉴 이동·목록(BASE 포함)", async ({ page }) => {
    await expect(page).toHaveURL(/\/portal/);
    await selectMaruData(page);
    await expect(page.getByTestId("cate-row-BASE")).toBeVisible({ timeout: 20_000 });
    // BASE 는 닫기·다시 열기 버튼이 없다(R6).
    await expect(page.getByTestId("cate-close-BASE")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dmd-dataCateEdit-list.png") });
  });

  test("3. REGEX 카테고리 등록 1건 → 목록에 반영된다", async ({ page }) => {
    await selectMaruData(page);

    const registered = waitAction(page, "reg");
    await page.getByTestId("cate-add-id").fill(NEW_CATE_ID);
    await page.getByTestId("cate-add-name").fill("E2E 등록 테스트");
    await page.getByTestId("cate-add-kind").selectOption("REGEX");
    await page.getByTestId("cate-add-submit").click();
    await registered;

    await expect(page.getByTestId(`cate-row-${NEW_CATE_ID}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("regex-edit-panel")).toBeVisible();
    await page.screenshot({ path: screenshot("dmd-dataCateEdit-register.png") });
  });

  test("4. 잘못된 REGEX 문법 저장은 거부된다", async ({ page }) => {
    await selectMaruData(page);
    await page.getByTestId("cate-row-BASE").click();
    await expect(page.getByTestId("regex-edit-panel")).toBeVisible({ timeout: 20_000 });

    // BASE 는 저장 자체가 비활성(R6) 이라 잘못된 문법 거부는 등록 직후 새 REGEX 카테고리로 확인한다.
    const registered = waitAction(page, "reg");
    await page.getByTestId("cate-add-id").fill(`${NEW_CATE_ID}B`);
    await page.getByTestId("cate-add-name").fill("문법 오류 테스트");
    await page.getByTestId("cate-add-kind").selectOption("REGEX");
    await page.getByTestId("cate-add-submit").click();
    await registered;
    await expect(page.getByTestId(`cate-row-${NEW_CATE_ID}B`)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(`cate-row-${NEW_CATE_ID}B`).click();
    await expect(page.getByTestId("regex-edit-panel")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("regex-expr").fill("[");
    await page.getByTestId("regex-save").click();

    await expect(page.getByText("카테고리 정의가 올바르지 않습니다")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataCateEdit-invalid-regex.png") });
  });
});
