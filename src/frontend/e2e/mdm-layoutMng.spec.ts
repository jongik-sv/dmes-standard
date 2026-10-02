import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 전문 레이아웃(dmb/layoutMng) 브라우저 E2E — TSK-05-02 design.md §3.5.
 *
 *   L1 메뉴 이동·목록(서버 데이터)·빈 상태(스모크 1·2)   L2 EAI 를 고르면 표준 헤더가 1번에(F25)
 *   L3 M201 을 화면 조작만으로 — 저장 전 본문 첫 오프셋 130·총 187(수용 기준 6)
 *   L5 상수 편집 — CONST 만, 헤더 기본값은 입력 아님, 헤더 길이·순서 입력 없음(수용 기준 3)
 *   L6 저장 → 목록 187, 재정의는 이 전문에만(스모크 3)   L7 서버 오류 표시(동시 수정 MDM001, 스모크 4)
 *   L8 드래그 순서 → 즉시 재계산(serial 에서 불안정할 수 있어 맨 뒤)
 *
 * 전제·실행은 mdm-headerMng.spec.ts 와 같다(design.md §3.7). beforeAll 이 SMOKE_MDM_DB 에 M201 픽스처를 넣는다(멱등).
 * TSK-05-03 design.md §3.6 — L9 등록 검증 7종·인코딩 바이트 샘플 한 줄, L10 표현 자리 부족 거부(검증 표·저장), L11 여분 쪼개기 → 버전 2
 * 순차 전환·스냅샷 JSON·엑셀 내려받기, L12 영향 전문 목록. 스크린샷은 docs/mdm/tasks/TSK-05-03/screens.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const USER = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";
const API = "/api/mdm/oasis/layoutMng";

const STAMP = Date.now().toString(36).toUpperCase();
const NEW_LAYOUT = `출측검사 ${STAMP}`;
const FIXTURE_LAYOUT = "출측검사 실적 수신(E2E)";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-02/screens", name);
const SHOT_0503 = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-03/screens", name);

function loadFixture() {
  const db = process.env.SMOKE_MDM_DB;
  if (!db) throw new Error("SMOKE_MDM_DB 에 워크트리 mdm.db 경로를 넣는다(design.md §3.7)");
  execFileSync("sqlite3", [db], { input: readFileSync(path.resolve(__dirname, "fixtures/mdm-layout-m201.sql")) });
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(USER);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
}

async function openScreen(page: Page): Promise<Locator> {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  for (const name of [/^마루 MDM$/, /^레이아웃$/, /^전문 레이아웃$/]) {
    const node = item(name);
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();
  }
  const layout = page.locator(".page-layout").filter({
    has: page.locator(".page-layout__footer-screen-id", { hasText: "layoutMng" }),
  });
  await expect(layout.getByTestId("layout-list")).toBeVisible({ timeout: 60_000 });
  return layout;
}

async function search(layout: Locator, keyword: string) {
  await layout.getByTestId("layout-search-keyword").fill(keyword);
  await layout.getByRole("button", { name: "조회", exact: true }).click();
}

function listRow(layout: Locator, text: string): Locator {
  return layout.getByTestId("layout-list").locator(".ag-row").filter({ hasText: text }).first();
}

async function selectLayout(layout: Locator, name: string) {
  await listRow(layout, name).click();
  await expect(layout.getByTestId("layout-form-name")).toHaveValue(name, { timeout: 30_000 });
}

async function pickColumn(page: Page, layout: Locator, phys: string) {
  await layout.getByTestId("layout-item-add-column").click();
  const modal = page.getByTestId("column-pick-modal");
  await expect(modal).toBeVisible();
  await page.getByTestId("column-pick-keyword").fill(phys);
  await page.getByTestId("column-pick-search").click();
  await page.getByTestId("column-pick-grid").locator(".ag-row").filter({ hasText: phys }).first().click();
  await page.getByTestId("column-pick-select").click();
  await expect(modal).toBeHidden();
}

function bodyCells(layout: Locator, col: string): Locator {
  return layout.getByTestId("layout-items").locator(`.ag-center-cols-container .ag-cell[col-id="${col}"]`);
}

function bodyRow(layout: Locator, text: string): Locator {
  return layout.getByTestId("layout-items").locator(".ag-center-cols-container .ag-row").filter({ hasText: text }).first();
}

