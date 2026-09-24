import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 마루 코드 조회·등록(codeMng) — TSK-06-02 design.md §3.4 화면 스모크 넷.
 *
 *   M1 메뉴 이동: 마루 MDM > 마스터코드 > 마루 코드, breadcrumb·목록(스모크 1, 수용 기준 3).
 *   M2 목록·빈 상태: SUFFIX 로 좁혀 0건 → "조회된 마루 코드가 없습니다"(스모크 2).
 *   M3 등록: 화면 조작만으로 등록 → 토스트 → codeEdit 탭이 v1.000 DRAFT "편집 중(나)" → codeMng 로 돌아와 1건
 *      (상태 CREATED·현재 버전 "미확정"·미적용 "v1.000 DRAFT")(스모크 3, 수용 기준 2).
 *   M4 서버 오류: 같은 ID 로 다시 등록 → MDM011 오류 모달(스모크 4, 수용 기준 1).
 *
 * 담당자(e2e_mdm_steward)로 돈다 — dmc 는 담당자만 편집한다(design.md F21). 전제는 design.md §9(새 mcm.db·mdm.db,
 * e2e/fixtures/mdm-rbac-users.sql). SUFFIX 로 ID 를 만들어 재실행·스위트 순서에 무관하다.
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const CODE_ID = `E2E_CM_${SUFFIX}`;
const BREADCRUMB = "마루 MDM > 마스터코드 > 마루 코드";
const DUP_ERROR = "마루 코드·마루 데이터에 같은 ID 가 있습니다";

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-06-02/screens", name);

/** 탭마다 DOM 이 남으므로(비활성 탭은 display:none) 보이는 요소만 고른다. */
function tid(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${id}"]:visible`);
}

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
}

const menuItem = (page: Page, text: RegExp) =>
  page.locator(".tree-item .item-name").filter({ hasText: text }).first();

async function openCodeMng(page: Page) {
  await menuItem(page, /^마루 MDM$/).click({ timeout: 20_000 });
  await menuItem(page, /^마스터코드$/).click({ timeout: 20_000 });
  await menuItem(page, /^마루 코드$/).click({ timeout: 20_000 });
  await expect(tid(page, "code-list")).toBeVisible({ timeout: 60_000 });
}

async function search(page: Page, keyword: string) {
  await tid(page, "code-search-keyword").fill(keyword);
  await page.locator(".portal-shell__tab-page:visible").getByRole("button", { name: "조회", exact: true }).click();
}

function listRow(page: Page, id: string): Locator {
  return tid(page, "code-list")
    .locator(".ag-center-cols-container .ag-row")
    .filter({ has: page.locator('.ag-cell[col-id="maruCodeId"]', { hasText: new RegExp(`^${id}$`) }) });
}

async function register(page: Page, id: string, name: string, lvl: string) {
  await tid(page, "code-reg-id").fill(id);
  await tid(page, "code-reg-name").fill(name);
  await tid(page, "code-reg-lvl").selectOption(lvl);
  await tid(page, "code-reg-save").click();
}

test.describe.configure({ mode: "serial" });

test.describe("mdm codeMng — 마루 코드 조회·등록", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await login(page, STEWARD);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("M1 메뉴에서 마루 코드 화면이 열린다", async () => {
    await openCodeMng(page);
    await expect(page.getByText(BREADCRUMB).first()).toBeVisible();
    await page.screenshot({ path: screenshot("dmc-codeMng-list.png"), fullPage: true });
  });

  test("M2 조건에 맞는 코드가 없으면 빈 상태가 보인다", async () => {
    await search(page, CODE_ID);
    await expect(tid(page, "code-list-empty")).toHaveText(/조회된 마루 코드가 없습니다/, { timeout: 20_000 });
  });

  test("M3 등록하면 수정 탭이 열리고 목록에 반영된다", async () => {
    await register(page, CODE_ID, "E2E 마루 코드", "2");
    await expect(page.getByText("등록했습니다").first()).toBeVisible({ timeout: 20_000 });

    // codeEdit 탭이 그 코드로 열린다 — 등록 트랜잭션의 자동 선점(편집 중(나))
    await expect(tid(page, "version-list")).toBeVisible({ timeout: 60_000 });
    await expect(tid(page, "version-list")).toContainText("v1.000");
    await expect(tid(page, "version-list")).toContainText("편집 중(나)");

    // codeMng 탭으로 돌아와 같은 조건으로 조회
    await menuItem(page, /^마루 코드$/).click({ timeout: 20_000 });
    await expect(tid(page, "code-list")).toBeVisible({ timeout: 30_000 });
    await search(page, CODE_ID);
    const row = listRow(page, CODE_ID);
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.locator('.ag-cell[col-id="status"]')).toHaveText("CREATED");
    await expect(row.locator('.ag-cell[col-id="currentVerLabel"]')).toHaveText("미확정");
    await expect(row.locator('.ag-cell[col-id="unappliedLabel"]')).toHaveText("v1.000 DRAFT");
    await page.screenshot({ path: screenshot("dmc-codeMng-reg.png"), fullPage: true });
  });

  test("M4 같은 ID 로 다시 등록하면 서버 오류가 보인다", async () => {
    await register(page, CODE_ID, "중복", "0");
    const modal = page.locator(".error-modal__body:visible");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal).toContainText(DUP_ERROR);
    await page.screenshot({ path: screenshot("dmc-codeMng-dup-error.png"), fullPage: true });
  });
});
