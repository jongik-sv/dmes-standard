import { expect, test, type Locator } from "@playwright/test";
import { gridCells, gridRows } from "./support/grid";
import { DEFAULT_BASE_URL as BASE, LOGIN_USER, PASSWORD, T } from "./support/common";

const SHOT = "test-results/master-rule-frame";   // 실행 증거 스크린샷 (BE 8100 local-ph + FE 5100 dev, 계정은 SMOKE_LOGIN_USER/PASSWORD 로 덮고 없으면 support/common 기본값)

test("masterRuleFrame E2E — 메뉴 진입/P-001/조회/행추가/저장/재조회", async ({ page }) => {
  test.setTimeout(240_000);
  const user = LOGIN_USER;
  const pw = PASSWORD;

  // 1. 로그인
  await page.goto(`${BASE}/login`);
  await page.getByRole("textbox", { name: "아이디" }).fill(user);
  await page.getByRole("textbox", { name: "비밀번호" }).fill(pw);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal(?:\?.*)?$/, { timeout: 90_000 });

  // 2. 메뉴 진입: 공통관리 > 업무기준관리(원장) > 업무기준 구조관리
  await page.getByText("공통관리", { exact: false }).first().click();
  await page.getByText(/업무기준\s*관리\(원장\)/).first().click();
  await page.getByText("업무기준 구조관리", { exact: true }).first().click();
  await expect(page.getByText("조건항목 (IN)")).toBeVisible({ timeout: T.LONG });
  await expect(page.getByText("결과항목 (OUT)")).toBeVisible();
  await page.screenshot({ path: `${SHOT}/e2e-1-menu-entered.png` });

  // 3. P-001 업무기준 List조회 팝업(정식 masterRuleListPop) — 닫기/검색+확인/더블클릭 3경로
  const pop = page.getByRole("dialog");
  const popRuleIdInput = pop.locator('label:text-is("업무기준ID") + input');

  // 3-a. 닫기(B-003) — 반환 없음: 부모 미변경(저장 버튼 비활성 유지 = ruleId 미설정)
  await page.getByRole("button", { name: "업무기준", exact: true }).click();
  await expect(pop.getByText("업무기준 List조회")).toBeVisible({ timeout: 15_000 });
  await expect(pop.getByText("7건 조회 되었습니다.")).toBeVisible({ timeout: T.UI });   // 자동 조회 (ST-001/MSG-001, E2ESRC 시드 포함)
  await pop.locator("button.form-button", { hasText: "닫기" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "저장" })).toBeDisabled();   // BR-012 — 반환 없음 확인

  // 3-b. 재열기 → 조회조건 검색(BR-002/007) → 행 클릭 + 확인(B-002) 반환
  await page.getByRole("button", { name: "업무기준", exact: true }).click();
  await expect(pop.getByText("7건 조회 되었습니다.")).toBeVisible({ timeout: T.UI });
  await popRuleIdInput.fill("usd");
  await expect(popRuleIdInput).toHaveValue("USD");   // BR-007 — 대문자 자동 변환
  await pop.getByRole("button", { name: "조회", exact: true }).click();
  await expect(pop.getByText("3건 조회 되었습니다.")).toBeVisible({ timeout: T.UI });   // USD/USDFWD/USDOFF (BR-001·002)
  await pop.getByText("USDFWD", { exact: true }).click();     // 행 선택 (rowposition)
  await pop.getByRole("button", { name: "확인" }).click();    // B-002 — 선택 행 반환
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator('input[value="USDFWD"]').first()).toBeVisible({ timeout: 15_000 });   // 부모 콜백 반영
  await expect(page.getByText("조회 중...").first()).toBeHidden({ timeout: T.UI });              // 부모 자동 조회 완료

  // 3-c. 재열기 — 부모 현재값(USDFWD)이 팝업 초기 검색어로 프리셋(ST-001) → 클리어 후 전체 조회 → USD 더블클릭(GB-002)
  await page.getByRole("button", { name: "업무기준", exact: true }).click();
  await expect(pop.getByText("1건 조회 되었습니다.")).toBeVisible({ timeout: T.UI });   // 자동조회(USDFWD) 완료 대기
  await expect(popRuleIdInput).toHaveValue("USDFWD");   // 재오픈 시 부모 전달 초기값 반영 (sRuleId)
  const popRuleNmInput = pop.locator('label:text-is("업무기준명") + input');
  await expect(popRuleNmInput).toHaveValue("USD 선물환 적용기준");   // sRuleNm 초기값도 반영 (As-Is gfn_Data_Return 계약)
  await popRuleIdInput.fill("");
  await popRuleNmInput.fill("");
  await pop.getByRole("button", { name: "조회", exact: true }).click();
  await expect(pop.getByText("7건 조회 되었습니다.")).toBeVisible({ timeout: T.UI });
  await page.screenshot({ path: `${SHOT}/e2e-2a-pop-opened.png` });
  await pop.getByText("USD 미국 달러 환율 적용기준").first().dblclick();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("조회 중...").first()).toBeHidden({ timeout: T.UI });
  await page.screenshot({ path: `${SHOT}/e2e-2-rule-selected.png` });

  const inGrid = page.locator(".ag-root").nth(0);
  const outGrid = page.locator(".ag-root").nth(1);

  const cellOf = (grid: Locator, colId: string) =>
    gridCells(grid, colId).first();

  const fillText = async (grid: Locator, colId: string, value: string) => {
    const cell = cellOf(grid, colId);
    await expect(async () => {
      await cell.click();
      const editor = grid.locator('.ag-cell input').first();
      if (!(await editor.isVisible().catch(() => false))) {
        await page.keyboard.press('Enter');   // 편집 시작
      }
      await editor.waitFor({ state: 'visible', timeout: 2_000 });
      await editor.fill(value);
      await page.keyboard.press('Enter');
      await expect(cell).toHaveText(value, { timeout: 2_000 });
    }).toPass({ timeout: T.LONG });
  };

  const fillSelect = async (grid: Locator, colId: string, value: string) => {
    const cell = cellOf(grid, colId);
    await expect(async () => {
      await cell.click();
      let item = page.locator('.ag-popup').getByText(value, { exact: true }).first();
      if (!(await item.isVisible().catch(() => false))) {
        await page.keyboard.press('Enter');
        item = page.locator('.ag-popup').getByText(value, { exact: true }).first();
      }
      await item.click({ timeout: 2_000 });
      await expect(cell).toHaveText(value, { timeout: 2_000 });
    }).toPass({ timeout: T.UI });
  };

  // 4. IN 행추가 + 입력 (기준일자/BASE_DT/N/DATE/8)
  await page.getByRole("button", { name: "행추가" }).nth(0).click();
  await expect(gridRows(inGrid)).toHaveCount(1);
  await fillText(inGrid, "colNm", "기준일자");
  await fillText(inGrid, "colId", "BASE_DT");
  await fillSelect(inGrid, "masterCodeDiv", "N");
  await fillSelect(inGrid, "colType", "DATE");
  await fillText(inGrid, "colLen", "8");

  // 5. OUT 행추가 + 입력 (적용환율/APPLY_RATE/N/NUMBER/10/4)
  await page.getByRole("button", { name: "행추가" }).nth(1).click();
  await expect(gridRows(outGrid)).toHaveCount(1);
  await fillText(outGrid, "colNm", "적용환율");
  await fillText(outGrid, "colId", "APPLY_RATE");
  await fillSelect(outGrid, "masterCodeDiv", "N");
  await fillSelect(outGrid, "colType", "NUMBER");
  await fillText(outGrid, "colLen", "10");
  await fillText(outGrid, "colPrecLen", "4");
  await page.screenshot({ path: `${SHOT}/e2e-3-rows-filled.png` });

  // 6. 저장 → MSG-011 모달 "2건 저장 되었습니다." → 확인
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(/2건 저장 되었습니다/)).toBeVisible({ timeout: T.LONG });
  await page.screenshot({ path: `${SHOT}/e2e-4-saved.png` });
  await page.getByRole("button", { name: "확인" }).click();

  // 7. 재조회 결과 — 저장 행이 서버 재조회 응답으로 표시 (COL_SEQ 부여 확인)
  await expect(cellOf(inGrid, "colNm")).toHaveText("기준일자", { timeout: T.UI });
  await expect(cellOf(outGrid, "colNm")).toHaveText("적용환율");
  await expect(cellOf(outGrid, "colPrecLen")).toHaveText("4");
  await page.screenshot({ path: `${SHOT}/e2e-5-reloaded.png` });

  // 8. P-002 기초데이터등록 팝업 (masterRuleFrameColListPopup) — E2ESRC 소스 테이블 메타 → 일괄 IN → 등록
  //  8-a. P-001 로 E2ESRC 선택 (소스 테이블 TB_MCA_E2ESRC 실존 — sqlcmd 준비)
  await page.getByRole("button", { name: "업무기준", exact: true }).click();
  await expect(pop.getByText(/건 조회 되었습니다/)).toBeVisible({ timeout: T.UI });
  await popRuleIdInput.fill("");
  await pop.locator('label:text-is("업무기준명") + input').fill("");
  await pop.getByRole("button", { name: "조회", exact: true }).click();
  await expect(pop.getByText("7건 조회 되었습니다.")).toBeVisible({ timeout: T.UI });
  await pop.getByText("E2E 컬럼등록 검증기준").first().dblclick();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("조회 중...").first()).toBeHidden({ timeout: T.UI });

  //  8-b. 기초데이터등록 클릭 → 팝업 자동조회 (INFORMATION_SCHEMA 메타 3건)
  await page.getByRole("button", { name: "기초데이터등록", exact: true }).click();
  const colPop = page.getByRole("dialog");
  await expect(colPop.getByText("업무기준 구조 등록 팝업")).toBeVisible({ timeout: 15_000 });
  await expect(colPop.getByText("3건 조회 되었습니다.")).toBeVisible({ timeout: T.UI });
  await expect(colPop.getByText("BASE_DT")).toBeVisible();          // COLUMN_NAME → 영문항목명
  await expect(colPop.getByText("기준일자")).toBeVisible();          // MS_Description → 한글항목명 (C-001)
  await expect(colPop.getByText("VARCHAR2")).toBeVisible();          // varchar→VARCHAR2 (C-002)
  await page.screenshot({ path: `${SHOT}/e2e-6-colpop-opened.png` });

  //  8-c. 1행 선택(chk=Y) 후 일괄 IN 적용 (E-001 기능 등가) — 나머지는 기본 OUT
  const colGrid = colPop.locator(".ag-root").first();
  const chkCell = gridRows(colGrid).first().locator('.ag-cell[col-id="chk"]');
  await expect(async () => {
    await chkCell.click();
    const editor = colGrid.locator(".ag-cell select, .ag-popup").first();
    let item = page.locator(".ag-popup").getByText("Y", { exact: true }).first();
    if (!(await item.isVisible().catch(() => false))) await page.keyboard.press("Enter");
    item = page.locator(".ag-popup").getByText("Y", { exact: true }).first();
    await item.click({ timeout: 2_000 });
    await expect(chkCell).toHaveText("Y", { timeout: 2_000 });
  }).toPass({ timeout: T.UI });
  await colPop.locator("select.form-input").selectOption("IN");
  await colPop.getByRole("button", { name: "적용" }).click();
  await expect(gridRows(colGrid).first().locator('.ag-cell[col-id="ioFlag"]')).toHaveText("IN", { timeout: 5_000 });

  //  8-d. 등록 → XV-001 confirm → 저장 → 팝업 닫힘 → 부모 자동 재조회 (IN 1 / OUT 2)
  await colPop.getByRole("button", { name: "등록" }).click();
  await expect(page.getByText(/기존에 있던 컬럼정보들은 모두 삭제됩니다/)).toBeVisible();
  await page.screenshot({ path: `${SHOT}/e2e-7-colpop-confirm.png` });
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.getByText(/3건 저장 되었습니다/)).toBeVisible({ timeout: T.UI });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("조회 중...").first()).toBeHidden({ timeout: T.UI });
  await expect(cellOf(inGrid, "colId")).toHaveText("BASE_DT", { timeout: T.UI });   // 부모 재조회 — IN 그리드
  await expect(cellOf(outGrid, "colId")).toHaveText("CURR_CD");                        // OUT 그리드 (COL_SEQ 순)
  await page.screenshot({ path: `${SHOT}/e2e-8-colpop-saved.png` });
});
