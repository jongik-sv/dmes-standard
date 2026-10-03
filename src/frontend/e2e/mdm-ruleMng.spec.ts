import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { BASE_URL, T, login, openRuleMenu, type LoginOptions } from "./support/common";
import { loadMdmFixture } from "./support/mdm-e2e";

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
 * mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql·mdm-ruleEdit-users.sql, beforeAll 이 e2e/fixtures/mdm-ruleEdit-data.sql 을 넣는다.
 * 룰을 만들므로 같은 mdm.db 로 다시 돌릴 수 없다(새 DB 로 시작). 편집 시나리오는 SYSADMIN 이 아니라 담당자로 로그인한다.
 */

/** 헤더·버전 시나리오(H 계열) 전용 픽스처 룰 — mdm-ruleEdit-data.sql 끝. */
const VER_RULE = "E2E_VER_JDG";
const VER_RULE_NAME = "E2E 버전 판정";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
/** 둘째 담당자 — 소유권 시험(선점·해제)에 쓴다. */
const STEWARD2 = process.env.SMOKE_MDM_STEWARD2_USER ?? "e2e_mdm_steward2";
const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-02/screens", name);

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW };

async function openRuleMng(page: Page) {
  await openRuleMenu(page, /^룰$/);
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
  // 룰 ID 링크는 룰 화면 탭을 연다(기능설계서 G-001) — 상세는 행의 다른 칸(룰명)을 눌러 연다(행 클릭).
  await page.locator(".ag-row", { has: page.getByTestId(`rule-link-${ruleId}`) }).locator('.ag-cell[col-id="maruRuleName"]').click();
  await expect(page.getByTestId("rule-header-id")).toHaveText(ruleId, { timeout: 30_000 });
}

/**
 * 버전 표에서 한 줄을 고른다. 소유·잠금 배지(편집 중(나)·잠김·선점 가능)는 표 안이 아니라 같은 ② 버전 카드의 버튼 줄 끝에 있다
 * (VersionActionBar trailing, b120a8af) — 배지는 rule-card-versions 범위에서 찾는다.
 */
