"use client";

/**
 * columnMng 설명·활용처 메모 칸 — 형식 선택 [글 | HTML] 과 형식별 편집 칸.
 *
 * 형식은 따로 저장하지 않는다. 저장한 값에 알려진 HTML 태그가 있으면 HTML 로 보인다 — 서버·팝오버·툴팁이 같은 규칙
 * `descriptionFormat`(@/column-info, 백엔드 ColumnDescriptionFormat 과 같은 표, D-150)으로 판별한다. 그래서 이 칸도 처음 형식을 그 함수로 정하고,
 * 저장하면 다른 형식으로 보일 값(글 모드에 `<b>` 같은 태그, HTML 모드에 알려진 태그 없음)은 미리 알린다.
 *
 * - 글: 지금처럼 Textarea(줄바꿈 보존). HTML: shared `HtmlEditor`.
 * - 글 → HTML: textToHtml(이스케이프 + 줄마다 `<p>`, 빈 줄은 빈 문단, 연속 공백은 &nbsp;, 탭은 공백 4칸) — 묻지 않는다. 되돌리면 탭만 공백 4칸이 된다.
 *   HTML → 글: 확인 뒤 htmlToText(글자만, 블록 사이 줄바꿈). 빈 값은 빈 값 그대로 두고 묻지 않는다.
 * - 글자 수: 상한(서버와 같은 20,000자, HTML 길이 기준)을 넘으면 경고만 한다 — 서버가 최종 판정하고, 저장 오류는 화면의 기존 오류 창에 뜬다.
 * - 처음 형식은 그릴 때 한 번 정한다 — 다른 행을 열거나 다시 읽으면 화면이 key 로 새로 그린다.
 * - 판별 규칙이 MDM 것이라 화면에 둔다. 도메인과 무관한 편집기·변환은 shared html-editor 다(Part B §18-1).
 */
import { useState, type CSSProperties } from "react";

import { SegmentedControl, Textarea } from "@dk-oasis/shared/form";
import { HtmlEditor, htmlToText, textToHtml } from "@dk-oasis/shared/html-editor";
import { descriptionFormat } from "@/column-info";

/** 설명·활용처 메모 글자 수 상한 — 서버(ColumnMngService)와 같은 값. */
export const DESCRIPTION_MAX = 20000;

/** HTML → 글로 바꿀 때 묻는 문구. */
export const HTML_TO_TEXT_MESSAGE = "HTML 서식이 사라지고 글자만 남습니다. 글로 바꾸시겠습니까?";

type Format = "TEXT" | "HTML";

const FORMAT_OPTIONS = [
  { value: "TEXT", label: "글" },
  { value: "HTML", label: "HTML" },
];

export interface DescriptionFieldProps {
  value: string;
  onChange(value: string): void;
  /** 뿌리 data-testid. 안쪽: `-format`(형식 선택), `-text`·`-text-count`(글), `-html`(편집기), `-format-warning`. */
  testId: string;
  /** 칸 이름(접근성). */
  ariaLabel: string;
  /** 확인창(HTML → 글, 편집기의 서식 손실 확인). */
  confirm(message: string): Promise<boolean>;
  /** 글자 수 상한(기본 DESCRIPTION_MAX). */
  maxLength?: number;
}

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-xs)",
  minWidth: 0,
};
const headStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-sm)",
  flexWrap: "wrap",
};
const warnStyle: CSSProperties = {
  color: "var(--color-warning)",
  fontSize: "var(--font-size-xs)",
};
const countStyle = (over: boolean): CSSProperties => ({
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--spacing-xs)",
  marginTop: 2,
  color: over ? "var(--color-danger)" : "var(--color-text-secondary)",
  fontSize: "var(--font-size-xs)",
});

const num = (n: number) => n.toLocaleString("ko-KR");

export function DescriptionField({
  value,
  onChange,
  testId,
  ariaLabel,
  confirm,
  maxLength = DESCRIPTION_MAX,
}: DescriptionFieldProps) {
  const [format, setFormat] = useState<Format>(() => descriptionFormat(value));
  const text = value ?? "";
  const detected = descriptionFormat(text);

  const changeFormat = async (next: string) => {
    if (next !== "TEXT" && next !== "HTML") return;
    if (next === format) return;
    if (next === "HTML") {
      const html = textToHtml(text);
      if (html !== text) onChange(html);
      setFormat("HTML");
      return;
    }
    if (text.trim() === "") {
      if (text !== "") onChange("");
      setFormat("TEXT");
      return;
    }
    if (!(await confirm(HTML_TO_TEXT_MESSAGE))) return;
    onChange(htmlToText(text));
    setFormat("TEXT");
  };

  const warning =
    format === "TEXT" && detected === "HTML"
      ? "HTML 태그가 들어 있어 저장하면 HTML 로 보입니다."
      : format === "HTML" && text.trim() !== "" && detected === "TEXT"
        ? "알려진 HTML 태그가 없어 저장하면 글로 보입니다."
        : null;
  const over = text.length > maxLength;

  return (
    <div style={fieldStyle} data-testid={testId}>
      <div style={headStyle}>
        <SegmentedControl
          value={format}
          options={FORMAT_OPTIONS}
          ariaLabel={`${ariaLabel} 형식`}
          testId={`${testId}-format`}
          onChange={(v) => void changeFormat(v)}
        />
        {warning && (
          <span style={warnStyle} data-testid={`${testId}-format-warning`}>
            {warning}
          </span>
        )}
      </div>
      {format === "TEXT" ? (
        <div>
          <Textarea
            value={text}
            rows={2}
            aria-label={ariaLabel}
            data-testid={`${testId}-text`}
            onChange={onChange}
          />
          <div style={countStyle(over)} data-testid={`${testId}-text-count`} data-over={over ? "true" : "false"}>
            {over && (
              <span role="alert">{num(maxLength)}자를 넘었습니다. 줄이지 않으면 저장하지 못합니다.</span>
            )}
            <span>
              {num(text.length)} / {num(maxLength)}자
            </span>
          </div>
        </div>
      ) : (
        <HtmlEditor
          value={text}
          onChange={onChange}
          editable
          maxLength={maxLength}
          testId={`${testId}-html`}
          ariaLabel={ariaLabel}
          minHeight={120}
          confirm={confirm}
        />
      )}
    </div>
  );
}
