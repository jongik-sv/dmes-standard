/**
 * codeEdit — 마루 코드 수정 화면 타입(TSK-06-02 design.md §6.8·§6.12). 서버 DTO 와 이름이 같다.
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
}

export interface CodeEditView {
  header: CodeHeaderView;
  versions: CodeVersionRow[];
  flags: CodeEditFlags;
  restoreSources: string[];
  me: string | null;
  steward: boolean;
}

export interface CodeOption {
  maruCodeId: string;
  maruCodeName: string;
  status: string;
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
