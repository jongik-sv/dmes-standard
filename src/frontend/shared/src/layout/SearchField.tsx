"use client";

import React from "react";
import { Text } from "@mantine/core";
import { Input } from "../components/form/Input";
import { Radio } from "../components/form/Radio";
import { Select } from "../components/form/Select";
import { MdmFieldLabel } from "../mdm-meta/MdmFieldLabel";
import { useTabPage } from "../portal-shell/tab-page-context";
import { SearchHistoryInput } from "./SearchHistoryInput";
import { isSearchHistoryPage } from "./search-history-store";

export interface SearchFieldOption {
  value: string;
  label: string;
}

export interface SearchFieldProps {
  label: string;
  /**
   * MDM 컬럼 사전 키(화면 키 → 물리명, `MdmFieldLabel` 과 같은 규칙). 주면 사전에 있을 때 라벨에 마우스를 올리면 MDM 카드 툴팁이 뜬다.
   * 비우면 예전과 DOM·동작이 같다. 필터 키(`edt_`·`cbo_`)에서 이름을 추론하지 않으므로 화면이 업무 키로 적는다.
   * 라벨 글자는 기본(`explicit`)에서 `label` 그대로이고, Radio name·최근 입력값 키(`historyKey` 가 없으면)도 `label` 을 쓴다.
   */
  name?: string;
  /** 명시 물리명(`name` 보다 우선). `false` 면 MDM 연결을 끈다. `name` 이 있을 때만 쓴다. */
  meta?: string | false;
  type?: "text" | "select" | "radio";
  value?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  options?: readonly SearchFieldOption[];
  placeholder?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  /**
   * 최근 입력값(드롭다운) 저장 키. 기본은 label.
   * 한 화면에 같은 label 의 텍스트칸이 둘 이상이면 충돌 방지를 위해 명시한다.
   */
  historyKey?: string;
  /** 이 칸은 최근 입력값 기능을 끈다(기본은 텍스트칸에서 자동 활성). */
  disableHistory?: boolean;
  /** 조회영역 grid 에서 셀 span 등 추가 클래스(예: 넓은 범위입력 = "span-2"). */
  className?: string;
}

export function SearchField({
  label,
  name,
  meta,
  type = "text",
  value,
  onChange,
  onKeyDown,
  options = [],
  placeholder,
  disabled = false,
  children,
  historyKey,
  disableHistory = false,
  className = "",
}: SearchFieldProps) {
  const { pageId } = useTabPage();

  const renderInput = () => {
    // 커스텀 입력(LookupTextField·날짜·콤보 등)은 그대로 — 최근 입력값 대상 아님.
    if (children) return children;

    if (type === "select") {
      return (
        <Select
          value={value ?? ""}
          onChange={onChange}
          options={options as { value: string; label: string }[]}
          disabled={disabled}
        />
      );
    }

    if (type === "radio") {
      return (
        <Radio
          name={label}
          value={value ?? ""}
          onChange={onChange}
          options={options as { value: string; label: string }[]}
          disabled={disabled}
        />
      );
    }

    // 자유 입력 텍스트칸: 최근 입력값 기능이 켜진 화면(APS)에서 자동으로 드롭다운 제공.
    const key = historyKey ?? label;
    const historyEnabled = !disableHistory && !!key && isSearchHistoryPage(pageId);
    if (historyEnabled) {
      return (
        <SearchHistoryInput
          value={value ?? ""}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          pageId={pageId}
          historyKey={key}
        />
      );
    }

    return (
      <Input
        type="text"
        value={value ?? ""}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  };

  /*
   * ★범위/복합 입력 자동 2칸 배치 (2026-08-07).
   *   조회영역이 CSS grid(1칸 = minmax(240px,…))로 바뀐 뒤, `<SearchField label="기간">` 안에
   *   [DatePicker][~][DatePicker] 처럼 입력을 여러 개 넣은 화면은 내용(라벨 76 + 입력 150×2 + 물결)이
   *   한 칸을 넘겨 오른쪽 칸의 라벨 위로 삐져나왔다(스크린샷: "2026-0" 위에 "CR코드" 겹침).
   *   SearchArea 의 자동 페어링은 `<SearchField label="~">` 를 별도로 둔 화면만 커버하므로,
   *   여기서 "자식 입력이 2개 이상" 인 복합 필드도 2칸을 차지하게 한다. 화면 수정 불요.
   */
  const isComposite =
    !!children && React.Children.toArray(children).filter((c) => React.isValidElement(c)).length > 1;
  const spanClass = isComposite && !/\bspan-\d\b/.test(className) ? "span-2" : "";

  return (
    <div className={`search-field ${spanClass} ${className}`.replace(/\s+/g, " ").trim()}>
      <Text size="xs" className="search-field__label">
        {name ? <MdmFieldLabel name={name} meta={meta} label={label} /> : label}
      </Text>
      {renderInput()}
    </div>
  );
}
