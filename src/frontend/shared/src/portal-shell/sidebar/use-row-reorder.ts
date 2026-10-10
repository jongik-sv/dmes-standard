"use client";

import { useCallback, useState, type DragEvent, type HTMLAttributes } from "react";
import type { DropPlace } from "../reorder";

interface UseRowReorderOptions {
  /** false 면 아무 행도 끌 수 없다(행 속성이 비어 있다). */
  enabled: boolean;
  /** 끌던 행을 이 행 위에 놓을 수 있는지. false 면 드롭 표시도 없고 놓아도 아무 일 없다. */
  canDrop: (dragKey: string, targetKey: string) => boolean;
  /** 놓았다 — 보이는 순서를 바꾸는 계산은 호출자 몫이다. */
  onDrop: (dragKey: string, targetKey: string, place: DropPlace) => void;
}

/** 포인터가 행의 위쪽 절반이면 앞, 아래쪽 절반이면 뒤. */
function placeOf(e: DragEvent<HTMLElement>): DropPlace {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * 사이드바 목록 행을 끌어서 순서를 바꾸는 브라우저 기본 끌어놓기(HTML5 DnD) 훅 — TabsBar 와 같은 방식이다.
 * 행마다 `rowProps(key)` 를 펼치고 `rowClassName(key)` 를 className 에 붙인다. 클릭·해제 버튼은 그대로 동작한다.
 */
export function useRowReorder({ enabled, canDrop, onDrop }: UseRowReorderOptions) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; place: DropPlace } | null>(null);

  const reset = useCallback(() => {
    setDragKey(null);
    setOver(null);
  }, []);

  const rowProps = useCallback(
    (key: string): HTMLAttributes<HTMLElement> => {
      if (!enabled) return {};
      return {
        draggable: true,
        onDragStart: (e: DragEvent<HTMLElement>) => {
          setDragKey(key);
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", key); // Firefox 는 데이터가 있어야 끌기가 시작된다.
          }
        },
        onDragOver: (e: DragEvent<HTMLElement>) => {
          if (dragKey === null || dragKey === key || !canDrop(dragKey, key)) return;
          e.preventDefault(); // 놓을 수 있는 행에만 드롭 허용 표시
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          const place = placeOf(e);
          setOver((prev) => (prev?.key === key && prev.place === place ? prev : { key, place }));
        },
        onDragLeave: () => setOver((prev) => (prev?.key === key ? null : prev)),
        onDrop: (e: DragEvent<HTMLElement>) => {
          if (dragKey === null || dragKey === key || !canDrop(dragKey, key)) {
            reset();
            return;
          }
          e.preventDefault();
          const place = placeOf(e);
          reset();
          onDrop(dragKey, key, place);
        },
        onDragEnd: reset,
      };
    },
    [enabled, dragKey, canDrop, onDrop, reset]
  );

  const rowClassName = useCallback(
    (key: string): string => {
      if (!enabled) return "";
      const classes = ["fav-row--draggable"];
      if (dragKey === key) classes.push("fav-row--dragging");
      if (over?.key === key) classes.push(`fav-row--drop-${over.place}`);
      return classes.join(" ");
    },
    [enabled, dragKey, over]
  );

  return { rowProps, rowClassName };
}
