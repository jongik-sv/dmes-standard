import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, T, login, openRuleMenu, type LoginOptions } from "./support/common";
import { clickSearch, loadMdmFixture, revealGridColumn } from "./support/mdm-e2e";
import { gridRowById, gridRows } from "./support/grid";

/**
 * mdm dme/ruleEdit(룰 화면 골격·의사결정표) — TSK-08-02 design.md §3.4.2.
 *
 * 스모크 넷: S1 메뉴 이동(빈 상태), S2 서버 데이터, S3 수정 한 번(헤더), S10 서버 오류.
 * TSK-08-03 추가: C1 열 설정·결과 열 그룹 왕복, C3 산출 룰 열 순서·자기 참조 거부·식 미리보기,
 *       C4 조건별 수식 표시, C5 입력 계약 묶음·RELEASED diff, C6 도메인 검색·화이트리스트 밖 식(design.md §3.3).
 *       C2 피벗 편집(C2·C2b·C2c)은 지웠다 — 피벗 보기와 룰 변수 축(AXIS)이 제품에서 빠졌다(325ccf9c, V13__drop_rule_var_axis).
 * 고유: S4 수용 5(새 버전·거부), S5 편집·드래그·저장·되돌리기·강조, S6 겹침 알림·서버 동치(수용 7), S7 적중 조건 강조,
 *       S8 수용 4(비소유자), S9 해제·선점, S11 DRAFT 삭제.
 * TSK-08-04 추가: V1 카드 ④⑤⑥·케이스 목록(빈 상태), V2 저장된 버전 값 테스트, V3 편집본 값 테스트·키 보냄 끔, V4 케이스 저장·모두 실행·삭제,
 *       V5 요청 상한 서버 오류, V6 UNIQUE 겹침 저장 거부(design.md §3.4). S5·S6 은 저장 시 검사가 ERROR 를 거부하도록 바뀌어(08-02 D3 뒤집기,
 *       §3.5) 거부를 확인하는 흐름으로 고쳤다.
 *
 * 전제는 mdm-ruleMng.spec.ts 와 같다(새 mcm.db·mdm.db + mdm-rbac-users.sql·mdm-ruleEdit-users.sql·mdm-ruleEdit-data.sql).
 * 시나리오가 이어지므로(버전 2 를 만들어 고치고 지운다) serial 이고 같은 DB 로 다시 돌릴 수 없다.
 * 기대 검사 결과는 픽스처 룰에 같은 편집을 한 정의를 TS 분석기로 돌려 얻었다(design Build 이탈 B9).
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STEWARD2 = process.env.SMOKE_MDM_STEWARD2_USER ?? "e2e_mdm_steward2";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-02/screens", name);

/** TSK-08-03 스크린샷 — 08-02 의 경로(위 screenshot)는 그대로 두고 이 Task 디렉터리에 따로 남긴다. */
const screenshot03 = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-03/screens", name);

/** TSK-08-04 스크린샷 — 값 테스트·테스트 케이스·저장 거부. */
const screenshot04 = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-04/screens", name);

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW, exactButton: true };

async function openRuleEdit(page: Page) {
  await openRuleMenu(page, /^룰 화면$/);
  await expect(page.getByTestId("rule-pick-keyword")).toBeVisible({ timeout: 60_000 });
}

/**
 * 새 버전(major)을 만들고 그 버전으로 이 화면을 연다. 새 버전 버튼은 D-105 로 룰(ruleMng) 상세의 버전 버튼 줄에만 있다 —
 * 사용자처럼 룰 화면에서 만들고, 만든 버전을 골라 [내용 편집 →] 으로 넘어온다.
 */
