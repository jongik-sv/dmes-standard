import { expect, test, type Page } from "@playwright/test";
import { T } from "./support/common";

/**
 * 포털 브라우저 뒤로/앞으로가기 ↔ 탭 전환 검증.
 *
 * 검증 포인트:
 *  - 메뉴로 탭 A→B→C 를 열면 history.state.portalTab 이 누적되고 URL 은 /portal 고정.
 *  - 뒤로가기로 C→B→A, 앞으로가기로 복귀(시간순 MRU).
 *  - 첫 화면에서 더 뒤로가도 포털을 이탈하지 않음(sentinel trap).
 * dev 픽스처 계정(admin/admin123)은 기존 e2e(archive/auto-search-csa)와 동일.
 */

const BASE = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5100";

const portalTab = (page: Page) =>
  page.evaluate(() => {
    const s = window.history.state as { portalTab?: string; portalIndex?: number } | null;
    return s ? { portalTab: s.portalTab ?? null, portalIndex: s.portalIndex ?? null } : null;
  });

const activeTabLabel = (page: Page) =>
  page
    .evaluate(() => {
      const el = document.querySelector(
        '.portal-shell__tab--active, [class*="tab"][class*="active"], [aria-selected="true"]'
      );
      return el ? (el.textContent ?? "").trim().slice(0, 40) : null;
    })
    .catch(() => null);

const dismissModal = async (page: Page) => {
  try {
    const overlay = page.locator(".cm-modal-overlay").first();
    if (await overlay.isVisible({ timeout: 500 })) {
      const btn = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await btn.isVisible({ timeout: 500 })) await btn.click();
      else await page.keyboard.press("Escape");
      await overlay.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  } catch {
    /* 모달 없음 */
  }
};

test("portal back/forward navigates tabs (MRU) and stays on /portal", async ({ page }) => {
  test.setTimeout(150_000);
  page.setViewportSize({ width: 1600, height: 900 });

  // 로그인
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-user-id").fill("admin");
  await page.locator("#login-password").fill("admin123");
  await page.locator("button.login-button").click();
  await page.waitForURL(/\/portal/, { timeout: T.LONG });
  await page.waitForTimeout(2_500);
  await dismissModal(page);

  const clickSidebar = async (label: string) => {
    await dismissModal(page);
    const loc = page.locator(`.tree-item:has-text("${label}")`).first();
    await loc.waitFor({ state: "visible", timeout: 5_000 });
    await loc.click();
    await page.waitForTimeout(900);
    await dismissModal(page);
  };
  for (const g of ["공통관리", "시스템관리"]) {
    try {
      await clickSidebar(g);
    } catch {
      /* 그룹 이미 펼쳐짐 */
    }
  }

  // 탭 A, B, C 열기
  await clickSidebar("사용자 관리");
  const sA = await portalTab(page);
  const lA = await activeTabLabel(page);
  await clickSidebar("메뉴 관리");
  const sB = await portalTab(page);
  const lB = await activeTabLabel(page);
  await clickSidebar("역할 관리");
  const sC = await portalTab(page);
  const lC = await activeTabLabel(page);

  console.log("[open] A=", JSON.stringify(sA), "label=", lA);
  console.log("[open] B=", JSON.stringify(sB), "label=", lB);
  console.log("[open] C=", JSON.stringify(sC), "label=", lC);
  console.log("[open] url=", page.url());

  // 내 코드 반영 확인: history.state 에 portalTab 이 실려야 한다.
  expect(sC, "history.state.portalTab 이 없음 → shared 변경 미반영").not.toBeNull();
  expect(sC?.portalTab, "C 탭의 portalTab").toBeTruthy();
  expect(sC?.portalTab).not.toBe(sA?.portalTab);

  // 뒤로가기 #1 → B
  await page.goBack();
  await page.waitForTimeout(900);
  const b1 = await portalTab(page);
  console.log("[back#1]", JSON.stringify(b1), "label=", await activeTabLabel(page), "expect=", sB?.portalTab);

  // 뒤로가기 #2 → A
  await page.goBack();
  await page.waitForTimeout(900);
  const b2 = await portalTab(page);
  console.log("[back#2]", JSON.stringify(b2), "label=", await activeTabLabel(page), "expect=", sA?.portalTab);

  // 앞으로가기 → B
  await page.goForward();
  await page.waitForTimeout(900);
  const f1 = await portalTab(page);
  console.log("[forward]", JSON.stringify(f1), "label=", await activeTabLabel(page), "expect=", sB?.portalTab);

  console.log("[final] url=", page.url());

  // 핵심 단언
  expect(page.url(), "URL 은 /portal 고정").toContain("/portal");
  expect(b1?.portalTab, "뒤로가기#1 → B").toBe(sB?.portalTab);
  expect(b2?.portalTab, "뒤로가기#2 → A").toBe(sA?.portalTab);
  expect(f1?.portalTab, "앞으로가기 → B").toBe(sB?.portalTab);

  // 이탈 방지: 첫 화면(A)에서 더 뒤로가도 /portal 유지
  await page.goBack();
  await page.waitForTimeout(900);
  await page.goBack();
  await page.waitForTimeout(900);
  console.log("[trap] url after extra back=", page.url(), "state=", JSON.stringify(await portalTab(page)));
  expect(page.url(), "첫 화면에서 더 뒤로가도 포털 이탈 안 함").toContain("/portal");
});
