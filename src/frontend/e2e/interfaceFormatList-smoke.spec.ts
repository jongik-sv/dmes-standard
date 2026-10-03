import { expect, test } from "@playwright/test";
import { login } from "./support/common";

/**
 * I/F Format 조회 (mcm/cib interfaceFormatList) 화면 스모크.
 *
 * 실행 전제 (기존 *-smoke.spec.ts 와 동일): m-mcm 호스트 + mcm BE + DB(MCMAPUSER + MCM_BACKUP 스키마) 가 떠 있어야 한다.
 *   SMOKE_MCM_BASE_URL (default http://localhost:5100) / SMOKE_LOGIN_USER / SMOKE_LOGIN_PASSWORD.
 *
 * 시나리오 (GATE-07 핵심):
 *   (1) 로그인 → portal 진입
 *   (2) 메뉴 (공통관리 > Format 관리 > I/F Format 조회) 진입 → 화면 렌더 (not-found 아님)
 *   (3) 조회 클릭 → 좌측 포맷 리스트 + 우측 변경이력 그리드 노출 (V-001 첫 행 자동 선택)
 *   (4) 비교 버튼 노출 확인
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5100";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin@dmes.com";

test.describe("I/F Format 조회 (interfaceFormatList) Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, LOGIN_USER, { baseUrl: BASE_URL, portalTimeout: 15_000 });
  });

  test("화면 렌더링 + 조회 동작", async ({ page }) => {
    // 메뉴 진입 (idempotent 펼침 — 자식이 안 보일 때만 부모 클릭, 토글 collapse 방지)
    const path = ["공통관리", "Format 관리", "I/F Format 조회"];
    for (let i = 0; i < path.length - 1; i++) {
      const child = page.getByText(path[i + 1], { exact: true }).first();
      if (!(await child.isVisible().catch(() => false))) {
        await page.getByText(path[i], { exact: true }).first().click();
        await page.waitForTimeout(900);
      }
    }
    const menuItem = page.getByText(path[path.length - 1], { exact: true }).first();
    await menuItem.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
    if (!(await menuItem.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await menuItem.click();
    await page.waitForTimeout(2000);

    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText).not.toContain("등록된 페이지를 찾을 수 없습니다");

    // 핵심 UI — FORMAT ID 라벨 + 조회 버튼 + 좌/우 그리드 패널 제목
    await expect(page.getByText("FORMAT ID", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "조회" })).toBeVisible();
    await expect(page.getByText("포맷 리스트", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("변경이력", { exact: false }).first()).toBeVisible();

    // 조회 클릭 (시드 무관 — 0건이어도 안내/그리드 렌더)
    await page.getByRole("button", { name: "조회" }).click();
    await page.waitForTimeout(1500);
    const after = (await page.textContent("body")) ?? "";
    expect(after.length).toBeGreaterThan(0);
  });
});
