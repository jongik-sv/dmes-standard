import { expect, test, type Locator, type Page } from "@playwright/test";

import { BASE_URL, T, login, openRuleMenu, type LoginOptions } from "./support/common";
import { fillDateTime, loadMdmFixture } from "./support/mdm-e2e";

/**
 * 룰 세트 확정(ruleSetConfirm) — 룰 세트 흐름도 2단계(D-144) 화면 스모크.
 *
 *   S1 담당자: 메뉴(마루 MDM > 업무기준 > 룰 세트 확정)로 화면이 열리고 확정 대기 목록에 E2S_CONFIRM 2.000 이 보인다.
 *   S2 담당자: E2S_CONFIRM 2.000 을 골라 적용 시작(지금보다 1분 뒤) → [검사] → 네 항목 PASSED → [확정] → 대화상자 확인 →
 *      RELEASED 안내(rsc-released)와 "직전 버전 v1.000 의 적용을 닫았습니다"(rsc-closed-previous).
 *
 * 전제: mdm-ruleEdit·ruleSetEdit 스펙과 같은 방식으로 새 mcm.db·mdm.db 로 백엔드·포털을 띄우고, mcm 기동 뒤 e2e/fixtures/mdm-rbac-users.sql,
 * beforeAll 이 e2e/fixtures/mdm-ruleSet-data.sql 을 넣는다. 이 spec 은 전용 세트 E2S_CONFIRM(E2S_CHAIN 과 같은
 * 사슬)의 2.000 을 확정한다 — 편집(mdm-ruleSetEdit)·목록(mdm-ruleSetMng) 스펙이 쓰는 E2S_CHAIN 은 건드리지 않아 한 DB 로 이어 돌 수 있다. 서버가 화면에 보이는 시각을 KST 로 쓰므로 적용 시작은 브라우저 시계 + 1분을 KST 로 맞춰 넣는다.
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const BREADCRUMB = "마루 MDM > 업무기준 > 룰 세트 확정";
const CHECK_ITEMS = ["FLOW_STRUCTURE", "RULES_RELEASED", "ORDER", "TEST_CASES"] as const;

function tid(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW, exactButton: true };

/** 메뉴는 보이는 항목만 잡는다(visibleOnly). */
async function openRuleSetConfirm(page: Page) {
  await openRuleMenu(page, /^룰 세트 확정$/, { visibleOnly: true });
  await expect(tid(page, "rsc-list")).toBeVisible({ timeout: 60_000 });
}

/** `yyyy-MM-dd HH:mm:ss` — 적용 시작 칸(shared DateTimePicker)의 값 형식. 지금부터 1분 뒤를 KST 벽시계로 만든다. */
function oneMinuteLaterKst(): string {
  const kst = new Date(Date.now() + 60_000 + 9 * 3600_000);
  return kst.toISOString().slice(0, 19).replace("T", " ");
}

test.describe.configure({ mode: "serial" });

test.describe("mdm ruleSetConfirm — 룰 세트 확정", () => {
  test.setTimeout(150_000);

  test.beforeAll(() => loadMdmFixture("mdm-ruleSet-data.sql"));

  test("S1 담당자: 메뉴로 화면이 열리고 확정 대기 목록에 내 DRAFT 가 보인다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetConfirm(page);

    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
    await expect(tid(page, "rsc-row-E2S_CONFIRM-2.000")).toBeVisible({ timeout: 20_000 });

    await tid(page, "rsc-keyword").fill("NO_SUCH");
    await tid(page, "rsc-search").click();
    await expect(tid(page, "rsc-list-empty")).toHaveText("확정할 DRAFT 가 없습니다", { timeout: 20_000 });
  });

  test("S2 담당자: 검사가 통과하면 확정되고 직전 버전의 적용이 닫힌다", async ({ page }) => {
    await login(page, STEWARD, LOGIN_OPTS);
    await openRuleSetConfirm(page);

    const row = tid(page, "rsc-row-E2S_CONFIRM-2.000");
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await expect(tid(page, "rsc-target")).toContainText("E2S_CONFIRM 버전 v2.000", { timeout: 20_000 });
    await expect(tid(page, "rsc-previous")).toContainText("직전 RELEASED 버전 v1.000");

    await fillDateTime(tid(page, "rsc-apply-from"), oneMinuteLaterKst());
    await tid(page, "rsc-validate").click();
    await expect(tid(page, "rsc-checks")).toBeVisible({ timeout: 30_000 });
    for (const item of CHECK_ITEMS) {
      await expect(tid(page, `rsc-check-status-${item}`)).toHaveText("통과");
    }

    await expect(tid(page, "rsc-confirm")).toBeEnabled({ timeout: 20_000 });
    await tid(page, "rsc-confirm").click();
    await tid(page, "rc-modal-ok").click();

    await expect(tid(page, "rsc-released")).toBeVisible({ timeout: 30_000 });
    await expect(tid(page, "rsc-closed-previous")).toHaveText("직전 버전 v1.000 의 적용을 닫았습니다");
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
  });
});
