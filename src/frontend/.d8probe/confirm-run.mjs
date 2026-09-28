// D8 룰 확정 취소 3단계 — rc-apply-from(Mantine DateTimePicker) 에 2026-12-31 00:00:00 을 넣고 확정.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/d8-shots";
const BASE = "http://localhost:5100";
const APPLY = "2026-12-31 00:00:00";

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

let n = 10;
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

  // 트리거 버튼 클릭 → Mantine 입력(숨김 input) 에 직접 입력
  const trigger = page.locator("[data-testid='rc-apply-from']").first();
  log("트리거 존재 =", await trigger.count());
  await trigger.click();
  await page.waitForTimeout(800);

  // 숨김 실제 input 찾기
  const hidden = page.locator("input[value*='-']:not([type=checkbox]):not([type=radio])").last();
  const cnt = await page.locator("input:not([type=checkbox]):not([type=radio])").count();
  log("일반 input 수 =", cnt);
  const info = await page.locator("input:not([type=checkbox]):not([type=radio])").evaluateAll((els) =>
    els.map((e, i) => ({ i, val: e.value, cls: (e.className || "").slice(0, 40), id: e.id })),
  );
  for (const x of info) log("  ", JSON.stringify(x));

  // 타입 입력 시도
  await page.keyboard.type(APPLY, { delay: 40 });
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(800);
  await shot("apply-typed");
  log("트리거 텍스트 =", (await trigger.innerText()).trim());

  // [검사]
  await page.locator("[data-testid='rc-validate']").first().click();
  await page.waitForTimeout(3500);
  await shot("after-validate");

  // [확정] → 모달
  const conf = page.locator("[data-testid='rc-confirm']").first();
  log("확정 disabled =", await conf.isDisabled());
  await conf.click();
  await page.waitForTimeout(2500);
  await shot("confirm-modal");

  // 모달 확인
  const ok = page.getByRole("button", { name: "확인", exact: true });
  if (await ok.count()) {
    log("모달 [확인] 존재 =", await ok.count());
    await ok.first().click();
  } else {
    log("확인 버튼 없음 — 경고 체크 후 재시도");
    const ack = page.locator("input[type='checkbox']").last();
    if (await ack.count()) await ack.check().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator("[data-testid='rc-confirm']").first().click();
    await page.waitForTimeout(2000);
    const ok2 = page.getByRole("button", { name: "확인", exact: true });
    if (await ok2.count()) await ok2.first().click();
  }
  await page.waitForTimeout(5000);
  await shot("after-confirm");

  const body = await page.locator("body").innerText();
  log("본문 오류/거부 =", /오류|실패|거부|안 됩니다/.test(body) ? body.match(/.{0,70}(오류|실패|거부|안 됩니다).{0,70}/)?.[0] : "없음");
} catch (e) {
  log("오류:", e.message);
  await shot("error-exec");
} finally {
  fs.writeFileSync(`${OUT}/trace6.json`, JSON.stringify(trace, null, 2));
  await browser.close();
}