async function newMajorVersionAndEdit(page: Page, ruleId: string, ver: string) {
  await openRuleMenu(page, /^룰$/);
  await expect(page.getByTestId("rule-search-keyword")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("rule-search-keyword").fill(ruleId);
  await clickSearch(page);
  // 룰 ID 링크는 룰 화면 탭을 연다(ruleMng 기능설계서 G-001) — 상세는 행의 다른 칸(룰명)을 눌러 연다.
  await page.locator(".ag-row", { has: page.getByTestId(`rule-link-${ruleId}`) }).locator('.ag-cell[col-id="maruRuleName"]').click();
  await expect(page.getByTestId("rule-header-id")).toHaveText(ruleId, { timeout: 30_000 });
  await page.getByRole("button", { name: "새 버전(major)", exact: true }).click();
  const created = gridRowById(page.getByTestId("rule-version-table"), ver);
  await expect(created.locator('[data-status="DRAFT"]')).toBeVisible({ timeout: 20_000 });
  await created.locator('.ag-cell[col-id="ver"]').click();
  await page.getByRole("button", { name: "내용 편집 →" }).click();
  await expect(page.getByTestId("rule-edit-current")).toHaveText(ruleId, { timeout: 60_000 });
}

async function pickRule(page: Page, ruleId: string) {
  await page.getByTestId("rule-pick-keyword").fill(ruleId);
  await page.getByRole("button", { name: "찾기", exact: true }).click();
  await page.getByTestId(`rule-pick-${ruleId}`).click();
  await expect(page.getByTestId("rule-edit-current")).toHaveText(ruleId, { timeout: 30_000 });
}

async function openRule(page: Page, user: string, ruleId: string) {
  await login(page, user, LOGIN_OPTS);
  await openRuleEdit(page);
  await pickRule(page, ruleId);
}

function grid(page: Page): Locator {
  return page.getByTestId("dt-grid");
}

/** 그리드 칸 — 행은 row-id(= row_id), 칸은 col-id(`c{varId}_{k}`·note 등). */
function cell(page: Page, rowId: number, field: string): Locator {
  return grid(page).locator(`.ag-row[row-id="${rowId}"] .ag-cell[col-id="${field}"]`);
}

async function editText(page: Page, rowId: number, field: string, value: string) {
  const c = cell(page, rowId, field);
  await c.click();
  const input = c.locator("input");
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(value);
  await input.press("Enter");
  await expect(input).toHaveCount(0);
}

async function selectOp(page: Page, rowId: number, field: string, op: string) {
  const c = cell(page, rowId, field);
  await c.click();
  const select = c.locator("select");
  await expect(select).toBeVisible({ timeout: 10_000 });
  await select.selectOption(op);
  await expect(select).toHaveCount(0);
}

/** 열 설정 그리드 칸 — 행은 row-id(초안 키 `v{varId}`·새 열 `n{번호}`), 칸은 col-id(varName·grpCond 등). */
function colCell(page: Page, key: string, field: string): Locator {
  return page.getByTestId("col-table").locator(`.ag-row[row-id="${key}"] .ag-cell[col-id="${field}"]`);
}

/**
 * 열 설정 그리드는 열이 많아 오른쪽 열(열 조건 grpCond·식 expr·식 결과 exprInfo 등)은 가로로 굴려야 그려진다(ag-grid 열
 * 가상화) — 칸을 보거나 고치기 전에 그 열을 드러낸다. 식의 파싱 상태(`…-status`)·미리보기(`…-preview`)는 식 칸이 아니라
 * 「식 결과」(exprInfo) 칸에 있다.
 */
async function showCol(page: Page, field: string) {
  await revealGridColumn(page.getByTestId("col-table"), field);
}

async function colEdit(page: Page, key: string, field: string, value: string) {
  await showCol(page, field);
  const c = colCell(page, key, field);
  await c.click();
  const input = c.locator("input");
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(value);
  await input.press("Enter");
  await expect(input).toHaveCount(0);
}

async function colSelect(page: Page, key: string, field: string, value: string) {
  await showCol(page, field);
  const c = colCell(page, key, field);
  await c.click();
  const select = c.locator("select");
  await expect(select).toBeVisible({ timeout: 10_000 });
  await select.selectOption(value);
  await expect(select).toHaveCount(0);
}

function checkRows(page: Page): Locator {
  return page.getByTestId("dt-check-rows");
}

/** 저장 거부 등 서버 오류 때 함께 뜨는 ErrorModal 을 닫는다(다음 조작을 가리지 않게). */
async function closeErrorModal(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button").first().click();
  await expect(dialog).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

// D-105 — ① 헤더·② 버전은 ruleMng 화면으로 옮겨 갔다(dmc D-101·dmd D-104 와 같은 분할). 이 스펙은 **내용 편집만**
// 본다: 의사결정표·열 설정·값 테스트·테스트 케이스·활용처, 그리고 상단 버전 고르기.
// 헤더 저장·폐기·새 버전·DRAFT 삭제·선점·해제·넘기기·확정 취소는 mdm-ruleMng.spec.ts 가 본다. 적중 정책 저장은 D-133 으로
// 이 화면(표 저장과 함께, S6)이 본다.
test.describe("mdm dme/ruleEdit", () => {
  test.setTimeout(240_000);

  test.beforeAll(() => loadMdmFixture("mdm-ruleEdit-data.sql"));

  test("S1 메뉴: 룰 화면이 열리고 룰을 고르기 전 빈 상태다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleEdit(page);
    await expect(page.getByTestId("rule-edit-empty")).toBeVisible();
  });

  test("S2 서버 데이터: 상단 버전 고르기·3줄 머리 의사결정표·활용처가 보이고 RELEASED 는 읽기 전용이다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await expect(page.getByTestId("rule-edit-current-name")).toHaveText("품질 등급 판정");
    // D-105 — 버전 목록(②)은 헤더·버전 화면이다. 여기는 상단 Select 로 버전을 고른다.
    const verSelect = page.getByTestId("rule-ver-select");
    await expect(verSelect.locator("option")).toHaveCount(2);
    // 기본 선택은 미적용 버전(픽스처의 2.000 DRAFT)이다(RuleViewService.pickDefault) — RELEASED 1.000 은 골라서 본다.
    await expect(verSelect).toHaveValue("2.000");
    await verSelect.selectOption("1.000");
    await expect(verSelect).toHaveValue("1.000");

    const header = grid(page).locator(".ag-header");
    await expect(header.getByText("조건", { exact: true })).toBeVisible();
    await expect(header.getByText("결과", { exact: true })).toBeVisible();
    await expect(header.getByText("COIL_THK")).toBeVisible();
    for (const name of ["OP", "하한", "상한"]) await expect(header.getByText(name, { exact: true }).first()).toBeVisible();

    for (const rowId of [1, 2, 3, 4]) await expect(page.getByTestId(`dt-row-${rowId}`)).toBeVisible();
    await expect(page.getByTestId("dt-row-4")).toContainText("기본");
    await expect(page.getByTestId("rule-card-usage")).toContainText("LS_E2E");

    await expect(page.getByRole("button", { name: "행 추가", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "표 저장", exact: true })).toBeDisabled();
    await cell(page, 2, "c2_left").click();
    await expect(cell(page, 2, "c2_left").locator("input")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleEdit-released.png"), fullPage: true });
  });



  test("S5 편집: 행 추가·칸 편집 강조·드래그·되돌리기, 조건이 전부 - 인 행은 저장이 거부되고 조건을 채우면 저장되어 새 행 번호가 남는다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2.000");

    await page.getByRole("button", { name: "행 추가", exact: true }).click();
    await expect(page.getByTestId("dt-row--1")).toBeVisible();
    await expect(checkRows(page)).toContainText("[ALL_NA_ROW] 행 -1");
    await expect(page.getByTestId("dt-dirty")).toBeVisible();

    // 3행 SURF_GRD: NOT IN → IN, 값 C — base(버전 1) 대비 바뀐 칸으로 강조된다.
    await selectOp(page, 3, "c3_op", "IN");
    await editText(page, 3, "c3_left", "C");
    await expect(cell(page, 3, "c3_op")).toHaveClass(/cell-edited/);
    await expect(cell(page, 3, "c3_left")).toHaveText("C");

    // 새 행을 드래그 손잡이로 1행 위로 옮긴다.
    const handle = grid(page).locator('.ag-row[row-id="-1"] .ag-row-drag').first();
    const target = grid(page).locator('.ag-pinned-left-cols-container .ag-row[row-id="1"]');
    const hb = (await handle.boundingBox())!;
    const tb = (await target.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y - 10, { steps: 5 });
    await page.mouse.move(tb.x + 20, tb.y + 2, { steps: 15 });
    await page.mouse.up();
    await expect(grid(page).locator('.ag-pinned-left-cols-container .ag-row[row-index="0"]')).toHaveAttribute("row-id", "-1", { timeout: 10_000 });
    await expect(page.getByTestId("dt-row--1")).toContainText("1");

    await page.getByRole("button", { name: "되돌리기", exact: true }).click();
    await expect(page.getByTestId("dt-row--1")).toHaveCount(0);
    await expect(page.getByTestId("dt-dirty")).toHaveCount(0);
    await expect(cell(page, 3, "c3_op")).not.toHaveClass(/cell-edited/);

    // 다시 새 행 — 결과 칸 둘을 채우고 저장. 조건 전부 - 인 ALL_NA_ROW 는 저장 시 검사가 거부하고 편집은 남는다(TSK-08-04, 08-02 D3 뒤집기).
    await page.getByRole("button", { name: "행 추가", exact: true }).click();
    await expect(page.getByTestId("dt-row--2")).toBeVisible();
    await editText(page, -2, "c4_val", "D");
    // 결과 PRC_FCT 칸이 없으면 미완성으로 거부된다(I4).
    await page.getByRole("button", { name: "표 저장", exact: true }).click();
    await expect(page.getByTestId("dt-save-rejected")).toContainText("룰 저장 거부", { timeout: 30_000 });
    await expect(page.getByTestId("dt-save-rejected")).toContainText("INCOMPLETE_RESULT");
    await closeErrorModal(page);
    await expect(page.getByTestId("dt-row--2")).toBeVisible();

    await editText(page, -2, "c5_val", "0.80");
    await page.getByRole("button", { name: "표 저장", exact: true }).click();
    await expect(page.getByTestId("dt-save-rejected")).toContainText("룰 저장 거부", { timeout: 30_000 });
    await expect(page.getByTestId("dt-save-rejected")).toContainText("ALL_NA_ROW");
    await closeErrorModal(page);
    await expect(page.getByTestId("dt-row--2")).toBeVisible();
    await expect(page.getByTestId("dt-dirty")).toBeVisible();

    // 조건 칸 하나(표면등급 IN D)를 채우면 저장된다. 거부된 저장은 행 번호를 발급하지 않았으므로 새 행은 row 5 다(I1).
    await selectOp(page, -2, "c3_op", "IN");
    await editText(page, -2, "c3_left", "D");
    await page.getByRole("button", { name: "표 저장", exact: true }).click();
    await expect(page.getByTestId("dt-row-5")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dt-dirty")).toHaveCount(0);
    await expect(page.getByTestId("dt-save-rejected")).toHaveCount(0);
    await expect(cell(page, 5, "c4_val")).toHaveText("D");
    await expect(cell(page, 5, "c3_left")).toHaveText("D");

    // 다시 불러와도 새 행(row 5)이 남는다.
    await page.reload();
    await openRuleEdit(page);
    await pickRule(page, "QLTY_GRD_JDG");
    await expect(page.getByTestId("dt-row-5")).toBeVisible();
    await expect(page.getByTestId("dt-dirty")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleEdit-draft.png"), fullPage: true });
  });

  test("S6 수용 7: 겹침 알림이 저장 전에 보이고, FIRST 면 저장되어 서버 검사와 같고, UNIQUE 면 오류라 저장이 거부된다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await editText(page, 2, "c3_left", "A");
    await expect(checkRows(page)).toContainText("경고 [OVERLAP] 행 1, 2");
    await expect(checkRows(page)).toContainText("경고 [UNREACHABLE] 행 2, 1");
    await expect(cell(page, 2, "c3_left")).toHaveText("A");

    // FIRST 겹침은 경고라 저장되고, 저장 응답의 서버 분석과 화면 분석이 같다.
    await page.getByRole("button", { name: "표 저장", exact: true }).click();
    await expect(page.getByTestId("dt-check-same")).toHaveText("화면·서버 검사 일치", { timeout: 30_000 });
    await expect(page.getByTestId("dt-check")).toContainText("검사(서버)");
    await expect(checkRows(page)).toContainText("경고 [OVERLAP] 행 1, 2");
    await expect(page.getByTestId("dt-dirty")).toHaveCount(0);

    // D-133 — 적중 정책은 여기서 고르고 표 저장과 함께 저장한다. UNIQUE 로 고르면 즉시 검사가 다시 돌아 겹침이 오류가 되고,
    // 저장이 거부된다(정책·행 모두 그대로). 되돌리기는 정책까지 되돌린다.
    await expect(page.getByTestId("dt-hit-policy")).toHaveValue("FIRST");
    await page.getByTestId("dt-hit-policy").selectOption("UNIQUE");
    await expect(page.getByTestId("dt-dirty")).toBeVisible();
    await expect(checkRows(page)).toContainText("오류 [OVERLAP] 행 1, 2");
    await page.getByRole("button", { name: "표 저장", exact: true }).click();
    await expect(page.getByTestId("dt-save-rejected")).toContainText("OVERLAP", { timeout: 30_000 });
    await closeErrorModal(page);
    await page.getByRole("button", { name: "되돌리기", exact: true }).click();
    await expect(page.getByTestId("dt-hit-policy")).toHaveValue("FIRST");
    await expect(page.getByTestId("dt-dirty")).toHaveCount(0);

    // 다시 불러와도 저장된 FIRST 이 그대로고, 첫 저장의 칸 값은 남는다.
    await page.reload();
    await openRuleEdit(page);
    await pickRule(page, "QLTY_GRD_JDG");
    await expect(page.getByTestId("dt-hit-policy")).toHaveValue("FIRST");
    await expect(cell(page, 2, "c3_left")).toHaveText("A");
  });






  // ── TSK-08-03: 열 설정·산출 룰·입력 계약 ──

  /** 열 설정 섹션을 펼친다 — 처음에는 접혀 있다(2026-10-01). 이미 펼쳐져 있으면(되살린 초안 등) 그대로 둔다. */
  async function openColumns(page: Page) {
    await expect(page.getByTestId("rule-section-columns")).toBeVisible({ timeout: 30_000 });
    const toggle = page.getByTestId("rule-section-columns-toggle");
    if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    await expect(page.getByTestId("rule-section-columns-body")).toBeVisible();
  }

  /** 룰을 열고 고른 버전을 맞춘 뒤 열 설정을 펼친다(기본은 가장 최신 버전). */
  /** ver 는 서버 표기 `"2.000"`(D-144) — 버전 고르기 값이 이 문자열이다. */
  async function openRuleVer(page: Page, ruleId: string, ver: string) {
    await openRule(page, STEWARD, ruleId);
    const select = page.getByTestId("rule-ver-select");
    if ((await select.inputValue()) !== ver) await select.selectOption(ver);
    await expect(select).toHaveValue(ver);
    await openColumns(page);
  }

  async function reopen(page: Page, ruleId: string) {
    await page.reload();
    await openRuleEdit(page);
    await pickRule(page, ruleId);
    await openColumns(page);
  }

  test("C1 열 설정: BASE_SPD_LKP v2 의 결과 열 그룹 8열과 열 조건이 보이고 FLUORO 열 조건을 고쳐 적용하면 다시 불러와도 같다", async ({ page }) => {
    await openRuleVer(page, "BASE_SPD_LKP", "2.000");
    await showCol(page, "resGrp");
    for (const varId of [2, 3, 4, 5, 6, 7, 8, 9]) {
      await expect(page.getByTestId(`col-grp-v${varId}`)).toHaveText("BASE_SPD");
    }
    await showCol(page, "grpCond");
    await expect(page.getByTestId("col-grpcond-v4")).toHaveText('TOP_RESIN_CD == "F"');
    await expect(page.getByTestId("col-grpcond-v9")).toHaveText("비우면 기본 열"); // GENERAL — 기본 열(열 조건 없음, 그룹의 마지막). 빈 칸은 안내 글자만 보인다
    await expect(page.getByTestId("col-dirty")).toHaveCount(0);

    await colEdit(page, "v4", "grpCond", 'TOP_RESIN_CD == "FL"');
    await expect(page.getByTestId("col-dirty")).toBeVisible();
    await showCol(page, "exprInfo");
    await expect(page.getByTestId("col-grpcond-v4-status")).toContainText("TOP_RESIN_CD", { timeout: 20_000 }); // 서버 파싱 결과의 참조 변수
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 0건");
    // 초안이 있으면 표 저장은 막힌다(불변 13).
    await expect(page.getByTestId("dt-col-block")).toContainText("열 설정 초안이 있어 표를 저장할 수 없습니다");
    await expect(page.getByRole("button", { name: "표 저장", exact: true })).toBeDisabled();

    await page.getByTestId("col-apply").click();
    await expect(page.getByTestId("col-dirty")).toHaveCount(0, { timeout: 30_000 });
    await showCol(page, "grpCond");
    await expect(page.getByTestId("col-grpcond-v4")).toHaveText('TOP_RESIN_CD == "FL"');

    await reopen(page, "BASE_SPD_LKP");
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2.000");
    await showCol(page, "grpCond");
    await expect(page.getByTestId("col-grpcond-v4")).toHaveText('TOP_RESIN_CD == "FL"');
    await showCol(page, "resGrp");
    await expect(page.getByTestId("col-grp-v9")).toHaveText("BASE_SPD");
    await page.getByTestId("col-table").scrollIntoViewIfNeeded(); // 포털은 안쪽 영역이 스크롤되므로 이 섹션이 보이게 한 뒤 남긴다
    await page.screenshot({ path: screenshot03("dme-ruleEdit-cols-grp.png"), fullPage: true });
  });

  test("C3 산출 룰: COIL_WGT_CALC 새 버전에서 앞 결과를 읽는 열은 되고 자기 참조는 거부되어 아무 것도 반영되지 않으며 식 미리보기가 25434.0 이다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await newMajorVersionAndEdit(page, "COIL_WGT_CALC", "2.000");
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2.000", { timeout: 20_000 });
    await openColumns(page);
    await expect(page.getByTestId("dt-derive-notice")).toBeVisible();
    await showCol(page, "expr");
    await expect(page.getByTestId("col-expr-v1")).toHaveText("ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)");

    // 식 미리보기 — 서버 AST 를 화면 evalex 로 평가한다(케이스 1.8 × 1200 × 1500, 비중 7.85).
    await page.getByTestId("col-preview-input").fill("COIL_THK=1.8, COIL_WID=1200, COIL_LEN=1500, SPEC_GRAV=7.85");
    await showCol(page, "exprInfo");
    await expect(page.getByTestId("col-expr-v1-preview")).toContainText("25434", { timeout: 20_000 });
    await showCol(page, "exprInfo");
    await expect(page.getByTestId("col-expr-v1-preview")).toHaveText("= 25434.0");

    // 결과 열 추가 — 앞 결과 COIL_WGT 를 읽는 식은 허용된다.
    await page.getByTestId("col-add-result").click();
    await colSelect(page, "n1", "dispType", "Expression"); // 산출 룰의 결과 열은 식이다
    await colEdit(page, "n1", "varName", "COIL_WGT_X2");
    await colEdit(page, "n1", "label", "2배 중량");
    await colSelect(page, "n1", "dataType", "NUMBER");
    await colEdit(page, "n1", "expr", "COIL_WGT * 2");
    await showCol(page, "exprInfo");
    await expect(page.getByTestId("col-expr-n1-status")).toContainText("COIL_WGT", { timeout: 20_000 });
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 0건");

    // 순서를 바꾸면 뒤 순서 결과를 읽게 되어 거부된다.
    await showCol(page, "order"); // 순서 버튼은 왼쪽 열이라 오른쪽으로 굴린 뒤에는 다시 드러내야 한다
    await page.getByRole("button", { name: "COIL_WGT_X2 위로", exact: true }).click();
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 1건");
    await showCol(page, "order"); // 순서 버튼은 왼쪽 열이라 오른쪽으로 굴린 뒤에는 다시 드러내야 한다
    await page.getByRole("button", { name: "COIL_WGT_X2 아래로", exact: true }).click();
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 0건");

    // 자기 참조 식은 거부되고 적용해도 아무 것도 반영하지 않는다(원자 적용).
    await colEdit(page, "n1", "expr", "COIL_WGT_X2 * 2");
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 1건");
    await page.getByTestId("col-apply").click();
    await expect(page.getByTestId("col-apply-rejects")).toContainText("아무 것도 반영되지 않음");
    await showCol(page, "varId");
    await expect(colCell(page, "v1", "varId")).toBeVisible();

    // 고쳐서 적용한다.
    await colEdit(page, "n1", "expr", "COIL_WGT * 2");
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 0건");
    await page.getByTestId("col-apply").click();
    await expect(page.getByTestId("col-dirty")).toHaveCount(0, { timeout: 30_000 });

    await reopen(page, "COIL_WGT_CALC");
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2.000");
    await showCol(page, "expr");
    await expect(page.getByTestId("col-expr-v1")).toHaveText("ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)");
    // 새 열은 카운터에서 발급된 var_id(2)로 저장되고 식이 남는다.
    await expect(page.getByTestId("col-expr-v2")).toHaveText("COIL_WGT * 2");
    await showCol(page, "varName");
    await expect(page.getByTestId("col-name-v2")).toHaveText("COIL_WGT_X2");
    await page.getByTestId("col-preview-input").fill("COIL_THK=1.8, COIL_WID=1200, COIL_LEN=1500, SPEC_GRAV=7.85");
    await showCol(page, "exprInfo");
    await expect(page.getByTestId("col-expr-v1-preview")).toHaveText("= 25434.0", { timeout: 20_000 });
    await page.getByTestId("col-table").scrollIntoViewIfNeeded(); // 포털은 안쪽 영역이 스크롤되므로 이 섹션이 보이게 한 뒤 남긴다
    await page.screenshot({ path: screenshot03("dme-ruleEdit-derive.png"), fullPage: true });
  });

  test("C4 조건별 수식: PROD_WGT_CALC v2 의 행마다 다른 결과 식이 그리드에, 조건 열이 열 설정에 보이고 DRAFT 식에 COALESCE(SPEC_GRAV, 7.85) 가 있다", async ({ page }) => {
    await openRuleVer(page, "PROD_WGT_CALC", "2.000");
    for (const rowId of [1, 2, 3]) await expect(page.getByTestId(`dt-row-${rowId}`)).toBeVisible();
    await expect(gridRowById(grid(page), "1")).toContainText("COALESCE(SPEC_GRAV, 7.85)");
    await expect(gridRowById(grid(page), "2")).toContainText("SHEET_CNT");
    await expect(gridRowById(grid(page), "3")).toContainText("COIL_OUT_DIA");
    await showCol(page, "varName");
    await expect(page.getByTestId("col-name-v1")).toHaveText("PROD_TYPE");
    await expect(page.getByTestId("col-name-v3")).toHaveText("CALC_BASIS");
    await expect(page.getByTestId("col-name-v2")).toHaveText("PROD_WGT");
    await page.getByTestId("col-table").scrollIntoViewIfNeeded(); // 포털은 안쪽 영역이 스크롤되므로 이 섹션이 보이게 한 뒤 남긴다
    await page.screenshot({ path: screenshot03("dme-ruleEdit-formula.png"), fullPage: true });
  });

  test("C5 입력 계약 변경 알림: PROD_WGT_CALC v2 는 SPEC_GRAV 가 필수에서 선택이 된 것을 RELEASED 대비 알림 한 줄로 보이고 경고는 없다", async ({ page }) => {
    await openRuleVer(page, "PROD_WGT_CALC", "2.000");
    await expect(page.getByTestId("contract-diff-info")).toContainText("필수 입력이 선택이 되었습니다: SPEC_GRAV", { timeout: 30_000 });
    await expect(page.getByTestId("contract-diff-warning")).toHaveCount(0);
    await page.getByTestId("contract-notice").scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot03("dme-ruleEdit-contract.png"), fullPage: true });
  });

  test("C6 도메인 검색·식 검사: SPEED 로 찾으면 8건 이내에 SPEED_MPM 이 있고 화이트리스트 밖 함수는 서버 평가로 넘긴다고 표시된다", async ({ page }) => {
    await openRuleVer(page, "PROD_WGT_CALC", "2.000");
    await showCol(page, "domain");
    await page.getByTestId("col-domain-open-v2").click();
    await page.getByTestId("col-domain-v2-keyword").fill("SPEED");
    await page.getByTestId("col-domain-v2-search").click();
    const items = page.getByTestId("col-domain-v2-rows").locator("li");
    await expect(items.first()).toBeVisible({ timeout: 20_000 });
    expect(await items.count()).toBeLessThanOrEqual(8);
    await expect(page.getByTestId("col-domain-v2-pick-SPEED_MPM")).toBeVisible();
    await expect(items.first()).toContainText("SPEED_MPM"); // ID 앞부분 일치 우선
    await page.getByTestId("col-domain-v2").getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page.getByTestId("col-domain-v2")).toHaveCount(0);

    // 화이트리스트 밖 함수를 열 설정의 식 칸에 적는다. Expression 조건 열은 fa9ff541(09-28)부터 변수 칸이 없고 식을 표의 행 칸마다
    // 적으므로, 열 설정에서 식을 파싱하는 칸(결과 열의 열 조건 — exprsOf)에 적는다: 결과 열 PROD_WGT 에 그룹을 주면 열 조건이 열린다.
    await colEdit(page, "v2", "resGrp", "PROD_WGT");
    await colEdit(page, "v2", "grpCond", 'MASTER("PORT", "ALL", SURF_GRD) == "A"');
    await showCol(page, "exprInfo");
    await expect(page.getByTestId("col-grpcond-v2-status")).toContainText("서버 평가로 넘긴다", { timeout: 20_000 });
    await page.getByTestId("col-discard").click();
    await expect(page.getByTestId("col-dirty")).toHaveCount(0);
  });

  // ── TSK-08-04: 값 테스트·테스트 결과·테스트 케이스·저장 시 검사 ──
  // 값 테스트는 E2E_VT_JDG 로만 한다(v1 RELEASED 와 v2 DRAFT 가 같은 행: 두께 [1.6, 2.5) × 표면 A → A, × B → B, 두께 ≥ 2.5 → B, 기본 C, UNIQUE).
  // 변수 var_id: 1 COIL_THK · 2 SURF_GRD · 3 QLTY_GRD. 케이스 1(기대값 맞음)·2(기대값 틀림)는 픽스처에 있다.

  const VT_RULE = "E2E_VT_JDG";

  function valueTestCard(page: Page): Locator {
    return page.getByTestId("rule-card-value-test");
  }

  function caseCard(page: Page): Locator {
    return page.getByTestId("rule-card-test-cases");
  }

  /** 케이스 표(AgDataGrid)의 행 — id 를 주면 row-id(case_id)로, hasText 를 주면 그 글자가 든 행으로 좁힌다. */
  function caseRow(page: Page, id: number): Locator {
    return gridRowById(caseCard(page), id);
  }

  function caseRowWith(page: Page, text: string): Locator {
    return gridRows(caseCard(page), { hasText: text });
  }

  /** ④ 입력 표의 값 칸 — 행 키는 변수명이다. */
  function vtValueCell(page: Page, name: string): Locator {
    return valueTestCard(page).locator(`.ag-row[row-id="${name}"] .ag-cell[col-id="value"]`);
  }

  /** ④ 입력 표가 그려진 뒤(다른 버전 정의는 비동기로 받는다) 값 칸을 눌러 편집하고 Enter 로 확정한다. */
  async function fillInput(page: Page, name: string, value: string) {
    const c = vtValueCell(page, name);
    await expect(c).toBeVisible({ timeout: 30_000 });
    await c.click();
    const input = c.locator("input");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(value);
    await input.press("Enter");
    await expect(input).toHaveCount(0);
  }

  async function runValueTest(page: Page) {
    await valueTestCard(page).getByRole("button", { name: "실행", exact: true }).click();
    await expect(page.getByTestId("vt-result-target")).toBeVisible({ timeout: 30_000 });
  }

  function resultValue(page: Page, name: string): Locator {
    return page.getByTestId("vt-result-values").locator("tr", { hasText: name }).locator("td");
  }

  test("V1 메뉴·목록: 값 테스트·테스트 결과·테스트 케이스 카드가 보이고 케이스 표는 서버 케이스 2건, 케이스 없는 룰은 빈 상태다", async ({ page }) => {
    await openRule(page, STEWARD, VT_RULE);
    await expect(valueTestCard(page)).toBeVisible();
    await expect(page.getByTestId("rule-card-test-result")).toBeVisible();
    await expect(page.getByTestId("vt-result-empty")).toBeVisible();
    await expect(caseCard(page)).toBeVisible();
    await expect(caseRow(page, 1)).toContainText("중간 두께 A");
    await expect(caseRow(page, 2)).toContainText("후물 C");
    await expect(page.getByTestId("tc-empty")).toHaveCount(0);
    // 편집할 수 있는 DRAFT 가 고른 버전이면 대상 기본값은 편집본이다(I34).
    await expect(page.getByTestId("vt-target")).toHaveValue("BODY");

    await pickRule(page, "QLTY_GRD_JDG");
    await expect(page.getByTestId("tc-empty")).toHaveText("테스트 케이스가 없습니다", { timeout: 20_000 });
  });

  test("V2 저장된 버전: 버전 1 을 돌리면 결과 값·적중 행이 보이고, 보이는 표(v2)와 달라 결과 카드에 v1 표를 따로 칠한다", async ({ page }) => {
    await openRule(page, STEWARD, VT_RULE);
    await page.getByTestId("vt-target").selectOption({ label: "버전 v1.000 · RELEASED" });
    await expect(page.getByTestId("vt-mode")).toContainText("저장된 버전");
    await fillInput(page, "COIL_THK", "2.0");
    await fillInput(page, "SURF_GRD", "A");
    await runValueTest(page);

    await expect(page.getByTestId("vt-result-target")).toContainText("판정함");
    await expect(resultValue(page, "QLTY_GRD")).toHaveText(/^\s*"?A"?\s*$/);
    await expect(page.getByTestId("vt-result-hits")).toContainText("row_id 1");
    // 결과 카드의 v1 표: 적중 행 초록, 평가했지만 거짓인 행의 첫 거짓 칸 붉음(2행 = 표면등급, 3행 = 두께).
    const table = page.getByTestId("vt-result-table");
    await expect(table).toBeVisible();
    await expect(gridRowById(table, "1")).toHaveClass(/ag-row-test-hit/);
    await expect(gridRowById(table, "2").locator('.cell-test-false').first()).toBeVisible();
    await expect(gridRowById(table, "3").locator('.cell-test-false').first()).toBeVisible();
    await expect(gridRowById(table, "2")).not.toHaveClass(/ag-row-test-hit/);
    // 보이는 표(v2 편집본)는 칠하지 않는다(I33).
    await expect(grid(page).locator(".ag-row-test-hit")).toHaveCount(0);
    await expect(page.getByTestId("dt-test-shown")).toHaveCount(0);
    await page.getByTestId("rule-card-test-result").scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot04("dme-ruleEdit-valuetest-version.png"), fullPage: true });
  });

  test("V3 편집본: 저장하지 않은 칸 변경으로 돌리면 의사결정표에 칠하고, 표를 다시 고치면 지우며, 키 보냄을 끄면 MISSING_KEY 다", async ({ page }) => {
    await openRule(page, STEWARD, VT_RULE);
    await expect(page.getByTestId("vt-target")).toHaveValue("BODY");
    // 1행 표면등급 A → D(저장하지 않는다).
    await editText(page, 1, "c2_left", "D");
    await expect(page.getByTestId("dt-dirty")).toBeVisible();
    await fillInput(page, "COIL_THK", "2.0");
    await fillInput(page, "SURF_GRD", "D");
    await runValueTest(page);

    await expect(resultValue(page, "QLTY_GRD")).toHaveText(/^\s*"?A"?\s*$/);
    await expect(page.getByTestId("vt-result-hits")).toContainText("row_id 1");
    await expect(page.getByTestId("vt-result-on-table")).toBeVisible();
    await expect(page.getByTestId("dt-test-shown")).toContainText("편집본");
    await expect(gridRowById(grid(page), "1")).toHaveClass(/ag-row-test-hit/);
    await expect(gridRowById(grid(page), "2").locator('.cell-test-false').first()).toBeVisible();
    await expect(gridRowById(grid(page), "3").locator('.cell-test-false').first()).toBeVisible();
    await page.getByTestId("rule-card-table").scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot04("dme-ruleEdit-valuetest-body.png"), fullPage: true });

    // 표를 다시 고치면 칠한 것을 지우고 다시 돌리라고 안내한다(I33).
    await editText(page, 3, "c3_val", "E");
    await expect(page.getByTestId("dt-test-stale")).toContainText("다시 실행하세요");
    await expect(grid(page).locator(".ag-row-test-hit")).toHaveCount(0);
    await expect(grid(page).locator(".cell-test-false")).toHaveCount(0);

    // 두께의 키 보냄을 끄면 레코드에 키가 없어 판정 오류(MISSING_KEY)다(I21).
    // 체크박스는 그리드 칸 안의 제어 컴포넌트라 누른 뒤 상태가 그리드의 행 갱신으로 한 박자 늦게 바뀐다 — uncheck() 는 누른 직후
    // 상태를 바로 확인해 "did not change its state" 로 흔들렸다(최종 실행 trace: 실패 직후 화면은 꺼져 있고 (키 없음)). 누르고 꺼질 때까지 기다린다.
    const keyBox = page.getByTestId("vt-key-COIL_THK").locator('input[type="checkbox"]');
    await keyBox.click();
    await expect(keyBox).not.toBeChecked();
    await expect(vtValueCell(page, "COIL_THK")).toHaveText("(키 없음)");
    await runValueTest(page);
    await expect(page.getByTestId("vt-result-target")).toContainText("판정 오류");
    // 본문은 사용자 문장, 코드는 툴팁(title) — Local-Rules §13.
    await expect(page.getByTestId("vt-result-errors")).toContainText("COIL_THK 값이");
    await expect(page.getByTestId("vt-result-errors").locator("li").first()).toHaveAttribute("title", /MISSING_KEY/);
  });

  test("V4 케이스: 케이스로 저장하면 케이스 표에 새 줄이 생기고, 모두 실행으로 통과·실패가 보이며, 삭제하면 사라진다", async ({ page }) => {
    await openRule(page, STEWARD, VT_RULE);
    await page.getByTestId("vt-target").selectOption({ label: "버전 v1.000 · RELEASED" });
    await fillInput(page, "COIL_THK", "1.8");
    await fillInput(page, "SURF_GRD", "B");
    await runValueTest(page);
    await expect(resultValue(page, "QLTY_GRD")).toHaveText(/^\s*"?B"?\s*$/);

    // 방금 돌린 결과가 기대값으로 실린다(같은 대상·같은 입력).
    await page.getByTestId("vt-case-name").fill("E2E 중간 두께 B");
    await valueTestCard(page).getByRole("button", { name: "케이스로 저장", exact: true }).click();
    const added = caseRowWith(page, "E2E 중간 두께 B");
    await expect(added).toBeVisible({ timeout: 30_000 });
    await expect(added).toContainText('"QLTY_GRD"');
    await expect(page.getByTestId("vt-case-name")).toHaveValue("");

    await caseCard(page).getByRole("button", { name: "모두 실행", exact: true }).click();
    await expect(page.getByTestId("tc-badge-1")).toHaveText(/통과/, { timeout: 30_000 });
    await expect(page.getByTestId("tc-badge-2")).toHaveText(/실패/);
    await expect(caseRow(page, 2)).toContainText("QLTY_GRD");
    await expect(added.locator('[data-testid^="tc-badge-"]')).toHaveText(/통과/);
    await expect(page.getByTestId("tc-error")).toHaveCount(0);
    await caseCard(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot04("dme-ruleEdit-testcases.png"), fullPage: true });

    // 새 케이스를 지운다 — 행 맨 앞 체크 칸으로 고르고 머리글 [삭제] → 확인창(포털) [확인].
    await added.locator(".ag-selection-checkbox").click();
    await expect(page.getByTestId("tc-selected-count")).toHaveText("선택 1건");
    await page.getByTestId("tc-delete").click();
    await expect(page.getByText("선택한 케이스 1건을 삭제하시겠습니까?")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
    await expect(caseRowWith(page, "E2E 중간 두께 B")).toHaveCount(0, { timeout: 30_000 });
    await expect(caseRow(page, 1)).toBeVisible();
    await expect(caseRow(page, 2)).toBeVisible();
  });

  test("V5 서버 오류: 요청 상한을 넘는 긴 입력으로 돌리면 값 테스트 카드에 서버 오류가 보인다", async ({ page }) => {
    await openRule(page, STEWARD, VT_RULE);
    await page.getByTestId("vt-target").selectOption({ label: "버전 v1.000 · RELEASED" });
    await fillInput(page, "COIL_THK", "2.0");
    await fillInput(page, "SURF_GRD", "A".repeat(17_000));
    await valueTestCard(page).getByRole("button", { name: "실행", exact: true }).click();
    await expect(page.getByTestId("vt-error")).toContainText("값 테스트 요청 상한", { timeout: 30_000 });
    await expect(page.getByTestId("vt-result-target")).toHaveCount(0);
  });

  test("V6 저장 거부: UNIQUE 표에서 두 행을 겹치게 고쳐 저장하면 거부되고 편집은 남으며 다시 불러오면 바뀌지 않았다", async ({ page }) => {
    await openRule(page, STEWARD, VT_RULE);
    // 이 룰은 서버에 UNIQUE 로 저장돼 있고, 표는 그 값으로 검사한다(D-133 — 바꾸면 표 저장과 함께 저장된다).
    await expect(page.getByTestId("dt-hit-policy")).toHaveValue("UNIQUE");
    // 2행 표면등급 B → A: 1행과 겹친다.
    await editText(page, 2, "c2_left", "A");
    await expect(checkRows(page)).toContainText("오류 [OVERLAP] 행 1, 2");
    await page.getByRole("button", { name: "표 저장", exact: true }).click();
    await expect(page.getByTestId("dt-save-rejected")).toContainText("룰 저장 거부", { timeout: 30_000 });
    await expect(page.getByTestId("dt-save-rejected")).toContainText("OVERLAP");
    await closeErrorModal(page);
    await expect(page.getByTestId("dt-dirty")).toBeVisible();
    await expect(cell(page, 2, "c2_left")).toHaveText("A");
    await page.getByTestId("rule-card-table").scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot04("dme-ruleEdit-save-rejected.png"), fullPage: true });

    await page.reload();
    await openRuleEdit(page);
    await pickRule(page, VT_RULE);
    await expect(cell(page, 2, "c2_left")).toHaveText("B");
    await expect(page.getByTestId("dt-dirty")).toHaveCount(0);
  });

  test("S7 적중 조건 강조: 행 번호를 누르면 그 행의 - 가 아닌 조건 칸만 강조된다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await page.getByTestId("dt-row-3").click();
    await expect(cell(page, 3, "c1_op")).toHaveClass(/cell-emphasis/);
    await expect(cell(page, 3, "c3_op")).toHaveClass(/cell-emphasis/);
    await expect(cell(page, 3, "c2_op")).not.toHaveClass(/cell-emphasis/); // 폭은 - (NA)
    await expect(cell(page, 1, "c1_op")).not.toHaveClass(/cell-emphasis/);
  });
});
