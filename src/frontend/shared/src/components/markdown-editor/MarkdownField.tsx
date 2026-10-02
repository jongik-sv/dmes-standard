"use client";

/**
 * 마크다운 칸(폼·패널용) — 고칠 수 있으면(editable) 처음부터 편집기(도구 막대 inline + 편집 칸)를 보인다. 누르기 단계가 없고,
 * 초점이 빠져도 도구 막대를 숨기지 않는다. 고칠 수 없으면 서식이 적용된 읽기 모습(테두리 상자)만 보인다.
 *
 * - 열기만 해서는(처음 그릴 때) onChange 를 부르지 않는다 — 편집기(MarkdownEditor)의 보장 그대로다.
 * - 처음 그릴 때 초점을 가져가지 않는다(화면의 다른 단축키·선택을 빼앗지 않는다). 편집 방식(서식·MD)을 바꿀 때만 새 칸이 초점을 받는다.
 * - 편집 방식은 `modeStorageKey` 가 같은 편집기와 같이 바뀐다.
 * - fill: 부모(세로 flex)의 남은 높이를 채운다(편집 칸·읽기 상자 모두).
 * - 고치는 대상(행·항목)이 바뀌면 부르는 쪽이 key 로 새로 그린다(편집기 되돌리기 기록이 다른 글로 넘어가지 않게).
 */
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownView } from "./MarkdownView";
import { MarkdownEditorStyle } from "./styles";

export interface MarkdownFieldProps {
  /** 글(마크다운 문자열). */
  value: string;
  /** 사용자가 고칠 때마다 새 마크다운. */
  onChange(md: string): void;
  /** 고칠 수 있는지 — true 면 편집기, false 면 읽기 모습만. */
  editable: boolean;
  /** 편집기 뿌리 data-testid(editable 일 때, 기본 "md-editor"). */
  testId?: string;
  /** 읽기 모습 상자 data-testid(editable=false 일 때, 기본 "md-field-view"). */
  viewTestId?: string;
  /** 접근성 이름(기본 "메모"). */
  ariaLabel?: string;
  /** 빈 글이고 고칠 수 없을 때 보일 글(기본 "메모 없음"). */
  emptyText?: string;
  /** true 면 부모(세로 flex)의 남은 높이를 채운다. */
  fill?: boolean;
  /** 편집 방식(서식·MD) 기억 저장 키(기본 "cm-md:editMode"). */
  modeStorageKey?: string;
  /** 읽기 모습 링크(a)에 더할 클래스. */
  linkClassName?: string;
}

export function MarkdownField({
  value,
  onChange,
  editable,
  testId = "md-editor",
  viewTestId = "md-field-view",
  ariaLabel = "메모",
  emptyText = "메모 없음",
  fill = false,
  modeStorageKey,
  linkClassName,
}: MarkdownFieldProps) {
  if (editable) {
    return (
      <div className={fill ? "cm-md-field cm-md-fill" : "cm-md-field"}>
        <MarkdownEditor
          toolbar="inline"
          fill={fill}
          testId={testId}
          value={value}
          editable
          ariaLabel={ariaLabel}
          modeStorageKey={modeStorageKey}
          linkClassName={linkClassName}
          onChange={onChange}
        />
      </div>
    );
  }
  return (
    <div
      className={fill ? "cm-md-field-view cm-md-fill" : "cm-md-field-view"}
      data-testid={viewTestId}
      data-editable="false"
      aria-label={ariaLabel}
    >
      <MarkdownEditorStyle />
      {value.trim() === "" ? (
        <span className="cm-md-empty">{emptyText}</span>
      ) : (
        <MarkdownView value={value} linkClassName={linkClassName} />
      )}
    </div>
  );
}
