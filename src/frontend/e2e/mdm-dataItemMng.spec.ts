import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * mdm dmd/dataItemMng(항목 관리) smoke — TSK-07-03 design.md §3.1 + TSK-07-04 design.md §3(트리·CSV 버튼).
 *
 * 스모크 넷(dev-discipline):
 *   1. 메뉴 이동 — 담당자(e2e_mdm_steward)로 로그인해 사이드바에서 화면을 연다. dmd 쓰기는 EDIT 세트라 담당자만 한다(F2).
 *   2. 목록 채워짐·빈 상태 — 동적 열 머리(Q5), 카테고리 KR(Q4), 없는 키(0건), EXTERNAL 조회 전용(Q6).
 *   3. 화면 조작만으로 등록·수정 1회 반영 → 이력 패널 2행. 이어서 수용 기준 3(닫힌 키 등록 → 다시 열기 안내 → 다시 열기).
 *   4. 서버 오류 노출(키 패턴) + 수용 기준 4(뒤에서 수정 → 화면 저장 충돌 → 안내 + 재조회).
 *   5·6(TSK-07-04) — 트리 탭: 서버 트리 데이터로 노드가 채워지고, 데이터 없는 마루는 빈 상태(I6). 트리 노드로
 *     "이 노드로 보기" → 그리드가 그 노드 아래로만 필터되고 칩이 보인다 → 칩 ✕ 로 해제(I5).
 *
 * 픽스처: e2e/fixtures/mdm-dataItem.sql(mdm.db). 서버 절차는 build-log.md 「E2E 서버 절차(TSK-07-04)」(TSK-07-03
 * design.md 「E2E 서버 절차」를 이 워크트리 값으로 옮긴 것). SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다. 픽스처
 * 행은 고치지 않고 쓰기는 실행마다 새 키로 한다(같은 mdm.db 로 다시 돌려도 결과가 같다).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const NEW_KEY = `E2E${SUFFIX}`;
const PORT = "E2E_DI_PORT";
const CUST = "E2E_DI_CUST";
const EMPTY = "E2E_DI_EMPTY";
const CLOSED_KEY_REOPEN = "닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요";
const CONFLICT = "다른 사용자가 수정했습니다";

const screenshot = (name: string) =>
  path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-07-03/screens", name);

/** TSK-07-04 신규 스크린샷은 이 Task 폴더에 남긴다(TSK-07-03 산출물을 덮어쓰지 않는다). */
const screenshot74 = (name: string) =>
  path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-07-04/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
}

async function openScreen(page: Page) {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  for (const name of [/^마루 MDM$/, /^마스터데이터$/, /^항목 관리$/]) {
    const node = item(name);
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();
  }
  await expect(page.getByRole("button", { name: "항목 추가" })).toBeVisible({ timeout: 60_000 });
}

function waitAction(page: Page, action: string, service = "dataItemMng") {
  return page.waitForResponse(
    (r) => r.url().includes(`/api/mdm/oasis/${service}/${action}`) && r.status() === 200,
    { timeout: 30_000 },
  );
}

/**
 * 트리 탭 로드(`withTree=true`)·그리드 조회 둘 다 같은 `dataItemMng/search` 엔드포인트를 쓴다(TSK-07-04 design.md §2).
 * `waitAction(page, "search")` 만으로는 둘을 가르지 못해 요청 postData 로 좁힌다(`selectMaru` 와 같은 방식).
 */
function waitSearchWhere(page: Page, matches: (postData: string) => boolean) {
  return page.waitForResponse(
    (r) =>
      r.url().includes("/api/mdm/oasis/dataItemMng/search") &&
      r.status() === 200 &&
      matches(r.request().postData() ?? ""),
    { timeout: 30_000 },
  );
}

function waitTree(page: Page, maruDataId: string) {
  return waitSearchWhere(
    page,
    (pd) => pd.includes('"withTree":true') && pd.includes(`"maruDataId":"${maruDataId}"`),
  );
}

