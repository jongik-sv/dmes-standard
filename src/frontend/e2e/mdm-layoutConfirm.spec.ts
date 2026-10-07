import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { T, login, menuItem, walkMenuPath } from "./support/common";
import { clickSearch, loadMdmFixture } from "./support/mdm-e2e";
import { gridRows } from "./support/grid";

/**
 * 레이아웃 확정(dmb/layoutConfirm) 브라우저 E2E — D-144 3단계(레이아웃·헤더 버전 관리), 전문·헤더 공용 확정 화면.
 *
 *   C1 담당자가 헤더 L110 에 새 버전(minor) 1.001 을 만들고 여분 5 → 8 로 늘려 저장한다(헤더 길이 30 → 33)
 *   C2 [확정] → 확정 화면. 적용 시작(먼 미래)을 넣어 검사하면 — 항목 길이 변경이라 동시 전환 띠, 영향받는 전문 표에
 *      M201 `187 → 190`(적용 시작 시점의 총 길이), 경고(SIMULTANEOUS_SWITCH)를 확인해야 확정이 켜진다
 *   C3 확정하면 헤더 화면 버전 선택에 v1.001 이 적용 대기(RELEASED, 적용 시작 전)로 보인다
 *
 * 전제·실행은 mdm-headerMng.spec.ts 와 같다 — 격리 DB 로 mcm·mdm 백엔드와 포털을 빈 포트에 띄우고(SMOKE_MCM_BASE_URL 로 자기 포털을 가리킨다),
 * mdm-rbac-users.sql 을 넣고, beforeAll 이 같은 PDB 에 mdm-layout-m201.sql 을 넣는다(멱등). 새 PDB 로 시작해야 한다 — 이 스펙은 L110 에
 * 1.001 을 확정하므로 같은 PDB 로 다시 돌리면 "미적용 버전이 있다" 로 새 버전이 막힌다.
 * DMB 의 확정 권한은 담당자(e2e_mdm_steward)만 있고 DRAFT 는 소유자만 확정하므로 이 스펙은 담당자로 처음부터 끝까지 한다.
 * 적용 시작을 먼 미래로 두는 까닭: 파일 이름 순으로 이 스펙 뒤에 도는 mdm-layoutMng.spec.ts 가 "지금" 의 총 길이 187·헤더 길이 30 을 그대로 본다.
 */

const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const HEADER_NAME = "L2 구간 헤더(E2E)";
const MESSAGE_NAME = "출측검사 실적 수신(E2E)";

const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-03/screens", name);

/** 헤더 화면을 사이드바로 열고 화면 범위를 돌려준다. */
async function openHeaderScreen(page: Page): Promise<Locator> {
  await walkMenuPath(page, [/^마루 MDM$/, /^레이아웃$/, /^전문 헤더 정의$/]);
  const layout = page.locator(".page-layout").filter({
    has: page.locator(".page-layout__footer-screen-id", { hasText: "headerMng" }),
  });
  // 화면은 목록을 자동 조회하지 않고 열린다(cf4fbb05) — 목록이 아니라 검색 칸이 보이면 열린 것이다.
  await expect(layout.getByTestId("header-search-keyword")).toBeVisible({ timeout: T.SLOW });
  return layout;
}

async function selectHeader(layout: Locator, name: string) {
  await layout.getByTestId("header-search-keyword").fill("(E2E)");
  await clickSearch(layout);
  await layout.getByTestId("header-list").locator(".ag-row").filter({ hasText: name }).first().click();
  await expect(layout.getByTestId("header-form-name")).toHaveValue(name, { timeout: T.LONG });
}

/** 지금부터 ms 뒤를 KST 벽시계 `yyyy-MM-dd HH:mm:ss` 로 — 확정 화면·서버가 쓰는 형식이다. */
function kstAfter(ms: number): string {
  return new Date(Date.now() + ms + 9 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1680, height: 1200 } });

