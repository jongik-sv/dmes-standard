"use client";

/**
 * 세트 탭 사이 연동 틀(하위 세트 spec §10.4) — 탭 틀(`RuleSetTabs`)이 값을 채우고 탭마다 편집기(`RuleSetEditor`)가 읽는다.
 * 편집기·탭 틀이 서로를 import 하지 않게 따로 둔다(`RuleSetTabs.tsx` 가 다시 내보낸다).
 */
import { createContext } from "react";

import type { VarDisplay } from "./types";

export interface ViewPrefs {
  varDisplay: VarDisplay;
  miniMap: boolean;
  /** 0 이면 아직 아무 탭도 바꾸지 않았다. 바뀔 때마다 1 증가. */
  seq: number;
}

export interface RuleSetTabsApi {
  /** 링크로 연다 — 열린 탭이 있으면 그리로, 없으면 지금 탭 오른쪽 새 탭(상한 8). SET 노드 링크(Task 8)가 쓴다. */
  openSet(setId: string): void;
  /**
   * 탭 안 세트 고르기 — 그 세트가 다른 탭에 열려 있으면 그 탭으로, 아니면 tabKey 탭에서 연다.
   * 돌려주는 값은 고른 뒤 지금 탭의 key — tabKey 와 다르면 다른 탭으로 옮겨 갔다(시작한 탭의 고르기 칸을 되돌릴 때 쓴다).
   */
  pickSet(tabKey: string, setId: string, ver?: string | null): string | null;
  /** 어떤 탭이 세트를 저장·폐기·되살렸거나 버전을 조작했다. */
  notifyWritten(setId: string): void;
  /** 마지막 쓰기 알림 — seq 가 바뀌면 다른 탭이 그 세트의 겉모양을 다시 받는다(Task 8). */
  written: { setId: string; seq: number } | null;
  /** 저장하지 않은 변경이 있는 탭의 세트. */
  dirtySetIds: ReadonlySet<string>;
  /** 확정하지 않은 변경이 있는 탭의 세트 — 저장 안 함 또는 DRAFT 버전을 열고 있음(디버거 경고, ui:9). */
  unconfirmedSetIds: ReadonlySet<string>;
  /** 보는 사람 설정(변수 표시·미니맵) — 한 탭이 바꾸면 다른 탭이 따른다(Ruling 22). */
  prefs: ViewPrefs;
  publishPrefs(p: Partial<Pick<ViewPrefs, "varDisplay" | "miniMap">>): void;
}

/**
 * 이 편집기가 고른 탭인가 — 편집기(`RuleSetEditor`)가 자기 아래 부품에 알린다. 거짓이면 패널이 display:none 으로 숨어 있다.
 * body 로 포털하는 대화 상자(오류 창·테스트 케이스 편집 창 등)는 패널을 따라 숨지 않으므로 이 값이 참일 때만 그린다(작성 중 내용은 상태로 남는다).
 * 탭 틀 밖에서는 참이다.
 */
export const EditorActiveContext = createContext(true);

const NO_SETS: ReadonlySet<string> = new Set();

/** 탭 틀 밖의 기본값 — 아무것도 하지 않는다. 편집기는 탭 틀 안에서만 쓴다(고르기도 탭 틀이 연다). */
export const RuleSetTabsContext = createContext<RuleSetTabsApi>({
  openSet: () => undefined,
  pickSet: () => null,
  notifyWritten: () => undefined,
  written: null,
  dirtySetIds: NO_SETS,
  unconfirmedSetIds: NO_SETS,
  prefs: { varDisplay: "off", miniMap: true, seq: 0 },
  publishPrefs: () => undefined,
});
