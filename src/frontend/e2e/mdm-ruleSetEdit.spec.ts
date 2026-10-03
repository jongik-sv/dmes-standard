import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { T, login, openRuleMenu, type LoginOptions } from "./support/common";
import { loadMdmFixture } from "./support/mdm-e2e";
import { gridRowById, gridRows } from "./support/grid";

/**
 * mdm dme/ruleSetEdit(룰 세트 편집 — 흐름도 캔버스·디버거) — TSK-08-06 design.md §3.4.2 + 룰 세트 흐름도 2단계(Task 12).
 *
 * 스모크 넷: E1 메뉴 이동, E2 서버 데이터(캔버스 노드·입출력 표·검사), E5 수정 한 번(저장·다시 불러와도 유지), E8 서버 오류(MDM001).
 * 고유: E3 캔버스 편집(IF 끼우기 → 거부로 저장 꺼짐 → 조건식 → 저장 켜짐)·dirty 확인, E4 순환은 즉시 거부되고 저장이 꺼진다(P-D4),
 * (4단계) 룰은 도구 상자 [룰] 로 빈 단계를 놓고 오른쪽 「룰 지정」 으로 고른다 — 룰 찾기 팝업은 없다.
 * E5 수용 4 중복 대입 경고, E6 구성 지침 → 제안 순서 적용 → 저장 → 다시 열어 순서 유지, E7 폐기·되살리기, E9 권한(READ — 디버그 모드는 들어가지만 실행 단추가 꺼진다),
 * E10 속성 패널의 룰 편집 열기, E11 디버그 모드(단계 실행·중단점·계속·끝까지·값 표), E12 룰 박스 링크 아이콘과 박스 누르기,
 * E13 편집기(룰 목록에서 선으로 끌어 넣기·되돌리기·다시 하기·[+] 메뉴로 IF 넣기·분기 종류 바꾸기·Ctrl+Z),
 * E14 테스트 케이스(현재 입력 저장 → 모두 실행 1/1 통과 → 삭제), E15 찾기·블록 접기(접힌 블록 안 노드를 찾으면 펼쳐진다), E16 받는 노드(룰 우클릭 「예외 받기 추가」 → 저장 → 디버그에서 결과 없음 처리 갈래로 끝냄),
 * E17 옛 형식 열기(E2S_FLOW 를 열면 합류 없이 그려지고 알림, dirty 아님, 저장 뒤 다시 열면 알림 없음), E18 끝내는 갈래(갈래 마지막 선을 끝으로 옮겨 저장 → 디버그에서 그 갈래로 끝냄).
 *
 * 전제(design.md 「E2E 서버 절차」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고,
 * mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql, beforeAll 이 e2e/fixtures/mdm-ruleSet-data.sql 을 넣는다.
 * 세트를 고치므로 같은 mdm.db 로 다시 돌릴 수 없다(새 DB 로 시작). 편집 세트마다 담당자 소유 DRAFT 2.000 이 있다(fixtures/mdm-ruleSet-data.sql). mdm-ruleSetConfirm.spec.ts 는 전용 세트 E2S_CONFIRM 을 확정하므로 이 스펙의 세트를 건드리지 않는다. 편집 시나리오는 SYSADMIN 이 아니라 담당자로 로그인한다.
 * mdm-ruleSetMng.spec.ts 와 서로의 데이터에 기대지 않는다(각자 픽스처의 다른 세트를 쓴다).
 *
 * 화면 구조: 세트를 열면 보기 모드다. 고치려면 [편집](flow-mode-edit)을 누른다. 캔버스 노드는 `flow-node-{nodeId}`,
 * 한 줄 세트(FLOW_JSON 없음)는 start · r1 … rN · end 의 노드 ID 로 그려진다(linearFlow). 노드를 누르면 오른쪽이 속성 패널이 되고
 * 세트명·입출력 표·지침(세트 패널)은 선택이 없을 때만 보인다 — 세트 패널을 쓰는 단계는 노드를 고르기 전에 한다.
 * 저장은 편집 모드에서 dirty 이고 거부(REJECT) 검사가 없을 때만 된다 — 서버 MDM024 거부 경로는 서버 테스트가 맡는다.
 * IF 는 합류 노드가 없다 — 갈래가 모이는 자리로 바로 간다(D-136). 저장된 옛 형식 세트(E2S_FLOW)는 열 때 바꿔 그린다.
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const DIRTY_CONFIRM = "저장하지 않은 변경이 있습니다. 버리고 이동할까요?";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-06/screens", name);

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW };

/** 세트 입출력 표(AgDataGrid)의 한 행 — 행 키는 변수명이다. kind: inputs(입력 변수) | results(결과 변수). 세트 패널(선택 없음)에 있다. */
const ioRow = (page: Page, kind: "inputs" | "results", name: string): Locator =>
  gridRowById(page.getByTestId(`set-io-${kind}`), name);

