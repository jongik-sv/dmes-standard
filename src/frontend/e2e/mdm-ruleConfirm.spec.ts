import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, T, login, openRuleMenu, type LoginOptions } from "./support/common";
import { clickSearch, fillDateTime, loadMdmFixture } from "./support/mdm-e2e";
import { gridRowById } from "./support/grid";

/**
 * 룰 버전 확정(ruleConfirm) — TSK-08-05 design.md §3.4 화면 스모크 넷 + 수용 기준.
 *
 *   T1 담당자: 메뉴(마루 MDM > 업무기준 > 버전 확정)로 화면이 열린다(스모크 넷 1, 수용 기준 4).
 *   T2 담당자: 확정 대기 목록이 서버 데이터(E2E_RC_*)로 채워지고, keyword NO_SUCH 면 빈 상태(스모크 넷 2).
 *   T3 담당자: 룰(ruleMng) 상세에서 E2E_RC_CASEFAIL v1.000 을 고르고 [확정 →] → 버전 확정 탭이 그 룰·버전으로 열린다.
 *      (확정 이동은 룰 헤더·버전 카드를 ruleMng 으로 나눌 때(86ec7d67, D-105) 룰 화면(ruleEdit)에서 룰 상세의 버전 버튼 줄로 옮겨졌다.)
 *   T4 담당자: (T3 이어서) 검사 → 값 테스트 거부·적용 순서 면제·확정 버튼 비활성(수용 기준 1).
 *   T5 담당자: E2E_RC_OK 검사 → 경고 확인 → 확정 → 토스트·RELEASED 배지·목록에서 사라짐(스모크 넷 3).
 *   T6 담당자: E2E_RC_CONTRACT v2 검사 → 계약 변경 영역, 계약 확인란 전에는 확인 비활성 → 확정·직전 v1 닫힘.
 *   T7 담당자: E2E_RC_RACE 검사 뒤 다른 세션(page.request)이 먼저 확정 → 화면 확정이 서버 문구로 거부된다(스모크 넷 4).
 *   T8 표준 관리자: 메뉴로 열고 E2E_RC_CASEFAIL 을 골라도 검사·확정 버튼이 비활성(수용 기준 2 의 화면 판).
 *
 * 전제(design.md 「서버·E2E 기동 방법」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고, mcm 기동
 * 뒤 e2e/fixtures/mdm-rbac-users.sql, beforeAll 이 e2e/fixtures/mdm-ruleConfirm-data.sql 을 넣는다. 이 spec 은 E2E_RC_OK·
 * CONTRACT·RACE 를 확정하므로, 다시 돌리려면 먼저 mdm-ruleConfirm-data.sql 을 다시 넣는다(E2E_RC_* 를 지우고 다시 넣는다).
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STD_ADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const BREADCRUMB = "마루 MDM > 업무기준 > 버전 확정";
const RACE_REJECTED = /DRAFT 상태에서만 할 수 있습니다|다른 사용자가 수정했습니다/;

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-05/screens", name);

function tid(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW, exactButton: true };

/** 메뉴는 보이는 항목만 잡는다(visibleOnly) — "버전 확정" leaf 는 마스터코드(codeConfirm) 아래에도 있다. */
async function openRuleConfirm(page: Page) {
  await openRuleMenu(page, /^버전 확정$/, { visibleOnly: true });
  await expect(tid(page, "rc-list")).toBeVisible({ timeout: T.SLOW });
}

/** ver 는 서버 표기 `"1.000"`(D-144) — 행 키·대상 문구가 이 문자열을 쓴다. */
async function choose(page: Page, id: string, ver: string) {
  const row = tid(page, `rc-row-${id}-${ver}`);
  await expect(row).toBeVisible({ timeout: T.UI });
  await row.click();
  await expect(tid(page, "rc-target")).toContainText(`${id} 버전 v${ver}`, { timeout: T.UI });
}

/** 적용 시작(shared DateTimePicker — 6e506cc9 에서 datetime-local 을 바꿨다)에 `yyyy-MM-dd HH:mm:ss` 로 넣고 검사한다. */
async function validate(page: Page, applyFrom: string) {
  await fillDateTime(tid(page, "rc-apply-from"), applyFrom);
  await tid(page, "rc-validate").click();
  await expect(tid(page, "rc-checks")).toBeVisible({ timeout: T.LONG });
}

test.describe.configure({ mode: "serial" });

