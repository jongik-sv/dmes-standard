/**
 * 블록 접기 보기(3단계 계획 D16) — 접힌 분기의 안쪽 노드를 감추고 분기에서 합류 뒤로 선을 다시 잇는 캔버스용 흐름을 만든다(저장 흐름은 그대로).
 * Task 0 은 서명과 임시 본문(흐름 그대로)만 둔다. 본문은 Task 11 이 채운다. React 의존이 없다.
 */
import type { EditFlow } from "../flow-edit";

export interface CollapsedView {
  /** 캔버스에 그릴 흐름. */
  flow: EditFlow;
  /** 감춘 노드 ID. */
  hidden: ReadonlySet<string>;
  /** 접힌 분기 ID → 안쪽 노드 수·멤버. */
  blocks: Readonly<Record<string, { count: number; members: string[] }>>;
}

const NONE: ReadonlySet<string> = new Set<string>();
const NO_BLOCKS: Readonly<Record<string, { count: number; members: string[] }>> = {};

export function collapseView(flow: EditFlow, collapsed: ReadonlySet<string>): CollapsedView {
  return { flow, hidden: NONE, blocks: NO_BLOCKS }; // SEAM(T11): collapsed 분기 블록을 감추고 선을 다시 잇는다(blockMembers)
}
