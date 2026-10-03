import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, clickMenuPath, login } from "./support/common";
import { gridRowById, gridRows } from "./support/grid";

/**
 * 마루 코드(codeMng) — TSK-06-02 design.md §3.4 화면 스모크(2026-09-28 통합 D-101·D-102: codeMng+codeEdit → codeMng
 * 하나. 옛 mdm-codeEdit.spec.ts 의 시나리오는 여기로 옮겼고, 없어진 메뉴("마루 코드 수정")를 찾던 그 파일은 지웠다).
 *
 *   M1 메뉴 이동: 마루 MDM > 마스터코드 > 마루 코드, breadcrumb·목록·오른쪽 안내(스모크 1).
 *   M2 목록·빈 상태: SUFFIX 로 좁혀 0건 → "조회된 마루 코드가 없습니다"(스모크 2).
 *   M3 등록: [코드 등록] 팝업 → 화면 조작만으로 등록 → 토스트 → 같은 화면 오른쪽에 v1.000 DRAFT "편집 중(나)"(탭을 새로 열지
 *      않는다) → 목록도 같은 조건으로 다시 조회돼 1건(상태 CREATED·현재 버전 "미확정"·미적용 "v1.000 DRAFT")(스모크 3).
 *   M4 서버 오류: 같은 ID 로 다시 등록 → MDM011 오류 모달 → 닫는다(스모크 4).
 *   M5 목록 선택·수정: 행을 클릭하면 오른쪽 상세가 그 코드로 바뀐다. 이름·라벨 저장 → 다시 조회해도 유지.
 *      [새 버전(major)] 모달 번호 확인 → 빈 버전 → 버전 목록에 반영. DRAFT 삭제 → "버전이 없습니다".
 *   M6 코드 삭제·코드 편집: 한 번도 RELEASED 된 적 없는 코드(`flags.neverReleased`)는 [폐기] 자리에 [삭제] 가 보인다
 *      (D-102) → 삭제하면 토스트 → 선택이 풀리고 목록에서 사라진다. 버전을 고르면(삭제 전) [코드 편집] 이 늘 켜진다.
 *      **[폐기]→DEPRECATED 전환은 이 스위트가 안 다룬다** — RELEASED 버전이 있어야 하고(codeConfirm 확정 흐름),
 *      그 경로는 mdm-codeConfirm 계열 스모크 몫이다.
 *   M7 동시 수정 충돌: 다른 세션이 먼저 저장(auditVer 증가) → 화면 저장이 MDM001 모달 → 닫으면 다시 불러온다.
 *
 * 선점·해제·넘기기 버튼은 누르지 않고 활성 여부도 단언하지 않는다 — 권한 시드는 TSK-08-02 몫이라(D-075) 머지 전에는
 * 비활성이고 뒤에는 활성이다. 담당자(e2e_mdm_steward)로 돈다. 전제는 design.md §9(mcm.db·mdm.db,
 * e2e/fixtures/mdm-rbac-users.sql). SUFFIX 로 ID 를 만들어 재실행·스위트 순서에 무관하다.
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const CODE_ID = `E2E_CM_${SUFFIX}`;
const CODE_B = `E2E_CM_B_${SUFFIX}`;
const BREADCRUMB = "마루 MDM > 마스터코드 > 마루 코드";
const DUP_ERROR = "마루 코드·마루 데이터에 같은 ID 가 있습니다";
const CONFLICT = "다른 사용자가 수정했습니다";

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-06-02/screens", name);

/** 탭마다 DOM 이 남으므로(비활성 탭은 display:none) 보이는 요소만 고른다. */
function tid(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${id}"]:visible`);
}

async function openCodeMng(page: Page) {
  await clickMenuPath(page, [/^마루 MDM$/, /^마스터코드$/, /^마루 코드$/]);
  await expect(tid(page, "code-list")).toBeVisible({ timeout: 60_000 });
}

async function search(page: Page, keyword: string) {
  await tid(page, "code-search-keyword").fill(keyword);
  await page.locator(".portal-shell__tab-page:visible").getByRole("button", { name: "조회", exact: true }).click();
}

function listRow(page: Page, id: string): Locator {
  return gridRows(tid(page, "code-list"))
    .filter({ has: page.locator('.ag-cell[col-id="maruCodeId"]', { hasText: new RegExp(`^${id}$`) }) });
}

async function register(page: Page, id: string, name: string, lvl: string) {
  await page.locator("#btn_code_reg").click();
  await expect(tid(page, "code-register-form")).toBeVisible({ timeout: 20_000 });
  await tid(page, "code-reg-id").fill(id);
  await tid(page, "code-reg-name").fill(name);
  await tid(page, "code-reg-lvl").selectOption(lvl);
  await tid(page, "code-reg-save").click();
}

