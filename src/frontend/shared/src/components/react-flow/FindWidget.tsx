"use client";

/**
 * 찾기 위젯(룰 세트 편집기 canvas/FindWidget.tsx 복사본, VS Code 찾기 위젯 방식) — 캔버스 감싸개 안 오른쪽 위에 떠 있는 작은 상자.
 * 입력 칸(칸 안쪽 오른쪽에 옵션 토글 셋) · 건수 · [이전](Shift+Enter) · [다음](Enter) · [닫기](Esc).
 * 단추는 눌러도 초점을 가져가지 않는다(keepFocusOffButtons — 초점이 입력 칸에 남는다, Local-Rules §19).
 * 잘못된 정규식이면 입력 칸에 공용 오류 테두리(form-error)와 aria-invalid 를 준다. 글자·옵션은 화면의 찾기 훅에 남는다.
 */
import { useEffect, type KeyboardEvent, type RefObject } from "react";

import { IconArrowDown, IconArrowUp, IconX } from "@tabler/icons-react";

import { Input } from "../form/Input";
import type { FindOptions, FindState } from "./find";
import { DEFAULT_CLASS_PREFIX, findCss, styleHref } from "./styles";
import { ToolButton, keepFocusOffButtons } from "./ToolButton";

/** 옵션 토글 — 순서는 VS Code 와 같다. testid 는 `${testId}-${suffix}`. */
const OPTIONS: { key: keyof FindOptions; suffix: string; label: string; glyph: string }[] = [
  { key: "caseSensitive", suffix: "case", label: "대소문자 구분", glyph: "Aa" },
  { key: "wholeWord", suffix: "word", label: "단어 단위로", glyph: "ab" },
  { key: "regex", suffix: "regex", label: "정규식 사용", glyph: ".*" },
];

export const FIND_NO_RESULT = "결과 없음";

/** 건수 글 — 글자가 비면 빈 글, 결과가 없으면 noResultText, 있으면 "2/5". */
export function findCountText(find: Pick<FindState, "query" | "hits" | "index">, noResultText: string = FIND_NO_RESULT): string {
  if (find.query.trim() === "") return "";
  return find.hits.length === 0 ? noResultText : `${find.index + 1}/${find.hits.length}`;
}

export interface FindWidgetProps {
  find: FindState;
  inputRef: RefObject<HTMLInputElement | null>;
  /** 올라갈 때마다 입력 칸에 초점을 두고 전체 선택한다(처음 그릴 때 포함). */
  focusSeq: number;
  /** Esc·[닫기] — 화면이 초점을 캔버스로 돌리고 위젯을 닫는다. */
  onClose(): void;
  /** Mac 이면 Cmd+F, 아니면 Ctrl+F. */
  mac: boolean;
  /** 입력 칸 data-testid(기본 "flow-find"). 위젯 `-widget`, 옵션 `-case`·`-word`·`-regex`, 건수 `-count`, 단추 `-prev`·`-next`·`-close`. */
  testId?: string;
  /** 위젯 aria-label(기본 "찾기"). */
  label?: string;
  /** 입력 칸 aria-label(기본 "찾을 글"). */
  inputLabel?: string;
  /** 입력 칸 자리 글(기본 "찾기"). */
  placeholder?: string;
  /** 결과가 없을 때 건수 자리 글(기본 "결과 없음"). */
  noResultText?: string;
  /** 클래스 접두(기본 "rfx"). */
  classPrefix?: string;
}

export function FindWidget({
  find, inputRef, focusSeq, onClose, mac,
  testId = "flow-find", label = "찾기", inputLabel = "찾을 글", placeholder = "찾기", noResultText = FIND_NO_RESULT, classPrefix = DEFAULT_CLASS_PREFIX,
}: FindWidgetProps) {
  useEffect(() => {
    const el = inputRef.current;
    el?.focus({ preventScroll: true });
    el?.select();
  }, [focusSeq, inputRef]);

  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }
    // 위젯 안의 키는 캔버스 단축키 디스패처(감싸개 onKeyDown)로 보내지 않는다.
    e.stopPropagation();
  };
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (e.shiftKey) find.prev();
    else find.next();
  };

  const p = classPrefix;
  const none = find.hits.length === 0;
  return (
    <div
      data-testid={`${testId}-widget`}
      className={`${p}-find-widget`}
      role="search"
      aria-label={label}
      onMouseDown={keepFocusOffButtons}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
    >
      <style href={styleHref("find", p)} precedence="default">
        {findCss(p)}
      </style>
      <div className={`${p}-find-field`}>
        <Input
          data-testid={testId}
          {...({ ref: inputRef } as object)}
          className={find.invalid ? `${p}-find-input form-error` : `${p}-find-input`}
          aria-invalid={find.invalid}
          placeholder={placeholder}
          aria-label={inputLabel}
          value={find.query}
          onChange={find.setQuery}
          onKeyDown={onInputKeyDown}
        />
        <span className={`${p}-find-opts`}>
          {OPTIONS.map((o) => (
            <span key={o.key} className={`${p}-tip`} data-tip={o.label}>
              <button
                type="button"
                data-testid={`${testId}-${o.suffix}`}
                data-opt={o.key}
                className={`${p}-find-opt`}
                aria-label={o.label}
                aria-pressed={find.options[o.key]}
                onClick={() => find.toggleOption(o.key)}
              >
                <span aria-hidden="true">{o.glyph}</span>
              </button>
            </span>
          ))}
        </span>
      </div>
      <span data-testid={`${testId}-count`} className={`${p}-find-count`} data-empty={none ? "" : undefined} aria-live="polite">
        {findCountText(find, noResultText)}
      </span>
      <ToolButton classPrefix={p} data-testid={`${testId}-prev`} label="이전 결과" align="end" tip="이전 결과 (Shift+Enter)"
        icon={<IconArrowUp size={14} aria-hidden="true" />} disabled={none} onClick={find.prev} />
      <ToolButton classPrefix={p} data-testid={`${testId}-next`} label="다음 결과" align="end" tip="다음 결과 (Enter)"
        icon={<IconArrowDown size={14} aria-hidden="true" />} disabled={none} onClick={find.next} />
      <ToolButton classPrefix={p} data-testid={`${testId}-close`} label="닫기" tip="닫기 (Esc)" align="end"
        icon={<IconX size={14} aria-hidden="true" />} onClick={onClose} />
    </div>
  );
}
