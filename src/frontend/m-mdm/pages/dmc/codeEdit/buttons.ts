/**
 * codeEdit 버전 버튼 활성 매트릭스(TSK-06-02 design.md §6.12, 불변 규칙 I25) — 순수 함수.
 *
 * 서버 판정값(flags)과 선택한 버전으로 버튼마다 활성 여부를 정한다. 편집 불가(원천 EXTERNAL·담당자 아님)면 모두 비활성.
 * 권한(BFF 액션)은 화면이 canDoButton 으로 더 본다. 미적용 2개면 DRAFT 삭제만 남긴다(수용 기준 7, D7).
 */
import type { CodeEditView } from "./types";

export interface VersionButtonState {
  enabled: boolean;
  hint?: string;
}

export interface VersionButtons {
  newMajor: VersionButtonState;
  newMinor: VersionButtonState;
  delete: VersionButtonState;
  lock: VersionButtonState;
  unlock: VersionButtonState;
  handover: VersionButtonState;
  confirmMove: VersionButtonState;
  itemEdit: VersionButtonState;
  cateEdit: VersionButtonState;
  headerSave: VersionButtonState;
  deprecate: VersionButtonState;
  /** 새 버전 버튼 옆 안내(미적용 버전이 있거나 minor 상한). */
  newVersionHint: string | null;
  /** 미적용 2개 경고. */
  warning: string | null;
}

export const MINOR_LIMIT_HINT = "major 를 올리십시오";
export const TWO_UNAPPLIED_WARNING = "미적용 버전이 2개입니다. 하나를 삭제하세요";

const on = (enabled: boolean, hint?: string): VersionButtonState => (hint ? { enabled, hint } : { enabled });

export function versionButtons(view: CodeEditView | null, selectedVer: string | null): VersionButtons {
  const flags = view?.flags;
  const editable = !!flags?.editable;
  const unapplied = flags?.unappliedCount ?? 0;
  const deprecated = view?.header.storedStatus === "DEPRECATED";
  const selected = view?.versions.find((v) => v.ver === selectedVer) ?? null;
  // `draft`·`mine`·`free` 는 담당자(I12) 쓰기 — 저장·폐기·선점·넘기기·확정 이동·DRAFT 삭제의 기준.
  const draft = editable && selected?.status === "DRAFT";
  const mine = draft && !!view?.me && selected?.ownerId === view.me;
  const free = draft && !selected?.ownerId;
  // 해제(unlock)만 예외다 — ADR-0002 D3: "해제·넘기기·저장·삭제·확정은 소유자만 한다. 관리자 강제 해제·넘기기는 없다.
  // 소유권은 역할이 아니라 owner_id 로 판정하고, 역할은 '할 수 있는가' 만 판정한다." 역할을 잃은 소유자도 풀 수 있어야
  // DRAFT 가 영구히 묶이지 않는다. 공통 소유권 서비스(DefaultDraftOwnershipService)·룰 영역 RuleVersionService.unlock 과 같다.
  // 원천 MDM(I8)·소유자·미적용 1개(I6·D7) 조건은 그대로 둔다.
  const releasable = view?.header.sourceKind === "MDM" && selected?.status === "DRAFT"
    && !!view?.me && selected?.ownerId === view.me;
  const single = unapplied === 1;

  let newVersionHint: string | null = null;
  if (view && unapplied > 0 && !deprecated) {
    newVersionHint = `미적용 버전 ${view.header.unappliedLabel} 이 있어 새 버전을 만들 수 없습니다`;
  } else if (flags?.minorLimit) {
    newVersionHint = MINOR_LIMIT_HINT;
  }

  return {
    newMajor: on(editable && !!flags?.canNewMajor),
    newMinor: on(editable && !!flags?.canNewMinor, flags?.minorLimit ? MINOR_LIMIT_HINT : undefined),
    delete: on(mine),
    lock: on(free && single),
    unlock: on(releasable && single),
    handover: on(mine && single),
    confirmMove: on(mine && single),
    itemEdit: on(mine && single),
    cateEdit: on(mine && single),
    headerSave: on(editable && unapplied < 2),
    deprecate: on(editable && !deprecated && unapplied === 0),
    newVersionHint,
    warning: unapplied >= 2 ? TWO_UNAPPLIED_WARNING : null,
  };
}
