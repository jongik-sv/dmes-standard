import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 도메인 관리(dma/domainMng) 브라우저 E2E — TSK-04-03 design.md §4.6.
 *
 *   E1 메뉴 이동·빈 상태(스모크 1·2)          E2 화면 조작만으로 등록 → 목록 반영(스모크 3·2)
 *   E3 상속 등록·JS 미리보기(서버 호출 없음)   E4 거부 표시(R06, 저장 비활성 — 수용 기준 1 화면 쪽)
 *   E5 서버 오류 표시(동시 수정 MDM001, 스모크 4)  E6 영향도(수용 기준 6 화면 쪽)   E7 담당자 RBAC
 *   E8 부모 교체·연결 제거 대화상자(D-132 — 경고 확인 뒤 저장, 제거는 상속값 구체화)
 *
 * 전제: 격리 DB 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고 e2e/fixtures/mdm-rbac-users.sql 을 넣는다.
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과).
 * 실행마다 STAMP 로 이름을 만들어 DB 가 비어 있지 않아도 다시 돌릴 수 있다.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const ADMIN = process.env.SMOKE_LOGIN_USER ?? "admin";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const STAMP = Date.now().toString(36).toUpperCase();
const PARENT_NAME = `E2E 식별자 ${STAMP}`;
const PARENT_STD = `E2E_ID_${STAMP}`;
const CHILD_NAME = `E2E 식별자 하위 ${STAMP}`;
const CHILD_STD = `E2E_ID_C_${STAMP}`;
const OTHER_NAME = `E2E 식별자 다른 부모 ${STAMP}`;
const OTHER_STD = `E2E_ID_O_${STAMP}`;
const BREADCRUMB = "마루 MDM > 용어·도메인 > 도메인 관리";
const API = "/api/mdm/oasis/domainMng";

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-04-03/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
}

async function openDomainMng(page: Page): Promise<Locator> {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  for (const name of [/^마루 MDM$/, /^용어·도메인$/, /^도메인 관리$/]) {
    const node = item(name);
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();
  }
  const layout = page.locator(".page-layout").filter({
    has: page.locator(".page-layout__footer-screen-id", { hasText: "domainMng" }),
  });
  await expect(layout.locator(".domain-mng__count")).toBeVisible({ timeout: 60_000 });
  return layout;
}

async function search(layout: Locator, keyword: string) {
  await layout.getByPlaceholder("도메인명·표준명").fill(keyword);
  await layout.getByRole("button", { name: "조회", exact: true }).click();
}

function gridRow(layout: Locator, text: string): Locator {
  return layout.locator(".ag-row").filter({ hasText: text }).first();
}

async function selectRow(layout: Locator, name: string) {
  // 저장 직후에는 같은 행이 이미 열려 있어 도메인명 대기가 곧바로 참이 된다. ag-grid 는 rowClicked 를 비동기 큐로 늦게
  // 보내므로(TSK-05-02 Build 실측), 클릭이 부른 view 응답과 그 반영까지 기다린 뒤 다음 조작을 한다.
  const page = layout.page();
  const viewed = page.waitForResponse((r) => r.url().includes(`${API}/view`), { timeout: 30_000 });
  await gridRow(layout, name).click();
  await viewed;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  await expect(layout.locator('input[aria-label="도메인명"]')).toHaveValue(name, { timeout: 30_000 });
}

/** 테스트 케이스 표(AgDataGrid)의 n 번째 케이스 행 — 행 키는 1부터이고, 결과 칸(RESULT_TEXT)이 있는 행만 이 표의 행이다. */
const caseRow = (root: Locator, n: number): Locator =>
  root
    .locator(`.ag-center-cols-container .ag-row[row-id="${n}"]`)
    .filter({ has: root.page().locator('.ag-cell[col-id="RESULT_TEXT"]') });
