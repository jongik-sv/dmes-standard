import { expect, test } from "@playwright/test";

/**
 * 토픽 관리 (caravanConsole/topic) CRUD 스모크.
 *
 * 실행 전제 (기존 *-smoke.spec.ts 와 동일): m-mcm 호스트(5100) + mcm BE(8100) 가 떠 있어야 한다.
 *   SMOKE_MCM_BASE_URL (default http://localhost:5100) / SMOKE_LOGIN_USER / SMOKE_LOGIN_PASSWORD.
 *
 * 시나리오 (2026-07-09 Q-001 해제 — save 액션 활성 검증):
 *   (1) 로그인 → portal 진입 → 메뉴 (… > 카프카관리 > 토픽 관리) 진입 → 화면 렌더 (page not-found 아님)
 *   (2) 상단 조회/저장 + 그리드 행추가/행복사/행취소/행삭제 버튼 노출
 *   (3) 조회 클릭 → "Cannot find the service file" 류 오류 없음
 *   (4) 행추가 → 건수 +1 → 행취소(추가행 자동선택) → 건수 원복
 *   (5) 변경 없이 저장 → "변경된 내용이 없습니다." 안내 (save 핸들러 배선 확인)
 *
 * 주의: 실제 C/U/D 의 caravan fan-out(브로커/DB 반영)은 대상 caravan WAS 기동이 전제라 본 스모크 범위 밖.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5100";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin@dmes.com";
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";

test.describe("토픽 관리 (caravanConsole/topic) CRUD Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder("아이디").fill(LOGIN_USER);
    await page.getByPlaceholder("비밀번호").fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/portal/, { timeout: 15000 });
  });

  test("토픽 관리 렌더 + CRUD 버튼 + 행추가/행취소 + 무변경 저장 안내", async ({ page }) => {
    // 메뉴 진입 — 그룹 폴더명 "카프카관리(caravan-console)" 처럼 접미가 붙을 수 있어 부분 매칭.
    const leafName = "토픽 관리";
    const group = page.getByText("카프카관리", { exact: false }).first();
    if (!(await group.isVisible().catch(() => false))) {
      for (const root of ["공통관리", "마스터관리", "시스템관리"]) {
        const rootEl = page.getByText(root, { exact: true }).first();
        if (await rootEl.isVisible().catch(() => false)) {
          await rootEl.click();
          await page.waitForTimeout(700);
          if (await group.isVisible().catch(() => false)) break;
        }
      }
    }
    const leaf = page.getByText(leafName, { exact: true }).first();
    if (!(await leaf.isVisible().catch(() => false))) {
      if (await group.isVisible().catch(() => false)) {
        await group.click();
        await page.waitForTimeout(900);
      }
    }
    await leaf.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (!(await leaf.isVisible().catch(() => false))) {
      // 메뉴 미등록 환경 — 컴포넌트 빌드는 성공이므로 skip (기존 smoke 정합)
      test.skip();
      return;
    }
    await leaf.click();
    await page.waitForTimeout(2500);

    // (1) 화면 렌더 — page not-found / 컴포넌트 로드 오류 없음
    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText).not.toContain("등록된 페이지를 찾을 수 없습니다");

    // (2) 상단 조회/저장 + 그리드 CRUD 버튼
    await expect(page.getByRole("button", { name: "조회" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "저장" }).first()).toBeVisible();
    for (const label of ["행추가", "행복사", "행취소", "행삭제"]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
    }
    await expect(page.getByText("토픽 목록", { exact: true })).toBeVisible();

    // (3) 조회 — OASIS search 왕복. 서비스 파일/액션 미발견 류 오류 없어야 함
    await page.getByRole("button", { name: "조회" }).first().click();
    await page.waitForTimeout(2500);
    const afterSearch = (await page.textContent("body")) ?? "";
    expect(afterSearch).not.toContain("Cannot find the service file");
    expect(afterSearch).not.toContain("Can not find the service");

    // (4) 행추가 → 건수 +1 → 행취소 → 원복 (useRowStateManager 배선 검증)
    const countEl = page.locator(".grid-panel-count").first();
    const before = parseInt(((await countEl.textContent()) ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
    await page.getByRole("button", { name: "행추가" }).first().click();
    await expect(countEl).toContainText(`${before + 1}건`, { timeout: 5000 });
    await page.getByRole("button", { name: "행취소" }).first().click();
    await expect(countEl).toContainText(`${before}건`, { timeout: 5000 });

    // (5) 변경 없이 저장 → 안내 메시지 (save 핸들러 + getChanges 경로 확인)
    await page.getByRole("button", { name: "저장" }).first().click();
    await expect(page.getByText("변경된 내용이 없습니다", { exact: false }).first()).toBeVisible({ timeout: 8000 });
  });
});
