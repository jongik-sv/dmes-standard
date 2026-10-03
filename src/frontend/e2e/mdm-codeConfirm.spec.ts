import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, clickMenuPath, login } from "./support/common";
import { fillDateTime, loadMdmFixture } from "./support/mdm-e2e";
import { gridRowById } from "./support/grid";

/**
 * 마루 코드 버전 확정(codeConfirm) — TSK-06-05 design.md §3.4 화면 스모크 넷 + 수용 기준.
 *
 *   T1 담당자: 메뉴(마루 MDM > 마스터코드 > 버전 확정)로 화면이 열린다(스모크 넷 1, 수용 기준 5).
 *   T2 담당자: 확정 대기 목록이 서버 데이터(E2E_CF_OK·NOCHG·RACE)로 채워지고, keyword NO_SUCH 면 빈 상태(스모크 넷 2).
 *   T3 담당자: E2E_CF_NOCHG(변경 없는 1.001) 검사 → diff 빈 상태·4항 거부·확정 버튼 비활성(수용 기준 1).
 *   T4 담당자: E2E_CF_OK(최초 버전) 검사 → 3·4항 면제·2-2 경고 → 확정 대화상자 경고 확인 → 확정 → RELEASED 배지,
 *              목록에서 사라짐(스모크 넷 3, 수용 기준 2).
 *   T5 담당자: E2E_CF_RACE 검사 뒤 다른 세션(page.request)이 먼저 확정 → 화면 확정이 서버 문구로 거부된다(스모크 넷 4).
 *   T6 표준 관리자: 메뉴로 열고 E2E_CF_NOCHG 를 골라도 검사·확정 버튼이 비활성(수용 기준 3 의 화면 판).
 *
 * 전제(design.md 「서버·E2E 기동 방법」): 새 mcm.db·mdm.db 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고, mcm 기동
 * 뒤 e2e/fixtures/mdm-rbac-users.sql, beforeAll 이 e2e/fixtures/mdm-codeConfirm.sql 을 넣는다. 이 spec 은 E2E_CF_OK·
 * E2E_CF_RACE 를 확정하므로 **같은 mdm.db 로 다시 돌릴 수 없다**. SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STD_ADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const BREADCRUMB = "마루 MDM > 마스터코드 > 버전 확정";
const RACE_REJECTED = /DRAFT 상태에서만 할 수 있습니다|다른 사용자가 수정했습니다/;

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-06-05/screens", name);

function tid(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

/** 확정 대기 목록·검사 결과 표는 AgDataGrid 다 — 행은 row-id(목록은 "ID-버전", 검사는 검사 번호)로 찾는다. */
function gridRow(page: Page, gridTestId: string, rowId: string): Locator {
  return gridRowById(tid(page, gridTestId), rowId);
}
const listRow = (page: Page, id: string, ver: string) => gridRow(page, "cf-list", `${id}-${ver}`);
const checkRow = (page: Page, no: string) => gridRow(page, "cf-checks", no);

async function openCodeConfirm(page: Page) {
  await clickMenuPath(page, [/^마루 MDM$/, /^마스터코드$/, /^버전 확정$/]);
  await expect(tid(page, "cf-list")).toBeVisible({ timeout: 60_000 });
}

async function choose(page: Page, id: string, ver: string) {
  const row = listRow(page, id, ver);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(tid(page, "cf-target")).toContainText(id, { timeout: 20_000 });
}

