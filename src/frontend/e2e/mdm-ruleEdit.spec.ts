import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * mdm dme/ruleEdit(룰 화면 골격·의사결정표) — TSK-08-02 design.md §3.4.2.
 *
 * 스모크 넷: S1 메뉴 이동(빈 상태), S2 서버 데이터, S3 수정 한 번(헤더), S10 서버 오류.
 * TSK-08-03 추가: C1 열 설정·결과 열 그룹 왕복, C2 피벗 편집·평탄화 왕복, C3 산출 룰 열 순서·자기 참조 거부·식 미리보기,
 *       C4 조건별 수식 표시, C5 입력 계약 묶음·RELEASED diff, C6 도메인 검색·화이트리스트 밖 식(design.md §3.3).
 * 고유: S4 수용 5(새 버전·거부), S5 편집·드래그·저장·되돌리기·강조, S6 겹침 알림·서버 동치(수용 7), S7 적중 조건 강조,
 *       S8 수용 4(비소유자), S9 해제·선점, S11 DRAFT 삭제.
 *
 * 전제는 mdm-ruleMng.spec.ts 와 같다(새 mcm.db·mdm.db + mdm-rbac-users.sql·mdm-ruleEdit-users.sql·mdm-ruleEdit-data.sql).
 * 시나리오가 이어지므로(버전 2 를 만들어 고치고 지운다) serial 이고 같은 DB 로 다시 돌릴 수 없다.
 * 기대 검사 결과는 픽스처 룰에 같은 편집을 한 정의를 TS 분석기로 돌려 얻었다(design Build 이탈 B9).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STEWARD2 = process.env.SMOKE_MDM_STEWARD2_USER ?? "e2e_mdm_steward2";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-02/screens", name);

/** TSK-08-03 스크린샷 — 08-02 의 경로(위 screenshot)는 그대로 두고 이 Task 디렉터리에 따로 남긴다. */
const screenshot03 = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-03/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
}

function menuItem(page: Page, text: RegExp) {
  return page.locator(".tree-item .item-name").filter({ hasText: text }).first();
}

/** 메뉴 트리를 따라 연다. 새로 고침 뒤에는 트리가 펼친 채 남으므로 하위 항목이 이미 보이면 상위를 누르지 않는다(누르면 접힌다). */
async function openRuleEdit(page: Page) {
  const path = [/^마루 MDM$/, /^업무기준$/, /^룰 화면$/];
  for (let i = 0; i < path.length; i++) {
    const item = menuItem(page, path[i]);
    await expect(item).toBeVisible({ timeout: 20_000 });
    if (i < path.length - 1 && (await menuItem(page, path[i + 1]).isVisible())) continue;
    await item.click();
  }
  await expect(page.getByTestId("rule-pick-keyword")).toBeVisible({ timeout: 60_000 });
}

async function pickRule(page: Page, ruleId: string) {
  await page.getByTestId("rule-pick-keyword").fill(ruleId);
  await page.getByRole("button", { name: "찾기", exact: true }).click();
  await page.getByTestId(`rule-pick-${ruleId}`).click();
  await expect(page.getByTestId("rule-edit-current")).toHaveText(ruleId, { timeout: 30_000 });
}

