import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, T, login, walkMenuPath, type LoginOptions } from "./support/common";
import { loadMdmFixture } from "./support/mdm-e2e";
import { gridRowById } from "./support/grid";

/**
 * mdm dmd/dataMng(마루 데이터) smoke — TSK-07-02 design.md §3.3 스모크 넷(2026-09-29 통합 D-104: dataMng+dataEdit
 * → dataMng 하나. 옛 mdm-dataEdit.spec.ts 의 시나리오는 여기로 옮겼고, 없어진 메뉴("마루 데이터 수정")를 찾던 그 파일은
 * 지웠다. 선례: 마루 코드 D-101 커밋 325ccf9c 의 mdm-codeMng.spec.ts).
 *
 *   M1 메뉴 이동 — 담당자(e2e_mdm_steward)로 로그인해 사이드바에서 화면을 연다(dmd 쓰기는 EDIT 세트라 담당자만, F2).
 *      고르기 전에는 오른쪽에 안내만 보인다.
 *   M2 목록 — 결과 그리드에 픽스처 행이 보인다. 행을 누르면 오른쪽 상세가 채워진다(옛 dataEdit 2번: 헤더·상태·카테고리 요약).
 *   M3 등록 — 목록 헤더 [데이터 등록] → 팝업 등록 폼(원천 UI 없음 R10) → [등록]하면 같은 화면 오른쪽에 방금 만든 ID 의 상세가 뜬다(탭을 새로
 *      열지 않는다, 옛 D7 인계 제거).
 *   M4 서버 오류 노출 — 중복 ID 재등록(MDM011 모달, F15 문구).
 *   M5 헤더 저장 1건 → 다시 불러온 값에 반영(옛 dataEdit 3번). M6 잘못된 키 패턴 정규식은 저장을 거부(옛 dataEdit 4번).
 *   M7 [항목 편집 →] → dataItemMng 탭이 그 마루 데이터로 열린다(새 시나리오, D-104).
 *
 * 픽스처: e2e/fixtures/mdm-dataMng.sql(mdm.db). E2E_DM_PORT(카테고리 3·항목 3)는 읽기만, 헤더 저장은 E2E_DM_CUST 로
 * 한다(카테고리 편집 spec 이 쓰는 E2E_DC_PORT 는 건드리지 않는다). 서버 절차는 design.md 「E2E 서버 절차」.
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(127.0.0.1:5100 은 메인 체크아웃 포털이라 쓰지 않는다, F23).
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const NEW_ID = `E2EDM${SUFFIX}`;
const NEW_NAME = `거래처 E2E ${SUFFIX}`;

// 스크린샷은 저장소 문서(docs)를 건드리지 않도록 git 제외 폴더(mdm-user/.out)에 남긴다.
const screenshot = (name: string) => path.resolve(__dirname, "mdm-user/.out/screens", name);

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW };

async function openScreen(page: Page) {
  await walkMenuPath(page, [/^마루 MDM$/, /^마스터데이터$/, /^마루 데이터$/]);
  await expect(page.getByTestId("data-mng-list")).toBeVisible({ timeout: 60_000 });
}

function waitAction(page: Page, action: string, service = "dataMng") {
  return page.waitForResponse(
    (r) => r.url().includes(`/api/mdm/oasis/${service}/${action}`) && r.status() === 200,
    { timeout: 30_000 },
  );
}

/** 화면 머리 버튼([조회])은 testid 가 없어 머리 버튼 영역 안 라벨로 찾는다. */
const headerButton = (page: Page, name: string) =>
  page.locator(".page-layout__header-buttons:visible").getByRole("button", { name, exact: true });

function listRow(page: Page, id: string): Locator {
  return gridRowById(page.getByTestId("data-mng-list"), id);
}

async function search(page: Page, id: string) {
  const searched = waitAction(page, "search");
  await page.getByTestId("data-mng-search-id").fill(id);
  await headerButton(page, "조회").click();
  await searched;
}

