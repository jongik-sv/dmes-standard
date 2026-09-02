import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5000";

test("round8b — commObjMng 조회 후 첫 행 선택 시 FORM URL = csa/commObjMng", async ({ page, context }) => {
  test.setTimeout(120_000);
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
  await page.locator(`.tree-item:has-text("OBJECT 관리")`).first().click();
  await page.waitForTimeout(4_000);
  for (let i = 0; i < 3; i++) {
    const overlay = await page.locator('.cm-message-modal-overlay').count();
    if (overlay === 0) break;
    try { await page.keyboard.press("Escape"); await page.waitForTimeout(300); } catch {}
  }

  // 조회 (auto-search 적용된 화면이므로 이미 데이터 로드)
  await page.waitForTimeout(2_000);
  for (let i = 0; i < 3; i++) {
    const overlay = await page.locator('.cm-message-modal-overlay').count();
    if (overlay === 0) break;
    try { await page.keyboard.press("Escape"); await page.waitForTimeout(300); } catch {}
  }

  // FORM URL Input 의 value 추출
  const formUrlInputs = await page.locator('input').evaluateAll(els =>
    els.filter(e => {
      const parent = (e as HTMLElement).closest('tr');
      return parent && parent.textContent?.includes("FORM URL");
    }).map(e => ({
      readOnly: (e as HTMLInputElement).readOnly,
      value: (e as HTMLInputElement).value,
    }))
  );
  console.log(`[round8b] FORM URL Input = ${JSON.stringify(formUrlInputs)}`);
  await page.screenshot({ path: `snap/round8b_detail_formurl.png`, fullPage: false });

  // 첫 행 = OBJECT 관리 (OBJECT_ID=commObjMng, PARENT_MENU_ID=csa)
  // 예상: FORM URL = csa/commObjMng
  expect(formUrlInputs.length).toBeGreaterThan(0);
  expect(formUrlInputs[0].readOnly).toBe(true);
  expect(formUrlInputs[0].value).toBe("csa/commObjMng");
});
