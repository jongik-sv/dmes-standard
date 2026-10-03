import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, login, walkMenuPath } from "./support/common";
import { clickSearch, expectRowCell, loadMdmFixture } from "./support/mdm-e2e";

/**
 * 전문 헤더 정의(dmb/headerMng) 브라우저 E2E — TSK-05-02 design.md §3.5.
 *
 *   H1 메뉴 이동·목록(서버 데이터)·빈 상태(스모크 1·2)   H2 화면 조작만으로 헤더 등록 — 저장 전 즉시 재계산(스모크 3)
 *   H3 사전에 없는 항목은 만들 경로가 없고 API 도 L01(수용 기준 1)   H4 fill_kind 닫힌 칸(수용 기준 5 화면 쪽)
 *   H5 헤더 변경 영향도 — 사용 전문(버전·상태 열)          H6 서버 오류 표시(동시 수정 MDM001, 스모크 4)
 *   H7 D-144 3단계 — 확정된 헤더는 읽기 전용이고 새 버전(minor)으로만 고친다(저장은 버전을 만들지 않는다)
 *
 * 전제: 격리 DB 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고 e2e/fixtures/mdm-rbac-users.sql 을 넣는다(design.md §3.7).
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과).
 * mdm-headerMng·mdm-layoutConfirm·mdm-layoutMng 세 스펙은 새 mdm.db 로 한 벌씩만 돈다(같은 DB 로 다시 돌리면 L110 의 1.001·M201 의 1.001 DRAFT 가 남아 새 버전 단언이 어긋난다).
 * beforeAll 이 SMOKE_MDM_DB(워크트리 mdm.db)에 e2e/fixtures/mdm-layout-m201.sql 을 넣는다 — 컬럼 사전 스펙 뒤에 들어가야 한다.
 */

const USER = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";
const API = "/api/mdm/oasis/headerMng";

const STAMP = Date.now().toString(36).toUpperCase();
const NEW_HEADER = `E2E 헤더 ${STAMP}`;
const NEW_EAI = `X${STAMP}`;

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-02/screens", name);

async function openScreen(page: Page): Promise<Locator> {
  await walkMenuPath(page, [/^마루 MDM$/, /^레이아웃$/, /^전문 헤더 정의$/]);
  const layout = page.locator(".page-layout").filter({
    has: page.locator(".page-layout__footer-screen-id", { hasText: "headerMng" }),
  });
  // 화면은 목록을 자동 조회하지 않고 열린다(cf4fbb05) — 목록이 아니라 검색 칸이 보이면 열린 것이다.
  await expect(layout.getByTestId("header-search-keyword")).toBeVisible({ timeout: 60_000 });
  return layout;
}

async function search(layout: Locator, keyword: string) {
  await layout.getByTestId("header-search-keyword").fill(keyword);
  await clickSearch(layout);
}

function listRow(layout: Locator, text: string): Locator {
  return layout.getByTestId("header-list").locator(".ag-row").filter({ hasText: text }).first();
}

async function selectHeader(layout: Locator, name: string) {
  await listRow(layout, name).click();
  await expect(layout.getByTestId("header-form-name")).toHaveValue(name, { timeout: 30_000 });
}

async function pickColumn(page: Page, layout: Locator, phys: string) {
  await layout.getByTestId("header-item-add-column").click();
  const modal = page.getByTestId("column-pick-modal");
  await expect(modal).toBeVisible();
  await page.getByTestId("column-pick-keyword").fill(phys);
  await page.getByTestId("column-pick-search").click();
  await page.getByTestId("column-pick-grid").locator(".ag-row").filter({ hasText: phys }).first().click();
  await page.getByTestId("column-pick-select").click();
  await expect(modal).toBeHidden();
}

function offsets(layout: Locator): Locator {
  return layout.getByTestId("header-items").locator('.ag-center-cols-container .ag-cell[col-id="OFFSET"]');
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1680, height: 1200 } });

