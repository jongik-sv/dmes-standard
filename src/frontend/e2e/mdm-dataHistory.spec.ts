import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * mdm dmd/dataHistory(항목 이력) smoke — TSK-07-03 design.md §3.1.
 *
 * 스모크 넷(dev-discipline):
 *   1. 메뉴 이동 — 담당자로 로그인해 사이드바에서 화면을 연다.
 *   2. 목록 채워짐·빈 상태 — 항목 KRPUS 1행, 카테고리 KR 1행, 소속 MAJOR·CNSHA 는 "행이 없습니다".
 *   3. 화면 조작만으로 등록·수정 — 해당 없음(조회 전용 화면, 05 「화면」 항목 이력). 대체 확인: page.request 로 항목 관리
 *      reg·save·delete·restore 를 부른 뒤 화면 조회로 타임라인(생성·변경·소멸·닫혀 있던 구간·다시 열기)을 본다.
 *   4. 서버 오류 노출 — 키를 비운 채 조회하면 서버 거부 문구 "키를 입력하세요"(H3, 판정은 서버 한 곳).
 */

const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";

const SUFFIX = Date.now().toString(36).toUpperCase();
const NEW_KEY = `E2EH${SUFFIX}`;
const PORT = "E2E_DI_PORT";

const screenshot = (name: string) =>
  path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-07-03/screens", name);

async function login(page: Page, user: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder("아이디").fill(user);
  await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 60_000 });
}

async function openScreen(page: Page) {
  const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  for (const name of [/^마루 MDM$/, /^마스터데이터$/, /^항목 이력$/]) {
    const node = item(name);
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();
  }
  await expect(page.getByTestId("history-search-key")).toBeVisible({ timeout: 60_000 });
}

async function query(page: Page, target: string, key: string, cateId?: string) {
  await page.getByTestId("history-search-maru").selectOption(PORT);
  await page.getByTestId("history-search-target").selectOption(target);
  if (cateId) await page.getByTestId("history-search-cate").selectOption(cateId);
  await page.getByTestId("history-search-key").fill(key);
  const searched = page.waitForResponse(
    (r) => r.url().includes("/api/mdm/oasis/dataHistory/search") && r.status() === 200,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await searched;
}

function timelineRows(page: Page): Locator {
  return page.getByTestId("history-timeline").locator(".ag-center-cols-container .ag-row");
}

function row(page: Page, id: string): Locator {
  return page.getByTestId("history-timeline").locator(`.ag-row[row-id="${id}"]`);
}

async function callItem(page: Page, action: string, params: Record<string, unknown>) {
  const res = await page.request.post(`${BASE_URL}/api/mdm/oasis/dataItemMng/${action}`, {
    data: { meta: { menuId: "dataItemMng" }, params: { maruDataId: PORT, code: NEW_KEY, ...params } },
  });
  const body = await res.json();
  expect(body.meta?.success, JSON.stringify(body)).toBe(true);
  return body.data.result;
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dmd/dataHistory smoke", () => {
  test.setTimeout(150_000);

  test("S1 메뉴 이동: 마루 MDM > 마스터데이터 > 항목 이력", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);
    await expect(
      page.locator(".page-layout__footer-breadcrumb").filter({ hasText: "마루 MDM > 마스터데이터 > 항목 이력" }),
    ).toBeVisible();
  });

  test("S2 목록: 항목·카테고리 1행, 없는 소속은 행이 없습니다", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);

    await query(page, "ITEM", "KRPUS");
    await expect(timelineRows(page)).toHaveCount(1, { timeout: 20_000 });
    await expect(row(page, "r0")).toContainText("생성");
    await expect(row(page, "r0")).toContainText("열림");

    await query(page, "CATE", "KR");
    await expect(timelineRows(page)).toHaveCount(1, { timeout: 20_000 });

    await query(page, "CATE_ITEM", "CNSHA", "MAJOR");
    await expect(page.getByTestId("history-empty")).toHaveText("행이 없습니다");
    await page.screenshot({ path: screenshot("dmd-dataHistory-list.png"), fullPage: true });
  });

  test("S3 대체 확인: 생성·변경·소멸·닫혀 있던 구간·다시 열기", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);

    await callItem(page, "reg", { name: "이력항목", lvl1: "KR" });
    await query(page, "ITEM", NEW_KEY);
    await expect(timelineRows(page)).toHaveCount(1, { timeout: 20_000 });

    await callItem(page, "save", { name: "이력항목변경", lvl1: "KR", expectedRowVersion: 0 });
    await query(page, "ITEM", NEW_KEY);
    await expect(timelineRows(page)).toHaveCount(2, { timeout: 20_000 });
    await expect(row(page, "r1")).toContainText("변경");
    const r0To = await row(page, "r0").locator('.ag-cell[col-id="validTo"]').innerText();
    await expect(row(page, "r1").locator('.ag-cell[col-id="validFrom"]')).toHaveText(r0To);

    await callItem(page, "delete", { expectedRowVersion: 1 });
    await query(page, "ITEM", NEW_KEY);
    await expect(row(page, "r1")).toContainText("소멸(닫힘)", { timeout: 20_000 });
    await expect(page.getByTestId("history-state")).toContainText("소멸(닫힘)");

    await callItem(page, "restore", { expectedRowVersion: 2 });
    await query(page, "ITEM", NEW_KEY);
    await expect(timelineRows(page)).toHaveCount(4, { timeout: 20_000 });
    await expect(row(page, "gap2")).toContainText("닫혀 있던 구간");
    await expect(row(page, "r2")).toContainText("다시 열기");
    await page.screenshot({ path: screenshot("dmd-dataHistory-timeline.png"), fullPage: true });
  });

  test("S4 서버 오류 노출: 키 없이 조회하면 서버 거부 문구", async ({ page }) => {
    await login(page, STEWARD);
    await openScreen(page);

    await query(page, "ITEM", "");
    const modal = page.locator(".error-modal__body");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal).toContainText("키를 입력하세요");
    await page.screenshot({ path: screenshot("dmd-dataHistory-error.png"), fullPage: true });
    await page.getByRole("button", { name: "확인" }).click();
  });
});
