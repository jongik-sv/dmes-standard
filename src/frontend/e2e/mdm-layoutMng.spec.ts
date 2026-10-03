import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, login, walkMenuPath } from "./support/common";
import { clickSearch, expectRowCell, loadMdmFixture } from "./support/mdm-e2e";
import { gridCells, gridRowByIndex, gridRows } from "./support/grid";

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
 * TSK-05-03 design.md §3.6 — L9 등록 검증 7종·인코딩 바이트 샘플 한 줄, L10 표현 자리 부족 거부(검증 표·저장), L11 스냅샷 JSON·엑셀 내려받기,
 * L12 영향 전문 목록. 스크린샷은 docs/mdm/tasks/TSK-05-03/screens.
 *
 * D-144 3단계(레이아웃 버전 관리) — 저장은 버전을 만들지 않고 내 DRAFT 를 덮어쓴다(신규는 v1.000 DRAFT). 확정된 전문(픽스처 1.000 RELEASED)은
 * 읽기 전용이라 [새 버전(minor)] 으로 DRAFT 를 만들어야 고친다(L10). 확정은 [확정] → dmb/layoutConfirm 에서 한다 — DMB 확정 권한은 담당자
 * (e2e_mdm_steward)만 있고 표준 관리자(e2e_mdm_stdadmin)는 편집까지다. 버전은 문자열(`1.000`)이고 버전 선택 칸(layout-ver-select)의 값이다.
 * mdm-headerMng·mdm-layoutConfirm·mdm-layoutMng 세 스펙은 새 mdm.db 로 한 벌씩만 돈다(같은 DB 로 다시 돌리면 L110 의 1.001·M201 의 1.001 DRAFT 가 남아 새 버전 단언이 어긋난다).
 * 파일 이름 순으로 mdm-layoutConfirm.spec.ts(헤더 L110 minor 확정)가 먼저 돈다 — 그 확정은 먼 미래(apply_from)라 이 스펙의 지금 시각 단언(총 길이 187)은 그대로다.
 */

const USER = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const API = "/api/mdm/oasis/layoutMng";

const STAMP = Date.now().toString(36).toUpperCase();
const NEW_LAYOUT = `출측검사 ${STAMP}`;
const FIXTURE_LAYOUT = "출측검사 실적 수신(E2E)";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-02/screens", name);
const SHOT_0503 = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-03/screens", name);

async function openScreen(page: Page): Promise<Locator> {
  await walkMenuPath(page, [/^마루 MDM$/, /^레이아웃$/, /^전문 레이아웃$/]);
  const layout = page.locator(".page-layout").filter({
    has: page.locator(".page-layout__footer-screen-id", { hasText: "layoutMng" }),
  });
  // 화면은 목록을 자동 조회하지 않고 열린다(cf4fbb05) — 목록이 아니라 검색 칸이 보이면 열린 것이다.
  await expect(layout.getByTestId("layout-search-keyword")).toBeVisible({ timeout: 60_000 });
  return layout;
}

async function search(layout: Locator, keyword: string) {
  await layout.getByTestId("layout-search-keyword").fill(keyword);
  await clickSearch(layout);
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
  return gridCells(layout.getByTestId("layout-items"), col);
}

function bodyRow(layout: Locator, text: string): Locator {
  return gridRows(layout.getByTestId("layout-items")).filter({ hasText: text }).first();
}

/** 상수 편집 표(AgDataGrid)의 한 행 — 값 칸 span(const-input-PHYS)을 가진 행. */
const constRow = (modal: Locator, phys: string) =>
  gridRows(modal).filter({ has: modal.page().getByTestId(`const-input-${phys}`) });
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

/** 지금부터 ms 뒤를 KST 벽시계 `yyyy-MM-dd HH:mm:ss` 로 — 서버·확정 화면이 쓰는 형식이다. */
function kstAfter(ms: number): string {
  return new Date(Date.now() + ms + 9 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1680, height: 1200 } });

