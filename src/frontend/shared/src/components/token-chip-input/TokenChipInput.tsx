"use client";

/**
 * 토큰 칩 입력 — 쉼표로 이은 코드 목록(`alpha,beta,gamma`)을 칩으로 보이고 고친다. 업무 도메인과 무관하다.
 *
 * - 제어형이다. `value`(토큰 배열)를 부모가 쥐고 바뀔 때마다 `onChange(next)`. 쉼표 글 ↔ 배열은 `parseTokens`·`joinTokens`.
 * - 입력: Enter·쉼표·공백·칸을 벗어날 때 칩이 된다(한 번에 여러 개를 붙여 넣어도 된다). 칩의 × 가 지우고, 빈 칸에서 Backspace 는 마지막 칩을 지운다.
 * - 규칙(`pattern`·`allowed`·`maxLength`)에 어긋난 입력은 칸에 남기고 작은 안내 글을 보인다.
 * - 스타일은 컴포넌트가 직접 넣는다(Part B §18-3). 색·간격은 공통 토큰만 쓴다.
 */
import {
  useId, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent, type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { addTokens, DEFAULT_TOKEN_PATTERN, type RejectedToken, type TokenRejectReason } from "./token-set";

export interface TokenChipInputProps {
  /** 지금 토큰 목록(제어형). */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** 허용 목록. 목록 밖 토큰은 `rejectOutside` 에 따라 거절하거나 잘못된 칩으로 보인다. */
  allowed?: readonly string[];
  /** true(기본)면 허용 목록 밖 입력을 거절한다. false 면 받되 잘못된 칩(빨간 테두리)으로 보인다. */
  rejectOutside?: boolean;
  /** 입력 토큰 모양. 기본 영문자로 시작하는 영문·숫자·밑줄. `null` 이면 모양을 보지 않는다. */
  pattern?: RegExp | null;
  /** 쉼표로 이은 글 전체 글자 수 상한. 없으면 제한 없음. */
  maxLength?: number;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  /** 거절 안내 문구 — 뒤에 거절된 토큰이 쉼표로 이어진다. */
  messages?: Partial<Record<TokenRejectReason, string>>;
  /** 칩 × 단추의 `aria-label` 앞부분(`{토큰} {removeLabel}`). 기본 「삭제」. */
  removeLabel?: string;
  /** 허용 목록 밖 칩의 마우스오버 설명. */
  invalidTitle?: string;
  className?: string;
  testId?: string;
}

const DEFAULT_MESSAGES: Record<TokenRejectReason, string> = {
  pattern: "형식에 맞지 않는 값",
  outside: "허용되지 않는 값",
  duplicate: "이미 있는 값",
  maxLength: "글자 수 한도를 넘는 값",
};

const STYLE_HREF = "cm-token-chip-input";
export const TOKEN_CHIP_INPUT_CSS = `
.cm-tci { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); width: 100%; min-height: 28px; padding: calc(var(--spacing-xs) / 2) var(--spacing-sm); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: text; }
.cm-tci:focus-within { border-color: var(--color-primary); }
.cm-tci[data-disabled="true"] { background: var(--color-bg-disabled); color: var(--color-text-disabled); cursor: not-allowed; }
.cm-tci[data-readonly="true"] { background: var(--color-bg-readonly); cursor: default; }
.cm-tci-chip { display: inline-flex; align-items: center; gap: calc(var(--spacing-xs) / 2); max-width: 100%; padding: 0 var(--spacing-xs) 0 var(--spacing-sm); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-primary-soft); color: var(--color-text); font-family: var(--font-family-mono); font-size: var(--font-size-sm); line-height: 18px; white-space: nowrap; }
.cm-tci-chip[data-readonly="true"] { padding-right: var(--spacing-sm); }
.cm-tci-chip[data-invalid="true"] { border-color: var(--color-danger); background: var(--color-danger-soft); color: var(--color-danger); }
.cm-tci-x { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: inherit; font-size: var(--font-size-md); line-height: 1; cursor: pointer; }
.cm-tci-x:hover { background: var(--color-bg-hover); }
.cm-tci-x:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 0; }
.cm-tci-input { flex: 1 1 80px; min-width: 60px; padding: 0; border: 0; outline: none; background: transparent; color: var(--color-text); font-family: var(--font-family-mono); font-size: var(--font-size-sm); line-height: 22px; }
.cm-tci-input::placeholder { color: var(--color-text-placeholder); }
.cm-tci-msg { margin-top: var(--spacing-xs); color: var(--color-danger); font-size: var(--font-size-xs); }
`;

function TokenChipInputStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {TOKEN_CHIP_INPUT_CSS}
    </style>
  );
}