/** 케이스 칸을 눌러 편집기를 열고 값을 넣어 확정한다. 기대 칸은 true/false 선택이다. */
async function editCaseCell(root: Locator, n: number, col: "VALUE" | "EXPECT" | "MEMO", value: string) {
  await caseRow(root, n).locator(`.ag-cell[col-id="${col}"]`).click();
  if (col === "EXPECT") {
    await root.locator(".ag-cell-inline-editing select").selectOption(value);
    return;
  }
  const editor = root.locator(".ag-cell-inline-editing input");
  await editor.fill(value);
  await editor.press("Enter");
}

async function addCase(layout: Locator, n: number, value: string, expectValue: "true" | "false") {
  await layout.getByRole("button", { name: "케이스 추가" }).click();
  await editCaseCell(layout, n, "VALUE", value);
  await editCaseCell(layout, n, "EXPECT", expectValue);
}

async function validateAndSave(layout: Locator) {
  await layout.getByRole("button", { name: "도메인검증" }).click();
  await expect(layout.locator(".domain-mng__check-summary")).toContainText("검사 통과", { timeout: 30_000 });
  const save = layout.getByRole("button", { name: "저장", exact: true });
  await expect(save).toBeEnabled();
  await save.click();
}

test.describe.configure({ mode: "serial" });
// 목록·상세 두 칸과 영향도·검사 목록이 한 화면에 들어오게 넓게 본다(스크린샷은 승인자가 본다).
test.use({ viewport: { width: 1680, height: 1200 } });

