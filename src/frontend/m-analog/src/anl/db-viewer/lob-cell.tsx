"use client";

/**
 * DB 뷰어 — 결과 그리드의 LOB 칸 표시.
 * 서버가 요약한 글자를 말줄임으로 보이고 오른쪽에 작은 「보기」 단추를 둔다.
 * 단추 클릭은 그리드의 행 클릭·셀 포커스로 번지지 않아야 한다. ag-grid 는 행·셀 요소에 직접 리스너를
 * 달아 두므로 React 합성 이벤트의 stopPropagation 으로는 막지 못한다 — 단추 요소에 네이티브 리스너를 단다.
 */

import { useEffect, useRef } from "react";

export function LobCell({
  summary,
  canOpen,
  onOpen,
}: {
  summary: string;
  /** false 면 「보기」 단추를 그리지 않는다(ROWID 가 없거나 값이 NULL). */
  canOpen: boolean;
  onOpen: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  // 최신 onOpen 을 ref 로 들고 있어, 리스너는 canOpen 이 바뀔 때만 다시 단다.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const open = (e: Event) => {
      e.stopPropagation();
      onOpenRef.current();
    };
    const swallow = (e: Event) => e.stopPropagation();
    el.addEventListener("click", open);
    el.addEventListener("dblclick", swallow);
    el.addEventListener("mousedown", swallow);
    return () => {
      el.removeEventListener("click", open);
      el.removeEventListener("dblclick", swallow);
      el.removeEventListener("mousedown", swallow);
    };
  }, [canOpen]);

  return (
    <span className="anl-db-lob-cell">
      <span className="anl-db-lob-summary">{summary}</span>
      {canOpen && (
        <button type="button" className="anl-db-lob-btn" ref={buttonRef}>
          보기
        </button>
      )}
    </span>
  );
}