function waitNodeFilter(page: Page, node: string) {
  return waitSearchWhere(page, (pd) => pd.includes(`"nodeFilter":"${node}"`));
}

/** 그 마루 데이터의 search 응답을 기다린다(첫 로드의 자동 선택 조회 응답과 섞이지 않게). */
async function selectMaru(page: Page, id: string) {
  const searched = page.waitForResponse(
    (r) =>
      r.url().includes("/api/mdm/oasis/dataItemMng/search") &&
      r.status() === 200 &&
      (r.request().postData() ?? "").includes(`"maruDataId":"${id}"`),
    { timeout: 30_000 },
  );
  await page.getByTestId("item-search-maru").selectOption(id);
  await searched;
  await expect(page.locator(".grid-panel-count").first()).toBeVisible();
}

async function search(page: Page) {
  const searched = waitAction(page, "search");
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await searched;
}

function listRow(page: Page, code: string): Locator {
  return page.getByTestId("item-list").locator(`.ag-center-cols-container .ag-row[row-id="${code}"]`);
}

function cell(page: Page, code: string, colId: string): Locator {
  return listRow(page, code).locator(`.ag-cell[col-id="${colId}"]`);
}

async function editCell(page: Page, code: string, colId: string, value: string) {
  const target = cell(page, code, colId);
  await target.click();
  const editor = target.locator("input");
  await expect(editor).toBeVisible({ timeout: 5_000 });
  await editor.fill(value);
  await editor.press("Enter");
  await expect(target).toHaveText(value, { timeout: 5_000 });
}

async function errorModal(page: Page): Promise<Locator> {
  const modal = page.locator(".error-modal__body");
  await expect(modal).toBeVisible({ timeout: 20_000 });
  return modal;
}

async function closeErrorModal(page: Page) {
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.locator(".error-modal__body")).toBeHidden({ timeout: 10_000 });
}