/** 상수 편집 표(AgDataGrid)의 한 행 — 값 칸 span(const-input-PHYS)을 가진 행. */
const constRow = (modal: Locator, phys: string) =>
  modal.locator(".ag-center-cols-container .ag-row").filter({ has: modal.page().getByTestId(`const-input-${phys}`) });
/** 값 칸을 한 번 눌러 편집기를 열고 값을 넣어 Enter 로 확정한다. */
async function editConst(modal: Locator, phys: string, value: string) {
  await constRow(modal, phys).locator('.ag-cell[col-id="VALUE"]').click();
  const editor = modal.locator(".ag-cell-inline-editing input");
  await editor.fill(value);
  await editor.press("Enter");
}

async function openConst(page: Page, layout: Locator, seq: number): Promise<Locator> {
  await layout.getByTestId(`const-edit-open-${seq}`).click();
  const modal = page.getByTestId("const-edit-modal");
  await expect(modal).toBeVisible();
  return modal;
}

async function closeDialog(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).last().click();
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1680, height: 1200 } });

test.describe("mdm 전문 레이아웃", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => loadFixture());

  test("L1 메뉴로 이동하고 목록은 서버 데이터, 결과가 없으면 빈 상태", async ({ page }) => {
    await login(page);
    const layout = await openScreen(page);
    await expect(layout.locator(".page-layout__footer-breadcrumb")).toHaveText("마루 MDM > 레이아웃 > 전문 레이아웃");
    await expect(layout.locator(".page-layout__footer-screen-id")).toHaveText("layoutMng");
    // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 픽스처 전문이 보인다.
    await layout.getByRole("button", { name: "조회", exact: true }).click();
    const row = listRow(layout, FIXTURE_LAYOUT);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("187");
    await expect(row.locator('.ag-cell[col-id="HEADER_SUMMARY"]')).toHaveText("GLUE 공통 헤더(E2E) (100) + L2 구간 헤더(E2E) (30)");
    await page.screenshot({ path: screenshot("dmb-layoutMng-list.png"), fullPage: true });
    await search(layout, `없음-${STAMP}`);
    await expect(layout.getByTestId("layout-list-empty")).toHaveText("조회된 전문이 없습니다", { timeout: 30_000 });
    await page.screenshot({ path: screenshot("dmb-layoutMng-empty.png"), fullPage: true });
  });

  test("L2~L8 M201 등록·상수 재정의·동시 수정·드래그", async ({ page }) => {
    await login(page);
    const layout = await openScreen(page);

    // ── L2 신규 — EAI 를 고르면 그 표준 헤더가 헤더 구성 1번에 ──
    await layout.getByRole("button", { name: "신규", exact: true }).click();
    await layout.getByTestId("layout-form-name").fill(NEW_LAYOUT);
    await layout.getByTestId("layout-form-eai").selectOption("E2EGLUE");
    const stack = layout.getByTestId("layout-header-stack");
    await expect(stack.locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 30_000 });
    await expect(stack).toContainText("GLUE 공통 헤더(E2E)");
    await expect(stack.locator('.ag-cell[col-id="TOTAL_LENGTH"]').first()).toHaveText("100");
    await expect(stack.locator('.ag-cell[col-id="POSITION"]').first()).toHaveText("1-100");

    // ── L3 헤더 추가·시스템·본문 4항목 — 저장 전 즉시 계산 ──
    await layout.getByTestId("layout-header-add").click();
    await page.getByTestId("header-pick-modal").locator(".ag-row").filter({ hasText: "L2 구간 헤더(E2E)" }).first().click();
    await expect(stack.locator(".ag-center-cols-container .ag-row")).toHaveCount(2);
    await layout.getByTestId("layout-form-snd").selectOption("L2");
    await layout.getByTestId("layout-form-rcv").selectOption("MES");
    await pickColumn(page, layout, "COIL_ID");
    await pickColumn(page, layout, "PROD_DT");
    await pickColumn(page, layout, "EXIT_COIL_THK");
    await layout.getByTestId("item-detail-width").fill("4");
    await layout.getByTestId("item-detail-zero").selectOption("Y");
    await layout.getByTestId("item-detail-implied").selectOption("1");
    await layout.getByTestId("layout-item-add-filler").click();
    await layout.getByTestId("item-detail-filler-length").fill("25");
    await expect(layout.getByTestId("layout-body-summary")).toContainText("130");
    await expect(bodyCells(layout, "OFFSET")).toHaveText(["130", "150", "158", "162"]);
    await expect(bodyCells(layout, "LENGTH")).toHaveText(["20", "8", "4", "25"]);
    await expect(layout.getByTestId("layout-total-length")).toContainText("187");
    await expect(layout.getByTestId("layout-total-length")).toHaveText("헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트");
    await page.screenshot({ path: screenshot("dmb-layoutMng-m201.png"), fullPage: true });

    // ── L5 상수 편집 — CONST 8행, 헤더 기본값은 텍스트, 헤더 길이·순서 입력 없음 ──
    let modal = await openConst(page, layout, 1);
    await expect(modal.locator('[data-testid^="const-input-"]')).toHaveCount(8);
    await expect(modal.getByTestId("const-input-TC_CD")).toHaveCount(0);
    await expect(modal.getByTestId("const-default-SND_FAC_TP")).toHaveText("B0");
    await expect(modal.getByTestId("const-default-SND_FAC_TP").locator("input")).toHaveCount(0);
    await expect(page.getByTestId("header-item-length")).toHaveCount(0);
    await editConst(modal, "SND_FAC_TP", "B1");
    await page.getByTestId("const-edit-apply").click();
    await expect(modal).toBeHidden();
    await expect(stack).toContainText("송신공장구분 B1");
    await page.screenshot({ path: screenshot("dmb-layoutMng-const.png"), fullPage: true });

    // ── L6 저장 → 목록 187. 재정의는 이 전문에만 ──
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다.").first()).toBeVisible({ timeout: 30_000 });
    await search(layout, STAMP);
    await expect(listRow(layout, NEW_LAYOUT).locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("187", { timeout: 30_000 });
    await selectLayout(layout, NEW_LAYOUT);
    modal = await openConst(page, layout, 1);
    await expect(modal.getByTestId("const-input-SND_FAC_TP")).toHaveText("B1");
    await closeDialog(page);
    await search(layout, "(E2E)");
    await selectLayout(layout, FIXTURE_LAYOUT);
    modal = await openConst(page, layout, 1);
    // 재정의 값이 없으면 값 칸에 헤더 기본값이 흐린 글자로 보이고 재정의 배지가 붙지 않는다.
    await expect(modal.getByTestId("const-input-SND_FAC_TP")).toHaveText("B0");
    await expect(constRow(modal, "SND_FAC_TP")).not.toContainText("재정의");
    await closeDialog(page);

    // ── L7 서버 오류 표시 — 다른 사용자가 먼저 저장(동시 수정 MDM001) ──
    await search(layout, STAMP);
    await selectLayout(layout, NEW_LAYOUT);
    const layoutId = await findLayoutId(page, NEW_LAYOUT);
    const view = (await (await page.request.post(`${BASE_URL}${API}/view`, {
      data: { meta: { menuId: "layoutMng" }, params: { layoutId } },
    })).json()).data.result;
    const l = view.layout;
    const consts: Array<Record<string, unknown>> = [];
    for (const h of view.headers as Array<{ HEADER_LAYOUT_ID: number; items: Array<Record<string, unknown>> }>) {
      for (const i of h.items) {
        if (i.OVERRIDE_VALUE) consts.push({ HEADER_LAYOUT_ID: h.HEADER_LAYOUT_ID, HEADER_SEQ: i.SEQ, CONST_VALUE: i.OVERRIDE_VALUE });
      }
    }
    expect(consts).toHaveLength(1);
    const other = await page.request.post(`${BASE_URL}${API}/save`, {
      data: {
        meta: { menuId: "layoutMng" },
        params: stripNulls({ layoutId: l.LAYOUT_ID, ver: l.VER, layoutName: `${l.LAYOUT_NAME} 다른이`, eaiCode: l.EAI_CODE,
          sndSystem: l.SND_SYSTEM, rcvSystem: l.RCV_SYSTEM }),
        grids: {
          headers: { rows: (view.headers as Array<{ SEQ: number; HEADER_LAYOUT_ID: number }>).map((h) => ({ SEQ: h.SEQ, HEADER_LAYOUT_ID: h.HEADER_LAYOUT_ID })) },
          consts: { rows: consts },
          items: { rows: (view.items as Array<Record<string, unknown>>).map(itemRequestRow) },
        },
      },
    });
    expect((await other.json()).meta.success, "먼저 저장이 성공해야 한다").toBe(true);
    await layout.getByTestId("layout-form-name").fill(`${NEW_LAYOUT} 화면`);
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    const error = page.locator(".error-modal__body");
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText("다른 사용자가 수정");
    await page.screenshot({ path: screenshot("dmb-layoutMng-error.png"), fullPage: true });
    await page.getByRole("button", { name: "확인" }).click();

    // ── L8 드래그 — FILLER 를 EXIT_COIL_THK 앞으로 → FILLER 158·EXIT_COIL_THK 183(저장하지 않는다) ──
    await search(layout, STAMP);
    await selectLayout(layout, `${NEW_LAYOUT} 다른이`);
    await expect(bodyCells(layout, "OFFSET")).toHaveText(["130", "150", "158", "162"]);
    const handle = bodyRow(layout, "FILLER").locator(".ag-row-drag");
    const target = bodyRow(layout, "EXIT_COIL_THK");
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("드래그 손잡이·대상 행 위치를 얻지 못했다");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 10 });
    await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 5 });
    await page.mouse.up();
    await expect(bodyRow(layout, "FILLER").locator('.ag-cell[col-id="OFFSET"]')).toHaveText("158", { timeout: 10_000 });
    await expect(bodyRow(layout, "EXIT_COIL_THK").locator('.ag-cell[col-id="OFFSET"]')).toHaveText("183");
    await expect(layout.getByTestId("layout-total-length")).toContainText("187");
    await page.screenshot({ path: screenshot("dmb-layoutMng-drag.png"), fullPage: true });
  });

  // ── TSK-05-03 ─────────────────────────────────────────────────────────────

  test("L9 등록 검증 표 7종과 인코딩 바이트 기준 샘플 전문 한 줄", async ({ page }) => {
    await login(page);
    const layout = await openScreen(page);
    await search(layout, "(E2E)");
    await selectLayout(layout, FIXTURE_LAYOUT);
    await layout.getByTestId("layout-tab-check").click();
    await layout.getByTestId("layout-check-run").click();
    await expect(layout.getByTestId("layout-check-table").locator('[data-testid^="layout-check-row-"]')).toHaveCount(7, { timeout: 30_000 });
    for (let n = 1; n <= 7; n++) {
      await expect(layout.getByTestId(`layout-check-result-${n}`)).toHaveText(/^(통과|경고)$/);
    }
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-check.png"), fullPage: true });

    await layout.getByTestId("sample-input-COIL_ID").fill("C26A0012345");
    await layout.getByTestId("sample-input-PROD_DT").fill("20260922");
    await layout.getByTestId("sample-input-EXIT_COIL_THK").fill("3.5");
    await layout.getByTestId("sample-render").click();
    await expect(layout.getByTestId("sample-length")).toContainText("187", { timeout: 30_000 });
    await expect(layout.getByTestId("sample-length")).toContainText("EUC-KR");
    const segs = layout.getByTestId("sample-line").locator('[data-testid^="sample-seg-"]');
    await expect(segs).toHaveCount(23);
    const thk = layout.getByTestId("sample-line").locator('[title$=" 159-162"]');
    await expect(thk).toHaveText("0035");
    await expect(thk).toHaveAttribute("title", /출측 코일 두께 159-162$/);
    const zones = new Set(await segs.evaluateAll((els) => els.map((e) => e.getAttribute("data-zone"))));
    expect(zones).toEqual(new Set(["h1", "h2", "body", "filler"]));
    await expect(layout.getByTestId("sample-parsed-EXIT_COIL_THK")).toHaveText("3.5");
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-sample.png"), fullPage: true });

    // 한글 — EUC-KR 한 글자 2바이트. 다음 항목의 위치는 바이트로 그대로다
    await layout.getByTestId("sample-input-COIL_ID").fill("코일A");
    await layout.getByTestId("sample-render").click();
    const coil = layout.getByTestId("sample-line").locator('[title$=" 131-150"]');
    await expect(coil).toHaveText(`코일A${"·".repeat(15)}`, { timeout: 30_000 });
    await expect(layout.getByTestId("sample-line").locator('[title$=" 151-158"]')).toHaveText("20260922");
    await expect(layout.getByTestId("sample-length")).toContainText("187");
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-sample-hangul.png"), fullPage: true });
  });

  test("L10 표현 자리가 부족하면 검증 표와 저장이 거부를 보인다", async ({ page }) => {
    await login(page);
    const layout = await openScreen(page);
    await search(layout, "(E2E)");
    await selectLayout(layout, FIXTURE_LAYOUT);
    await bodyRow(layout, "EXIT_COIL_THK").click();
    await layout.getByTestId("item-detail-width").fill("2");
    await layout.getByTestId("layout-tab-check").click();
    await layout.getByTestId("layout-check-run").click();
    await expect(layout.getByTestId("layout-check-result-4")).toHaveText("거부", { timeout: 30_000 });
    await expect(layout.getByTestId("layout-check-message-4")).toContainText("표현 자리 2는 도메인");
    for (const n of [1, 2, 3, 5, 6, 7]) {
      await expect(layout.getByTestId(`layout-check-result-${n}`)).toHaveText(/^(통과|경고)$/);
    }
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    const error = page.locator(".error-modal__body");
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText("L14");
    await expect(error).toContainText("표현 자리 2");
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-reject.png"), fullPage: true });
    await page.getByRole("button", { name: "확인" }).click();
    // 픽스처는 바뀌지 않았다 — 다시 고르면 폭 4
    await layout.getByTestId("layout-tab-edit").click();
    await search(layout, "(E2E)");
    await selectLayout(layout, FIXTURE_LAYOUT);
    await expect(bodyRow(layout, "EXIT_COIL_THK").locator('.ag-cell[col-id="LENGTH"]')).toHaveText("4");
  });

  test("L11 여분을 쪼개 항목을 더하면 버전 2 순차 전환, 스냅샷 JSON·엑셀 내려받기", async ({ page }) => {
    const name = `버전 ${STAMP}`;
    await login(page);
    const layout = await openScreen(page);
    await search(layout, "(E2E)");
    await selectLayout(layout, FIXTURE_LAYOUT);
    await layout.getByTestId("layout-tab-version").click();
    await expect(layout.getByTestId("version-list-empty")).toHaveText("저장된 버전이 없습니다");
    await expect(layout.getByTestId("change-class-table")).toContainText("여분을 쪼개 항목 추가");
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-version-empty.png"), fullPage: true });

    // v1 — [COIL_ID, PROD_DT, FILLER 29]
    await layout.getByRole("button", { name: "신규", exact: true }).click();
    await layout.getByTestId("layout-form-name").fill(name);
    await layout.getByTestId("layout-form-eai").selectOption("E2EGLUE");
    const stack = layout.getByTestId("layout-header-stack");
    await expect(stack.locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 30_000 });
    await layout.getByTestId("layout-header-add").click();
    await page.getByTestId("header-pick-modal").locator(".ag-row").filter({ hasText: "L2 구간 헤더(E2E)" }).first().click();
    await expect(stack.locator(".ag-center-cols-container .ag-row")).toHaveCount(2);
    await layout.getByTestId("layout-form-snd").selectOption("L2");
    await layout.getByTestId("layout-form-rcv").selectOption("MES");
    await pickColumn(page, layout, "COIL_ID");
    await pickColumn(page, layout, "PROD_DT");
    await layout.getByTestId("layout-item-add-filler").click();
    await layout.getByTestId("item-detail-filler-length").fill("29");
    await expect(layout.getByTestId("layout-total-length")).toContainText("187");
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다.").first()).toBeVisible({ timeout: 30_000 });
    await expect(layout.getByTestId("layout-form-name")).toHaveValue(name, { timeout: 30_000 });
    await layout.getByTestId("layout-tab-version").click();
    const versions = layout.getByTestId("version-list");
    const vrow = (i: number) => versions.locator(`.ag-center-cols-container .ag-row[row-index="${i}"]`);
    await expect(versions.locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 30_000 });
    await expect(vrow(0)).toContainText("최초 등록");
    await expect(vrow(0).locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("187");
    await expect(vrow(0).locator('.ag-cell[col-id="SWITCH_MODE"]')).toHaveText("-");

    // v2 — 여분 29 를 25 로 줄이고 뒤에 EXIT_COIL_THK 4(여분 안)
    await layout.getByTestId("layout-tab-edit").click();
    await bodyRow(layout, "FILLER").click();
    await layout.getByTestId("item-detail-filler-length").fill("25");
    await pickColumn(page, layout, "EXIT_COIL_THK");
    await layout.getByTestId("item-detail-width").fill("4");
    await layout.getByTestId("item-detail-zero").selectOption("Y");
    await layout.getByTestId("item-detail-implied").selectOption("1");
    await expect(bodyCells(layout, "OFFSET")).toHaveText(["130", "150", "158", "183"]);
    await expect(layout.getByTestId("layout-total-length")).toContainText("187");
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다.").first()).toBeVisible({ timeout: 30_000 });
    await expect(bodyCells(layout, "OFFSET")).toHaveText(["130", "150", "158", "183"], { timeout: 30_000 });
    await layout.getByTestId("layout-tab-version").click();
    await expect(versions.locator(".ag-center-cols-container .ag-row")).toHaveCount(2, { timeout: 30_000 });
    await expect(vrow(0).locator('.ag-cell[col-id="LAYOUT_VERSION"]')).toHaveText("2");
    await expect(vrow(0).locator('.ag-cell[col-id="SWITCH_MODE"]')).toHaveText("순차 전환");
    await expect(vrow(0).locator('.ag-cell[col-id="TOTAL_LENGTH"]')).toHaveText("187");
    await expect(vrow(0)).toContainText("여분 29 → 여분 25 + 출측 코일 두께 4 (여분 쪼개 쓰기)");
    await expect(vrow(1).locator('.ag-cell[col-id="LAYOUT_VERSION"]')).toHaveText("1");
    await expect(layout.getByTestId("snapshot-preview")).toContainText('"layoutVersion": 2', { timeout: 30_000 });
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-version.png"), fullPage: true });

    const layoutId = await findLayoutId(page, name);
    const [json] = await Promise.all([page.waitForEvent("download"), layout.getByTestId("snapshot-download-json").click()]);
    expect(json.suggestedFilename()).toBe(`layout-${layoutId}-v2.json`);
    const snap = JSON.parse(readFileSync(await json.path(), "utf8"));
    expect(snap.layoutVersion).toBe(2);
    expect(snap.totalLength).toBe(187);
    expect(snap.items[3].columnPhys).toBe("EXIT_COIL_THK");
    expect(snap.items[3].offset).toBe(183);
    expect(snap.items[3].length).toBe(4);
    expect(snap.items[3].numFormat.impliedScale).toBe(1);
    expect(snap.items[3].scale).toBe(1);
    const [xlsx] = await Promise.all([page.waitForEvent("download"), layout.getByTestId("snapshot-download-excel").click()]);
    expect(xlsx.suggestedFilename()).toBe(`layout-${layoutId}-v2.xlsx`);
  });

  test("L12 컬럼·도메인 변경 영향 전문 목록", async ({ page }) => {
    await login(page);
    const layout = await openScreen(page);
    await layout.getByTestId("layout-tab-version").click();
    const list = layout.getByTestId("impact-list");
    const fixtureRow = list.locator(".ag-center-cols-container .ag-row").filter({ hasText: FIXTURE_LAYOUT }).first();
    await layout.getByTestId("impact-keyword").fill("EXIT_COIL_THK");
    await layout.getByTestId("impact-search").click();
    await expect(fixtureRow).toBeVisible({ timeout: 30_000 });
    await expect(fixtureRow).toContainText("L2 → MES");
    await expect(fixtureRow).toContainText("158 / 4");
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-impact.png"), fullPage: true });
    // 도메인 표준명 — 도메인 → 컬럼 → 전문
    await layout.getByTestId("impact-keyword").fill("COIL_THK");
    await layout.getByTestId("impact-search").click();
    await expect(fixtureRow).toBeVisible({ timeout: 30_000 });
    await expect(fixtureRow).toContainText("158 / 4");
    await layout.getByTestId("impact-keyword").fill(`없음-${STAMP}`);
    await layout.getByTestId("impact-search").click();
    await expect(layout.getByTestId("impact-list-empty")).toHaveText("찾은 컬럼·도메인이 없습니다", { timeout: 30_000 });
  });
});

const ITEM_KEYS = ["SEQ", "FILL_KIND", "COLUMN_PHYS", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT", "DEFAULT_VALUE", "FILLER_LENGTH"];

function stripNulls(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

function itemRequestRow(r: Record<string, unknown>): Record<string, unknown> {
  return stripNulls(Object.fromEntries(ITEM_KEYS.map((k) => [k, r[k]])));
}

async function findLayoutId(page: Page, name: string): Promise<number> {
  const res = await page.request.post(`${BASE_URL}${API}/search`, {
    data: { meta: { menuId: "layoutMng" }, params: { keyword: name } },
  });
  const rows = (await res.json()).data.result.layouts as Array<{ LAYOUT_ID: number; LAYOUT_NAME: string }>;
  const row = rows.find((r) => r.LAYOUT_NAME === name);
  if (!row) throw new Error(`전문을 찾지 못했다: ${name}`);
  return row.LAYOUT_ID;
}
