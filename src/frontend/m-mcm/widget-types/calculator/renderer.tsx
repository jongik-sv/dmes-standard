"use client";

/**
 * 계산기 렌더러 — 표시창(윗줄 식·아랫줄 큰 값·복사)과 5행 4열 단추, 넓으면 오른쪽에 계산 기록.
 * 계산은 calculator-model.ts 의 reducer 가 한다(이 파일은 그리기·입력 연결만).
 * - 키보드: 계산기 영역(tabIndex=0) 자신에 초점이 있을 때만 받는다(React onKeyDown 이라 영역 밖 입력칸의 키는 오지 않는다).
 *   안쪽 단추(기록·복사)에 초점이 있을 때는 그 단추의 Enter·Space 를 건드리지 않도록 무시한다. Ctrl·Meta·Alt 조합과 한글 조합 중 키도 무시한다.
 *   처리한 키만 preventDefault 한다. F9 는 ±. 받는 키는 aria-keyshortcuts 로 알린다.
 *   계산기가 처리한 Esc(모두 지우기)는 위로 올리지 않는다 — [배치 편집] 취소(작업 공간의 document keydown)로 새지 않게.
 * - 마우스로 단추를 눌러도 초점이 단추로 옮겨 가지 않고 계산기 영역에 머문다(mousedown 에서 기본 동작을 막고 영역에 초점을 준다).
 *   키 단추는 Tab 순서에서 뺀다 — 키보드는 영역 하나에서 모두 받는다. 복사·기록 단추를 키보드로 눌러도 끝나면 영역으로 초점을 돌린다.
 * - 복사는 shared copyText 로 한다(http 처럼 navigator.clipboard 가 없는 곳은 execCommand 대체 경로 — 숨은 textarea 가 초점을 가져가므로 영역으로 되돌린다).
 *   성공은 1.2초 체크 표시와 보이지 않는 status 영역(「복사했습니다」)으로 알린다.
 * - 본문 크기(useWidgetBodySize)에 맞춰 단추·표시창 글자 크기를 정하고, 너비가 충분하면 기록 칸을 보인다. 크기를 모르면 스타일 기본값.
 */