async function openRuleSetEdit(page: Page) {
  await openRuleMenu(page, /^룰 세트 편집$/);
  await expect(page.getByTestId("set-pick-keyword")).toBeVisible({ timeout: T.SLOW });
}

/** 상단 바에서 세트를 찾아 고른다. dirty 면 확인 대화상자가 뜨므로 대화상자 처리는 호출자가 먼저 건다. */
async function clickPick(page: Page, setId: string) {
  await page.getByTestId("set-pick-keyword").fill(setId);
  await page.getByTestId("set-edit-topbar").getByRole("button", { name: "찾기" }).click();
  await page.getByTestId(`set-pick-${setId}`).click();
}

async function pickSet(page: Page, setId: string) {
  await clickPick(page, setId);
  await expect(page.getByTestId("set-edit-current")).toContainText(setId, { timeout: T.LONG });
  await expect(page.getByTestId("set-card-id")).toHaveText(setId);
}

/** 캔버스에 그려진 흐름 노드(시작·끝·룰·빈 단계·IF·병렬·병렬 합류). 뱃지·칩·링크 아이콘은 data-kind 가 없어 세지 않는다. */
const flowNodes = (page: Page): Locator => page.getByTestId("flow-canvas").locator("[data-kind]");
const ruleNodes = (page: Page): Locator => page.getByTestId("flow-canvas").locator('[data-kind="RULE"]');

