import { test } from "@playwright/test";

// W5 패턴 전파 결과 검증 — 8 화면 (commUserMng W5 제외)
// + commUserMng (W5 reference, regression 확인)
// = 9 화면 자동조회 / Detail wrapper / 카테고리 nowrap / 버튼 / 날짜 yyyy-MM-dd 검증

const BASE = "http://localhost:5000";

const SCREENS = [
  // csa 7 (W5 패턴 적용 대상)
  { id: "commObjMng",       label: "OBJECT 관리",          group: "시스템관리", needsAutoSearch: true,  hasDetailWrapper: true },
  { id: "commMenuMng",      label: "메뉴 관리",            group: "시스템관리", needsAutoSearch: true,  hasDetailWrapper: true },
  { id: "commRoleMng",      label: "역할 관리",            group: "시스템관리", needsAutoSearch: true,  hasDetailWrapper: true },
  { id: "commRoleGrpMng",   label: "역할 그룹 관리",       group: "시스템관리", needsAutoSearch: true,  hasDetailWrapper: true },
  { id: "commPermMng",      label: "PERMISSION 관리",      group: "시스템관리", needsAutoSearch: true,  hasDetailWrapper: true },
  { id: "commUserRoleCopy", label: "사용자 권한 일괄 등록", group: "시스템관리", needsAutoSearch: true,  hasDetailWrapper: true },
  { id: "commSyncMng",      label: "동기화 관리",          group: "시스템관리", needsAutoSearch: false, hasDetailWrapper: false }, // 정적 dataset / Detail 부재
  // W5 reference (regression)
  { id: "commUserMng",      label: "사용자 관리",          group: "시스템관리", needsAutoSearch: true,  hasDetailWrapper: true },
  // cme 1 (W5 패턴 + nowrap)
  { id: "masterCodeMngList",label: "Master Code 상세조회", group: "마스터관리(가동)", needsAutoSearch: false, hasDetailWrapper: false, needsCategoryNowrap: true }, // V-702 예외
];

test.describe.configure({ mode: "serial" });

test("W5 propagation — 9 screens visual + DOM verify", async ({ page, context }) => {
  test.setTimeout(600_000);
  page.setViewportSize({ width: 1600, height: 900 });

  // 1) NextAuth credentials login — context.request 의 cookie jar 가 자동 유지됨
  const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();
  const callbackResp = await context.request.post(`${BASE}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
  });
  const body = await callbackResp.json().catch(() => ({}));
  console.log("LOGIN:", callbackResp.status(), JSON.stringify(body));
  // context cookie jar 에 session-token 자동 들어감 — page 도 같은 cookie 사용
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3_000);

  // 2) 사이드바 그룹 전개
  const clickSidebar = async (label: string) => {
    const loc = page.locator(`.tree-item:has-text("${label}")`).first();
    await loc.waitFor({ state: "visible", timeout: 5_000 });
    await loc.click();
    await page.waitForTimeout(400);
  };
  for (const g of ["공통관리", "시스템관리", "마스터관리(가동)"]) {
    try { await clickSidebar(g); } catch {}
  }

  const dismissModal = async () => {
    try {
      const b = page.getByRole("button", { name: "확인", exact: true }).first();
      if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
    } catch {}
  };

  // 3) 9 화면 순차 검증
  for (const s of SCREENS) {
    await dismissModal();
    // 그룹 재전개 (다른 화면 진입 시 collapse 가능)
    for (const g of ["공통관리", "시스템관리", "마스터관리(가동)"]) {
      try {
        const folder = page.locator(`.tree-item--folder:has-text("${g}")`).first();
        const childVisible = await page.locator(`.tree-item--page:visible`).count();
        if (childVisible < 9 && await folder.isVisible({ timeout: 500 }).catch(() => false)) {
          await folder.click({ timeout: 1_000 });
          await page.waitForTimeout(250);
        }
      } catch {}
    }
    try {
      await clickSidebar(s.label);
      await page.waitForTimeout(4_000); // 자동조회 BE 응답 대기
      await dismissModal();
      await page.waitForTimeout(700);

      // 검증 항목
      const rowCount = await page.locator(".ag-row").count();
      const panelCount = await page.locator('[class*="grid-panel-count"], .grid-panel-count').first().textContent({ timeout: 1_000 }).catch(() => null);

      // Detail wrapper marginTop:32 확인 (selected 없을 때 "상세 정보" 라벨 가시성)
      let detailHeaderVisible = "N/A";
      if (s.hasDetailWrapper) {
        const v = await page.locator('text="상세 정보"').first().isVisible({ timeout: 1_000 }).catch(() => false);
        detailHeaderVisible = v ? "YES" : "NO";
      }

      // 카테고리 nowrap 확인 (masterCodeMngList 전용)
      let nowrap = "N/A";
      if (s.needsCategoryNowrap) {
        const span = page.locator('text=/카테고리:?$/').first();
        const ws = await span.evaluate((el) => window.getComputedStyle(el).whiteSpace).catch(() => "ERROR");
        nowrap = String(ws);
      }

      // 자동조회 검증
      const autoSearchOK = s.needsAutoSearch ? (rowCount > 0 ? "OK" : "FAIL") : "N/A";

      // 날짜 yyyy-MM-dd 컬럼 확인 (1열 이상)
      const dateCells = await page.locator('.ag-cell').evaluateAll((cells) =>
        cells.filter(c => /^\d{4}-\d{2}-\d{2}$/.test((c.textContent ?? "").trim())).length
      ).catch(() => 0);

      // 버튼 라벨 추출
      const buttons = await page.locator('.page-button, [class*="page-button"], button.form-button').evaluateAll((els) =>
        Array.from(new Set(els.map(e => (e.textContent ?? "").trim()).filter(Boolean)))
      ).catch(() => []);

      console.log(`[${s.id}] rows=${rowCount} count="${panelCount ?? "?"}" detail=${detailHeaderVisible} nowrap=${nowrap} dates=${dateCells} autoSearch=${autoSearchOK} btns=${JSON.stringify(buttons.slice(0, 10))}`);
      await page.screenshot({ path: `snap/w5p_${s.id}.png`, fullPage: false });
    } catch (e) {
      console.log(`[${s.id}] FAIL: ${(e as Error).message.slice(0, 150)}`);
      try { await page.screenshot({ path: `snap/w5p_${s.id}_fail.png`, fullPage: false }); } catch {}
    }
  }
});
