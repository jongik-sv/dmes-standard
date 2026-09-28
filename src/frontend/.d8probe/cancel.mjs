// D8 룰 확정 취소 4단계 — 룰 화면(ruleEdit) 에서 확정 취소 버튼 확인 → 확인창 승인.
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
  if (u.includes("/oasis/ruleEdit/")) {
    const act = u.split("/oasis/")[1].split("?")[0];
    let b = null;
    try { b = await r.json(); } catch { /* noop */ }
    const rec = { call: act, status: r.status(), success: b?.meta?.success, msg: b?.meta?.message ?? null,
                  body: act === "view" ? (b?.data?.result?.versions ?? null) : undefined };
    trace.push(rec);
    log("NET", act, r.status(), "success =", b?.meta?.success, "msg =", JSON.stringify(b?.meta?.message ?? ""));
    if (act === "view" && rec.body) {
      for (const v of rec.body) log("    ver =", v.ver, "status =", v.status, "owner =", v.ownerId, "applyFrom =", v.applyFrom, "cancelConfirmable =", v.cancelConfirmable);
    }
  }
});

let n = 21;
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
  // 룰 목록에서 대상을 먼저 고른 뒤 룰 화면으로 간다(선택 없으면 화면이 빈 상태다).
  await sidebar.getByText("룰", { exact: true }).first().click();
  await page.waitForTimeout(4000);
  await page.getByText("PROD_WGT_CALC", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await sidebar.getByText("룰 화면", { exact: true }).first().click();
  await page.waitForTimeout(6000);
  await shot("rule-edit-after-confirm");

  const btn = page.locator("[data-testid='rule-cancel-confirm']").first();
  log("버튼 존재 =", await btn.count());
  log("버튼 disabled =", await btn.isDisabled());
  log("버튼 텍스트 =", JSON.stringify((await btn.innerText()).trim()));

  if (!(await btn.isDisabled())) {
    await btn.click();
    await page.waitForTimeout(2000);
    await shot("cancel-confirm-dialog");

    const body = await page.locator("body").innerText();
    log("교차 효과 문구 =", body.includes("룰 세트") && body.includes("다른 룰의 확정이 잠시 막힙니다"));
    const modalTxt = await page.locator(".mantine-Modal-content, [role='dialog']").first().innerText().catch(() => "(모달 없음)");
    log("모달 내용 =", JSON.stringify(modalTxt.slice(0, 400)));

    const ok = page.getByRole("button", { name: "확인", exact: true });
    log("확인 버튼 =", await ok.count());
    if (await ok.count()) {
      await ok.first().click();
      await page.waitForTimeout(5000);
      await shot("after-cancel");
      const b2 = await page.locator("body").innerText();
      log("취소 후 본문 =", b2.slice(-500).replace(/\n/g, " | "));
    }
  }
} catch (e) {
  log("오류:", e.message);
  await shot("error-cancel");
} finally {
  fs.writeFileSync(`${OUT}/trace9.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
