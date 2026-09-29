import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * mdm dmd/dataItemMng(항목 편집) smoke — TSK-07-03 design.md §3.1 + TSK-07-04 design.md §3(트리·CSV 버튼).
 *
 * 2026-09-29 통합 D-104: dataItemMng 가 카테고리 편집(dataCateEdit)과 항목 이력(dataHistory)을 흡수했다. 옛
 * mdm-dataCateEdit.spec.ts·mdm-dataHistory.spec.ts 의 시나리오는 아래 S7~S12 로 옮겼고, 없어진 메뉴를 찾던 두 파일은
 * 지웠다(선례: 마루 코드 D-101 커밋 325ccf9c 의 mdm-codeItemEdit.spec.ts).
 *
 * 스모크 넷(dev-discipline):
 *   1. 메뉴 이동 — 담당자(e2e_mdm_steward)로 로그인해 사이드바에서 화면을 연다. dmd 쓰기는 EDIT 세트라 담당자만 한다(F2).
 *   2. 목록 채워짐·빈 상태 — 동적 열 머리(Q5), 카테고리 KR(Q4), 없는 키(0건), EXTERNAL 조회 전용(Q6).
 *   3. 화면 조작만으로 등록·수정 1회 반영 → 이력 패널 2행. 이어서 수용 기준 3(닫힌 키 등록 → 다시 열기 안내 → 다시 열기).
 *   4. 서버 오류 노출(키 패턴) + 수용 기준 4(뒤에서 수정 → 화면 저장 충돌 → 안내 + 재조회).
 *   5·6(TSK-07-04) — 트리 탭: 서버 트리 데이터로 노드가 채워지고, 데이터 없는 마루는 빈 상태(I6). 트리 노드로
 *     "이 노드로 보기" → 그리드가 그 노드 아래로만 필터되고 칩이 보인다 → 칩 ✕ 로 해제(I5).
 * 7·8(D-104 이력) — 오른쪽 열 항목 이력 패널: 항목 1행 이력, 등록·수정·닫기·다시 열기 타임라인(닫혀 있던 구간).
 * 9~12(D-104 카테고리 탭) — BASE 목록, REGEX 등록·오류·오른쪽 카테고리 이력, TABLE 소속 이력, 키 없는 소속 조회 거부.
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
/** 카테고리 탭 시험 전용 마루 데이터(mdm-dataMng.sql) — 쓰기가 E2E_DI_PORT 의 행 수·카테고리 목록을 흔들지 않게 분리한다. */
const CATE_PORT = "E2E_DC_PORT";
const NEW_CATE_ID = `DC${SUFFIX}`;
const HIST_KEY = `E2EH${SUFFIX}`;

// 스크린샷은 저장소 문서(docs)를 건드리지 않도록 git 제외 폴더(mdm-user/.out)에 남긴다.
const screenshot = (name: string) => path.resolve(__dirname, "mdm-user/.out/screens", name);
const screenshot74 = screenshot;

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
}

async function openScreen(page: Page) {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  for (const name of [/^마루 MDM$/, /^마스터데이터$/, /^항목 편집$/]) {
    const node = item(name);
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();
  }
  await expect(page.getByTestId("item-add")).toBeVisible({ timeout: 60_000 });
}

/** 화면 머리 버튼([조회])은 testid 가 없어 머리 버튼 영역 안 라벨로 찾는다(카테고리 탭 이력의 [조회] 와 섞이지 않게). */
const headerButton = (page: Page, name: string) =>
  page.locator(".page-layout__header-buttons:visible").getByRole("button", { name, exact: true });

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
  await page.getByTestId("item-pick-keyword").fill(id);
  await page.getByTestId("item-pick-keyword").press("Enter");
  await page.getByTestId(`item-pick-${id}`).click();
  await searched;
  await expect(page.locator(".grid-panel-count").first()).toBeVisible();
}

