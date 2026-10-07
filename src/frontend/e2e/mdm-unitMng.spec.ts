import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { T, login, walkMenuPath, type LoginOptions } from "./support/common";

/**
 * mdm dma/unitMng(단위 마스터) smoke — TSK-04-02 design.md §3.1.
 *
 * 스모크 넷(dev-discipline):
 *   1. 메뉴 이동 — 표준 관리자로 로그인해 사이드바에서 화면을 연다(I14 RBAC 회귀를 admin/SYSADMIN
 *      프리패스 뒤에 숨기지 않기 위해 e2e_mdm_stdadmin 을 쓴다).
 *   2. 빈 상태 — 존재할 리 없는 키워드로 검색.
 *   3. 등록 1회 + 서버 데이터로 채워짐 — 새 차원 첫 단위 + 파생 단위 등록.
 *   4. 서버 오류 노출 — 금지 단위 코드(MONTH) 등록 시도.
 *
 * 서버 절차는 design.md 「E2E 서버 절차」(be-run.sh·fe-run.sh 미사용, 빈 포트 직접 기동, 새 PDB 로 격리). SMOKE_MCM_BASE_URL 로 반드시 자기 포털을 가리킨다.
 */

const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";

// 실행마다 다른 접미사(36진수, 약 8자) — 재실행 안전성.
const SUFFIX = Date.now().toString(36);
const NOMATCH_KEYWORD = `__E2E_NOMATCH_${SUFFIX}__`;
const DIMENSION = `TSTM${SUFFIX}`.toUpperCase(); // ASCII, I20
const UNIT_BASE = `TESTG${SUFFIX}`.toUpperCase();
const UNIT_DERIVED = `TESTKG${SUFFIX}`.toUpperCase();

const screenshot = (name: string) =>
  path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-04-02/screens", name);

const LOGIN_OPTS: LoginOptions = { portalTimeout: T.SLOW };

async function openUnitMng(page: Page) {
  await walkMenuPath(page, [/^마루 MDM$/, /^용어·도메인$/, /^단위 마스터$/]);

  await expect(page.getByRole("button", { name: "단위 등록" })).toBeVisible({ timeout: T.SLOW });
}

function searchField(page: Page, label: string) {
  return page.locator(".search-field", { hasText: label });
}

function detailRow(page: Page, label: string) {
  return page.locator("tr", { hasText: label });
}

/** 단위 목록 패널의 건수. 포털 홈 탭(알림·작업 위젯)의 "n건" 문구도 같은 DOM 에 있어 화면 전체 getByText 는 여럿에 걸린다. */
function unitListCount(page: Page) {
  return page
    .locator(".grid-panel")
    .filter({ has: page.locator(".grid-panel-title", { hasText: "단위 목록" }) })
    .locator(".grid-panel-count");
}

/**
 * [조회] 를 누르고 search 응답이 돌아올 때까지 기다린다. 진입할 때 목록은 비어 있어 "0건" 이 처음부터 보이므로, 응답을 기다리지 않으면
 * 조회가 돌지 않아도 건수 단언이 통과한다. 진입 때 콤보 값만 받는 호출(optionsOnly)은 요청 본문으로 거른다.
 */
async function clickSearchAndWait(page: Page) {
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/mdm/oasis/unitMng/search") &&
      r.request().method() === "POST" &&
      !(r.request().postData() ?? "").includes("optionsOnly") &&
      r.status() === 200,
    { timeout: T.UI },
  );
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await response;
}

test.describe.configure({ mode: "serial" });

