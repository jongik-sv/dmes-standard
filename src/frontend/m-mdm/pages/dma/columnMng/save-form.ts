/**
 * columnMng [저장] 화면 선검사와 저장 파라미터(TSK-04-04 design.md §6.12, B7). 서버가 다시 막으므로 문구는 서버와 같다(I12).
 *
 * D-141 — 도메인은 필수가 아니다. 비워 두면 domainId 를 보내지 않고 서버가 DOMAIN_ID 를 NULL 로 저장한다.
 */
import { htmlToText } from "@dk-oasis/shared/html-editor";
import { descriptionFormat } from "@/column-info";
import type { ColumnForm } from "./types";

export const PLACEHOLDER_ERROR = "미등록 용어(***)가 남아 있어 저장할 수 없습니다";
export const REQUIRED_ERROR = "논리명·표준 물리명은 필수입니다";

/**
 * 저장을 막을 문구, 없으면 null. `***` 가 남았으면 필수 누락보다 먼저 알린다 — 미등록 꼬리는 추천 도메인도 없으므로(D4)
 * 필수 누락 문구가 원인을 가린다(B7).
 */
export function saveFormError(
  form: ColumnForm,
  formTerms: readonly (number | null)[],
): string | null {
  if (
    form.physName.includes("*") ||
    form.columnName.includes("*") ||
    formTerms.some((t) => t == null)
  ) {
    return PLACEHOLDER_ERROR;
  }
  if (!form.columnName.trim() || !form.physName.trim()) {
    return REQUIRED_ERROR;
  }
  return null;
}

/**
 * 보이는 글자도 그림·구분선도 없는 HTML(`<p><br></p>` 등)은 빈 값으로 바꾼다 — 서식 모드의 빈 편집기와 같게.
 * 그대로 저장하면 서버가 HTML 로 판정해 피드에 빈 큰 설명이 실린다. 그림·구분선만 있는 설명은 정당한 값이라 둔다.
 */
export function blankHtmlToEmpty(value: string): string {
  if (!value || descriptionFormat(value) !== "HTML") return value;
  if (/<(img|hr)[\s/>]/i.test(value)) return value;
  return htmlToText(value).trim() === "" ? "" : value;
}

/** 저장 요청 params. 빈 도메인은 undefined — 호출부(callOasis)가 null·undefined 칸을 빼고 보낸다. */
export function toSaveParams(form: ColumnForm): Record<string, unknown> {
  return {
    columnId: form.columnId,
    columnName: form.columnName,
    physName: form.physName,
    labelLong: form.labelLong,
    labelMid: form.labelMid,
    labelShort: form.labelShort,
    description: blankHtmlToEmpty(form.description),
    domainId: form.domainId ? Number(form.domainId) : undefined,
    required: form.required === "Y",
    defaultValue: form.defaultValue,
    refKind: form.refKind,
    refTarget: form.refTarget,
    refCateId: form.refCateId,
    usageNote: blankHtmlToEmpty(form.usageNote),
  };
}
