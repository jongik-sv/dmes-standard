"use client";

import { Input } from "../components/form/Input";
import { Radio } from "../components/form/Radio";
import { Select } from "../components/form/Select";
import { useTabPage } from "../portal-shell/tab-page-context";
import { SearchHistoryInput } from "./SearchHistoryInput";
import { isSearchHistoryPage } from "./search-history-store";

export interface SearchFieldOption {
  value: string;
  label: string;
}

export interface SearchFieldProps {
  label: string;
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

  return (
    <div className={`search-field ${className}`.trim()}>
      <span className="search-field__label">{label}</span>
      {renderInput()}
    </div>
  );
}
