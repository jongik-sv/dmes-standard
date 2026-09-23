import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * mdm 모듈 스캐폴드 샘플 화면(mdt/mdmSample) smoke — TSK-01-01 design.md §3.3.
 *
 * Proves: login (mcm auth) → portal shell → 사이드바 메뉴(마루 MDM > 용어·도메인·컬럼·단위 >
 * MDM 샘플) → 화면이 실제로 로드된다(PAGE_REGISTRY 를 거쳐 @dk-oasis/m-mdm 의 page.tsx 가
 * import 된다는 증거).
 *
 * 스모크 넷(dev-discipline) 적용 판정 — design.md §3.3:
 *   1. 메뉴 이동 — 적용(본 스펙).
 *   2. 목록 서버 데이터 채움 — 해당 없음(샘플 화면은 그리드·목록이 없는 빈 화면).
 *   3. 등록/수정 1회 — 해당 없음(입력 폼이 없다).
 *   4. 서버 오류 표시 — 해당 없음(이 화면은 API 를 호출하지 않는다. mdm 백엔드(8096)가 내려가
 *      있어도 화면 자체는 뜬다는 것이 오히려 "빈 화면" 요구사항의 증거다).
 *
 * 서버는 수동 기동(리포 관례, playwright.config.ts 가 서버를 띄우지 않음) — `./be-run.sh --mcm`
 * + `./fe-run.sh --all -q`. mdm 백엔드(8096)는 이 스모크에 필요 없다(위 4번 근거).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin";
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";

const NOT_FOUND_MARKERS = [
  "등록된 페이지를 찾을 수 없습니다",
  "페이지를 찾을 수 없습니다",
];

test.describe("mdm mdt/mdmSample smoke", () => {
  test.setTimeout(120_000);

  test("login → menu → mdmSample page renders", async ({ page }) => {
    // ── 1) Login (mcm auth) ──
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder("아이디").fill(LOGIN_USER);
    await page.getByPlaceholder("비밀번호").fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });

    // sidebar item name helper (scopes clicks to the tree, avoiding tab/title collisions)
    const treeName = (text: string) =>
      page.locator(".tree-item .item-name", { hasText: text });

    // ── 2) Expand module folder 마루 MDM ──
    const moduleFolder = treeName("마루 MDM").first();
    await expect(moduleFolder).toBeVisible({ timeout: 20_000 });
    await moduleFolder.click();

    // ── 3) Expand group folder 용어·도메인·컬럼·단위 ──
    const groupFolder = page
      .locator(".tree-item .item-name")
      .filter({ hasText: /^용어·도메인·컬럼·단위$/ })
      .first();
    await expect(groupFolder).toBeVisible({ timeout: 20_000 });
    await groupFolder.click();

    // ── 4) Click leaf MDM 샘플 → opens tab ──
    const leaf = page
      .locator(".tree-item .item-name")
      .filter({ hasText: /^MDM 샘플$/ })
      .first();
    await expect(leaf).toBeVisible({ timeout: 20_000 });
    await leaf.click();

    // ── 5) Page must resolve (registry/import) — 빈 화면이므로 스캐폴드 안내 문구로 로드를 확인한다 ──
    const placeholder = page.getByText("mdm 모듈 스캐폴드 검증용 빈 화면입니다", {
      exact: false,
    });
    await expect(placeholder).toBeVisible({ timeout: 60_000 });

    const bodyText = (await page.textContent("body")) ?? "";
    for (const marker of NOT_FOUND_MARKERS) {
      expect(bodyText, `page body should not contain "${marker}"`).not.toContain(marker);
    }

    // ── 6) 스크린샷 — 승인자가 화면 모양을 눈으로 확인하는 산출물(design.md §3.3) ──
    //    dflow.sh taskdir <ref> 산출 경로 규칙: <repo root>/docs/mdm/tasks/TSK-01-01/screens/.
    //    __dirname = src/frontend/e2e 이므로 repo root 까지 3단계 위로 올라간다.
    const screenshotPath = path.resolve(
      __dirname,
      "../../..",
      "docs/mdm/tasks/TSK-01-01/screens/mdt-mdmSample.png",
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
