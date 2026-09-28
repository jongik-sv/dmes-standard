/**
 * codeMng 오른쪽 상세(옛 codeEdit) 타입(TSK-06-02 design.md §6.8·§6.12, 2026-09-28 통합). 서버 DTO 와 이름이 같다.
 * 코드 선택은 목록(codeMng 왼쪽) 행 클릭으로 하므로 옛 ComboBox 용 `CodeOption`·`searchCodeOptions` 는 없앴다.
 */

export const ATTR_KEYS = [
  "attr01Name",
  "attr02Name",
  "attr03Name",
  "attr04Name",
  "attr05Name",
  "attr06Name",
  "attr07Name",
  "attr08Name",
  "attr09Name",
  "attr10Name",
] as const;

export type AttrKey = (typeof ATTR_KEYS)[number];

export interface CodeHeaderView extends Partial<Record<AttrKey, string | null>> {
  maruCodeId: string;
  maruCodeName: string;
  description: string | null;
  lvlCnt: number;
  sourceKind: string;
  status: string;
  storedStatus: string;
  auditVer: number | null;
  currentVerLabel: string;
  unappliedLabel: string;
}

export interface CodeVersionRow {
  ver: string;
  verLabel: string;
  verKind: string;
  status: string;
  ownerId: string | null;
  applyFrom: string | null;
  applyTo: string | null;
  releasedAt: string | null;
  restoredFrom: string | null;
  restoredLabel: string | null;
  rowVersion: number;
  unapplied: boolean;
  /**
   * 확정 취소 가능 여부(ADR-0002 D8) — 서버 판정값. 아직 적용 시각이 오지 않은 확정 버전이고 소유자가 나이며
   * 미적용 버전이 이 하나일 때만 true. 화면은 이 값만 보고 버튼을 켠다(재계산하지 않는다).
   */
  cancelConfirmable?: boolean;
  description: string | null;
}

export interface CodeEditFlags {
  unappliedCount: number;
  canNewMajor: boolean;
  canNewMinor: boolean;
  nextMajor: string | null;
  nextMinor: string | null;
  minorLimit: boolean;
  canDeprecate: boolean;
  editable: boolean;
  /** 한 번도 RELEASED 된 적이 없으면 true — 헤더의 [폐기] 자리에 [삭제]를 그린다(2026-09-28 사용자 결정 D-102). 없으면 false 로 본다. */
  neverReleased?: boolean;
  /** [삭제] 버튼 활성화(neverReleased 와 별개 서버 판정, 예: 담당자 여부). 없으면 false 로 본다. */
  canDeleteCode?: boolean;
}

export interface CodeEditView {
  header: CodeHeaderView;
  versions: CodeVersionRow[];
  flags: CodeEditFlags;
  restoreSources: string[];
  me: string | null;
  steward: boolean;
}

/** 헤더·라벨 편집 폼(문자열 상태). */
export interface HeaderForm extends Record<AttrKey, string> {
  maruCodeName: string;
  description: string;
  lvlCnt: string;
}

export const LVL_CNT_OPTIONS = ["0", "1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

/** 서버 MDM001 문구의 앞부분 — 이 오류는 모달을 닫을 때 다시 불러온다(design §6.12). */
export const CONFLICT_PREFIX = "다른 사용자가 수정했습니다";

export function headerFormOf(header: CodeHeaderView): HeaderForm {
  const form = {
    maruCodeName: header.maruCodeName ?? "",
    description: header.description ?? "",
    lvlCnt: String(header.lvlCnt ?? 0),
  } as HeaderForm;
  for (const key of ATTR_KEYS) form[key] = header[key] ?? "";
  return form;
}
