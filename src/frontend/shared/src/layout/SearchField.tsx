"use client";

import React, { useContext, useRef } from "react";
import { Text } from "@mantine/core";
import { DatePicker } from "../components/form/DatePicker";
import { Input } from "../components/form/Input";
import { Radio } from "../components/form/Radio";
import { Select } from "../components/form/Select";
import { useIsomorphicLayoutEffect } from "../hooks/use-isomorphic-layout-effect";
import { MdmFieldLabel } from "../mdm-meta/MdmFieldLabel";
import { useTabPage } from "../portal-shell/tab-page-context";
import { SearchHistoryInput } from "./SearchHistoryInput";
import { isSearchHistoryPage } from "./search-history-store";
import {
  SearchDefaultsAreaContext,
  SearchFieldPairContext,
  type SearchDefaultsFieldHandle,
} from "./search-defaults/area";

export interface SearchFieldOption {
  value: string;
  label: string;
}

export interface SearchFieldProps {
  label: string;
  /**
   * MDM 컬럼 사전 키(화면 키 → 물리명, `MdmFieldLabel` 과 같은 규칙). 주면 사전에 있을 때 라벨에 마우스를 올리면 MDM 카드 툴팁이 뜬다.
   * 비우면 사전을 찾지 않고, 포털 탭 안에서는 라벨에 마우스를 올릴 때 라벨 글자 툴팁만 뜬다(공급자 밖은 예전과 DOM 이 같다). 사전에 없는 `name` 은 라벨 + 흐린 글자 `name` 툴팁이다. 필터 키(`edt_`·`cbo_`)에서 이름을 추론하지 않으므로 화면이 업무 키로 적는다.
   * 라벨 글자는 기본(`explicit`)에서 `label` 그대로이고, Radio name·최근 입력값 키(`historyKey` 가 없으면)도 `label` 을 쓴다.
   */
  name?: string;
  /** 명시 물리명(`name` 보다 우선). `false` 면 MDM 연결을 끈다. `name` 이 있을 때만 쓴다. */
  meta?: string | false;
  /**
   * 내장 입력 종류. `"date"` 는 shared DatePicker(`YYYY-MM-DD`)를 그린다.
   * `children` 이 있으면 그리기는 children 이 맡고, `type` 은 조회 기본값의 값 종류(상대 날짜를 쓸 수 있는지 등)로만 쓴다.
   */
  type?: "text" | "select" | "radio" | "date";
  /**
   * 값. 내장 입력의 값이고, `children` 칸에서 함께 주면(`onChange` 도 함께) 조회 기본값 대상이 된다 — 그리기는 children 그대로다.
   */
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
  /**
   * 조회 기본값 저장 키. 없으면 `name` 을 쓴다. 둘 다 없으면 이 칸은 기본값 대상이 아니다(label 은 키로 쓰지 않는다).
   * `name` 을 새로 달면 MDM 툴팁 동작이 바뀌므로, 툴팁 없이 기본값만 켤 칸은 이 prop 을 쓴다.
   */
  defaultKey?: string;
  /** false 면 이 칸은 조회 기본값 대상이 아니다(설정 창에 나오지 않고 넣지 않는다). 기본 true. */
  defaultable?: boolean;
  /**
   * 기준 칸 키(같은 SearchArea 칸의 `defaultKey ?? name`). 기준 칸 값이 바뀌면 SearchArea 가 이 칸을 코드 기본값으로 비우고
   * 사용자 기본값(설정 값·마지막 조회값)으로 다시 채운다. 화면은 조건을 직접 비우지 않는다(설계 2026-10-07-search-defaults §13).
   * 이 칸과 기준 칸 모두 value·onChange 를 준 등록 칸이어야 한다.
   */
  dependsOn?: string;
}

