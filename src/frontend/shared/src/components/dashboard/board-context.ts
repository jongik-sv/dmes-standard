"use client";

/**
 * 보드 위젯 정의와 카드가 읽는 위젯 칸 맥락. DashboardCard 가 이 맥락 안에 있으면 위젯 정의의 크기를 쓰고,
 * 편집 모드에서 끌기 손잡이·숨기기 버튼·크기 조절 손잡이를 그린다.
 */
import {
  createContext,
  useContext,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { DashboardSpan } from "./DashboardGrid";
import type { DashboardMoveKey } from "./board-state";

/** 보드에 놓을 위젯 하나. 화면은 위젯 목록과 기본 배치만 선언하고 배치 상태·편집·저장은 보드가 맡는다. */
export interface DashboardWidget {
  /** 위젯 ID(보드 안에서 고유, 저장 키). 바꾸면 사용자 저장값의 그 위젯 자리가 사라진다. */
  id: string;
  /** 위젯 이름 — [위젯 추가] 목록·안내 문구에 쓴다. 카드 제목과 같게 둔다. */
  title: string;
  /** [위젯 추가] 목록의 짧은 설명. */
  description?: string;
  /** 넓은 화면 기본 칸 수(기본 12). */
  span?: DashboardSpan;
  /** 1100px 이하 칸 수(기본 규칙: span ≤ 3 이면 두 배, 아니면 12). */
  spanMd?: DashboardSpan;
  /** 480px 이하 칸 수. */
  spanSm?: DashboardSpan;
  /** 기본 카드 높이(px). 없으면 내용 높이. */
  height?: number;
  /** 폭 조절 최소 칸 수(기본 3). */
  minSpan?: number;
  /** 높이 조절 최소값(px, 기본 120). */
  minHeight?: number;
  /** 편집 모드 크기 조절 — true(폭·높이, 기본) · "width" · "height" · false. */
  resizable?: boolean | "width" | "height";
  /** 숨길 수 있는지(기본 true). */
  hideable?: boolean;
  /** 위젯을 그린다 — DashboardCard 하나를 돌려준다(cardId·span·height·collapsible·resizable 은 보드가 정한다). */
  render: () => ReactNode;
}

export interface DashboardBoardItemState {
  widget: DashboardWidget;
  /** 편집 모드인지. */
  editing: boolean;
  /** 끌기 손잡이의 키보드 안내 요소 ID(aria-describedby). */
  hintId: string;
  /** 숨기기. */
  hide: () => void;
  /** 키보드 이동. */
  moveByKey: (key: DashboardMoveKey) => void;
  /** 머리·손잡이에서 끌기를 시작한다. */
  startDrag: (e: ReactPointerEvent<HTMLElement>) => void;
}

export const DashboardBoardItemContext = createContext<DashboardBoardItemState | null>(null);

/** 카드가 보드 위젯 칸 안에 있으면 그 맥락(아니면 null). */
export function useDashboardBoardItem(): DashboardBoardItemState | null {
  return useContext(DashboardBoardItemContext);
}