/** 적용 시작(shared DateTimePicker — 6e506cc9 에서 datetime-local 을 바꿨다)에 `yyyy-MM-dd HH:mm:ss` 로 넣고 검사한다. */
async function validate(page: Page, applyFrom: string) {
  await fillDateTime(tid(page, "cf-apply-from"), applyFrom);
  await tid(page, "cf-validate").click();
  await expect(tid(page, "cf-checks")).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("mdm codeConfirm — 마루 코드 버전 확정", () => {
  test.setTimeout(150_000);

  test.beforeAll(() => loadMdmFixture("mdm-codeConfirm.sql"));

  test("T1 담당자: 메뉴로 화면이 열린다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeConfirm(page);

    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await page.screenshot({ path: screenshot("dmc-codeConfirm-open.png"), fullPage: true });
  });

  test("T2 담당자: 확정 대기 목록이 서버 데이터로 채워지고, 걸러 없으면 빈 상태가 보인다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeConfirm(page);

    await expect(listRow(page, "E2E_CF_OK", "1.000")).toBeVisible({ timeout: 20_000 });
    await expect(listRow(page, "E2E_CF_NOCHG", "1.001")).toBeVisible();
    await expect(listRow(page, "E2E_CF_RACE", "1.000")).toBeVisible();
    // RELEASED 1.000 은 확정 대기 목록에 없다
    await expect(listRow(page, "E2E_CF_NOCHG", "1.000")).toHaveCount(0);
    await page.screenshot({ path: screenshot("dmc-codeConfirm-list.png"), fullPage: true });

    await tid(page, "cf-keyword").fill("NO_SUCH");
    await tid(page, "cf-search").click();
    await expect(tid(page, "cf-list-empty")).toHaveText("확정할 DRAFT 가 없습니다", { timeout: 20_000 });
  });

  test("T3 담당자: 변경 없는 DRAFT 는 4항 거부로 확정 버튼이 꺼진다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeConfirm(page);
    await choose(page, "E2E_CF_NOCHG", "1.001");

    await expect(tid(page, "cf-previous")).toContainText("v1.000 · 2026-01-01 00:00:00");
    await expect(tid(page, "cf-diff-empty")).toHaveText("변경된 행이 없습니다");

    await validate(page, "2026-10-01 00:00:00");
    await expect(tid(page, "cf-check-status-4")).toHaveText("거부");
    await expect(tid(page, "cf-check-status-4")).toHaveAttribute("data-rejected", "true");
    await expect(tid(page, "cf-check-status-3")).toHaveText("통과");
    await expect(tid(page, "cf-validate")).toBeEnabled();
    await expect(tid(page, "cf-confirm")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmc-codeConfirm-rejected.png"), fullPage: true });
  });

  test("T4 담당자: 최초 버전을 경고 확인 뒤 확정하면 RELEASED 가 되고 목록에서 사라진다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeConfirm(page);
    await choose(page, "E2E_CF_OK", "1.000");

    await expect(tid(page, "cf-previous")).toHaveText("최초 버전 — 적용 순서 검사를 하지 않습니다");
    await validate(page, "2026-01-01 00:00:00");
    await expect(tid(page, "cf-check-status-3")).toHaveText("면제");
    await expect(tid(page, "cf-check-status-4")).toHaveText("면제");
    await expect(tid(page, "cf-check-status-2-2")).toHaveText("경고");
    await expect(checkRow(page, "2-2")).toContainText("CATE:EMPTYC");

    await expect(tid(page, "cf-confirm")).toBeEnabled({ timeout: 20_000 });
    await tid(page, "cf-confirm").click();
    await expect(tid(page, "cf-modal-warnings")).toBeVisible({ timeout: 20_000 });
    // 과거 일시라 미래 적용 경고는 없다(서버 futureApplyFrom=false)
    await expect(tid(page, "cf-future-warning")).toHaveCount(0);
    await expect(tid(page, "cf-modal-ok")).toBeDisabled();
    await tid(page, "cf-ack").getByText("경고를 확인했습니다").click();
    await expect(tid(page, "cf-modal-ok")).toBeEnabled();
    await tid(page, "cf-modal-ok").click();

    await expect(page.getByText("확정했습니다").first()).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "cf-form").locator('.mdm-status-badge[data-status="RELEASED"]')).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "cf-released")).toContainText("적용 구간 2026-01-01 00:00:00 ~ 9999-12-31 00:00:00");
    await expect(tid(page, "cf-released")).toContainText(`확정자 ${STEWARD}`);
    await expect(listRow(page, "E2E_CF_OK", "1.000")).toHaveCount(0);
    await expect(listRow(page, "E2E_CF_RACE", "1.000")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 }); // 닫히는 대화상자가 스크린샷을 가리지 않게
    await page.screenshot({ path: screenshot("dmc-codeConfirm-confirmed.png"), fullPage: true });
  });

  test("T5 담당자: 다른 세션이 먼저 확정하면 화면 확정이 서버 문구로 거부된다", async ({ page }) => {
    await login(page, STEWARD);
    await openCodeConfirm(page);
    await choose(page, "E2E_CF_RACE", "1.000");
    await validate(page, "2026-02-01 00:00:00");
    await expect(tid(page, "cf-confirm")).toBeEnabled({ timeout: 20_000 });

    const res = await page.request.post(`${BASE_URL}/api/mdm/oasis/codeConfirm/confirm`, {
      data: {
        meta: { menuId: "codeConfirm" },
        params: {
          maruCodeId: "E2E_CF_RACE", ver: "1.000", rowVersion: 0, applyFrom: "2026-02-01 00:00:00",
          warningsAcknowledged: false,
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.meta?.success, JSON.stringify(body.meta)).not.toBe(false);

    await tid(page, "cf-confirm").click();
    await expect(tid(page, "cf-modal-ok")).toBeEnabled({ timeout: 20_000 });
    await tid(page, "cf-modal-ok").click();
    await expect(tid(page, "cf-error")).toContainText(RACE_REJECTED, { timeout: 20_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
    await page.screenshot({ path: screenshot("dmc-codeConfirm-error.png"), fullPage: true });
  });

  test("T6 표준 관리자: 검사·확정 버튼이 비활성이다", async ({ page }) => {
    // 권한 조회가 끝나기 전에는 버튼이 늘 꺼져 있으므로, 조회 응답을 받은 뒤에 단언한다(무조건 통과 방지).
    const rbacLoaded = page.waitForResponse((r) => r.url().includes("/secUser/myButtonEndpoints") && r.ok(), {
      timeout: 60_000,
    });
    await login(page, STD_ADMIN);
    await openCodeConfirm(page);
    await rbacLoaded;
    await choose(page, "E2E_CF_NOCHG", "1.001");

    await expect(tid(page, "cf-apply-from")).toBeVisible();
    await expect(tid(page, "cf-validate")).toBeDisabled();
    await expect(tid(page, "cf-confirm")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmc-codeConfirm-readonly.png"), fullPage: true });
  });
});
