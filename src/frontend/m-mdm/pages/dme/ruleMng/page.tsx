"use client";

/**
 * ruleMng — 룰 조회·등록(TSK-08-02). 정본: docs/mdm/screens/ruleMng/ruleMng_기능설계서.md.
 *
 * 목록은 서버 페이징(page 0 부터·size 20, I29)이고 룰 ID 를 누르면 룰 화면으로 간다(`@/dme/rule-handoff`, I28).
 * 배포 대상 칸·조건은 두지 않는다(D11).
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
import { Input } from "@dk-oasis/shared/form";
import { MdmPageLayout, badgeStyle } from "@/shell";
import { openRuleEdit } from "@/dme/rule-handoff";

import { searchRules } from "./api";
import { RuleRegisterForm } from "./components/RuleRegisterForm";
import {
  RULE_KIND_LABELS,
  RULE_PAGE_SIZE,
  RULE_STATUS_LABELS,
  emptyFilters,
  type RuleListRow,
  type RuleSearchFilters,
} from "./types";

const SCREEN_ID = "ruleMng";

const KIND_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "DECISION", label: RULE_KIND_LABELS.DECISION },
  { value: "DERIVE", label: RULE_KIND_LABELS.DERIVE },
];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "CREATED", label: RULE_STATUS_LABELS.CREATED },
  { value: "INUSE", label: RULE_STATUS_LABELS.INUSE },
  { value: "DEPRECATED", label: RULE_STATUS_LABELS.DEPRECATED },
];

function pendingText(row: RuleListRow): string {
  if (row.pendingVer == null) return "";
  const owner = row.pendingOwnerId ? ` · ${row.pendingOwnerId}` : "";
  return `${row.pendingVer} ${row.pendingStatus ?? ""}${owner}`.trim();
}

export default function RuleMngPage() {
  const rbac = useUserButtonRbac();
  const [filters, setFilters] = useState<RuleSearchFilters>(emptyFilters);
  const [applied, setApplied] = useState<RuleSearchFilters>(emptyFilters);
  const [rows, setRows] = useState<RuleListRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (f: RuleSearchFilters, pageNo: number) => {
    setIsBusy(true);
    try {
      const result = await searchRules(f, pageNo, RULE_PAGE_SIZE);
      setRows(result.list ?? []);
      setTotalCount(result.totalCount ?? 0);
      setPage(result.page ?? pageNo);
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
        key: "maruRuleId",
        header: "룰 ID",
        width: 170,
        minWidth: 110,
        render: (value) => (
          <button
            type="button"
            className="mdm-rule-link"
            data-testid={`rule-link-${String(value)}`}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-primary)",
              textDecoration: "underline",
              font: "inherit",
            }}
            onClick={() => openRuleEdit(String(value))}
          >
            {String(value)}
          </button>
        ),
      },
      { key: "maruRuleName", header: "룰명", width: 180, minWidth: 90 },
      {
        key: "ruleKind",
        header: "종류",
        width: 110,
        minWidth: 80,
        render: (value) => RULE_KIND_LABELS[value as keyof typeof RULE_KIND_LABELS] ?? String(value ?? ""),
      },
      { key: "sourceKind", header: "원천", width: 70, minWidth: 50, align: "center" },
      {
        key: "status",
        header: "상태",
        width: 80,
        minWidth: 60,
        align: "center",
        render: (value) => (
          <span style={badgeStyle(value === "INUSE" ? "success" : value === "DEPRECATED" ? "muted" : "neutral")}>
            {RULE_STATUS_LABELS[value as keyof typeof RULE_STATUS_LABELS] ?? String(value ?? "")}
          </span>
        ),
      },
      { key: "releasedVer", header: "적용 버전", width: 80, minWidth: 60, align: "center" },
      { key: "hitPolicy", header: "적중 정책", width: 90, minWidth: 70, align: "center" },
      { key: "pendingText", header: "미적용 버전", width: 180, minWidth: 90 },
    ],
    [],
  );

  const gridRows = useMemo(() => rows.map((r) => ({ ...r, pendingText: pendingText(r) })), [rows]);
  const totalPages = Math.max(1, Math.ceil(totalCount / RULE_PAGE_SIZE));

  return (
    <MdmPageLayout
      group="dme"
      screenId={SCREEN_ID}
      title="룰"
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: isBusy, action: "search" },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField label="룰 ID·명">
          <Input
            data-testid="rule-search-keyword"
            value={filters.keyword}
            placeholder="ID 또는 룰명"
            onChange={(v) => setFilters((p) => ({ ...p, keyword: v }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField
          label="종류"
          type="select"
          value={filters.ruleKind}
          options={KIND_FILTER_OPTIONS}
          onChange={(v) => setFilters((p) => ({ ...p, ruleKind: v }))}
        />
        <SearchField
          label="상태"
          type="select"
          value={filters.status}
          options={STATUS_FILTER_OPTIONS}
          onChange={(v) => setFilters((p) => ({ ...p, status: v }))}
        />
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel title="룰 목록" count={totalCount}>
            <AgDataGrid
              columnSizing="fit"
              columns={columns}
              data={gridRows}
              rowKey="maruRuleId"
              sortable={false}
              loading={isBusy}
              loadingMessage="조회 중..."
              emptyMessage="조회된 룰이 없습니다."
            />
          </GridPanel>
          {/* shared AgDataGrid 는 loading 해제 때 hideOverlay() 로 빈 행 오버레이까지 지우므로 빈 상태를 직접 적는다. */}
          {!isBusy && rows.length === 0 && (
            <p data-testid="rule-list-empty" style={{ margin: 0, padding: "var(--spacing-sm) var(--spacing-md)", color: "var(--color-text-muted)" }}>
              조회된 룰이 없습니다.
            </p>
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalCount}
            disabled={isBusy}
            onPageChange={(p) => void load(applied, p)}
          />
        </ContentPanel>

        <ContentPanel width={380}>
          <RuleRegisterForm
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