test.describe("mdm ruleConfirm — 룰 버전 확정", () => {
  test.setTimeout(150_000);

  test.beforeAll(() => loadMdmFixture("mdm-ruleConfirm-data.sql"));

  test("T1 담당자: 메뉴로 화면이 열린다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleConfirm(page);

    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await page.screenshot({ path: screenshot("dme-ruleConfirm-open.png"), fullPage: true });
  });

  test("T2 담당자: 확정 대기 목록이 서버 데이터로 채워지고, 걸러 없으면 빈 상태가 보인다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleConfirm(page);

    await expect(tid(page, "rc-row-E2E_RC_OK-1.000")).toBeVisible({ timeout: T.UI });
    await expect(tid(page, "rc-row-E2E_RC_CASEFAIL-1.000")).toBeVisible();
    await expect(tid(page, "rc-row-E2E_RC_CONTRACT-2.000")).toBeVisible();
    await expect(tid(page, "rc-row-E2E_RC_RACE-1.000")).toBeVisible();
    // RELEASED v1 은 확정 대기 목록에 없다
    await expect(tid(page, "rc-row-E2E_RC_CONTRACT-1.000")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleConfirm-list.png"), fullPage: true });

    await tid(page, "rc-keyword").fill("NO_SUCH");
    await tid(page, "rc-search").click();
    await expect(tid(page, "rc-list-empty")).toHaveText("확정할 DRAFT 가 없습니다", { timeout: T.UI });
  });

  test("T3·T4 담당자: 룰 상세의 확정 이동으로 열고 검사하면 값 테스트 거부로 확정 버튼이 꺼진다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleMenu(page, /^룰$/, { visibleOnly: true });
    await expect(tid(page, "rule-search-keyword")).toBeVisible({ timeout: T.SLOW });
    // 룰 목록은 자동 조회되지 않는다(cf4fbb05) — 그 룰로 조회해 상세(① 헤더·② 버전)를 연다.
    await tid(page, "rule-search-keyword").fill("E2E_RC_CASEFAIL");
    await clickSearch(page);
    // 룰 ID 링크는 룰 화면 탭을 연다(기능설계서 G-001) — 상세는 행의 다른 칸(룰명)을 눌러 연다.
    await page.locator(".ag-row", { has: tid(page, "rule-link-E2E_RC_CASEFAIL") }).locator('.ag-cell[col-id="maruRuleName"]').click();
    await expect(tid(page, "rule-header-id")).toHaveText("E2E_RC_CASEFAIL", { timeout: T.LONG });
    await gridRowById(tid(page, "rule-version-table"), "1.000").locator('.ag-cell[col-id="ver"]').click();

    const move = tid(page, "rule-move-to-confirm");
    await expect(move).toBeEnabled({ timeout: T.UI });
    await move.click();

    // T3: 버전 확정 탭이 그 룰·버전으로 열린다
    await expect(tid(page, "rc-target")).toContainText("E2E_RC_CASEFAIL 버전 v1.000", { timeout: T.SLOW });
    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await expect(tid(page, "rc-previous")).toHaveText("최초 버전 — 적용 순서 검사를 하지 않습니다");

    // T4: 값 테스트 거부 · 적용 순서 면제 · 확정 비활성
    await validate(page, "2026-10-01 00:00:00");
    await expect(tid(page, "rc-check-status-TEST_CASES")).toHaveText("거부");
    await expect(tid(page, "rc-check-status-TEST_CASES")).toHaveAttribute("data-rejected", "true");
    // 검사 표는 AgDataGrid 다 — 행은 row-id(검사 항목)로 찾는다.
    await expect(gridRowById(tid(page, "rc-checks"), "TEST_CASES")).toContainText("CASE:1");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("면제");
    await expect(tid(page, "rc-check-status-NOT_EMPTY")).toHaveText("통과");
    await expect(tid(page, "rc-validate")).toBeEnabled();
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await page.screenshot({ path: screenshot("dme-ruleConfirm-rejected.png"), fullPage: true });
  });

  test("T5 담당자: 최초 버전을 경고 확인 뒤 확정하면 RELEASED 가 되고 목록에서 사라진다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleConfirm(page);
    await choose(page, "E2E_RC_OK", "1.000");

    await expect(tid(page, "rc-previous")).toHaveText("최초 버전 — 적용 순서 검사를 하지 않습니다");
    await validate(page, "2026-01-01 00:00:00");
    await expect(tid(page, "rc-check-status-TEST_CASES")).toHaveText("통과");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("면제");
    await expect(tid(page, "rc-check-status-SAVE_CHECKS")).toHaveText("경고");

    await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: T.UI });
    await tid(page, "rc-confirm").click();
    await expect(tid(page, "rc-modal-warnings")).toBeVisible({ timeout: T.UI });
    // 과거 일시라 미래 적용 경고는 없다(서버 futureApplyFrom=false). 최초 버전이라 계약 변경 확인란도 없다.
    await expect(tid(page, "rc-future-warning")).toHaveCount(0);
    await expect(tid(page, "rc-modal-contract")).toHaveCount(0);
    await expect(tid(page, "rc-modal-ok")).toBeDisabled();
    await tid(page, "rc-ack").getByText("경고를 확인했습니다").click();
    await expect(tid(page, "rc-modal-ok")).toBeEnabled();
    await tid(page, "rc-modal-ok").click();

    await expect(page.getByText("확정했습니다").first()).toBeVisible({ timeout: T.UI });
    await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: T.UI });
    await expect(tid(page, "rc-released")).toContainText("적용 구간 2026-01-01 00:00:00 ~ 9999-12-31 00:00:00");
    await expect(tid(page, "rc-released")).toContainText(`확정자 ${STEWARD}`);
    await expect(tid(page, "rc-row-E2E_RC_OK-1.000")).toHaveCount(0);
    await expect(tid(page, "rc-row-E2E_RC_RACE-1.000")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0); // 닫히는 대화상자가 스크린샷을 가리지 않게
    await page.screenshot({ path: screenshot("dme-ruleConfirm-confirmed.png"), fullPage: true });
  });

  test("T6 담당자: 계약 변경은 계약 확인란을 체크해야 확정되고, 직전 버전이 닫힌다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleConfirm(page);
    await choose(page, "E2E_RC_CONTRACT", "2.000");

    await expect(tid(page, "rc-previous")).toContainText("직전 RELEASED 버전 v1.000 · 2026-01-01 00:00:00");
    await expect(tid(page, "rc-diff-counts")).toHaveText("추가 0 · 삭제 0 · 수정 2 · 같음 0");
    // 먼 미래 일시 — 서버 시계 기준 futureApplyFrom=true 가 실행 날짜와 상관없이 늘 참이다.
    await validate(page, "2030-01-01 00:00:00");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("통과");
    await expect(tid(page, "rc-contract")).toHaveAttribute("data-state", "CHANGED");
    await expect(tid(page, "rc-contract")).toContainText("[COIL_WID]");
    await page.screenshot({ path: screenshot("dme-ruleConfirm-contract.png"), fullPage: true });

    await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: T.UI });
    await tid(page, "rc-confirm").click();
    await expect(tid(page, "rc-modal-contract")).toBeVisible({ timeout: T.UI });
    await expect(tid(page, "rc-future-warning")).toBeVisible();
    await expect(tid(page, "rc-modal-ok")).toBeDisabled();
    // 일반 경고가 있으면 그 확인란을 먼저 체크한다 — 계약 변경 확인란 전에는 여전히 비활성이어야 한다(I44).
    if (await tid(page, "rc-ack").count()) {
      await tid(page, "rc-ack").getByText("경고를 확인했습니다").click();
      await expect(tid(page, "rc-modal-ok")).toBeDisabled();
    }
    await tid(page, "rc-contract-ack").getByText("입력 계약 변경을 확인했습니다").click();
    await expect(tid(page, "rc-modal-ok")).toBeEnabled();
    await tid(page, "rc-modal-ok").click();

    await expect(page.getByText("확정했습니다").first()).toBeVisible({ timeout: T.UI });
    await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: T.UI });
    await expect(tid(page, "rc-closed-previous")).toHaveText("직전 버전 v1.000 의 적용을 닫았습니다");
    await expect(tid(page, "rc-released")).toContainText("적용 구간 2030-01-01 00:00:00 ~ 9999-12-31 00:00:00");
    await expect(tid(page, "rc-row-E2E_RC_CONTRACT-2.000")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("T7 담당자: 다른 세션이 먼저 확정하면 화면 확정이 서버 문구로 거부된다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleConfirm(page);
    await choose(page, "E2E_RC_RACE", "1.000");
    await validate(page, "2026-02-01 00:00:00");
    await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: T.UI });

    // 빈틈 경고가 있으므로 먼저 확정하는 세션은 경고 확인(true)을 보낸다 — false 면 MDM014 로 경합이 만들어지지 않는다.
    const res = await page.request.post(`${BASE_URL}/api/mdm/oasis/ruleConfirm/confirm`, {
      data: {
        meta: { menuId: "ruleConfirm" },
        params: {
          maruRuleId: "E2E_RC_RACE", ver: "1.000", rowVersion: 0, applyFrom: "2026-02-01 00:00:00",
          warningsAcknowledged: true,
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.meta?.success, JSON.stringify(body.meta)).not.toBe(false);

    await tid(page, "rc-confirm").click();
    await tid(page, "rc-ack").getByText("경고를 확인했습니다").click();
    await expect(tid(page, "rc-modal-ok")).toBeEnabled({ timeout: T.UI });
    await tid(page, "rc-modal-ok").click();
    await expect(tid(page, "rc-error")).toContainText(RACE_REJECTED, { timeout: T.UI });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleConfirm-error.png"), fullPage: true });
  });

  test("T8 표준 관리자: 검사·확정 버튼이 비활성이다", async ({ page }) => {
    // 권한 조회가 끝나기 전에는 버튼이 늘 꺼져 있으므로, 조회 응답을 받은 뒤에 단언한다(무조건 통과 방지).
    const rbacLoaded = page.waitForResponse((r) => r.url().includes("/secUser/myButtonEndpoints") && r.ok(), {
      timeout: T.SLOW,
    });
    await login(page, STD_ADMIN, LOGIN_OPTS);
    await openRuleConfirm(page);
    await rbacLoaded;
    await choose(page, "E2E_RC_CASEFAIL", "1.000");

    await expect(tid(page, "rc-apply-from")).toBeVisible();
    await expect(tid(page, "rc-validate")).toBeDisabled();
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await page.screenshot({ path: screenshot("dme-ruleConfirm-readonly.png"), fullPage: true });
  });
});