/**
 * SearchArea 의 조회 기본값 등록소에 이 칸을 올린다(설계 2026-10-07-search-defaults §6.1·§7.1).
 * 대상: 키(`defaultKey ?? name`, 기간 To 는 `{From 키}~to`)가 있고, `defaultable` 이 false 가 아니며,
 * 내장 입력이거나 children 칸에 `value`·`onChange` 를 함께 준 칸. 등록은 렌더 횟수를 늘리지 않는다(ref + layout effect).
 * 돌려주는 함수는 내장 입력의 onChange 를 감싸 「사용자가 고친 칸」 으로 표시한다.
 */
function useSearchDefaultsRegistration(props: {
  label: string;
  name?: string;
  meta?: string | false;
  type: "text" | "select" | "radio" | "date";
  value?: string;
  onChange?: (value: string) => void;
  options: readonly SearchFieldOption[];
  hasChildren: boolean;
  defaultKey?: string;
  defaultable: boolean;
  dependsOn?: string;
}): ((value: string) => void) | undefined {
  const api = useContext(SearchDefaultsAreaContext);
  const pair = useContext(SearchFieldPairContext);
  const { label, name, meta, type, value, onChange, options, hasChildren, defaultKey, defaultable, dependsOn } = props;

  const ownKey = defaultKey || name || null;
  const fieldKey = ownKey ?? (pair?.role === "to" && pair.partnerKey ? `${pair.partnerKey}~to` : null);
  const bound = hasChildren ? value !== undefined && !!onChange : !!onChange;
  const registrable = !!api && defaultable && !!fieldKey && bound;

  const valueRef = useRef(value ?? "");
  valueRef.current = value ?? "";
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleRef = useRef<SearchDefaultsFieldHandle | null>(null);
  if (registrable) {
    const info = {
      fieldKey: fieldKey as string,
      valueType: type,
      label,
      meta: typeof meta === "string" ? meta : name,
      options: type === "select" || type === "radio" ? options : undefined,
      pair: pair ? { role: pair.role, partnerKey: pair.partnerKey } : undefined,
      dependsOn,
    };
    if (!handleRef.current) {
      handleRef.current = {
        info,
        getValue: () => valueRef.current,
        setValue: (v) => onChangeRef.current?.(v),
        touched: false,
      };
    } else {
      handleRef.current.info = info;
    }
  }

  useIsomorphicLayoutEffect(() => {
    if (!registrable || !api || !handleRef.current) return undefined;
    return api.register(handleRef.current);
  }, [api, registrable, fieldKey]);

  if (!onChange) return undefined;
  if (!registrable || hasChildren) return onChange;
  return (v: string) => {
    if (handleRef.current) handleRef.current.touched = true;
    onChange(v);
  };
}

export function SearchField({
  label,
  name,
  meta,
  type = "text",
  value,
  onChange: rawOnChange,
  onKeyDown,
  options = [],
  placeholder,
  disabled = false,
  children,
  historyKey,
  disableHistory = false,
  className = "",
  defaultKey,
  defaultable = true,
  dependsOn,
}: SearchFieldProps) {
  const { pageId } = useTabPage();
  const handleChange = useSearchDefaultsRegistration({
    label,
    name,
    meta,
    type,
    value,
    onChange: rawOnChange,
    options,
    hasChildren: children != null,
    defaultKey,
    defaultable,
    dependsOn,
  });
  // 아래 내장 입력은 감싼 onChange(사용자가 고친 칸 표시)를 쓴다.
  const onChange = handleChange;

  const renderInput = () => {
    // 커스텀 입력(LookupTextField·날짜·콤보 등)은 그대로 — 최근 입력값 대상 아님.
    if (children) return children;

    if (type === "date") {
      return <DatePicker value={value ?? ""} onChange={onChange} disabled={disabled} placeholder={placeholder} />;
    }

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
        {/* name 이 없으면 사전을 찾지 않고(meta=false) 라벨 글자 툴팁만 — 공급자 밖에서는 단순 텍스트와 같은 DOM. */}
        <MdmFieldLabel name={name ?? label} meta={name ? meta : false} label={label} />
      </Text>
      {renderInput()}
    </div>
  );
}