test.describe("mdm 도메인 관리", () => {
  test.setTimeout(180_000);

  test("E1 메뉴로 이동하고 결과가 없으면 빈 상태가 보인다", async ({ page }) => {
    await login(page, ADMIN);
    const layout = await openDomainMng(page);
    await expect(layout.locator(".page-layout__footer-breadcrumb")).toHaveText(BREADCRUMB);
    await expect(layout.locator(".page-layout__footer-screen-id")).toHaveText("domainMng");
    await search(layout, `없음-${STAMP}`);
    await expect(layout.locator(".domain-mng__empty")).toHaveText("조회된 도메인이 없습니다", { timeout: 30_000 });
    await page.screenshot({ path: screenshot("dma-domainMng-empty.png"), fullPage: true });
  });

  test("E2~E6 등록·상속·미리보기·거부·오류·영향도", async ({ page }) => {
    await login(page, ADMIN);
    const layout = await openDomainMng(page);

    // ── E2 최상위 등록 — 화면 조작만으로 저장하고 목록에 반영 ──
    await layout.getByRole("button", { name: "도메인 등록", exact: true }).click();
    await layout.locator('input[aria-label="도메인명"]').fill(PARENT_NAME);
    await layout.locator('input[aria-label="표준명"]').fill(PARENT_STD);
    await layout.locator('select[aria-label="종류"]').selectOption("ID");
    await layout.locator('select[aria-label="데이터 타입"]').selectOption("STRING");
    await layout.locator('input[aria-label="길이"]').fill("20");
    await layout.locator('textarea[aria-label="표준 검증식"]').fill('STR_MATCHES(value, "^[A-Z0-9]{10,20}$")');
    await addCase(layout, 1, "C24090401AB", "true");
    await addCase(layout, 2, "abc", "false");
    await layout.getByRole("button", { name: "도메인검증" }).click();
    await expect(layout.locator(".domain-mng__check-summary")).toContainText("검사 통과", { timeout: 30_000 });
    await expect(layout.locator('.ag-center-cols-container .ag-cell[col-id="RESULT_TEXT"]')).toHaveText(["일치", "일치"]);
    await layout.locator(".domain-mng__checks").scrollIntoViewIfNeeded();
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    await search(layout, STAMP);
    await expect(gridRow(layout, PARENT_NAME)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: screenshot("dma-domainMng-register.png"), fullPage: true });

    // ── E3 하위 도메인 — 종류·타입 고정, 유효 식 조립, 저장된 도메인의 JS 미리보기 ──
    await selectRow(layout, PARENT_NAME);
    await layout.getByRole("button", { name: "하위 도메인 등록", exact: true }).click();
    await expect(layout.locator('select[aria-label="종류"]')).toBeDisabled();
    await expect(layout.locator('select[aria-label="데이터 타입"]')).toBeDisabled();
    await expect(layout.locator('select[aria-label="종류"]')).toHaveValue("ID");
    await expect(layout.getByText("고정", { exact: true }).first()).toBeVisible();
    await layout.locator('input[aria-label="도메인명"]').fill(CHILD_NAME);
    await layout.locator('input[aria-label="표준명"]').fill(CHILD_STD);
    await layout.locator('input[aria-label="길이"]').fill("15");
    await layout.locator('textarea[aria-label="표준 검증식"]').fill("STR_LENGTH(value) <= 15");
    await addCase(layout, 1, "C24090401AB", "true");
    await validateAndSave(layout);
    await search(layout, STAMP);
    const childRow = gridRow(layout, CHILD_NAME);
    await expect(childRow).toContainText(`└ ${CHILD_NAME}`, { timeout: 30_000 });
    await expect(childRow).toContainText("&&");
    await page.screenshot({ path: screenshot("dma-domainMng-tree.png"), fullPage: true });

    await selectRow(layout, CHILD_NAME);
    const executeCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes(`${API}/execute`)) executeCalls.push(r.url());
    });
    const previewInput = layout.locator('input[aria-label="미리보기 입력값"]');
    await previewInput.fill("C24090401AB");
    await expect(layout.locator(".domain-mng__preview-std")).toHaveText("표준 통과");
    await previewInput.fill("abc");
    await expect(layout.locator(".domain-mng__preview-std")).toHaveText("표준 실패");
    await page.waitForTimeout(800); // 디바운스(400 ms)가 지나도 서버 미리보기를 부르지 않는다
    expect(executeCalls, "비즈니스식 없는 저장된 도메인은 서버 미리보기를 부르지 않는다").toEqual([]);
    await page.screenshot({ path: screenshot("dma-domainMng-preview.png"), fullPage: true });

    // ── E4 거부 표시 — 부모(20)보다 긴 길이는 R06, 저장 비활성 ──
    await layout.locator('input[aria-label="길이"]').fill("30");
    await layout.getByRole("button", { name: "도메인검증" }).click();
    await expect(layout.locator(".domain-mng__check-summary")).toContainText("검사 실패", { timeout: 30_000 });
    await expect(layout.locator(".domain-mng__checks")).toContainText("R06");
    await expect(layout.locator(".domain-mng__checks")).toContainText("길이·소수 자리는 부모 이하로만 정할 수 있습니다");
    await expect(layout.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
    await layout.locator(".domain-mng__checks").scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot("dma-domainMng-reject.png"), fullPage: true });

    // ── E5 서버 오류 표시 — 다른 사용자가 먼저 저장(동시 수정) ──
    await selectRow(layout, CHILD_NAME);
    const view = await page.request.post(`${BASE_URL}${API}/view`, {
      data: { meta: { menuId: "domainMng" }, params: { domainId: await childId(page) } },
    });
    const domain = (await view.json()).data.result.domain;
    const other = await page.request.post(`${BASE_URL}${API}/save`, {
      data: {
        meta: { menuId: "domainMng" },
        params: {
          domainId: domain.DOMAIN_ID, ver: domain.VER, domainName: domain.DOMAIN_NAME, stdName: domain.STD_NAME,
          parentDomainId: domain.PARENT_DOMAIN_ID, domainKind: domain.DOMAIN_KIND, dataType: domain.DATA_TYPE,
          length: domain.LENGTH, stdRule: domain.STD_RULE, description: "다른 사용자가 먼저 고침",
        },
        grids: { testCases: { rows: domain.TEST_CASES }, examples: { rows: [] } },
      },
    });
    expect((await other.json()).meta.success, "먼저 저장이 성공해야 한다").toBe(true);
    await layout.locator('textarea[aria-label="정의"]').fill("화면에서 고친 설명");
    await validateAndSave(layout);
    const modal = page.locator(".error-modal__body");
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(modal).toContainText("다른 사용자가 수정");
    await page.screenshot({ path: screenshot("dma-domainMng-error.png"), fullPage: true });
    await page.getByRole("button", { name: "확인" }).click();

    // ── E6 영향도 — 하위 1, 참조 컬럼·룰 결과 변수·레이아웃 0, 배포 보류 ──
    await selectRow(layout, PARENT_NAME);
    const impact = layout.locator(".domain-mng__impact");
    await expect(impact.locator(".ag-row").filter({ hasText: "하위 도메인" })).toContainText("1");
    await expect(impact.locator(".ag-row").filter({ hasText: "하위 도메인" })).toContainText(CHILD_NAME);
    await expect(impact.locator(".ag-row").filter({ hasText: "참조 컬럼" })).toContainText("0");
    await expect(impact.locator(".ag-row").filter({ hasText: "룰 결과 변수" })).toContainText("0");
    await expect(impact.locator(".ag-row").filter({ hasText: "레이아웃" })).toContainText("0");
    await expect(impact.locator(".ag-row").filter({ hasText: "배포 시스템" })).toContainText("배포 보류");
    await impact.scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot("dma-domainMng-impact.png"), fullPage: true });
  });

  test("E8 부모 교체·연결 제거는 대화상자에서 경고를 보고 확인한 뒤 바뀐다", async ({ page }) => {
    await login(page, ADMIN);
    const created = await page.request.post(`${BASE_URL}${API}/save`, {
      data: {
        meta: { menuId: "domainMng" },
        params: { domainName: OTHER_NAME, stdName: OTHER_STD, domainKind: "ID", dataType: "STRING", length: 30,
          stdRule: "STR_LENGTH(value) <= 30" },
        grids: { testCases: { rows: [{ VALUE: "C24090401AB", EXPECT: true }] }, examples: { rows: [] } },
      },
    });
    expect((await created.json()).meta.success, "다른 부모 후보 등록").toBe(true);
    const layout = await openDomainMng(page);
    await search(layout, STAMP);
    await selectRow(layout, CHILD_NAME);
    await expect(layout.getByTestId("domain-parent")).toBeDisabled(); // 수정 폼에서는 고정

    // ── 교체 — 부모가 있으니 [부모 연결] 은 교체다. 고르면 검증하고 영향 경고(W04)·diff 를 보인다 ──
    await layout.getByRole("button", { name: "부모 연결", exact: true }).click();
    const dialog = page.getByTestId("domain-parent-link-modal");
    const dialogButton = (name: string) => page.locator(".cm-modal").getByRole("button", { name, exact: true });
    await expect(page.locator(".cm-modal-title")).toHaveText("부모 교체");
    const validated = page.waitForResponse((r) => r.url().includes(`${API}/validate`), { timeout: 30_000 });
    // 검색형 칸 — 이름을 넣고 Enter 로 확정하면 서버 검색이 하나로 정해 바로 검사한다.
    const parentField = dialog.getByTestId("domain-parent-link-field");
    await parentField.fill(OTHER_NAME);
    await parentField.press("Enter");
    await validated;
    await expect(dialog.locator(".domain-mng__check-summary")).toContainText("검사 통과", { timeout: 30_000 });
    await expect(dialog.locator(".domain-mng__checks")).toContainText("W04");
    await expect(dialog.locator(".domain-mng__classification")).toHaveText("부모 변경");
    await page.screenshot({ path: screenshot("dma-domainMng-relink.png"), fullPage: true });
    await dialogButton("교체").click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await search(layout, STAMP);
    let child = await viewChild(page);
    expect(child.PARENT_DOMAIN_ID, "새 부모로 바뀐다").toBe(await domainId(page, OTHER_STD));

    // ── 연결 제거 — 열자마자 검증하고 구체화 경고(W05)를 보인 뒤 확인하면 최상위가 된다 ──
    await selectRow(layout, CHILD_NAME);
    await layout.getByRole("button", { name: "연결 제거", exact: true }).click();
    await expect(page.locator(".cm-modal-title")).toHaveText("부모 연결 제거");
    await expect(dialog.locator(".domain-mng__checks")).toContainText("W05", { timeout: 30_000 });
    await page.screenshot({ path: screenshot("dma-domainMng-unlink.png"), fullPage: true });
    await dialogButton("연결 제거").click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    child = await viewChild(page);
    expect(child.PARENT_DOMAIN_ID).toBeNull();
    expect(child.STD_RULE, "상속받던 표준식을 이어 붙인다").toBe("(STR_LENGTH(value) <= 30) && (STR_LENGTH(value) <= 15)");
    await search(layout, STAMP);
    await expect(gridRow(layout, CHILD_NAME)).not.toContainText("└");
  });

  test("E7 담당자는 목록을 보되 검증·저장 버튼이 없고 서버 미리보기를 부르지 않는다", async ({ page }) => {
    const forbidden: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes(API) && r.status() === 403) forbidden.push(r.url());
    });
    await login(page, STEWARD);
    const layout = await openDomainMng(page);
    await search(layout, STAMP);
    await expect(gridRow(layout, PARENT_NAME)).toBeVisible({ timeout: 30_000 });
    await selectRow(layout, CHILD_NAME);
    await layout.locator('input[aria-label="미리보기 입력값"]').fill("abc");
    await expect(layout.locator(".domain-mng__preview-std")).toHaveText("표준 실패");
    await expect(layout.getByRole("button", { name: "도메인검증" })).toHaveCount(0);
    await expect(layout.getByRole("button", { name: "저장", exact: true })).toHaveCount(0);
    // 상단 버튼은 숨지 않고 RBAC(save 권한 없음)로 잠긴다(PageLayout)
    await expect(layout.getByRole("button", { name: "부모 연결", exact: true })).toBeDisabled();
    await expect(layout.getByRole("button", { name: "연결 제거", exact: true })).toBeDisabled();
    await expect(layout.locator('input[aria-label="도메인명"]')).toBeDisabled();
    await page.waitForTimeout(800);
    expect(forbidden, "담당자 화면이 권한 없는 action 을 부르면 안 된다").toEqual([]);
    await page.screenshot({ path: screenshot("dma-domainMng-steward.png"), fullPage: true });
  });
});

