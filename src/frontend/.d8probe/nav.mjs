// D8 룰 확정 취소 — 3~5단계 전체 흐름 (확정 → 취소 → 검증).
// 저장된 auth.json(storageState)으로 admin 로그인 상태를 재사용한다.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/d8-shots";
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:5100";
const RULE = "PROD_WGT_CALC";
const VER = "2";
const APPLY_FROM = "2026-12-31 00:00:00";

const log = (...a) => console.log("[d8]", ...a);
const trace = [];
const note = (k, v) => { trace.push({ k, v }); log(k, "=", JSON.stringify(v)); };

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
    let body = null;
    try { body = await r.json(); } catch { /* noop */ }
    note("NET", {
      call: act, status: r.status(),
      success: body?.meta?.success, msg: body?.meta?.message ?? null,
    });
  }
});

let step = 0;
const shot = async (name) => {
  step += 1;
  const p = `${OUT}/${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: p });
  log("캡처 →", p);
};

try {
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  const sidebar = page.locator(".sidebar-container");
  await sidebar.waitFor({ timeout: 45000 });

  // ── 마루 MDM 펼치기 ──
  await sidebar.getByText("마루 MDM", { exact: false }).first().click();
  await page.waitForTimeout(1500);
  await shot("mdm-group");

  // ── 업무기준 그룹 펼치기 ──
  const dme = sidebar.getByText("업무기준", { exact: false }).first();
  if (await dme.count()) {
    await dme.click();
    await page.waitForTimeout(1500);
  }
  await shot("dme-group");

  // ── "룰" 화면 열기 ──
  const ruleEntry = sidebar.getByText("룰", { exact: true }).first();
  const n = await ruleEntry.count();
  log("사이드바 '룰' 엔트리 수 =", n);
  if (n === 0) {
    const alt = sidebar.getByText("룰", { exact: false }).first();
    log("부분 일치 시도, count =", await alt.count());
    await alt.click();
  } else {
    await ruleEntry.click();
  }
  await page.waitForTimeout(4000);
  await shot("rule-mng");

  fs.writeFileSync(`${OUT}/trace.json`, JSON.stringify(trace, null, 2));
  log("현재 URL =", page.url());
  log("사이드바 텍스트 =", JSON.stringify((await sidebar.innerText()).slice(0, 400)));
  log("완료(1차)");
} catch (e) {
  log("오류:", e.message);
  await shot("error");
} finally {
  fs.writeFileSync(`${OUT}/trace.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
