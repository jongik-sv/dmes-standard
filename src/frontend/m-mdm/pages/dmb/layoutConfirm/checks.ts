/**
 * layoutConfirm 순수 판정(D-144 3단계). React·fetch 없이 시험한다. 전문·헤더가 함께 쓴다.
 */
export { toServerDateTime } from "../../dme/ruleConfirm/checks";

export interface LayoutConfirmGate {
  validated: boolean;
  applyFrom: string | null;
  checkedApplyFrom: string | null;
  errors: number;
  warnings: number;
  acknowledged: boolean;
  isOwner: boolean;
  canConfirm: boolean;
}

/** 확정 버튼 — 같은 apply_from 으로 검사했고, 오류 0, 경고가 있으면 확인, 소유자, 권한. */
export function canConfirmLayout(g: LayoutConfirmGate): boolean {
  return g.validated && !!g.applyFrom && g.applyFrom === g.checkedApplyFrom && g.errors === 0
    && (g.warnings === 0 || g.acknowledged) && g.isOwner && g.canConfirm;
}