async function search(page: Page) {
  const searched = waitAction(page, "search");
  await headerButton(page, "조회").click();
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
  await page.getByTestId("item-add").click();
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

  test("S1 메뉴 이동: 마루 MDM > 마스터데이터 > 항목 편집", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await expect(
      page.locator(".page-layout__footer-breadcrumb").filter({ hasText: /마루 MDM > 마스터데이터 > 항목 편집/ }),
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
    await expect(page.getByTestId("item-add")).toBeDisabled();
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
    await expect(page.getByTestId("item-csv-upload")).toBeEnabled();

    const treeLoaded = waitTree(page, PORT);
    await page.getByTestId("item-tab-tree").click();
    await treeLoaded;
    const tree = page.getByTestId("item-tree");
    // I8 — lvl1 값별로 그룹 노드가 생긴다(코드 자신은 아니므로 순수 그룹, "값 (n건)"). 새 항목이 늘 수 있어 건수는 고정하지 않는다.
    await expect(tree.locator(".tree-item").filter({ hasText: /^KR \(\d+건\)$/ })).toBeVisible();
    await expect(tree.locator(".tree-item").filter({ hasText: /^CN \(\d+건\)$/ })).toBeVisible();
    await page.screenshot({ path: screenshot74("dmd-dataItemMng-tree.png"), fullPage: true });

    // 마루 데이터를 바꾸는 selectMaru 는 그리드 조회를 기다리므로 [항목] 탭에서 한다(트리 탭에는 그리드 건수가 없다).
    await page.getByTestId("item-tab-grid").click();
    await selectMaru(page, CUST);
    await expect(page.getByTestId("item-csv-upload")).toBeDisabled();

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

  // ── D-104 이력: 오른쪽 열 항목 이력 패널(옛 dataHistory 화면의 대상 「항목」) ──

  test("S7 항목 이력 패널: 행의 [이력]을 누르면 오른쪽에 그 키의 이력(1행)이 보이고, 닫으면 안내로 돌아간다", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await selectMaru(page, PORT);

    // 이력을 부르기 전에도 패널은 보이고 안내만 있다.
    await expect(page.getByTestId("item-history-empty")).toBeVisible();
    await expect(page.getByTestId("item-history-close")).toHaveCount(0);

    const history = waitAction(page, "search", "dataHistory");
    await page.getByTestId("item-history-KRPUS").click();
    await history;
    const panel = page.getByTestId("item-history");
    await expect(panel).toContainText("이력 — KRPUS");
    await expect(panel.getByTestId("history-state")).toHaveText("KRPUS · 열림 · 1행", { timeout: 20_000 });
    await expect(panel.locator(".ag-center-cols-container .ag-row")).toHaveCount(1);
    await expect(panel.locator('.ag-row[row-id="r0"]')).toContainText("생성");
    await expect(panel.locator('.ag-row[row-id="r0"]')).toContainText("열림");
    await page.screenshot({ path: screenshot("dmd-dataItemMng-history.png"), fullPage: true });

    await page.getByTestId("item-history-close").click();
    await expect(page.getByTestId("item-history-empty")).toBeVisible();
    await expect(panel).not.toContainText("이력 — KRPUS");
  });

  test("S8 이력 타임라인: 생성·변경·닫혀 있던 구간·다시 열기가 화면 조작만으로 남는다", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await selectMaru(page, PORT);

    const searched = waitAction(page, "search");
    await register(page, { code: HIST_KEY, name: "이력항목", lvl1: "KR" });
    await searched;
    await expect(cell(page, HIST_KEY, "name")).toHaveText("이력항목", { timeout: 20_000 });

    await editCell(page, HIST_KEY, "name", "이력항목변경");
    const saved = waitAction(page, "save");
    await page.getByTestId(`item-save-${HIST_KEY}`).click();
    await saved;
    await expect(cell(page, HIST_KEY, "name")).toHaveText("이력항목변경", { timeout: 20_000 });

    const closed = waitAction(page, "delete");
    await page.getByTestId(`item-close-${HIST_KEY}`).click();
    await closed;
    await expect(listRow(page, HIST_KEY)).toHaveCount(0, { timeout: 20_000 });
    await page.getByTestId("item-search-closed").selectOption("Y");
    await search(page);
    await expect(cell(page, HIST_KEY, "open")).toHaveText("닫힘", { timeout: 20_000 });

    const reopened = waitAction(page, "restore");
    await page.getByTestId(`item-reopen-${HIST_KEY}`).click();
    await reopened;
    await expect(cell(page, HIST_KEY, "open")).toHaveText("열림", { timeout: 20_000 });

    const history = waitAction(page, "search", "dataHistory");
    await page.getByTestId(`item-history-${HIST_KEY}`).click();
    await history;
    const panel = page.getByTestId("item-history");
    await expect(panel.locator(".ag-center-cols-container .ag-row")).toHaveCount(4, { timeout: 20_000 });
    await expect(panel.locator('.ag-row[row-id="r0"]')).toContainText("생성");
    await expect(panel.locator('.ag-row[row-id="gap2"]')).toContainText("닫혀 있던 구간");
    await expect(panel.locator('.ag-row[row-id="r2"]')).toContainText("다시 열기");
    await expect(panel.getByTestId("history-state")).toContainText("열림");
    await page.screenshot({ path: screenshot("dmd-dataItemMng-timeline.png"), fullPage: true });
  });

  // ── D-104 카테고리 탭(옛 dataCateEdit 화면) ──

  /** 카테고리 시험 전용 마루 데이터를 고른 뒤 [카테고리] 탭으로 들어간다. 마루 데이터 고르기는 [항목] 탭에서 한다. */
  async function openCateTab(page: Page) {
    await login(page, STEWARD);
    await openScreen(page);
    await selectMaru(page, CATE_PORT);
    await page.getByTestId("item-tab-cate").click();
    await expect(page.getByTestId("cate-tab")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cate-row-BASE")).toBeVisible({ timeout: 20_000 });
  }

  function waitCate(page: Page, action: string) {
    return waitAction(page, action, "dataCateEdit");
  }

  async function addRegexCategory(page: Page, id: string, name: string) {
    const registered = waitCate(page, "reg");
    await page.getByTestId("cate-add-id").fill(id);
    await page.getByTestId("cate-add-name").fill(name);
    await page.getByTestId("cate-add-kind").selectOption("REGEX");
    await page.getByTestId("cate-add-submit").click();
    await registered;
    await expect(page.getByTestId(`cate-row-${id}`)).toBeVisible({ timeout: 20_000 });
  }

  test("S9 카테고리 탭 목록: BASE 포함 목록이 보이고 BASE 는 닫기 버튼이 없다", async ({ page }) => {
    await openCateTab(page);
    await expect(page.getByTestId("cate-row-DC_GROUP")).toBeVisible();
    // BASE 는 닫기·다시 열기 버튼이 없다(R6).
    await expect(page.getByTestId("cate-close-BASE")).toHaveCount(0);
    await expect(page.getByTestId("cate-reopen-BASE")).toHaveCount(0);
    // 고르기 전에는 오른쪽 편집 자리와 카테고리 이력 자리에 안내만 있다. 항목 이력 패널은 이 탭에 없다.
    await expect(page.getByTestId("cate-edit-empty")).toHaveText("왼쪽에서 카테고리를 고르세요");
    await expect(page.getByTestId("cate-history-empty")).toBeVisible();
    await expect(page.getByTestId("item-history")).toHaveCount(0);

    await page.getByTestId("cate-row-BASE").click();
    await expect(page.getByTestId("regex-edit-panel")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataItemMng-cate-list.png"), fullPage: true });
  });

  test("S10 REGEX 카테고리: 등록하면 카테고리 이력에 생성이 남고, 저장하면 변경이 더해지며, 잘못된 문법은 거부된다", async ({ page }) => {
    await openCateTab(page);
    await addRegexCategory(page, NEW_CATE_ID, "E2E 등록 테스트");
    await expect(page.getByTestId("regex-edit-panel")).toBeVisible({ timeout: 20_000 });

    // 오른쪽 열 — 고른 카테고리의 이력(생성 1행). REGEX 를 고르면 미리보기도 함께 뜬다.
    const cateHistory = page.getByTestId("cate-history");
    await expect(cateHistory).toContainText(`카테고리 이력 — ${NEW_CATE_ID}`, { timeout: 20_000 });
    await expect(cateHistory.locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 20_000 });
    await expect(cateHistory.locator('.ag-row[row-id="r0"]')).toContainText("생성");
    // 좁은 오른쪽 열에서도 정의(이름·종류·대상·정규식)가 가로로 밀지 않고 한 칸에 보인다(D-104 회귀).
    await expect(cateHistory.locator(".ag-header-cell-text")).toHaveText(["사건", "시작", "끝", "카테고리 정의"]);
    const createdDef = cateHistory.locator('.ag-row[row-id="r0"] .ag-cell[col-id="cateName"]');
    await expect(createdDef).toBeVisible();
    await expect(createdDef).toContainText("E2E 등록 테스트");
    await expect(createdDef).toContainText("REGEX · KEY");
    await expect(createdDef).toContainText("^.*$");
    await expect(page.getByTestId("cate-preview")).toBeVisible();

    // 저장 — DCKR 로 시작하는 KEY 는 픽스처의 2건이다. 미리보기 조회는 자동이라 응답을 기다리지 않고 화면 값을 본다.
    await page.getByTestId("regex-expr").fill("^DCKR.*");
    await expect(page.getByTestId("preview-count")).toHaveText("매칭 2건", { timeout: 20_000 });
    const saved = waitCate(page, "save");
    await page.getByTestId("regex-save").click();
    await saved;
    await expect(page.getByTestId(`cate-match-${NEW_CATE_ID}`)).toHaveText("2건", { timeout: 20_000 });
    await expect(cateHistory.locator(".ag-center-cols-container .ag-row")).toHaveCount(2, { timeout: 20_000 });
    await expect(cateHistory.locator('.ag-row[row-id="r1"]')).toContainText("변경");
    // 바뀐 정규식이 변경 행에 보이고, 기본 폭(1280)에서도 이력 그리드에 가로 스크롤이 없다.
    const changedDef = cateHistory.locator('.ag-row[row-id="r1"] .ag-cell[col-id="cateName"]');
    await expect(changedDef).toBeVisible();
    await expect(changedDef).toContainText("^DCKR.*");
    const overflow = await cateHistory.locator(".ag-center-cols-viewport").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, "카테고리 이력 그리드에 가로 스크롤이 없다").toBeLessThanOrEqual(0);
    await page.screenshot({ path: screenshot("dmd-dataItemMng-cate-register.png"), fullPage: true });

    // 잘못된 문법은 미리보기가 알리고 저장도 서버가 거부한다.
    await page.getByTestId("regex-expr").fill("[");
    await expect(page.getByTestId("preview-invalid")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("regex-save").click();
    await expect(await errorModal(page)).toContainText("카테고리 정의가 올바르지 않습니다");
    await page.screenshot({ path: screenshot("dmd-dataItemMng-cate-invalid-regex.png"), fullPage: true });
    await closeErrorModal(page);
  });

  test("S11 TABLE 카테고리 이력: 카테고리 1행, 소속은 키를 넣고 [조회]하면 그 항목의 소속 선분이 보인다", async ({ page }) => {
    await openCateTab(page);
    await page.getByTestId("cate-row-DC_GROUP").click();
    await expect(page.getByTestId("transfer-list-panel")).toBeVisible({ timeout: 20_000 });

    const cateHistory = page.getByTestId("cate-history");
    await expect(cateHistory).toContainText("카테고리 이력 — DC_GROUP", { timeout: 20_000 });
    await expect(cateHistory.locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 20_000 });
    // TABLE 은 정규식·대상이 없다 — 정의 칸에 이름과 종류만 보인다.
    const tableDef = cateHistory.locator('.ag-row[row-id="r0"] .ag-cell[col-id="cateName"]');
    await expect(tableDef).toBeVisible();
    await expect(tableDef).toContainText("주요 그룹");
    await expect(tableDef).toContainText("TABLE");

    await page.getByTestId("cate-history-target").selectOption("CATE_ITEM");
    await expect(page.getByTestId("cate-history-key")).toBeVisible();
    // 소속은 [조회] 를 눌러야 부른다 — 대상을 바꾼 직후에는 옛 결과가 비워진다.
    await page.getByTestId("cate-history-key").fill("DCKRPUS");
    const member = waitAction(page, "search", "dataHistory");
    await page.getByTestId("cate-history-search").click();
    await member;
    await expect(cateHistory.getByTestId("history-state")).toContainText("DCKRPUS · 열림", { timeout: 20_000 });
    // 소속 이력은 항목 키 칸이 네 번째에 보인다(가로로 밀지 않는다).
    await expect(cateHistory.locator(".ag-header-cell-text")).toHaveText(["사건", "시작", "끝", "항목 키"]);
    await expect(cateHistory.locator('.ag-row[row-id="r0"]')).toContainText("생성");
    await expect(cateHistory.locator('.ag-row[row-id="r0"] .ag-cell[col-id="memberKey"]')).toHaveText("DCKRPUS");

    await page.getByTestId("cate-history-key").fill("DCKRINC");
    const none = waitAction(page, "search", "dataHistory");
    await page.getByTestId("cate-history-search").click();
    await none;
    await expect(cateHistory.getByTestId("history-empty")).toHaveText("행이 없습니다", { timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataItemMng-cate-history.png"), fullPage: true });
  });

  test("S12 소속 이력을 키 없이 조회하면 서버 거부 문구가 보인다", async ({ page }) => {
    await openCateTab(page);
    await page.getByTestId("cate-row-DC_GROUP").click();
    await expect(page.getByTestId("transfer-list-panel")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("cate-history-target").selectOption("CATE_ITEM");
    await page.getByTestId("cate-history-search").click();
    await expect(await errorModal(page)).toContainText("키를 입력하세요");
    await page.screenshot({ path: screenshot("dmd-dataItemMng-cate-history-error.png"), fullPage: true });
    await closeErrorModal(page);
  });
});
