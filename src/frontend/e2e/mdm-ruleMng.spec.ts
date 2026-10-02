import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * mdm dme/ruleMng(룰 헤더·버전) — TSK-08-02 design.md §3.4.1, decisions.md D-105.
 *
 * 스모크 넷: T1 메뉴 이동, T2 목록(서버 데이터)·빈 상태, T3 등록 한 번(팝업에서 등록하면 상세에 새 룰이 뜨고 목록에 반영), T4 서버 오류.
 * 고유: T5 수용 1(ID 물리명 규칙 — 즉시 안내 + 서버 거부), T6 수용 2(원천 선택 칸 없음), T7 권한(READ 는 [룰 등록] 버튼이 비활성).
 *
 * D-105 — 이 화면이 ① 헤더·② 버전(목록 + 상세)까지 맡는다. H 계열은 옮겨 온 시험이다:
 * 헤더 저장(낙관적 잠금 auditVer)·폐기·적중 정책 표시(D-133 — 고치는 곳은 ruleEdit)·새 버전·DRAFT 삭제·선점·해제·넘기기·확정취소·확정.
 *
 * 전제(design.md 「E2E 서버 절차」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고,
 * mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql·mdm-ruleEdit-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-ruleEdit-data.sql 을 넣는다.
 * 룰을 만들므로 같은 mdm.db 로 다시 돌릴 수 없다(새 DB 로 시작). 편집 시나리오는 SYSADMIN 이 아니라 담당자로 로그인한다.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
/** 둘째 담당자 — 소유권 시험(선점·해제)에 쓴다. */
const STEWARD2 = process.env.SMOKE_MDM_STEWARD2_USER ?? "e2e_mdm_steward2";
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
  await expect(page.locator("#btn_rule_reg")).toBeVisible({ timeout: 60_000 });
}

/** 목록 헤더 [룰 등록] 으로 등록 팝업을 연다. 팝업은 열 때만 마운트되고 칸은 빈 채로 시작한다. */
async function openRuleRegister(page: Page) {
  await page.locator("#btn_rule_reg").click();
  await expect(page.getByTestId("rule-register-form")).toBeVisible({ timeout: 20_000 });
}

async function search(page: Page, keyword: string) {
  await page.getByTestId("rule-search-keyword").fill(keyword);
  await page.getByRole("button", { name: "조회", exact: true }).click();
}

/** 목록에서 룰을 골라 ① 헤더·② 버전 상세를 연다(D-105). */
async function openDetail(page: Page, ruleId: string) {
  // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러 그 룰을 목록에 올린 뒤 고른다.
  await search(page, ruleId);
  await page.getByTestId(`rule-link-${ruleId}`).click();
  await expect(page.getByTestId("rule-header-id")).toHaveText(ruleId, { timeout: 30_000 });
}

