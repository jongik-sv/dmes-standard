/**
 * MDM 화면 메타 타입 — 업무 BE `/api/{module}/mdmMeta/columns·domains` 응답(cactus-core `MdmScreenColumn`·`MdmDomainMeta`)과
 * 같은 칸이다(spec docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md §4). 이름·타입은 병렬 작업이 맞추는 계약이다.
 */

export interface MdmDomainRef {
  domainId: string;
  domainName: string | null;
  domainKind: string | null;
}

export interface MdmExpr {
  text: string | null;
  ast: Record<string, unknown> | null;
}

export interface MdmCodeRef {
  maruCodeId: string;
  cateId: string | null;
}

export interface MdmAllowedCode {
  code: string;
  name: string | null;
}

export interface MdmScreenColumn {
  physName: string;
  columnName: string | null;
  labelLong: string | null;
  labelMid: string | null;
  labelShort: string | null;
  description: string | null;
  usageNote: string | null;
  dataType: string | null;
  length: number | null;
  scale: number | null;
  required: boolean;
  defaultValue: string | null;
  refKind: string | null;
  refTarget: string | null;
  refCateId: string | null;
  domain: MdmDomainRef | null;
  stdExpr: MdmExpr | null;
  bizRuleOnServer: boolean;
  bizRequiredVars: string[];
  codeRef: MdmCodeRef | null;
  /** 코드 참조가 없거나 허용 코드를 풀 수 없으면 null. 빈 목록은 "풀었는데 허용 코드가 없다". */
  allowedCodes: MdmAllowedCode[] | null;
  /**
   * 시스템 별칭으로 맞은 컬럼의 시스템 코드(MES 등)와 그 시스템에 저장된 별칭 원문 — `physName` 은 늘 표준 물리명이다.
   * 표준 이름으로 맞았으면 null. 별칭 매칭 이전 모듈의 응답에는 칸 자체가 없으므로 선택 칸이다.
   */
  matchedSystem?: string | null;
  systemPhysName?: string | null;
}

export interface MdmDomainMeta {
  domainId: string;
  domainName: string | null;
  stdName: string | null;
  domainKind: string | null;
  dataType: string | null;
  length: number | null;
  scale: number | null;
  unitCode: string | null;
  description: string | null;
  stdExpr: MdmExpr | null;
  bizRuleOnServer: boolean;
  codeRef: MdmCodeRef | null;
}

/** 캡션을 쓰는 자리 — 그리드 머리글(좁다)과 폼 라벨(넓다)은 고르는 라벨 칸 순서가 다르다(spec B2). */
export type MdmCaptionKind = "grid" | "form";

/** explicit = 화면이 적은 캡션이 이긴다(기본), mdm = MDM 캡션이 이긴다(spec B1). */
export type MdmCaptionPriority = "explicit" | "mdm";
