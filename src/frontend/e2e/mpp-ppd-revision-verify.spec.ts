import { expect, test, type Page } from "@playwright/test";

/**
 * mpp 지그금형관리(ppd) 2026-07-03 개편 검증.
 *
 *  - 검색 버튼 → 우측상단 "조회" 로 이동/개명 (BPMN Action 버튼은 우측상단만)
 *  - Master: 상세하단 액션버튼 제거 · 생성상태 실물코드 "(미채번)" 표시
 *  - Master 코드매핑: 그리드 없이 실물코드 입력만 → 채번 + 입고대기
 *  - Create/Repair/Tech: 조회조건 날짜 = DatePicker(input[type=date])
 *
 * 임시 검증 산출물(프로덕션 소스 아님). 서버는 외부에서 부팅됨.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5000";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin";
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";

const NOT_FOUND_MARKERS = [
  "등록된 페이지를 찾을 수 없습니다",
  "페이지를 찾을 수 없습니다",
];

type Screen = { id: string; title: string; dateInputs: number };

const SCREENS: Screen[] = [
  { id: "jigMoldMaster", title: "지그금형 Master관리", dateInputs: 0 },
  { id: "jigMoldCreate", title: "지그금형 제작관리", dateInputs: 2 },
  { id: "jigMoldRepair", title: "지그금형 수리관리", dateInputs: 2 },
  { id: "jigMoldTech", title: "지그금형 기술검토", dateInputs: 2 },
];

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(LOGIN_USER);
  await page.getByPlaceholder("비밀번호").fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
}

async function openScreen(page: Page, title: string): Promise<void> {
  const treeItem = (re: RegExp) =>
    page.locator(".tree-item .item-name").filter({ hasText: re }).first();

  const moduleFolder = treeItem(/^생산관리$/);
  await expect(moduleFolder).toBeVisible({ timeout: 20_000 });
  await moduleFolder.click();

  const groupFolder = treeItem(/^지그금형관리$/);
  await expect(groupFolder).toBeVisible({ timeout: 20_000 });
  await groupFolder.click();

  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leaf = treeItem(new RegExp(`^${escaped}$`));
  await expect(leaf).toBeVisible({ timeout: 20_000 });
  await leaf.click();
}

/** 화면 헤더(우측상단) 버튼 영역. */
function headerButtons(page: Page) {
  return page.locator(".page-layout__header-buttons");
}

test.describe("mpp ppd 개편 검증", () => {
  test.setTimeout(180_000);

  for (const { id, title, dateInputs } of SCREENS) {
    test(`${id} — 조회 우측상단 이동/개명 + 렌더 + 날짜 DatePicker(${dateInputs})`, async ({ page }) => {
      await login(page);
      await openScreen(page, title);

      // 우측상단 헤더에 "조회" 버튼 존재
      const header = headerButtons(page);
      await expect(header).toBeVisible({ timeout: 60_000 });
      await expect(
        header.getByRole("button", { name: "조회" }),
        `[${id}] 우측상단에 조회 버튼`,
      ).toBeVisible({ timeout: 30_000 });

      // 과거 "검색" 버튼은 사라졌어야 함
      await expect(
        page.getByRole("button", { name: /^검색$/ }),
        `[${id}] "검색" 버튼 없어야 함`,
      ).toHaveCount(0);

      const bodyText = (await page.textContent("body")) ?? "";
      for (const marker of NOT_FOUND_MARKERS) {
        expect(bodyText, `[${id}] "${marker}" 없어야 함`).not.toContain(marker);
      }

      // 조회 실행 → 그리드 렌더
      await header.getByRole("button", { name: "조회" }).click();
      const grid = page.locator(".cm-data-grid").first();
      await expect(grid).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1200);

      // 날짜칸 = DatePicker(input[type=date])
      const dateCount = await page.locator('input[type="date"]').count();
      expect(dateCount, `[${id}] 날짜 DatePicker 개수`).toBe(dateInputs);
      console.log(`[verify] ${id} 조회=OK, date inputs=${dateCount}`);
    });
  }

  test("jigMoldMaster — 생성상태 (미채번) 행 + 코드매핑(실물코드 입력만) → 채번", async ({ page }) => {
    await login(page);
    await openScreen(page, "지그금형 Master관리");

    const header = headerButtons(page);
    await header.getByRole("button", { name: "조회" }).click();
    const grid = page.locator(".cm-data-grid").first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);

    // 상세하단 액션버튼 제거 검증: 헤더에는 코드매핑/위치등록/폐기등록 이 있어야 하고,
    // 상세 패널(ContentPanel)에는 위치등록/폐기등록 버튼이 없어야 한다.
    await expect(header.getByRole("button", { name: "코드매핑" })).toBeVisible();
    await expect(header.getByRole("button", { name: "위치등록" })).toBeVisible();
    await expect(header.getByRole("button", { name: "폐기등록" })).toBeVisible();

    // (미채번) 생성상태 행 선택
    const createdRow = grid.locator(".ag-row", { hasText: "(미채번)" }).first();
    await expect(createdRow, "생성상태 (미채번) 행 존재").toBeVisible({ timeout: 10_000 });
    await createdRow.click();
    await page.waitForTimeout(400);

    // 상세 패널(오른쪽)에 위치등록/폐기 버튼이 없어야 함 (헤더 제외)
    const detailPanelButtons = page
      .locator(".content-panel, [class*='ContentPanel']")
      .locator("button", { hasText: /위치등록|폐기등록/ });
    expect(await detailPanelButtons.count(), "상세하단 액션버튼 제거됨").toBe(0);

    // 코드매핑 → 모달(그리드 없이 실물코드 입력만)
    await header.getByRole("button", { name: "코드매핑" }).click();
    const modal = page.locator(".modal-overlay, [class*='modal']").first();
    await expect(modal).toBeVisible({ timeout: 10_000 });
    // 모달 내부에 AG 그리드가 없어야 함(미매핑 그리드 제거)
    expect(await modal.locator(".cm-data-grid").count(), "코드매핑 모달에 그리드 없음").toBe(0);

    const code = `E2E-${Date.now().toString().slice(-8)}`;
    await page.getByPlaceholder("현장 채번 실물코드").fill(code);
    await page.getByRole("button", { name: /^확인$/ }).click();

    // 모달 종료 + 그리드에 채번된 코드 반영(=코드매핑 성공)
    await expect(modal).toBeHidden({ timeout: 10_000 });
    await expect(
      page.locator(".cm-data-grid").first().getByText(code, { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
    console.log(`[verify] jigMoldMaster 코드매핑 채번 OK: ${code}`);
  });

  test("jigMoldRepair — 수리의뢰 팝업 대상 실물 그리드 렌더(모달 내 그리드 높이 회귀 방지)", async ({ page }) => {
    await login(page);
    await openScreen(page, "지그금형 수리관리");
    await headerButtons(page).getByRole("button", { name: "조회" }).click();
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: /수리의뢰/ }).first().click();

    const overlay = page.locator(".cm-modal-overlay").first();
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    // 대상 실물 그리드가 헤더 + 행을 실제로 렌더해야 함(모달 flex/% 높이 접힘 회귀 방지)
    await expect(overlay.locator(".ag-header-cell").first()).toBeVisible({ timeout: 10_000 });
    const rowCount = await overlay.locator(".ag-row").count();
    expect(rowCount, "수리의뢰 팝업 대상 실물 행 렌더").toBeGreaterThan(0);
    console.log(`[verify] jigMoldRepair 수리의뢰 팝업 대상 실물 rows=${rowCount}`);
  });
});