/** ver 는 서버 표기 `"1.000"`(D-144) — 버전 목록의 행 키(row-id)가 이 문자열이다. */
function versionRow(page: Page, ver: string) {
  return page.getByTestId("rule-version-table").locator(`.ag-center-cols-container .ag-row[row-id="${ver}"]`);
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dme/ruleMng", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => loadMdmFixture("mdm-ruleEdit-data.sql"));

  test("T1 메뉴: 마루 MDM > 업무기준 > 룰 이 열린다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await expect(page.locator(".page-layout__title:visible", { hasText: /^룰$/ })).toBeVisible();
  });

  test("T2 목록·빈 상태: 픽스처 룰이 서버 데이터로 보이고 없는 키워드면 빈 상태다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 픽스처 룰이 보인다.
    await page.getByRole("button", { name: "조회", exact: true }).click();
    const qlty = page.locator(".ag-row", { has: page.getByTestId("rule-link-QLTY_GRD_JDG") });
    await expect(qlty).toBeVisible({ timeout: 30_000 });
    await expect(qlty.locator('[col-id="releasedVer"]')).toHaveText("v1.000");
    await expect(qlty.locator('[col-id="hitPolicy"]')).toHaveText("FIRST");
    await expect(page.getByTestId("rule-link-E2E_LOCK_JDG")).toBeVisible();
    await page.screenshot({ path: screenshot("dme-ruleMng-list.png"), fullPage: true });

    await search(page, "NO_SUCH_RULE");
    await expect(page.getByTestId("rule-list-empty")).toHaveText("조회된 룰이 없습니다.", { timeout: 20_000 });
    await expect(page.locator(".grid-panel-count")).toHaveText("0건");
  });

  test("T3 등록: 등록하면 목록에 있고 고르면 상세가 버전 1 DRAFT·편집 중(나)으로 열린다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openRuleRegister(page);
    await page.getByTestId("rule-reg-id").fill("E2E_NEW_JDG");
    await page.getByTestId("rule-reg-name").fill("E2E 신규 판정");
    await page.getByTestId("rule-reg-kind").selectOption("DECISION");
    await page.screenshot({ path: screenshot("dme-ruleMng-register.png"), fullPage: true });
    await page.getByTestId("rule-reg-submit").click();
    await expect(page.getByTestId("rule-register-form")).toHaveCount(0, { timeout: 20_000 });

    // 등록하면 룰 화면(ruleEdit) 탭이 새 룰의 버전 1 DRAFT 로 열린다(ruleMng 기능설계서 B-003). 룰 탭으로 돌아와 목록을 본다.
    await expect(page.getByTestId("rule-edit-current")).toHaveText("E2E_NEW_JDG", { timeout: 60_000 });
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("1.000");
    await page.locator(".tab-item .tab-title", { hasText: /^룰$/ }).click();
    await expect(page.getByTestId("rule-search-keyword")).toBeVisible({ timeout: 20_000 });

    await search(page, "E2E_NEW");
    await expect(page.getByTestId("rule-link-E2E_NEW_JDG")).toBeVisible({ timeout: 20_000 });

    // D-105 — 고르면 같은 화면의 상세(① 헤더·② 버전)가 열린다(자동 선점된 버전 1 DRAFT).
    await openDetail(page, "E2E_NEW_JDG");
    await expect(page.getByTestId("rule-header-name")).toHaveValue("E2E 신규 판정");
    await expect(versionRow(page, "1.000").locator('[data-status="DRAFT"]')).toBeVisible();
    await expect(page.getByTestId("rule-card-versions").getByText("편집 중(나)")).toBeVisible();
  });

  test("T4 서버 오류: 같은 ID 로 등록하면 서버 중복 오류가 보인다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openRuleRegister(page);
    await page.getByTestId("rule-reg-id").fill("QLTY_GRD_JDG");
    await page.getByTestId("rule-reg-name").fill("중복 등록");
    await page.getByTestId("rule-reg-submit").click();
    await expect(page.getByRole("dialog").filter({ hasText: /같은 룰 ID 가 이미 있습니다/ }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("T5 수용 1: 물리명 규칙 위반은 즉시 안내하고 막으며, 가로채 보내도 서버가 거부한다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
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
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openRuleRegister(page);
    const form = page.getByTestId("rule-register-form");
    await expect(form.getByTestId("rule-reg-source")).toHaveText(/MDM/);
    await expect(form.locator("select")).toHaveCount(1); // 종류만 고른다
    await expect(form.getByText("EXTERNAL")).toHaveCount(0);
  });

  test("T7 권한: 표준 관리자(READ)는 목록은 보고 등록 버튼은 비활성이다", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
    await openRuleMng(page);
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(page.getByTestId("rule-link-QLTY_GRD_JDG")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#btn_rule_reg")).toBeDisabled();
  });
  // ── D-105 — ① 헤더·② 버전 상세 (옮겨 온 시험) ──
  // 헤더 이름·새 버전·DRAFT 삭제는 이 스펙 전용 룰 E2E_VER_JDG(픽스처) 로 한다. QLTY_GRD_JDG 는 이름순으로 먼저 도는
  // mdm-ruleEdit.spec.ts 가 픽스처의 2.000 DRAFT 를 고치는 룰이라, 여기서 새 버전·삭제를 하면 두 스펙이 서로를 깨뜨린다.

  test("H1 헤더: 룰명을 바꿔 바로 저장하면 다시 불러와도 유지된다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openDetail(page, VER_RULE);
    await page.getByTestId("rule-header-name").fill(`${VER_RULE_NAME} 수정`);
    await page.getByRole("button", { name: "헤더 저장", exact: true }).click();
    await expect(page.getByTestId("rule-header-name")).toHaveValue(`${VER_RULE_NAME} 수정`, { timeout: 20_000 });
    await page.reload();
    await openRuleMng(page);
    await openDetail(page, VER_RULE);
    await expect(page.getByTestId("rule-header-name")).toHaveValue(`${VER_RULE_NAME} 수정`);
  });

  test("H2 수용 5: 새 버전은 버전 2 DRAFT(base 1, 편집 중(나))이고 그 뒤 새 버전은 막힌다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openDetail(page, VER_RULE);
    await page.getByRole("button", { name: "새 버전(major)", exact: true }).click();
    await expect(versionRow(page, "2.000").locator('[data-status="DRAFT"]')).toBeVisible({ timeout: 20_000 });
    await expect(versionRow(page, "2.000").locator('.ag-cell[col-id="baseVer"]')).toHaveText("v1.000");
    // 잠금 배지는 고른 버전 하나만 보인다(버튼 줄 끝) — 새 버전을 만들어도 고른 행은 그대로라 2.000 을 골라 확인한다.
    await versionRow(page, "2.000").locator('.ag-cell[col-id="ver"]').click();
    await expect(page.getByTestId("rule-card-versions").getByText("편집 중(나)")).toBeVisible();
    await expect(page.getByRole("button", { name: "새 버전(major)", exact: true })).toBeDisabled();
    await expect(page.getByTestId("rule-unapplied-notice")).toContainText("미적용 버전");
  });

  test("H3 적중 정책(D-133): 버전 목록에 보이기만 하고 고치는 칸이 없다 — 고치는 곳은 룰 편집 화면의 의사결정표", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openDetail(page, VER_RULE);
    await expect(versionRow(page, "1.000").locator('.ag-cell[col-id="hitPolicy"]')).toHaveText("FIRST");
    await expect(page.getByTestId("rule-hit-policy")).toHaveCount(0);
    await expect(page.getByTestId("rule-hit-policy-save")).toHaveCount(0);
    await expect(page.getByTestId("rule-hit-policy-hint")).toContainText("의사결정표");
  });

  test("H4 수용 4: 다른 담당자가 편집 중인 DRAFT 는 잠김이고 헤더·버전 조작이 모두 막힌다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openDetail(page, "E2E_LOCK_JDG");
    await expect(page.getByTestId("rule-card-versions").getByText(`잠김 · ${STEWARD2} 편집 중`)).toBeVisible();
    for (const name of ["삭제", "선점", "해제", "넘기기(준비 중)"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    }
    await expect(page.getByTestId("rule-header-name")).toBeDisabled();
  });

  test("H5 해제·선점: 소유자가 해제하면 다른 담당자가 선점해 편집 중(나)이 된다", async ({ browser }) => {
    const owner = await browser.newPage();
    await login(owner, STEWARD2, LOGIN_OPTS);
    await openRuleMng(owner);
    await openDetail(owner, "E2E_LOCK_JDG");
    await expect(owner.getByTestId("rule-card-versions").getByText("편집 중(나)")).toBeVisible();
    await owner.getByRole("button", { name: "해제", exact: true }).click();
    await expect(owner.getByTestId("rule-card-versions").getByText("선점 가능")).toBeVisible({ timeout: 20_000 });
    await owner.close();

    const other = await browser.newPage();
    await login(other, STEWARD, LOGIN_OPTS);
    await openRuleMng(other);
    await openDetail(other, "E2E_LOCK_JDG");
    await other.getByRole("button", { name: "선점", exact: true }).click();
    await expect(other.getByTestId("rule-card-versions").getByText("편집 중(나)")).toBeVisible({ timeout: 20_000 });
    await other.close();
  });

  test("H7 DRAFT 삭제: 버전 2 를 지우면 사라지고 새 버전이 다시 켜진다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openDetail(page, VER_RULE);
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).last().click();
    await expect(versionRow(page, "2.000")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "새 버전(major)", exact: true })).toBeEnabled();
  });

  test("H8 내용 편집 이동: [내용 편집 →] 은 내용 화면을 그 룰·버전으로 연다(I28)", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openDetail(page, VER_RULE);
    await page.getByRole("button", { name: "내용 편집 →" }).click();
    await expect(page.getByTestId("rule-edit-current")).toHaveText(VER_RULE, { timeout: 60_000 });
    await expect(page.getByTestId("rule-ver-select")).toHaveValue("1.000");
  });

  // H1 이 룰 이름을 바꾸므로 헤더 이름은 화면이 읽은 값에서 파생해 쓴다. 화면이 읽어 둔 auditVer 를 다른 요청이 먼저 올려 충돌을 만든다.
  test("H6 서버 오류: 헤더 저장이 MDM001 로 거부되면 다시 불러오기가 보인다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMng(page);
    await openDetail(page, VER_RULE);
    const view = (await (await page.request.post(`${BASE_URL}/api/mdm/oasis/ruleMng/view`, {
      data: { meta: { menuId: "ruleMng" }, params: { maruRuleId: VER_RULE } },
    })).json()).data.result;
    const other = await page.request.post(`${BASE_URL}/api/mdm/oasis/ruleMng/save`, {
      data: {
        meta: { menuId: "ruleMng" },
        params: { target: "HEADER", maruRuleId: VER_RULE, auditVer: view.header.auditVer, maruRuleName: `${view.header.maruRuleName} 다른이` },
      },
    });
    expect((await other.json()).meta.success, "먼저 저장이 성공해야 한다").toBe(true);
    await page.getByTestId("rule-header-name").fill(`${view.header.maruRuleName} 수정2`);
    await page.getByRole("button", { name: "헤더 저장", exact: true }).click();
    // 설계(TSK-08-02 design.md:444, D-105 (5)): MDM001 이면 '다른 창에서 바뀌었습니다. 다시 불러오세요' 를 보인다.
    await expect(page.getByRole("dialog").getByText("다른 창에서 바뀌었습니다. 다시 불러오세요")).toBeVisible({ timeout: 20_000 });
    // 오류 창을 닫아도 거부는 상세를 다시 부르지 않으므로 입력이 남고, 상세 맨 위에 [다시 불러오기] 가 남는다(ruleMng 기능설계서 N-6).
    await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("rule-header-name")).toHaveValue(`${view.header.maruRuleName} 수정2`);
    const reload = page.getByTestId("rule-conflict-reload");
    await expect(reload).toBeVisible();
    // [다시 불러오기] 는 서버 값(다른 요청이 저장한 이름)으로 돌아가고 안내를 끈다.
    await reload.click();
    await expect(page.getByTestId("rule-header-name")).toHaveValue(`${view.header.maruRuleName} 다른이`, { timeout: 20_000 });
    await expect(reload).toHaveCount(0);
  });
});
