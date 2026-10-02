import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * mdm dme/ruleSetMng(룰 세트 조회·등록) — TSK-08-06 design.md §3.4.1.
 *
 * 스모크 넷: M1 메뉴 이동, M2 목록(서버 데이터)·빈 상태, M3 등록 한 번(룰 세트 편집 탭이 그 세트로 열리고 목록에 반영), M4 서버 오류.
 * 고유: M5 세트 ID 물리명 규칙(즉시 안내·저장 비활성), M6 권한(READ 는 등록 비활성).
 *
 * 전제(design.md 「E2E 서버 절차」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고,
 * mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-ruleSet-data.sql 을 넣는다.
 * 세트를 만들므로 같은 mdm.db 로 다시 돌릴 수 없다(새 DB 로 시작). 등록 시나리오는 SYSADMIN 이 아니라 담당자로 로그인한다.
 * 목록 단언은 세트 키워드 `E2S_` 로 좁혀 다른 픽스처의 세트가 섞여도 흔들리지 않게 한다.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

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

async function openRuleSetMng(page: Page) {
  await openMenu(page, /^룰 세트$/);
  await expect(page.getByTestId("set-register-form")).toBeVisible({ timeout: 60_000 });
}

async function search(page: Page, filters: { keyword?: string; ruleId?: string; resultVar?: string }) {
  await page.getByTestId("set-search-keyword").fill(filters.keyword ?? "");
  await page.getByTestId("set-search-rule").fill(filters.ruleId ?? "");
  await page.getByTestId("set-search-var").fill(filters.resultVar ?? "");
  await page.getByRole("button", { name: "조회", exact: true }).click();
}

function setRow(page: Page, setId: string) {
  return page.locator(".ag-row", { has: page.getByTestId(`set-link-${setId}`) });
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dme/ruleSetMng", () => {
  test.setTimeout(180_000);

  test("M1 메뉴: 마루 MDM > 업무기준 > 룰 세트 가 열리고 등록 패널이 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetMng(page);
    await expect(page.locator(".page-layout__title:visible", { hasText: /^룰 세트$/ })).toBeVisible();
  });

  test("M2 목록·빈 상태: 픽스처 세트가 계산 칸과 함께 보이고, 결과 변수·담은 룰로 거르며, 없는 세트면 빈 상태다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetMng(page);
    await search(page, { keyword: "E2S_" });

    const chain = setRow(page, "E2S_CHAIN");
    await expect(chain).toBeVisible({ timeout: 30_000 });
    // 목록의 버전 열은 표시 버전(지금 적용 중인 RELEASED)이다 — 내 DRAFT 2.000 이 있어도 v1.000.
    await expect(chain.locator('[col-id="ver"]')).toHaveText("v1.000");
    await expect(chain.locator('[col-id="ruleCount"]')).toHaveText("3");
    await expect(chain.locator('[col-id="finalResults"]')).toHaveText("S_SPD");
    await expect(chain.locator('[col-id="inputCount"]')).toHaveText("3");
    await expect(chain.locator('[col-id="checkText"]')).toHaveText("통과");
    await expect(setRow(page, "E2S_BADORD").locator('[col-id="checkText"]')).toHaveText("거부 1");
    await expect(setRow(page, "E2S_HASOLD").locator('[col-id="checkText"]')).toHaveText("거부 1");
    const oldSet = setRow(page, "E2S_OLDSET");
    await expect(oldSet.locator('[col-id="status"]')).toHaveText("DEPRECATED");
    await expect(oldSet.locator('[col-id="checkText"]')).toHaveText("-");
    await page.screenshot({ path: screenshot("dme-ruleSetMng-list.png"), fullPage: true });

    // 결과 변수는 중간 결과도 찾는다 — S_GRD 를 만드는 E2S_GRD 를 담은 세트. 편집 스펙이 다른 세트를 바꿀 수 있어 건수는 보지 않는다.
    await search(page, { keyword: "E2S_", resultVar: "S_GRD" });
    await expect(page.getByTestId("set-link-E2S_CHAIN")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("set-link-E2S_BADORD")).toBeVisible();
    await expect(page.getByTestId("set-link-E2S_OLDSET")).toBeVisible();
    await expect(page.getByTestId("set-link-E2S_HASOLD")).toHaveCount(0);

    await search(page, { keyword: "E2S_", ruleId: "E2S_OLD" });
    await expect(page.getByTestId("set-link-E2S_HASOLD")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".grid-panel-count")).toHaveText("1건");

    await search(page, { keyword: "NO_SUCH_SET" });
    await expect(page.getByTestId("set-list-empty")).toHaveText("조건에 맞는 룰 세트가 없다", { timeout: 20_000 });
    await expect(page.locator(".grid-panel-count")).toHaveText("0건");
  });

  test("M3 등록(수용 1): 저장하면 룰 세트 편집 탭이 그 빈 세트로 열리고 목록에 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetMng(page);
    await page.getByTestId("set-reg-id").fill("E2S_NEW_SET");
    await page.getByTestId("set-reg-name").fill("E2E 새 세트");
    await page.screenshot({ path: screenshot("dme-ruleSetMng-register.png"), fullPage: true });
    await page.getByTestId("set-reg-save").click();

    // 룰 세트 편집 탭 — handoff 대상(setId)을 받아 새 세트를 연다.
    await expect(page.getByTestId("set-edit-current")).toContainText("E2S_NEW_SET", { timeout: 60_000 });
    await expect(page.getByTestId("set-status")).toHaveText("INUSE");
    // 등록은 1.000 DRAFT 를 함께 만든다 — 편집 화면이 그 버전으로 열린다.
    await expect(page.getByTestId("set-ver-select")).toContainText("v1.000 (DRAFT)", { timeout: 20_000 });
    // 빈 세트는 캔버스에 시작 → 끝만 그려진다(룰 노드 없음).
    await expect(page.getByTestId("flow-node-start")).toBeVisible();
    await expect(page.getByTestId("flow-canvas").locator('[data-kind="RULE"]')).toHaveCount(0);
    await expect(page.getByTestId("set-checks")).toContainText("룰이 하나도 없다");

    // 룰 세트 탭으로 돌아와 조회하면 목록에 있다.
    await page.locator(".tab-item .tab-title", { hasText: /^룰 세트$/ }).click();
    await search(page, { keyword: "E2S_NEW" });
    const created = setRow(page, "E2S_NEW_SET");
    await expect(created).toBeVisible({ timeout: 20_000 });
    await expect(created.locator('[col-id="ruleCount"]')).toHaveText("0");
    await expect(created.locator('[col-id="checkText"]')).toHaveText("거부 1");
  });

  test("M4 서버 오류: 같은 ID 로 등록하면 서버 중복 오류가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetMng(page);
    await page.getByTestId("set-reg-id").fill("E2S_CHAIN");
    await page.getByTestId("set-reg-name").fill("중복 등록");
    await page.getByTestId("set-reg-save").click();
    await expect(page.getByRole("dialog").getByText(/이미 있는 룰 세트 ID 입니다/)).toBeVisible({ timeout: 20_000 });
  });

  test("M5 ID 규칙: 물리명 규칙 위반은 즉시 안내하고 저장을 막는다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetMng(page);
    await page.getByTestId("set-reg-id").fill("bad-id");
    await page.getByTestId("set-reg-name").fill("규칙 위반");
    await expect(page.getByTestId("set-reg-id-error")).toContainText("컬럼 물리명 규칙");
    await expect(page.getByTestId("set-reg-save")).toBeDisabled();
  });

  test("M6 권한: 표준 관리자(READ)는 목록은 보고 등록 저장 버튼은 비활성이다", async ({ page }) => {
    await login(page, STDADMIN);
    await openRuleSetMng(page);
    await search(page, { keyword: "E2S_" });
    await expect(page.getByTestId("set-link-E2S_CHAIN")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("set-reg-id").fill("E2S_READ_SET");
    await page.getByTestId("set-reg-name").fill("권한 없음");
    await expect(page.getByTestId("set-reg-id-error")).toHaveCount(0);
    await expect(page.getByTestId("set-reg-save")).toBeDisabled();
  });
});
