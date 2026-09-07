"use client";

import { useMemo, type CSSProperties } from "react";
import { TextInput } from "@mantine/core";
import { generateId } from "../../utils/libUtil";
import { LookupIconButton } from "./LookupIconButton";
import { shouldOpenLookupPopupFromKey } from "./lookup-shortcuts";

export interface LookupTextFieldProps {
  /** 입력값 (코드 또는 키워드). 호출 측이 controlled 로 관리. */
  value: string;
  /** 텍스트 변경 시 호출. */
  onChange: (value: string) => void;
  /** 엔터키 입력 시 호출 (조회 트리거). */
  onSearch?: () => void;
  /** 우측 내부 🔍 버튼 또는 F4 로 상세 팝업 열기. 현재 입력값을 초기 검색어로 함께 전달한다. */
  onOpenPopup?: (initialKeyword: string) => void;
  /** placeholder. 비어있을 때 안내문. */
  placeholder?: string;
  /** 비활성화. true 면 input + 팝업 버튼 모두 disabled. */
  disabled?: boolean;
  /** 읽기 전용. 입력은 막되 팝업 버튼은 활성 유지. */
  readOnly?: boolean;
  /** 외부 input id (label 연결 등). */
  id?: string;
  /** wrapper 너비 스타일. */
  style?: CSSProperties;
  /** wrapper className. */
  className?: string;
  /** 팝업 버튼 aria-label. default: "상세 검색". */
  buttonAriaLabel?: string;
}

/**
 * 텍스트 입력 + 우측 내부 🔍 버튼 한 줄 콤포넌트.
 *
 * 사용 시나리오 — 코드 (품목코드, 공정코드 등) 를 입력받는 위치에서
 * (a) 텍스트 입력 그대로 `LIKE 'text%'` 같은 prefix 검색에 사용하거나
 * (b) 🔍 버튼으로 상세 검색 팝업 (e.g. `ItemLookup`, `OperationLookup`) 을 열어
 *     검색 결과 행을 골라 value 를 채워주는 두 가지 입력 경로를 제공.
 *
 * 의도적으로 가벼운 wrapper: 팝업 자체는 외부 (호출 측) 가 LookupModal 기반으로 띄우고,
 * 본 컴포넌트는 onOpenPopup 콜백만 노출.
 */
export function LookupTextField({
  value,
  onChange,
  onSearch,
  onOpenPopup,
  placeholder = "",
  disabled = false,
  readOnly = false,
  id,
  style,
  className = "",
  buttonAriaLabel = "상세 검색",
}: LookupTextFieldProps) {
  const inputId = useMemo(() => id || generateId("lookup-text"), [id]);

  return (
    <div
      className={`cm-lookup-text-field ${className}`.trim()}
      // ★폭은 inline 으로 박지 않는다(2026-07-31) — 조회영역(grid 셀)에서 wrapper 가 셀 폭으로 늘어나
      //   내부 절대배치 팝업 버튼이 입력칸 밖으로 밀리던 회귀의 원인. 기본 100% 는 form.css
      //   (.cm-lookup-text-field) 가 담당하고, 조회영역에선 page-layout.css 가 입력 고정폭으로 좁힌다.
      style={{
        position: "relative",
        display: "inline-block",
        ...style,
      }}
    >
      <TextInput
        id={inputId}
        classNames={{ input: "form-input" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (shouldOpenLookupPopupFromKey(e, { disabled, hasOpenPopup: Boolean(onOpenPopup) })) {
            e.preventDefault();
            e.stopPropagation();
            onOpenPopup?.(value);
            return;
          }

          if (e.key === "Enter") {
            e.preventDefault();
            onSearch?.();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        // 우측 내부 버튼 영역만큼 padding-right 확보(rightSectionWidth 로 폭 지정).
        rightSectionWidth={26}
        rightSection={
          onOpenPopup && (
            <LookupIconButton
              onClick={() => onOpenPopup(value)}
              disabled={disabled}
              ariaLabel={buttonAriaLabel}
              style={{ width: 24, height: "auto" }}
            />
          )
        }
      />
    </div>
  );
}
