import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:5000";

test("commUserMng iter#4 row-selected snapshot", async ({ page, context }) => {
  test.setTimeout(180_000);
  page.setViewportSize({ width: 1600, height: 900 });
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message.slice(0, 200)));

  // Fresh login (cookie file may be stale)
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-user-id").fill("admin");
  await page.locator("#login-password").fill("admin123");
  await page.locator("button.login-button").click();
  await page.waitForURL(/\/portal/, { timeout: 30_000 });
  await page.waitForTimeout(3_000);

  const clickSidebar = async (label: string) => {
    const loc = page.locator(`.tree-item:has-text("${label}")`).first();
    await loc.waitFor({ state: "visible", timeout: 5_000 });
    await loc.click();
    await page.waitForTimeout(400);
  };

  for (const g of ["공통관리", "시스템관리"]) {
    try { await clickSidebar(g); } catch {}
  }

  await clickSidebar("사용자 관리");
  await page.waitForTimeout(3_000);
  // dismiss any modal
  try {
    const b = page.getByRole("button", { name: "확인", exact: true }).first();
    if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
  } catch {}

  // Click 조회 button to fetch users
  const searchBtn = page.getByRole("button", { name: "조회", exact: true }).first();
  await searchBtn.click();
  await page.waitForTimeout(3_500);
  try {
    const b = page.getByRole("button", { name: "확인", exact: true }).first();
    if (await b.isVisible({ timeout: 800 })) { await b.click(); await page.waitForTimeout(400); }
  } catch {}

  await page.screenshot({ path: "snap/W5_iter4_searched.png", fullPage: false });

  // Click first row to populate detail
  const firstRow = page.locator(".ag-row").first();
  if (await firstRow.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await firstRow.click();
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: "snap/W5_iter4_row_selected.png", fullPage: false });
    console.log("ROW_OK");
  } else {
    console.log("no rows even after 조회");
  }
});
