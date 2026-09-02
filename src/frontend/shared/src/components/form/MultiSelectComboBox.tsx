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

export interface MultiSelectComboBoxProps {
  /** 원본 데이터 배열 (string[] 또는 object[]) */
  data: any[];
  /** value로 사용할 필드명 (기본: "value") */
  valueField?: string;
  /** 표시 텍스트로 사용할 필드명 (기본: "label") */
  labelField?: string;
  /** 선택된 value 배열 */
  value?: string[];
  /** 값 변경 콜백 */
  onChange?: (values: string[]) => void;
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

export function MultiSelectComboBox({
  data,
  valueField = "value",
  labelField = "label",
  value = [],
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
}: MultiSelectComboBoxProps) {
  const comboId = useMemo(() => id || generateId("mcombo"), [id]);
  const listboxId = `${comboId}-listbox`;
  const errorId = `${comboId}-error`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const options = useMemo(
    () => resolveOptions(data, valueField, labelField),
    [data, valueField, labelField]
  );

  const filtered = useMemo(() => {
    if (!filterText) return options;
    const keyword = filterText.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(keyword));
  }, [options, filterText]);

  // 하이라이트된 항목 스크롤
  useEffect(() => {
    if (!open || highlightIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightIndex] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  // 외부 클릭 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilterText("");
        setHighlightIndex(-1);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggleOption = useCallback(
    (optValue: string) => {
      const next = value.includes(optValue)
        ? value.filter((v) => v !== optValue)
        : [...value, optValue];
      onChange?.(next);
    },
    [value, onChange]
  );

  const removeTag = useCallback(
    (optValue: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled || readOnly) return;
      onChange?.(value.filter((v) => v !== optValue));
    },
    [value, onChange, disabled, readOnly]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
    if (!open) setOpen(true);
    setHighlightIndex(-1);
  };

  const handleContainerClick = () => {
    if (disabled || readOnly) return;
    if (!open) {
      setOpen(true);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || readOnly) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else setHighlightIndex((p) => (p < filtered.length - 1 ? p + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setHighlightIndex((p) => (p > 0 ? p - 1 : filtered.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (open && highlightIndex >= 0 && filtered[highlightIndex]) {
          toggleOption(filtered[highlightIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setFilterText("");
        setHighlightIndex(-1);
        break;
      case "Backspace":
        if (!filterText && value.length > 0) {
          onChange?.(value.slice(0, -1));
        }
        break;
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || readOnly) return;
    if (open) {
      setOpen(false);
      setFilterText("");
      setHighlightIndex(-1);
    } else {
      setOpen(true);
      inputRef.current?.focus();
    }
  };

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v))
    .filter(Boolean) as ResolvedOption[];

  return (
    <>
      <div
        ref={containerRef}
        className={`form-combobox form-multiselect ${error ? "form-error" : ""} ${className}`.trim()}
        style={{
          ...style,
          height: "auto",
          minHeight: "var(--form-height, 26px)",
          flexWrap: "wrap",
        }}
        onClick={handleContainerClick}
      >
        <div className="form-multiselect-tags">
          {selectedLabels.map((opt) => (
            <span key={opt.value} className="form-multiselect-tag">
              <span className="form-multiselect-tag-text">{opt.label}</span>
              {!disabled && !readOnly && (
                <button
                  type="button"
                  className="form-multiselect-tag-remove"
                  onClick={(e) => removeTag(opt.value, e)}
                  tabIndex={-1}
                  aria-label={`Remove ${opt.label}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          <input
            ref={inputRef}
            id={comboId}
            type="text"
            className="form-multiselect-input"
            value={filterText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ""}
            disabled={disabled}
            readOnly={readOnly}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={mergeDescribedBy(ariaDescribedBy, error ? errorId : undefined)}
            aria-invalid={ariaInvalid ?? !!error}
          />
        </div>
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
          <ul
            ref={listRef}
            id={listboxId}
            className="form-combobox-dropdown"
            role="listbox"
            aria-multiselectable="true"
          >
            {filtered.length > 0 ? (
              filtered.map((opt, idx) => {
                const checked = value.includes(opt.value);
                return (
                  <li
                    key={opt.value}
                    id={`${comboId}-opt-${idx}`}
                    className={`form-combobox-option form-multiselect-option${idx === highlightIndex ? " highlighted" : ""}${checked ? " selected" : ""}`}
                    role="option"
                    aria-selected={checked}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggleOption(opt.value);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      tabIndex={-1}
                      className="form-multiselect-checkbox"
                    />
                    {opt.label}
                  </li>
                );
              })
            ) : (
              <li className="form-combobox-empty">검색 결과 없음</li>
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