async function domainId(page: Page, std: string): Promise<number> {
  const res = await page.request.post(`${BASE_URL}${API}/search`, {
    data: { meta: { menuId: "domainMng" }, params: { keyword: std } },
  });
  const rows = (await res.json()).data.result.domains as Array<{ DOMAIN_ID: number; STD_NAME: string }>;
  const row = rows.find((r) => r.STD_NAME === std);
  if (!row) throw new Error(`도메인을 찾지 못했다: ${std}`);
  return row.DOMAIN_ID;
}

async function viewChild(page: Page): Promise<{ PARENT_DOMAIN_ID: number | null; STD_RULE: string | null }> {
  const res = await page.request.post(`${BASE_URL}${API}/view`, {
    data: { meta: { menuId: "domainMng" }, params: { domainId: await domainId(page, CHILD_STD) } },
  });
  return (await res.json()).data.result.domain;
}

async function childId(page: Page): Promise<number> {
  const res = await page.request.post(`${BASE_URL}${API}/search`, {
    data: { meta: { menuId: "domainMng" }, params: { keyword: CHILD_STD } },
  });
  const rows = (await res.json()).data.result.domains as Array<{ DOMAIN_ID: number; STD_NAME: string }>;
  const row = rows.find((r) => r.STD_NAME === CHILD_STD);
  if (!row) throw new Error(`자식 도메인을 찾지 못했다: ${CHILD_STD}`);
  return row.DOMAIN_ID;
}