async function register(page: Page, fields: Record<string, string>) {
  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(page.getByTestId("item-form")).toBeVisible();
  for (const [field, value] of Object.entries(fields)) {
    await page.getByTestId(`item-form-${field}`).fill(value);
  }
  const reg = waitAction(page, "reg");
  await page.getByTestId("item-form-submit").click();
  await reg;
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dmd/dataItemMng smoke", () => {
  test.setTimeout(150_000);

  test("S1 메뉴 이동: 마루 MDM > 마스터데이터 > 항목 관리", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await expect(
      page.locator(".page-layout__footer-breadcrumb").filter({ hasText: "마루 MDM > 마스터데이터 > 항목 관리" }),
    ).toBeVisible();
  });

  test("S2 목록: 동적 열·카테고리·빈 상태·EXTERNAL 조회 전용", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await selectMaru(page, PORT);

    for (const code of ["KRPUS", "KRINC", "CNSHA"]) {
      await expect(listRow(page, code)).toBeVisible({ timeout: 20_000 });
    }
    const headers = page.getByTestId("item-list").locator(".ag-header-cell-text");
    await expect(headers.filter({ hasText: /^1차$/ })).toHaveCount(1);
    await expect(headers.filter({ hasText: /^국가$/ })).toHaveCount(1);
    await expect(headers.filter({ hasText: /^비고$/ })).toHaveCount(1);
    await expect(headers.filter({ hasText: /^attr02$/ })).toHaveCount(0);

    await page.getByTestId("item-search-cate").selectOption("KR");
    await search(page);
    await expect(listRow(page, "KRPUS")).toBeVisible();
    await expect(listRow(page, "KRINC")).toBeVisible();
    await expect(listRow(page, "CNSHA")).toHaveCount(0);

    await page.getByTestId("item-search-cate").selectOption("");
    await page.getByTestId("item-search-code").fill(`__NOMATCH_${SUFFIX}__`);
    await search(page);
    await expect(page.getByTestId("item-list").locator(".grid-panel-count")).toHaveText("0건");

    await selectMaru(page, CUST);
    await expect(listRow(page, "C0001")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "항목 추가" })).toBeDisabled();
    await expect(page.getByTestId("item-close-C0001")).toHaveCount(0);
    await expect(page.getByTestId("item-readonly")).toBeVisible();
    await page.screenshot({ path: screenshot("dmd-dataItemMng-list.png"), fullPage: true });
  });

  test("S3 등록·수정 1회 반영, 이력 2행, 닫힌 키 등록은 다시 열기 안내(수용 기준 3)", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await selectMaru(page, PORT);

    const searched = waitAction(page, "search");
    await register(page, { code: NEW_KEY, name: "테스트항목", lvl1: "KR" });
    await searched;
    await expect(cell(page, NEW_KEY, "name")).toHaveText("테스트항목", { timeout: 20_000 });

    await editCell(page, NEW_KEY, "name", "테스트항목수정");
    const saved = waitAction(page, "save");
    await page.getByTestId(`item-save-${NEW_KEY}`).click();
    await saved;
    await expect(cell(page, NEW_KEY, "name")).toHaveText("테스트항목수정", { timeout: 20_000 });

    const history = waitAction(page, "search", "dataHistory");
    await page.getByTestId(`item-history-${NEW_KEY}`).click();
    await history;
    const panel = page.getByTestId("item-history");
    const r0 = panel.locator('.ag-row[row-id="r0"]');
    const r1 = panel.locator('.ag-row[row-id="r1"]');
    await expect(r0).toContainText("생성");
    await expect(r1).toContainText("변경");
    await expect(panel.locator(".ag-center-cols-container .ag-row")).toHaveCount(2);
    const r0To = await r0.locator('.ag-cell[col-id="validTo"]').innerText();
    await expect(r1.locator('.ag-cell[col-id="validFrom"]')).toHaveText(r0To);
    await page.screenshot({ path: screenshot("dmd-dataItemMng-edit.png"), fullPage: true });

    // 수용 기준 3 — 닫기 → 닫힌 항목 보기 → 같은 키 등록 거부(다시 열기 안내) → 다시 열기.
    const closed = waitAction(page, "delete");
    await page.getByTestId(`item-close-${NEW_KEY}`).click();
    await closed;
    await expect(listRow(page, NEW_KEY)).toHaveCount(0, { timeout: 20_000 });
    await page.getByTestId("item-search-closed").selectOption("Y");
    await search(page);
    await expect(cell(page, NEW_KEY, "open")).toHaveText("닫힘", { timeout: 20_000 });

    await register(page, { code: NEW_KEY, name: "다시등록" });
    await expect(await errorModal(page)).toContainText(CLOSED_KEY_REOPEN);
    await closeErrorModal(page);
    await page.getByTestId("item-form-cancel").click();

    const reopened = waitAction(page, "restore");
    await page.getByTestId(`item-reopen-${NEW_KEY}`).click();
    await reopened;
    await expect(cell(page, NEW_KEY, "open")).toHaveText("열림", { timeout: 20_000 });
  });

  test("S4 서버 오류 노출(키 패턴)과 다른 사용자 수정 충돌 재조회(수용 기준 4)", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await selectMaru(page, PORT);

    await register(page, { code: "bad key", name: "나쁜 키" });
    await expect(await errorModal(page)).toContainText("키 패턴");
    await closeErrorModal(page);
    await page.getByTestId("item-form-cancel").click();

    await page.getByTestId("item-search-code").fill(NEW_KEY);
    await search(page);
    await expect(listRow(page, NEW_KEY)).toBeVisible({ timeout: 20_000 });

    // 다른 사용자 수정 흉내 — 화면이 본 row_version 으로 먼저 저장한다.
    const current = await page.request.post(`${BASE_URL}/api/mdm/oasis/dataItemMng/search`, {
      data: { meta: { menuId: "dataItemMng" }, params: { maruDataId: PORT, code: NEW_KEY } },
    });
    const rowVersion = (await current.json()).data.result.list[0].rowVersion as number;
    const behind = await page.request.post(`${BASE_URL}/api/mdm/oasis/dataItemMng/save`, {
      data: {
        meta: { menuId: "dataItemMng" },
        params: { maruDataId: PORT, code: NEW_KEY, name: "뒤에서수정", lvl1: "KR", expectedRowVersion: rowVersion },
      },
    });
    expect((await behind.json()).meta.success).toBe(true);

    await editCell(page, NEW_KEY, "name", "화면수정");
    const saved = waitAction(page, "save");
    const reloaded = waitAction(page, "search");
    await page.getByTestId(`item-save-${NEW_KEY}`).click();
    await saved;
    await expect(await errorModal(page)).toContainText(CONFLICT);
    await reloaded;
    await expect(cell(page, NEW_KEY, "name")).toHaveText("뒤에서수정", { timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataItemMng-error.png"), fullPage: true });
    await closeErrorModal(page);
  });

  test("S5 트리 보기: 서버 트리 데이터로 노드가 채워지고, CSV 버튼·데이터 없는 마루는 빈 상태(TSK-07-04)", async ({
    page,
  }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await selectMaru(page, PORT);

    // "CSV 업로드" 버튼 존재 스모크 — MDM·INUSE·편집 가능(PORT)이면 활성, EXTERNAL 조회 전용(CUST)이면 비활성(Q6 과 같은 판정).
    await expect(page.getByRole("button", { name: "CSV 업로드" })).toBeEnabled();

    const treeLoaded = waitTree(page, PORT);
    await page.getByTestId("item-tab-tree").click();
    await treeLoaded;
    const tree = page.getByTestId("item-tree");
    // I8 — lvl1 값별로 그룹 노드가 생긴다(코드 자신은 아니므로 순수 그룹, "값 (n건)"). 새 항목이 늘 수 있어 건수는 고정하지 않는다.
    await expect(tree.locator(".tree-item").filter({ hasText: /^KR \(\d+건\)$/ })).toBeVisible();
    await expect(tree.locator(".tree-item").filter({ hasText: /^CN \(\d+건\)$/ })).toBeVisible();
    await page.screenshot({ path: screenshot74("dmd-dataItemMng-tree.png"), fullPage: true });

    await selectMaru(page, CUST);
    await expect(page.getByRole("button", { name: "CSV 업로드" })).toBeDisabled();

    await selectMaru(page, EMPTY);
    const emptyTreeLoaded = waitTree(page, EMPTY);
    await page.getByTestId("item-tab-tree").click();
    await emptyTreeLoaded;
    await expect(page.getByTestId("item-tree-empty")).toBeVisible({ timeout: 20_000 });
  });

  test("S6 트리 노드 선택 → 이 노드로 보기 → 그리드 필터 칩 → 해제(TSK-07-04, I5)", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await selectMaru(page, PORT);

    const treeLoaded = waitTree(page, PORT);
    await page.getByTestId("item-tab-tree").click();
    await treeLoaded;

    const krNode = page.getByTestId("item-tree").locator(".tree-item").filter({ hasText: /^KR \(\d+건\)$/ });
    await krNode.click();
    await expect(page.getByTestId("item-tree-to-grid")).toBeEnabled();

    const filtered = waitNodeFilter(page, "KR");
    await page.getByTestId("item-tree-to-grid").click();
    await filtered;

    await expect(page.getByTestId("item-node-filter-chip")).toContainText("KR 아래");
    await expect(listRow(page, "KRPUS")).toBeVisible({ timeout: 20_000 });
    await expect(listRow(page, "KRINC")).toBeVisible();
    await expect(listRow(page, "CNSHA")).toHaveCount(0);
    await page.screenshot({ path: screenshot74("dmd-dataItemMng-node-filter.png"), fullPage: true });

    const cleared = waitAction(page, "search");
    await page.getByTestId("item-node-filter-clear").click();
    await cleared;
    await expect(page.getByTestId("item-node-filter-chip")).toHaveCount(0);
    await expect(listRow(page, "CNSHA")).toBeVisible({ timeout: 20_000 });
  });
});
