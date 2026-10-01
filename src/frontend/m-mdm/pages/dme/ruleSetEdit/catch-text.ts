/**
 * 받는 노드 화면 글(받는 노드 spec §1·§8) — 종류 이름과 받는 노드 제목. React 의존이 없어 순수 모듈(`trace-view.ts`)도 쓴다.
 * 노드 그리기·속성 패널·디버거 배지·상태 문구가 같은 이름을 쓴다.
 */
import type { CatchKind, FlowNode } from "@/contract/engine-contract.generated";

export const CATCH_KIND_LABEL: Readonly<Record<CatchKind, string>> = {
  NO_RESULT: "결과 없음",
  INPUT_ERROR: "입력 오류",
  EVAL_ERROR: "계산 오류",
  HIT_CONFLICT: "판정 충돌",
};

/** 받는 노드 표시 제목 — label, 없으면 받는 종류 이름을 " · " 로 잇는다(모르는 키는 그대로). */
export function catchTitle(n: Pick<FlowNode, "label" | "catches">): string {
  return n.label ?? (n.catches ?? []).map((k) => CATCH_KIND_LABEL[k as CatchKind] ?? k).join(" · ");
}
