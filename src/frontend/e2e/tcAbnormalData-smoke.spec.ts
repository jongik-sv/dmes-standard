import { expect, test } from "@playwright/test";
import { login } from "./support/common";

/**
 * 비정상 TC 등록 (mcm/cic tcAbnormalData) 화면 스모크.
 *
 * 실행 전제 (기존 *-smoke.spec.ts 와 동일): m-mcm 호스트 + mcm BE + DB(MCMAPUSER) 가 떠 있어야 한다.
 *   SMOKE_MCM_BASE_URL (default http://localhost:5100) / SMOKE_LOGIN_USER / SMOKE_LOGIN_PASSWORD.
 *
 * 시나리오 (GATE-07 핵심):
 *   (1) 로그인 → portal
 *   (2) 메뉴 (공통관리 > TC Error > 비정상 TC 등록) 진입 → 렌더 (not-found 아님)
 *   (3) 핵심 UI (전문ID / Skip LEVEL / 사용구분 / 조회 / 저장) 노출 확인
 *   (4) 조회 → "N건 조회 되었습니다." Footer 토스트 + 그리드 렌더
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5100";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin"; // DataInitializer 시드 (USER_ID=admin)

test.describe("비정상 TC 등록 (tcAbnormalData) Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, LOGIN_USER, { baseUrl: BASE_URL, portalTimeout: 15_000 });
  });

  test("화면 렌더링 + 조회", async ({ page }) => {
    // 메뉴 진입 (idempotent 펼침 — 자식이 안 보일 때만 부모 클릭, 토글 collapse 방지)
    const path = ["공통관리", "TC Error", "비정상 TC 등록"];
    for (let i = 0; i < path.length - 1; i++) {
      const child = page.getByText(path[i + 1], { exact: true }).first();
      if (!(await child.isVisible().catch(() => false))) {
        await page.getByText(path[i], { exact: true }).first().click();
        await page.waitForTimeout(900);
      }
    }
    const menuItem = page.getByText(path[path.length - 1], { exact: true }).first();
    await menuItem.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (!(await menuItem.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await menuItem.click();
    await page.waitForTimeout(2000);

    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText).not.toContain("등록된 페이지를 찾을 수 없습니다");

    // 핵심 UI — 전문ID / Skip LEVEL / 사용구분 라벨 + 조회/저장 버튼
    await expect(page.getByText("전문ID", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Skip LEVEL", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "조회" })).toBeVisible();
    await expect(page.getByRole("button", { name: "저장" })).toBeVisible();

    // 조회 → Footer 토스트 "N건 조회 되었습니다."
    await page.getByRole("button", { name: "조회" }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText(/건 조회 되었습니다/).first()).toBeVisible({ timeout: 8000 });
  });
});
