import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * mdm dme/ruleSetEdit(룰 세트 편집) — TSK-08-06 design.md §3.4.2.
 *
 * 스모크 넷: E1 메뉴 이동, E2 서버 데이터(목록·의존 룰·입출력 표·검사), E5 수정 한 번(저장·다시 불러와도 유지), E8 서버 오류(MDM001).
 * 고유: E3 순서 편집(▼·드래그)·뒤에 있음·즉시 재계산·dirty 확인, E4 수용 3 순환 저장 거부, E5 수용 4 중복 대입 경고,
 * E6 구성 지침 → 위상 정렬 제안 → 목록 적용, E7 폐기·되살리기, E9 권한(READ), E10 룰 링크.
 *
 * 전제(design.md 「E2E 서버 절차」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고,
 * mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-ruleSet-data.sql 을 넣는다.
 * 세트를 고치므로 같은 mdm.db 로 다시 돌릴 수 없다(새 DB 로 시작). 편집 시나리오는 SYSADMIN 이 아니라 담당자로 로그인한다.
 * mdm-ruleSetMng.spec.ts 와 서로의 데이터에 기대지 않는다(각자 픽스처의 다른 세트를 쓴다).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const DIRTY_CONFIRM = "저장하지 않은 변경이 있습니다. 버리고 이동할까요?";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-06/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
}

function menuItem(page: Page, text: RegExp) {
  return page.locator(".tree-item .item-name").filter({ hasText: text }).first();
}

/** 메뉴 트리를 따라 연다. 하위 항목이 이미 보이면 상위를 누르지 않는다(누르면 접힌다). */
async function openMenu(page: Page, leaf: RegExp) {
  const path = [/^마루 MDM$/, /^업무기준$/, leaf];
  for (let i = 0; i < path.length; i++) {
    const item = menuItem(page, path[i]);
    await expect(item).toBeVisible({ timeout: 20_000 });
    if (i < path.length - 1 && (await menuItem(page, path[i + 1]).isVisible())) continue;
    await item.click();
  }
}

async function openRuleSetEdit(page: Page) {
  await openMenu(page, /^룰 세트 편집$/);
  await expect(page.getByTestId("set-pick-keyword")).toBeVisible({ timeout: 60_000 });
}

/** 상단 바에서 세트를 찾아 고른다. dirty 면 확인 대화상자가 뜨므로 대화상자 처리는 호출자가 먼저 건다. */
async function clickPick(page: Page, setId: string) {
  await page.getByTestId("set-pick-keyword").fill(setId);
  await page.getByTestId("set-edit-topbar").getByRole("button", { name: "찾기" }).click();
  await page.getByTestId(`set-pick-${setId}`).click();
}

async function pickSet(page: Page, setId: string) {
  await clickPick(page, setId);
  await expect(page.getByTestId("set-edit-current")).toContainText(setId, { timeout: 30_000 });
  await expect(page.getByTestId("set-card-id")).toHaveText(setId);
}

function grid(page: Page) {
  return page.getByTestId("set-rules-grid");
}

function ruleAt(page: Page, index: number) {
  return grid(page).locator(`.ag-row[row-index="${index}"] [col-id="ruleId"]`);
}

function ruleRow(page: Page, ruleId: string) {
  return grid(page).locator(".ag-row", { has: page.getByTestId(`set-rule-link-${ruleId}`) });
}

async function expectOrder(page: Page, ids: string[]) {
  for (let i = 0; i < ids.length; i++) await expect(ruleAt(page, i)).toHaveText(ids[i], { timeout: 20_000 });
  await expect(grid(page).locator(".ag-row")).toHaveCount(ids.length);
}

