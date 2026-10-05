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
  /** 관리자가 사용 중지(스펙 2026-10-02-widget-admin-generic §1.1). 서랍에 안 보이고, 놓인 자리는 빈 칸으로 그린다. */
  disabled?: boolean;
  /** "code"(코드 위젯) | "def"(관리자 정의 위젯). 없으면 "code". */
  kind?: "code" | "def";
  /** 정의 위젯의 유형 ID(예: "query-table"). 코드 위젯은 없음. */
  typeId?: string;
  /** 분류 — 공통코드 그룹 WIDGET_CTG 값(예: "PROD"). 서랍에서 같은 분류끼리 묶는다(2026-10-05 위젯 개선 §6). */
  category?: string;
  /** 비공개 — true 면 서랍 목록에 안 보이고 검색어가 위젯 ID 와 전부 같을 때만 보인다(2026-10-05 위젯 개선 §10). */
  private?: boolean;
}

export interface WidgetProps {
  /** 보드 안 고유 ID — 같은 위젯을 두 번 놓아도 구분한다. */
  instanceId: string;
  size: WidgetSize;
  /** 인스턴스 설정. 사용자는 놓기만 하므로 지금은 늘 null. */
  config: unknown;
  /** 새로 고침 신호. 값이 바뀌면 위젯이 다시 조회한다. */
  refreshKey: number;
  /** 정의 위젯의 정의 설정(TB_MCM_WIDGET_DEF.CONFIG_JSON 파싱값). 코드 위젯은 null. */
  definition: unknown | null;
  /** 위젯 ID — 정의 위젯이 자기 defId 로 서버를 부를 때 쓴다. */
  widgetId: string;
  /** 틀 제목(등록부 meta.title — 덮어쓰기·정의 이름 반영). 내려받기 파일 이름 등에 쓴다. */
  title?: string;
}

export type WidgetComponent = (props: WidgetProps) => ReactNode;

/** 위젯 유형 — 정의 위젯의 본체. m-mcm widget-types/{typeId}/ 폴더 하나(type.meta.ts·renderer.tsx·editor.tsx). */
export interface WidgetTypeMeta {
  /** "query-table" — 폴더 이름과 같다. 소문자·숫자·하이픈. */
  id: string;
  /** "쿼리 표" */
  title: string;
  description?: string;
  defaultSize: WidgetSize;
  minSize?: WidgetSize;
  maxSize?: WidgetSize;
  /** 본문 안쪽 여백(기본 true). */
  bodyPadding?: boolean;
  /** 새 정의를 만들 때 넣는 초기 정의 설정. */
  initialConfig: unknown;
}

/** 관리 화면이 유형 편집기(editor.tsx default export)에 넘기는 props. */
export interface WidgetTypeEditorProps<C = unknown> {
  value: C;
  onChange: (next: C) => void;
  /** 편집기가 검사한 오류(저장 막기용). 빈 배열이면 저장 가능. */
  onValidate?: (errors: string[]) => void;
}

export type WidgetTypeEditorComponent = (props: WidgetTypeEditorProps) => ReactNode;

export interface WidgetTypeRegistryEntry {
  meta: WidgetTypeMeta;
  /** default export 가 WidgetComponent — props.definition 으로 정의 설정을 받는다. */
  loadRenderer: () => Promise<{ default: unknown }>;
  /** default export 가 WidgetTypeEditorComponent. */
  loadEditor: () => Promise<{ default: unknown }>;
}

export type WidgetTypeRegistry = Readonly<Record<string, WidgetTypeRegistryEntry>>;

/** widgetDef/list·commWidgetMng/search 응답 한 줄(서버 DTO 그대로, config 는 화면이 CONFIG_JSON 을 파싱한 값). */
export interface WidgetDefRow {
  widgetId: string;
  /** C=코드 위젯 덮어쓰기, D=정의 위젯 */
  srcTp: "C" | "D";
  typeId: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  defW: number | null;
  defH: number | null;
  minW: number | null;
  minH: number | null;
  maxW: number | null;
  maxH: number | null;
  refreshSec: number | null;
  linkPageId: string | null;
  multipleYn: "Y" | "N" | null;
  /** 분류(WIDGET_CTG 코드값). null = 코드 위젯은 코드 메타 값. */
  categoryCd: string | null;
  /** 비공개(PRIVATE_YN). Y 면 서랍에 안 보인다. */
  privateYn: "Y" | "N" | null;
  useYn: "Y" | "N";
  dataSrc: string | null;
  config: unknown | null;
}

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
