"use client";

/**
 * 글 | HTML 형식 전환 칸 — 같은 칸에 일반 글과 HTML 을 함께 받을 때, 형식 선택([글 | HTML])과 형식별 편집 칸을 묶은 합성 부품.
 *
 * - 글: shared `Textarea`(줄바꿈 보존) + 글자 수 줄. HTML: `HtmlEditor`.
 * - 형식은 값에서 판별한다 — 판별 규칙(어떤 값을 HTML 로 볼지)은 업무 규칙이라 부르는 쪽이 `detectFormat` 으로 준다.
 *   처음 형식은 그릴 때 한 번 정한다(대상이 바뀌면 부르는 쪽이 key 로 새로 그린다).
 * - 글 → HTML: textToHtml — 묻지 않는다. HTML → 글: 확인 뒤 htmlToText. 빈 값(공백뿐)은 빈 값으로 두고 묻지 않는다.
 * - 저장하면 다른 형식으로 보일 값(글 모드인데 판별이 HTML, HTML 모드인데 판별이 글)은 미리 알린다.
 * - maxLength: 글자 수를 보이고 넘으면 경고만 한다(입력은 막지 않는다 — 서버가 최종 판정). HTML 모드는 편집기가 같은 상한을 쓴다.
 * - 스타일은 공통 토큰을 쓴 인라인 스타일이다(Part B §18-3).
 */
import { useState, type CSSProperties } from "react";

import { SegmentedControl, Textarea } from "../form";
import { useMessage } from "../message-provider";
import { htmlToText, textToHtml } from "./convert";
import { HtmlEditor } from "./HtmlEditor";

export type HtmlFormat = "TEXT" | "HTML";

/** HTML → 글로 바꿀 때 묻는 기본 문구. */
export const HTML_TO_TEXT_MESSAGE = "HTML 서식이 사라지고 글자만 남습니다. 글로 바꾸시겠습니까?";

/** 칸에 보이는 문구. 주지 않은 항목은 기본 문구를 쓴다. */
export interface HtmlFormatFieldMessages {
  /** 형식 선택의 글 칸 글자(기본 "글"). */
  textLabel: string;
  /** 형식 선택의 HTML 칸 글자(기본 "HTML"). */
  htmlLabel: string;
  /** HTML → 글 확인 문구(기본 HTML_TO_TEXT_MESSAGE). */
  toTextConfirm: string;
  /** 글 모드인데 판별이 HTML 일 때 경고. null 이면 알리지 않는다. */
  textLooksHtml: string | null;
  /** HTML 모드인데 판별이 글일 때 경고(빈 값 제외). null 이면 알리지 않는다. */
  htmlLooksText: string | null;
  /** 글 모드에서 상한을 넘었을 때 경고. 인자는 천 단위 구분한 상한. */
  overLimit(max: string): string;
}

const DEFAULT_MESSAGES: HtmlFormatFieldMessages = {
  textLabel: "글",
  htmlLabel: "HTML",
  toTextConfirm: HTML_TO_TEXT_MESSAGE,
  textLooksHtml: "HTML 태그가 들어 있어 저장하면 HTML 로 보입니다.",
  htmlLooksText: "알려진 HTML 태그가 없어 저장하면 글로 보입니다.",
  overLimit: (max) => `${max}자를 넘었습니다. 줄이지 않으면 저장하지 못합니다.`,
};

export interface HtmlFormatFieldProps {
  value: string;
  onChange(value: string): void;
  /** 값의 형식 판별(필수) — 처음 형식과 형식 경고에 쓴다. 저장 후 다른 곳이 같은 규칙으로 그릴 판별 함수를 준다. */
  detectFormat(value: string): HtmlFormat;
  /** 확인창(HTML → 글, 편집기의 서식 손실 확인). 주지 않으면 공용 메시지 확인창(MessageProvider), 그것도 없으면 window.confirm(HtmlEditor 와 같다). */
  confirm?(message: string): Promise<boolean>;
  /** 뿌리 data-testid(기본 "html-format-field"). 안쪽: `-format`(형식 선택), `-text`·`-text-count`(글), `-html`(편집기), `-format-warning`. */
  testId?: string;
  /** 칸 이름(접근성, 기본 "본문"). 형식 선택 이름은 `<ariaLabel> 형식`. */
  ariaLabel?: string;
  /** 글자 수 상한. 주면 글 모드에 `n / 상한자` 를 보이고 넘으면 경고한다. HTML 모드 편집기에도 같은 상한을 준다. */
  maxLength?: number;
  /** 글 모드 Textarea 줄 수(기본 2). */
  rows?: number;
  /** HTML 편집 칸 최소 높이(기본 120). */
  minHeight?: number | string;
  /** 문구 바꾸기(일부만 줘도 된다). */
  messages?: Partial<HtmlFormatFieldMessages>;
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

/** MessageProvider 밖(시험 등)이면 null. useMessage 는 Provider 밖에서 던진다(HtmlEditor 와 같은 방식). */
function useOptionalMessage() {
  try {
    return useMessage();
  } catch {
    return null;
  }
}

export function HtmlFormatField({
  value,
  onChange,
  detectFormat,
  confirm,
  testId = "html-format-field",
  ariaLabel = "본문",
  maxLength,
  rows = 2,
  minHeight = 120,
  messages,
}: HtmlFormatFieldProps) {
  const msg: HtmlFormatFieldMessages = { ...DEFAULT_MESSAGES, ...messages };
  const [format, setFormat] = useState<HtmlFormat>(() => detectFormat(value ?? ""));
  const text = value ?? "";
  const detected = detectFormat(text);

  const message = useOptionalMessage();

  const ask = (question: string): Promise<boolean> => {
    if (confirm) return confirm(question);
    if (!message) return Promise.resolve(window.confirm(question));
    return new Promise((resolve) =>
      message.showMessage({
        title: "확인",
        message: question,
        alertType: "confirm",
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      })
    );
  };

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
    if (!(await ask(msg.toTextConfirm))) return;
    onChange(htmlToText(text));
    setFormat("TEXT");
  };

  const warning =
    format === "TEXT" && detected === "HTML"
      ? msg.textLooksHtml
      : format === "HTML" && text.trim() !== "" && detected === "TEXT"
        ? msg.htmlLooksText
        : null;
  const over = maxLength !== undefined && text.length > maxLength;

  return (
    <div style={fieldStyle} data-testid={testId}>
      <div style={headStyle}>
        <SegmentedControl
          value={format}
          options={[
            { value: "TEXT", label: msg.textLabel },
            { value: "HTML", label: msg.htmlLabel },
          ]}
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
            rows={rows}
            aria-label={ariaLabel}
            data-testid={`${testId}-text`}
            onChange={onChange}
          />
          {maxLength !== undefined && (
            <div style={countStyle(over)} data-testid={`${testId}-text-count`} data-over={over ? "true" : "false"}>
              {over && <span role="alert">{msg.overLimit(num(maxLength))}</span>}
              <span>
                {num(text.length)} / {num(maxLength)}자
              </span>
            </div>
          )}
        </div>
      ) : (
        <HtmlEditor
          value={text}
          onChange={onChange}
          editable
          maxLength={maxLength}
          testId={`${testId}-html`}
          ariaLabel={ariaLabel}
          minHeight={minHeight}
          confirm={confirm}
        />
      )}
    </div>
  );
}
