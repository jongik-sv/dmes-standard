import { expect, test } from "@playwright/test";
import { BASE_URL as BASE, T, loginByApi } from "./support/common";

/**
 * dma/domainMng 그리드 높이 검증 — DomainTreeGrid 의 height={360} 제거 확인.
 *
 * 근거: ContentBody root > ContentPanel(width 46%) > GridPanel > AgDataGrid 구조에서
 *       DomainTreeGrid 는 패널의 유일한 자식이므로 세로로 꽉 차야 한다.
 *       AgDataGrid 기본값 style.height === "100%" 만 남기면
 *       .grid-panel-content(flex:1 1 0; height:0) 을 그대로 상속한다.
 *
 * 전제: 5100 포털 + mcm/mdm 백엔드가 떠 있을 것. 로그인은 API 로 한다(격리 DB 불필요).
 *       SMOKE_MCM_BASE_URL 로 자기 포털을 가리키는 편이 안전하다(기본 5100 은 메인 체크아웃).
 */


test("도메인 목록 그리드가 패널 높이를 전부 사용한다", async ({ page, context }) => {
  test.setTimeout(120_000);
  page.setViewportSize({ width: 1600, height: 900 });

  await loginByApi(context, { baseUrl: BASE, openPortal: page });

  // 마루 MDM > 용어·도메인 > 도메인 관리
  for (const g of ["마루 MDM", "용어·도메인"]) {
    const node = page.locator(".tree-item .item-name").filter({ hasText: g }).first();
    await expect(node).toBeVisible({ timeout: T.LONG });
    await node.click();
  }
  const target = page.locator(".tree-item .item-name").filter({ hasText: "도메인 관리" }).first();
  await expect(target).toBeVisible({ timeout: T.UI });
  await target.click();

  // domainMng 화면 식별자로 특정 (다른 화면과 레이아웃 구조가 달라 혼동 방지)
  const layout = page.locator(".page-layout").filter({
    has: page.locator(".page-layout__footer-screen-id", { hasText: "domainMng" }),
  });
  await expect(layout.locator(".domain-mng__count")).toBeVisible({ timeout: T.SLOW });

  const grid = layout.locator(".grid-panel").filter({ has: page.locator(".grid-panel-title", { hasText: "도메인 목록" }) });
  await expect(grid).toBeVisible();

  // ag-grid 가 렌더링을 마칠 때까지 대기
  const agRoot = grid.locator(".ag-root-wrapper");
  await expect(agRoot).toBeVisible({ timeout: T.LONG });
  await page.waitForTimeout(1_500);

  const m = await page.evaluate(() => {
    const titleSpan = [...document.querySelectorAll(".grid-panel-title > span")].find((s) => s.textContent?.includes("도메인 목록"));
    const panel = titleSpan?.closest(".grid-panel") as HTMLElement | null;
    if (!panel) return null;
    const content = panel.querySelector(".grid-panel-content") as HTMLElement | null;
    const ag = panel.querySelector(".ag-root-wrapper") as HTMLElement | null;
    const outer = panel.closest(".content-panel") as HTMLElement | null;
    const body = panel.closest(".content-body") as HTMLElement | null;
    const r = (e: Element | null) => (e ? Math.round(e.getBoundingClientRect().height) : -1);
    return {
      outerPanel: r(outer),
      contentBody: r(body),
      gridPanel: r(panel),
      gridContent: r(content),
      agRoot: r(ag),
      viewport: window.innerHeight,
    };
  });

  console.log(`[domainMng height] ${JSON.stringify(m)}`);
  expect(m, "도메인 목록 GridPanel 을 찾지 못했다").not.toBeNull();

  // 1) 이전 고정값 360px 보다 확실히 커야 한다 (고정 높이가 제거됐다는 직접 증거)
  expect(m!.agRoot).toBeGreaterThan(500);

  // 2) 그리드가 grid-panel-content 를 꽉 채워야 한다 (헤더 32px + 테두리만 차이)
  const delta = Math.abs(m!.gridContent - m!.agRoot);
  expect(delta, `grid-panel-content=${m!.gridContent} vs ag-root=${m!.agRoot}`).toBeLessThanOrEqual(8);

  // 3) 그리드 패널이 바깥 카드와 content-body 세로 중앙을 맞춰야 한다 (80% 이상)
  expect(m!.gridPanel / m!.outerPanel).toBeGreaterThan(0.8);

  // 4) 문서 자체가 스크롤되지 않아야 한다 (포털 셸이 viewport 고정)
  const docScroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  console.log(`[domainMng height] document overflow=${docScroll}px`);
  expect(docScroll).toBeLessThanOrEqual(2);

  // 시각 확인용. 기본값은 꺼짐 — 스냅샷을 저장소에 남기지 않기 위함.
  if (process.env.SNAP_OUT) await page.screenshot({ path: process.env.SNAP_OUT, fullPage: false });
});