/**
 * 행을 누르고 **그 코드의** 상세가 뜰 때까지 기다린다. 이미 다른 코드를 보고 있으면 `header-name` 은 클릭 전부터 보이므로
 * 그것만 기다리면 이전 코드 위에서 다음 단계가 돈다(M6 간헐 실패 — CODE_B 대신 CODE_ID 를 지울 수 있었다).
 * 이미 **같은** 코드를 보고 있으면 `header-code-id` 도 클릭 전부터 맞다. 행 클릭은 늘 상세(codeEdit/view)를 다시 부르는데
 * ag-grid 의 행 클릭 콜백은 비동기라, 다음 단계의 입력이 다시 불러오기보다 먼저 들어가면 늦은 응답이 폼을 서버 값으로 덮는다
 * (M5 간헐 실패 — 이름은 옛 값, 라벨만 저장됐다). 그래서 그 코드의 view 응답까지 기다린다.
 */
async function selectCode(page: Page, id: string) {
  const viewed = page.waitForResponse(
    (r) =>
      r.url().includes("/api/mdm/oasis/codeEdit/view") &&
      r.status() === 200 &&
      (r.request().postData() ?? "").includes(`"${id}"`),
    { timeout: 30_000 },
  );
  await listRow(page, id).click();
  await viewed;
  await expect(tid(page, "header-code-id")).toHaveText(id, { timeout: 30_000 });
  await expect(tid(page, "header-name")).toBeVisible();
}

async function confirmDialog(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
}

async function selectVersion(page: Page, ver: string) {
  // 버전 목록은 AgDataGrid — 행은 row-id(버전 값)로 찾고 첫 칸을 눌러 고른다.
  await gridRowById(tid(page, "version-list"), ver).locator(".ag-cell").first().click();
}

async function api(page: Page, action: string, params: Record<string, unknown>, service = "codeEdit") {
  const res = await page.request.post(`${BASE_URL}/api/mdm/oasis/${service}/${action}`, {
    data: { meta: { menuId: service }, params },
  });
  expect(res.status(), `${service}/${action}`).toBe(200);
  return res.json();
}

test.describe.configure({ mode: "serial" });

