/**
 * 캔버스 우클릭·[+] 메뉴 모델(3단계 계획 P4). 항목은 영역별 제공자(`menus/*`)가 만들고 `buildMenu` 가 등록 순서대로 잇는다.
 * 각 태스크는 자기 제공자 파일만 고친다(편집 Task 8 · 접기 Task 11 · 디버그 Task 10 · 보기 Task 0). 그리기는 `ContextMenu.tsx`.
 * React 의존이 없다.
 */
import type { FlowPos, EditFlow } from "../flow-edit";
import type { AlignKind, DistributeAxis } from "./align";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { NodeColor } from "../node-style";
import type { RuleIoMap } from "../types";

/** 메뉴를 연 자리 — 흐름 노드, 선(우클릭 또는 [+] 단추), 빈 곳(메모·그룹 우클릭도 빈 곳, 흐름 좌표). */
export type MenuTarget =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string; via: "context" | "plus" }
  | { kind: "pane"; at: FlowPos };

/** 색상 견본 한 칸 — `color` 는 노드 색 키(칠한 색 토큰 `--rsf-c-{color}-*` 로 그린다, 기본은 중립색). */
export interface MenuSwatch {
  /** testid 는 `flow-menu-swatch-${color}`. */
  id: string;
  label: string;
  color: NodeColor;
  /** 고른 칸(우클릭한 노드의 지금 색). */
  active: boolean;
  run: () => void;
}

export interface MenuItem {
  /** testid 는 `flow-menu-item-${id}`. */
  id: string;
  label: string;
  /** 없으면 children 만 있는 묶음 제목. */
  run?: () => void;
  disabled?: boolean;
  /** 꺼진 이유. */
  title?: string;
  danger?: boolean;
  /** 앞에 붙일 아이콘 키(그리기가 아이콘 컴포넌트로 바꾼다 — 모델은 React 의존이 없다). */
  icon?: "brush";
  /** 있으면 단추를 누를 때 메뉴를 닫지 않고 그 아래에 견본 격자를 펼친다. 견본을 누르면 `run()` 뒤 닫는다. */
  swatches?: MenuSwatch[];
  /** 하위 항목(분기 풀기 갈래 고르기). 메뉴 안에 들여 쓴 묶음으로 그린다(떠 있는 하위 메뉴 없음). */
  children?: MenuItem[];
}

/** 메뉴 항목이 부르는 캔버스 동작 — page 가 편집 훅(`useEditActions`)·접기·디버거 훅을 모아 만든다. */
export interface CanvasActions {
  openRule(ruleId: string): void;
  fit(): void;
  autoLayout(): void;
  addNote(at: FlowPos): void;
  /** 그 선에 빈 단계를 끼우고 「룰 지정」 섹션을 연다(4단계 T1). */
  pickRuleFor(edgeId: string): void;
  insertSplitAt(edgeId: string, kind: "IF" | "PARALLEL"): void;
  removeNode(nodeId: string): void;
  removeEdge(edgeId: string): void;
  /** 선 경로(꺾는 점, C14)와 이름표 오프셋(L1) 초기화. */
  resetRoute(edgeId: string): void;
  addBranch(splitId: string): void;
  /** 즉석 조건식 칸 열기. */
  editCond(edgeId: string): void;
  /** 즉석 선 라벨 칸 열기(Task 9). */
  editLabel(edgeId: string): void;
  copy(nodeId: string): void;
  paste(edgeId: string): void;
  duplicate(nodeId: string): void;
  /** 룰 노드에 받는 노드를 붙인다 — 끝으로 가는 처리 갈래(받는 노드 spec §8, R14). */
  addCatch(ruleNodeId: string): void;
  /** 끝내는 처리 갈래를 룰의 돌아오는 자리(정상 줄기 위 노드)로 옮긴다(받는 노드 우클릭 「흐름으로 돌아오기」). */
  returnCatch(catchId: string): void;
  /** 그 노드를 고르고 오른쪽 「룰 지정」 섹션을 펴 찾기 칸에 초점(4단계 Task 8). */
  openRuleAssign(nodeId: string): void;
  changeSplitKind(splitId: string, kind: "IF" | "PARALLEL"): void;
  dissolveSplit(splitId: string, keepEdgeId: string): void;
  toggleCollapse(splitId: string): void;
  toggleBreakpoint(nodeId: string): void;
  runTo(nodeId: string): void;
  /** 고른 노드·메모를 경계 상자에 맞춘다(A1). */
  align(kind: AlignKind): void;
  /** 고른 노드·메모의 간격을 고르게 한다(A1, 3개 이상). */
  distribute(axis: DistributeAxis): void;
  /** 룰·빈 단계 노드 여럿에 색을 한 번에 칠한다(편집 한 번 = 되돌리기 한 칸). `default` 는 칸 지우기. */
  setNodeColor(nodeIds: readonly string[], color: NodeColor): void;
}

export interface MenuContext {
  flow: EditFlow;
  rules: RuleIoMap;
  mode: FlowMode;
  hasClipboard: boolean;
  /** 빈 곳 메뉴의 붙여넣기 대상. */
  selectedEdgeId: string | null;
  collapsed: ReadonlySet<string>;
  breakpoints: ReadonlySet<string>;
  /** canDo("execute"). */
  canRun: boolean;
  /** 메뉴를 열 때 캔버스에서 읽은 고른 흐름 노드·메모 ID(A1 정렬 메뉴). 없으면 정렬 항목이 없다. */
  selection?: readonly string[];
  act: CanvasActions;
}

export type MenuProvider = (target: MenuTarget, ctx: MenuContext) => MenuItem[];

/** 제공자 순서대로 항목을 잇는다. id 가 겹치면 앞 것만 남긴다. */
export function buildMenu(providers: readonly MenuProvider[], target: MenuTarget, ctx: MenuContext): MenuItem[] {
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  for (const provide of providers) {
    for (const item of provide(target, ctx)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
