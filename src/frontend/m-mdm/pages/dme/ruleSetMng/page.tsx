"use client";

/**
 * ruleSetMng — 룰 세트 조회·등록(TSK-08-06). 정본: docs/mdm/screens/ruleSetMng/ruleSetMng_기능설계서.md, design §6.11.
 *
 * 목록은 서버 페이징(page 0 부터·size 20)이고 최종 결과 변수·입력 변수 수·세트 검사는 서버가 조회 때 계산한 값이다(저장하지 않는다).
 * 세트 ID 를 누르거나 등록에 성공하면 룰 세트 편집 탭을 그 세트로 연다(`openMdmPage("dme/ruleSetEdit", {setId})`, I22).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  ErrorModal,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, Pagination, type GridColumn } from "@dk-oasis/shared/grid";
import { Input, Select } from "@dk-oasis/shared/form";
import { MdmPageLayout, badgeStyle, openMdmPage } from "@/shell";

import { searchSets } from "./api";
import { RuleSetRegisterForm } from "./components/RuleSetRegisterForm";
import {
  RULE_SET_PAGE_SIZE,
  emptyFilters,
  setCheckText,
  type RuleSetListRow,
  type RuleSetSearchFilters,
} from "./types";

const SCREEN_ID = "ruleSetMng";
const EDIT_PAGE = "dme/ruleSetEdit";

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "INUSE", label: "INUSE" },
  { value: "DEPRECATED", label: "DEPRECATED" },
];

export default function RuleSetMngPage() {
  const rbac = useUserButtonRbac();
  const [filters, setFilters] = useState<RuleSetSearchFilters>(emptyFilters);
  const [applied, setApplied] = useState<RuleSetSearchFilters>(emptyFilters);
  const [rows, setRows] = useState<RuleSetListRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (f: RuleSetSearchFilters, pageNo: number) => {
    setIsBusy(true);
    try {
      const result = await searchSets(f, pageNo, RULE_SET_PAGE_SIZE);
      setRows(result.rows ?? []);
      setTotalCount(result.totalCount ?? 0);
      setPage(pageNo);
      setApplied(f);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(emptyFilters(), 0);
  }, [load]);

  const handleSearch = useCallback(() => void load(filters, 0), [filters, load]);

  const columns = useMemo<GridColumn[]>(
    () => [
      {
        key: "setId",
        header: "세트 ID",
        width: 170,
        minWidth: 110,
        render: (value) => (
          <button
            type="button"
            data-testid={`set-link-${String(value)}`}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-primary)",
              textDecoration: "underline",
              font: "inherit",
            }}
            onClick={() => openMdmPage(EDIT_PAGE, { setId: String(value) })}
          >
            {String(value)}
          </button>
        ),
      },
      { key: "setName", header: "세트명", width: 180, minWidth: 90 },
      { key: "ruleCount", header: "룰 수", width: 70, minWidth: 50, align: "center" },
      {
        key: "finalResults",
        header: "최종 결과 변수",
        width: 180,
        minWidth: 100,
        render: (value) => {
          const names = Array.isArray(value) ? (value as string[]) : [];
          if (names.length === 0) return "-";
          return names.map((n) => (
            <code key={n} style={{ marginRight: 6 }}>
              {n}
            </code>
          ));
        },
      },
      { key: "inputCount", header: "입력 변수 수", width: 90, minWidth: 60, align: "center" },
      { key: "description", header: "설명", width: 200, minWidth: 90 },
      { key: "checkText", header: "세트 검사", width: 130, minWidth: 80, align: "center" },
      {
        key: "status",
        header: "상태",
        width: 100,
        minWidth: 70,
        align: "center",
        render: (value) => (
          <span style={badgeStyle(value === "INUSE" ? "success" : "muted")}>{String(value ?? "")}</span>
        ),
      },
    ],
    [],
  );

  const gridRows = useMemo(() => rows.map((r) => ({ ...r, checkText: setCheckText(r) })), [rows]);
  const totalPages = Math.max(1, Math.ceil(totalCount / RULE_SET_PAGE_SIZE));

  return (
    <MdmPageLayout
      group="dme"
      screenId={SCREEN_ID}
      title="룰 세트"
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: isBusy, action: "search" },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField label="세트">
          <Input
            data-testid="set-search-keyword"
            value={filters.keyword}
            placeholder="ID 또는 세트명"
            onChange={(v) => setFilters((p) => ({ ...p, keyword: v }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField label="담은 룰">
          <Input
            data-testid="set-search-rule"
            value={filters.ruleId}
            placeholder="룰 ID"
            onChange={(v) => setFilters((p) => ({ ...p, ruleId: v }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField label="결과 변수">
          <Input
            data-testid="set-search-var"
            value={filters.resultVar}
            placeholder="예: LINE_SPD"
            onChange={(v) => setFilters((p) => ({ ...p, resultVar: v }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField label="상태">
          <Select
            data-testid="set-search-status"
            value={filters.status}
            options={STATUS_FILTER_OPTIONS}
            onChange={(v) => setFilters((p) => ({ ...p, status: v }))}
          />
        </SearchField>
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel title="룰 세트 목록" count={totalCount}>
            <div data-testid="set-list" style={{ position: "absolute", inset: 0 }}>
              <AgDataGrid
                columnSizing="fit"
                columns={columns}
                data={gridRows}
                rowKey="setId"
                sortable={false}
                loading={isBusy}
                loadingMessage="조회 중..."
                emptyMessage="조건에 맞는 룰 세트가 없다"
              />
            </div>
          </GridPanel>
          {/* shared AgDataGrid 는 loading 해제 때 hideOverlay() 로 빈 행 오버레이까지 지우므로 빈 상태를 직접 적는다. */}
          {!isBusy && rows.length === 0 && (
            <p data-testid="set-list-empty" style={{ margin: 0, padding: "var(--spacing-sm) var(--spacing-md)", color: "var(--color-text-muted)" }}>
              조건에 맞는 룰 세트가 없다
            </p>
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalCount}
            disabled={isBusy}
            onPageChange={(p) => void load(applied, p)}
          />
          <p style={{ margin: 0, padding: "var(--spacing-sm) var(--spacing-md)", color: "var(--color-text-muted)" }}>
            결과 변수로 찾으면 그 변수를 만드는 룰을 담은 세트가 나온다(중간 결과 포함). 최종 결과 변수·입력 변수 수·세트 검사는 룰마다 지금
            RELEASED 인 버전으로 계산하고 저장하지 않는다. 룰이 폐기되거나 새 버전이 나오면 저장된 세트도 거부로 바뀔 수 있다.
          </p>
        </ContentPanel>

        <ContentPanel width={380}>
          <RuleSetRegisterForm
            canRegister={canDoButton(rbac, SCREEN_ID, "reg")}
            onRegistered={() => void load(applied, 0)}
            onError={setErrorMessage}
          />
        </ContentPanel>
      </ContentBody>

      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
