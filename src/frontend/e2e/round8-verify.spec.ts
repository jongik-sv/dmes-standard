import { test } from "@playwright/test";

const BASE = "http://localhost:5100";

test("round8 — 탭 라벨 + commObjMng FORM_URL/OBJECT_ID/SYSTEM 검증", async ({ page, context }) => {
  test.setTimeout(180_000);
  page.setViewportSize({ width: 1600, height: 900 });

  const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();
  await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
  });
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5_000);

  for (let i = 0; i < 3; i++) {
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 500 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}
  }
  for (const g of ["공통관리", "시스템관리"]) {
    try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(400); } catch {}
  }

  // OBJECT 관리 클릭
  await page.locator(`.tree-item:has-text("OBJECT 관리")`).first().click();
  await page.waitForTimeout(4_000);
  for (let i = 0; i < 3; i++) {
    const overlay = await page.locator('.cm-message-modal-overlay').count();
    if (overlay === 0) break;
    try { await page.keyboard.press("Escape"); await page.waitForTimeout(300); } catch {}
  }

  // 탭 라벨 확인 — pageId 가 아니라 화면명 "OBJECT 관리" 가 보여야 함
  const tabTexts = await page.locator('.tab-bar, [class*="tab"]').evaluateAll(els =>
    els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0 && t.length < 50)
  ).catch(() => []);
  const objMngTabFound = tabTexts.some(t => t.includes("OBJECT 관리"));
  const pageIdLikeTab = tabTexts.some(t => t.includes("mcm:csa/commObjMng") || t.includes("mcm:") );
  console.log(`[round8] tab labels (head 10) = ${JSON.stringify(tabTexts.slice(0, 10))}`);
  console.log(`[round8] tabHasObjMng=${objMngTabFound} pageIdLeak=${pageIdLikeTab}`);

  // commObjMng 행추가
  await page.locator('button:has-text("행추가")').first().click().catch(() => {});
  await page.waitForTimeout(700);

  // Detail SYSTEM 콤보 확인 (select 요소)
  const systemSelectCount = await page.locator('select').filter({ has: page.locator('option[value="mcm"]') }).count();
  console.log(`[round8] SYSTEM select count = ${systemSelectCount}`);

  // FORM URL readOnly 확인
  const formUrlInputs = await page.locator('input').evaluateAll(els =>
    els.filter(e => {
      const parent = (e as HTMLElement).closest('tr, div');
      return parent && parent.textContent?.includes("FORM URL");
    }).map(e => ({
      readOnly: (e as HTMLInputElement).readOnly,
      value: (e as HTMLInputElement).value,
      bgColor: getComputedStyle(e).backgroundColor,
    }))
  );
  console.log(`[round8] FORM URL inputs = ${JSON.stringify(formUrlInputs)}`);

  await page.screenshot({ path: `snap/round8_commObjMng.png`, fullPage: false });
});
