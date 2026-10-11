/** @vitest-environment happy-dom */

// 처음 둘러보기(shared tour) — 말풍선 자리 계산(순수 함수)과 단계 이동·건너뛰기·다시 보지 않기 전달.
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tour, type TourStep } from "../../src/components/tour";
import { TOUR_GAP, TOUR_MARGIN, clampTourIndex, highlightRect, placeBubble } from "../../src/components/tour/tour-model";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

const VP = { width: 1000, height: 700 };
const BUBBLE = { width: 320, height: 160 };

describe("placeBubble", () => {
  it("대상이 없으면 화면 가운데", () => {
    const p = placeBubble(null, BUBBLE, VP);
    expect(p).toEqual({ placement: "center", left: 340, top: 270 });
  });

  it("아래에 들어가면 대상 아래, 가로는 대상 가운데에 맞춘다", () => {
    const p = placeBubble({ left: 400, top: 100, width: 100, height: 40 }, BUBBLE, VP, "bottom");
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(100 + 40 + TOUR_GAP);
    expect(p.left).toBe(450 - 160);
  });

  it("아래에 안 들어가면 반대 방향(위)으로 뒤집는다", () => {
    const p = placeBubble({ left: 400, top: 600, width: 100, height: 40 }, BUBBLE, VP, "bottom");
    expect(p.placement).toBe("top");
    expect(p.top).toBe(600 - TOUR_GAP - 160);
  });

  it("화면 가장자리에서 TOUR_MARGIN 안쪽으로 민다", () => {
    const p = placeBubble({ left: 0, top: 100, width: 20, height: 20 }, BUBBLE, VP, "bottom");
    expect(p.left).toBe(TOUR_MARGIN);
    const q = placeBubble({ left: 990, top: 100, width: 10, height: 20 }, BUBBLE, VP, "bottom");
    expect(q.left).toBe(VP.width - BUBBLE.width - TOUR_MARGIN);
  });

  it("오른쪽을 원하면 대상 오른쪽, 세로는 대상 가운데", () => {
    const p = placeBubble({ left: 100, top: 300, width: 100, height: 100 }, BUBBLE, VP, "right");
    expect(p).toEqual({ placement: "right", left: 100 + 100 + TOUR_GAP, top: 350 - 80 });
  });
});

describe("clampTourIndex·highlightRect", () => {
  it("단계 번호를 범위 안으로 자른다", () => {
    expect(clampTourIndex(-1, 4)).toBe(0);
    expect(clampTourIndex(9, 4)).toBe(3);
    expect(clampTourIndex(2, 0)).toBe(0);
  });

  it("강조 틀은 대상 둘레로 pad 만큼 넓다", () => {
    expect(highlightRect({ left: 10, top: 20, width: 100, height: 40 }, 4)).toEqual({ left: 6, top: 16, width: 108, height: 48 });
  });
});

describe("Tour", () => {
  let r: Rendered | null = null;
  afterEach(() => {
    r?.unmount();
    r = null;
  });
  const q = <T extends Element = HTMLElement>(id: string) => document.body.querySelector<T>(`[data-testid="${id}"]`);
  const click = (id: string) => act(() => { q(id)!.click(); });

  const STEPS: TourStep[] = [
    { id: "a", title: "모델 고르기", body: "위 막대에서 모델을 고릅니다." },
    { id: "b", title: "표 추가", body: "빈 곳을 두 번 누릅니다.", target: "#nope" },
    { id: "c", title: "관계 긋기", body: "표 가장자리를 끕니다." },
  ];

  it("열려 있지 않으면 아무것도 그리지 않는다", () => {
    r = renderWithMantine(createElement(Tour, { open: false, steps: STEPS, onClose: vi.fn() }));
    expect(q("tour")).toBeNull();
  });

  it("다음으로 단계를 넘기고, 마지막 단계의 [완료] 가 finish 와 다시 보지 않기 값을 넘긴다", () => {
    const onClose = vi.fn();
    r = renderWithMantine(createElement(Tour, { open: true, steps: STEPS, onClose }));
    expect(q("tour-step")!.textContent).toBe("1 / 3");
    expect(q<HTMLButtonElement>("tour-prev")!.disabled).toBe(true);
    click("tour-next");
    expect(q("tour-step")!.textContent).toBe("2 / 3");
    click("tour-next");
    expect(q("tour-next")!.textContent).toBe("완료");
    act(() => { document.body.querySelector<HTMLInputElement>('[data-testid="tour-never"] input')!.click(); });
    click("tour-next");
    expect(onClose).toHaveBeenCalledWith({ reason: "finish", neverShow: true, index: 2 });
  });

  it("[건너뛰기]·Esc 는 skip 으로 닫는다", () => {
    const onClose = vi.fn();
    r = renderWithMantine(createElement(Tour, { open: true, steps: STEPS, onClose }));
    click("tour-skip");
    expect(onClose).toHaveBeenLastCalledWith({ reason: "skip", neverShow: false, index: 0 });
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("showNeverShow=false 면 다시 보지 않기 칸이 없다", () => {
    r = renderWithMantine(createElement(Tour, { open: true, steps: STEPS, onClose: vi.fn(), showNeverShow: false }));
    expect(q("tour-never")).toBeNull();
  });
});
