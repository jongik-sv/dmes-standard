import { expect, test, type Locator } from "@playwright/test";
import { gridRows } from "./support/grid";
import { T } from "./support/common";

const BASE = "http://localhost:5100";
const SHOT = "test-results/master-rule-data";   // 실행 조건: BE 8100(local-ph) + FE 5100 + SMOKE_LOGIN_USER/PASSWORD

test("masterRuleData E2E — 메뉴/P-001/lov+search 연쇄/동적그리드/행추가·수정/저장/재조회", async ({ page }) => {
  test.setTimeout(240_000);
  const user = process.env.SMOKE_LOGIN_USER!;
  const pw = process.env.SMOKE_LOGIN_PASSWORD!;

  // 1. 로그인 → 메뉴 진입 (업무기준 Data관리 — sqlcmd 등재 메뉴 실동작)
  await page.goto(`${BASE}/login`);
  await page.getByRole("textbox", { name: "아이디" }).fill(user);
  await page.getByRole("textbox", { name: "비밀번호" }).fill(pw);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal(?:\?.*)?$/, { timeout: 90_000 });
  await page.getByText("공통관리", { exact: false }).first().click();
  await page.getByText(/업무기준\s*관리\(원장\)/).first().click();
  await page.getByText("업무기준 Data관리", { exact: true }).first().click();
  await expect(page.getByText("업무기준 데이터")).toBeVisible({ timeout: T.LONG });
  await page.screenshot({ path: `${SHOT}/e2e-1-entered.png` });

  // 2. P-001 (masterRuleListPop 재사용) — 초기값 빈값(Q-002 재결정 — 프리셋 제거) 자동조회 → E2ESRC 더블클릭
  const pop = page.getByRole("dialog");
  const popRuleIdInput = pop.locator('label:text-is("업무기준ID") + input');
  await page.getByRole("button", { name: "업무기준", exact: true }).click();
  await expect(pop.getByText(/건 조회 되었습니다/)).toBeVisible({ timeout: T.UI });
  await expect(popRuleIdInput).toHaveValue("");   // Q-002 재결정(2026-07-09) — USD 프리셋 제거 검증
  await popRuleIdInput.fill("");
  await pop.locator('label:text-is("업무기준명") + input').fill("");
  await pop.getByRole("button", { name: "조회" }).click();
  await expect(pop.getByText("7건 조회 되었습니다.")).toBeVisible({ timeout: T.UI });
  await pop.getByText("E2E 컬럼등록 검증기준").first().dblclick();
  await expect(page.getByRole("dialog")).toBeHidden();

  // 3. lov → search 자동 연쇄 (BR-003) — 동적 컬럼 빌드(BR-005/006/007) + 시드 2행
  await expect(page.getByText("2건 조회 되었습니다.").first()).toBeVisible({ timeout: T.UI });
  const grid = page.locator(".ag-root").first();
  await expect(grid.getByText("* 통화코드 (OUT)")).toBeVisible();   // PK ' * ' + IO_FLAG 접미
  await expect(grid.getByText("기준일자 (IN)")).toBeVisible();
  await expect(grid.getByText("KRW", { exact: true })).toBeVisible();
  await expect(grid.getByText("JPY", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/e2e-2-dynamic-grid.png` });

  const cellOf = (rowIdx: number, colId: string) =>
    gridRows(grid).nth(rowIdx).locator(`.ag-cell[col-id="${colId}"]`);

  const fillCell = async (rowIdx: number, colId: string, value: string) => {
    const cell = cellOf(rowIdx, colId);
    await expect(async () => {
      await cell.click();
      const editor = grid.locator('.ag-cell input[type="text"]').first();
      if (!(await editor.isVisible().catch(() => false))) {
        await page.keyboard.press("Enter");
      }
      await editor.waitFor({ state: "visible", timeout: 2_000 });
      await editor.fill(value);
      await page.keyboard.press("Enter");
      await expect(cell).toHaveText(value, { timeout: 2_000 });
    }).toPass({ timeout: T.UI });
  };

  // 4. 행추가(C) + PK 필수검증(MSG-002) — CURR_CD 비운 채 저장 시도
  await page.getByRole("button", { name: "행추가" }).click();
  await expect(gridRows(grid)).toHaveCount(3);
  await fillCell(2, "BASE_DT", "2026-07-08");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(/통화코드 항목은 필수 입력사항 입니다/)).toBeVisible();   // MSG-002 (BR-006)
  await page.getByRole("button", { name: "확인" }).click();

  // 5. CURR_CD/APPLY_RATE 입력 후 저장 → "1건 저장 되었습니다" → 재조회 3행 (RULE_SEQ 채번 BR-010)
  await fillCell(2, "CURR_CD", "EUR");
  await fillCell(2, "APPLY_RATE", "1400.5");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(/1건 저장 되었습니다/)).toBeVisible({ timeout: T.UI });
  await page.getByRole("button", { name: "확인" }).click();
  await expect(gridRows(grid)).toHaveCount(3, { timeout: T.UI });
  await expect(grid.getByText("EUR", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/e2e-3-inserted.png` });

  // 6. 수정(U) — KRW 행 APPLY_RATE 편집 → 저장 (BR-011 RULE_SEQ WHERE)
  await fillCell(0, "APPLY_RATE", "2.5");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(/1건 저장 되었습니다/)).toBeVisible({ timeout: T.UI });
  await page.getByRole("button", { name: "확인" }).click();
  await expect(cellOf(0, "APPLY_RATE")).toHaveText(/2\.5/, { timeout: T.UI });
  await page.screenshot({ path: `${SHOT}/e2e-4-updated.png` });

  // 7. 5조건 검색 (Q-007 화이트리스트 경로) — 조건1 = 통화코드 LIKE EUR → 1건
  await page.locator("select.form-input").first().selectOption("CURR_CD");
  const valInput = page.locator('span:has(select.form-input) input.form-input').first();
  await valInput.fill("EUR");
  await page.getByRole("button", { name: "조회", exact: true }).first().click();
  await expect(page.getByText("1건 조회 되었습니다.").first()).toBeVisible({ timeout: T.UI });
  await expect(grid.getByText("EUR", { exact: true })).toBeVisible();
  await expect(grid.getByText("KRW", { exact: true })).toBeHidden();
  await page.screenshot({ path: `${SHOT}/e2e-5-filtered.png` });
});