test.describe("mdm 전문 헤더 정의", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => loadMdmFixture("mdm-layout-m201.sql"));

  test("H1 메뉴로 이동하고 목록은 서버 데이터, 결과가 없으면 빈 상태", async ({ page }) => {
    await login(page, USER);
    const layout = await openScreen(page);
    await expect(layout.locator(".page-layout__footer-breadcrumb")).toHaveText("마루 MDM > 레이아웃 > 전문 헤더 정의");
    await expect(layout.locator(".page-layout__footer-screen-id")).toHaveText("headerMng");
    // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 픽스처 헤더가 보인다.
    await clickSearch(layout);
    const glue = listRow(layout, "GLUE 공통 헤더(E2E)");
    await expect(glue).toBeVisible({ timeout: 30_000 });
    await expectRowCell(glue, "TOTAL_LENGTH", "100");
    await expectRowCell(glue, "ITEM_COUNT", "13");
    // 픽스처 헤더는 1.000 RELEASED(2000-01-01 부터) — 지금 적용 중이다
    await expectRowCell(glue, "HEADER_VER", "v1.000");
    await expectRowCell(glue, "HEADER_STATE", "현재");
    const l2 = listRow(layout, "L2 구간 헤더(E2E)");
    await expectRowCell(l2, "TOTAL_LENGTH", "30");
    await expectRowCell(l2, "ITEM_COUNT", "6");
    await page.screenshot({ path: screenshot("dmb-headerMng-list.png"), fullPage: true });

    await search(layout, `없음-${STAMP}`);
    await expect(layout.getByTestId("header-list-empty")).toHaveText("조회된 헤더가 없습니다", { timeout: 30_000 });
    await page.screenshot({ path: screenshot("dmb-headerMng-empty.png"), fullPage: true });
  });

  test("H2~H6 등록·사전 밖 항목·닫힌 칸·영향도·동시 수정", async ({ page }) => {
    await login(page, USER);
    const layout = await openScreen(page);

    // ── H2 화면 조작만으로 헤더 등록 — 저장 전 즉시 재계산 ──
    await layout.getByRole("button", { name: "신규", exact: true }).click();
    await layout.getByTestId("header-form-name").fill(NEW_HEADER);
    await layout.getByTestId("header-form-eai").fill(NEW_EAI);
    await layout.getByTestId("header-form-eai-name").fill(`E2E EAI ${STAMP}`);
    await layout.getByTestId("header-form-encoding").selectOption("UTF-8");
    await layout.getByTestId("header-form-pad-rule").fill("숫자 왼쪽 0, 문자 오른쪽 공백");
    await pickColumn(page, layout, "TC_CD");
    await layout.getByTestId("item-detail-fill-kind").selectOption("AUTO");
    await layout.getByTestId("item-detail-default").selectOption("LAYOUT_ID");
    await pickColumn(page, layout, "SND_FAC_TP");
    await layout.getByTestId("item-detail-fill-kind").selectOption("CONST");
    await layout.getByTestId("item-detail-default").fill("B0");
    await layout.getByTestId("header-item-add-filler").click();
    await layout.getByTestId("item-detail-filler-length").fill("10");
    await expect(offsets(layout)).toHaveText(["0", "8", "12"]);
    await expect(layout.getByTestId("header-length")).toHaveText("22 바이트 (3항목)");
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다.").first()).toBeVisible({ timeout: 30_000 });
    await search(layout, STAMP);
    const created = listRow(layout, NEW_HEADER);
    await expectRowCell(created, "TOTAL_LENGTH", "22", { timeout: 30_000 });
    await expectRowCell(created, "ITEM_COUNT", "3");
    await expect(created.locator('.ag-cell[col-id="EAI_CODE"]')).toHaveText(NEW_EAI);
    // 저장은 v1.000 DRAFT 를 만든다 — 확정 전이라 상태는 작성 중이다
    await expectRowCell(created, "HEADER_VER", "v1.000");
    await expectRowCell(created, "HEADER_STATE", "작성 중");
    await page.screenshot({ path: screenshot("dmb-headerMng-register.png"), fullPage: true });

    // ── H3 사전에 없는 항목 — 팝업에 만들 경로가 없고, API 로 보내도 L01 ──
    await selectHeader(layout, NEW_HEADER);
    await layout.getByTestId("header-item-add-column").click();
    await page.getByTestId("column-pick-keyword").fill(`NOPE_${STAMP}`);
    await page.getByTestId("column-pick-search").click();
    await expect(page.getByTestId("column-pick-empty")).toHaveText("컬럼 사전에 없습니다. 먼저 컬럼 사전에 등재하세요");
    await expect(page.getByTestId("column-pick-select")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmb-headerMng-column-pick.png"), fullPage: true });
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).last().click();
    await expect(page.getByTestId("column-pick-modal")).toBeHidden();
    const nope = await page.request.post(`${BASE_URL}${API}/save`, {
      data: {
        meta: { menuId: "headerMng" }, params: { layoutName: `사전 밖 ${STAMP}` },
        grids: { items: { rows: [{ SEQ: 1, FILL_KIND: "DATA", COLUMN_PHYS: "NOPE_X" }] } },
      },
    });
    const nopeBody = await nope.json();
    expect(nopeBody.meta.success, JSON.stringify(nopeBody)).toBe(false);
    expect(nopeBody.meta.message).toContain("L01");

    // ── H4 FILLER 행 — 닫힌 칸은 disabled, fill_kind 를 DATA 로 바꾸면 FILLER 길이가 비워지고 닫힌다 ──
    await layout.getByTestId("header-items").locator(".ag-center-cols-container .ag-row").filter({ hasText: "FILLER" }).first().click();
    for (const id of ["item-detail-default", "item-detail-trans-unit", "item-detail-unit-item", "item-detail-sign",
      "item-detail-zero", "item-detail-implied", "item-detail-width"]) {
      await expect(layout.getByTestId(id), id).toBeDisabled();
    }
    await expect(layout.getByTestId("item-detail-filler-length")).toBeEnabled();
    await expect(layout.getByTestId("item-detail-filler-length")).toHaveValue("10");
    await layout.getByTestId("item-detail-fill-kind").selectOption("DATA");
    await expect(layout.getByTestId("item-detail-filler-length")).toHaveValue("");
    await expect(layout.getByTestId("item-detail-filler-length")).toBeDisabled();

    // ── H5 헤더 변경 영향도 — 픽스처 전문 1건(총 길이 187) ──
    await search(layout, "(E2E)");
    await selectHeader(layout, "GLUE 공통 헤더(E2E)");
    const usage = layout.getByTestId("header-usage");
    await expect(usage).toContainText("출측검사 실적 수신(E2E)", { timeout: 30_000 });
    await expect(usage).toContainText("187");
    // 사용 전문 표에 버전·상태 열 — 픽스처 전문은 1.000 이 지금 적용 중이다
    await expect(usage).toContainText("v1.000");
    await expect(usage).toContainText("현재");
    await usage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot("dmb-headerMng-impact.png"), fullPage: true });

    // ── H6 서버 오류 표시 — 다른 사용자가 먼저 저장(동시 수정 MDM001) ──
    await search(layout, STAMP);
    await selectHeader(layout, NEW_HEADER);
    const headerId = await findHeaderId(page, NEW_HEADER);
    const view = (await (await page.request.post(`${BASE_URL}${API}/view`, {
      data: { meta: { menuId: "headerMng" }, params: { layoutId: headerId } },
    })).json()).data.result;
    const h = view.header;
    // 저장은 고른 DRAFT(selected)를 ver·rowVersion 으로 덮어쓴다 — 헤더 부모 행이 아니라 selected 에서 읽는다
    const sel = view.selected;
    const other = await page.request.post(`${BASE_URL}${API}/save`, {
      data: {
        meta: { menuId: "headerMng" },
        params: stripNulls({ layoutId: h.LAYOUT_ID, ver: sel.VER, rowVersion: sel.ROW_VERSION, layoutName: `${h.LAYOUT_NAME} 다른이`,
          eaiCode: h.EAI_CODE, eaiName: h.EAI_NAME, encoding: h.ENCODING, padRule: h.PAD_RULE }),
        grids: { items: { rows: view.items.map(itemRequestRow) } },
      },
    });
    expect((await other.json()).meta.success, "먼저 저장이 성공해야 한다").toBe(true);
    await layout.getByTestId("header-form-name").fill(`${NEW_HEADER} 화면`);
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    const modal = page.locator(".error-modal__body");
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(modal).toContainText("다른 사용자가 수정");
    await page.screenshot({ path: screenshot("dmb-headerMng-error.png"), fullPage: true });
    await page.getByRole("button", { name: "확인" }).click();
  });
  test("H7 확정된 헤더는 읽기 전용 — 새 버전(minor)을 만들어야 고칠 수 있다", async ({ page }) => {
    await login(page, USER);
    const layout = await openScreen(page);
    await search(layout, "(E2E)");
    await selectHeader(layout, "L2 구간 헤더(E2E)");
    // 1.000 RELEASED 는 고를 수 있는 유일한 버전이고, 입력은 모두 잠긴다
    await expect(layout.getByTestId("header-ver-select")).toHaveValue("1.000", { timeout: 30_000 });
    await expect(layout.getByTestId("header-form-name")).toBeDisabled();
    await expect(layout.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
    await expect(layout.getByTestId("header-item-add-column")).toHaveCount(0);
    // 표준 관리자는 확정 권한이 없어 [확정] 은 늘 꺼져 있다. 새 버전 버튼은 둘 다 쓸 수 있다
    await expect(layout.getByTestId("header-ver-confirm")).toBeDisabled();
    await expect(layout.getByTestId("header-ver-new-major")).toBeEnabled();
    await expect(layout.getByTestId("header-ver-new-minor")).toBeEnabled();
    await page.screenshot({ path: screenshot("dmb-headerMng-readonly.png"), fullPage: true });
  });
});

const ITEM_KEYS = ["SEQ", "FILL_KIND", "COLUMN_PHYS", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT", "DEFAULT_VALUE", "FILLER_LENGTH"];

function stripNulls(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

function itemRequestRow(r: Record<string, unknown>): Record<string, unknown> {
  return stripNulls(Object.fromEntries(ITEM_KEYS.map((k) => [k, r[k]])));
}

async function findHeaderId(page: Page, name: string): Promise<number> {
  const res = await page.request.post(`${BASE_URL}${API}/search`, {
    data: { meta: { menuId: "headerMng" }, params: { keyword: name } },
  });
  const rows = (await res.json()).data.result.headers as Array<{ LAYOUT_ID: number; LAYOUT_NAME: string }>;
  const row = rows.find((r) => r.LAYOUT_NAME === name);
  if (!row) throw new Error(`헤더를 찾지 못했다: ${name}`);
  return row.LAYOUT_ID;
}
