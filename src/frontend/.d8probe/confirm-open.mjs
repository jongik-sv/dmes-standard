// D8 룰 확정 취소 3단계 — 버전 확정(ruleConfirm)에서 ver 2 를 2026-12-31 00:00:00 으로 확정.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/d8-shots";
const BASE = "http://localhost:5100";
const APPLY = "2026-12-31 00:00:00";

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
    if (b?.data?.result?.issues) log("   issues =", JSON.stringify(b.data.result.issues).slice(0, 400));
  }
});

let n = 5;
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

  // 룰 목록 → 대상 선택
  await sidebar.getByText("룰", { exact: true }).first().click();
  await page.waitForTimeout(3500);
  await page.getByText("PROD_WGT_CALC", { exact: true }).first().click();
  await page.waitForTimeout(2000);

  // ── 버전 확정 화면 ──
  await sidebar.getByText("버전 확정", { exact: true }).first().click();
  await page.waitForTimeout(5000);
  await shot("rule-confirm-open");
  log("URL =", page.url());

  const body = await page.locator("body").innerText();
  log("화면에 '적용 시작' =", body.includes("적용 시작"));
  log("확정 버튼 존재 =", body.includes("확정"));

  // 적용 시작 일시 입력 칸 찾기
  const inputs = await page.locator("input").all();
  log("input 개수 =", inputs.length);
  for (const [i, el] of inputs.entries()) {
    const ph = await el.getAttribute("placeholder");
    const type = await el.getAttribute("type");
    const val = await el.inputValue().catch(() => "");
    const testid = await el.getAttribute("data-testid");
    log(`  [${i}] type=${type} ph=${ph} testid=${testid} value=${val}`);
  }

  fs.writeFileSync(`${OUT}/trace3.json`, JSON.stringify(trace, null, 2));
  log("완료(3차) — 입력 확인 후 다음 단계");
} catch (e) {
  log("오류:", e.message);
  await shot("error3");
} finally {
  fs.writeFileSync(`${OUT}/trace3.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
