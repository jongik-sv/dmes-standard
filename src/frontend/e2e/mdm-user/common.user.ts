import { expect, test } from "@playwright/test";
import { openAs, openMenu, screen } from "./support";

/**
 * 공통 배치 — 모든 화면이 함께 쓰는 셸·레이아웃 요소를 한 번만 검사한다.
 * checkLayout 은 화면마다 같은 이유로 반복 실패하지 않도록 머리 버튼 높이를 shared-layout 주석으로만 남기므로,
 * 공통 결함은 여기서 한 번 실패로 드러낸다.
 */

test("TC-COM-LAY-01 화면 머리 버튼(조회·저장 등) 높이가 26px 이다 — UI-Visual-Standard §4", async ({ browser }, testInfo) => {
  const { page, watcher } = await openAs(browser, "stw", testInfo);
  await openMenu(page, ["마루 MDM", "마스터코드", "마루 코드"], "codeMng");
  const buttons = screen(page).locator(".page-layout__header-buttons button:visible");
  await expect(buttons.first()).toBeVisible();
  const heights = await buttons.evaluateAll((els) =>
    els.map((el) => `${(el.textContent ?? "").trim()}=${Math.round(el.getBoundingClientRect().height)}px`),
  );
  const wrong = heights.filter((h) => Math.abs(Number(h.split("=")[1].replace("px", "")) - 26) > 2);
  expect(wrong, "머리 버튼 높이(기준 26px ±2) — 공통 CSS .page-layout .btn").toEqual([]);
  watcher.assertClean("공통 배치");
});
