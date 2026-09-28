// D8 룰 확정 취소 3단계 — rc-apply-from 에 2026-12-31 00:00:00 을 넣어 확정까지 실행.
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

let n = 14;
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

  // 월(0) → 12월, 연(1) → 2026
  await page.locator("select").nth(0).selectOption({ label: "12월" });
  await page.waitForTimeout(600);
  await page.locator("select").nth(1).selectOption({ label: "2026" });
  await page.waitForTimeout(900);
  log("월·연 설정 완료");
  await shot("year-month-set");

  // 31일 클릭
  const day31 = page.locator("table button[aria-label*='31 12월 2026'], table button").filter({ hasText: /^31$/ }).first();
  const byLabel = page.locator("table button[aria-label='31 12월 2026']");
  const target = (await byLabel.count()) ? byLabel.first() : day31;
  log("31일 버튼 존재 =", await byLabel.count());
  await target.click();
  await page.waitForTimeout(1200);

  // 시·분·초 = 0
  const timeInputs = page.locator("input.mantine-TimePicker-field");
  log("시간 입력 칸 =", await timeInputs.count());
  for (let i = 0; i < (await timeInputs.count()); i += 1) {
    const el = timeInputs.nth(i);
    await el.click();
    await el.fill("0");
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(900);
  await shot("apply-set");

  const txt = (await trigger.innerText()).trim();
  log("트리거 표시값 =", JSON.stringify(txt));

  // [검사]
  await page.locator("[data-testid='rc-validate']").first().click();
  await page.waitForTimeout(4000);
  await shot("after-validate");

  const conf = page.locator("[data-testid='rc-confirm']").first();
  log("확정 disabled =", await conf.isDisabled());
  if (await conf.isDisabled()) {
    log("→ 확정 비활성. 본문 일부 =", (await page.locator("body").innerText()).slice(-500).replace(/\n/g, " | "));
  } else {
    await conf.click();
    await page.waitForTimeout(2500);
    await shot("confirm-modal");
    const ok = page.getByRole("button", { name: "확인", exact: true });
    log("모달 [확인] =", await ok.count());
    if (await ok.count()) await ok.first().click();
    await page.waitForTimeout(5000);
    await shot("after-confirm");
    const body = await page.locator("body").innerText();
    log("확정 성공 문구 =", body.includes("확정되었") || body.includes("확정 완료"));
  }
} catch (e) {
  log("오류:", e.message);
  await shot("error-run");
} finally {
  fs.writeFileSync(`${OUT}/trace7.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
