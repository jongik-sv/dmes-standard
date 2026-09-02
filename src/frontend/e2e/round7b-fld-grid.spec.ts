import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5000";

test.setTimeout(180_000);

test("round7b — 메뉴 필드 관리 그리드 팝업 동작", async ({ page, context }) => {
  page.setViewportSize({ width: 1600, height: 900 });

  const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();
  await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
  });
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3_000);

  // 잔존 메시지 close
  for (let i = 0; i < 3; i++) {
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 500 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}
  }
  for (const g of ["공통관리", "시스템관리"]) {
    try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(400); } catch {}
  }
  await page.locator(`.tree-item:has-text("메뉴 관리")`).first().click();
  await page.waitForTimeout(5_000);
  for (let i = 0; i < 5; i++) {
    const overlay = await page.locator('.cm-message-modal-overlay').count();
    if (overlay === 0) break;
    try {
      const okBtn = page.locator('.cm-message-modal-overlay').getByRole("button", { name: /확인|닫기|취소/ }).first();
      if (await okBtn.isVisible({ timeout: 400 })) { await okBtn.click(); await page.waitForTimeout(300); }
    } catch {}
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // 필드 관리 버튼 열기
  await page.getByRole("button", { name: "필드 관리", exact: true }).first().click();
  await page.waitForTimeout(2_000);

  const titleCount = await page.locator('text=메뉴 필드 관리').count();
  console.log(`[step1] modal title=${titleCount}`);

  // 그리드 row 카운트 — 시드 4행 (mcm/cma/csa/cme)
  const initialRows = await page.locator('.ag-row').count();
  console.log(`[step1] initial rows=${initialRows}`);

  // 행추가/행복사/행삭제 버튼 노출 확인
  const buttons = await page.locator('.cm-grid-panel button, .grid-panel button').evaluateAll(els =>
    Array.from(new Set(els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0 && t.length < 10)))
  ).catch(() => []);
  console.log(`[step1] grid buttons=${JSON.stringify(buttons)}`);

  await page.screenshot({ path: `snap/round7b_fld_initial.png`, fullPage: false });

  // 행추가 click
  try {
    await page.getByRole("button", { name: "행추가", exact: true }).first().click();
    await page.waitForTimeout(600);
    const afterAddRows = await page.locator('.ag-row').count();
    console.log(`[step2] after 행추가 rows=${afterAddRows}`);
    await page.screenshot({ path: `snap/round7b_fld_after_rowadd.png`, fullPage: false });
  } catch (e) {
    console.log(`[step2] 행추가 skipped: ${e}`);
  }

  // 닫기
  await page.locator('.cm-modal').getByRole("button", { name: "닫기", exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `snap/round7b_fld_closed.png`, fullPage: false });
});
