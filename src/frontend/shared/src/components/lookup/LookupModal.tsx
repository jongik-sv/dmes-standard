"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { NativeSelect, TextInput } from "@mantine/core";
import { Modal } from "../modal";
import { Button } from "../form";
import { AgDataGrid, Pagination, type GridColumn, type GridPersonalizeOptions } from "../grid";

export interface LookupRow {
  code: string;
  name: string;
}

/** fetchFn 이 돌려주는 한 페이지 분량의 결과. */
export interface LookupPageResult {
  /** 현재 페이지에 표시할 행. */
  rows: LookupRow[];
  /** (필터 적용 후) 전체 건수 — 페이지네이션 계산용. */
  totalElements: number;
}

/** 룩업별 조회조건(필터) 정의 — 키워드 외 도메인 고유 필터를 셸에 붙일 때 사용. */
export interface LookupFilterOption {
  value: string;
  label: string;
}
export interface LookupFilter {
  /** fetchFn params.filters 에 담길 키. */
  key: string;
  /** 라벨(placeholder/드롭다운 앞 표기). */
  label: string;
  /** select(드롭다운) 또는 text(입력). 기본: options 있으면 select, 없으면 text. */
  type?: "select" | "text";
  /** select 옵션. 보통 맨 앞에 { value:"", label:"전체" } 를 둔다. */
  options?: LookupFilterOption[];
  /** 초기값. */
  defaultValue?: string;
  /** text 타입 placeholder. */
  placeholder?: string;
  /** 컨트롤 폭(px). 기본 130. */
  width?: number;
}

/**
 * 키워드 + 필터 + 0-based 페이지 + 페이지 크기를 받아 한 페이지를 반환.
 * 도메인별 API/필터/페이징은 호출 측이 fetchFn 안에서 책임진다.
 * - BE 가 keyword/필터 + page/size 를 지원하면 그대로 푸시다운(true server-side).
 * - BE 가 미지원이면 fetchFn 내부에서 전체 조회 → FE 필터 → slice 해서 같은 계약을 만족시킨다.
 * - {@code filters} 는 호출 측이 넘긴 {@code LookupModalProps.filters} 의 현재값(key→value) 맵.
 */
export type LookupFetchFn = (params: {
  keyword: string;
  page: number;
  size: number;
  filters: Record<string, string>;
  signal?: AbortSignal;
}) => Promise<LookupPageResult>;

export interface LookupModalProps {
  open: boolean;
  title: string;
  /** 키워드/필터/페이지/크기를 받아 {rows, totalElements} 를 반환. */
  fetchFn: LookupFetchFn;
  /** 행 확정 시 호출. 호출 측이 코드/명을 화면에 반영. */
  onSelect: (row: LookupRow) => void;
  /** 모달 닫기 (취소 / 백드롭 / ESC / 확인 후 자동닫힘 공통). */
  onClose: () => void;
  /** 검색 입력 placeholder. */
  placeholder?: string;
  /** 모달이 열릴 때 검색 입력에 먼저 채울 값. */
  initialKeyword?: string;
  /** 룩업 고유 조회조건. 지정 시 키워드 앞에 필터 컨트롤을 렌더하고 값을 fetchFn 에 전달. */
  filters?: LookupFilter[];
  /** true 면 열리는 즉시 initialKeyword·필터 기본값으로 첫 페이지를 조회한다. 기본은 조회 버튼을 눌러야 조회. */
  searchOnOpen?: boolean;
  /**
   * 안쪽 그리드의 컬럼 개인화 저장 이름(AgDataGrid `gridId`). 기본 `"lookup"`. 한 화면에서 룩업을 여럿 쓰면 호출처마다 다른 이름
   * (예: `"modal-user"`)을 준다. 서버 페이징이라 정렬은 저장하지 않는다.
   */
  gridId?: string;
}

const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 200 },
  { key: "name", header: "명", width: 320 },
];

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 200];
const GRID_HEIGHT = 320;
/** 그리드가 표 위에 그리는 머리줄(그리드명·건수·설정 메뉴) 높이 — 숫자 height 는 표 높이라 고정 높이 상자(GRID_HEIGHT)에 맞추려면 뺀다. */
const GRID_HEADER_HEIGHT = 34;
const LOOKUP_PERSONALIZE: GridPersonalizeOptions = { sort: false };

const FIELD_WRAP_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const FIELD_LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  letterSpacing: "0.02em",
};

function buildDefaultFilterValues(filters?: LookupFilter[]): Record<string, string> {
  const v: Record<string, string> = {};
  (filters ?? []).forEach((f) => {
    v[f.key] = f.defaultValue ?? "";
  });
  return v;
}

