import { test } from "@playwright/test";

const BASE = "http://localhost:5000";

const SCREENS = [
  { id: "commRoleMng",    label: "역할 관리",      group: "시스템관리" },
  { id: "commRoleGrpMng", label: "역할 그룹 관리", group: "시스템관리" },
  { id: "commMenuMng",    label: "메뉴 관리",      group: "시스템관리" },
  { id: "commPermMng",    label: "PERMISSION 관리", group: "시스템관리" },
];

test.describe.configure({ mode: "serial" });

for (const s of SCREENS) {
  test(`round2 verify ${s.id}`, async ({ page, context }) => {
    test.setTimeout(180_000);
    page.setViewportSize({ width: 1600, height: 900 });

    const consoleMsgs: string[] = [];
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
    });
    page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${e.message.slice(0, 200)}`));

    const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
    const { csrfToken } = await csrfResp.json();
    await context.request.post(`${BASE}/api/auth/callback/credentials`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
    });
    await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_500);

    for (const g of ["공통관리", "시스템관리"]) {
      try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(300); } catch {}
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
    const treeNodes = await page.locator('[class*="tree-node"], .cm-tree [role="treeitem"]').count().catch(() => 0);
    const buttons = await page.locator('button').evaluateAll(els =>
      Array.from(new Set(els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0 && t.length < 30)))
    ).catch(() => []);
    console.log(`[${s.id}] rows=${rowCount} treeNodes=${treeNodes} panels=${JSON.stringify(panels)}`);
    console.log(`[${s.id}] btns=${JSON.stringify(buttons.slice(0, 25))}`);
    if (consoleMsgs.length > 0) console.log(`[${s.id}] errors=${JSON.stringify(consoleMsgs.slice(0, 5))}`);

    await page.screenshot({ path: `snap/round2_${s.id}.png`, fullPage: false });
  });
}
