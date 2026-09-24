import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * mdm dme/ruleMng(룰 조회·등록) — TSK-08-02 design.md §3.4.1.
 *
 * 스모크 넷: T1 메뉴 이동, T2 목록(서버 데이터)·빈 상태, T3 등록 한 번(룰 화면 탭이 열리고 목록에 반영), T4 서버 오류.
 * 고유: T5 수용 1(ID 물리명 규칙 — 즉시 안내 + 서버 거부), T6 수용 2(원천 선택 칸 없음), T7 권한(READ 는 등록 비활성).
 *
 * 전제(design.md 「E2E 서버 절차」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고,
 * mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql·mdm-ruleEdit-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-ruleEdit-data.sql 을 넣는다.
 * 룰을 만들므로 같은 mdm.db 로 다시 돌릴 수 없다(새 DB 로 시작). 편집 시나리오는 SYSADMIN 이 아니라 담당자로 로그인한다.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-02/screens", name);

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

async function openRuleMng(page: Page) {
  await openMenu(page, /^룰$/);
  await expect(page.getByTestId("rule-register-form")).toBeVisible({ timeout: 60_000 });
}

async function search(page: Page, keyword: string) {
  await page.getByTestId("rule-search-keyword").fill(keyword);
  await page.getByRole("button", { name: "조회", exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dme/ruleMng", () => {
  test.setTimeout(180_000);

  test("T1 메뉴: 마루 MDM > 업무기준 > 룰 이 열린다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await expect(page.locator(".page-layout__title:visible", { hasText: /^룰$/ })).toBeVisible();
  });

  test("T2 목록·빈 상태: 픽스처 룰이 서버 데이터로 보이고 없는 키워드면 빈 상태다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    const qlty = page.locator(".ag-row", { has: page.getByTestId("rule-link-QLTY_GRD_JDG") });
    await expect(qlty).toBeVisible({ timeout: 30_000 });
    await expect(qlty.locator('[col-id="releasedVer"]')).toHaveText("1");
    await expect(qlty.locator('[col-id="hitPolicy"]')).toHaveText("FIRST");
    await expect(page.getByTestId("rule-link-E2E_LOCK_JDG")).toBeVisible();
    await page.screenshot({ path: screenshot("dme-ruleMng-list.png"), fullPage: true });

    await search(page, "NO_SUCH_RULE");
    await expect(page.getByTestId("rule-list-empty")).toHaveText("조회된 룰이 없습니다.", { timeout: 20_000 });
    await expect(page.locator(".grid-panel-count")).toHaveText("0건");
  });

  test("T3 등록: 등록하면 룰 화면이 열려 버전 1 DRAFT·편집 중(나)이고 목록에 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await page.getByTestId("rule-reg-id").fill("E2E_NEW_JDG");
    await page.getByTestId("rule-reg-name").fill("E2E 신규 판정");
    await page.getByTestId("rule-reg-kind").selectOption("DECISION");
    await page.screenshot({ path: screenshot("dme-ruleMng-register.png"), fullPage: true });
    await page.getByRole("button", { name: "룰 등록" }).click();

    // 룰 화면 탭 — handoff 대상(sessionStorage)을 읽어 새 룰을 연다(자동 선점).
    await expect(page.getByTestId("rule-edit-current")).toHaveText("E2E_NEW_JDG", { timeout: 60_000 });
    await expect(page.getByTestId("rule-card-versions").getByTestId("rule-ver-row-1")).toBeVisible();
    await expect(page.getByTestId("rule-edit-topbar").locator(".mdm-status-badge")).toHaveAttribute("data-status", "DRAFT");
    await expect(page.getByTestId("rule-edit-topbar").getByText("편집 중(나)")).toBeVisible();

    // 룰 탭으로 돌아와 조회하면 목록에 있다.
    await page.locator(".tab-item .tab-title", { hasText: /^룰$/ }).click();
    await search(page, "E2E_NEW");
    await expect(page.getByTestId("rule-link-E2E_NEW_JDG")).toBeVisible({ timeout: 20_000 });
  });

  test("T4 서버 오류: 같은 ID 로 등록하면 서버 중복 오류가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await page.getByTestId("rule-reg-id").fill("QLTY_GRD_JDG");
    await page.getByTestId("rule-reg-name").fill("중복 등록");
    await page.getByRole("button", { name: "룰 등록" }).click();
    await expect(page.getByRole("dialog").getByText(/같은 룰 ID 가 이미 있습니다/)).toBeVisible({ timeout: 20_000 });
  });

  test("T5 수용 1: 물리명 규칙 위반은 즉시 안내하고 막으며, 가로채 보내도 서버가 거부한다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await page.getByTestId("rule-reg-id").fill("qlty-bad");
    await page.getByTestId("rule-reg-name").fill("규칙 위반");
    await expect(page.getByText(/컬럼 물리명 규칙/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "룰 등록" })).toBeDisabled();

    // 화면 검사를 지나도록 올바른 ID 를 넣고, 요청 본문을 규칙 위반 ID 로 바꿔 보낸다 → 서버가 판정한다(I1).
    await page.getByTestId("rule-reg-id").fill("E2E_ROUTE_JDG");
    await page.route("**/api/mdm/oasis/ruleMng/reg", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      body.params.maruRuleId = "qlty-bad";
      await route.continue({ postData: JSON.stringify(body) });
    });
    await page.getByRole("button", { name: "룰 등록" }).click();
    await expect(page.getByRole("dialog").getByText(/컬럼 물리명 규칙/)).toBeVisible({ timeout: 20_000 });
    await page.unroute("**/api/mdm/oasis/ruleMng/reg");
  });

  test("T6 수용 2: 등록 폼에 원천 선택 칸이 없고 MDM 고정이다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    const form = page.getByTestId("rule-register-form");
    await expect(form.getByTestId("rule-reg-source")).toHaveText(/MDM/);
    await expect(form.locator("select")).toHaveCount(1); // 종류만 고른다
    await expect(form.getByText("EXTERNAL")).toHaveCount(0);
  });

  test("T7 권한: 표준 관리자(READ)는 목록은 보고 등록 버튼은 비활성이다", async ({ page }) => {
    await login(page, STDADMIN);
    await openRuleMng(page);
    await expect(page.getByTestId("rule-link-QLTY_GRD_JDG")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("rule-reg-id").fill("E2E_READ_JDG");
    await page.getByTestId("rule-reg-name").fill("권한 없음");
    await expect(page.getByRole("button", { name: "룰 등록" })).toBeDisabled();
  });
});