export function LookupModal({
  open,
  title,
  fetchFn,
  onSelect,
  onClose,
  placeholder = "코드 또는 명 입력",
  initialKeyword = "",
  filters,
  searchOnOpen = false,
  gridId = "lookup",
}: LookupModalProps) {
  const [keyword, setKeyword] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() =>
    buildDefaultFilterValues(filters),
  );
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<LookupRow | null>(null);

  // fetchFn 은 호출 측에서 매 렌더 새 인스턴스로 내려오므로 ref 로 최신본을 들고
  // runQuery 를 stable 하게 유지(페이지 이동 콜백의 stale closure 방지). filters 도 동일.
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!open) {
      generationRef.current += 1;
      requestRef.current?.abort();
      return;
    }

    setKeyword(initialKeyword);
    setFilterValues(buildDefaultFilterValues(filtersRef.current));
    setRows([]);
    setTotal(0);
    setPage(0);
    setSelected(null);

    const timer = window.setTimeout(() => {
      keywordInputRef.current?.focus();
      keywordInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      generationRef.current += 1;
      requestRef.current?.abort();
    };
  }, [open, initialKeyword]);

  const runQuery = useCallback(
    async (kw: string, targetPage: number, size: number, fvals: Record<string, string>) => {
      const generation = ++generationRef.current;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      try {
        const result = await fetchRef.current({
          keyword: kw,
          page: targetPage,
          size,
          filters: fvals,
          signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        setRows(result.rows);
        setTotal(result.totalElements);
        setPage(targetPage);
        setSelected(null);
      } catch (error) {
        if (
          generation !== generationRef.current ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          return;
        }
        console.warn("Lookup 조회 실패:", error);
        setRows([]);
        setTotal(0);
        setSelected(null);
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  // 열림 직후 자동 조회. 위 open effect 가 상태를 초기화한 뒤 같은 커밋에서 실행되며,
  // 닫힘·재조회 시 generation/abort 가드가 늦게 도착한 응답을 버린다.
  useEffect(() => {
    if (!open || !searchOnOpen) return;
    setPageSize(DEFAULT_PAGE_SIZE);
    runQuery(initialKeyword, 0, DEFAULT_PAGE_SIZE, buildDefaultFilterValues(filtersRef.current));
  }, [open, searchOnOpen, initialKeyword, runQuery]);

  const handleSearch = useCallback(() => {
    runQuery(keyword, 0, pageSize, filterValues);
  }, [runQuery, keyword, pageSize, filterValues]);

  // 필터(드롭다운/텍스트) 값 변경 시 값 갱신. select 는 즉시 재조회해 UX 를 매끄럽게 한다.
  const handleFilterChange = useCallback(
    (key: string, value: string, autoSearch: boolean) => {
      const next = { ...filterValues, [key]: value };
      setFilterValues(next);
      if (autoSearch) {
        runQuery(keyword, 0, pageSize, next);
      }
    },
    [filterValues, runQuery, keyword, pageSize],
  );

  const handlePageChange = useCallback(
    (next: number) => {
      runQuery(keyword, next, pageSize, filterValues);
    },
    [runQuery, keyword, pageSize, filterValues]
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      runQuery(keyword, 0, size, filterValues);
    },
    [runQuery, keyword, filterValues]
  );

  const handleConfirm = useCallback(() => {
    if (!selected) return;
    onSelect(selected);
    onClose();
  }, [selected, onSelect, onClose]);

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  return (
    <Modal open={open} title={title} onClose={onClose} size="md">
      {/* 그리드 자체의 라운드 모서리를 모달 안에서 직각으로 통일 — 헤더/셀과 시각적 일관성 확보.
          ag-grid 의 .ag-root-wrapper 가 자체 border-radius 를 가져 cm-data-grid 만 덮어도 잔존하므로
          !important + 자손 wrapper 까지 함께 0 으로 강제. */}
      <style>{`
        .cm-lookup-grid .cm-data-grid,
        .cm-lookup-grid .ag-root-wrapper,
        .cm-lookup-grid .ag-root,
        .cm-lookup-grid .ag-header,
        .cm-lookup-grid .ag-header-cell {
          border-radius: 0 !important;
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 420 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 10,
            padding: "12px 14px",
            background: "#f8fafc",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
          }}
        >
          {(filters ?? []).map((f) => {
            const isSelect = f.type === "select" || (!f.type && !!f.options);
            const width = f.width ?? 130;
            return (
              <div key={f.key} style={FIELD_WRAP_STYLE}>
                <span style={FIELD_LABEL_STYLE}>{f.label}</span>
                {isSelect ? (
                  <NativeSelect
                    value={filterValues[f.key] ?? ""}
                    onChange={(e) => handleFilterChange(f.key, e.target.value, true)}
                    data={(f.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
                    style={{ width }}
                  />
                ) : (
                  <TextInput
                    value={filterValues[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => handleFilterChange(f.key, e.target.value, false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearch();
                      }
                    }}
                    style={{ width }}
                  />
                )}
              </div>
            );
          })}
          <div style={{ ...FIELD_WRAP_STYLE, flex: 1, minWidth: 200 }}>
            <span style={FIELD_LABEL_STYLE}>검색어</span>
            <TextInput
              ref={keywordInputRef}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder={placeholder}
              style={{ width: "100%" }}
            />
          </div>
          <Button onClick={handleSearch} disabled={loading} variant="primary">
            {loading ? "조회중..." : "조회"}
          </Button>
        </div>
        <div className="cm-lookup-grid" style={{ height: GRID_HEIGHT }}>
          <AgDataGrid
            // 화면 위에 뜨는 모달이라 본 화면 그리드("main")와 저장을 나눈다. 서버 페이징이라 정렬은 저장하지 않는다.
            gridId={gridId}
            personalize={LOOKUP_PERSONALIZE}
            columns={COLUMNS}
            data={rows as unknown as Record<string, unknown>[]}
            rowKey="code"
            height={GRID_HEIGHT - GRID_HEADER_HEIGHT}
            highlightedRowKey={selected?.code ?? null}
            onRowClick={(row) => setSelected(row as unknown as LookupRow)}
            onRowDoubleClick={(row) => {
              const r = row as unknown as LookupRow;
              onSelect(r);
              onClose();
            }}
            sizeToFit
          />
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          totalElements={total}
          onPageChange={handlePageChange}
          disabled={loading}
          align="center"
          showFirstLast
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={handlePageSizeChange}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onClose}>취소</Button>
          <Button onClick={handleConfirm} disabled={!selected} variant="primary">
            확인
          </Button>
        </div>
      </div>
    </Modal>
  );
}
