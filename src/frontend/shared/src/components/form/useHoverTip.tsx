"use client";

/**
 * 포털 툴팁 공용 부품(내부용) — `FormGroup` 라벨 툴팁과 `MdmFieldLabel`(th 안 라벨의 MDM 카드 툴팁)이 함께 쓴다.
 * `@dk-oasis/shared/form` 으로 내보내지 않는다. 화면은 두 부품을 쓰고 이 훅을 직접 쓰지 않는다.
 *
 * 툴팁을 document.body 로 portal + position:fixed 로 렌더 → 스크롤/overflow 컨테이너에 잘리거나 다른 패널에 가려지지 않고
 * 항상 최상단에 표시된다. 모양은 form.css 의 `.form-tip-text`·`.form-tip-text--portal` 이 정한다(호스트 앱이 form.css 를 싣는다).
 *
 * Mantine `Tooltip` 으로 교체를 시도했으나 채택하지 않았다: Mantine `Tooltip`/`Transition` 은
 * `opened` 를 true 로 바꿔도 실제 DOM 마운트가 추가 React 커밋(내부 `useTransition` 상태
 * 갱신, `@mantine/core/Transition` 관련 "not wrapped in act" 경고로 확인됨)을 거친 뒤에야
 * 일어난다 — `renderWithMantine`(mantine-test-utils.ts) 이 `MantineProvider` 에 `env="test"`
 * 를 주지 않는 한(그러면 Transition 이 동기 렌더로 바뀐다 — Transition.tsx 의
 * `if (env === "test") return mounted ? ... : ...` 분기) `act(() => input.focus())` 직후
 * 동기 `document.querySelector` 로는 툴팁 노드를 찾을 수 없다. env="test" 적용은
 * mantine-test-utils.ts(공유 테스트 인프라, 담당 파일 아님) 변경이 필요해 이번 라운드에서는
 * 보류하고(리드에게 후속 제안), 검증된 기존 커스텀 포지셔닝을 유지한다.
 */
import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** 툴팁 상자의 화면 위치. `above` 면 상자 높이만큼 위로 올려(translateY(-100%)) 앵커 위쪽에 붙인다. */
export interface HoverTipPos {
  left: number;
  top: number;
  above: boolean;
}

export interface HoverTip<T extends HTMLElement> {
  /** 툴팁이 붙을 앵커(라벨 박스·트리거 글자)에 건다. */
  anchorRef: RefObject<T | null>;
  /** 열려 있으면 위치, 닫혀 있으면 null. `HoverTipPortal` 에 그대로 준다. */
  tipPos: HoverTipPos | null;
  showTip: () => void;
  hideTip: () => void;
}

/**
 * 툴팁은 앵커 좌측 기준으로 앵커 위쪽에 띄운다. 위쪽 공간이 모자랄 때만 아래로 뒤집는다.
 * 실제 높이는 above 일 때 translateY(-100%) 로 보정하므로, 아래 상수는 뒤집기 판정에만 쓰인다.
 *
 * @param tipIsText 글자 툴팁(두세 줄)이면 true, MDM 카드 같은 노드 툴팁(더 크다)이면 false — 위쪽 공간 판정에만 쓴다.
 */
export function useHoverTip<T extends HTMLElement>(tipIsText: boolean): HoverTip<T> {
  const anchorRef = useRef<T>(null);
  const [tipPos, setTipPos] = useState<HoverTipPos | null>(null);

  const showTip = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const TIP_MAX_WIDTH = 320;
    // 글자 툴팁은 두세 줄, MDM 카드 같은 노드 툴팁은 더 크다 — 위쪽 공간 판정에만 쓴다.
    const TIP_EST_HEIGHT = tipIsText ? 72 : 200;
    const GAP = 6;
    const GUTTER = 8;
    const maxLeft = Math.max(GUTTER, window.innerWidth - TIP_MAX_WIDTH - GUTTER);
    const above = rect.top - GAP >= TIP_EST_HEIGHT + GUTTER;
    setTipPos({
      left: Math.min(Math.max(rect.left, GUTTER), maxLeft),
      top: above ? rect.top - GAP : rect.bottom + GAP,
      above,
    });
  }, [tipIsText]);
  const hideTip = useCallback(() => setTipPos(null), []);

  return { anchorRef, tipPos, showTip, hideTip };
}

/** 열려 있을 때(tipPos 가 있을 때) 툴팁 상자를 document.body 에 그린다. 닫혀 있거나 서버 렌더면 아무것도 그리지 않는다. */
export function HoverTipPortal({ tipPos, children }: { tipPos: HoverTipPos | null; children: ReactNode }) {
  if (!tipPos || typeof document === "undefined") return null;
  return createPortal(
    <span
      className="form-tip-text form-tip-text--portal"
      style={{
        position: "fixed",
        left: tipPos.left,
        top: tipPos.top,
        display: "block",
        ...(tipPos.above ? { transform: "translateY(-100%)" } : {}),
      }}
    >
      {children}
    </span>,
    document.body
  );
}
