import { expect, test } from "@playwright/test";

const BASE = "http://localhost:5100";
const SHOT = "test-results/master-rule-data-list";   // 실행 조건: BE 8100(local-ph) + FE 5100 + SMOKE_LOGIN_USER/PASSWORD

test("masterRuleDataList E2E — 메뉴/P-001 연쇄/읽기전용 동적그리드/조건검색/마스터코드 셀클릭 P-002/엑셀다운", async ({ page }) => {
  test.setTimeout(240_000);
  const user = process.env.SMOKE_LOGIN_USER!;
  const pw = process.env.SMOKE_LOGIN_PASSWORD!;

  // 1. 로그인 → 메뉴 진입 (업무기준 상세조회 — sqlcmd 등재 FULL_SEQ 2040130 실동작)
  await page.goto(`${BASE}/login`);
  await page.getByRole("textbox", { name: "아이디" }).fill(user);
  await page.getByRole("textbox", { name: "비밀번호" }).fill(pw);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal(?:\?.*)?$/, { timeout: 90_000 });
  await page.getByText("공통관리", { exact: false }).first().click();
  await page.getByText(/업무기준\s*관리\(원장\)/).first().click();
  await page.getByText("업무기준 상세조회", { exact: true }).first().click();
  await expect(page.getByText("업무기준 상세", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOT}/e2e-1-entered.png` });

  // 2. P-001 (masterRuleListPop 재사용) — 초기값 빈값(Q-002 재결정 — 프리셋 제거) 자동조회 → E2ESRC 더블클릭
  const pop = page.getByRole("dialog");
  const popRuleIdInput = pop.locator('label:text-is("업무기준ID") + input');
  await page.getByRole("button", { name: "업무기준", exact: true }).click();
  await expect(pop.getByText(/건 조회 되었습니다/)).toBeVisible({ timeout: 20_000 });
  await expect(popRuleIdInput).toHaveValue("");   // Q-002 재결정(2026-07-09) — USD 프리셋 제거 검증
  await popRuleIdInput.fill("");
  await pop.locator('label:text-is("업무기준명") + input').fill("");
  await pop.getByRole("button", { name: "조회" }).click();
  await expect(pop.getByText("7건 조회 되었습니다.")).toBeVisible({ timeout: 20_000 });
  await pop.getByText("E2E 컬럼등록 검증기준").first().dblclick();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

  // 3. lov → search 자동 연쇄 — 동적 컬럼(헤더 COL_NM 그대로 — PK '*'/IO 접미 없음) + 시드 2행 + 마스터코드 셀 밑줄
  await expect(page.getByText("2건 조회 되었습니다.").first()).toBeVisible({ timeout: 20_000 });
  const grid = page.locator(".ag-root").first();
  await expect(grid.getByText("통화코드", { exact: true })).toBeVisible();   // 접미 없는 평탄 헤더 (분석 §3.3)
  await expect(grid.getByText("기준일자", { exact: true })).toBeVisible();
  await expect(grid.getByText("KRW", { exact: true })).toBeVisible();
  await expect(grid.getByText("JPY", { exact: true })).toBeVisible();
  // BR-008 — CODE_YN='Y' 컬럼(통화코드) 셀은 클릭 가능 span 렌더 (파란 밑줄·포인터)
  const krwCodeCell = grid.locator('.ag-cell[col-id="CURR_CD"] .ag-cell-value > span', { hasText: "KRW" });
  await expect(krwCodeCell).toBeVisible();
  await page.screenshot({ path: `${SHOT}/e2e-2-dynamic-grid.png` });

  // 4. 5조건 검색 (Q-007 화이트리스트 경로) — 조건1 = 통화코드 LIKE KRW → 1건
  await page.locator("select.form-input").first().selectOption("CURR_CD");
  await page.locator("span:has(select.form-input) input.form-input").first().fill("KRW");
  await page.getByRole("button", { name: "조회", exact: true }).first().click();
  await expect(page.getByText("1건 조회 되었습니다.").first()).toBeVisible({ timeout: 20_000 });
  await expect(grid.getByText("JPY", { exact: true })).toBeHidden();
  await page.screenshot({ path: `${SHOT}/e2e-3-filtered.png` });

  // 5. GB-001 — 마스터코드 셀(KRW) 클릭 → P-002 (masterCodeSelPop Dialog) 자동조회 (sCodeVal=KRW 프리셋)
  await krwCodeCell.click();
  const codePop = page.getByRole("dialog");
  await expect(codePop.getByText("마스터코드 조회")).toBeVisible({ timeout: 10_000 });
  await expect(codePop.getByText("1건 조회 되었습니다.")).toBeVisible({ timeout: 20_000 });   // LIKE %KRW%
  await expect(codePop.getByText("원화", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/e2e-4-code-pop.png` });

  // 6. 팝업 내 재조회 — 검색어 클리어(LIKE '%%' 전체 — V-003 As-Is) → CURR_CD 그룹 4건
  await codePop.locator("input:not([readonly])").first().fill("");
  await codePop.getByRole("button", { name: "조회" }).click();
  await expect(codePop.getByText("4건 조회 되었습니다.")).toBeVisible({ timeout: 20_000 });
  await expect(codePop.getByText("유로", { exact: true })).toBeVisible();

  // 7. 더블클릭 선택 → As-Is 콜백 no-op 보존: 닫히기만 하고 부모 그리드 무변경
  await codePop.getByText("유로", { exact: true }).dblclick();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  await expect(grid.getByText("KRW", { exact: true })).toBeVisible();   // 셀 값 무변경 (no-op)
  await page.screenshot({ path: `${SHOT}/e2e-5-after-noop.png` });

  // 8. B-002 엑셀다운 — searchExport 전건(2행, 조건 무관) + 다운로드 발생
  const dlPromise = page.waitForEvent("download", { timeout: 20_000 });
  await page.getByRole("button", { name: "엑셀다운" }).click();
  await expect(page.getByText(/2건 Export 되었습니다/)).toBeVisible({ timeout: 20_000 });   // toast 는 자동 소멸 — download 대기 전에 먼저 확인
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toContain("masterRuleDataList_E2ESRC");
  await page.screenshot({ path: `${SHOT}/e2e-6-export.png` });
});