export function TokenChipInput({
  value, onChange, allowed, rejectOutside = true, pattern = DEFAULT_TOKEN_PATTERN, maxLength, readOnly = false, disabled = false,
  placeholder, "aria-label": ariaLabel, messages, removeLabel = "삭제", invalidTitle = "허용 목록에 없는 값", className, testId = "token-chip-input",
}: TokenChipInputProps) {
  const [text, setText] = useState("");
  const [rejected, setRejected] = useState<RejectedToken[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgId = useId();
  const allowSet = useMemo(() => (allowed ? new Set(allowed) : null), [allowed]);
  const inactive = readOnly || disabled;

  /** 글을 칩으로 만든다. `keepTail` 이면 마지막 조각(아직 치는 중)은 칸에 남긴다. */
  const commit = (raw: string, keepTail: boolean) => {
    let body = raw;
    let tail = "";
    if (keepTail) {
      const m = /^([\s\S]*[\s,])([^\s,]*)$/.exec(raw);
      if (m) { body = m[1]; tail = m[2]; } else { body = ""; tail = raw; }
    }
    if (!body.trim() && !body.includes(",")) { setText(tail); return; }
    const res = addTokens(value, body, { allowed: rejectOutside ? allowed : undefined, pattern, maxLength });
    if (res.next.length !== value.length) onChange(res.next);
    setRejected(res.rejected);
    // 거절된 토큰은 따로 들고 안내 글에만 보인다 — 칸 글을 다시 쓰지 않아 캐럿이 튀지 않는다.
    setText(tail);
  };
  const composing = useRef(false);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (composing.current) setText(v); // 한글 조합 중에는 글만 받는다
    else if (/[\s,]/.test(v)) commit(v, true);
    else { setText(v); if (rejected.length) setRejected([]); }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // Safari 는 조합을 확정하는 Enter 를 isComposing=false·keyCode 229 로 보낸다.
    if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (text.trim()) commit(text, false);
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      onChange(value.slice(0, -1));
      setRejected([]);
    }
  };

  const onCompositionEnd = (e: CompositionEvent<HTMLInputElement>) => {
    composing.current = false;
    const v = e.currentTarget.value;
    if (/[\s,]/.test(v)) commit(v, true);
  };

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
    setRejected([]);
    inputRef.current?.focus();
  };

  const msgs = { ...DEFAULT_MESSAGES, ...messages };
  const reasons = [...new Set(rejected.map((r) => r.reason))];
  const message = reasons.map((r) => `${msgs[r]}: ${rejected.filter((x) => x.reason === r).map((x) => x.token).join(", ")}`).join(" · ");

  return (
    <div className={className} data-testid={testId}>
      <TokenChipInputStyle />
      <div
        className="cm-tci"
        // 입력 칸이 없을 때(읽기·사용 안 함)는 묶음이 이름을 가진다.
        role={inactive ? "group" : undefined}
        aria-label={inactive ? ariaLabel : undefined}
        aria-disabled={disabled || undefined}
        data-disabled={disabled}
        data-readonly={readOnly && !disabled}
        onMouseDown={(e) => {
          if (!inactive && e.target === e.currentTarget) { e.preventDefault(); inputRef.current?.focus(); }
        }}
      >
        {value.map((t, i) => {
          const invalid = allowSet ? !allowSet.has(t) : false;
          return (
            <span key={`${t}-${i}`} className="cm-tci-chip" data-invalid={invalid} data-readonly={inactive} title={invalid ? invalidTitle : undefined} data-testid={`${testId}-chip-${t}`}>
              {t}
              {!inactive && (
                <button type="button" className="cm-tci-x" aria-label={`${t} ${removeLabel}`} onClick={() => remove(i)} data-testid={`${testId}-remove-${t}`}>
                  ×
                </button>
              )}
            </span>
          );
        })}
        {!inactive && (
          <input
            ref={inputRef}
            className="cm-tci-input"
            type="text"
            value={text}
            placeholder={value.length === 0 ? placeholder : undefined}
            aria-label={ariaLabel}
            aria-invalid={rejected.length > 0 || undefined}
            aria-describedby={message ? msgId : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={onCompositionEnd}
            onBlur={() => { if (!composing.current && text.trim()) commit(text, false); }}
            data-testid={`${testId}-input`}
          />
        )}
      </div>
      {message && (
        <div id={msgId} className="cm-tci-msg" role="alert" data-testid={`${testId}-message`}>
          {message}
        </div>
      )}
    </div>
  );
}