test.describe("mdm 레이아웃 확정", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => loadMdmFixture("mdm-layout-m201.sql"));

  test("C1~C3 헤더 새 버전(minor) → 확정 화면(영향 187 → 190·동시 전환·경고 확인) → 확정 → 적용 대기", async ({ page }) => {
    const applyFrom = kstAfter(30 * 24 * 3600_000);
    await login(page, STEWARD);
    const layout = await openHeaderScreen(page);

    // ── C1 새 버전(minor) 1.001 DRAFT — 여분 5 를 8 로 늘리면 헤더 30 → 33 ──
    await selectHeader(layout, HEADER_NAME);
    await expect(layout.getByTestId("header-ver-select")).toHaveValue("1.000", { timeout: T.LONG });
    await expect(layout.getByTestId("header-form-name")).toBeDisabled();
    await layout.getByTestId("header-ver-new-minor").click();
    await expect(layout.getByTestId("header-ver-select")).toHaveValue("1.001", { timeout: T.LONG });
    await expect(layout.getByTestId("header-ver-select").locator('option[value="1.001"]')).toHaveText("v1.001 작성 중");
    await expect(layout.getByTestId("header-form-name")).toBeEnabled();
    await gridRows(layout.getByTestId("header-items")).filter({ hasText: "FILLER" }).first().click();
    await layout.getByTestId("item-detail-filler-length").fill("8");
    await expect(layout.getByTestId("header-length")).toHaveText("33 바이트 (6항목)");
    await layout.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다.").first()).toBeVisible({ timeout: T.LONG });
    // 저장은 버전을 만들지 않는다 — 버전은 1.000(현재)·1.001(작성 중) 둘뿐이고, DRAFT 저장은 사용 전문을 바꾸지 않는다
    await expect(layout.getByTestId("header-ver-select")).toHaveValue("1.001", { timeout: T.LONG });
    await expect(layout.getByTestId("header-ver-select").locator("option")).toHaveCount(2);
    await expect(layout.getByTestId("header-length")).toHaveText("33 바이트 (6항목)");
    await page.screenshot({ path: screenshot("dmb-layoutConfirm-header-draft.png"), fullPage: true });

    // ── C2 [확정] → 확정 화면 ──
    await expect(layout.getByTestId("header-ver-confirm")).toBeEnabled();
    await layout.getByTestId("header-ver-confirm").click();
    const target = page.getByTestId("lc-target");
    await expect(target).toContainText(HEADER_NAME, { timeout: T.SLOW });
    await expect(target).toContainText("헤더");
    await expect(target).toContainText("v1.001");
    await expect(page.getByTestId("lc-previous")).toContainText("직전 RELEASED 버전 v1.000");

    // 적용 시작 일시를 넣고 검사한다 — 검사가 끝나기 전에는 확정이 꺼져 있다
    await expect(page.getByTestId("lc-confirm")).toBeDisabled();
    await page.getByTestId("lc-apply-from").fill(applyFrom);
    await page.getByTestId("lc-apply-from").press("Enter");
    await page.getByTestId("lc-validate").click();
    await expect(page.getByTestId("lc-checks")).toBeVisible({ timeout: T.LONG });
    // 항목 길이가 바뀌어 동시 전환 — 송신·수신 양쪽이 함께 전환해야 한다는 강조 띠
    await expect(page.getByTestId("lc-simultaneous")).toBeVisible();
    await expect(page.getByTestId("lc-simultaneous")).toContainText("동시 전환");
    await expect(page.getByTestId("lc-simultaneous")).toContainText(applyFrom);
    // 영향받는 전문 — 이 헤더를 쌓은 M201 의 총 길이가 적용 시작 시점에 187 → 190
    const impact = page.getByTestId("lc-impact");
    await expect(impact).toBeVisible();
    const m201 = gridRows(impact).filter({ hasText: MESSAGE_NAME }).first();
    await expect(m201).toBeVisible();
    await expect(m201).toContainText("187 → 190");
    await expect(page.getByTestId("lc-eais")).toBeVisible();
    // 경고(동시 전환)가 있어 확인하기 전에는 확정이 꺼져 있다
    await expect(page.getByTestId("lc-ack")).toBeVisible();
    await expect(page.getByTestId("lc-confirm")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmb-layoutConfirm-validate.png"), fullPage: true });

    // 경고를 확인하면 확정이 켜진다. 적용 시작을 다시 바꾸면 검사 결과가 낡았다는 안내와 함께 확정이 꺼진다
    await page.getByTestId("lc-ack").getByText("경고를 확인했습니다").click();
    await expect(page.getByTestId("lc-confirm")).toBeEnabled();
    await page.getByTestId("lc-apply-from").fill(kstAfter(31 * 24 * 3600_000));
    await page.getByTestId("lc-apply-from").press("Enter");
    await expect(page.getByTestId("lc-stale")).toBeVisible();
    await expect(page.getByTestId("lc-confirm")).toBeDisabled();
    await page.getByTestId("lc-apply-from").fill(applyFrom);
    await page.getByTestId("lc-apply-from").press("Enter");
    await expect(page.getByTestId("lc-stale")).toHaveCount(0);
    await expect(page.getByTestId("lc-confirm")).toBeEnabled();

    // 확정 — 직전 1.000 의 적용이 apply_from 에 닫힌다
    await page.getByTestId("lc-confirm").click();
    await expect(page.getByTestId("lc-done")).toContainText("확정했습니다", { timeout: T.LONG });
    await expect(page.getByTestId("lc-done")).toContainText("직전 v1.000");
    await expect(page.getByTestId("lc-released")).toBeVisible({ timeout: T.LONG });
    await expect(page.getByTestId("lc-confirm")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmb-layoutConfirm-done.png"), fullPage: true });

    // ── C3 헤더 화면 — 버전 선택에 v1.001 이 적용 대기(RELEASED, 적용 시작 전)로 보인다 ──
    await menuItem(page, /^전문 헤더 정의$/).click();
    await selectHeader(layout, HEADER_NAME);
    const select = layout.getByTestId("header-ver-select");
    await expect(select.locator('option[value="1.000"]')).toHaveText("v1.000 현재", { timeout: T.LONG });
    await expect(select.locator('option[value="1.001"]')).toHaveText("v1.001 적용 대기");
    // 적용 시작 전이라 지금 시각의 헤더 길이·사용 전문 총 길이는 그대로(30·187)다
    await select.selectOption("1.000");
    await expect(layout.getByTestId("header-length")).toHaveText("30 바이트 (6항목)");
    await expect(layout.getByTestId("header-usage")).toContainText("187");
    await select.selectOption("1.001");
    await expect(layout.getByTestId("header-length")).toHaveText("33 바이트 (6항목)");
    await expect(layout.getByTestId("header-form-name")).toBeDisabled();
    await page.screenshot({ path: screenshot("dmb-layoutConfirm-header-versions.png"), fullPage: true });
  });
});
