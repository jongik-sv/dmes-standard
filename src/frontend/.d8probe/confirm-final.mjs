// D8 룰 확정 취소 3단계 완료 — 경고 확인 후 확정 실행.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/d8-shots";
const BASE = "http://localhost:5100";
const log = (...a) => console.log("[d8]", ...a);
const trace = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, storageState: `${OUT}/auth.json` });
const page = await ctx.newPage();

page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/oasis/ruleEdit/") || u.includes("/oasis/ruleConfirm/")) {
    const act = u.split("/oasis/")[1].split("?")[0];
    let b = null;
    try { b = await r.json(); } catch { /* noop */ }
    trace.push({ call: act, status: r.status(), success: b?.meta?.success, msg: b?.meta?.message ?? null });
    log("NET", act, r.status(), "success =", b?.meta?.success, "msg =", JSON.stringify(b?.meta?.message ?? ""));
  }
});

let n = 18;
const shot = async (name) => {
  n += 1;
  const p = `${OUT}/${String(n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: p });
  log("캡처 →", p);
};

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

  const trigger = page.locator("[data-testid='rc-apply-from']").first();
  await trigger.click();
  await page.waitForTimeout(1000);
  await page.locator("select").nth(0).selectOption({ label: "12월" });
  await page.waitForTimeout(600);
  await page.locator("select").nth(1).selectOption({ label: "2026" });
  await page.waitForTimeout(900);
  await page.locator("table button[aria-label='31 12월 2026']").first().click();
  await page.waitForTimeout(1000);
  const timeInputs = page.locator("input.mantine-TimePicker-field");
  for (let i = 0; i < (await timeInputs.count()); i += 1) {
    await timeInputs.nth(i).click();
    await timeInputs.nth(i).fill("0");
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(800);
  log("적용 시작 =", JSON.stringify((await trigger.innerText()).trim()));

  await page.locator("[data-testid='rc-validate']").first().click();
  await page.waitForTimeout(4000);
  await page.locator("[data-testid='rc-confirm']").first().click();
  await page.waitForTimeout(2500);
  await shot("modal-with-warn");

  // 경고 확인 체크
  const ack = page.getByText("경고를 확인했습니다").first();
  log("경고 확인 문구 존재 =", await ack.count());
  await ack.click();
  await page.waitForTimeout(700);
  await shot("warn-acked");

  const ok = page.locator("[data-testid='rc-modal-ok']").first();
  log("확인 disabled =", await ok.isDisabled());
  await ok.click();
  await page.waitForTimeout(6000);
  await shot("after-confirm");

  const body = await page.locator("body").innerText();
  log("본문 =", body.slice(-400).replace(/\n/g, " | "));
} catch (e) {
  log("오류:", e.message);
  await shot("error-final");
} finally {
  fs.writeFileSync(`${OUT}/trace8.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
