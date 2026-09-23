import { expect, test } from "@playwright/test";

/**
 * mpp jigMoldMaster (지그금형 Master관리) full-chain smoke.
 *
 * Proves: login (mcm auth) → portal shell → RBAC-surfaced menu
 * (생산관리 > 지그금형관리 > 지그금형 Master관리) → page resolves via PAGE_REGISTRY
 * → OASIS search through BFF (/api/mpp/oasis/jigMoldMaster/search) → mpp WAS :8083
 * → seeded ds_jigMaster rows render in the AG grid.
 *
 * NOTE: mpp 메인 화면은 자동조회 미적용 (BPMN §2.1) — onMount 는 보유위치 LoV 만 선행 조회하므로
 * 그리드를 채우려면 반드시 "검색" 버튼을 눌러야 한다.
 *
 * Temp verification artifact (not production source). Servers are booted externally;
 * playwright.config has no webServer.
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin";
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";

const NOT_FOUND_MARKERS = [
  "등록된 페이지를 찾을 수 없습니다",
  "페이지를 찾을 수 없습니다",
];

test.describe("mpp jigMoldMaster full-chain smoke", () => {
  test.setTimeout(180_000);

  test("login → menu → page renders → OASIS search returns seeded rows", async ({ page }) => {
    // ── 1) Login (mcm auth) ──
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder("아이디").fill(LOGIN_USER);
    await page.getByPlaceholder("비밀번호").fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });

    // sidebar item name helper (scopes clicks to the tree, avoiding tab/title collisions)
    const treeName = (text: string) =>
      page.locator(".tree-item .item-name", { hasText: text });

    // ── 2) Expand module folder 생산관리 ──
    const moduleFolder = treeName("생산관리").first();
    await expect(moduleFolder).toBeVisible({ timeout: 20_000 });
    await moduleFolder.click();

    // ── 3) Expand group folder 지그금형관리 ──
    const groupFolder = page
      .locator(".tree-item .item-name")
      .filter({ hasText: /^지그금형관리$/ })
      .first();
    await expect(groupFolder).toBeVisible({ timeout: 20_000 });
    await groupFolder.click();

    // ── 4) Click leaf 지그금형 Master관리 → opens tab ──
    const leaf = page
      .locator(".tree-item .item-name")
      .filter({ hasText: /^지그금형 Master관리$/ })
      .first();
    await expect(leaf).toBeVisible({ timeout: 20_000 });
    await leaf.click();

    // ── 5) Page must resolve (registry/import) — 조회 button is part of the page body (2026-07-03 검색→조회) ──
    const searchBtn = page.getByRole("button", { name: "조회" }).first();
    await expect(searchBtn).toBeVisible({ timeout: 60_000 });

    const bodyText = (await page.textContent("body")) ?? "";
    for (const marker of NOT_FOUND_MARKERS) {
      expect(bodyText, `page body should not contain "${marker}"`).not.toContain(marker);
    }

    // ── 6) Trigger OASIS search (no auto-search on mpp main) ──
    await searchBtn.click();

    // ── 7) Assert the master grid renders ≥1 seeded row ──
    const grid = page.locator(".cm-data-grid").first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    // seeded ids JM-2026-0001..0005 — assert at least the first is visible
    await expect(grid.getByText("JM-2026-0001", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    const rowCount = await grid.locator(".ag-row").count();
    expect(rowCount, "master grid should have >=1 row after search").toBeGreaterThan(0);
    // seed has 5 non-discarded rows
    console.log(`[smoke] jigMoldMaster grid rows after search = ${rowCount}`);
    expect(rowCount).toBeGreaterThanOrEqual(5);
  });
});
