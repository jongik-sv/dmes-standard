// 확정 화면 적용 일시 칸 DOM 정밀 조사.
import { chromium } from "@playwright/test";

const OUT = "/tmp/d8-shots";
const BASE = "http://localhost:5100";
const log = (...a) => console.log("[d8]", ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, storageState: `${OUT}/auth.json` });
const page = await ctx.newPage();

try {
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  const sidebar = page.locator(".sidebar-container");
  await sidebar.waitFor({ timeout: 45000 });
  await sidebar.getByText("마루 MDM", { exact: false }).first().click();
  await page.waitForTimeout(1200);
  await sidebar.getByText("업무기준", { exact: false }).first().click();
  await page.waitForTimeout(1200);
  await sidebar.getByText("버전 확정", { exact: true }).first().click();
  await page.waitForTimeout(4000);
  await page.getByText("PROD_WGT_CALC", { exact: true }).first().click();
  await page.waitForTimeout(4000);

  // "적용 시작" 라벨 근처 DOM
  const html = await page.locator("text=적용 시작 일시 입력").first().evaluate((el) => {
    const box = el.closest("div")?.parentElement ?? el;
    return box.outerHTML.slice(0, 2500);
  });
  log("=== '적용 시작 일시 입력' 주변 DOM ===");
  log(html);

  // 페이지 안의 모든 text input + contenteditable
  const nodes = await page.locator("input:not([type=checkbox]):not([type=radio]), [contenteditable=true]").evaluateAll(
    (els) => els.map((e) => ({
      tag: e.tagName, type: e.getAttribute("type"), ph: e.getAttribute("placeholder"),
      testid: e.getAttribute("data-testid"), name: e.getAttribute("name"),
      cls: (e.getAttribute("class") || "").slice(0, 70), val: e.value ?? null,
    })),
  );
  log("=== 일반 입력 후보 ===");
  for (const n of nodes) log("  ", JSON.stringify(n));
} catch (e) {
  log("오류:", e.message);
} finally {
  await browser.close();
}
