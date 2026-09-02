"use client";

import { memo } from "react";

export interface PaginationProps {
  /** 0-based 현재 페이지 인덱스 */
  page: number;
  /** 전체 페이지 수 (>= 1). 0 이면 페이지네이션 자체 렌더 안 함 */
  totalPages: number;
  /** 전체 항목 수. 제공 시 "총 N건" 표기 */
  totalElements?: number;
  /** 페이지 변경 콜백 (0-based) */
  onPageChange: (page: number) => void;
  /** 로딩 중 등 임시 비활성화 */
  disabled?: boolean;
  /** 페이지 정보 + 버튼 정렬. 기본 "right" */
  align?: "left" | "center" | "right";
  /** 첫/마지막 페이지 점프 버튼 표시. 기본 false */
  showFirstLast?: boolean;
  /** 페이지 크기. 표시는 안 하고, 부모가 size 변경 콜백을 받고 싶을 때만 사용. */
  pageSize?: number;
  /** 페이지 크기 선택 옵션. 비어있으면 size 선택 UI 숨김. */
  pageSizeOptions?: number[];
  /** 페이지 크기 변경 콜백 (제공 시 size 선택 표시) */
  onPageSizeChange?: (size: number) => void;
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  minWidth: 32,
  padding: "2px 10px",
  border: "1px solid #d0d5dd",
  borderRadius: 4,
  background: disabled ? "#f5f5f5" : "#fff",
  color: disabled ? "#bbb" : "#444",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  lineHeight: "20px",
});

const justifyByAlign: Record<NonNullable<PaginationProps["align"]>, React.CSSProperties["justifyContent"]> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/**
 * 공통 페이지네이션 컴포넌트.
 *
 * 그리드 또는 목록 컨테이너의 하단 footer 로 사용한다. 디자인은 다음과 같다.
 *   `[«] [‹] 1 / 5 페이지 · 총 100건 [›] [»]` — showFirstLast=true
 *   `1 / 5 페이지 · 총 100건 [이전] [다음]`     — 기본
 */
export const Pagination = memo(function Pagination({
  page,
  totalPages,
  totalElements,
  onPageChange,
  disabled = false,
  align = "right",
  showFirstLast = false,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) {
  if (totalPages <= 0) return null;

  const isFirst = page <= 0;
  const isLast = page >= totalPages - 1;
  const canPrev = !disabled && !isFirst;
  const canNext = !disabled && !isLast;

  const showSizeSelect =
    !!onPageSizeChange && Array.isArray(pageSizeOptions) && pageSizeOptions.length > 0 && pageSize != null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: justifyByAlign[align],
        gap: 8,
        padding: "6px 8px",
        borderTop: "1px solid #e5e7eb",
        fontSize: 12,
      }}
    >
      {showSizeSelect && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#6b7280" }}>
          페이지당
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            disabled={disabled}
            style={{
              padding: "2px 4px",
              border: "1px solid #d0d5dd",
              borderRadius: 4,
              fontSize: 12,
              background: "#fff",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {pageSizeOptions!.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      <span style={{ color: "#6b7280" }}>
        {page + 1} / {totalPages} 페이지
        {typeof totalElements === "number" ? ` · 총 ${totalElements.toLocaleString()}건` : ""}
      </span>

      {showFirstLast && (
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => canPrev && onPageChange(0)}
          style={btnStyle(!canPrev)}
          aria-label="첫 페이지"
          title="첫 페이지"
        >
          «
        </button>
      )}
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => canPrev && onPageChange(page - 1)}
        style={btnStyle(!canPrev)}
      >
        이전
      </button>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => canNext && onPageChange(page + 1)}
        style={btnStyle(!canNext)}
      >
        다음
      </button>
      {showFirstLast && (
        <button
          type="button"
          disabled={!canNext}
          onClick={() => canNext && onPageChange(totalPages - 1)}
          style={btnStyle(!canNext)}
          aria-label="마지막 페이지"
          title="마지막 페이지"
        >
          »
        </button>
      )}
    </div>
  );
});

export default Pagination;