test.describe("mdm codeMng — 마루 코드(조회·등록·수정 통합)", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    await login(page, STEWARD);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("M1 메뉴에서 마루 코드 화면이 열리고, 고르기 전에는 안내만 보인다", async () => {
    await openCodeMng(page);
    await expect(page.getByText(BREADCRUMB).first()).toBeVisible();
    await expect(page.getByText("목록에서 마루 코드를 고르거나").first()).toBeVisible();
    await page.screenshot({ path: screenshot("dmc-codeMng-list.png"), fullPage: true });
  });

  test("M2 조건에 맞는 코드가 없으면 빈 상태가 보인다", async () => {
    await search(page, CODE_ID);
    await expect(tid(page, "code-list-empty")).toHaveText(/조회된 마루 코드가 없습니다/, { timeout: 20_000 });
  });

  test("M3 등록하면 같은 화면 오른쪽에 상세가 보이고 목록에도 반영된다(탭을 새로 열지 않는다)", async () => {
    await register(page, CODE_ID, "E2E 마루 코드", "2");
    await expect(page.getByText("등록했습니다").first()).toBeVisible({ timeout: 20_000 });

    // 등록 트랜잭션의 자동 선점(편집 중(나)) — 같은 탭 오른쪽에 바로 보인다.
    await expect(tid(page, "version-list")).toBeVisible({ timeout: 60_000 });
    await expect(tid(page, "version-list")).toContainText("v1.000");
    await expect(tid(page, "version-list")).toContainText("편집 중(나)");

    // 목록도 같은 조건으로 다시 조회됐다.
    await search(page, CODE_ID);
    const row = listRow(page, CODE_ID);
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row.locator('.ag-cell[col-id="status"]')).toHaveText("CREATED");
    await expect(row.locator('.ag-cell[col-id="currentVerLabel"]')).toHaveText("미확정");
    await expect(row.locator('.ag-cell[col-id="unappliedLabel"]')).toHaveText("v1.000 DRAFT");
    await page.screenshot({ path: screenshot("dmc-codeMng-reg.png"), fullPage: true });
  });

  test("M4 같은 ID 로 다시 등록하면 서버 오류가 보이고 닫으면 사라진다", async () => {
    await register(page, CODE_ID, "중복", "0");
    const modal = page.locator(".error-modal__body:visible");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal).toContainText(DUP_ERROR);
    await page.screenshot({ path: screenshot("dmc-codeMng-dup-error.png"), fullPage: true });
    await confirmDialog(page);
    await expect(modal).toBeHidden({ timeout: 20_000 });
    // 등록 팝업은 오류 뒤에도 입력값을 든 채 열려 있다 — 다음 테스트가 목록을 누를 수 있도록 [취소]로 닫는다.
    await expect(tid(page, "code-register-form")).toBeVisible();
    await tid(page, "code-reg-cancel").click();
    await expect(tid(page, "code-register-form")).toHaveCount(0, { timeout: 20_000 });
  });

  test("M5 목록에서 고르면 상세가 바뀌고, 헤더·라벨 저장과 새 버전이 반영된다", async () => {
    await api(page, "reg", { maruCodeId: CODE_B, maruCodeName: "E2E 수정", lvlCnt: "0" }, "codeMng");

    await search(page, CODE_ID);
    await selectCode(page, CODE_ID);
    await expect(tid(page, "version-list")).toContainText("v1.000");
    await expect(tid(page, "ver-new-major")).toBeDisabled();

    await tid(page, "header-name").fill("E2E 수정됨");
    await tid(page, "label-attr01").fill("인장강도");
    await tid(page, "header-save").click();
    await expect(page.getByText("저장했습니다").first()).toBeVisible({ timeout: 20_000 });
    await page.locator(".portal-shell__tab-page:visible").getByRole("button", { name: "조회", exact: true }).click();
    await search(page, CODE_ID);
    await selectCode(page, CODE_ID);
    await expect(tid(page, "header-name")).toHaveValue("E2E 수정됨", { timeout: 20_000 });
    await expect(tid(page, "label-attr01")).toHaveValue("인장강도");

    // DRAFT 삭제 → 빈 상태 → 새버전 활성 → 모달 번호(v1.000) → 빈 버전으로 다시 생성.
    await selectVersion(page, "1.000");
    await tid(page, "ver-delete").click();
    await confirmDialog(page);
    await expect(tid(page, "version-empty")).toHaveText(/버전이 없습니다/, { timeout: 20_000 });
    await expect(tid(page, "ver-new-major")).toBeEnabled();
    await tid(page, "ver-new-major").click();
    await expect(tid(page, "newver-number")).toHaveText("v1.000");
    await page.screenshot({ path: screenshot("dmc-codeMng-newver-dialog.png"), fullPage: true });
    await tid(page, "newver-ok").click();
    await expect(tid(page, "version-list")).toContainText("v1.000", { timeout: 20_000 });
    await expect(tid(page, "version-list")).toContainText("편집 중(나)");
  });

  test("M6 한 번도 RELEASED 된 적 없는 코드는 [폐기] 대신 [삭제] 가 보이고, 버전을 고르면 [코드 편집] 이 켜진다", async () => {
    await search(page, CODE_B);
    await selectCode(page, CODE_B);
    await selectVersion(page, "1.000");
    await expect(tid(page, "ver-item-edit")).toBeEnabled();

    // CODE_B 는 한 번도 확정(RELEASED)된 적이 없다 — flags.neverReleased 로 [폐기] 자리에 [삭제] 가 보인다(D-102).
    await expect(tid(page, "header-deprecate")).toBeHidden();
    await expect(tid(page, "header-delete-code")).toBeVisible();
    await page.screenshot({ path: screenshot("dmc-codeMng-delete-code.png"), fullPage: true });

    await tid(page, "header-delete-code").click();
    await confirmDialog(page);
    await expect(page.getByText("삭제했습니다").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("목록에서 마루 코드를 고르거나").first()).toBeVisible({ timeout: 20_000 });

    await search(page, CODE_B);
    await expect(tid(page, "code-list-empty")).toHaveText(/조회된 마루 코드가 없습니다/, { timeout: 20_000 });
  });

  test("M7 다른 사용자가 먼저 저장하면 오류가 보이고 닫으면 다시 불러온다", async () => {
    await search(page, CODE_ID);
    await selectCode(page, CODE_ID);
    const view = await api(page, "view", { maruCodeId: CODE_ID });
    const header = view.data.result.header;
    const other = await api(page, "save", {
      maruCodeId: CODE_ID, auditVer: header.auditVer, maruCodeName: "E2E 동시", lvlCnt: header.lvlCnt,
      attr01Name: header.attr01Name,
    });
    expect(other.meta?.success, JSON.stringify(other)).toBe(true);

    await tid(page, "header-name").fill("화면에서 고침");
    await tid(page, "header-save").click();
    const modal = page.locator(".error-modal__body:visible");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal).toContainText(CONFLICT);
    await page.screenshot({ path: screenshot("dmc-codeMng-conflict-error.png"), fullPage: true });
    await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
    await expect(tid(page, "header-name")).toHaveValue("E2E 동시", { timeout: 20_000 });
  });
});
