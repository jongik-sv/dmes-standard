import { expect, test, type Page } from "@playwright/test";
import { T, login, walkMenuPath } from "./support/common";

/**
 * mpp 지그금형관리(ppd) — 4개 메인 화면 통합 full-chain smoke.
 *
 * 각 화면: login (mcm auth) → portal shell → RBAC 메뉴 트리
 *   (생산관리 > 지그금형관리 > {화면}) → PAGE_REGISTRY resolve
 *   → 검색 클릭 → OASIS search (/api/mpp/oasis/{id}/search) → mpp WAS :8083
 *   → AG 그리드 렌더(rows≥0, 크래시/404 없음).
 *
 * jigMoldMaster 는 자동조회 미적용(BPMN §2.1)이라 검색 필수, 나머지 3개는 onMount
 * 자동조회이나 멱등하게 검색을 한 번 더 눌러 안정화한다.
 *
 * 임시 검증 산출물(프로덕션 소스 아님). 서버는 외부에서 부팅됨(webServer 미설정).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5100";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin";

const NOT_FOUND_MARKERS = [
  "등록된 페이지를 찾을 수 없습니다",
  "페이지를 찾을 수 없습니다",
];

type Screen = { id: string; title: string };

const SCREENS: Screen[] = [
  { id: "jigMoldMaster", title: "지그금형 Master관리" },
  { id: "jigMoldCreate", title: "지그금형 제작관리" },
  { id: "jigMoldRepair", title: "지그금형 수리관리" },
  { id: "jigMoldTech", title: "지그금형 기술검토" },
];

async function openScreen(page: Page, title: string): Promise<void> {
  // 생산관리(모듈) → 지그금형관리(그룹) 펼치기 → 리프(화면) 클릭 → 탭 오픈
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await walkMenuPath(page, [/^생산관리$/, /^지그금형관리$/, new RegExp(`^${escaped}$`)]);
}

test.describe("mpp ppd 4개 화면 full-chain smoke", () => {
  test.setTimeout(180_000);

  for (const { id, title } of SCREENS) {
    test(`${id} (${title}) — login → menu → render → search`, async ({ page }) => {
      await login(page, LOGIN_USER, { baseUrl: BASE_URL });
      await openScreen(page, title);

      // 페이지 resolve — 조회 버튼이 body 에 존재 (레지스트리/동적 import 성공, 2026-07-03 개편: 검색→조회)
      const searchBtn = page.getByRole("button", { name: "조회" }).first();
      await expect(searchBtn).toBeVisible({ timeout: T.SLOW });

      const bodyText = (await page.textContent("body")) ?? "";
      for (const marker of NOT_FOUND_MARKERS) {
        expect(bodyText, `[${id}] body 에 "${marker}" 없어야 함`).not.toContain(marker);
      }

      // 검색 트리거 (자동조회 화면도 멱등)
      await searchBtn.click();

      // 메인 그리드 렌더 (rows≥0, 크래시 없음)
      const grid = page.locator(".cm-data-grid").first();
      await expect(grid).toBeVisible({ timeout: T.UI });
      // 그리드 로딩 오버레이가 사라질 시간을 잠깐 준다
      await page.waitForTimeout(1500);
      const rowCount = await grid.locator(".ag-row").count();
      expect(rowCount, `[${id}] 그리드 행 수는 0 이상`).toBeGreaterThanOrEqual(0);
      console.log(`[smoke] ${id} grid rows after search = ${rowCount}`);
    });
  }
});
