// DateTimePicker 드롭다운 내부 구조(네이티브 select) 조사.
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

  await page.locator("[data-testid='rc-apply-from']").first().click();
  await page.waitForTimeout(1200);

  const sels = await page.locator("select").evaluateAll((els) =>
    els.map((e, i) => ({
      i, aria: e.getAttribute("aria-label"), dv: e.getAttribute("data-value"),
      cls: (e.className || "").slice(0, 50),
      opts: Array.from(e.options).slice(0, 6).map((o) => o.value + ":" + o.text),
      total: e.options.length,
    })),
  );
  log("=== select 요소 ===");
  for (const s of sels) log("  ", JSON.stringify(s));

  const btns = await page.locator("[role='dialog'] button, .mantine-DatePicker-calendarHeader button").evaluateAll((els) =>
    els.map((e, i) => ({ i, txt: (e.textContent || "").trim().slice(0, 20), aria: e.getAttribute("aria-label") })),
  );
  log("=== 달력 버튼 ===");
  for (const b of btns) log("  ", JSON.stringify(b));

  const tables = await page.locator("table button").evaluateAll((els) =>
    els.slice(0, 6).map((e) => (e.textContent || "").trim()),
  );
  log("=== 달력 표 첫 셀 =", JSON.stringify(tables));
  await page.screenshot({ path: `${OUT}/14-picker-open.png` });
  log("캡처 → /tmp/d8-shots/14-picker-open.png");
} catch (e) {
  log("오류:", e.message);
} finally {
  await browser.close();
}
