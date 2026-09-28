// 룰 화면 버전 카드 버튼 활성 상태 전수 조사.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/d8-shots";
const BASE = "http://localhost:5100";
const log = (...a) => console.log("[d8]", ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, storageState: `${OUT}/auth.json` });
const page = await ctx.newPage();

// RBAC 버튼 권한 응답 관찰
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("myButtonEndpoints")) {
    let b = null;
    try { b = await r.json(); } catch { /* noop */ }
    const rows = b?.data?.result?.grids?.buttons?.rows ?? b?.grids?.buttons?.rows ?? null;
    if (rows) {
      log("RBAC ruleEdit 관련 =", JSON.stringify(rows.filter((x) => JSON.stringify(x).includes("ruleEdit"))));
    } else {
      log("RBAC 응답 형태 =", JSON.stringify(b).slice(0, 300));
    }
  }
});

try {
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  const sidebar = page.locator(".sidebar-container");
  await sidebar.waitFor({ timeout: 45000 });
  await sidebar.getByText("마루 MDM", { exact: false }).first().click();
  await page.waitForTimeout(1200);
  await sidebar.getByText("업무기준", { exact: false }).first().click();
  await page.waitForTimeout(1200);
  await sidebar.getByText("룰", { exact: true }).first().click();
  await page.waitForTimeout(4000);
  await page.getByText("PROD_WGT_CALC", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await sidebar.getByText("룰 화면", { exact: true }).first().click();
  await page.waitForTimeout(6000);

  const btns = await page.locator("button").evaluateAll((els) =>
    els.map((e) => ({
      txt: (e.textContent || "").trim().slice(0, 16),
      dis: e.disabled === true,
      testid: e.getAttribute("data-testid"),
      title: e.getAttribute("title"),
    })).filter((b) => b.txt && b.txt.length > 0 && b.txt.length < 16),
  );
  log("=== 화면 버튼 활성 상태 ===");
  for (const b of btns) log("  ", JSON.stringify(b));

  const wrap = page.locator("[data-testid='rule-cancel-confirm-wrap']");
  log("wrap 존재 =", await wrap.count());
  if (await wrap.count()) log("wrap title =", JSON.stringify(await wrap.first().getAttribute("title")));

  await page.screenshot({ path: `${OUT}/24-button-states.png` });
  log("캡처 → /tmp/d8-shots/24-button-states.png");
} catch (e) {
  log("오류:", e.message);
} finally {
  await browser.close();
}
