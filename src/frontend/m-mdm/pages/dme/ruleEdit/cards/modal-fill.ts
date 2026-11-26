"use client";

/**
 * 모달 창 높이 채우기 — 안쪽 요소 하나(`ref`)를 창 바디(`.cm-modal-body`)의 남는 높이만큼 더 키운다(2026-11-25).
 *
 * <p>shared `CardFrame` 처럼 flex 를 잇지 않는 상자 안에 있으면 CSS flex 로는 창 높이를 받을 수 없다. 그래서 바디 안쪽 높이에서
 * 바디 자식들의 높이 합을 뺀 남는 높이를 재서 돌려준다. 호출 쪽은 기본 높이에 이 값을 더한다. 창을 줄여 넘치면 0 까지 줄고,
 * 그 아래는 바디가 스크롤한다. 요소가 숨어 있으면(탭이 꺼짐) 재지 않는다.
 */
import { useLayoutEffect, useState, type RefObject } from "react";

export function useModalFillExtra(ref: RefObject<HTMLElement | null>): number {
  const [extra, setExtra] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    const body = el?.closest<HTMLElement>(".cm-modal-body");
    if (!el || !body) return;
    const measure = () => {
      if (el.offsetParent === null) return; // 숨은 탭
      const cs = getComputedStyle(body);
      const inner = body.clientHeight - parseFloat(cs.paddingTop || "0") - parseFloat(cs.paddingBottom || "0");
      let used = 0;
      for (const c of Array.from(body.children)) {
        const ccs = getComputedStyle(c);
        if (ccs.position === "absolute" || ccs.position === "fixed") continue;
        used += (c as HTMLElement).offsetHeight + parseFloat(ccs.marginTop || "0") + parseFloat(ccs.marginBottom || "0");
      }
      const free = Math.floor(inner - used);
      if (free !== 0) setExtra((e) => Math.max(0, e + free));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    for (const c of Array.from(body.children)) ro.observe(c);
    measure();
    return () => ro.disconnect();
  }, [ref]);

  return extra;
}

/**
 * 모달 창 높이 채우기(최소 높이형) — 요소(`ref`)의 최소 높이를 "내용 높이 + 바디의 남는 높이"로 직접 준다(2026-11-25).
 *
 * <p>기본 높이를 모르는 요소(내용에 따라 높이가 바뀌는 카드)에 쓴다. 잴 때마다 최소 높이를 먼저 풀고 잰다 — 풀지 않으면 내용이 잠깐
 * 길어져 창이 커졌을 때 그 높이를 최소 높이로 붙잡아 창이 다시 줄지 않는다. 창(`min-height: 80vh`)보다 내용이 길면 남는 높이가 없고
 * 바디가 스크롤한다. 요소가 숨어 있으면(탭이 꺼짐) 재지 않는다. 요소를 `display: grid` 로 두면 안의 카드 틀(`CardFrame`)이 그
 * 높이까지 늘어난다. 스타일을 React 상태가 아니라 요소에 바로 주므로 다시 그리기를 부르지 않는다.
 */
export function useModalFillMinHeight(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    const body = el?.closest<HTMLElement>(".cm-modal-body");
    if (!el || !body) return;
    const measure = () => {
      if (el.offsetParent === null) return; // 숨은 탭
      const before = el.style.minHeight;
      el.style.minHeight = "";
      const cs = getComputedStyle(body);
      const inner = body.clientHeight - parseFloat(cs.paddingTop || "0") - parseFloat(cs.paddingBottom || "0");
      let used = 0;
      for (const c of Array.from(body.children)) {
        const ccs = getComputedStyle(c);
        if (ccs.position === "absolute" || ccs.position === "fixed") continue;
        used += (c as HTMLElement).offsetHeight + parseFloat(ccs.marginTop || "0") + parseFloat(ccs.marginBottom || "0");
      }
      const free = Math.floor(inner - used);
      const next = free > 0 ? `${el.offsetHeight + free}px` : "";
      if (next !== before || el.style.minHeight !== next) el.style.minHeight = next;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    for (const c of Array.from(body.children)) ro.observe(c);
    measure();
    return () => ro.disconnect();
  }, [ref]);
}
