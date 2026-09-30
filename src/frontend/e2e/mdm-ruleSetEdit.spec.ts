import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * mdm dme/ruleSetEdit(룰 세트 편집 — 흐름도 캔버스·디버거) — TSK-08-06 design.md §3.4.2 + 룰 세트 흐름도 2단계(Task 12).
 *
 * 스모크 넷: E1 메뉴 이동, E2 서버 데이터(캔버스 노드·입출력 표·검사), E5 수정 한 번(저장·다시 불러와도 유지), E8 서버 오류(MDM001).
 * 고유: E3 캔버스 편집(IF 끼우기 → 거부로 저장 꺼짐 → 조건식 → 저장 켜짐)·dirty 확인, E4 순환은 즉시 거부되고 저장이 꺼진다(P-D4),
 * E5 수용 4 중복 대입 경고, E6 구성 지침 → 제안 순서 적용 → 저장 → 다시 열어 순서 유지, E7 폐기·되살리기, E9 권한(READ),
 * E10 속성 패널의 룰 편집 열기, E11 디버거(시뮬레이션 실행·따라가기·값 표), E12 룰 박스 링크 아이콘과 박스 누르기.
 *
 * 전제(design.md 「E2E 서버 절차」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고,
 * mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-ruleSet-data.sql 을 넣는다.
 * 세트를 고치므로 같은 mdm.db 로 다시 돌릴 수 없다(새 DB 로 시작). 편집 시나리오는 SYSADMIN 이 아니라 담당자로 로그인한다.
 * mdm-ruleSetMng.spec.ts 와 서로의 데이터에 기대지 않는다(각자 픽스처의 다른 세트를 쓴다).
 *
 * 화면 구조: 세트를 열면 보기 모드다. 고치려면 [편집](flow-mode-edit)을 누른다. 캔버스 노드는 `flow-node-{nodeId}`,
 * 한 줄 세트(FLOW_JSON 없음)는 start · r1 … rN · end 의 노드 ID 로 그려진다(linearFlow). 노드를 누르면 오른쪽이 속성 패널이 되고
 * 세트명·입출력 표·지침(세트 패널)은 선택이 없을 때만 보인다 — 세트 패널을 쓰는 단계는 노드를 고르기 전에 한다.
 * 저장은 편집 모드에서 dirty 이고 거부(REJECT) 검사가 없을 때만 된다 — 서버 MDM024 거부 경로는 서버 테스트가 맡는다.
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

/** 세트 입출력 표(AgDataGrid)의 한 행 — 행 키는 변수명이다. kind: inputs(입력 변수) | results(결과 변수). 세트 패널(선택 없음)에 있다. */
const ioRow = (page: Page, kind: "inputs" | "results", name: string): Locator =>
  page.getByTestId(`set-io-${kind}`).locator(`.ag-center-cols-container .ag-row[row-id="${name}"]`);

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

/** 캔버스에 그려진 흐름 노드(시작·끝·룰·IF·병렬·합류). 뱃지·칩·링크 아이콘은 data-kind 가 없어 세지 않는다. */
const flowNodes = (page: Page): Locator => page.getByTestId("flow-canvas").locator("[data-kind]");
const ruleNodes = (page: Page): Locator => page.getByTestId("flow-canvas").locator('[data-kind="RULE"]');

/** 노드 하나가 그 룰이다(노드 안에 룰 ID 가 보인다). */
async function expectRuleNode(page: Page, nodeId: string, ruleId: string) {
  await expect(page.getByTestId(`flow-node-${nodeId}`)).toContainText(ruleId, { timeout: 20_000 });
}

/** 한 줄 흐름(노드 ID r1 … rN)의 룰 순서를 확인한다. */
async function expectChain(page: Page, ids: string[]) {
  for (let i = 0; i < ids.length; i++) await expectRuleNode(page, `r${i + 1}`, ids[i]);
  await expect(ruleNodes(page)).toHaveCount(ids.length);
}

async function enterEditMode(page: Page) {
  await page.getByTestId("flow-mode-edit").click();
  await expect(page.getByTestId("flow-palette")).toBeVisible();
}

/** 팔레트 [룰] → 룰 찾기 팝업 → 후보를 눌러 끼운다. 끼울 선을 고르지 않았으면 END 로 들어가는 선에 끼워진다. */
async function addRule(page: Page, keyword: string, ruleIds: string[]) {
  for (const id of ruleIds) {
    await page.getByTestId("flow-add-rule").click();
    await page.getByTestId("flow-rule-search-keyword").fill(keyword);
    await page.getByTestId("flow-rule-search-find").click();
    await page.getByTestId(`flow-rule-cand-${id}`).click();
  }
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

  test("E2 서버 데이터: E2S_CHAIN 의 캔버스 노드·변수 흐름·입출력 표·검사가 서버 값으로 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expect(page.getByTestId("set-status")).toHaveText("INUSE");

    // 세트를 열면 보기 모드다 — 팔레트가 없고, 노드 5개(시작 · 룰 셋 · 끝)가 그려진다.
    await expect(page.getByTestId("flow-mode-view")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("flow-palette")).toHaveCount(0);
    await expect(flowNodes(page)).toHaveCount(5, { timeout: 20_000 });
    await expect(page.getByTestId("flow-node-start")).toContainText("시작");
    await expect(page.getByTestId("flow-node-end")).toContainText("끝");
    await expectChain(page, ["E2S_GRD", "E2S_FCT", "E2S_SPD"]);
    await expect(page.getByTestId("flow-node-r1")).toContainText("E2S 등급");
    await expect(page.getByTestId("flow-node-r1")).toContainText("DECISION · FIRST");

    // 변수 흐름을 켜면 룰 박스에서 나가는 선에 그 룰의 결과 변수 칩이 붙는다(r1 → r2 는 e2).
    await page.getByTestId("flow-var-toggle").click();
    await expect(page.getByTestId("flow-edge-chips-e2")).toContainText("S_GRD");

    // 세트 패널(선택 없음)의 입출력 표.
    const inputs = page.getByTestId("set-io-inputs");
    await expect(inputs.locator(".ag-center-cols-container .ag-row")).toHaveCount(3);
    for (const name of ["SET_THK", "SET_SURF", "SET_WID"]) {
      await expect(ioRow(page, "inputs", name)).toContainText("컬럼 사전");
    }
    await expect(ioRow(page, "results", "S_SPD")).toContainText("최종");
    await expect(ioRow(page, "results", "S_GRD")).toContainText("중간");
    await expect(ioRow(page, "results", "S_FCT")).toContainText("중간");
    await expect(page.getByTestId("set-checks")).toContainText("통과");
    await expect(page.getByTestId("set-check-0")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-chain.png"), fullPage: true });
  });

  test("E3 캔버스 편집: END 앞에 IF 를 끼우면 조건식 없음 거부로 저장이 꺼지고, 조건식을 넣으면 켜지며, dirty 확인이 뜬다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expect(flowNodes(page)).toHaveCount(5, { timeout: 20_000 });

    // 고치지 않았으면 편집 모드여도 저장이 꺼져 있다(dirty 아님).
    await enterEditMode(page);
    await expect(page.getByTestId("set-save")).toBeDisabled();

    // 고른 선이 없으면 END 로 들어가는 선(e4)에 끼운다 — IF if1 · 합류 m1, 새 갈래 e5(조건식 칸)·e6(그 외).
    await page.getByTestId("flow-add-if").click();
    await expect(page.getByTestId("flow-node-if1")).toBeVisible();
    await expect(page.getByTestId("flow-node-m1")).toBeVisible();
    await expect(flowNodes(page)).toHaveCount(7);
    await expect(page.getByTestId("set-checks")).toContainText("갈래 e5에 조건식이 없다");
    await expect(page.getByTestId("set-save")).toBeDisabled();
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-if-reject.png"), fullPage: true });

    // 새 IF 가 선택돼 있어 오른쪽이 속성 패널이다. 조건식을 넣으면 서버가 변수 정의를 확인(validate)한 뒤 저장이 켜진다.
    await page.getByTestId("flow-prop-branch-e5-cond").fill('S_GRD = "A"');
    await expect(page.getByTestId("set-save")).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByTestId("set-checks")).not.toContainText("갈래 e5에 조건식이 없다");

    // 저장하지 않고 다른 세트로 가려 하면 dirty 확인이 뜬다 — 취소하면 그대로 남는다.
    // window.confirm 은 처리될 때까지 클릭을 붙잡으므로 대화상자 처리기를 먼저 걸고 그 안에서 닫는다.
    const seen: { type: string; message: string }[] = [];
    page.once("dialog", (dlg) => {
      seen.push({ type: dlg.type(), message: dlg.message() });
      void dlg.dismiss();
    });
    await clickPick(page, "E2S_CYCSET");
    await expect.poll(() => seen).toEqual([{ type: "confirm", message: DIRTY_CONFIRM }]);
    await expect(page.getByTestId("set-card-id")).toHaveText("E2S_CHAIN");
    await expect(page.getByTestId("flow-node-if1")).toBeVisible();
  });

  test("E4 수용 3: 순환이 생기면 즉시 거부가 보이고 저장이 꺼지며, 저장하지 않고 다시 불러오면 저장된 흐름 그대로다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CYCSET");
    await expectChain(page, ["E2S_GRD"]);
    await enterEditMode(page);
    await addRule(page, "E2S_CY", ["E2S_CYA", "E2S_CYB"]);
    await expectRuleNode(page, "r2", "E2S_CYA");
    await expectRuleNode(page, "r3", "E2S_CYB");
    await expect(page.getByTestId("set-checks")).toContainText("E2S_CYA와 E2S_CYB가 서로의 결과 변수를 읽는다(순환)");
    // 거부(REJECT) 검사가 있으면 저장 버튼이 꺼진다(P-D4). 서버의 MDM024 거부는 서버 테스트가 확인한다.
    await expect(page.getByTestId("set-save")).toBeDisabled();
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-cycle.png"), fullPage: true });

    // 다시 불러오면 저장된 흐름 그대로다 — 편집 중 흐름은 dirty 라 확인을 받아들인다.
    page.once("dialog", (dlg) => void dlg.accept());
    await pickSet(page, "E2S_CYCSET");
    await expectChain(page, ["E2S_GRD"]);
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 0");
  });

  test("E5 수용 4: 같은 결과 변수 중복 대입은 경고이고, 세트명을 고쳐 저장하면 경고와 함께 저장된다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CYCSET");
    await enterEditMode(page);
    // 세트명은 세트 패널(노드를 고르기 전)에서만 고친다. 룰을 끼우면 새 노드가 선택돼 오른쪽이 속성 패널이 된다.
    await page.getByTestId("set-name").fill("E2E 순환 세트(수정)");
    await addRule(page, "E2S_DUP", ["E2S_DUP"]);
    await expectChain(page, ["E2S_GRD", "E2S_DUP"]);
    const warn = "E2S_GRD와 E2S_DUP가 같은 결과 변수 S_GRD에 대입한다";
    await expect(page.getByTestId("set-checks")).toContainText(warn);

    // 경고만 있으면 저장된다.
    await expect(page.getByTestId("set-save")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("set-save").click();
    const message = page.getByTestId("set-message");
    await expect(message).toContainText("저장 · row_version 1", { timeout: 20_000 });
    await expect(message).toContainText(warn);
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 1");
    // 저장하면 서버가 돌려준 정규 흐름으로 다시 불러오고 보기 모드로 돌아간다.
    await expect(page.getByTestId("flow-mode-view")).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-warn.png"), fullPage: true });

    // 다른 세트를 거쳐 다시 열면(선택이 풀려 세트 패널이 보인다) 저장된 흐름·세트명·덮어씀 표시가 유지된다.
    await pickSet(page, "E2S_CHAIN");
    await pickSet(page, "E2S_CYCSET");
    await expectChain(page, ["E2S_GRD", "E2S_DUP"]);
    await expect(page.getByTestId("set-name")).toHaveValue("E2E 순환 세트(수정)");
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 1");
    await expect(ioRow(page, "results", "S_GRD")).toContainText("덮어씀");
  });

  test("E6 구성 지침: S_SPD 의 위상 정렬 제안을 흐름에 적용해 저장하고 다시 열어도 순서가 유지되며, 순환이면 오류가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_GUIDESET");
    // 빈 세트는 시작 → 끝만 그려진다.
    await expect(flowNodes(page)).toHaveCount(2, { timeout: 20_000 });
    await expect(ruleNodes(page)).toHaveCount(0);

    await page.getByTestId("set-guide-var").fill("S_SPD");
    await page.getByTestId("set-guide-run").click();
    const order = page.getByTestId("set-guide-order");
    await expect(order).toContainText("제안 순서 · 1. E2S_DUP → 2. E2S_FCT → 3. E2S_SPD", { timeout: 20_000 });
    await expect(order).toContainText("S_GRD: E2S_DUP, E2S_GRD");
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-guide.png"), fullPage: true });

    // 보기 모드에서는 적용이 꺼져 있다. 편집 모드에서 적용하면 한 줄 흐름(r1 … r3)으로 바뀐다.
    await expect(page.getByTestId("set-guide-apply")).toBeDisabled();
    await enterEditMode(page);
    await page.getByTestId("set-guide-apply").click();
    await expectChain(page, ["E2S_DUP", "E2S_FCT", "E2S_SPD"]);
    await expect(ioRow(page, "results", "S_SPD")).toContainText("최종");
    await expect(ioRow(page, "results", "S_GRD")).toContainText("중간");
    await expect(page.getByTestId("set-checks")).toContainText("통과");
    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-message")).toContainText("저장 · row_version 1", { timeout: 20_000 });

    // 다른 세트를 거쳐 다시 열어도 저장한 순서가 그대로다.
    await pickSet(page, "E2S_CHAIN");
    await pickSet(page, "E2S_GUIDESET");
    await expectChain(page, ["E2S_DUP", "E2S_FCT", "E2S_SPD"]);
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 1");

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
    await expect(page.getByTestId("flow-mode-edit")).toBeDisabled();
    await expect(page.getByTestId("flow-palette")).toHaveCount(0);
    await expect(page.getByTestId("set-save")).toBeDisabled();
    await expect(page.getByTestId("set-deprecate")).toHaveCount(0);

    await page.getByTestId("set-restore").click();
    await expect(page.getByTestId("set-status")).toHaveText("INUSE", { timeout: 20_000 });
    await expect(page.getByTestId("set-message")).toContainText("되살림 · row_version 1");

    await page.getByTestId("set-deprecate").click();
    await expect(page.getByTestId("set-message")).toContainText("폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.");
    await expect(page.getByTestId("set-deprecate-confirm")).toBeVisible();
    await expect(page.getByTestId("set-deprecate-cancel")).toBeVisible();
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
    await enterEditMode(page);
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
    const reload = page.getByTestId("set-reload");
    await expect(reload).toBeVisible();
    await page.unroute("**/api/mdm/oasis/ruleSetEdit/save");

    await reload.click();
    await expect(page.getByTestId("set-name")).toHaveValue("E2E 사슬 세트", { timeout: 20_000 });
    await expect(reload).toHaveCount(0);
  });

  test("E9 권한: 표준 관리자(READ)는 세트를 보지만 편집·저장·폐기·지침 적용·디버거 실행이 비활성이다", async ({ page }) => {
    await login(page, STDADMIN);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expectChain(page, ["E2S_GRD", "E2S_FCT", "E2S_SPD"]);
    await expect(page.getByTestId("flow-mode-edit")).toBeDisabled();
    await expect(page.getByTestId("flow-palette")).toHaveCount(0);
    await expect(page.getByTestId("set-name")).toBeDisabled();
    await expect(page.getByTestId("set-save")).toBeDisabled();
    await expect(page.getByTestId("set-deprecate")).toBeDisabled();

    // 지침 찾기는 READ 로 되고, 적용 버튼만 막힌다.
    await page.getByTestId("set-guide-var").fill("S_SPD");
    await page.getByTestId("set-guide-run").click();
    await expect(page.getByTestId("set-guide-order")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("set-guide-apply")).toBeDisabled();

    // 디버거 실행(execute)은 EDIT 권한이라 표준 관리자는 실행할 수 없다(P-D3).
    await page.getByTestId("flow-tab-sim").click();
    await expect(page.getByTestId("sim-run")).toBeDisabled();
  });

  test("E10 룰 링크: 룰 노드를 골라 속성 패널의 룰 편집 열기를 누르면 룰 화면 탭이 그 룰로 열린다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await page.getByTestId("flow-node-r1").click();
    await expect(page.getByTestId("flow-prop-rule")).toBeVisible();
    await page.getByTestId("flow-prop-rule-open").click();
    await expect(page.getByTestId("rule-edit-current")).toHaveText("E2S_GRD", { timeout: 60_000 });
  });

  test("E11 디버거: E2S_FLOW 를 저장 없이 실행해 [다음] 으로 노드를 따라가며 IF 가 고른 선이 강조되고 값 표가 채워진다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_FLOW");
    // 분기 세트도 캔버스로 그려진다: 시작 · r1 · if1 · r2 · m1 · r3 · 끝.
    await expect(flowNodes(page)).toHaveCount(7, { timeout: 20_000 });

    await page.getByTestId("flow-tab-sim").click();
    await page.getByTestId("sim-input-SET_THK").fill("1.2");
    await page.getByTestId("sim-input-SET_SURF").fill("A");
    await page.getByTestId("sim-input-SET_WID").fill("1000");
    await page.getByTestId("sim-run").click();
    const status = page.getByTestId("sim-status");
    await expect(status).toHaveText(/^완료 · \d+단계 · 결과 변수 \d+개$/, { timeout: 30_000 });

    // 처음부터 한 단계씩: 시작 → r1 → if1.
    await page.getByTestId("sim-first").click();
    await expect(status).toHaveText(/^1\/\d+ · start$/);
    await page.getByTestId("sim-next").click();
    await expect(status).toHaveText(/^2\/\d+ · r1$/);
    await expect(page.getByTestId("flow-node-r1")).toHaveAttribute("data-state", "current");
    await page.getByTestId("sim-next").click();
    await expect(status).toHaveText(/^3\/\d+ · if1$/);
    await expect(page.getByTestId("flow-node-if1")).toHaveAttribute("data-state", "current");
    // E2S_GRD 는 언제나 "A" 를 돌려주므로 IF 는 e3 갈래를 고르고, 고르지 않은 "그 외"(e4) 선은 흐려진다.
    await expect(page.getByTestId("flow-edge-label-e3")).toHaveAttribute("data-state", "chosen");
    await expect(page.getByTestId("flow-edge-label-e4")).toHaveAttribute("data-state", "dim");
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-debug.png"), fullPage: true });

    // 끝까지 가면 값 표에 입력 변수와 룰이 만든 결과 변수가 열(단계)별로 들어 있다.
    await page.getByTestId("sim-last").click();
    await expect(status).toHaveText(/^완료 · \d+단계 · 결과 변수 \d+개$/);
    const values = page.getByTestId("sim-values");
    await expect(values).toContainText("S_GRD");
    await expect(values).toContainText("S_SPD");
    await expect(values).toContainText("120");

    // 표시 지우기는 겹침을 없앤다.
    await page.getByTestId("sim-clear").click();
    await expect(page.getByTestId("flow-node-r1")).not.toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("flow-edge-label-e3")).toHaveAttribute("data-state", "idle");
  });

  test("E12 룰 박스: 링크 아이콘만 룰 화면 탭을 열고, 박스 누르기는 오른쪽 속성 패널만 연다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");

    // 박스 누르기 = 선택 + 속성 패널. 룰 화면 탭은 열리지 않는다.
    await page.getByTestId("flow-node-r2").click();
    await expect(page.getByTestId("flow-prop-rule")).toBeVisible();
    await expect(page.getByTestId("flow-prop-rule")).toContainText("E2S_FCT");
    await expect(page.getByTestId("rule-edit-current")).toHaveCount(0);

    // 링크 아이콘 = openRuleEdit(ruleId).
    await page.getByTestId("flow-rule-open-r2").click();
    await expect(page.getByTestId("rule-edit-current")).toHaveText("E2S_FCT", { timeout: 60_000 });
  });
});