async function addRule(page: Page, keyword: string, ruleIds: string[]) {
  await page.getByTestId("set-rule-add-keyword").fill(keyword);
  await page.getByTestId("set-rule-add-find").click();
  for (const id of ruleIds) await page.getByTestId(`set-rule-cand-${id}`).click();
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dme/ruleSetEdit", () => {
  test.setTimeout(180_000);

  test("E1 메뉴: 마루 MDM > 업무기준 > 룰 세트 편집 이 열리고 세트 고르기 칸과 빈 상태가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await expect(page.locator(".page-layout__title:visible", { hasText: /^룰 세트 편집$/ })).toBeVisible();
    await expect(page.getByTestId("set-edit-empty")).toHaveText("세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다");
  });

  test("E2 서버 데이터: E2S_CHAIN 의 목록·의존 룰·입출력 표·검사가 서버 값으로 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expect(page.getByTestId("set-status")).toHaveText("INUSE");
    await expectOrder(page, ["E2S_GRD", "E2S_FCT", "E2S_SPD"]);
    const grd = ruleRow(page, "E2S_GRD");
    await expect(grd.locator('[col-id="ruleName"]')).toHaveText("E2S 등급");
    await expect(grd.locator('[col-id="kindPolicy"]')).toHaveText("DECISION · FIRST");
    await expect(ruleRow(page, "E2S_FCT").locator('[col-id="deps"]')).toContainText("E2S_GRD");
    await expect(page.getByTestId("set-dep-later-E2S_FCT-E2S_GRD")).toHaveCount(0);
    // 기본 폭(1280)에서도 의존 룰·동작 열이 카드 안에 보인다(열은 fit + minWidth 로 줄어든다).
    // 세 버튼이 동작 칸 안에 잘리지 않고 들어간다(칸 밖으로 넘치면 ag-grid 가 말줄임으로 가린다).
    const actionCell = ruleRow(page, "E2S_SPD").locator('[col-id="actions"]');
    const cellBox = await actionCell.boundingBox();
    for (const testId of ["set-rule-up-E2S_SPD", "set-rule-down-E2S_SPD", "set-rule-remove-E2S_SPD"]) {
      const button = page.getByTestId(testId);
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box && cellBox && box.x + box.width <= cellBox.x + cellBox.width).toBe(true);
    }
    await expect(ruleRow(page, "E2S_SPD").locator('[col-id="deps"]')).toBeVisible();

    const inputs = page.getByTestId("set-io-inputs");
    await expect(inputs.locator("tbody tr")).toHaveCount(3);
    for (const name of ["SET_THK", "SET_SURF", "SET_WID"]) {
      await expect(page.getByTestId(`set-io-input-${name}`)).toContainText("컬럼 사전");
    }
    await expect(page.getByTestId("set-io-result-S_SPD")).toContainText("최종");
    await expect(page.getByTestId("set-io-result-S_GRD")).toContainText("중간");
    await expect(page.getByTestId("set-io-result-S_FCT")).toContainText("중간");
    await expect(page.getByTestId("set-checks")).toContainText("통과");
    await expect(page.getByTestId("set-check-0")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-chain.png"), fullPage: true });
  });

  test("E3 순서 편집: ▼ 뒤 즉시 재계산(뒤에 있음·어디에도 없음·ORDER 거부), dirty 확인, 드래그로 되돌리면 거부가 사라진다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expectOrder(page, ["E2S_GRD", "E2S_FCT", "E2S_SPD"]);

    await page.getByTestId("set-rule-down-E2S_GRD").click();
    await expectOrder(page, ["E2S_FCT", "E2S_GRD", "E2S_SPD"]);
    await expect(page.getByTestId("set-dep-later-E2S_FCT-E2S_GRD")).toHaveText("뒤에 있음");
    await expect(page.getByTestId("set-io-input-S_GRD")).toContainText("어디에도 없음");
    await expect(page.getByTestId("set-checks")).toContainText(
      "E2S_FCT가 뒤에 도는 E2S_GRD의 결과 변수 S_GRD를 읽는다. E2S_GRD를 E2S_FCT 앞으로 옮긴다",
    );
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-reorder.png"), fullPage: true });

    // 저장하지 않고 다른 세트로 가려 하면 dirty 확인이 뜬다 — 취소하면 그대로 남는다.
    // (dirty 는 불러온 목록과 비교해 정하므로, 드래그로 원래 순서에 되돌리기 전에 본다.)
    // window.confirm 은 처리될 때까지 클릭을 붙잡으므로 대화상자 처리기를 먼저 걸고 그 안에서 닫는다.
    const seen: { type: string; message: string }[] = [];
    page.once("dialog", (dlg) => {
      seen.push({ type: dlg.type(), message: dlg.message() });
      void dlg.dismiss();
    });
    await clickPick(page, "E2S_CYCSET");
    await expect.poll(() => seen).toEqual([{ type: "confirm", message: DIRTY_CONFIRM }]);
    await expect(page.getByTestId("set-card-id")).toHaveText("E2S_CHAIN");
    await expectOrder(page, ["E2S_FCT", "E2S_GRD", "E2S_SPD"]);

    // 드래그 손잡이로 E2S_GRD(2행)를 맨 위로 끌어 놓는다 — ag-grid managed drag 는 마우스 이벤트로 움직인다.
    const handle = grid(page).locator('.ag-row[row-index="1"] .ag-row-drag');
    const target = grid(page).locator('.ag-row[row-index="0"]');
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("드래그 손잡이 또는 대상 행을 찾지 못했다");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 6, { steps: 5 });
    await page.mouse.move(to.x + from.width / 2, to.y + 3, { steps: 15 });
    await page.mouse.up();
    await expectOrder(page, ["E2S_GRD", "E2S_FCT", "E2S_SPD"]);
    await expect(page.getByTestId("set-dep-later-E2S_FCT-E2S_GRD")).toHaveCount(0);
    await expect(page.getByTestId("set-io-input-S_GRD")).toHaveCount(0);
    await expect(page.getByTestId("set-checks")).toContainText("통과");
  });

  test("E4 수용 3: 순환이 생기면 즉시 거부가 보이고, 저장하면 서버가 MDM024 로 거부하며 행은 그대로다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CYCSET");
    await expectOrder(page, ["E2S_GRD"]);
    await addRule(page, "E2S_CY", ["E2S_CYA", "E2S_CYB"]);
    await expectOrder(page, ["E2S_GRD", "E2S_CYA", "E2S_CYB"]);
    await expect(page.getByTestId("set-checks")).toContainText("E2S_CYA와 E2S_CYB가 서로의 결과 변수를 읽는다(순환)");

    await page.getByTestId("set-save").click();
    const message = page.getByTestId("set-message");
    await expect(message).toContainText("룰 세트 저장 검사를 통과하지 못했습니다", { timeout: 20_000 });
    await expect(message).toContainText("CYCLE");
    await expect(message).toContainText("(순환)");
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-cycle.png"), fullPage: true });

    // 다시 불러오면 저장된 목록 그대로다 — 편집 중 목록은 dirty 라 확인을 받아들인다.
    page.once("dialog", (dlg) => void dlg.accept());
    await pickSet(page, "E2S_CYCSET");
    await expectOrder(page, ["E2S_GRD"]);
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 0");
  });

  test("E5 수용 4: 같은 결과 변수 중복 대입은 경고이고, 세트명을 고쳐 저장하면 경고와 함께 저장된다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CYCSET");
    await addRule(page, "E2S_DUP", ["E2S_DUP"]);
    await expectOrder(page, ["E2S_GRD", "E2S_DUP"]);
    const warn = "E2S_GRD와 E2S_DUP가 같은 결과 변수 S_GRD에 대입한다";
    await expect(page.getByTestId("set-checks")).toContainText(warn);
    await expect(page.getByTestId("set-io-result-S_GRD")).toContainText("덮어씀");

    await page.getByTestId("set-name").fill("E2E 순환 세트(수정)");
    await page.getByTestId("set-save").click();
    const message = page.getByTestId("set-message");
    await expect(message).toContainText("저장 · row_version 1", { timeout: 20_000 });
    await expect(message).toContainText(warn);
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 1");
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-warn.png"), fullPage: true });

    page.once("dialog", (dlg) => void dlg.accept());
    await pickSet(page, "E2S_CYCSET");
    await expectOrder(page, ["E2S_GRD", "E2S_DUP"]);
    await expect(page.getByTestId("set-name")).toHaveValue("E2E 순환 세트(수정)");
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 1");
  });

  test("E6 구성 지침: S_SPD 의 위상 정렬 제안을 목록에 적용해 저장하고, 순환이면 오류가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_GUIDESET");
    await expect(page.getByTestId("set-rules-empty")).toBeVisible();

    await page.getByTestId("set-guide-var").fill("S_SPD");
    await page.getByTestId("set-guide-run").click();
    const order = page.getByTestId("set-guide-order");
    await expect(order).toContainText("제안 순서 · 1. E2S_DUP → 2. E2S_FCT → 3. E2S_SPD", { timeout: 20_000 });
    await expect(order).toContainText("S_GRD: E2S_DUP, E2S_GRD");
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-guide.png"), fullPage: true });

    await page.getByTestId("set-guide-apply").click();
    await expectOrder(page, ["E2S_DUP", "E2S_FCT", "E2S_SPD"]);
    await expect(page.getByTestId("set-io-result-S_SPD")).toContainText("최종");
    await expect(page.getByTestId("set-io-result-S_GRD")).toContainText("중간");
    await expect(page.getByTestId("set-checks")).toContainText("통과");
    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-message")).toContainText("저장 · row_version 1", { timeout: 20_000 });

    await page.getByTestId("set-guide-var").fill("S_CYA");
    await page.getByTestId("set-guide-run").click();
    await expect(page.getByTestId("set-guide-error")).toContainText("순환이 있다(", { timeout: 20_000 });
  });

  test("E7 폐기·되살리기: DEPRECATED 세트는 되살리기만 되고, 되살린 뒤 두 단계로 다시 폐기한다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_OLDSET");
    await expect(page.getByTestId("set-status")).toHaveText("DEPRECATED");
    await expect(page.getByTestId("set-name")).toBeDisabled();
    await expect(page.getByTestId("set-desc")).toBeDisabled();
    await expect(page.getByTestId("set-rule-add-keyword")).toBeDisabled();
    await expect(page.getByTestId("set-rule-add-find")).toBeDisabled();
    await expect(page.getByTestId("set-save")).toBeDisabled();
    await expect(page.getByTestId("set-rule-down-E2S_GRD")).toHaveCount(0);
    await expect(page.getByTestId("set-deprecate")).toHaveCount(0);

    await page.getByTestId("set-restore").click();
    await expect(page.getByTestId("set-status")).toHaveText("INUSE", { timeout: 20_000 });
    await expect(page.getByTestId("set-message")).toContainText("되살림 · row_version 1");

    await page.getByTestId("set-deprecate").click();
    await expect(page.getByTestId("set-message")).toContainText("폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.");
    await expect(page.getByTestId("set-deprecate-confirm")).toBeVisible();
    await expect(page.getByTestId("set-card").getByRole("button", { name: "취소", exact: true })).toBeVisible();
    await expect(page.getByTestId("set-status")).toHaveText("INUSE");
    await page.getByTestId("set-deprecate-confirm").click();
    await expect(page.getByTestId("set-status")).toHaveText("DEPRECATED", { timeout: 20_000 });
    await expect(page.getByTestId("set-message")).toContainText("폐기 · row_version 2");
    await expect(page.getByTestId("set-restore")).toBeVisible();
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-deprecated.png"), fullPage: true });
  });

  test("E8 서버 오류: 저장이 MDM001 로 실패하면 충돌 안내와 다시 불러오기가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await page.route("**/api/mdm/oasis/ruleSetEdit/save", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          meta: { success: false, code: "MDM001", message: "다른 사용자가 수정했습니다. 다시 불러오세요 (MDM001)" },
          data: {},
        }),
      }),
    );
    await page.getByTestId("set-name").fill("E2E 사슬 세트(충돌)");
    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-message")).toContainText("다른 창에서 바뀌었습니다. 다시 불러오세요", { timeout: 20_000 });
    const reload = page.getByTestId("set-card").getByRole("button", { name: "다시 불러오기" });
    await expect(reload).toBeVisible();
    await page.unroute("**/api/mdm/oasis/ruleSetEdit/save");

    await reload.click();
    await expect(page.getByTestId("set-name")).toHaveValue("E2E 사슬 세트", { timeout: 20_000 });
    await expect(reload).toHaveCount(0);
  });

  test("E9 권한: 표준 관리자(READ)는 세트를 보지만 저장·폐기·룰 추가·지침 적용이 비활성이다", async ({ page }) => {
    await login(page, STDADMIN);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expectOrder(page, ["E2S_GRD", "E2S_FCT", "E2S_SPD"]);
    await expect(page.getByTestId("set-name")).toBeDisabled();
    await expect(page.getByTestId("set-save")).toBeDisabled();
    await expect(page.getByTestId("set-deprecate")).toBeDisabled();
    await expect(page.getByTestId("set-rule-add-find")).toBeDisabled();
    await expect(page.getByTestId("set-rule-down-E2S_GRD")).toHaveCount(0);

    // 지침 찾기는 READ 로 되고, 적용 버튼만 막힌다.
    await page.getByTestId("set-guide-var").fill("S_SPD");
    await page.getByTestId("set-guide-run").click();
    await expect(page.getByTestId("set-guide-order")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("set-guide-apply")).toBeDisabled();
  });

  test("E10 룰 링크: 목록의 룰 ID 를 누르면 룰 화면 탭이 그 룰로 열린다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await page.getByTestId("set-rule-link-E2S_GRD").click();
    await expect(page.getByTestId("rule-edit-current")).toHaveText("E2S_GRD", { timeout: 60_000 });
  });
});
