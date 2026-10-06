"use client";

import { useState, useRef, useEffect } from "react";

/**
 * datetime-local 인라인 셀 편집기.
 * 표시값("YYYY-MM-DD HH:mm")을 받아 datetime-local 위젯으로 편집한 뒤
 * ISO 초단위("YYYY-MM-DDTHH:mm:00") 문자열로 반환한다(미입력 시 빈 문자열).
 */
export const DateTimeCellEditor = function DateTimeCellEditor(
  // ★ag-grid v33 계약: 값 전달 = onValueChange(레거시 forwardRef getValue() 는 v33이 읽지 않음).
  props: { value?: unknown; onValueChange?: (value: unknown) => void }
) {
  const initial =
    typeof props.value === "string" && props.value
      ? props.value.slice(0, 16).replace(" ", "T")
      : "";
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    // 초기값도 v33 계약으로 밀어둔다(미변경 종료 시 undefined 커밋 방지).
    props.onValueChange?.(initial ? `${initial}:00` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <input
      ref={inputRef}
      type="datetime-local"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        props.onValueChange?.(e.target.value ? `${e.target.value}:00` : "");
      }}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        padding: "0 8px",
        boxSizing: "border-box",
        font: "inherit",
      }}
    />
  );
};

/**
 * 행별 라벨 select 인라인 셀 편집기 — `cellEditorOptionsGetter` 전용.
 *
 * ★배경: ag-grid 기본 agSelectCellEditor 의 라벨 경로(refData)는 **컬럼 단위 전역 맵**이라,
 *   같은 키가 행마다 다른 라벨을 가지는 경우(예: 렉번호 R01 이 창고마다 다른 렉명) 라벨이 충돌한다.
 *   이 편집기는 편집 시작 시점의 행(row)으로 {value,label} 옵션을 계산해 행별 라벨을 정확히 표시한다.
 *   선택 즉시 편집을 종료(commit)해 agSelectCellEditor 와 동일한 UX 를 유지한다.
 */
export const SelectCellEditor = function SelectCellEditor(props: {
  value?: unknown;
  options?: { value: string; label: string }[];
  // ★ag-grid v33 커스텀 에디터 계약: 값 전달 = onValueChange(레거시 forwardRef getValue() 는 v33이 읽지 않음
  //   → 선택해도 undefined 커밋 = 빈칸 버그의 원인). stopEditing 도 props 로 직접 온다.
  onValueChange?: (value: unknown) => void;
  stopEditing?: (suppressNavigateAfterEdit?: boolean) => void;
  api?: { stopEditing?: (cancel?: boolean) => void };
}) {
  const valueRef = useRef(String(props.value ?? ""));
  const [value, setValue] = useState(valueRef.current);
  const selRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const el = selRef.current;
    if (!el) return;
    el.focus();
    // ★단일 클릭에 드롭다운이 바로 열리도록 — 편집 진입(클릭 제스처) 직후 네이티브 피커를 연다.
    //   showPicker 미지원/사용자활성화 제약 시엔 조용히 무시(포커스만 유지).
    try {
      (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      /* noop */
    }
  }, []);
  const options = props.options ?? [];
  // 현재 값이 후보에 없으면(옵션 미로드 등) 임시 항목으로 유지해 값 소실을 방지.
  const hasCurrent = options.some((o) => o.value === valueRef.current);
  return (
    <select
      ref={selRef}
      value={value}
      onChange={(e) => {
        valueRef.current = e.target.value;
        setValue(e.target.value);
        props.onValueChange?.(e.target.value); // ★v33: 그리드에 값 커밋
        (props.stopEditing ?? props.api?.stopEditing)?.();
      }}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        padding: "0 6px",
        boxSizing: "border-box",
        font: "inherit",
        background: "inherit",
      }}
    >
      {!hasCurrent ? <option value={valueRef.current}>{valueRef.current}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};
