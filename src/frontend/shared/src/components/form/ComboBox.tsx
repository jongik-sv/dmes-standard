"use client";

import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
  type CSSProperties,
} from "react";
import { generateId } from "../../utils/libUtil";

export interface ComboBoxProps {
  /** 원본 데이터 배열 (string[] 또는 object[]) */
  data: any[];
  /** value로 사용할 필드명 (기본: "value") */
  valueField?: string;
  /** 표시 텍스트로 사용할 필드명 (기본: "label") */
  labelField?: string;
  /** 선택된 value */
  value?: string;
  /** 값 변경 콜백 (value, 원본 객체) */
  onChange?: (value: string, item?: any) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /**
   * Creatable 모드 활성화. 입력 텍스트가 기존 옵션과 일치하지 않을 때
   * 드롭다운 하단에 "+ '...' 신규 생성" 항목이 노출된다. 선택 시 호출됨.
   */
  onCreateNew?: (text: string) => void;
  /** Creatable 항목 라벨 포맷 (기본: `+ "{text}" 신규 생성`) */
  createLabel?: (text: string) => string;
  /**
   * 드롭다운에 한 번에 렌더할 최대 항목 수. 대용량(수만~수십만) 옵션을 받을 때
   * 초기 렌더/필터링이 폭주하지 않도록 캡을 둔다. 미지정 시 무제한.
   */
  maxVisible?: number;
}

interface ResolvedOption {
  value: string;
  label: string;
  raw: any;
}

function mergeDescribedBy(...values: Array<string | undefined>): string | undefined {
  const ids = values.flatMap((value) => value?.split(/\s+/) ?? []).filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}

function resolveOptions(data: any[], valueField: string, labelField: string): ResolvedOption[] {
  return data.map((item) => {
    if (typeof item === "string") {
      return { value: item, label: item, raw: item };
    }
    return {
      value: String(item[valueField] ?? ""),
      label: String(item[labelField] ?? item[valueField] ?? ""),
      raw: item,
    };
  });
}

