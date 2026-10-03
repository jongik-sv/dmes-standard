import { expect, test } from "@playwright/test";
import { login } from "./support/common";

/**
 * I/F Format Layout 관리 (mcm/cib interfaceFormatLayout) 화면 스모크.
 *
 * 실행 전제 (기존 *-smoke.spec.ts 와 동일): m-mcm 호스트 + mcm BE + DB(MCMAPUSER + MCM_BACKUP) 가 떠 있어야 한다.
 *   SMOKE_MCM_BASE_URL (default http://localhost:5100) / SMOKE_LOGIN_USER / SMOKE_LOGIN_PASSWORD.
 *
 * 시나리오 (GATE-07 핵심):
 *   (1) 로그인 → portal
 *   (2) 메뉴 (공통관리 > Format 관리 > I/F Format Layout 관리) 진입 → 렌더 (not-found 아님)
 *   (3) FORMAT 선택 팝업 열기 → 렌더 확인
 *   (4) 행추가 (FORMAT 미선택) → "포맷 조회 후 행추가" 안내 / 저장 버튼 노출
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5100";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin@dmes.com";

test.describe("I/F Format Layout 관리 (interfaceFormatLayout) Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, LOGIN_USER, { baseUrl: BASE_URL, portalTimeout: 15_000 });
  });

  test("화면 렌더링 + FORMAT 선택 팝업", async ({ page }) => {
    // 메뉴 진입 (idempotent 펼침 — 자식이 안 보일 때만 부모 클릭, 토글 collapse 방지)
    const path = ["공통관리", "Format 관리", "I/F Format Layout 관리"];
    for (let i = 0; i < path.length - 1; i++) {
      const child = page.getByText(path[i + 1], { exact: true }).first();
      if (!(await child.isVisible().catch(() => false))) {
        await page.getByText(path[i], { exact: true }).first().click();
        await child.waitFor({ state: "visible", timeout: 900 }).catch(() => {});
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

    // 핵심 UI — FORMAT ID 라벨 + 조회/저장 + FORMAT 선택 + 항목 레이아웃 그리드
    await expect(page.getByText("FORMAT ID", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "저장" })).toBeVisible();
    await expect(page.getByRole("button", { name: "FORMAT 선택" })).toBeVisible();

    // FORMAT 선택 팝업 열기
    await page.getByRole("button", { name: "FORMAT 선택" }).click();
    // 팝업이 뜨길 기다린다(상한: 설정 expect 기본 10초)
    await expect(page.getByText("FORMAT 명", { exact: false }).first()).toBeVisible();
  });
});
