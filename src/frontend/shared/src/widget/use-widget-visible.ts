"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 위젯 요소가 실제로 보이는지 알려 준다 — 타이머·자동 새로 고침을 숨은 동안 멈추는 데 쓴다(Screen-Performance-Guide R14).
 *
 * <p>보임 = `document.visibilityState` 가 hidden 이 아니고, 요소가 화면과 겹친다(IntersectionObserver).
 * 포털은 숨은 탭을 언마운트하지 않고 display:none 으로 가리므로(R10) 숨은 홈 탭·폭 0 요소는 겹침 0 으로 잡힌다.
 * IntersectionObserver 가 없는 환경은 계속 보이는 것으로 본다. `watch` 가 바뀌면 관찰을 다시 붙인다
 * (본문 요소가 나중에 생기는 틀용).
 */
export function useWidgetVisible(ref: RefObject<Element | null>, watch?: unknown): boolean {
  const [inView, setInView] = useState(true);
  const [docVisible, setDocVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden"
  );

  useEffect(() => {
    const onChange = () => setDocVisible(document.visibilityState !== "hidden");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setInView(last.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, watch]);

  return inView && docVisible;
}
