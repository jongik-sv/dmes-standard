import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 룰 버전 확정(ruleConfirm) — TSK-08-05 design.md §3.4 화면 스모크 넷 + 수용 기준.
 *
 *   T1 담당자: 메뉴(마루 MDM > 업무기준 > 버전 확정)로 화면이 열린다(스모크 넷 1, 수용 기준 4).
 *   T2 담당자: 확정 대기 목록이 서버 데이터(E2E_RC_*)로 채워지고, keyword NO_SUCH 면 빈 상태(스모크 넷 2).
 *   T3 담당자: 룰 화면에서 E2E_RC_CASEFAIL v1 을 고르고 "확정 이동" → 버전 확정 탭이 그 룰·버전으로 열린다.
 *   T4 담당자: (T3 이어서) 검사 → 값 테스트 거부·적용 순서 면제·확정 버튼 비활성(수용 기준 1).
 *   T5 담당자: E2E_RC_OK 검사 → 경고 확인 → 확정 → 토스트·RELEASED 배지·목록에서 사라짐(스모크 넷 3).
 *   T6 담당자: E2E_RC_CONTRACT v2 검사 → 계약 변경 영역, 계약 확인란 전에는 확인 비활성 → 확정·직전 v1 닫힘.
 *   T7 담당자: E2E_RC_RACE 검사 뒤 다른 세션(page.request)이 먼저 확정 → 화면 확정이 서버 문구로 거부된다(스모크 넷 4).
 *   T8 표준 관리자: 메뉴로 열고 E2E_RC_CASEFAIL 을 골라도 검사·확정 버튼이 비활성(수용 기준 2 의 화면 판).
 *
 * 전제(design.md 「서버·E2E 기동 방법」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고, mcm 기동
 * 뒤 e2e/fixtures/mdm-rbac-users.sql, mdm 기동 뒤 e2e/fixtures/mdm-ruleConfirm-data.sql 을 넣는다. 이 spec 은 E2E_RC_OK·
 * CONTRACT·RACE 를 확정하므로, 다시 돌리려면 먼저 mdm-ruleConfirm-data.sql 을 다시 넣는다(E2E_RC_* 를 지우고 다시 넣는다).
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STD_ADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const BREADCRUMB = "마루 MDM > 업무기준 > 버전 확정";
const RACE_REJECTED = /DRAFT 상태에서만 할 수 있습니다|다른 사용자가 수정했습니다/;

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-08-05/screens", name);

function tid(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
}

/** 보이는 메뉴 항목만 잡는다 — "버전 확정" leaf 는 마스터코드(codeConfirm) 아래에도 있다. */
function menuItem(page: Page, text: RegExp): Locator {
  return page.locator(".tree-item .item-name:visible").filter({ hasText: text }).first();
}

/** 메뉴 트리를 따라 연다. 하위 항목이 이미 보이면 상위를 누르지 않는다(누르면 접힌다). */
async function openMenu(page: Page, leaf: RegExp) {
  const trail = [/^마루 MDM$/, /^업무기준$/, leaf];
  for (let i = 0; i < trail.length; i++) {
    const item = menuItem(page, trail[i]);
    await expect(item).toBeVisible({ timeout: 20_000 });
    if (i < trail.length - 1 && (await menuItem(page, trail[i + 1]).isVisible())) continue;
    await item.click();
  }
}

async function openRuleConfirm(page: Page) {
  await openMenu(page, /^버전 확정$/);
  await expect(tid(page, "rc-list")).toBeVisible({ timeout: 60_000 });
}

async function choose(page: Page, id: string, ver: number) {
  const row = tid(page, `rc-row-${id}-${ver}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(tid(page, "rc-target")).toContainText(`${id} 버전 ${ver}`, { timeout: 20_000 });
}

/** datetime-local(step 1) 에 `yyyy-MM-ddTHH:mm` 로 넣고 검사한다. 초가 0 이면 Chromium 이 값을 분 단위로 정규화하므로
 * 초 없이 넣는다. 화면이 초 `:00` 을 붙여 보낸다(I38). */
async function validate(page: Page, applyFrom: string) {
  await tid(page, "rc-apply-from").fill(applyFrom);
  await tid(page, "rc-validate").click();
  await expect(tid(page, "rc-checks")).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("mdm ruleConfirm — 룰 버전 확정", () => {
  test.setTimeout(150_000);

  test("T1 담당자: 메뉴로 화면이 열린다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleConfirm(page);

    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await page.screenshot({ path: screenshot("dme-ruleConfirm-open.png"), fullPage: true });
  });

  test("T2 담당자: 확정 대기 목록이 서버 데이터로 채워지고, 걸러 없으면 빈 상태가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleConfirm(page);

    await expect(tid(page, "rc-row-E2E_RC_OK-1")).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "rc-row-E2E_RC_CASEFAIL-1")).toBeVisible();
    await expect(tid(page, "rc-row-E2E_RC_CONTRACT-2")).toBeVisible();
    await expect(tid(page, "rc-row-E2E_RC_RACE-1")).toBeVisible();
    // RELEASED v1 은 확정 대기 목록에 없다
    await expect(tid(page, "rc-row-E2E_RC_CONTRACT-1")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dme-ruleConfirm-list.png"), fullPage: true });

    await tid(page, "rc-keyword").fill("NO_SUCH");
    await tid(page, "rc-search").click();
    await expect(tid(page, "rc-list-empty")).toHaveText("확정할 DRAFT 가 없습니다", { timeout: 20_000 });
  });

  test("T3·T4 담당자: 룰 화면의 확정 이동으로 열고 검사하면 값 테스트 거부로 확정 버튼이 꺼진다", async ({ page }) => {
    await login(page, STEWARD);
    await openMenu(page, /^룰 화면$/);
    await expect(tid(page, "rule-pick-keyword")).toBeVisible({ timeout: 60_000 });
    await tid(page, "rule-pick-keyword").fill("E2E_RC_CASEFAIL");
    await page.getByRole("button", { name: "찾기", exact: true }).click();
    await tid(page, "rule-pick-E2E_RC_CASEFAIL").click();
    await expect(tid(page, "rule-edit-current")).toHaveText("E2E_RC_CASEFAIL", { timeout: 30_000 });

    const move = page.getByRole("button", { name: "확정 이동", exact: true });
    await expect(move).toBeEnabled({ timeout: 20_000 });
    await move.click();

    // T3: 버전 확정 탭이 그 룰·버전으로 열린다
    await expect(tid(page, "rc-target")).toContainText("E2E_RC_CASEFAIL 버전 1", { timeout: 60_000 });
    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await expect(tid(page, "rc-previous")).toHaveText("최초 버전 — 적용 순서 검사를 하지 않습니다");

    // T4: 값 테스트 거부 · 적용 순서 면제 · 확정 비활성
    await validate(page, "2026-10-01T00:00");
    await expect(tid(page, "rc-check-status-TEST_CASES")).toHaveText("거부");
    await expect(tid(page, "rc-check-TEST_CASES")).toHaveAttribute("data-rejected", "true");
    await expect(tid(page, "rc-check-TEST_CASES")).toContainText("CASE:1");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("면제");
    await expect(tid(page, "rc-check-status-NOT_EMPTY")).toHaveText("통과");
    await expect(tid(page, "rc-validate")).toBeEnabled();
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await page.screenshot({ path: screenshot("dme-ruleConfirm-rejected.png"), fullPage: true });
  });

  test("T5 담당자: 최초 버전을 경고 확인 뒤 확정하면 RELEASED 가 되고 목록에서 사라진다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleConfirm(page);
    await choose(page, "E2E_RC_OK", 1);

    await expect(tid(page, "rc-previous")).toHaveText("최초 버전 — 적용 순서 검사를 하지 않습니다");
    await validate(page, "2026-01-01T00:00");
    await expect(tid(page, "rc-check-status-TEST_CASES")).toHaveText("통과");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("면제");
    await expect(tid(page, "rc-check-status-SAVE_CHECKS")).toHaveText("경고");

    await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: 20_000 });
    await tid(page, "rc-confirm").click();
    await expect(tid(page, "rc-modal-warnings")).toBeVisible({ timeout: 20_000 });
    // 과거 일시라 미래 적용 경고는 없다(서버 futureApplyFrom=false). 최초 버전이라 계약 변경 확인란도 없다.
    await expect(tid(page, "rc-future-warning")).toHaveCount(0);
    await expect(tid(page, "rc-modal-contract")).toHaveCount(0);
    await expect(tid(page, "rc-modal-ok")).toBeDisabled();
    await tid(page, "rc-ack").getByText("경고를 확인했습니다").click();
    await expect(tid(page, "rc-modal-ok")).toBeEnabled();
    await tid(page, "rc-modal-ok").click();

    await expect(page.getByText("확정했습니다").first()).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "rc-released")).toContainText("적용 구간 2026-01-01 00:00:00 ~ 9999-12-31 00:00:00");
    await expect(tid(page, "rc-released")).toContainText(`확정자 ${STEWARD}`);
    await expect(tid(page, "rc-row-E2E_RC_OK-1")).toHaveCount(0);
    await expect(tid(page, "rc-row-E2E_RC_RACE-1")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 }); // 닫히는 대화상자가 스크린샷을 가리지 않게
    await page.screenshot({ path: screenshot("dme-ruleConfirm-confirmed.png"), fullPage: true });
  });

  test("T6 담당자: 계약 변경은 계약 확인란을 체크해야 확정되고, 직전 버전이 닫힌다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleConfirm(page);
    await choose(page, "E2E_RC_CONTRACT", 2);

    await expect(tid(page, "rc-previous")).toContainText("직전 RELEASED 버전 1 · 2026-01-01 00:00:00");
    await expect(tid(page, "rc-diff-counts")).toHaveText("추가 0 · 삭제 0 · 수정 2 · 같음 0");
    // 먼 미래 일시 — 서버 시계 기준 futureApplyFrom=true 가 실행 날짜와 상관없이 늘 참이다.
    await validate(page, "2030-01-01T00:00");
    await expect(tid(page, "rc-check-status-APPLY_FROM")).toHaveText("통과");
    await expect(tid(page, "rc-contract")).toHaveAttribute("data-state", "CHANGED");
    await expect(tid(page, "rc-contract")).toContainText("[COIL_WID]");
    await page.screenshot({ path: screenshot("dme-ruleConfirm-contract.png"), fullPage: true });

    await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: 20_000 });
    await tid(page, "rc-confirm").click();
    await expect(tid(page, "rc-modal-contract")).toBeVisible({ timeout: 20_000 });
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

    await expect(page.getByText("확정했습니다").first()).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "rc-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "rc-closed-previous")).toHaveText("직전 버전 1 의 적용을 닫았습니다");
    await expect(tid(page, "rc-released")).toContainText("적용 구간 2030-01-01 00:00:00 ~ 9999-12-31 00:00:00");
    await expect(tid(page, "rc-row-E2E_RC_CONTRACT-2")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
  });

  test("T7 담당자: 다른 세션이 먼저 확정하면 화면 확정이 서버 문구로 거부된다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleConfirm(page);
    await choose(page, "E2E_RC_RACE", 1);
    await validate(page, "2026-02-01T00:00");
    await expect(tid(page, "rc-confirm")).toBeEnabled({ timeout: 20_000 });

    // 빈틈 경고가 있으므로 먼저 확정하는 세션은 경고 확인(true)을 보낸다 — false 면 MDM014 로 경합이 만들어지지 않는다.
    const res = await page.request.post(`${BASE_URL}/api/mdm/oasis/ruleConfirm/confirm`, {
      data: {
        meta: { menuId: "ruleConfirm" },
        params: {
          maruRuleId: "E2E_RC_RACE", ver: 1, rowVersion: 0, applyFrom: "2026-02-01 00:00:00",
          warningsAcknowledged: true,
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.meta?.success, JSON.stringify(body.meta)).not.toBe(false);

    await tid(page, "rc-confirm").click();
    await tid(page, "rc-ack").getByText("경고를 확인했습니다").click();
    await expect(tid(page, "rc-modal-ok")).toBeEnabled({ timeout: 20_000 });
    await tid(page, "rc-modal-ok").click();
    await expect(tid(page, "rc-error")).toContainText(RACE_REJECTED, { timeout: 20_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
    await page.screenshot({ path: screenshot("dme-ruleConfirm-error.png"), fullPage: true });
  });

  test("T8 표준 관리자: 검사·확정 버튼이 비활성이다", async ({ page }) => {
    // 권한 조회가 끝나기 전에는 버튼이 늘 꺼져 있으므로, 조회 응답을 받은 뒤에 단언한다(무조건 통과 방지).
    const rbacLoaded = page.waitForResponse((r) => r.url().includes("/secUser/myButtonEndpoints") && r.ok(), {
      timeout: 60_000,
    });
    await login(page, STD_ADMIN);
    await openRuleConfirm(page);
    await rbacLoaded;
    await choose(page, "E2E_RC_CASEFAIL", 1);

    await expect(tid(page, "rc-apply-from")).toBeVisible();
    await expect(tid(page, "rc-validate")).toBeDisabled();
    await expect(tid(page, "rc-confirm")).toBeDisabled();
    await page.screenshot({ path: screenshot("dme-ruleConfirm-readonly.png"), fullPage: true });
  });
});
