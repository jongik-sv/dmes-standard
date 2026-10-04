import { test } from "@playwright/test";

const BASE = "http://localhost:5100";
const SCREENS = [
  { id: "commMenuMng",      label: "메뉴 관리",            group: "시스템관리" },
  { id: "commRoleGrpMng",   label: "역할 그룹 관리",       group: "시스템관리" },
  { id: "commPermMng",      label: "PERMISSION 관리",      group: "시스템관리" },
  { id: "commUserRoleCopy", label: "사용자 권한 일괄 등록", group: "시스템관리" },
  { id: "commSyncMng",      label: "동기화 관리",          group: "시스템관리" },
  { id: "masterCodeMngList",label: "Master Code 상세조회", group: "마스터관리(가동)" },
];

test.describe.configure({ mode: "serial" });

for (const s of SCREENS) {
  test(`snap ${s.id}`, async ({ page, context }) => {
    test.setTimeout(120_000);
    page.setViewportSize({ width: 1600, height: 900 });

    const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
    const { csrfToken } = await csrfResp.json();
    await context.request.post(`${BASE}/api/auth/callback/credentials`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
    });
    await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_500);

    for (const g of ["공통관리", "시스템관리", "마스터관리(가동)"]) {
      try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(300); } catch {}
    }
    await page.locator(`.tree-item:has-text("${s.label}")`).first().click();
    await page.waitForTimeout(4_500);
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}

    const rowCount = await page.locator(".ag-row").count();
    const panels = await page.locator('[class*="content-panel"]').evaluateAll(els =>
      els.map(p => { const r = p.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
    );
    console.log(`[${s.id}] rows=${rowCount} panels=${JSON.stringify(panels)}`);
    await page.screenshot({ path: `snap/snap_${s.id}.png`, fullPage: false });
  });
}
