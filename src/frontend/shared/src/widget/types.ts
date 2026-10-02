/**
 * 위젯 계약 — 위젯 = 자유 배치 가능한 조각 프로그램(화면 컴포넌트). 스펙 §2.
 * 위젯 하나 = 폴더 하나(widget.meta.ts + widget.tsx). 등록부(WidgetRegistry)는 화면 쪽(m-mcm)이 코드 생성으로 만든다.
 */
import type { ReactNode } from "react";

/** 격자 칸 수. */
export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetMeta {
  /** "{모듈}.{이름}" — 저장 키. 바꾸면 사용자 배치에서 그 위젯이 빠진다. */
  id: string;
  title: string;
  /** 제목 옆 작은 부제(예: "전일 기준"). */
  subtitle?: string;
  /** [위젯 추가] 서랍의 짧은 설명. */
  description?: string;
  defaultSize: WidgetSize;
  /** 기본 { w: 4, h: 6 }. */
  minSize?: WidgetSize;
  /** 기본 제한 없음(가로는 격자 폭까지). */
  maxSize?: WidgetSize;
  /** 자동 새로 고침 주기(초). 30 미만이면 30. 없으면 자동 새로 고침 없음. */
  refreshSec?: number;
  /** 제목 줄 「화면 열기」가 여는 포털 pageId(예: "mls:lsh/noticeMgmt"). */
  linkPageId?: string;
  /** 한 탭에 여러 번 놓을 수 있는지(기본 true). */
  multiple?: boolean;
  /** 본문 안쪽 여백(기본 true). 그리드처럼 칸을 채우는 위젯은 false. */
  bodyPadding?: boolean;
}

export interface WidgetProps {
  /** 보드 안 고유 ID — 같은 위젯을 두 번 놓아도 구분한다. */
  instanceId: string;
  size: WidgetSize;
  /** 인스턴스 설정. A 에서는 늘 null(설정 편집은 C). */
  config: unknown;
  /** 새로 고침 신호. 값이 바뀌면 위젯이 다시 조회한다. */
  refreshKey: number;
}

export type WidgetComponent = (props: WidgetProps) => ReactNode;

export interface WidgetRegistryEntry {
  meta: WidgetMeta;
  /** 본체 지연 로딩 — default export 가 WidgetComponent. */
  load: () => Promise<{ default: unknown }>;
}

export type WidgetRegistry = Readonly<Record<string, WidgetRegistryEntry>>;

/** 탭에 놓인 위젯 인스턴스 — 넓은 화면(24칸) 좌표. */
export interface WidgetItem {
  instId: string;
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
  config: unknown | null;
}

export interface WidgetTab {
  tabId: string;
  name: string;
  seq: number;
  locked: boolean;
  items: WidgetItem[];
}

/** 저장소 — 화면이 서버 서비스(secWidget)로 구현해 주입한다. 실패는 Error(message) 로 던진다. */
export interface WidgetStore {
  /** 사용자 탭 전체. 「홈」 탭을 한 번도 저장하지 않았으면 결과에 home 이 없다. */
  load(): Promise<WidgetTab[]>;
  /** 탭 하나를 통째로 바꾼다(없으면 만든다). */
  saveTab(tab: WidgetTab): Promise<void>;
  deleteTab(tabId: string): Promise<void>;
  /** 「홈」을 뺀 탭 ID 를 새 순서대로. */
  reorderTabs(tabIds: string[]): Promise<void>;
  /** 사용자 「홈」 배치를 지운다(다음부터 기본 배치). */
  resetHome(): Promise<void>;
}

export type WidgetMoveKey = "left" | "right" | "up" | "down";
