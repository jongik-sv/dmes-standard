import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_BASE_URL as BASE, T, loginByApi } from "./support/common";

/**
 * 룰 화면 열 설정 — 도메인 칸에 붙은 찾기·해제 버튼(TSK-08-03 §2.1).
 *
 * 두 가지를 지킨다.
 * 1) 배치는 글자 왼쪽·버튼 오른쪽 끝이고, 헤더가 비어 있던 별도 버튼 컬럼이 없다.
 * 2) 도메인 칸은 한 번 클릭 편집 열인데, 그 안의 버튼을 눌러도 편집이 같이 열리지 않고
 *    대신 도메인 찾기 팝업이 열린다. (ag-grid 는 칸 요소의 click 리스너에서 singleClickEdit 을
 *    시작한다 — `IconBtn` 의 `swallow` 네이티브 리스너가 그 전파를 끊어야 한다.
 *    React onClick 으로 끊으면 루트 컨테이너에서 처리돼 칸 리스너보다 늦어 통하지 않는다.)
 */

const RULE = "PROD_WGT_CALC";
/** 서버 표기 룰 버전(D-144). */
const VER = "2.000";

/** 편집기가 떴는지 — ag-grid 는 편집 칸에 input/select 을 넣는다(editText 헬퍼와 같은 기준). */
const editors = (page: Page) => page.locator('[data-testid="col-table"] .ag-cell input, [data-testid="col-table"] .ag-cell select');

test("도메인 찾기·해제 버튼은 도메인 칸 안에 있고(글자 왼쪽·버튼 오른쪽), 눌러도 편집이 같이 열리지 않는다", async ({
  page,
  context,
}) => {
  test.setTimeout(200_000);
  page.setViewportSize({ width: 1700, height: 950 });
  await loginByApi(context, { baseUrl: BASE, openPortal: page });

  for (const g of [/^마루 MDM$/, /^업무기준$/, /^룰 화면$/]) {
    const n = page.locator(".tree-item .item-name").filter({ hasText: g }).first();
    await expect(n).toBeVisible({ timeout: T.LONG });
    await n.click();
    await page.waitForTimeout(400);
  }

  // 룰을 연다 — 후보를 누르고 현재 룰 표시가 바뀔 때까지 기다린다
  const find = page.getByTestId("rule-edit-topbar").getByRole("button", { name: "찾기", exact: true });
  for (let i = 0; i < 5; i++) {
    await page.getByTestId("rule-pick-keyword").fill(RULE);
    await find.click();
    await expect(page.getByTestId(`rule-pick-${RULE}`)).toBeVisible({ timeout: T.UI });
    await page.getByTestId(`rule-pick-${RULE}`).click();
    const opened = await page
      .getByTestId("rule-edit-current")
      .filter({ hasText: RULE })
      .first()
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) break;
  }
  await expect(page.getByTestId("rule-edit-current")).toHaveText(RULE, { timeout: T.UI });

  // DRAFT 버전을 고르고(RELEASED 면 읽기 전용이라 버튼이 죽는다), 없으면 선점한다
  await page.getByTestId(`rule-ver-row-${VER}`).click();
  await page.waitForTimeout(2500);
  const claim = page.getByTestId("rule-card-versions").getByRole("button", { name: "선점", exact: true });
  if (await claim.count()) {
    await claim.first().click();
    await page.waitForTimeout(2500);
  }

  const toggle = page.getByTestId("rule-section-columns-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const grid = page.getByTestId("col-table");
  await expect(grid).toBeVisible({ timeout: T.LONG });
  await expect(page.getByTestId("col-readonly")).toHaveCount(0);
  await page.waitForTimeout(1200);

  // 1) 버튼이 도메인 칸(ag-cell col-id="domain") 안에 있다 — 별도 버튼 컬럼이 아니다
  const place = await page.evaluate(() => {
    const cell = document.querySelector('.ag-cell[col-id="domain"]');
    if (!cell) return null;
    const name = cell.querySelector('[data-testid^="col-domain-name-"]');
    const btn = cell.querySelector('button[aria-label="도메인 찾기"]');
    if (!name || !btn) return null;
    const c = cell.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    return {
      // 글자는 칸 왼쪽(패딩), 버튼은 칸 오른쪽 끝(패딩)
      nameLeftGap: Math.round(n.left - c.left),
      btnRightGap: Math.round(c.right - b.right),
      sameLine: Math.abs(n.top + n.height / 2 - (b.top + b.height / 2)) < 3,
    };
  });
  expect(place).not.toBeNull();
  expect(place!.nameLeftGap).toBeLessThanOrEqual(12);
  expect(place!.btnRightGap).toBeLessThanOrEqual(12);
  expect(place!.sameLine).toBe(true);

  // 헤더가 비어 있던 도메인 버튼 컬럼은 없어졌다
  const colIds = await grid.locator(".ag-header-cell").evaluateAll((els) => els.map((e) => e.getAttribute("col-id") || ""));
  expect(colIds).not.toContain("domainBtn");
  expect(colIds).toContain("domain");

  // 2) 🔍 를 눌러도 편집 칸은 열리지 않고, 대신 찾기 팝업이 열린다
  const key = (await page.locator('[data-testid^="col-domain-open-"]').first().getAttribute("data-testid"))!.replace(
    "col-domain-open-",
    "",
  );
  const btn = page.locator(`[data-testid="col-domain-open-${key}"]`);
  await btn.scrollIntoViewIfNeeded();
  await expect(btn).toBeEnabled();
  expect(await editors(page)).toHaveCount(0);

  await btn.click();
  await expect(page.getByTestId(`col-domain-${key}`)).toBeVisible({ timeout: 15_000 });
  expect(await editors(page)).toHaveCount(0);
  await page.getByTestId(`col-domain-${key}`).getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByTestId(`col-domain-${key}`)).toHaveCount(0);

  // 3) 회귀 — 버튼이 없는 글자 쪽을 누르면 도메인 칸 편집이 그대로 열린다.
  // 팝업을 닫은 직후 첫 클릭은 모달이 focus 를 되돌리는 데 먹힐 수 있어 몇 번 다시 눌러 본다.
  const cell = grid.locator(`.ag-row[row-id="${key}"] .ag-cell[col-id="domain"]`);
  await cell.scrollIntoViewIfNeeded();
  await expect(async () => {
    const box = await cell.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + 30, box!.y + box!.height / 2);
    await expect(editors(page)).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: T.UI });
});