async function openRule(page: Page, user: string, ruleId: string) {
  await login(page, user);
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

function checkRows(page: Page): Locator {
  return page.getByTestId("dt-check-rows");
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dme/ruleEdit", () => {
  test.setTimeout(240_000);

  test("S1 메뉴: 룰 화면이 열리고 룰을 고르기 전 빈 상태다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleEdit(page);
    await expect(page.getByTestId("rule-edit-empty")).toBeVisible();
  });

  test("S2 서버 데이터: 헤더·버전·3줄 머리 의사결정표·활용처가 보이고 RELEASED 는 읽기 전용이다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await expect(page.getByTestId("rule-edit-current-name")).toHaveText("품질 등급 판정");
    await expect(page.getByTestId("rule-card-versions").getByTestId("rule-ver-row-1")).toBeVisible();
    await expect(page.getByTestId("rule-version-table").locator('[data-status="RELEASED"]')).toHaveCount(1);

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

  test("S3 헤더: 룰명을 바꿔 바로 저장하면 다시 불러와도 유지된다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await page.getByTestId("rule-header-name").fill("품질 등급 판정 E2E");
    await page.getByRole("button", { name: "헤더 저장", exact: true }).click();
    await expect(page.getByTestId("rule-edit-current-name")).toHaveText("품질 등급 판정 E2E", { timeout: 20_000 });
    await page.reload();
    await openRuleEdit(page);
    await pickRule(page, "QLTY_GRD_JDG");
    await expect(page.getByTestId("rule-header-name")).toHaveValue("품질 등급 판정 E2E");
  });

  test("S4 수용 5: 새 버전은 버전 2 DRAFT(base 1, 편집 중(나), 행 복사)이고 그 뒤 새 버전은 막힌다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await page.getByRole("button", { name: "새 버전", exact: true }).click();
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2", { timeout: 20_000 });
    const verRow = page.getByTestId("rule-version-table").locator("tr", { has: page.getByTestId("rule-ver-row-2") });
    await expect(verRow.locator('[data-status="DRAFT"]')).toBeVisible();
    await expect(verRow.locator("td").nth(4)).toHaveText("1");
    await expect(page.getByTestId("rule-edit-topbar").getByText("편집 중(나)")).toBeVisible();
    for (const rowId of [1, 2, 3, 4]) await expect(page.getByTestId(`dt-row-${rowId}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "새 버전", exact: true })).toBeDisabled();
    await expect(page.getByTestId("rule-unapplied-notice")).toContainText("미적용 버전 2");
  });

  test("S5 편집: 행 추가·칸 편집 강조·드래그·되돌리기, 오류가 있어도 저장되고 새 행 번호가 남는다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2");

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

    // 다시 새 행 — 결과 QLTY_GRD 만 D 로 적고 저장. 조건 전부 - 인 ALL_NA_ROW 오류가 있어도 저장된다(D3).
    await page.getByRole("button", { name: "행 추가", exact: true }).click();
    await expect(page.getByTestId("dt-row--2")).toBeVisible();
    await editText(page, -2, "c4_val", "D");
    await page.getByRole("button", { name: "표 저장", exact: true }).click();
    await expect(page.getByTestId("dt-row-5")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dt-dirty")).toHaveCount(0);
    await expect(cell(page, 5, "c4_val")).toHaveText("D");
    await expect(checkRows(page)).toContainText("[ALL_NA_ROW] 행 5");

    // 다시 불러와도 새 행(row 5)이 남는다.
    await page.reload();
    await openRuleEdit(page);
    await pickRule(page, "QLTY_GRD_JDG");
    await expect(page.getByTestId("dt-row-5")).toBeVisible();
    await expect(page.getByTestId("dt-dirty")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleEdit-draft.png"), fullPage: true });
  });

  test("S6 수용 7: 겹침 알림이 저장 전에 보이고, UNIQUE 면 오류, 저장 응답의 서버 검사와 화면 검사가 같다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await editText(page, 2, "c3_left", "A");
    await expect(checkRows(page)).toContainText("경고 [OVERLAP] 행 1, 2");
    await expect(checkRows(page)).toContainText("경고 [UNREACHABLE] 행 2, 1");
    await expect(cell(page, 2, "c3_left")).toHaveText("A");

    await page.getByTestId("dt-hit-policy").selectOption("UNIQUE");
    await expect(checkRows(page)).toContainText("오류 [OVERLAP] 행 1, 2");
    await expect(checkRows(page)).not.toContainText("[UNREACHABLE]");
    await expect(page.getByTestId("dt-check")).toContainText("검사(화면)");

    await page.getByRole("button", { name: "표 저장", exact: true }).click();
    await expect(page.getByTestId("dt-check-same")).toHaveText("화면·서버 검사 일치", { timeout: 30_000 });
    await expect(page.getByTestId("dt-check")).toContainText("검사(서버)");
    await expect(checkRows(page)).toContainText("오류 [OVERLAP] 행 1, 2");
    await expect(page.getByTestId("dt-hit-policy")).toHaveValue("UNIQUE");
    await page.screenshot({ path: screenshot("dme-ruleEdit-overlap.png"), fullPage: true });
  });

  test("S7 적중 조건 강조: 행 번호를 누르면 그 행의 - 가 아닌 조건 칸만 강조된다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await page.getByTestId("dt-row-3").click();
    await expect(cell(page, 3, "c1_op")).toHaveClass(/cell-emphasis/);
    await expect(cell(page, 3, "c3_op")).toHaveClass(/cell-emphasis/);
    await expect(cell(page, 3, "c2_op")).not.toHaveClass(/cell-emphasis/); // 폭은 - (NA)
    await expect(cell(page, 1, "c1_op")).not.toHaveClass(/cell-emphasis/);
  });

  test("S8 수용 4: 다른 담당자가 편집 중인 DRAFT 는 잠김이고 편집·저장·삭제·해제·넘기기가 막힌다", async ({ page }) => {
    await openRule(page, STEWARD, "E2E_LOCK_JDG");
    await expect(page.getByTestId("rule-edit-topbar").getByText(`잠김 · ${STEWARD2} 편집 중`)).toBeVisible();
    for (const name of ["행 추가", "표 저장", "삭제", "해제", "넘기기", "헤더 저장"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    }
    await expect(page.getByRole("button", { name: "선점", exact: true })).toHaveCount(0);
    await cell(page, 1, "c1_left").click();
    await expect(cell(page, 1, "c1_left").locator("input")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleEdit-locked.png"), fullPage: true });
  });

  test("S9 해제·선점: 소유자가 해제하면 다른 담당자가 선점해 편집 중(나)이 된다", async ({ browser }) => {
    const owner = await browser.newPage();
    await openRule(owner, STEWARD2, "E2E_LOCK_JDG");
    await expect(owner.getByTestId("rule-edit-topbar").getByText("편집 중(나)")).toBeVisible();
    await owner.getByRole("button", { name: "해제", exact: true }).click();
    await expect(owner.getByTestId("rule-edit-topbar").getByText("선점 가능")).toBeVisible({ timeout: 20_000 });
    await owner.close();

    const other = await browser.newPage();
    await openRule(other, STEWARD, "E2E_LOCK_JDG");
    await other.getByRole("button", { name: "선점", exact: true }).click();
    await expect(other.getByTestId("rule-edit-topbar").getByText("편집 중(나)")).toBeVisible({ timeout: 20_000 });
    await expect(other.getByRole("button", { name: "행 추가", exact: true })).toBeEnabled();
    await other.close();
  });

  test("S10 서버 오류: 저장이 MDM001 로 거부되면 오류와 다시 불러오기가 보인다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await page.route("**/api/mdm/oasis/ruleEdit/save", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요 (MDM001)" }, data: {} }),
      }),
    );
    await page.getByTestId("rule-header-name").fill("품질 등급 판정 E2E2");
    await page.getByRole("button", { name: "헤더 저장", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("다른 창에서 바뀌었습니다. 다시 불러오세요")).toBeVisible({ timeout: 20_000 });
    await page.unroute("**/api/mdm/oasis/ruleEdit/save");
    await page.getByRole("dialog").getByRole("button").first().click();
    await expect(page.getByRole("button", { name: "다시 불러오기", exact: true })).toBeVisible();
  });

  test("S11 DRAFT 삭제: 버전 2 를 지우면 목록에서 사라지고 새 버전이 다시 켜진다", async ({ page }) => {
    await openRule(page, STEWARD, "QLTY_GRD_JDG");
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2");
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(page.getByTestId("rule-ver-row-2")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("1");
    await expect(page.getByRole("button", { name: "새 버전", exact: true })).toBeEnabled();
  });

  // ── TSK-08-03: 열 설정·피벗·산출 룰·입력 계약 ──

  /** 룰을 열고 고른 버전을 맞춘다(기본은 가장 최신 버전). */
  async function openRuleVer(page: Page, ruleId: string, ver: number) {
    await openRule(page, STEWARD, ruleId);
    const select = page.getByTestId("rule-ver-select");
    if ((await select.inputValue()) !== String(ver)) await select.selectOption(String(ver));
    await expect(select).toHaveValue(String(ver));
    await expect(page.getByTestId("rule-section-columns")).toBeVisible({ timeout: 30_000 });
  }

  async function reopen(page: Page, ruleId: string) {
    await page.reload();
    await openRuleEdit(page);
    await pickRule(page, ruleId);
    await expect(page.getByTestId("rule-section-columns")).toBeVisible({ timeout: 30_000 });
  }

  test("C1 열 설정: BASE_SPD_LKP v2 의 결과 열 그룹 8열과 열 조건이 보이고 FLUORO 열 조건을 고쳐 적용하면 다시 불러와도 같다", async ({ page }) => {
    await openRuleVer(page, "BASE_SPD_LKP", 2);
    for (const varId of [2, 3, 4, 5, 6, 7, 8, 9]) {
      await expect(page.getByTestId(`col-grp-v${varId}`)).toHaveValue("BASE_SPD");
    }
    await expect(page.getByTestId("col-grpcond-v4")).toHaveValue('TOP_RESIN_CD == "F"');
    await expect(page.getByTestId("col-grpcond-v9")).toHaveValue(""); // GENERAL — 기본 열(열 조건 없음, 그룹의 마지막)
    await expect(page.getByTestId("col-dirty")).toHaveCount(0);

    await page.getByTestId("col-grpcond-v4").fill('TOP_RESIN_CD == "FL"');
    await expect(page.getByTestId("col-dirty")).toBeVisible();
    await expect(page.getByTestId("col-grpcond-v4-status")).toContainText("TOP_RESIN_CD", { timeout: 20_000 }); // 서버 파싱 결과의 참조 변수
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 0건");
    // 초안이 있으면 표 저장은 막힌다(불변 13).
    await expect(page.getByTestId("dt-col-block")).toContainText("열 설정 초안이 있어 표를 저장할 수 없습니다");
    await expect(page.getByRole("button", { name: "표 저장", exact: true })).toBeDisabled();

    await page.getByTestId("col-apply").click();
    await expect(page.getByTestId("col-dirty")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("col-grpcond-v4")).toHaveValue('TOP_RESIN_CD == "FL"');

    await reopen(page, "BASE_SPD_LKP");
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2");
    await expect(page.getByTestId("col-grpcond-v4")).toHaveValue('TOP_RESIN_CD == "FL"');
    await expect(page.getByTestId("col-grp-v9")).toHaveValue("BASE_SPD");
    await page.getByTestId("col-table").scrollIntoViewIfNeeded(); // 포털은 안쪽 영역이 스크롤되므로 이 섹션이 보이게 한 뒤 남긴다
    await page.screenshot({ path: screenshot03("dme-ruleEdit-cols-grp.png"), fullPage: true });
  });

  test("C2 피벗: E2E_PVT_LKP 가 피벗으로 보이고 셀·구간을 고쳐 저장하면 의사결정표 행과 일치하며 다시 불러와도 같다", async ({ page }) => {
    await openRuleVer(page, "E2E_PVT_LKP", 1);
    await expect(page.getByTestId("pivot-section")).toBeVisible();
    await expect(page.getByTestId("pivot-badge")).toHaveText("편집");
    await expect(page.getByTestId("pivot-col-2A")).toBeVisible();
    await expect(page.getByTestId("pivot-col-6A")).toBeVisible();
    const bands = page.getByTestId(/^pivot-band-/);
    await expect(bands).toHaveCount(7);
    const tableRows = page.locator('[data-testid^="dt-row-"]');
    const before = await tableRows.count();
    expect(before).toBeGreaterThanOrEqual(14);

    // 셀 하나 — 첫 구간(0~0.5) 열 2A 의 값.
    const cellInput = page.locator('input[data-pvc="1"][data-col="2A"]');
    await expect(cellInput).toHaveValue("100");
    await cellInput.fill("95");
    await cellInput.press("Enter");
    await expect(page.getByTestId("pivot-dirty")).toBeVisible();

    // 구간 추가 — 마지막 구간(row 13) 아래에 값을 복사한 구간이 생기고 하한·상한을 고친다.
    await page.locator('[data-pvadd="13"]').click();
    const added = page.locator('[data-testid^="pivot-band--"]');
    await expect(added).toHaveCount(1);
    const addedId = (await added.getAttribute("data-testid"))!.replace("pivot-band-", "");
    const lo = page.locator(`input[data-pvb="lo"][data-band="${addedId}"]`);
    await lo.fill("1.2");
    await lo.press("Enter");
    const hi = page.locator(`input[data-pvb="hi"][data-band="${addedId}"]`);
    await hi.fill("1.5");
    await hi.press("Enter");
    await page.locator(`select[data-pvb="lop"][data-band="${addedId}"]`).selectOption("<");
    await expect(bands).toHaveCount(8);

    await page.getByTestId("pivot-save").click();
    await expect(page.getByTestId("pivot-dirty")).toHaveCount(0, { timeout: 30_000 });
    await expect(bands).toHaveCount(8);
    // 평탄화 저장: 의사결정표 행이 구간 하나의 열 수(2)만큼 늘었다.
    await expect(tableRows).toHaveCount(before + 2);

    await reopen(page, "E2E_PVT_LKP");
    await expect(page.getByTestId("pivot-badge")).toHaveText("편집");
    await expect(page.getByTestId(/^pivot-band-/)).toHaveCount(8);
    await expect(page.locator('input[data-pvc="1"][data-col="2A"]')).toHaveValue("95");
    await expect(page.locator('input[data-pvc="1"][data-col="6A"]')).toHaveValue("100");
    await expect(page.locator('[data-testid^="dt-row-"]')).toHaveCount(before + 2);
    await page.getByTestId("pivot-table").scrollIntoViewIfNeeded(); // 포털은 안쪽 영역이 스크롤되므로 이 섹션이 보이게 한 뒤 남긴다
    await page.screenshot({ path: screenshot03("dme-ruleEdit-pivot.png"), fullPage: true });
  });

  test("C2b 피벗 표시만: 결과 열이 여럿인 BASE_SPD_LKP 는 피벗을 열지 않고 의사결정표에서 고친다", async ({ page }) => {
    await openRuleVer(page, "BASE_SPD_LKP", 2);
    await expect(page.getByTestId("pivot-section")).toHaveCount(0); // 결과 열 1개가 아니면 피벗이 보이지 않는다(pvSpec)
  });

  test("C2c 피벗·표 저장 상호 차단: 표 카드에 저장 안 한 행이 있으면 피벗 저장이, 피벗에 저장 안 한 편집이 있으면 표 저장이 막힌다", async ({ page }) => {
    await openRuleVer(page, "E2E_PVT_LKP", 1);
    await expect(page.getByTestId("pivot-section")).toBeVisible();
    await page.getByRole("button", { name: "행 추가", exact: true }).click();
    await expect(page.getByTestId("dt-dirty")).toBeVisible();

    const cellInput = page.locator('input[data-pvc="1"][data-col="2A"]');
    await cellInput.fill("94");
    await cellInput.press("Enter");
    await expect(page.getByTestId("pivot-dirty")).toBeVisible();
    await expect(page.getByTestId("pivot-save")).toBeDisabled();
    await expect(page.getByTestId("pivot-table-block")).toContainText("표 카드에 저장 안 한 변경이 있어");
    await expect(page.getByRole("button", { name: "표 저장", exact: true })).toBeDisabled();
    await expect(page.getByTestId("dt-pivot-block")).toContainText("피벗에 저장 안 한 변경이 있어");

    // 표를 되돌리면 피벗 쪽 차단이, 피벗을 되돌리면 표 쪽 차단이 풀린다(둘 다 저장하지 않는다).
    await page.getByRole("button", { name: "되돌리기", exact: true }).click();
    await expect(page.getByTestId("pivot-table-block")).toHaveCount(0);
    await expect(page.getByTestId("pivot-save")).toBeEnabled();
    await page.getByTestId("pivot-revert").click();
    await expect(page.getByTestId("pivot-dirty")).toHaveCount(0);
    await expect(page.getByTestId("dt-pivot-block")).toHaveCount(0);
  });

  test("C3 산출 룰: COIL_WGT_CALC 새 버전에서 앞 결과를 읽는 열은 되고 자기 참조는 거부되어 아무 것도 반영되지 않으며 식 미리보기가 25434.0 이다", async ({ page }) => {
    await openRule(page, STEWARD, "COIL_WGT_CALC");
    await page.getByRole("button", { name: "새 버전", exact: true }).click();
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2", { timeout: 20_000 });
    await expect(page.getByTestId("rule-section-columns")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dt-derive-notice")).toBeVisible();
    await expect(page.getByTestId("col-expr-v1")).toHaveValue("ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)");

    // 식 미리보기 — 서버 AST 를 화면 evalex 로 평가한다(케이스 1.8 × 1200 × 1500, 비중 7.85).
    await page.getByTestId("col-preview-input").fill("COIL_THK=1.8, COIL_WID=1200, COIL_LEN=1500, SPEC_GRAV=7.85");
    await expect(page.getByTestId("col-expr-v1-preview")).toContainText("25434", { timeout: 20_000 });
    await expect(page.getByTestId("col-expr-v1-preview")).toHaveText("= 25434.0");

    // 결과 열 추가 — 앞 결과 COIL_WGT 를 읽는 식은 허용된다.
    await page.getByTestId("col-add-result").click();
    await page.getByTestId("col-disp-n1").selectOption("Expression"); // 산출 룰의 결과 열은 식이다
    await page.getByTestId("col-name-n1").fill("COIL_WGT_X2");
    await page.getByTestId("col-label-n1").fill("2배 중량");
    await page.getByTestId("col-type-n1").selectOption("NUMBER");
    await page.getByTestId("col-expr-n1").fill("COIL_WGT * 2");
    await expect(page.getByTestId("col-expr-n1-status")).toContainText("COIL_WGT", { timeout: 20_000 });
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 0건");

    // 순서를 바꾸면 뒤 순서 결과를 읽게 되어 거부된다.
    await page.getByRole("button", { name: "COIL_WGT_X2 위로", exact: true }).click();
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 1건");
    await page.getByRole("button", { name: "COIL_WGT_X2 아래로", exact: true }).click();
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 0건");

    // 자기 참조 식은 거부되고 적용해도 아무 것도 반영하지 않는다(원자 적용).
    await page.getByTestId("col-expr-n1").fill("COIL_WGT_X2 * 2");
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 1건");
    await page.getByTestId("col-apply").click();
    await expect(page.getByTestId("col-apply-rejects")).toContainText("아무 것도 반영되지 않음");
    await expect(page.getByTestId("col-row-v1")).toBeVisible();

    // 고쳐서 적용한다.
    await page.getByTestId("col-expr-n1").fill("COIL_WGT * 2");
    await expect(page.getByTestId("col-reject-count")).toHaveText("거부 0건");
    await page.getByTestId("col-apply").click();
    await expect(page.getByTestId("col-dirty")).toHaveCount(0, { timeout: 30_000 });

    await reopen(page, "COIL_WGT_CALC");
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("2");
    await expect(page.getByTestId("col-expr-v1")).toHaveValue("ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)");
    // 새 열은 카운터에서 발급된 var_id(2)로 저장되고 식이 남는다.
    await expect(page.getByTestId("col-expr-v2")).toHaveValue("COIL_WGT * 2");
    await expect(page.getByTestId("col-name-v2")).toHaveValue("COIL_WGT_X2");
    await page.getByTestId("col-preview-input").fill("COIL_THK=1.8, COIL_WID=1200, COIL_LEN=1500, SPEC_GRAV=7.85");
    await expect(page.getByTestId("col-expr-v1-preview")).toHaveText("= 25434.0", { timeout: 20_000 });
    await page.getByTestId("col-table").scrollIntoViewIfNeeded(); // 포털은 안쪽 영역이 스크롤되므로 이 섹션이 보이게 한 뒤 남긴다
    await page.screenshot({ path: screenshot03("dme-ruleEdit-derive.png"), fullPage: true });
  });

  test("C4 조건별 수식: PROD_WGT_CALC v2 의 행마다 다른 결과 식이 그리드에, 조건 열이 열 설정에 보이고 DRAFT 식에 COALESCE(SPEC_GRAV, 7.85) 가 있다", async ({ page }) => {
    await openRuleVer(page, "PROD_WGT_CALC", 2);
    for (const rowId of [1, 2, 3]) await expect(page.getByTestId(`dt-row-${rowId}`)).toBeVisible();
    await expect(grid(page).locator('.ag-center-cols-container .ag-row[row-id="1"]')).toContainText("COALESCE(SPEC_GRAV, 7.85)");
    await expect(grid(page).locator('.ag-center-cols-container .ag-row[row-id="2"]')).toContainText("SHEET_CNT");
    await expect(grid(page).locator('.ag-center-cols-container .ag-row[row-id="3"]')).toContainText("COIL_OUT_DIA");
    await expect(page.getByTestId("col-name-v1")).toHaveValue("PROD_TYPE");
    await expect(page.getByTestId("col-name-v3")).toHaveValue("CALC_BASIS");
    await expect(page.getByTestId("col-name-v2")).toHaveValue("PROD_WGT");
    await page.getByTestId("col-table").scrollIntoViewIfNeeded(); // 포털은 안쪽 영역이 스크롤되므로 이 섹션이 보이게 한 뒤 남긴다
    await page.screenshot({ path: screenshot03("dme-ruleEdit-formula.png"), fullPage: true });
  });

  test("C5 입력 계약: PROD_WGT_CALC v2 는 행별 필수 입력 묶음 3줄이고 SPEC_GRAV 가 필수에서 선택이 된 것을 RELEASED 대비 알림으로 보인다", async ({ page }) => {
    await openRuleVer(page, "PROD_WGT_CALC", 2);
    await expect(page.getByTestId("contract-section")).toBeVisible();
    await expect(page.getByTestId("contract-always")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(/^contract-group-\d+$/)).toHaveCount(3);
    await expect(page.getByTestId("contract-diff-info")).toContainText("필수 입력이 선택이 되었습니다: SPEC_GRAV");
    await expect(page.getByTestId("contract-diff-warning")).toHaveCount(0);
    await expect(page.getByTestId("contract-warning-count")).toHaveText("RELEASED 대비 경고 0건");
    await page.getByTestId("contract-section").scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot03("dme-ruleEdit-contract.png"), fullPage: true });
  });

  test("C6 도메인 검색·식 검사: SPEED 로 찾으면 8건 이내에 SPEED_MPM 이 있고 화이트리스트 밖 함수는 서버 평가로 넘긴다고 표시된다", async ({ page }) => {
    await openRuleVer(page, "PROD_WGT_CALC", 2);
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

    // 조건 열을 식(Expression)으로 바꿔 화이트리스트 밖 함수를 적는다.
    await page.getByTestId("col-add-cond").click();
    await page.getByTestId("col-disp-n1").selectOption("Expression");
    await page.getByTestId("col-name-n1").fill('MASTER("PORT", "ALL", SURF_GRD)');
    await expect(page.getByTestId("col-name-n1-status")).toContainText("서버 평가로 넘긴다", { timeout: 20_000 });
    await page.getByTestId("col-discard").click();
    await expect(page.getByTestId("col-dirty")).toHaveCount(0);
  });
});