export function ComboBox({
  data,
  valueField = "value",
  labelField = "label",
  value = "",
  onChange,
  placeholder = "",
  disabled = false,
  readOnly = false,
  error,
  id,
  className = "",
  style,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  onCreateNew,
  createLabel,
  maxVisible,
}: ComboBoxProps) {
  const comboId = useMemo(() => id || generateId("combo"), [id]);
  const listboxId = `${comboId}-listbox`;
  const errorId = `${comboId}-error`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const options = useMemo(
    () => resolveOptions(data, valueField, labelField),
    [data, valueField, labelField]
  );

  // value prop → input 표시 텍스트 동기화
  useEffect(() => {
    const found = options.find((o) => o.value === value);
    setInputText(found ? found.label : value ? "" : "");
  }, [value, options]);

  // 필터링된 옵션 + 캡 여부 — 한 번의 패스로 maxVisible 도달 시 즉시 종료하여
  // 대용량(수만~수십만) 옵션에서도 매 키스트로크 비용이 O(maxVisible) 로 고정된다.
  const { filtered, isCapped } = useMemo(() => {
    const keyword = inputText.toLowerCase();
    const cap = maxVisible ?? Infinity;
    const result: ResolvedOption[] = [];
    let truncated = false;
    for (const o of options) {
      if (keyword && !o.label.toLowerCase().includes(keyword)) continue;
      if (result.length >= cap) {
        truncated = true;
        break;
      }
      result.push(o);
    }
    return { filtered: result, isCapped: truncated };
  }, [options, inputText, maxVisible]);

  // creatable 항목 노출 여부: onCreateNew 가 설정되었고, 입력 텍스트가 기존 옵션과 정확히 일치하지 않을 때
  const showCreateItem = useMemo(() => {
    if (!onCreateNew) return false;
    const trimmed = inputText.trim();
    if (!trimmed) return false;
    return !options.some((o) => o.label === trimmed);
  }, [onCreateNew, inputText, options]);
  const createIndex = filtered.length; // create 항목 인덱스 (filtered 다음)

  // 하이라이트된 항목이 보이도록 스크롤
  useEffect(() => {
    if (!open || highlightIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightIndex] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setHighlightIndex(-1);
    // 닫힐 때 선택된 값의 label로 복원
    const found = options.find((o) => o.value === value);
    setInputText(found ? found.label : "");
  }, [value, options]);

  const selectOption = useCallback(
    (opt: ResolvedOption) => {
      setInputText(opt.label);
      setOpen(false);
      setHighlightIndex(-1);
      onChange?.(opt.value, opt.raw);
    },
    [onChange]
  );

  const triggerCreate = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setOpen(false);
      setHighlightIndex(-1);
      onCreateNew?.(trimmed);
    },
    [onCreateNew]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setOpen(true);
    setHighlightIndex(-1);
  };

  const handleFocus = () => {
    if (!disabled && !readOnly) {
      setInputText("");
      setOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || readOnly) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          const max = filtered.length + (showCreateItem ? 1 : 0) - 1;
          setHighlightIndex((prev) => (prev < max ? prev + 1 : 0));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) {
          const max = filtered.length + (showCreateItem ? 1 : 0) - 1;
          setHighlightIndex((prev) => (prev > 0 ? prev - 1 : max));
        }
        break;
      case "Enter":
        e.preventDefault();
        if (!open) break;
        if (showCreateItem && highlightIndex === createIndex) {
          triggerCreate(inputText);
        } else if (highlightIndex >= 0 && filtered[highlightIndex]) {
          selectOption(filtered[highlightIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        closeDropdown();
        break;
    }
  };

  const handleToggle = () => {
    if (disabled || readOnly) return;
    if (open) {
      closeDropdown();
    } else {
      setOpen(true);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`form-combobox ${error ? "form-error" : ""} ${className}`.trim()}
        style={style}
      >
        <input
          ref={inputRef}
          id={comboId}
          type="text"
          className="form-combobox-input"
          value={inputText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlightIndex >= 0 ? `${comboId}-opt-${highlightIndex}` : undefined
          }
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-invalid={ariaInvalid ?? !!error}
          aria-describedby={mergeDescribedBy(ariaDescribedBy, error ? errorId : undefined)}
        />
        <button
          type="button"
          className="form-combobox-toggle"
          tabIndex={-1}
          onClick={handleToggle}
          disabled={disabled}
          aria-label="Toggle dropdown"
        >
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {open && (
          <ul ref={listRef} id={listboxId} className="form-combobox-dropdown" role="listbox">
            {filtered.length > 0
              ? filtered.map((opt, idx) => (
                  <li
                    key={opt.value}
                    id={`${comboId}-opt-${idx}`}
                    className={`form-combobox-option${idx === highlightIndex ? " highlighted" : ""}${opt.value === value ? " selected" : ""}`}
                    role="option"
                    aria-selected={opt.value === value}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectOption(opt);
                    }}
                  >
                    {opt.label}
                  </li>
                ))
              : !showCreateItem && <li className="form-combobox-empty">No results</li>}
            {showCreateItem && (
              <li
                key="__create_new__"
                id={`${comboId}-opt-${createIndex}`}
                className={`form-combobox-option form-combobox-create${createIndex === highlightIndex ? " highlighted" : ""}`}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setHighlightIndex(createIndex)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  triggerCreate(inputText);
                }}
              >
                {(createLabel ?? ((t) => `+ "${t}" 신규 생성`))(inputText.trim())}
              </li>
            )}
            {isCapped && (
              <li key="__capped__" className="form-combobox-empty" aria-disabled="true">
                {`상위 ${maxVisible}개만 표시 — 더 좁히려면 입력하세요`}
              </li>
            )}
          </ul>
        )}
      </div>
      {error && (
        <span id={errorId} className="form-error-message" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