/** 노드 하나가 그 룰이다(노드 안에 룰 ID 가 보인다). */
async function expectRuleNode(page: Page, nodeId: string, ruleId: string) {
  await expect(page.getByTestId(`flow-node-${nodeId}`)).toContainText(ruleId, { timeout: T.UI });
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

/**
 * 도구 상자 [룰] → 고른 선(없으면 END 앞 선)에 빈 단계가 놓이고 오른쪽 「룰 지정」 섹션의 찾기 칸에 초점이 간다 → 찾아 [지정].
 * 빈 단계는 같은 ID(r 접두어)의 룰 노드가 된다 — 끼운 순서대로 r(N+1)… 이다.
 */
async function addRule(page: Page, keyword: string, ruleIds: string[]) {
  for (const id of ruleIds) {
    await page.getByTestId("flow-add-rule").click();
    await expect(page.getByTestId("flow-panel-kind")).toHaveText("빈 단계");
    await page.getByTestId("flow-rule-panel-search").fill(keyword);
    await page.getByTestId("flow-rule-panel-find").click();
    await page.getByTestId(`flow-rule-assign-${id}`).click();
    await expect(page.getByTestId("flow-panel-kind")).toHaveText("룰");
  }
}

/** 세트를 열고 [디버그] 모드로 들어간다 — 디버그 툴바가 보인다. */
async function enterDebugMode(page: Page) {
  await page.getByTestId("flow-mode-debug").click();
  await expect(page.getByTestId("flow-mode-debug")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("dbg-toolbar")).toBeVisible();
}

/** E2S_FLOW·E2S_CHAIN 의 입력 세 개를 채운다(E2S_GRD 는 언제나 "A" 를 돌려줘 IF 가 e3 갈래를 고른다). */
async function fillDebugInputs(page: Page) {
  await page.getByTestId("dbg-input-SET_THK").fill("1.2");
  await page.getByTestId("dbg-input-SET_SURF").fill("A");
  await page.getByTestId("dbg-input-SET_WID").fill("1000");
}

/**
 * 선에 마우스를 올린 것으로 알린다 — 편집 모드의 선 [+] 는 올리거나 고른 선에만 보인다(L1). SVG 선의 상자 가운데는 선 밖일 수 있어
 * 실제 포인터를 옮기지 않고 선의 누름 영역(path)에 mouseover 를 보낸다(React 는 relatedTarget 없는 mouseover 를 들어옴으로 받는다).
 */
async function revealEdgeAdd(page: Page, edgeId: string) {
  await page.locator(`[data-testid="rf__edge-${edgeId}"] .react-flow__edge-interaction`).dispatchEvent("mouseover");
  await expect(page.getByTestId(`flow-edge-add-${edgeId}`)).toBeVisible();
}

/**
 * 룰 목록의 줄을 캔버스의 선 [+] 자리로 끌어 놓는다. Playwright 의 dragTo 는 HTML5 드래그(dataTransfer)를 흉내내지 못할 수 있어
 * 같은 DataTransfer 로 줄의 dragstart 와 캔버스의 dragover·drop 이벤트를 직접 보낸다. 놓는 자리는 그 선의 [+] 단추 가운데(선 중점)다.
 */
async function dragRuleToEdge(page: Page, ruleId: string, edgeId: string) {
  const row = page.getByTestId(`flow-rule-row-${ruleId}`);
  await expect(row).toBeVisible({ timeout: T.UI });
  await revealEdgeAdd(page, edgeId);
  const box = await page.getByTestId(`flow-edge-add-${edgeId}`).boundingBox();
  if (!box) throw new Error(`선 ${edgeId} 의 [+] 단추가 안 보인다`);
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await row.dispatchEvent("dragstart", { dataTransfer });
  const canvas = page.getByTestId("flow-canvas");
  await canvas.dispatchEvent("dragenter", { dataTransfer, ...at });
  await canvas.dispatchEvent("dragover", { dataTransfer, ...at });
  await canvas.dispatchEvent("drop", { dataTransfer, ...at });
  await row.dispatchEvent("dragend", { dataTransfer });
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dme/ruleSetEdit", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => loadMdmFixture("mdm-ruleSet-data.sql"));

  test("E1 메뉴: 마루 MDM > 업무기준 > 룰 세트 편집 이 열리고 세트 고르기 칸과 빈 상태가 보인다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await expect(page.locator(".page-layout__title:visible", { hasText: /^룰 세트 편집$/ })).toBeVisible();
    await expect(page.getByTestId("set-edit-empty")).toHaveText("세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다");
  });

  test("E2 서버 데이터: E2S_CHAIN 의 캔버스 노드·변수 흐름·입출력 표·검사가 서버 값으로 보인다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expect(page.getByTestId("set-status")).toHaveText("INUSE");
    // 기본 선택은 내 DRAFT v2.000 이다(D-144 2단계) — 버전 줄에 보인다.
    await expect(page.getByTestId("set-ver-row")).toContainText("v2.000", { timeout: T.UI });
    await expect(page.getByTestId("set-ver-select")).toHaveValue("2.000");

    // 세트를 열면 보기 모드다 — 팔레트가 없고, 노드 5개(시작 · 룰 셋 · 끝)가 그려진다.
    await expect(page.getByTestId("flow-mode-view")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("flow-palette")).toHaveCount(0);
    await expect(flowNodes(page)).toHaveCount(5, { timeout: T.UI });
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
    await expect(gridRows(inputs)).toHaveCount(3);
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
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expect(flowNodes(page)).toHaveCount(5, { timeout: T.UI });

    // 고치지 않았으면 편집 모드여도 저장이 꺼져 있다(dirty 아님).
    await enterEditMode(page);
    await expect(page.getByTestId("set-save")).toBeDisabled();

    // 고른 선이 없으면 END 로 들어가는 선(e4)에 끼운다 — IF if1 과 「갈래 1」 빈 단계 r4·모이는 자리 빈 단계 r5(합류 없음), 새 갈래 e5(조건식 칸)·e6(그 외), 선 e7(r4 → r5)·e8(r5 → 끝).
    await page.getByTestId("flow-add-if").click();
    await expect(page.getByTestId("flow-node-if1")).toBeVisible();
    await expect(page.getByTestId("flow-node-r4")).toBeVisible();
    await expect(page.getByTestId("flow-node-r5")).toBeVisible();
    await expect(flowNodes(page)).toHaveCount(8);
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="MERGE"]')).toHaveCount(0);
    await expect(page.getByTestId("set-checks")).toContainText("갈래 e5에 조건식이 없다");
    await expect(page.getByTestId("set-save")).toBeDisabled();
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-if-reject.png"), fullPage: true });

    // 새 IF 가 선택돼 있어 오른쪽이 속성 패널이다. 조건식을 넣으면 서버가 변수 정의를 확인(validate)한 뒤 저장이 켜진다.
    await page.getByTestId("flow-prop-branch-e5-cond").fill('S_GRD = "A"');
    await expect(page.getByTestId("set-save")).toBeEnabled({ timeout: T.UI });
    await expect(page.getByTestId("set-checks")).not.toContainText("갈래 e5에 조건식이 없다");
    await expect(page.getByTestId("set-checks")).toContainText("빈 단계 2개 — 실행 때 그냥 지나간다");

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
    await login(page, STEWARD, LOGIN_OPTS);
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
    await login(page, STEWARD, LOGIN_OPTS);
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
    await expect(page.getByTestId("set-save")).toBeEnabled({ timeout: T.UI });
    // 저장 요청은 선택한 내 DRAFT 버전(ver)을 싣는다.
    const saveRequest = page.waitForRequest((r) => r.url().includes("/api/mdm/oasis/ruleSetEdit/save"));
    await page.getByTestId("set-save").click();
    expect((await saveRequest).postDataJSON().params).toMatchObject({ setId: "E2S_CYCSET", ver: "2.000" });
    const message = page.getByTestId("set-message");
    await expect(message).toContainText("저장 · row_version 1", { timeout: T.UI });
    await expect(message).toContainText(warn);
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 1");
    // 저장하면 서버가 돌려준 정규 흐름으로 다시 불러오되, 편집 모드는 그대로 유지한다(자동 저장 도입 뒤 동작).
    await expect(page.getByTestId("flow-mode-edit")).toHaveAttribute("aria-pressed", "true");
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
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_GUIDESET");
    // 빈 세트는 시작 → 끝만 그려진다.
    await expect(flowNodes(page)).toHaveCount(2, { timeout: T.UI });
    await expect(ruleNodes(page)).toHaveCount(0);

    await page.getByTestId("set-guide-var").fill("S_SPD");
    await page.getByTestId("set-guide-run").click();
    const order = page.getByTestId("set-guide-order");
    await expect(order).toContainText("제안 순서 · 1. E2S_DUP → 2. E2S_FCT → 3. E2S_SPD", { timeout: T.UI });
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
    await expect(page.getByTestId("set-message")).toContainText("저장 · row_version 1", { timeout: T.UI });

    // 다른 세트를 거쳐 다시 열어도 저장한 순서가 그대로다.
    await pickSet(page, "E2S_CHAIN");
    await pickSet(page, "E2S_GUIDESET");
    await expectChain(page, ["E2S_DUP", "E2S_FCT", "E2S_SPD"]);
    await expect(page.getByTestId("set-row-version")).toHaveText("row_version 1");

    await page.getByTestId("set-guide-var").fill("S_CYA");
    await page.getByTestId("set-guide-run").click();
    await expect(page.getByTestId("set-guide-error")).toContainText("순환이 있다(", { timeout: T.UI });
  });

  test("E7 폐기·되살리기: DEPRECATED 세트는 되살리기만 되고, 되살린 뒤 두 단계로 다시 폐기한다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
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
    await expect(page.getByTestId("set-status")).toHaveText("INUSE", { timeout: T.UI });
    await expect(page.getByTestId("set-message")).toContainText("되살림");

    await page.getByTestId("set-deprecate").click();
    await expect(page.getByTestId("set-message")).toContainText("폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.");
    await expect(page.getByTestId("set-deprecate-confirm")).toBeVisible();
    await expect(page.getByTestId("set-deprecate-cancel")).toBeVisible();
    await expect(page.getByTestId("set-status")).toHaveText("INUSE");
    await page.getByTestId("set-deprecate-confirm").click();
    await expect(page.getByTestId("set-status")).toHaveText("DEPRECATED", { timeout: T.UI });
    await expect(page.getByTestId("set-message")).toContainText("폐기. 행은 남기고 되살릴 수 있다");
    await expect(page.getByTestId("set-restore")).toBeVisible();
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-deprecated.png"), fullPage: true });
  });

  test("E8 서버 오류: 저장이 MDM001 로 실패하면 충돌 안내와 다시 불러오기가 보인다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
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
    await expect(page.getByTestId("set-message")).toContainText("다른 창에서 바뀌었습니다. 다시 불러오세요", { timeout: T.UI });
    const reload = page.getByTestId("set-reload");
    await expect(reload).toBeVisible();
    await page.unroute("**/api/mdm/oasis/ruleSetEdit/save");

    await reload.click();
    await expect(page.getByTestId("set-name")).toHaveValue("E2E 사슬 세트", { timeout: T.UI });
    await expect(reload).toHaveCount(0);
  });

  test("E9 권한: 표준 관리자(READ)는 세트를 보고 디버그 모드에 들어가지만 편집·저장·폐기·지침 적용·단계 실행·케이스 저장·식 평가가 비활성이다", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
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
    await expect(page.getByTestId("set-guide-order")).toBeVisible({ timeout: T.UI });
    await expect(page.getByTestId("set-guide-apply")).toBeDisabled();

    // 디버그 모드는 READ 로도 들어간다. 실행(execute)은 EDIT 권한이라 표준 관리자는 단계 실행·케이스 저장·식 평가를 할 수 없다(P-D3).
    await enterDebugMode(page);
    for (const id of ["dbg-step", "dbg-continue", "case-run-all", "case-save-current", "expr-input"]) {
      await expect(page.getByTestId(id), id).toBeDisabled();
    }
    await expect(page.getByTestId("flow-mode-edit")).toBeDisabled();
  });

  test("E10 룰 링크: 룰 노드를 골라 속성 패널의 룰 편집 열기를 누르면 룰 화면 탭이 그 룰로 열린다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await page.getByTestId("flow-node-r1").click();
    await expect(page.getByTestId("flow-prop-rule")).toBeVisible();
    await page.getByTestId("flow-prop-rule-open").click();
    await expect(page.getByTestId("rule-edit-current")).toHaveText("E2S_GRD", { timeout: T.SLOW });
  });

  test("E11 디버그 모드: E2S_FLOW 를 [한 단계] 로 따라가고 중단점까지 계속·끝까지 하면 IF 가 고른 선이 강조되고 값 표가 채워진다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_FLOW");
    // 분기 세트도 캔버스로 그려진다(옛 합류 m1 은 열 때 없앤다): 시작 · r1 · if1 · r2 · r3 · 끝.
    await expect(flowNodes(page)).toHaveCount(6, { timeout: T.UI });

    await enterDebugMode(page);
    await fillDebugInputs(page);
    const status = page.getByTestId("dbg-status");

    // 처음 [한 단계] 는 저장 없이 실행해 시작 노드 앞에 선다. 두 번 더 누르면 시작 → r1 을 지나 if1 앞이다.
    await page.getByTestId("dbg-step").click();
    await expect(status).toHaveText(/^1\/\d+ · start 실행 전$/, { timeout: T.LONG });
    await page.getByTestId("dbg-step").click();
    await page.getByTestId("dbg-step").click();
    await expect(status).toHaveText(/^3\/\d+ · if1 실행 전$/);
    await expect(page.getByTestId("flow-node-r1")).toHaveAttribute("data-state", "run");
    await expect(page.getByTestId("flow-node-if1")).toHaveAttribute("data-state", "current");
    await page.screenshot({ path: screenshot("dme-ruleSetEdit-debug.png"), fullPage: true });

    // r2 에 중단점을 켜고 처음부터 → 계속 하면 r2 앞에서 멈춘다.
    await page.getByTestId("flow-bp-r2").click();
    await expect(page.getByTestId("flow-bp-r2")).toHaveAttribute("data-on", "true");
    await page.getByTestId("dbg-restart").click();
    await expect(status).toHaveText(/^1\/\d+ · start 실행 전$/);
    await page.getByTestId("dbg-continue").click();
    await expect(status).toHaveText(/^\d+\/\d+ · r2 실행 전$/);

    // [끝까지] 는 마지막 단계로 간다. E2S_GRD 는 언제나 "A" 를 돌려주므로 IF 는 e3 갈래를 고르고, 고르지 않은 "그 외"(e4) 선은 흐려진다.
    await page.getByTestId("dbg-finish").click();
    await expect(status).toHaveText(/^완료 · \d+단계 · 결과 변수 \d+개$/);
    await expect(page.getByTestId("flow-edge-label-e3")).toHaveAttribute("data-state", "chosen");
    await expect(page.getByTestId("flow-edge-label-e4")).toHaveAttribute("data-state", "dim");

    // 값 표에 입력 변수와 룰이 만든 결과 변수가 열(단계)별로 들어 있다.
    await page.getByTestId("flow-tab-values").click();
    const values = page.getByTestId("sim-values");
    await expect(values).toContainText("S_GRD");
    await expect(values).toContainText("S_SPD");
    await expect(values).toContainText("120");
  });

  test("E12 룰 박스: 링크 아이콘만 룰 화면 탭을 열고, 박스 누르기는 오른쪽 속성 패널만 연다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");

    // 박스 누르기 = 선택 + 속성 패널. 룰 화면 탭은 열리지 않는다.
    await page.getByTestId("flow-node-r2").click();
    await expect(page.getByTestId("flow-prop-rule")).toBeVisible();
    await expect(page.getByTestId("flow-prop-rule")).toContainText("E2S_FCT");
    await expect(page.getByTestId("rule-edit-current")).toHaveCount(0);

    // 링크 아이콘 = openRuleEdit(ruleId).
    await page.getByTestId("flow-rule-open-r2").click();
    await expect(page.getByTestId("rule-edit-current")).toHaveText("E2S_FCT", { timeout: T.SLOW });
  });

  test("E13 편집기: 룰 목록에서 선으로 끌어 넣고 되돌리기·다시 하기, [+] 메뉴로 IF 를 넣고 병렬로 바꾼 뒤 Ctrl+Z 로 되돌린다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CHAIN");
    await expect(flowNodes(page)).toHaveCount(5, { timeout: T.UI });
    await enterEditMode(page);

    // 왼쪽 룰 목록에서 E2S_SPD 를 찾아 END 로 들어가는 선(e4)에 끌어 놓는다 → 룰 노드 +1.
    await page.getByTestId("flow-rule-panel-search").fill("E2S_SPD");
    await page.getByTestId("flow-rule-panel-find").click();
    await dragRuleToEdge(page, "E2S_SPD", "e4");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: T.UI });
    await expect(ruleNodes(page)).toHaveCount(4);

    // 되돌리기 → 원래 수, 다시 하기 → 다시 늘어난다.
    await page.getByTestId("flow-undo").click();
    await expect(flowNodes(page)).toHaveCount(5);
    await page.getByTestId("flow-redo").click();
    await expect(flowNodes(page)).toHaveCount(6);

    // 선의 [+] → 메뉴 [IF 넣기] → IF 와 「갈래 1」 빈 단계가 생긴다(합류 없음).
    await revealEdgeAdd(page, "e1");
    await page.getByTestId("flow-edge-add-e1").click();
    await page.getByTestId("flow-menu-item-insert-if").click();
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="IF"]')).toHaveCount(1);
    await expect(flowNodes(page)).toHaveCount(8);
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="MERGE"]')).toHaveCount(0);

    // IF 우클릭 → [병렬로 바꾸기].
    await page.getByTestId("flow-canvas").locator('[data-kind="IF"]').first().click({ button: "right" });
    await page.getByTestId("flow-menu-item-split-kind").click();
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="PARALLEL"]')).toHaveCount(1);
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="IF"]')).toHaveCount(0);
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="MERGE"]')).toHaveCount(1); // 병렬 합류(속 빈 막대)
    await expect(flowNodes(page)).toHaveCount(9);

    // 캔버스를 누른 뒤 Ctrl+Z(맥은 ⌘Z) → 다시 IF.
    await page.getByTestId("flow-canvas").locator(".react-flow__pane").click({ position: { x: 6, y: 6 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="IF"]')).toHaveCount(1);
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="PARALLEL"]')).toHaveCount(0);
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="MERGE"]')).toHaveCount(0);
    await expect(flowNodes(page)).toHaveCount(8);
  });

  test("E14 테스트 케이스: 디버그 모드에서 지금 입력을 케이스로 저장하고 모두 실행하면 1/1 통과이며, 삭제하면 표가 비는다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_FLOW");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: T.UI });
    await enterDebugMode(page);
    await fillDebugInputs(page);

    // 끝까지 실행해 두면 그 결과가 기대값 칸에 미리 채워진다.
    await page.getByTestId("dbg-finish").click();
    await expect(page.getByTestId("dbg-status")).toHaveText(/^완료 · \d+단계 · 결과 변수 \d+개$/, { timeout: T.LONG });

    await page.getByTestId("case-save-current").click();
    await expect(page.getByTestId("case-modal")).toBeVisible();
    await page.getByTestId("case-modal-name").fill("E2E 케이스");
    await page.getByTestId("case-modal-save").click();
    await expect(page.getByTestId("case-modal")).toHaveCount(0, { timeout: T.UI });
    const grid = page.getByTestId("case-grid");
    await expect(grid).toContainText("E2E 케이스", { timeout: T.UI });

    await page.getByTestId("case-run-all").click();
    await expect(page.getByTestId("case-summary")).toHaveText("1/1 통과", { timeout: T.LONG });

    // 한 줄을 골라 지운다(확인 단추가 한 번 더 나온다).
    await gridRows(grid).first().click();
    await page.getByTestId("case-delete").click();
    await page.getByTestId("case-delete-confirm").click();
    await expect(grid).not.toContainText("E2E 케이스", { timeout: T.UI });
  });

  test("E15 찾기·접기: 룰 ID 로 찾으면 1/1 이고, 접은 블록 안 노드를 찾으면 블록이 펼쳐진다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_FLOW");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: T.UI });

    // 툴바 [노드 찾기] 가 캔버스 오른쪽 위 찾기 위젯을 연다(Ctrl/Cmd+F 와 같다).
    await page.getByTestId("flow-find-open").click();
    await expect(page.getByTestId("flow-find-widget")).toBeVisible();
    await page.getByTestId("flow-find").fill("E2S_FCT");
    await expect(page.getByTestId("flow-find-count")).toHaveText("1/1");

    // if1 우클릭 → [접기] → 접힌 블록 표지("IF 조건 · 노드 …개").
    await page.getByTestId("flow-node-if1").click({ button: "right" });
    await page.getByTestId("flow-menu-item-collapse").click();
    await expect(page.getByTestId("flow-collapsed-if1")).toBeVisible();
    await expect(page.getByTestId("flow-collapsed-if1")).toContainText("IF 조건 · 노드");
    await expect(page.getByTestId("flow-node-r2")).not.toBeVisible();

    // 찾기는 Enter 에서만 캔버스를 옮긴다(첫 Enter 는 첫 결과) — 안쪽 r2 를 고르면 블록이 펼쳐진다.
    await page.getByTestId("flow-find").press("Enter");
    await expect(page.getByTestId("flow-collapsed-if1")).toHaveCount(0);
    await expect(page.getByTestId("flow-node-r2")).toBeVisible();
    await expect(page.getByTestId("flow-node-r2")).toHaveAttribute("data-selected", "true");
  });

  test("E16 받는 노드: 룰에 예외 받기를 붙여 저장하고, 결과 없는 입력으로 실행하면 처리 갈래로 끝나고 받은 예외가 1건이다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CATCHSET");
    await enterEditMode(page);

    await page.getByTestId("flow-node-r1").click({ button: "right" });
    await page.getByTestId("flow-menu-item-catch-add").click();
    await expect(page.getByTestId("flow-node-c1")).toBeVisible();
    await page.getByTestId("flow-node-c1").click();
    await expect(page.getByTestId("flow-panel-kind")).toHaveText("받는 노드");
    await expect(page.getByTestId("flow-prop-catch")).toBeVisible();

    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-save")).toBeDisabled({ timeout: T.LONG });

    await enterDebugMode(page);
    await page.getByTestId("dbg-input-SET_THK").fill("1");
    await page.getByTestId("dbg-finish").click();
    await expect(page.getByTestId("dbg-status")).toHaveText("예외로 끝남: 결과 없음 · 4단계 · 결과 변수 0개", { timeout: T.LONG });
    await expect(page.getByTestId("flow-node-r1")).toHaveAttribute("data-state", "caught");
    await expect(page.getByTestId("dbg-caught-toggle")).toContainText("받은 예외 1건");
  });

  test("E17 옛 형식 열기: E2S_FLOW 를 열면 합류 없이 그려지고 알림이 보이며 dirty 가 아니고, 저장 뒤 다시 열면 같은 그림에 알림이 없다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_FLOW");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: T.UI });
    await expect(page.getByTestId("flow-node-m1")).toHaveCount(0);
    await expect(page.getByTestId("set-message")).toContainText("옛 합류 노드 1개를 없앤 형식으로 바꿔 열었다. 저장하면 새 형식으로 남는다.");
    await enterEditMode(page);
    await expect(page.getByTestId("set-save")).toBeDisabled();

    // 세트명을 고쳐 저장하면 새 형식(합류 없음)으로 남는다.
    await page.getByTestId("set-name").fill("E2E 분기 흐름 세트(새 형식)");
    await expect(page.getByTestId("set-save")).toBeEnabled({ timeout: T.UI });
    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-message")).toContainText(/저장 · row_version \d+/, { timeout: T.UI });

    // 다른 세트를 거쳐 다시 열면 같은 그림이고 알림이 없다.
    await pickSet(page, "E2S_CHAIN");
    await pickSet(page, "E2S_FLOW");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: T.UI });
    await expect(page.getByTestId("set-name")).toHaveValue("E2E 분기 흐름 세트(새 형식)");
    await expect(page.getByText("옛 합류 노드")).toHaveCount(0);
  });

  test("E18 끝내는 갈래: 「등급 A」 갈래의 마지막 선을 끝으로 옮겨 저장하고 그 갈래를 타는 입력으로 실행하면 완료·끝낸 갈래 표시가 보이고 IF 뒤 노드는 돌지 않는다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_IFEND");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: T.UI });
    await expect(page.getByText("옛 합류 노드")).toHaveCount(0);
    await enterEditMode(page);

    // 캔버스가 작으면 끝 노드가 가장자리에 걸려 끌 때 자동 이동(autopan)이 일어나 놓을 자리가 밀린다 — 화면을 키우고 [화면 맞춤] 으로 전체를 보이게 한 뒤 끈다.
    await page.setViewportSize({ width: 1440, height: 1300 });
    await page.getByTestId("flow-fit").click();
    await page.waitForTimeout(500);
    // 선 e5(r2 → r3)를 골라 도착 끝 손잡이를 끝 노드 몸통에 놓는다(R13 — 선 끝 옮기기 R1).
    await page.locator('[data-testid="rf__edge-e5"] .react-flow__edge-interaction').dispatchEvent("click");
    const handle = page.locator('[data-testid="rf__edge-e5"] .react-flow__edgeupdater-target');
    await expect(handle).toBeAttached();
    const hb = await handle.boundingBox();
    const eb = await page.getByTestId("flow-node-end").boundingBox();
    if (!hb || !eb) throw new Error("끝 손잡이나 끝 노드가 안 보인다");
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2, { steps: 15 });
    await page.mouse.up();

    // IF 를 고르면 「등급 A」 갈래 옆에 「끝냄」 과 이어지는 갈래 안내가 보인다.
    await page.getByTestId("flow-node-if1").click();
    await expect(page.getByTestId("flow-prop-branch-e3-ending")).toHaveText("끝냄");
    await expect(page.getByTestId("flow-prop-if-ending-help")).toBeVisible();

    await expect(page.getByTestId("set-save")).toBeEnabled({ timeout: T.UI });
    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-save")).toBeDisabled({ timeout: T.LONG });

    // E2S_GRD 는 언제나 "A" 라 「등급 A」 갈래를 타고 r2(E2S_FCT) 뒤 끝난다 — 기록 start·r1·if1·r2·end, 결과 변수 S_GRD·S_FCT.
    await enterDebugMode(page);
    await fillDebugInputs(page);
    await page.getByTestId("dbg-finish").click();
    await expect(page.getByTestId("dbg-status")).toHaveText("완료 · 5단계 · 결과 변수 2개 · IF 등급 확인의 「등급 A」 갈래에서 끝냈다", { timeout: T.LONG });
    await expect(page.getByTestId("flow-node-r2")).toHaveAttribute("data-state", "run");
    await expect(page.getByTestId("flow-node-r3")).toHaveAttribute("data-state", "dim");
  });
});