test.describe("mdm dma/unitMng smoke", () => {
  test.setTimeout(150_000);

  test("T1 메뉴 이동: 단위 마스터 화면이 열린다", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
    await openUnitMng(page);
    await page.screenshot({ path: screenshot("dma-unitMng-open.png"), fullPage: true });
  });

  test("T2 빈 상태: 없는 키워드로 검색하면 빈 상태가 보인다", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
    await openUnitMng(page);

    await searchField(page, "검색어").locator("input").fill(NOMATCH_KEYWORD);
    await clickSearchAndWait(page);
    await expect(unitListCount(page)).toHaveText("0건", { timeout: T.UI });

    await page.screenshot({ path: screenshot("dma-unitMng-empty.png"), fullPage: true });
  });

  test("T3 등록: 새 차원 첫 단위 + 파생 단위를 등록하면 그리드에 반영된다", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
    await openUnitMng(page);

    // 필터를 지우고 전체 조회.
    await searchField(page, "검색어").locator("input").fill("");
    await clickSearchAndWait(page);
    await expect(unitListCount(page)).toHaveText(/^\d+건$/, { timeout: T.UI });

    // 새 차원의 첫 단위 — 자기 자신이 기준 단위(I3).
    await page.getByRole("button", { name: "단위 등록" }).click();
    await detailRow(page, "단위 코드").locator("input").fill(UNIT_BASE);
    const dimensionInput = detailRow(page, "차원").getByRole("combobox");
    await dimensionInput.click();
    await dimensionInput.fill(DIMENSION);
    await page.getByRole("button", { name: `+ "${DIMENSION}" 신규 생성` }).click();
    // 새 차원 첫 등록은 화면이 계수를 1로 자동 고정하고 잠근다(I3) — 다시 채우지 않는다.
    await expect(detailRow(page, "환산 계수").locator("input")).toHaveValue("1");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText(UNIT_BASE).first()).toBeVisible({ timeout: T.UI });

    // 같은 차원의 파생 단위 — 화면이 기준 단위를 UNIT_BASE 로 자동 고정해 보여준다(D2).
    await page.getByRole("button", { name: "단위 등록" }).click();
    await detailRow(page, "단위 코드").locator("input").fill(UNIT_DERIVED);
    const dimensionInput2 = detailRow(page, "차원").getByRole("combobox");
    await dimensionInput2.click();
    await dimensionInput2.fill(DIMENSION);
    // 기존 차원 옵션을 옵션 목록에서 직접 클릭해 선택한다(입력 후 Enter 는 하이라이트된 옵션이 없으면
    // 아무 것도 선택하지 않을 수 있다 — 실측 확인). Mantine Select 는 접근성용 숨은 네이티브 <select><option>
    // 도 같이 두므로 실제 콤보박스 옵션(data-combobox-option)으로 좁힌다.
    // 기준 단위 콤보의 옵션 문구에도 차원 이름이 들어가(같은 DOM 에 남는다) 글자로 거르면 둘이 걸린다 — 옵션 value 로 고른다.
    await page.locator(`[data-combobox-option="true"][value="${DIMENSION}"]`).click();
    await expect(detailRow(page, "기준 단위").locator("input")).toHaveValue(UNIT_BASE);
    await detailRow(page, "환산 계수").locator("input").fill("500");
    await page.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText(UNIT_BASE).first()).toBeVisible({ timeout: T.UI });
    await expect(page.getByText(UNIT_DERIVED).first()).toBeVisible({ timeout: T.UI });

    await page.screenshot({ path: screenshot("dma-unitMng-registered.png"), fullPage: true });
  });

  test("T4 서버 오류 노출: 금지 단위 코드(MONTH) 등록은 오류가 뜬다", async ({ page }) => {
    await login(page, STDADMIN, LOGIN_OPTS);
    await openUnitMng(page);

    await page.getByRole("button", { name: "단위 등록" }).click();
    await detailRow(page, "단위 코드").locator("input").fill("MONTH");
    const dimensionInput = detailRow(page, "차원").getByRole("combobox");
    await dimensionInput.click();
    await dimensionInput.fill(`MONTHDIM${SUFFIX}`.toUpperCase());
    await page.getByRole("button", { name: /신규 생성/ }).click();
    await page.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("월·년·영업일·근무시간처럼 고정 계수가 없는 단위는 등록할 수 없습니다.")).toBeVisible({
      timeout: T.UI,
    });

    await page.screenshot({ path: screenshot("dma-unitMng-error.png"), fullPage: true });
  });
});
