import { test } from "@playwright/test";

const BASE = "http://localhost:5000";

const SCREENS = [
  { id: "commObjMng",       label: "OBJECT 관리",         group: "시스템관리" },
  { id: "commMenuMng",      label: "메뉴 관리",            group: "시스템관리" },
  { id: "commRoleMng",      label: "역할 관리",            group: "시스템관리" },
  { id: "commRoleGrpMng",   label: "역할 그룹 관리",        group: "시스템관리" },
  { id: "commUserMng",      label: "사용자 관리",          group: "시스템관리" },
  { id: "commPermMng",      label: "PERMISSION 관리",     group: "시스템관리" },
  { id: "commUserRoleCopy", label: "사용자 권한 일괄 등록", group: "시스템관리" },
  { id: "commSyncMng",      label: "동기화 관리",          group: "시스템관리" },
];

test.describe.configure({ mode: "serial" });

for (const s of SCREENS) {
  test(`round7 verify ${s.id} — 닫기 버튼 제거`, async ({ page, context }) => {
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

    const buttons = await page.locator('.page-button, button[class*="page-button"]').evaluateAll(els =>
      Array.from(new Set(els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0 && t.length < 20)))
    ).catch(() => []);
    const hasCloseBtn = buttons.some(b => b === "닫기");
    console.log(`[${s.id}] btns=${JSON.stringify(buttons.slice(0, 10))} hasCloseBtn=${hasCloseBtn}`);

    await page.screenshot({ path: `snap/round7_${s.id}.png`, fullPage: false });
  });
}

test(`round7 verify commMenuMng — 필드 추가 + OBJECT LookupModal`, async ({ page, context }) => {
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
  await page.locator(`.tree-item:has-text("메뉴 관리")`).first().click();
  await page.waitForTimeout(5_000);

  // 잔존 메시지 modal overlay 닫기 (확인 버튼 / ESC)
  for (let i = 0; i < 5; i++) {
    const overlay = await page.locator('.cm-message-modal-overlay').count();
    if (overlay === 0) break;
    try {
      const okBtn = page.locator('.cm-message-modal-overlay').getByRole("button", { name: /확인|닫기|취소/ }).first();
      if (await okBtn.isVisible({ timeout: 400 })) { await okBtn.click(); await page.waitForTimeout(300); continue; }
    } catch {}
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // 1. 필드 추가 버튼 click → 팝업 노출 확인
  await page.getByRole("button", { name: "필드 추가", exact: true }).first().click();
  await page.waitForTimeout(800);
  const fldModal = await page.locator('text=메뉴 필드 추가').count();
  console.log(`[commMenuMng] 필드추가 modal visible count=${fldModal}`);
  await page.screenshot({ path: `snap/round7_commMenuMng_fld_modal.png`, fullPage: false });
  // 취소 닫기
  await page.getByRole("button", { name: "취소", exact: true }).first().click();
  await page.waitForTimeout(500);

  // 2. 메뉴 트리 정렬 검증 — 트리 텍스트 1 행 단위로 추출
  const treeLabels = await page.locator(".tree-item").evaluateAll(els =>
    els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0 && t.length < 40)
  ).catch(() => []);
  console.log(`[commMenuMng] treeLabels=${JSON.stringify(treeLabels.slice(0, 12))}`);

  // 3. OBJECT 검색 LookupModal 호출 — Detail 행 선택 후 OBJECT 검색 버튼 click
  try {
    await page.locator(".ag-row").first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "검색", exact: true }).first().click();
    await page.waitForTimeout(800);
    const objLovTitle = await page.locator('text=OBJECT 검색').count();
    console.log(`[commMenuMng] OBJECT LookupModal title count=${objLovTitle}`);
    await page.screenshot({ path: `snap/round7_commMenuMng_obj_lov.png`, fullPage: false });
  } catch (e) {
    console.log(`[commMenuMng] OBJECT LoV check skipped: ${e}`);
  }
});
