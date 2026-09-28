// D8 룰 확정 취소 3단계 실행 — 적용 시작 2026-12-31 00:00:00 으로 확정.
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
  }
});

let n = 8;
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
  await page.waitForTimeout(4000);

  // ── 적용 시작 일시 입력 ──
  const applyInput = page.locator("input[placeholder='YYYY-MM-DD HH:mm:ss']").first();
  log("적용 일시 input 개수 =", await page.locator("input[placeholder='YYYY-MM-DD HH:mm:ss']").count());
  await applyInput.fill(APPLY);
  log("적용 시작 입력 =", await applyInput.inputValue());
  await page.waitForTimeout(800);
  await shot("apply-entered");

  // [검사]
  const checkBtn = page.getByRole("button", { name: "검사", exact: true });
  log("검사 버튼 존재 =", await checkBtn.count());
  await checkBtn.click();
  await page.waitForTimeout(3000);
  await shot("after-check");

  // [확정] — 모달이 뜨면 확인
  const confirmBtn = page.getByRole("button", { name: "확정", exact: true }).first();
  log("확정 버튼 disabled =", await confirmBtn.isDisabled());
  await confirmBtn.click();
  await page.waitForTimeout(2500);
  await shot("confirm-modal");

  // 모달 [확인]
  const okBtn = page.getByRole("button", { name: "확인", exact: true });
  if (await okBtn.count()) {
    log("모달 [확인] 클릭");
    await okBtn.first().click();
    await page.waitForTimeout(4000);
  } else {
    log("모달 없음 — 경고 체크박스 확인");
    const ack = page.locator("input[type='checkbox']").last();
    if (await ack.count()) { await ack.check().catch(() => {}); await page.waitForTimeout(500); }
    const again = page.getByRole("button", { name: "확정", exact: true }).first();
    if (await again.count()) { await again.click(); await page.waitForTimeout(2000); }
    const ok2 = page.getByRole("button", { name: "확인", exact: true });
    if (await ok2.count()) { await ok2.first().click(); await page.waitForTimeout(4000); }
  }
  await shot("after-confirm");

  const body = await page.locator("body").innerText();
  log("본문에 '확정되었습니다' =", body.includes("확정되었습니다"));
  log("본문에 오류 =", /오류|실패|거부/.test(body) ? body.match(/.{0,60}(오류|실패|거부).{0,60}/)?.[0] : "없음");

  fs.writeFileSync(`${OUT}/trace5.json`, JSON.stringify(trace, null, 2));
  log("완료(5차)");
} catch (e) {
  log("오류:", e.message);
  await shot("error5");
} finally {
  fs.writeFileSync(`${OUT}/trace5.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