/** 행을 누르고 **그 데이터의** 상세가 뜰 때까지 기다린다(이미 다른 상세가 보이면 카드가 먼저부터 보이기 때문). */
async function selectRow(page: Page, id: string) {
  const viewed = waitAction(page, "view", "dataEdit");
  await listRow(page, id).click();
  await viewed;
  await expect(page.getByTestId("data-edit-id")).toHaveText(id, { timeout: 20_000 });
}

/** 목록 헤더 [데이터 등록] 으로 등록 팝업을 연다(열 때마다 새로 마운트되어 칸이 빈다). */
async function openRegister(page: Page) {
  await page.locator("#btn_data_reg").click();
  await expect(page.getByTestId("data-mng-register-form")).toBeVisible({ timeout: 20_000 });
}

async function register(page: Page, id: string, name: string) {
  await openRegister(page);
  await page.getByTestId("data-mng-reg-id").fill(id);
  await page.getByTestId("data-mng-reg-name").fill(name);
  await page.getByTestId("data-mng-reg-pattern").fill("^[0-9A-Z]{1,20}$");
  await page.getByTestId("data-mng-reg-save").click();
}

test.describe("mdm dmd/dataMng — 마루 데이터(조회·등록·수정 통합)", () => {
  test.setTimeout(120_000);

  test.beforeAll(() => loadMdmFixture("mdm-dataMng.sql"));
  test.beforeEach(async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openScreen(page);
  });

  test("M1 메뉴 이동: 마루 데이터 화면이 열리고, 고르기 전에는 안내만 보인다", async ({ page }) => {
    await expect(page).toHaveURL(/\/portal/);
    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: "마루 MDM > 마스터데이터 > 마루 데이터" })).toBeVisible();
    await expect(page.getByTestId("data-mng-empty")).toBeVisible();
    await expect(page.getByTestId("data-edit-id")).toHaveCount(0);
  });

  test("M2 목록·상세: 조회하면 행이 보이고, 행을 누르면 오른쪽 상세(헤더·카테고리 요약·항목 수)가 채워진다", async ({ page }) => {
    await search(page, "E2E_DM");
    await expect(listRow(page, "E2E_DM_PORT")).toBeVisible({ timeout: 20_000 });
    await expect(listRow(page, "E2E_DM_CUST")).toBeVisible();
    await page.screenshot({ path: screenshot("dmd-dataMng-list.png") });

    await selectRow(page, "E2E_DM_CUST");
    await expect(page.getByTestId("data-edit-name")).toHaveValue(/^거래처/);
    await expect(page.getByTestId("data-edit-status")).toHaveText("INUSE");
    await expect(page.getByTestId("data-mng-empty")).toHaveCount(0);

    // PORT — 카테고리 요약 그리드(BASE·KR·MAJOR)와 항목 수(3건). AgDataGrid 라 행은 .ag-row 로 찾는다.
    await selectRow(page, "E2E_DM_PORT");
    const categories = page.getByTestId("data-edit-categories");
    for (const cateId of ["BASE", "KR", "MAJOR"]) {
      await expect(gridRowById(categories, cateId)).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.getByTestId("data-edit-item-count")).toHaveText("3");
    await page.screenshot({ path: screenshot("dmd-dataMng-detail.png") });
  });

  test("M3 등록: [데이터 등록] 팝업에서 등록하면 같은 화면 오른쪽에 방금 만든 ID 의 상세가 뜬다(탭을 새로 열지 않는다)", async ({ page }) => {
    await openRegister(page);
    // R10 — 등록 폼에 원천 선택 UI 자체가 없다(MDM 원천만 받는다, D1). 값은 고정 텍스트일 뿐 select·input·
    // combobox 같은 조작 가능한 컨트롤이 없어야 한다 — 나중에 누가 원천 선택 드롭다운을 더하면 이 단정이 걸린다.
    const sourceCell = page.getByTestId("data-mng-reg-source");
    await expect(sourceCell).toHaveText("MDM");
    await expect(sourceCell.locator("select, input, [role='combobox']")).toHaveCount(0);

    const registered = waitAction(page, "reg");
    await page.getByTestId("data-mng-reg-id").fill(NEW_ID);
    await page.getByTestId("data-mng-reg-name").fill("E2E 등록 테스트");
    await page.getByTestId("data-mng-reg-pattern").fill("^[0-9A-Z]{1,20}$");
    await page.getByTestId("data-mng-reg-save").click();
    await registered;

    // 같은 탭 오른쪽에 그 ID 의 상세(BASE 카테고리 1행)가 뜨고 등록 폼은 닫힌다.
    await expect(page.getByTestId("data-edit-id")).toHaveText(NEW_ID, { timeout: 20_000 });
    await expect(page.getByTestId("data-edit-name")).toHaveValue("E2E 등록 테스트");
    await expect(page.getByTestId("data-mng-register-form")).toHaveCount(0);
    await expect(
      gridRowById(page.getByTestId("data-edit-categories"), "BASE"),
    ).toBeVisible({ timeout: 20_000 });
    // 목록도 다시 조회돼 방금 만든 행이 보인다.
    await search(page, NEW_ID);
    await expect(listRow(page, NEW_ID)).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataMng-register.png") });
  });

  test("M4 중복 ID 재등록은 MDM011 문구로 거부된다", async ({ page }) => {
    await register(page, "E2E_DM_PORT", "중복 시도");

    await expect(page.getByText("마루 코드·마루 데이터에 같은 ID 가 있습니다")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataMng-duplicate-id.png") });
  });

  test("M5 헤더 저장 1건 → 다시 불러온 값에 반영된다", async ({ page }) => {
    await search(page, "E2E_DM");
    await selectRow(page, "E2E_DM_CUST");
    await page.getByTestId("data-edit-name").fill(NEW_NAME);
    const saved = waitAction(page, "save", "dataEdit");
    await page.getByTestId("data-edit-save").click();
    await saved;
    await expect(page.getByTestId("data-edit-name")).toHaveValue(NEW_NAME);

    // 목록에도 바뀐 이름이 보이고, 다른 데이터를 골랐다 돌아와도 저장된 값이 그대로다.
    await expect(listRow(page, "E2E_DM_CUST").locator('.ag-cell[col-id="maruDataName"]')).toHaveText(NEW_NAME, { timeout: 20_000 });
    await selectRow(page, "E2E_DM_PORT");
    await selectRow(page, "E2E_DM_CUST");
    await expect(page.getByTestId("data-edit-name")).toHaveValue(NEW_NAME);
    await page.screenshot({ path: screenshot("dmd-dataMng-save.png") });
  });

  test("M6 잘못된 키 패턴 정규식은 저장을 거부한다", async ({ page }) => {
    await search(page, "E2E_DM_CUST");
    await selectRow(page, "E2E_DM_CUST");
    await page.getByTestId("data-edit-pattern").fill("[");
    await page.getByTestId("data-edit-save").click();

    await expect(page.getByText("키 패턴 정규식이 올바르지 않습니다")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataMng-invalid-pattern.png") });
  });

  test("M7 [항목 편집 →] 을 누르면 항목 편집(dataItemMng)이 그 마루 데이터로 열린다", async ({ page }) => {
    await search(page, "E2E_DM_PORT");
    await selectRow(page, "E2E_DM_PORT");

    await page.getByTestId("data-edit-item-edit").click();

    // dataItemMng 탭이 새로 열리고 마루 데이터 조건이 E2E_DM_PORT 로 고정된다. 첫 항목(E2E_DI_…)으로 열리면 handoff 실패다.
    await expect(page.locator(".page-layout__footer-screen-id").filter({ hasText: "dataItemMng" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("item-current")).toContainText("E2E_DM_PORT", { timeout: 30_000 });
    await expect(page.getByTestId("item-tab-grid")).toBeVisible();
    await expect(gridRowById(page, "KRPUS")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot("dmd-dataMng-to-itemMng.png") });
  });
});
