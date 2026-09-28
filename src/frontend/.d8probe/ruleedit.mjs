// D8 룰 확정 취소 — 룰 선택 → 룰 화면(ruleEdit) 진입 → 버전 목록 확인.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/d8-shots";
const BASE = "http://localhost:5100";
const RULE = "PROD_WGT_CALC";

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
    trace.push({ call: act, status: r.status(), success: b?.meta?.success, msg: b?.meta?.message ?? null });
    log("NET", act, r.status(), JSON.stringify(b?.meta?.message ?? ""));
  }
});

let n = 3;
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

  // 룰 목록 열고 대상 선택
  await sidebar.getByText("룰", { exact: true }).first().click();
  await page.waitForTimeout(3500);
  await page.getByText(RULE, { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await shot("rule-selected");
  log("선택 후 오른쪽 카드 =", (await page.locator("body").innerText()).includes("QLTY_GRD_JDG") ? "(기본값)" : "(변경됨)");

  // ── 룰 화면(ruleEdit) 진입 ──
  await sidebar.getByText("룰 화면", { exact: true }).first().click();
  await page.waitForTimeout(5000);
  await shot("rule-edit");

  // 버전 목록 카드 텍스트
  const body = await page.locator("body").innerText();
  const hasCancel = body.includes("확정 취소");
  log("버전 목록에 '확정 취소' 버튼 존재 =", hasCancel);

  // 버전 행 목록
  const rows = await page.locator("[data-testid^='rule-ver-row-']").all();
  log("버전 행 수 =", rows.length);
  for (const r of rows) {
    log("  행:", (await r.innerText()).replace(/\n/g, " | "));
  }

  // 확정 취소 버튼 상태
  const btn = page.locator("[data-testid='rule-cancel-confirm']");
  log("rule-cancel-confirm 개수 =", await btn.count());
  if (await btn.count()) {
    log("  disabled =", await btn.first().isDisabled());
  }

  fs.writeFileSync(`${OUT}/trace2.json`, JSON.stringify(trace, null, 2));
  log("완료(2차)");
} catch (e) {
  log("오류:", e.message);
  await shot("error2");
} finally {
  fs.writeFileSync(`${OUT}/trace2.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
