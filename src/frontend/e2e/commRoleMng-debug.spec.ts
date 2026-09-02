import { test } from "@playwright/test";

const BASE = "http://localhost:5000";

test("commRoleMng 결함 조사", async ({ page, context }) => {
  test.setTimeout(120_000);
  page.setViewportSize({ width: 1600, height: 900 });

  // Console + page error 수집
  const consoleMsgs: string[] = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) {
      consoleMsgs.push(`[${m.type()}] ${m.text()}`);
    }
  });
  page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

  // 로그인
  const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();
  await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
  });
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3_000);

  // 사이드바 전개
  for (const g of ["공통관리", "시스템관리"]) {
    try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(400); } catch {}
  }
  await page.locator(`.tree-item:has-text("역할 관리")`).first().click();
  await page.waitForTimeout(5_000);

  // 모달 dismiss
  try {
    const b = page.getByRole("button", { name: "확인", exact: true }).first();
    if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
  } catch {}

  // DOM 구조 추출
  const domInfo = await page.evaluate(() => {
    // active tab content (last visible content-body)
    const allBodies = Array.from(document.querySelectorAll('[class*="content-body"]'));
    const visibleBodies = allBodies.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    // commRoleMng active panel 추정
    const role = visibleBodies.map(b => {
      const text = b.textContent?.slice(0, 60);
      const r = b.getBoundingClientRect();
      return { tag: b.tagName, cls: b.className, w: r.width, h: r.height, text };
    });

    // ag-grid 존재
    const grids = Array.from(document.querySelectorAll(".ag-root-wrapper, .ag-root, .ag-theme-quartz, [class*='ag-']"))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .slice(0, 5)
      .map(g => {
        const r = g.getBoundingClientRect();
        return { cls: g.className.toString().slice(0, 80), w: r.width, h: r.height };
      });

    // ContentPanel 들
    const panels = Array.from(document.querySelectorAll('[class*="content-panel"]')).map(p => {
      const r = p.getBoundingClientRect();
      return { cls: p.className.toString().slice(0, 80), w: r.width, h: r.height };
    });

    return { contentBodies: role, grids, panels: panels.slice(-10) };
  });
  console.log("DOM_INFO:", JSON.stringify(domInfo, null, 2));
  console.log("CONSOLE_MSGS:", JSON.stringify(consoleMsgs, null, 2));

  await page.screenshot({ path: "snap/dbg_commRoleMng.png", fullPage: false });
});
