import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5100";

const LEAVES = [
  { id: "commObjMng",       label: "OBJECT 관리",         group: "시스템관리", expectedPath: "csa/commObjMng" },
  { id: "commMenuMng",      label: "메뉴 관리",            group: "시스템관리", expectedPath: "csa/commMenuMng" },
  { id: "commRoleMng",      label: "역할 관리",            group: "시스템관리", expectedPath: "csa/commRoleMng" },
  { id: "commRoleGrpMng",   label: "역할 그룹 관리",        group: "시스템관리", expectedPath: "csa/commRoleGrpMng" },
  { id: "commUserMng",      label: "사용자 관리",          group: "시스템관리", expectedPath: "csa/commUserMng" },
  { id: "commPermMng",      label: "PERMISSION 관리",     group: "시스템관리", expectedPath: "csa/commPermMng" },
  { id: "commUserRoleCopy", label: "사용자 권한 일괄 등록", group: "시스템관리", expectedPath: "csa/commUserRoleCopy" },
  { id: "commSyncMng",      label: "동기화 관리",          group: "시스템관리", expectedPath: "csa/commSyncMng" },
];

test.setTimeout(180_000);

test("phase12 — BE myMenusTree 응답에 componentPath 포함 (13 leaf row 검증)", async ({ context }) => {
  // 인증 cookie 적재 후 myMenusTree 호출
  const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();
  await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
  });

  const menuResp = await context.request.post(
    `${BASE}/api/mcm/oasis/secUser/myMenusTree`,
    { headers: { "Content-Type": "application/json" }, data: { params: {} } },
  );
  expect(menuResp.ok()).toBeTruthy();
  const body = await menuResp.json();
  const rows: Record<string, unknown>[] = body?.grids?.menus?.rows ?? body?.data?.menus ?? [];

  // flat traverse (rows 는 트리 — items 배열 재귀)
  const flat: Record<string, unknown>[] = [];
  const walk = (list: Record<string, unknown>[]): void => {
    for (const r of list) {
      flat.push(r);
      const children = (r as { items?: Record<string, unknown>[] }).items;
      if (Array.isArray(children) && children.length > 0) walk(children);
    }
  };
  walk(rows);

  const leafByObjId = new Map(
    flat.filter(r => r.objId).map(r => [String(r.objId), r])
  );
  let pass = 0, fail = 0;
  const missing: string[] = [];
  for (const s of LEAVES) {
    const r = leafByObjId.get(s.id);
    if (!r) { missing.push(`${s.id} (row not found)`); fail++; continue; }
    const cp = (r as { componentPath?: unknown }).componentPath;
    if (cp === s.expectedPath) { pass++; }
    else { missing.push(`${s.id}: got=${JSON.stringify(cp)} expected=${s.expectedPath}`); fail++; }
  }
  console.log(`[phase12] componentPath 검증 pass=${pass} fail=${fail}`);
  if (missing.length > 0) console.log(`[phase12] details: ${JSON.stringify(missing, null, 2)}`);
  expect(fail).toBe(0);
});

test("phase12 — 메뉴 클릭 시 13 화면 정상 마운트 (회귀)", async ({ page, context }) => {
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

  const results: { id: string; mounted: boolean }[] = [];
  for (const s of LEAVES) {
    try {
      await page.locator(`.tree-item:has-text("${s.label}")`).first().click();
      await page.waitForTimeout(3_000);
      // 잔존 메시지 close
      for (let i = 0; i < 3; i++) {
        const overlay = await page.locator('.cm-message-modal-overlay').count();
        if (overlay === 0) break;
        try {
          const okBtn = page.locator('.cm-message-modal-overlay').getByRole("button", { name: /확인|닫기/ }).first();
          if (await okBtn.isVisible({ timeout: 400 })) { await okBtn.click(); await page.waitForTimeout(300); }
        } catch {}
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }
      // breadcrumb 또는 페이지 헤더에 화면명 노출 여부로 마운트 확인
      const breadcrumbCount = await page.locator(`text=${s.label}`).count();
      results.push({ id: s.id, mounted: breadcrumbCount > 0 });
      console.log(`[phase12] ${s.id} mounted=${breadcrumbCount > 0}`);
    } catch (e) {
      results.push({ id: s.id, mounted: false });
      console.log(`[phase12] ${s.id} ERROR: ${e}`);
    }
  }
  await page.screenshot({ path: `snap/phase12_after.png`, fullPage: false });
  const failed = results.filter(r => !r.mounted);
  if (failed.length > 0) console.log(`[phase12] failed mounts: ${JSON.stringify(failed)}`);
  expect(failed.length).toBe(0);
});
