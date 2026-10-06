"use client";

/**
 * ruleSetMng — 룰 세트 조회·등록(TSK-08-06). 정본: docs/mdm/screens/ruleSetMng/ruleSetMng_기능설계서.md, design §6.11.
 *
 * 목록은 서버 페이징(page 0 부터·size 20)이고 최종 결과 변수·입력 변수 수·세트 검사는 서버가 조회 때 계산한 값이다(저장하지 않는다).
 * 세트 ID 를 누르거나 등록에 성공하면 룰 세트 편집 탭을 그 세트로 연다(`openMdmPage("dme/ruleSetEdit", {setId})`, I22).
 */
import { useCallback, useMemo, useState } from "react";

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
import { useCarryRefetch, useCarryState } from "@dk-oasis/shared/portal-shell";
import { MdmPageLayout, openMdmPage } from "@/shell";

import { searchSets } from "./api";
import { buildRuleSetColumns } from "./columns";
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
  { value: "CREATED", label: "CREATED" },
  { value: "INUSE", label: "INUSE" },
  { value: "DEPRECATED", label: "DEPRECATED" },
];

export default function RuleSetMngPage() {
  const rbac = useUserButtonRbac();
  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·마지막 조회 조건·조회 결과(bulky)·건수·쪽.
  const [filters, setFilters] = useCarryState<RuleSetSearchFilters>("filters", emptyFilters);
  const [applied, setApplied] = useCarryState<RuleSetSearchFilters>("applied", emptyFilters);
  const [rows, setRows] = useCarryState<RuleSetListRow[]>("rows", [], { bulky: true });
  const [totalCount, setTotalCount] = useCarryState("totalCount", 0);
  const [page, setPage] = useCarryState("page", 0);
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
  }, [setRows, setTotalCount, setPage, setApplied]);

  // 첫 진입 자동 조회 없음 — [조회] 버튼으로만 조회(2026-10-02 사용자 요청)
  // 분리 창이 조회 결과(행)를 못 받았을 때만 이어받은 조건·쪽으로 한 번 다시 조회한다(조회 안 한 탭은 재조회하지 않는다).
  useCarryRefetch(() => load(applied, page));

  const handleSearch = useCallback(() => void load(filters, 0), [filters, load]);

  const columns = useMemo<GridColumn[]>(() => buildRuleSetColumns((setId) => openMdmPage(EDIT_PAGE, { setId })), []);

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
        <SearchField label="세트" name="keyword" meta={false}>
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
        <SearchField label="상태" name="status" meta={false}>
          <Select
            data-testid="set-search-status"
            value={filters.status}
            options={STATUS_FILTER_OPTIONS}
            onChange={(v) => setFilters((p) => ({ ...p, status: v }))}
          />
        </SearchField>
      </SearchArea>

      <ContentBody root resizable storageKey="mdm.dme.ruleSetMng">
        <ContentPanel>
          <GridPanel title="룰 세트 목록" count={totalCount} serverPaged>
            <div data-testid="set-list" style={{ position: "absolute", inset: 0 }}>
              <AgDataGrid gridId="ruleSetList" personalize={{ sort: false }}
                columnSizing="fit"
                columns={columns}
                data={gridRows}
                rowKey="setId"
                sortable={false}
                loading={isBusy}
                loadingMessage="조회 중..."
                emptyMessage="조건에 맞는 룰 세트가 없다"
                emptyTestId="set-list-empty"
              />
            </div>
          </GridPanel>
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
