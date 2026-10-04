import path from "node:path";
import { expect, test, type Page, type Response } from "@playwright/test";

import { BASE_URL, LOGIN_USER, T, login, walkMenuPath } from "./support/common";

/**
 * mdm 공통 셸·RBAC smoke — TSK-01-03 design.md §3.5.
 *
 * Proves:
 *   T1 admin: 샘플 화면이 MdmPageLayout 셸(breadcrumb·상태 배지 6·잠금 배지 3)로 그려진다.
 *   T2 담당자(MDM_STEWARD): 메뉴가 보이고 샘플로 이동되며, /api/mdm/oasis/** 가 BFF 를 지나 mdm 백엔드
 *      OASIS 봉투(meta)까지 닿는다(신뢰 채널 D6).
 *   T3 권한 없는 사용자: myMenusTree 응답과 사이드바에 MDM 메뉴가 없고 같은 API 가 403 FORBIDDEN(수용 기준 1).
 *   T4 표준 관리자(MDM_STD_ADMIN): 샘플까지 이동된다.
 *
 * 스모크 넷(dev-discipline) 적용 판정 — design.md §3.5:
 *   1. 메뉴 이동 — 적용(T1·T2·T4).
 *   2. 목록 서버 데이터 채움 — 해당 없음(독립 화면 없음, 셸은 데이터를 조회하지 않는다).
 *   3. 등록/수정 1회 — 해당 없음(같은 사유. 버전 전이는 화면 없는 서비스라 백엔드 시나리오 S1~S24 가 본다).
 *   4. 서버 오류 표시 — 해당 없음(화면이 서버를 부르지 않는다). 대신 권한 없는 API 호출 → 403 을 T3 이 본다.
 *
 * 전제(design.md §3.6): 격리 DB 로 mcm·mdm 백엔드와 포털을 빈 포트에 직접 띄우고, mcm 기동 뒤
 * e2e/fixtures/mdm-rbac-users.sql 을 격리 mcm.db 에 넣는다. be-run.sh·fe-run.sh 는 쓰지 않는다.
 * SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과).
 */

const ADMIN = LOGIN_USER;
const NONE = process.env.SMOKE_MDM_NONE_USER ?? "e2e_mdm_none";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

const MDM_MENU_IDS = ["mdm", "dma", "dmb", "dmc", "dmd", "dme"];
const SAMPLE_API = "/api/mdm/oasis/mdmSample/search";
const BREADCRUMB = "마루 MDM > 용어·도메인 > MDM 샘플";

// __dirname = src/frontend/e2e → repo root 까지 3단계 위.
const screenshot = (name: string) =>
  path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-01-03/screens", name);

function waitForMenuTree(page: Page): Promise<Response> {
  return page.waitForResponse((r) => r.url().includes("/api/mcm/oasis/secUser/myMenusTree"), {
    timeout: T.SLOW,
  });
}

/** myMenusTree 응답의 트리 노드(자식 items 포함)에서 menuId 를 모두 모은다. */
async function menuIds(response: Response): Promise<string[]> {
  expect(response.status()).toBe(200);
  const body = await response.json();
  const ids: string[] = [];
  const walk = (rows: Array<Record<string, unknown>>) => {
    for (const row of rows) {
      ids.push(String(row.menuId ?? ""));
      if (Array.isArray(row.items)) walk(row.items as Array<Record<string, unknown>>);
    }
  };
  walk(body.grids?.menus?.rows ?? []);
  return ids;
}

async function openSample(page: Page) {
  await walkMenuPath(page, [/^마루 MDM$/, /^용어·도메인$/, /^MDM 샘플$/]);

  await expect(page.getByText("mdm 모듈 스캐폴드 검증용 빈 화면입니다", { exact: false })).toBeVisible({
    timeout: T.SLOW,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("mdm shell & RBAC smoke", () => {
  test.setTimeout(150_000);

  test("T1 admin: 샘플 화면이 MdmPageLayout 셸과 배지로 그려진다", async ({ page }) => {
    await login(page, ADMIN);
    await openSample(page);

    const layout = page.locator(".page-layout").filter({ hasText: "공통 셸 미리보기" });
    await expect(layout.locator(".page-layout__footer-breadcrumb")).toHaveText(BREADCRUMB);
    await expect(layout.locator(".page-layout__footer-screen-id")).toHaveText("mdmSample");
    await expect(layout.locator(".mdm-status-badge")).toHaveCount(6);
    await expect(layout.locator(".mdm-lock-badge")).toHaveCount(3);
    await expect(layout.locator(".mdm-status-badge--pending")).toHaveText("적용 대기");
    await expect(layout.locator(".mdm-lock-badge--locked")).toHaveText("잠김 · kim 편집 중");

    await page.screenshot({ path: screenshot("dma-mdmSample-shell.png"), fullPage: true });
  });

  test("T2 담당자: MDM 메뉴가 보이고 API 가 mdm OASIS 까지 닿는다", async ({ page }) => {
    const menuResponse = waitForMenuTree(page);
    await login(page, STEWARD);
    const ids = await menuIds(await menuResponse);
    expect(ids, "양성 대조 — 담당자 메뉴 응답에 mdm 루트가 있다").toContain("mdm");
    expect(ids).toContain("dma");

    await openSample(page);

    const api = await page.request.post(`${BASE_URL}${SAMPLE_API}`, { data: {} });
    expect([401, 403], `BFF 가 담당자를 막으면 안 된다: ${api.status()}`).not.toContain(api.status());
    const body = await api.json();
    expect(typeof body.meta, `mdm OASIS 봉투(meta)가 아니다: ${JSON.stringify(body)}`).toBe("object");
    expect(body.meta).not.toBeNull();

    await page.screenshot({ path: screenshot("menu-steward.png"), fullPage: true });
  });

  test("T3 권한 없는 사용자: MDM 메뉴가 없고 API 가 403 이다", async ({ page }) => {
    const menuResponse = waitForMenuTree(page);
    await login(page, NONE);
    const ids = await menuIds(await menuResponse);
    for (const id of MDM_MENU_IDS) {
      expect(ids, `권한 없는 사용자 메뉴 응답에 ${id} 가 있다`).not.toContain(id);
    }

    // 메뉴 응답을 받은 뒤 사이드바가 그려진 상태에서 본다(그려지기 전의 거짓 통과 방지).
    await expect(page.locator(".sidebar-container")).toBeVisible({ timeout: T.UI });
    await expect(page.locator(".tree-item .item-name").filter({ hasText: "마루 MDM" })).toHaveCount(0);

    const api = await page.request.post(`${BASE_URL}${SAMPLE_API}`, { data: {} });
    expect(api.status()).toBe(403);
    const body = await api.json();
    expect(body.error?.code).toBe("FORBIDDEN");

    await page.screenshot({ path: screenshot("menu-none.png"), fullPage: true });
  });

  test("T4 표준 관리자: 샘플 화면까지 이동된다", async ({ page }) => {
    await login(page, STDADMIN);
    await openSample(page);
    await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
  });
});
