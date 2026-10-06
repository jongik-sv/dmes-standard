/**
 * 위젯 배치 옵션 해석(2026-10-06). 정의 값(meta.placement) → 유형 floatable 순으로 판단한다.
 * - W: 위젯 화면(보드)만
 * - B: 업무 화면(도구 창)만 — floatable 과 상관없이 도구 창으로 띄운다
 * - A: 둘 다 — floatable 과 상관없이 도구 창으로 띄운다
 * - 없음: 보드에는 늘 놓을 수 있고, 도구 창은 floatable 일 때만 띄운다(기존 동작)
 */
import type { WidgetMeta, WidgetPlacement } from "./types";

export interface WidgetPlacementResolved {
  /** 보드 서랍에 보이고 보드에 놓을 수 있는가. */
  board: boolean;
  /** 도구 창 메뉴에 보이고 업무 화면 위에 띄울 수 있는가. */
  dock: boolean;
}

/** 알 수 없는 값은 없는 값으로 본다(서버·정의 설정의 오타가 위젯을 숨기지 않게). */
export function normalizeWidgetPlacement(value: unknown): WidgetPlacement | undefined {
  return value === "W" || value === "B" || value === "A" ? value : undefined;
}

export function resolveWidgetPlacement(
  meta: Pick<WidgetMeta, "placement" | "floatable">,
): WidgetPlacementResolved {
  switch (normalizeWidgetPlacement(meta.placement)) {
    case "W":
      return { board: true, dock: false };
    case "B":
      return { board: false, dock: true };
    case "A":
      return { board: true, dock: true };
    default:
      return { board: true, dock: meta.floatable === true };
  }
}
