import { test } from "@playwright/test";

const BASE = "http://localhost:5100";

const SCREENS = [
  { id: "commObjMng",  label: "OBJECT 관리",   group: "시스템관리" },
  { id: "commRoleMng", label: "역할 관리",     group: "시스템관리" },
  { id: "commPermMng", label: "PERMISSION 관리", group: "시스템관리" },
];

test.describe.configure({ mode: "serial" });

for (const s of SCREENS) {
  test(`round4 verify ${s.id}`, async ({ page, context }) => {
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
    const panels = await page.locator('[class*="content-panel"]').evaluateAll(els =>
      els.map(p => { const r = p.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
    );
    const filterLabels = await page.locator('text="FILTER"').allInnerTexts().catch(() => []);
    const accessTpOptions = await page.locator('select option, option').allInnerTexts().catch(() => []);
    console.log(`[${s.id}] rows=${rowCount} panels=${JSON.stringify(panels)}`);
    console.log(`[${s.id}] FILTER count=${filterLabels.length}, accessTpHints=${JSON.stringify(accessTpOptions.filter(t => t.includes("내부") || t.includes("외부") || t.includes("neXacro")).slice(0, 5))}`);

    await page.screenshot({ path: `snap/round4_${s.id}.png`, fullPage: false });
  });
}