test.describe("mdm 전문 레이아웃", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => loadMdmFixture("mdm-layout-m201.sql"));

  test("L1 메뉴로 이동하고 목록은 서버 데이터, 결과가 없으면 빈 상태", async ({ page }) => {
    await login(page, USER);
    const layout = await openScreen(page);
    await expect(layout.locator(".page-layout__footer-breadcrumb")).toHaveText("마루 MDM > 레이아웃 > 전문 레이아웃");
    await expect(layout.locator(".page-layout__footer-screen-id")).toHaveText("layoutMng");
    // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 픽스처 전문이 보인다.
    await clickSearch(layout);
    const row = listRow(layout, FIXTURE_LAYOUT);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expectRowCell(row, "TOTAL_LENGTH", "187");
    // 픽스처는 1.000 RELEASED(2000-01-01 부터) — 지금 적용 중인 버전이 현재 버전 열에 보이고 DRAFT 는 없다
    await expectRowCell(row, "CURRENT_VER", "v1.000");
    await expectRowCell(row, "DRAFT_VER", "");
    await expectRowCell(row, "HEADER_SUMMARY", "GLUE 공통 헤더(E2E) (100) + L2 구간 헤더(E2E) (30)");
    await page.screenshot({ path: screenshot("dmb-layoutMng-list.png"), fullPage: true });
    await search(layout, `없음-${STAMP}`);
    await expect(layout.getByTestId("layout-list-empty")).toHaveText("조회된 전문이 없습니다", { timeout: 30_000 });
    await page.screenshot({ path: screenshot("dmb-layoutMng-empty.png"), fullPage: true });
  });

  test("L2~L8 M201 등록·상수 재정의·동시 수정·드래그", async ({ page }) => {
    await login(page, USER);
    const layout = await openScreen(page);

    // ── L2 신규 — EAI 를 고르면 그 표준 헤더가 헤더 구성 1번에 ──
    await layout.getByRole("button", { name: "신규", exact: true }).click();
    await layout.getByTestId("layout-form-name").fill(NEW_LAYOUT);
    await layout.getByTestId("layout-form-eai").selectOption("E2EGLUE");
    const stack = layout.getByTestId("layout-header-stack");
    await expect(gridRows(stack)).toHaveCount(1, { timeout: 30_000 });
    await expect(stack).toContainText("GLUE 공통 헤더(E2E)");
    await expect(stack.locator('.ag-cell[col-id="TOTAL_LENGTH"]').first()).toHaveText("100");
    await expect(stack.locator('.ag-cell[col-id="POSITION"]').first()).toHaveText("1-100");

    // ── L3 헤더 추가·시스템·본문 4항목 — 저장 전 즉시 계산 ──
    await layout.getByTestId("layout-header-add").click();
    await page.getByTestId("header-pick-modal").locator(".ag-row").filter({ hasText: "L2 구간 헤더(E2E)" }).first().click();
    await expect(gridRows(stack)).toHaveCount(2);
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
    await expectRowCell(listRow(layout, NEW_LAYOUT), "TOTAL_LENGTH", "187", { timeout: 30_000 });
    // 신규 저장은 v1.000 DRAFT 를 만든다 — 확정 전이라 현재 버전은 없고 DRAFT 열에 버전·소유자가 보인다
    await expectRowCell(listRow(layout, NEW_LAYOUT), "CURRENT_VER", "");
    await expectRowCell(listRow(layout, NEW_LAYOUT), "DRAFT_VER", "v1.000", { contains: true });
    await selectLayout(layout, NEW_LAYOUT);
    await expect(layout.getByTestId("layout-ver-select")).toHaveValue("1.000");
    await expect(layout.getByTestId("layout-ver-select").locator('option[value="1.000"]')).toHaveText("v1.000 작성 중");
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
    // 저장은 고른 DRAFT(selected)를 ver·rowVersion 으로 덮어쓴다 — 부모 행(layout)이 아니라 selected 에서 읽는다
    const sel = view.selected;
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
        params: stripNulls({ layoutId: l.LAYOUT_ID, ver: sel.VER, rowVersion: sel.ROW_VERSION, layoutName: `${l.LAYOUT_NAME} 다른이`, eaiCode: l.EAI_CODE,
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
    await expectRowCell(bodyRow(layout, "FILLER"), "OFFSET", "158", { timeout: 10_000 });
    await expectRowCell(bodyRow(layout, "EXIT_COIL_THK"), "OFFSET", "183");
    await expect(layout.getByTestId("layout-total-length")).toContainText("187");
    await page.screenshot({ path: screenshot("dmb-layoutMng-drag.png"), fullPage: true });
  });

  // ── TSK-05-03 ─────────────────────────────────────────────────────────────

  test("L9 등록 검증 표 7종과 인코딩 바이트 기준 샘플 전문 한 줄", async ({ page }) => {
    await login(page, USER);
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

  test("L10 확정된 전문은 새 버전(minor)으로 고친다 — 표현 자리 부족은 거부, 고치면 저장되고 확정 화면으로 간다", async ({ page }) => {
    await login(page, STEWARD);
    const layout = await openScreen(page);
    await search(layout, "(E2E)");
    await selectLayout(layout, FIXTURE_LAYOUT);
    // 1.000 RELEASED 는 읽기 전용이고, 소유한 DRAFT 가 없으니 [확정] 도 꺼져 있다
    await expect(layout.getByTestId("layout-ver-select")).toHaveValue("1.000", { timeout: 30_000 });
    await expect(layout.getByTestId("layout-form-name")).toBeDisabled();
    await expect(layout.getByTestId("layout-ver-confirm")).toBeDisabled();
    await expect(layout.getByTestId("layout-ver-new-minor")).toBeEnabled();

    // 새 버전(minor) → 1.001 DRAFT(내 소유)가 열리고 입력이 풀린다
    await layout.getByTestId("layout-ver-new-minor").click();
    await expect(layout.getByTestId("layout-ver-select")).toHaveValue("1.001", { timeout: 30_000 });
    await expect(layout.getByTestId("layout-ver-select").locator('option[value="1.001"]')).toHaveText("v1.001 작성 중");
    await expect(layout.getByTestId("layout-form-name")).toBeEnabled();
    await expect(layout.getByTestId("layout-ver-confirm")).toBeEnabled();
    // 미적용 버전이 있으면 새 버전은 더 만들 수 없다
    await expect(layout.getByTestId("layout-ver-new-minor")).toBeDisabled();
    await expect(layout.getByTestId("layout-ver-new-major")).toBeDisabled();
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-new-minor.png"), fullPage: true });

    // 표현 자리 부족 — 검증 표는 4번이 거부, 저장도 L14 로 거부(DRAFT 는 바뀌지 않는다)
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
    // 거부된 저장은 DRAFT 를 쓰지 않았다 — 다시 읽으면 폭 4
    await layout.getByTestId("layout-tab-edit").click();
    await search(layout, "(E2E)");
    // 이름 칸은 이미 같은 값이라 selectLayout 의 대기는 화면이 서버에서 다시 읽었다는 증거가 되지 못한다 —
    // 목록 행을 누르면서 view 응답을 기다리고, 눌림이 목록 갱신에 묻히면 다시 누른다.
    await expect(async () => {
      const viewed = page.waitForResponse(
        (r) => r.url().includes("/api/mdm/oasis/layoutMng/view") && r.request().method() === "POST" && r.status() === 200,
        { timeout: 8_000 },
      );
      await listRow(layout, FIXTURE_LAYOUT).click();
      await viewed;
    }).toPass({ timeout: 40_000 });
    await expect(layout.getByTestId("layout-ver-select")).toHaveValue("1.001", { timeout: 30_000 });
    // 본문 길이 열 전체가 서버 값(20·8·4·25)이 될 때까지 기다린다 — 행 로케이터를 미리 잡으면 다시 그려지는 행을 놓친다.
    await expect(bodyCells(layout, "LENGTH")).toHaveText(["20", "8", "4", "25"], { timeout: 30_000 });

    // 여분 25 를 23 으로 줄이고 라인코드(2) 를 쪼개 쓴다 — 총 길이·기존 오프셋은 그대로(순차 전환 대상)
    await bodyRow(layout, "FILLER").click();
    await layout.getByTestId("item-detail-filler-length").fill("23");
    await pickColumn(page, layout, "LINE_CODE");
    await expect(bodyCells(layout, "OFFSET")).toHaveText(["130", "150", "158", "162", "185"]);
    await expect(bodyCells(layout, "LENGTH")).toHaveText(["20", "8", "4", "23", "2"]);
    await expect(layout.getByTestId("layout-total-length")).toContainText("187");
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다.").first()).toBeVisible({ timeout: 30_000 });
    await expect(layout.getByTestId("layout-ver-select")).toHaveValue("1.001", { timeout: 30_000 });
    await expect(bodyCells(layout, "OFFSET")).toHaveText(["130", "150", "158", "162", "185"], { timeout: 30_000 });
    // 저장은 버전을 만들지 않았다 — 버전은 1.000(현재)·1.001(작성 중) 둘뿐
    await expect(layout.getByTestId("layout-ver-select").locator("option")).toHaveCount(2);

    // [확정] → 확정 화면 — 대상·직전 버전, 적용 시각을 먼 미래로 넣어 검사하면 변경 요약이 여분 쪼개기, 동시 전환 띠는 없다
    await layout.getByTestId("layout-ver-confirm").click();
    const target = page.getByTestId("lc-target");
    await expect(target).toContainText(FIXTURE_LAYOUT, { timeout: 60_000 });
    await expect(target).toContainText("v1.001");
    await expect(page.getByTestId("lc-previous")).toContainText("직전 RELEASED 버전 v1.000");
    await page.getByTestId("lc-apply-from").fill(kstAfter(30 * 24 * 3600_000));
    await page.getByTestId("lc-apply-from").press("Enter");
    await page.getByTestId("lc-validate").click();
    await expect(page.getByTestId("lc-checks")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("lc-checks")).toContainText("여분 25 → 여분 23");
    await expect(page.getByTestId("lc-checks")).toContainText("여분 쪼개 쓰기");
    await expect(page.getByTestId("lc-simultaneous")).toHaveCount(0);
    // 경고가 있으면 확인해야 켜진다(검사 때 경고 유무는 헤더 해석에 달려 있다)
    if (await page.getByTestId("lc-ack").count()) await page.getByTestId("lc-ack").getByText("경고를 확인했습니다").click();
    await expect(page.getByTestId("lc-confirm")).toBeEnabled();
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-confirm-screen.png"), fullPage: true });
    // 확정하지 않는다 — 1.001 DRAFT 는 남는다(전문 확정 흐름 전체는 mdm-layoutConfirm.spec.ts 가 헤더로 본다)
  });

  test("L11 저장은 버전을 만들지 않는다 — 내 DRAFT 를 덮어쓰고, 버전 이력·스냅샷 JSON·엑셀 내려받기", async ({ page }) => {
    const name = `버전 ${STAMP}`;
    await login(page, USER);
    const layout = await openScreen(page);
    await search(layout, "(E2E)");
    await selectLayout(layout, FIXTURE_LAYOUT);
    await layout.getByTestId("layout-tab-version").click();
    // 픽스처는 1.000 RELEASED 가 이력의 첫 줄이고(L10 의 1.001 DRAFT 가 더 있을 수 있다), 변경 분류 표는 늘 보인다
    await expect(layout.getByTestId("version-list")).toContainText("v1.000", { timeout: 30_000 });
    await expect(layout.getByTestId("change-class-table")).toContainText("여분을 쪼개 항목 추가");
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-version-fixture.png"), fullPage: true });

    // v1.000 DRAFT — [COIL_ID, PROD_DT, FILLER 29]
    await layout.getByRole("button", { name: "신규", exact: true }).click();
    await layout.getByTestId("layout-form-name").fill(name);
    await layout.getByTestId("layout-form-eai").selectOption("E2EGLUE");
    const stack = layout.getByTestId("layout-header-stack");
    await expect(gridRows(stack)).toHaveCount(1, { timeout: 30_000 });
    await layout.getByTestId("layout-header-add").click();
    await page.getByTestId("header-pick-modal").locator(".ag-row").filter({ hasText: "L2 구간 헤더(E2E)" }).first().click();
    await expect(gridRows(stack)).toHaveCount(2);
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
    await expect(layout.getByTestId("layout-ver-select")).toHaveValue("1.000", { timeout: 30_000 });
    await layout.getByTestId("layout-tab-version").click();
    const versions = layout.getByTestId("version-list");
    const vrow = (i: number) => gridRowByIndex(versions, i);
    await expect(gridRows(versions)).toHaveCount(1, { timeout: 30_000 });
    await expectRowCell(vrow(0), "VER", "v1.000");
    await expect(vrow(0)).toContainText("작성 중");
    await expectRowCell(vrow(0), "OWN_LENGTH", "57");
    // 확정 전이라 변경 분류·전환 방식이 아직 없다
    await expectRowCell(vrow(0), "SWITCH_MODE", "-");

    // 같은 DRAFT 를 다시 저장 — 여분 29 를 25 로 줄이고 EXIT_COIL_THK 4 를 쪼개 쓴다. 버전은 늘지 않는다
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
    await expect(layout.getByTestId("layout-ver-select")).toHaveValue("1.000");
    await layout.getByTestId("layout-tab-version").click();
    await expect(gridRows(versions)).toHaveCount(1, { timeout: 30_000 });
    await expectRowCell(vrow(0), "OWN_LENGTH", "57");
    await expect(layout.getByTestId("snapshot-preview")).toContainText('"layoutVersion"', { timeout: 30_000 });
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-version.png"), fullPage: true });

    // 내려받기 — 파일 이름은 layout-<id>-v<버전>-<시각>
    const layoutId = await findLayoutId(page, name);
    const [json] = await Promise.all([page.waitForEvent("download"), layout.getByTestId("snapshot-download-json").click()]);
    expect(json.suggestedFilename()).toMatch(new RegExp(`^layout-${layoutId}-v1\\.000-\\d+\\.json$`));
    const snap = JSON.parse(readFileSync(await json.path(), "utf8"));
    expect(Number(snap.layoutVersion)).toBe(1);
    expect(snap.totalLength).toBe(187);
    expect(snap.items[3].columnPhys).toBe("EXIT_COIL_THK");
    expect(snap.items[3].offset).toBe(183);
    expect(snap.items[3].length).toBe(4);
    expect(snap.items[3].numFormat.impliedScale).toBe(1);
    expect(snap.items[3].scale).toBe(1);
    const [xlsx] = await Promise.all([page.waitForEvent("download"), layout.getByTestId("snapshot-download-excel").click()]);
    expect(xlsx.suggestedFilename()).toMatch(new RegExp(`^layout-${layoutId}-v1\\.000-\\d+\\.xlsx$`));
  });

  test("L12 컬럼·도메인 변경 영향 전문 목록", async ({ page }) => {
    await login(page, USER);
    const layout = await openScreen(page);
    await layout.getByTestId("layout-tab-version").click();
    const list = layout.getByTestId("impact-list");
    // 3단계(D-148)부터 영향 목록은 레이아웃 버전마다 한 행이다 — L10·L11 이 만든 픽스처 전문의 v1.001 DRAFT 행도 함께 나오므로
    // 지금 적용 중인(현재) 버전 행을 고른다. 항목 오프셋은 본문 시작 기준 상대값이다(LayoutImpactFinder — 헤더 130 을 빼면 158 → 28).
    const fixtureRow = gridRows(list)
      .filter({ hasText: FIXTURE_LAYOUT })
      .filter({ has: page.locator('.ag-cell[col-id="VER_STATE"]', { hasText: /^현재$/ }) });
    // 조회마다 새 search 응답을 기다린다 — 앞 조회의 목록이 남아 있어도 통과하지 않게 한다.
    const searchImpact = async (keyword: string) => {
      const response = page.waitForResponse(
        (r) =>
          r.url().includes("/api/mdm/oasis/layoutMng/search") &&
          r.request().method() === "POST" &&
          (r.request().postData() ?? "").includes(`"keyword":"${keyword}"`) &&
          r.status() === 200,
        { timeout: 30_000 },
      );
      await layout.getByTestId("impact-keyword").fill(keyword);
      await layout.getByTestId("impact-search").click();
      await response;
    };
    await searchImpact("EXIT_COIL_THK");
    await expect(fixtureRow).toBeVisible({ timeout: 30_000 });
    await expect(fixtureRow).toContainText("L2 → MES");
    await expect(fixtureRow).toContainText("본문 28 / 4");
    await page.screenshot({ path: SHOT_0503("dmb-layoutMng-impact.png"), fullPage: true });
    // 도메인 표준명 — 도메인 → 컬럼 → 전문
    await searchImpact("COIL_THK");
    await expect(fixtureRow).toBeVisible({ timeout: 30_000 });
    await expect(fixtureRow).toContainText("본문 28 / 4");
    await searchImpact(`없음-${STAMP}`);
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
