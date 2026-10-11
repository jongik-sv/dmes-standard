/**
 * 화면 권한(S2-20) — 모델 편집(DRAFT + 소유자·공동 편집자)과 다이어그램 편집(보이는 버전의 소유자·공동 편집자)을 나눈다. 순수.
 * 서버 판정(R7-1 소유자가 없으면 공동 편집자를 인정하지 않음, R9-2 다이어그램 명령)과 같은 규칙이다. 확정·편집자 관리는 DRAFT 소유자만.
 * 연결이 끊기면 고칠 수 있던 권한도 LOST_TEXT 로 막는다(스펙 4.4 "편집을 멈춘다").
 */
import { localNotice, type EditRights, type ErdNotice, type Right } from "../edit-context";
import type { ErdState } from "../types";

export const NO_RIGHT_TEXT = "이 화면의 편집 권한이 없어 읽기만 할 수 있습니다. 권한은 시스템 관리자에게 요청하세요.";
export const RELEASED_TEXT = "확정된 버전이라 모델을 고칠 수 없습니다. [버전 ▾] 의 [새 버전] 으로 DRAFT 를 만드세요.";
export const NO_OWNER_DIAGRAM_TEXT = "이 버전에 소유자가 없어 아무도 다이어그램을 고칠 수 없습니다. DRAFT 를 [버전 ▾] 에서 [선점] 하거나 [새 버전] 을 만드세요.";
export const LOST_TEXT = "실시간 연결이 끊겨 편집을 멈췄습니다. 다시 연결되면 이어서 고칠 수 있습니다.";

export const notEditorText = (ownerId: string | null): string =>
  `공동 편집자가 아니어서 읽기만 할 수 있습니다. 소유자(${ownerId ?? "없음"})에게 공동 편집자 등록을 요청하세요.`;

export interface RbacFlags { loading: boolean; save: boolean; confirm: boolean; execute: boolean }

const OK: Right = { ok: true, reason: null };
const no = (reason: string | null): Right => ({ ok: false, reason });

/** 소유자이거나, 소유자가 있는 버전의 공동 편집자(R7-1). */
export function isEditor(state: ErdState, me: string | null): boolean {
  return !!me && state.ownerId !== null && (me === state.ownerId || state.editors.includes(me));
}

/** 단계 1 읽기 전용 이유(시험 호환). 권한 → 확정 버전 → 공동 편집자 순서. */
export function readOnlyReason(state: ErdState, me: string | null, canEdit: boolean): string | null {
  if (!canEdit) return NO_RIGHT_TEXT;
  if (state.status !== "DRAFT") return RELEASED_TEXT;
  if (!isEditor(state, me)) return notEditorText(state.ownerId);
  return null;
}

export function editRights(state: ErdState | null, me: string | null, rbac: RbacFlags, connected: boolean): EditRights {
  if (!state || rbac.loading) {
    const wait = no(null);
    return { model: wait, diagram: wait, confirm: wait, manageEditors: wait, owner: false };
  }
  const owner = !!me && me === state.ownerId;
  const draft = state.status === "DRAFT";
  const editor = isEditor(state, me);
  const live = (r: Right): Right => (r.ok && !connected ? no(LOST_TEXT) : r);
  const ownerName = state.ownerId ?? "없음";
  return {
    model: live(!rbac.save ? no(NO_RIGHT_TEXT) : !draft ? no(RELEASED_TEXT) : !editor ? no(notEditorText(state.ownerId)) : OK),
    diagram: live(!rbac.save ? no(NO_RIGHT_TEXT) : state.ownerId === null ? no(NO_OWNER_DIAGRAM_TEXT)
      : !editor ? no(notEditorText(state.ownerId)) : OK),
    confirm: live(!rbac.confirm ? no("확정 권한이 없습니다. 권한은 시스템 관리자에게 요청하세요.")
      : !draft ? no("확정할 DRAFT 가 없습니다.") : !owner ? no(`확정은 DRAFT 소유자(${ownerName})만 할 수 있습니다.`) : OK),
    manageEditors: live(!rbac.execute ? no(NO_RIGHT_TEXT) : !draft ? no("공동 편집자는 DRAFT 에서만 바꿀 수 있습니다.")
      : !owner ? no(`공동 편집자는 소유자(${ownerName})만 바꿀 수 있습니다.`) : OK),
    owner,
  };
}

/** 위 띠 글. 끊김은 끊김 띠가 따로 보이므로 뺀다. 소유자가 없어 다이어그램도 못 고치면 deferred 37 문구를 보인다. */
export function readOnlyBanner(r: EditRights): string | null {
  if (r.model.ok || r.model.reason === null || r.model.reason === LOST_TEXT) return null;
  if (r.model.reason !== NO_RIGHT_TEXT && r.diagram.reason === NO_OWNER_DIAGRAM_TEXT) return NO_OWNER_DIAGRAM_TEXT;
  return r.model.reason;
}

/** 긴 이유 → 짧은 이유(툴팁·입력 칸용, UX 1차 U19). 모르는 글은 그대로. */
export function shortReason(reason: string | null): string {
  if (reason === null) return "";
  if (reason === NO_RIGHT_TEXT) return "권한 없음";
  if (reason === RELEASED_TEXT) return "확정된 버전";
  if (reason.startsWith("공동 편집자가 아니어서")) return "공동 편집자 아님";
  if (reason === NO_OWNER_DIAGRAM_TEXT) return "소유자 없음";
  if (reason === LOST_TEXT) return "연결 끊김";
  return reason;
}

export type ReadOnlyKind = "noRight" | "released" | "notEditor" | "noOwner";

/** readOnlyBanner 와 같은 판정을 종류로. 읽기 전용 칩·seenReadOnly 키에 쓴다. 안내할 것이 없으면 null. */
export function readOnlyKind(r: EditRights): ReadOnlyKind | null {
  const text = readOnlyBanner(r);
  if (text === null) return null;
  if (text === NO_RIGHT_TEXT) return "noRight";
  if (text === RELEASED_TEXT) return "released";
  if (text === NO_OWNER_DIAGRAM_TEXT) return "noOwner";
  if (text.startsWith("공동 편집자가 아니어서")) return "notEditor";
  return null;
}

/** 보내기 전 판정. model: 묶음에 모델 명령이 하나라도 있다. null 이면 보내도 된다. */
export function blockedNotice(r: EditRights, connected: boolean, model: boolean): ErdNotice | null {
  if (!connected) return localNotice("NETWORK", LOST_TEXT);
  const right = model ? r.model : r.diagram;
  return right.ok ? null : localNotice("NOT_EDITOR", right.reason ?? "지금은 고칠 수 없습니다.", "[읽기 전용] 표시를 눌러 이유를 보세요.");
}
