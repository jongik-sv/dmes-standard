import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 마루 코드 수정(codeEdit) — TSK-06-02 design.md §3.4 화면 스모크 넷.
 *
 *   E1 메뉴 이동: 마루 MDM > 마스터코드 > 마루 코드 수정 → 코드 선택 안내(스모크 1, 수용 기준 6).
 *   E2 목록·빈 상태: A 선택 → 버전 1행 v1.000 MAJOR DRAFT "편집 중(나)"(등록 트랜잭션의 자동 선점), 새버전 비활성
 *      → [삭제] 확인 → "버전이 없습니다"(스모크 2).
 *   E3 수정 반영: A 이름·라벨 저장 → 다시 조회해도 유지, [새버전(major)] 모달 번호 v1.000 → 빈 버전 → v1.000 DRAFT.
 *      B: 버전 삭제 → [폐기] → DEPRECATED, 새버전 비활성(스모크 3).
 *   E4 서버 오류: 다른 세션이 먼저 저장(auditVer 증가) → 화면 저장이 MDM001 모달 → 닫으면 다시 불러온다(스모크 4).
 *
 * 선점·해제·넘기기 버튼은 누르지 않고 활성 여부도 단언하지 않는다 — 권한 시드는 TSK-08-02 몫이라(D-075) 머지 전에는
 * 비활성이고 뒤에는 활성이다. 동작은 서비스·HTTP·vitest 가 본다. 담당자(e2e_mdm_steward)로 돈다.
 * 전제는 design.md §9. SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const CODE_A = `E2E_CE_A_${SUFFIX}`;
const CODE_B = `E2E_CE_B_${SUFFIX}`;
const BREADCRUMB = "마루 MDM > 마스터코드 > 마루 코드 수정";
const CONFLICT = "다른 사용자가 수정했습니다";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-06-02/screens", name);

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

async function api(page: Page, action: string, params: Record<string, unknown>, service = "codeEdit") {
  const res = await page.request.post(`${BASE_URL}/api/mdm/oasis/${service}/${action}`, {
    data: { meta: { menuId: service }, params },
  });
  expect(res.status(), `${service}/${action}`).toBe(200);
  return res.json();
}

async function pickCode(page: Page, id: string) {
  const input = tid(page, "code-pick").locator('input:not([type="hidden"])');
  await input.click();
  await input.fill(id);
  await page.getByRole("option", { name: new RegExp(`^${id} `) }).first().click();
  await expect(tid(page, "header-name")).toBeVisible({ timeout: 30_000 });
}

async function confirmDialog(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
}

async function selectVersion(page: Page, ver: string) {
  await tid(page, `version-row-${ver}`).click();
}

test.describe.configure({ mode: "serial" });

test.describe("mdm codeEdit — 마루 코드 수정", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    await login(page, STEWARD);
    for (const id of [CODE_A, CODE_B]) {
      const body = await api(page, "reg", { maruCodeId: id, maruCodeName: "E2E 수정", lvlCnt: "0" }, "codeMng");
      expect(body.meta?.success, JSON.stringify(body)).toBe(true);
    }
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("E1 메뉴에서 마루 코드 수정 화면이 열린다", async () => {
    await menuItem(page, /^마루 MDM$/).click({ timeout: 20_000 });
    await menuItem(page, /^마스터코드$/).click({ timeout: 20_000 });
    await menuItem(page, /^마루 코드 수정$/).click({ timeout: 20_000 });
    await expect(tid(page, "code-pick")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(BREADCRUMB).first()).toBeVisible();
    await expect(page.getByText("마루 코드를 고르세요").first()).toBeVisible();
  });

  test("E2 코드를 고르면 버전 목록이 보이고 DRAFT 를 지우면 빈 상태가 된다", async () => {
    await pickCode(page, CODE_A);
    const list = tid(page, "version-list");
    await expect(list).toContainText("v1.000");
    await expect(list).toContainText("MAJOR");
    await expect(list).toContainText("작성 중");
    await expect(list).toContainText("편집 중(나)");
    await expect(tid(page, "ver-new-major")).toBeDisabled();
    await expect(tid(page, "ver-new-minor")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmc-codeEdit-versions.png"), fullPage: true });

    await selectVersion(page, "1.000");
    await tid(page, "ver-delete").click();
    await confirmDialog(page);
    await expect(tid(page, "version-empty")).toHaveText(/버전이 없습니다/, { timeout: 20_000 });
  });

  test("E3 헤더·라벨 저장, 새 버전, 폐기가 반영된다", async () => {
    await tid(page, "header-name").fill("E2E 수정됨");
    await tid(page, "label-attr01").fill("인장강도");
    await tid(page, "header-save").click();
    await expect(page.getByText("저장했습니다").first()).toBeVisible({ timeout: 20_000 });
    await page.locator(".portal-shell__tab-page:visible").getByRole("button", { name: "조회", exact: true }).click();
    await expect(tid(page, "header-name")).toHaveValue("E2E 수정됨", { timeout: 20_000 });
    await expect(tid(page, "label-attr01")).toHaveValue("인장강도");

    await expect(tid(page, "ver-new-major")).toBeEnabled();
    await tid(page, "ver-new-major").click();
    await expect(tid(page, "newver-number")).toHaveText("v1.000");
    await page.screenshot({ path: screenshot("dmc-codeEdit-newver-dialog.png"), fullPage: true });
    await tid(page, "newver-ok").click();
    await expect(tid(page, "version-list")).toContainText("v1.000", { timeout: 20_000 });
    await expect(tid(page, "version-list")).toContainText("편집 중(나)");

    // B: 버전 삭제 → 폐기
    await pickCode(page, CODE_B);
    await selectVersion(page, "1.000");
    await tid(page, "ver-delete").click();
    await confirmDialog(page);
    await expect(tid(page, "version-empty")).toBeVisible({ timeout: 20_000 });
    await tid(page, "header-deprecate").click();
    await confirmDialog(page);
    await expect(tid(page, "header-status")).toHaveText("DEPRECATED", { timeout: 20_000 });
    await expect(tid(page, "ver-new-major")).toBeDisabled();
    await expect(tid(page, "ver-new-minor")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmc-codeEdit-deprecated.png"), fullPage: true });
  });

  test("E4 다른 사용자가 먼저 저장하면 오류가 보이고 닫으면 다시 불러온다", async () => {
    await pickCode(page, CODE_A);
    const view = await api(page, "view", { maruCodeId: CODE_A });
    const header = view.data.result.header;
    const other = await api(page, "save", {
      maruCodeId: CODE_A, auditVer: header.auditVer, maruCodeName: "E2E 동시", lvlCnt: header.lvlCnt,
      attr01Name: header.attr01Name,
    });
    expect(other.meta?.success, JSON.stringify(other)).toBe(true);

    await tid(page, "header-name").fill("화면에서 고침");
    await tid(page, "header-save").click();
    const modal = page.locator(".error-modal__body:visible");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal).toContainText(CONFLICT);
    await page.screenshot({ path: screenshot("dmc-codeEdit-conflict-error.png"), fullPage: true });
    await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
    await expect(tid(page, "header-name")).toHaveValue("E2E 동시", { timeout: 20_000 });
  });
});
