import { test } from "@playwright/test";

const BASE = "http://localhost:5000";

test("phase12 quick — 메뉴 관리 + OBJECT 관리 마운트 확인", async ({ page, context }) => {
  test.setTimeout(120_000);
  page.setViewportSize({ width: 1600, height: 900 });

  const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();
  await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
  });
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5_000);

  for (let i = 0; i < 3; i++) {
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 500 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}
  }
  for (const g of ["공통관리", "시스템관리"]) {
    try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(400); } catch {}
  }

  // OBJECT 관리
  await page.locator(`.tree-item:has-text("OBJECT 관리")`).first().click();
  await page.waitForTimeout(4_000);
  for (let i = 0; i < 3; i++) {
    const overlay = await page.locator('.cm-message-modal-overlay').count();
    if (overlay === 0) break;
    try { await page.keyboard.press("Escape"); await page.waitForTimeout(300); } catch {}
  }
  await page.screenshot({ path: `snap/phase12_objmng.png`, fullPage: false });
  const objMngLabel = await page.locator(`text=OBJECT 관리`).count();
  console.log(`[quick] OBJECT 관리 mounted label count=${objMngLabel}`);

  // 메뉴 관리
  await page.locator(`.tree-item:has-text("메뉴 관리")`).first().click();
  await page.waitForTimeout(4_000);
  for (let i = 0; i < 3; i++) {
    const overlay = await page.locator('.cm-message-modal-overlay').count();
    if (overlay === 0) break;
    try { await page.keyboard.press("Escape"); await page.waitForTimeout(300); } catch {}
  }
  await page.screenshot({ path: `snap/phase12_menumng.png`, fullPage: false });
  const menuMngLabel = await page.locator(`text=메뉴 관리`).count();
  console.log(`[quick] 메뉴 관리 mounted label count=${menuMngLabel}`);
});
