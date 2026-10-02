/** 레이아웃·헤더 버전 버튼 상태(D-144 3단계). 서버 판정값(editable·canNew*)을 다시 계산하지 않고 소유자·상태만 본다. */
import { fmtVer, normVer, type VersionAction } from "@/shell";
import type { LayoutVersionRow } from "./types";

export interface LayoutVersionView {
  selected?: LayoutVersionRow | null;
  versions?: LayoutVersionRow[];
  editable?: boolean;
  canNewMajor?: boolean;
  canNewMinor?: boolean;
  nextMajor?: string | null;
  nextMinor?: string | null;
}

export interface LayoutVersionActions {
  newMajor: VersionAction;
  newMinor: VersionAction;
  delete: VersionAction;
  confirm: VersionAction;
  cancelConfirm: VersionAction;
  lock: VersionAction;
  unlock: VersionAction;
  handover: VersionAction;
}

export function versionActionState(view: LayoutVersionView, me: string, can: (action: string) => boolean): LayoutVersionActions {
  const s = view.selected ?? null;
  const draft = s?.STATUS === "DRAFT";
  const mine = draft && s?.OWNER_ID === me;
  const off = (title: string): VersionAction => ({ enabled: false, title });
  const on = (ok: boolean, action: string, title: string): VersionAction => (ok && can(action) ? { enabled: true, title } : off(title));
  return {
    newMajor: on(!!view.canNewMajor, "copy", view.nextMajor ? `새 버전 ${fmtVer(view.nextMajor)}` : "미적용 버전이 있으면 만들 수 없습니다"),
    newMinor: on(!!view.canNewMinor, "copy", view.nextMinor ? `새 버전 ${fmtVer(view.nextMinor)}` : "minor 를 올릴 수 없습니다"),
    delete: on(!!mine, "delete", "내 DRAFT 만 지울 수 있습니다"),
    confirm: on(!!mine, "confirm", "내 DRAFT 를 확정 화면에서 확정합니다"),
    cancelConfirm: on(s?.STATE === "FUTURE" && s?.OWNER_ID === me, "delete", "적용 전 확정만 되돌릴 수 있습니다"),
    lock: on(draft && !s?.OWNER_ID, "lock", "소유자 없는 DRAFT 만 선점할 수 있습니다"),
    unlock: on(!!mine, "unlock", "내 DRAFT 만 해제할 수 있습니다"),
    handover: on(!!mine, "handover", "내 DRAFT 만 넘길 수 있습니다"),
  };
}

/** 버전 이력 STATE 표기(버전 선택 라벨·사용 전문 열). */
export const VERSION_STATE_LABELS: Record<string, string> = { DRAFT: "작성 중", CURRENT: "현재", FUTURE: "적용 대기", PAST: "지난 버전" };

export function versionStateLabel(state: string | null | undefined): string {
  return state ? VERSION_STATE_LABELS[state] ?? state : "";
}

/** 버전 선택 콤보 — 값은 정규 문자열(`normVer`, 서버가 `"1.1"` 로 보내도 `"1.100"`), 라벨은 `v1.001 작성 중`. */
export function versionOptions(versions: LayoutVersionRow[]): Array<{ value: string; label: string }> {
  return versions.map((v) => ({ value: normVer(v.VER) ?? v.VER, label: `${fmtVer(v.VER)} ${versionStateLabel(v.STATE)}` }));
}