import { useEffect, useId, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { copyText } from "@dk-oasis/shared/form";
import { useWidgetBodySize, type WidgetProps } from "@dk-oasis/shared/widget";

import {
  CALC_KEY_SHORTCUTS,
  CALC_KEYS,
  calcActionForKey,
  calcFonts,
  calcReducer,
  copyValue,
  displayText,
  exprText,
  formatNumberText,
  historyVisible,
  INITIAL_CALC_STATE,
  readCalculatorConfig,
} from "./calculator-model";
import { CALC_CSS, CALC_STYLE_HREF } from "./calculator-styles";

/** 복사 완료 표시(체크·스크린리더 안내)를 두는 시간. */
const COPIED_MS = 1200;
const COPIED_ANNOUNCE = "복사했습니다";

/**
 * 계산기가 처리한 Esc 를 위(배치 편집 취소)로 올리지 않는다. preventDefault 는 호출자가 이미 했다.
 * shared WidgetWorkspace 는 document 에 bubble 단계 keydown 을 걸어 두는데(capture 아님), Next 앱 라우터는 React 위임 뿌리가
 * document 라 React 의 합성 stopPropagation 만으로는 같은 document 의 뒤에 등록된 리스너를 못 막는다 — 네이티브 이벤트의
 * stopImmediatePropagation 도 부른다(React 리스너가 먼저 등록되므로 뒤 리스너가 막힌다). 메모 위젯 stopEscape 와 같은 방식이다.
 */
function swallowEscape(e: KeyboardEvent<HTMLElement>) {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

function CalculatorStyle() {
  return (
    <style href={CALC_STYLE_HREF} precedence="default">
      {CALC_CSS}
    </style>
  );
}

export default function CalculatorRenderer({ definition }: WidgetProps) {
  const cfg = readCalculatorConfig(definition);
  const body = useWidgetBodySize();
  const [state, dispatch] = useReducer(calcReducer, INITIAL_CALC_STATE);
  const rootRef = useRef<HTMLDivElement>(null);
  const historyTitleId = useId();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  const showHistory = historyVisible(cfg.showHistory, body.width);
  const valueText = displayText(state);
  const isError = state.mode === "error";
  const fonts = calcFonts(body.width, body.height, showHistory, valueText);
  const style = fonts
    ? ({ "--calc-key-font": `${fonts.key}px`, "--calc-value-font": `${fonts.value}px` } as CSSProperties)
    : undefined;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;
    const action = calcActionForKey(e.key, e.code);
    if (!action) return;
    e.preventDefault();
    if (e.key === "Escape") swallowEscape(e);
    dispatch(action);
  };

  /** 계산기 영역에 초점을 둔다 — 바로 숫자 키를 쓸 수 있게. */
  const focusRoot = () => rootRef.current?.focus({ preventScroll: true });

  /** 마우스 누름 — 단추로 초점이 가지 않게 막고, 키보드를 바로 쓰도록 계산기 영역에 초점을 둔다. */
  const keepFocus = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    focusRoot();
  };

  const copy = async () => {
    const text = copyValue(state);
    if (!text) return;
    let ok = false;
    try {
      ok = await copyText(text);
    } catch {
      ok = false; // 클립보드가 막혀도 조용히 넘어간다
    }
    // copyText 의 대체 경로(숨은 textarea + execCommand)는 초점을 가져가므로 성공·실패와 상관없이 영역으로 되돌린다.
    focusRoot();
    if (!ok || !rootRef.current) return; // 실패하거나 그새 사라졌으면 표시하지 않는다
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const expr = exprText(state);

  return (
    <div
      ref={rootRef}
      className="mcm-calc"
      role="group"
      aria-label="계산기"
      aria-keyshortcuts={CALC_KEY_SHORTCUTS}
      tabIndex={0}
      style={style}
      onKeyDown={onKeyDown}
      data-testid="widget-calc"
    >
      <CalculatorStyle />
      <div className="mcm-calc__main">
        <div className="mcm-calc__display">
          <div className="mcm-calc__expr" data-testid="calc-expr">
            <span>{expr}</span>
          </div>
          <div className="mcm-calc__row">
            <div
              className={isError ? "mcm-calc__value mcm-calc__value--error" : "mcm-calc__value"}
              role="status"
              aria-live="polite"
              title={valueText}
              data-testid="calc-value"
            >
              <span>{valueText}</span>
            </div>
            <button
              type="button"
              className={copied ? "mcm-calc__copy mcm-calc__copy--done" : "mcm-calc__copy"}
              title="값 복사"
              aria-label="값 복사"
              disabled={isError}
              onMouseDown={keepFocus}
              onClick={() => void copy()}
              data-testid="calc-copy"
            >
              {copied ? <IconCheck size={14} aria-hidden="true" /> : <IconCopy size={14} aria-hidden="true" />}
            </button>
            <span className="mcm-calc__sr" role="status" aria-live="polite" data-testid="calc-copy-status">
              {copied ? COPIED_ANNOUNCE : ""}
            </span>
          </div>
        </div>
        <div className="mcm-calc__keys">
          {CALC_KEYS.map((k) => (
            <button
              key={k.id}
              type="button"
              tabIndex={-1}
              className={`mcm-calc__key mcm-calc__key--${k.kind}`}
              aria-label={k.aria}
              onMouseDown={keepFocus}
              onClick={() => dispatch(k.action)}
              data-testid={`calc-key-${k.id}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {showHistory && (
        <aside className="mcm-calc__history" aria-labelledby={historyTitleId} data-testid="calc-history">
          <h4 id={historyTitleId} className="mcm-calc__htitle">
            계산 기록
          </h4>
          {state.history.length === 0 ? (
            <div className="mcm-calc__hempty" data-testid="calc-history-empty">
              기록이 없습니다
            </div>
          ) : (
            <ul className="mcm-calc__hlist">
              {state.history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="mcm-calc__hitem"
                    title="이 결과를 불러옵니다"
                    onMouseDown={keepFocus}
                    onClick={() => {
                      dispatch({ type: "recall", value: h.result });
                      focusRoot(); // 키보드로 눌렀어도 바로 숫자 키를 쓸 수 있게
                    }}
                    data-testid="calc-history-item"
                  >
                    <span className="mcm-calc__hexpr">{h.expr} =</span>
                    <span className="mcm-calc__hres">{formatNumberText(h.result)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}
