import { test } from "@playwright/test";

const BASE = "http://localhost:5100";

const SCREENS = [
  { id: "commUserMng",      label: "사용자 관리",         group: "시스템관리" },
  { id: "commUserRoleCopy", label: "사용자 권한 일괄 등록", group: "시스템관리" },
];

test.describe.configure({ mode: "serial" });

for (const s of SCREENS) {
  test(`round6 verify ${s.id}`, async ({ page, context }) => {
    test.setTimeout(180_000);
    page.setViewportSize({ width: 1600, height: 900 });

    const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
    const { csrfToken } = await csrfResp.json();
    await context.request.post(`${BASE}/api/auth/callback/credentials`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
    });
    await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);

    for (let i = 0; i < 3; i++) {
      try {
        const b = page.getByRole("button", { name: "확인", exact: true }).first();
        if (await b.isVisible({ timeout: 500 })) { await b.click(); await page.waitForTimeout(300); }
      } catch {}
    }

    for (const g of ["공통관리", "시스템관리"]) {
      try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(400); } catch {}
    }
    await page.locator(`.tree-item:has-text("${s.label}")`).first().click();
    await page.waitForTimeout(5_000);
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}

    const rowCount = await page.locator(".ag-row").count();
    const buttons = await page.locator('.page-button, button[class*="page-button"]').evaluateAll(els =>
      Array.from(new Set(els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0 && t.length < 20)))
    ).catch(() => []);
    const infReqVisible = await page.locator('text=정보처리').count().catch(() => 0);
    const panels = await page.locator('[class*="content-panel"]').evaluateAll(els =>
      els.map(p => { const r = p.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
    );
    console.log(`[${s.id}] rows=${rowCount} infReqVisible=${infReqVisible} btns=${JSON.stringify(buttons.slice(0, 15))}`);
    console.log(`[${s.id}] panels=${JSON.stringify(panels)}`);

    await page.screenshot({ path: `snap/round6_${s.id}.png`, fullPage: false });
  });
}
