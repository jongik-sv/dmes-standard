import { test } from "@playwright/test";

const BASE = "http://localhost:5000";

test.describe.configure({ mode: "serial" });

test("round3-phase1 commMenuMng verify", async ({ page, context }) => {
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

  // 모달 dismiss (페이지 진입 시 자동 모달)
  for (let i = 0; i < 3; i++) {
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 500 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}
  }

  // 사이드바 검증 — 폴더 (공통관리/마스터관리(원장)/시스템관리/마스터관리(가동)) 가 보이는지
  const sidebarItems = await page.locator(".tree-item").evaluateAll(els =>
    els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0)
  );
  console.log(`[sidebar] items=${JSON.stringify(sidebarItems.slice(0, 30))}`);

  // 시스템관리 전개 + 메뉴 관리 클릭
  for (const g of ["공통관리", "시스템관리"]) {
    try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(400); } catch {}
  }
  await page.locator(`.tree-item:has-text("메뉴 관리")`).first().click();
  await page.waitForTimeout(5_000);
  try {
    const b = page.getByRole("button", { name: "확인", exact: true }).first();
    if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
  } catch {}

  // 초기 조회 (트리 미선택) — 메인 그리드 = leaf 13 개만 (모듈/그룹 ✗)
  const initialRows = await page.locator(".ag-row").count();
  const treeNodes = await page.locator('[class*="tree-node"], .cm-tree [role="treeitem"]').count().catch(() => 0);
  console.log(`[initial] rows=${initialRows} treeNodes=${treeNodes}`);

  // 메인 그리드의 MENU_ID 컬럼 첫 10개 추출
  const initialMenuIds = await page.locator('.ag-center-cols-container .ag-row').evaluateAll(rows =>
    rows.slice(0, 15).map(r => {
      const cells = Array.from(r.querySelectorAll(".ag-cell")).map(c => (c.textContent ?? "").trim());
      return cells.slice(0, 3);
    })
  );
  console.log(`[initial menus] ${JSON.stringify(initialMenuIds)}`);

  await page.screenshot({ path: "snap/r3p1_init.png", fullPage: false });

  // 트리 노드 "시스템관리" 클릭 → 메인 그리드 = csa 후손 8 화면
  const csaTreeNode = page.locator('.cm-tree [role="treeitem"]:has-text("시스템관리"), [class*="tree-node"]:has-text("시스템관리")').first();
  if (await csaTreeNode.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await csaTreeNode.click();
    await page.waitForTimeout(3_000);
    const csaRows = await page.locator(".ag-row").count();
    const csaMenuIds = await page.locator('.ag-center-cols-container .ag-row').evaluateAll(rows =>
      rows.slice(0, 15).map(r => {
        const cells = Array.from(r.querySelectorAll(".ag-cell")).map(c => (c.textContent ?? "").trim());
        return cells.slice(0, 3);
      })
    );
    console.log(`[csa click] rows=${csaRows} menus=${JSON.stringify(csaMenuIds)}`);
    await page.screenshot({ path: "snap/r3p1_csa.png", fullPage: false });
  } else {
    console.log(`[csa click] 시스템관리 트리 노드 미발견 — DOM selector 점검 필요`);
  }

  // 트리 노드 "공통관리" 클릭 → 메인 그리드 = mcm 후손 = 13 leaf 모두
  const mcmTreeNode = page.locator('.cm-tree [role="treeitem"]:has-text("공통관리"), [class*="tree-node"]:has-text("공통관리")').first();
  if (await mcmTreeNode.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await mcmTreeNode.click();
    await page.waitForTimeout(3_000);
    const mcmRows = await page.locator(".ag-row").count();
    console.log(`[mcm click] rows=${mcmRows}`);
    await page.screenshot({ path: "snap/r3p1_mcm.png", fullPage: false });
  }
});
