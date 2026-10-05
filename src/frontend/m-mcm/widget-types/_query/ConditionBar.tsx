"use client";

/**
 * 쿼리 위젯 조회 조건 줄 — 위젯 본문 맨 위에 조건마다 라벨 + 입력 칸, 끝에 [검색].
 * 입력 칸은 입력 중인 값(draft)만 바꾸고, [검색]·Enter 가 확정한다(useQueryData). 입력 부품은 shared/form 것을 쓴다.
 * 조건이 없는 위젯은 아무것도 감싸지 않는다(QueryShell 이 children 만 돌려준다).
 */
import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button, DatePicker, Input, Select } from "@dk-oasis/shared/form";

import { PARAM_VALUE_MAX, QUERY_NEED_INPUT, type QueryParam } from "./format";
import type { QueryCondition } from "./useQueryData";

function ConditionField({ param, value, inputId, onChange }: { param: QueryParam; value: string; inputId: string; onChange: (value: string) => void }) {
  const label = param.label || param.name;
  const testId = `wq-cond-${param.name}-input`;
  let control: ReactNode;
  if (param.type === "select") {
    control = (
      <Select
        value={value}
        onChange={onChange}
        options={(param.options ?? []).map((o) => ({ value: o.value, label: o.label || o.value }))}
        placeholder="선택"
        id={inputId}
        aria-required={param.required || undefined}
        data-testid={testId}
      />
    );
  } else if (param.type === "date") {
    // DatePicker 는 aria-required 를 받지 않는다 — 필수는 라벨의 * 로 알린다.
    control = <DatePicker id={inputId} value={value} onChange={onChange} />;
  } else {
    control = (
      <Input
        type={param.type === "number" ? "number" : "text"}
        value={value}
        onChange={onChange}
        maxLength={PARAM_VALUE_MAX}
        id={inputId}
        aria-required={param.required || undefined}
        data-testid={testId}
      />
    );
  }
  return (
    <div className="wq-cond" data-testid={`wq-cond-${param.name}`}>
      <label className="wq-cond__label" htmlFor={inputId}>
        {label}
        {param.required && <span className="wq-cond__req">*</span>}
      </label>
      <div className="wq-cond__ctl">{control}</div>
    </div>
  );
}

export interface ConditionBarProps {
  condition: QueryCondition;
  /** 줄 높이(px)가 바뀔 때 알린다 — 차트처럼 본문 크기로 그림 높이를 정하는 위젯이 그 높이를 뺀다. 줄이 사라지면 0. */
  onHeight?: (height: number) => void;
}

/** 조건 줄 — 칸이 많으면 줄바꿈한다. Enter(글자·숫자·날짜·선택 칸)로도 검색한다. */
export function ConditionBar({ condition, onHeight }: ConditionBarProps) {
  const { params, draft, setDraft, search } = condition;
  const ref = useRef<HTMLDivElement>(null);
  const baseId = useId();

  // 그리기 전에 줄 높이를 재서 알린다(차트가 첫 그림부터 그 높이를 뺀다). 줄바꿈으로 높이가 바뀌면 ResizeObserver 가 다시 알린다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    const report = () => onHeight(el.offsetHeight);
    report();
    if (typeof ResizeObserver === "undefined") return () => onHeight(0);
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      onHeight(0);
    };
  }, [onHeight]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // keyCode 229 는 Safari 가 한글 조합 확정 Enter 에 쓴다(isComposing 이 이미 false).
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    // [검색] 단추의 Enter 는 단추 눌림으로 이미 검색된다.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      e.preventDefault();
      search();
    }
  };

  return (
    <div ref={ref} className="wq-cond-bar" role="search" onKeyDown={onKeyDown} data-testid="wq-cond-bar">
      {params.map((p) => (
        <ConditionField key={p.name} param={p} inputId={`${baseId}-${p.name}`} value={draft[p.name] ?? ""} onChange={(v) => setDraft(p.name, v)} />
      ))}
      <Button variant="primary" onClick={search} data-testid="wq-cond-search">
        검색
      </Button>
    </div>
  );
}

export interface QueryShellProps {
  condition: QueryCondition;
  onBarHeight?: (height: number) => void;
  children?: ReactNode;
}

/**
 * 본문 틀 — 조건이 있으면 위(조건 줄) + 아래(기존 본문 100% 높이)의 세로 flex 로 감싼다. 필수 값이 비어 있으면 아래에 안내를 보인다.
 * 조건이 없으면 감싸지 않아 모습·높이 계산이 이전과 같다.
 */
export function QueryShell({ condition, onBarHeight, children }: QueryShellProps) {
  if (condition.params.length === 0) return <>{children}</>;
  return (
    <div className="wq-shell" data-testid="wq-shell">
      <ConditionBar condition={condition} onHeight={onBarHeight} />
      <div className="wq-main">
        {condition.error ? (
          <div className="wq-empty wq-error" role="alert" data-testid="wq-error">
            {condition.error.message}
            <Button onClick={condition.error.retry} data-testid="wq-retry">
              다시 시도
            </Button>
          </div>
        ) : condition.needInput ? (
          <div className="wq-empty" role="status" data-testid="wq-need-input">
            {QUERY_NEED_INPUT}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
