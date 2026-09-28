// D8 룰 확정 취소 3단계 — 버전 확정(ruleConfirm)에서 PROD_WGT_CALC ver 2 를 2026-12-31 00:00:00 으로 확정.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/d8-shots";
const BASE = "http://localhost:5100";
const APPLY = "2026-12-31T00:00";

const log = (...a) => console.log("[d8]", ...a);
const trace = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  storageState: `${OUT}/auth.json`,
});
const page = await ctx.newPage();

page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/oasis/ruleEdit/") || u.includes("/oasis/ruleConfirm/")) {
    const act = u.split("/oasis/")[1].split("?")[0];
    let b = null;
    try { b = await r.json(); } catch { /* noop */ }
    const rec = { call: act, status: r.status(), success: b?.meta?.success, msg: b?.meta?.message ?? null };
    trace.push(rec);
    log("NET", act, r.status(), "success =", rec.success, "msg =", JSON.stringify(rec.msg));
  }
});

let n = 6;
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

  // ── 대상 룰 선택 ──
  await page.getByText("PROD_WGT_CALC", { exact: true }).first().click();
  await page.waitForTimeout(4000);
  await shot("confirm-selected");

  const body = await page.locator("body").innerText();
  log("'적용 시작' 표시 =", body.includes("적용 시작"));
  log("'확정' 버튼 =", body.includes("확정"));

  // 적용 시작 일시 입력
  const dtInputs = await page.locator("input[type='datetime-local'], input[placeholder*='적용'], input[data-testid*='apply']").all();
  log("적용 일시 후보 input =", dtInputs.length);
  for (const el of dtInputs) {
    log("   testid =", await el.getAttribute("data-testid"), " value =", await el.inputValue().catch(() => ""));
  }
  if (dtInputs.length) {
    await dtInputs[0].fill(APPLY);
    log("입력 완료 →", APPLY);
    await page.waitForTimeout(500);
  }
  await shot("apply-filled");

  fs.writeFileSync(`${OUT}/trace4.json`, JSON.stringify(trace, null, 2));
  log("완료(4차) — 다음에 확정 실행");
} catch (e) {
  log("오류:", e.message);
  await shot("error4");
} finally {
  fs.writeFileSync(`${OUT}/trace4.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
