"use client";

/**
 * 표 카드 안 섹션끼리 공유하는 열 설정 상태(TSK-08-03 design §6) — 열 설정 초안 dirty(표 저장·열 머리 드래그 차단, 불변 13)와
 * 열 머리 클릭 하이라이트(열 설정 표의 대응 줄). Provider 는 `DecisionTableCard` 가 두고, 섹션은 `useColumnDraftShared` 로 읽는다.
 */
import { createContext, useContext } from "react";

export interface ColumnDraftShared {
  colDirty: boolean;
  /** 표 카드 자체의 저장 안 한 편집 — 열 설정 저장이 같은 파트를 덮어쓰지 않게 막는 데 쓴다. */
  tableDirty: boolean;
  setColDirty: (dirty: boolean) => void;
  highlightVarId: number | null;
  setHighlightVarId: (varId: number | null) => void;
  /** 오를 때마다 열 설정 섹션을 펼친다(표 카드 [열 설정 보기], D-133). 같은 열을 다시 골라도 펼쳐지게 값이 아닌 횟수다. */
  revealSeq?: number;
}

const NOOP: ColumnDraftShared = {
  colDirty: false,
  tableDirty: false,
  setColDirty: () => {}, highlightVarId: null,
  setHighlightVarId: () => {},
};

export const ColumnDraftSharedContext = createContext<ColumnDraftShared>(NOOP);

export function useColumnDraftShared(): ColumnDraftShared {
  return useContext(ColumnDraftSharedContext);
}
