import { test } from "@playwright/test";

const BASE = "http://localhost:5000";
const SCREENS = [
  "OBJECT 관리",
  "메뉴 관리",
  "역할 관리",
  "역할 그룹 관리",
  "사용자 관리",
  "PERMISSION 관리",
  "사용자 권한 일괄 등록",
  "동기화 관리",
];

test("csa 8 screens auto-search verify", async ({ page, context }) => {
  test.setTimeout(300_000);
  page.setViewportSize({ width: 1600, height: 900 });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-user-id").fill("admin");
  await page.locator("#login-password").fill("admin123");
  await page.locator("button.login-button").click();
  await page.waitForURL(/\/portal/, { timeout: 30_000 });
  await page.waitForTimeout(2_500);

  const clickSidebar = async (label: string) => {
    const loc = page.locator(`.tree-item:has-text("${label}")`).first();
    await loc.waitFor({ state: "visible", timeout: 5_000 });
    await loc.click();
    await page.waitForTimeout(400);
  };
  for (const g of ["공통관리", "시스템관리"]) {
    try { await clickSidebar(g); } catch {}
  }
  const dismissModal = async () => {
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}
  };

  for (const s of SCREENS) {
    await dismissModal();
    try {
      await clickSidebar(s);
      // 자동조회 트리거 대기 (BE 응답)
      await page.waitForTimeout(3_500);
      await dismissModal();
      await page.waitForTimeout(400);
      // 결과 카운트 추출 — "사용자 목록 N건" 패턴
      const countText = await page.locator('[class*="grid-panel-count"], .grid-panel-count').first().textContent({ timeout: 2_000 }).catch(() => null);
      const rowCount = await page.locator(".ag-row").count();
      console.log(`${s} — panel-count="${countText ?? "?"}" / ag-rows=${rowCount}`);
    } catch (e) {
      console.log(`${s} FAIL: ${(e as Error).message.slice(0, 100)}`);
    }
  }
});
