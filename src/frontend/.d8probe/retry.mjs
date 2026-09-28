// 확정 화면 현재 상태 스냅샷 + 적용 일시 칸 탐색(재시도).
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
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/10-confirm-now.png` });
  log("캡처 → /tmp/d8-shots/10-confirm-now.png");

  const body = await page.locator("body").innerText();
  log("본문 1200자 =");
  log(body.slice(0, 1200));
  log("--- '적용 시작' 포함 =", body.includes("적용 시작"));
  log("--- 'YYYY-MM-DD' 포함 =", body.includes("YYYY-MM-DD"));

  const nodes = await page.locator("input:not([type=checkbox]):not([type=radio])").evaluateAll((els) =>
    els.map((e) => ({ type: e.getAttribute("type"), ph: e.getAttribute("placeholder"), testid: e.getAttribute("data-testid"), val: e.value })),
  );
  log("=== text 입력 목록 ===");
  for (const n of nodes) log("  ", JSON.stringify(n));
} catch (e) {
  log("오류:", e.message);
} finally {
  await browser.close();
}