/** 버전 표에서 한 줄을 고른다. */
function versionRow(page: Page, ver: number) {
  return page.getByTestId("rule-version-table").locator(`.ag-center-cols-container .ag-row[row-id="${ver}"]`);
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
    // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 픽스처 룰이 보인다.
    await page.getByRole("button", { name: "조회", exact: true }).click();
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

  test("T3 등록: 등록하면 목록에 있고 고르면 상세가 버전 1 DRAFT·편집 중(나)으로 열린다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openRuleRegister(page);
    await page.getByTestId("rule-reg-id").fill("E2E_NEW_JDG");
    await page.getByTestId("rule-reg-name").fill("E2E 신규 판정");
    await page.getByTestId("rule-reg-kind").selectOption("DECISION");
    await page.screenshot({ path: screenshot("dme-ruleMng-register.png"), fullPage: true });
    await page.getByTestId("rule-reg-submit").click();
    await expect(page.getByTestId("rule-register-form")).toHaveCount(0, { timeout: 20_000 });

    await search(page, "E2E_NEW");
    await expect(page.getByTestId("rule-link-E2E_NEW_JDG")).toBeVisible({ timeout: 20_000 });

    // D-105 — 고르면 같은 화면의 상세(① 헤더·② 버전)가 열린다(자동 선점된 버전 1 DRAFT).
    await openDetail(page, "E2E_NEW_JDG");
    await expect(page.getByTestId("rule-header-name")).toHaveValue("E2E 신규 판정");
    await expect(versionRow(page, 1).locator('[data-status="DRAFT"]')).toBeVisible();
    await expect(page.getByTestId("rule-version-table").getByText("편집 중(나)")).toBeVisible();
  });

  test("T4 서버 오류: 같은 ID 로 등록하면 서버 중복 오류가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openRuleRegister(page);
    await page.getByTestId("rule-reg-id").fill("QLTY_GRD_JDG");
    await page.getByTestId("rule-reg-name").fill("중복 등록");
    await page.getByTestId("rule-reg-submit").click();
    await expect(page.getByRole("dialog").filter({ hasText: /같은 룰 ID 가 이미 있습니다/ }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("T5 수용 1: 물리명 규칙 위반은 즉시 안내하고 막으며, 가로채 보내도 서버가 거부한다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openRuleRegister(page);
    await page.getByTestId("rule-reg-id").fill("qlty-bad");
    await page.getByTestId("rule-reg-name").fill("규칙 위반");
    await expect(page.getByText(/컬럼 물리명 규칙/).first()).toBeVisible();
    await expect(page.getByTestId("rule-reg-submit")).toBeDisabled();

    // 화면 검사를 지나도록 올바른 ID 를 넣고, 요청 본문을 규칙 위반 ID 로 바꿔 보낸다 → 서버가 판정한다(I1).
    await page.getByTestId("rule-reg-id").fill("E2E_ROUTE_JDG");
    await page.route("**/api/mdm/oasis/ruleMng/reg", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      body.params.maruRuleId = "qlty-bad";
      await route.continue({ postData: JSON.stringify(body) });
    });
    await page.getByTestId("rule-reg-submit").click();
    // 서버 오류 ErrorModal — 등록 팝업(rule-register-form 을 품은 dialog)이 아닌 dialog 로 좁힌다.
    await expect(page.getByRole("dialog").filter({ hasNot: page.getByTestId("rule-register-form") }).getByText(/컬럼 물리명 규칙/)).toBeVisible({ timeout: 20_000 });
    await page.unroute("**/api/mdm/oasis/ruleMng/reg");
  });

  test("T6 수용 2: 등록 폼에 원천 선택 칸이 없고 MDM 고정이다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openRuleRegister(page);
    const form = page.getByTestId("rule-register-form");
    await expect(form.getByTestId("rule-reg-source")).toHaveText(/MDM/);
    await expect(form.locator("select")).toHaveCount(1); // 종류만 고른다
    await expect(form.getByText("EXTERNAL")).toHaveCount(0);
  });

  test("T7 권한: 표준 관리자(READ)는 목록은 보고 등록 버튼은 비활성이다", async ({ page }) => {
    await login(page, STDADMIN);
    await openRuleMng(page);
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(page.getByTestId("rule-link-QLTY_GRD_JDG")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#btn_rule_reg")).toBeDisabled();
  });
  // ── D-105 — ① 헤더·② 버전 상세 (옮겨 온 시험) ──

  test("H1 헤더: 룰명을 바꿔 바로 저장하면 다시 불러와도 유지된다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openDetail(page, "QLTY_GRD_JDG");
    await page.getByTestId("rule-header-name").fill("품질 등급 판정 E2E");
    await page.getByRole("button", { name: "헤더 저장", exact: true }).click();
    await expect(page.getByTestId("rule-header-name")).toHaveValue("품질 등급 판정 E2E", { timeout: 20_000 });
    await page.reload();
    await openRuleMng(page);
    await openDetail(page, "QLTY_GRD_JDG");
    await expect(page.getByTestId("rule-header-name")).toHaveValue("품질 등급 판정 E2E");
  });

  test("H2 수용 5: 새 버전은 버전 2 DRAFT(base 1, 편집 중(나))이고 그 뒤 새 버전은 막힌다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openDetail(page, "QLTY_GRD_JDG");
    await page.getByRole("button", { name: "새 버전", exact: true }).click();
    await expect(versionRow(page, 2).locator('[data-status="DRAFT"]')).toBeVisible({ timeout: 20_000 });
    await expect(versionRow(page, 2).locator('.ag-cell[col-id="baseVer"]')).toHaveText("1");
    await expect(page.getByTestId("rule-version-table").getByText("편집 중(나)")).toBeVisible();
    await expect(page.getByRole("button", { name: "새 버전", exact: true })).toBeDisabled();
    await expect(page.getByTestId("rule-unapplied-notice")).toContainText("미적용 버전");
  });

  test("H3 적중 정책(D-133): 버전 목록에 보이기만 하고 고치는 칸이 없다 — 고치는 곳은 룰 편집 화면의 의사결정표", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openDetail(page, "QLTY_GRD_JDG");
    await expect(versionRow(page, 1).locator('.ag-cell[col-id="hitPolicy"]')).toHaveText("FIRST");
    await expect(page.getByTestId("rule-hit-policy")).toHaveCount(0);
    await expect(page.getByTestId("rule-hit-policy-save")).toHaveCount(0);
    await expect(page.getByTestId("rule-hit-policy-hint")).toContainText("의사결정표");
  });

  test("H4 수용 4: 다른 담당자가 편집 중인 DRAFT 는 잠김이고 헤더·버전 조작이 모두 막힌다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openDetail(page, "E2E_LOCK_JDG");
    await expect(page.getByTestId("rule-version-table").getByText(`잠김 · ${STEWARD2} 편집 중`)).toBeVisible();
    for (const name of ["삭제", "선점", "해제", "넘기기(준비 중)"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    }
    await expect(page.getByTestId("rule-header-name")).toBeDisabled();
  });

  test("H5 해제·선점: 소유자가 해제하면 다른 담당자가 선점해 편집 중(나)이 된다", async ({ browser }) => {
    const owner = await browser.newPage();
    await login(owner, STEWARD2);
    await openRuleMng(owner);
    await openDetail(owner, "E2E_LOCK_JDG");
    await expect(owner.getByTestId("rule-version-table").getByText("편집 중(나)")).toBeVisible();
    await owner.getByRole("button", { name: "해제", exact: true }).click();
    await expect(owner.getByTestId("rule-version-table").getByText("선점 가능")).toBeVisible({ timeout: 20_000 });
    await owner.close();

    const other = await browser.newPage();
    await login(other, STEWARD);
    await openRuleMng(other);
    await openDetail(other, "E2E_LOCK_JDG");
    await other.getByRole("button", { name: "선점", exact: true }).click();
    await expect(other.getByTestId("rule-version-table").getByText("편집 중(나)")).toBeVisible({ timeout: 20_000 });
    await other.close();
  });

  test("H6 서버 오류: 헤더 저장이 MDM001 로 거부되면 다시 불러오기가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openDetail(page, "QLTY_GRD_JDG");
    await page.route("**/api/mdm/oasis/ruleMng/save", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요 (MDM001)" }, data: {} }),
      }),
    );
    await page.getByTestId("rule-header-name").fill("품질 등급 판정 E2E2");
    await page.getByRole("button", { name: "헤더 저장", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("다른 창에서 바뀌었습니다. 다시 불러오세요")).toBeVisible({ timeout: 20_000 });
    await page.unroute("**/api/mdm/oasis/ruleMng/save");
  });

  test("H7 DRAFT 삭제: 버전 2 를 지우면 사라지고 새 버전이 다시 켜진다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openDetail(page, "QLTY_GRD_JDG");
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
    await expect(versionRow(page, 2)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "새 버전", exact: true })).toBeEnabled();
  });

  test("H8 내용 편집 이동: [내용 편집 →] 은 내용 화면을 그 룰·버전으로 연다(I28)", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleMng(page);
    await openDetail(page, "QLTY_GRD_JDG");
    await page.getByRole("button", { name: "내용 편집 →" }).click();
    await expect(page.getByTestId("rule-edit-current")).toHaveText("QLTY_GRD_JDG", { timeout: 60_000 });
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("1");
  });
});
