import type { ReactNode } from "react";

/** 색 견본 한 칸. testid 는 `${testId}-swatch-${id}`. */
export interface MenuSwatch {
  id: string;
  label: string;
  /** 칸 채움 색 — CSS 색 값(공통 토큰 `var(--color-…)` 를 쓴다). */
  color: string;
  /** 칸 테두리 색(없으면 기본 테두리). */
  borderColor?: string;
  /** 고른 칸. */
  active: boolean;
  run: () => void;
}

export interface MenuItem {
  /** testid 는 `${testId}-item-${id}`. */
  id: string;
  label: string;
  /** 없으면 children 만 있는 묶음 제목. */
  run?: () => void;
  disabled?: boolean;
  /** 꺼진 이유. */
  title?: string;
  danger?: boolean;
  /** 견본 항목 단추 앞 아이콘. */
  icon?: ReactNode;
  /** 있으면 누를 때 메뉴를 닫지 않고 아래에 견본 격자를 펼친다. 견본을 누르면 run() 뒤 닫는다. */
  swatches?: MenuSwatch[];
  /** 하위 항목 — 떠 있는 하위 메뉴가 아니라 들여 쓴 묶음으로 그린다. */
  children?: MenuItem[];
}
