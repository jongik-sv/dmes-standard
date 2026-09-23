import { expect, test } from "@playwright/test";
import path from "path";

const BASE = "http://localhost:5100";
const SHOT = "test-results/master-rule-data-upload";   // 실행 조건: BE 8100(local-ph) + FE 5100 + SMOKE_LOGIN_USER/PASSWORD
const FIXTURE = path.join(__dirname, "fixtures", "master-rule-data-upload.xlsx");   // 5행 헤더(COL_ID)/6행~ 데이터 2행(GBP/CHF)

test("masterRuleDataUploadFilePopup E2E — 부모 P-002 진입/컬럼정의 자동조회/파일선택 미리보기/삭제등록 confirm/등록/다운로드", async ({ page }) => {
  test.setTimeout(240_000);
  const user = process.env.SMOKE_LOGIN_USER!;
  const pw = process.env.SMOKE_LOGIN_PASSWORD!;

  // 1. 로그인 → 부모 masterRuleData 진입 → P-001 로 E2ESRC 선택
  await page.goto(`${BASE}/login`);
  await page.getByRole("textbox", { name: "아이디" }).fill(user);
  await page.getByRole("textbox", { name: "비밀번호" }).fill(pw);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal(?:\?.*)?$/, { timeout: 90_000 });
  await page.getByText("공통관리", { exact: false }).first().click();
  await page.getByText(/업무기준\s*관리\(원장\)/).first().click();
  await page.getByText("업무기준 Data관리", { exact: true }).first().click();
  await expect(page.getByText("업무기준 데이터")).toBeVisible({ timeout: 30_000 });

  const rulePop = page.getByRole("dialog");
  await page.getByRole("button", { name: "업무기준", exact: true }).click();
  await expect(rulePop.getByText(/건 조회 되었습니다/)).toBeVisible({ timeout: 20_000 });
  await rulePop.getByRole("button", { name: "조회" }).click();
  await expect(rulePop.getByText("7건 조회 되었습니다.")).toBeVisible({ timeout: 20_000 });
  await rulePop.getByText("E2E 컬럼등록 검증기준").first().dblclick();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("2건 조회 되었습니다.").first()).toBeVisible({ timeout: 20_000 });   // 시드 2행

  // 2. B-007 엑셀업 → P-002 팝업 진입 (R-101 부모 전달값 read-only) + R-103 컬럼정의 자동조회
  await page.getByRole("button", { name: "엑셀업", exact: true }).click();
  const pop = page.getByRole("dialog");
  await expect(pop.getByText("일반 업무기준 등록(Excel Upload)")).toBeVisible({ timeout: 10_000 });
  await expect(pop.getByText("3건 조회 되었습니다.")).toBeVisible({ timeout: 20_000 });   // M-004 — 컬럼정의 3건
  await expect(pop.getByText("기준일자 (IN)")).toBeVisible();   // Q-101 동적 컬럼 (IN/OUT 접미 — 색상 보류 D 대체)
  await page.screenshot({ path: `${SHOT}/e2e-1-popup.png` });

  // 3. B-002 파일선택 — SheetJS import (A5 헤더/A6 데이터 — R-105) → 미리보기 2행 (M-001)
  await pop.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(pop.getByText("Excel Data 2건 조회 되었습니다.")).toBeVisible({ timeout: 20_000 });
  await expect(pop.getByText("GBP", { exact: true })).toBeVisible();
  await expect(pop.getByText("CHF", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/e2e-2-preview.png` });

  // 4. 삭제등록 체크 + 등록 → Q-102 confirm → 저장 (R-107 전건 선삭제 + R-109 채번 + R-110 DATE 정규화)
  await pop.getByText("삭제등록", { exact: true }).click();
  await pop.getByRole("button", { name: "등록", exact: true }).click();
  await expect(page.getByText(/모든 데이터가 삭제된 후 재등록됩니다/)).toBeVisible({ timeout: 10_000 });   // Q-102 confirm
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.getByText("업무기준 등록이 완료되었습니다.")).toBeVisible({ timeout: 20_000 });   // M-007
  await page.getByRole("button", { name: "확인" }).click();
  await expect(pop.getByText("2건 저장 되었습니다.")).toBeVisible({ timeout: 10_000 });   // M-006 상태바
  await expect(pop.getByText("GBP", { exact: true })).toBeHidden();   // R-111 — 미리보기 clear
  await page.screenshot({ path: `${SHOT}/e2e-3-saved.png` });

  // 5. B-001 다운로드 — search 전건(등록된 2행) → 3행 헤더 XLSX download
  const dlPromise = page.waitForEvent("download", { timeout: 20_000 });
  await pop.getByRole("button", { name: "다운로드", exact: true }).click();
  await expect(pop.getByText("2건 조회 되었습니다.")).toBeVisible({ timeout: 20_000 });   // M-002
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toContain("masterRuleDataUpload_E2ESRC");
  await page.screenshot({ path: `${SHOT}/e2e-4-download.png` });

  // 6. 닫기 (As-Is 콜백 rtVal 미사용 — 부모 재조회 없음)
  await pop.getByRole("button", { name: "닫기", exact: true }).last().click();   // 모달 X(aria-label 닫기)와 중복 — 하단 버튼
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
});
