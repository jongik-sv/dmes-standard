"use client";

/**
 * ruleMng — 룰 헤더·버전(TSK-08-02, decisions.md D-105). 정본: docs/mdm/screens/ruleMng/ruleMng_기능설계서.md.
 *
 * D-101(dmc)·D-104(dmd)처럼 **목록 + 상세**로 나눈다. 상세는 ① 헤더·② 버전이며(D-105), 내용 편집(③ 의사결정표·열 설정,
 * ④⑤⑥ 값 테스트·케이스, ⑧ 활용처)은 `ruleEdit` 화면이 맡는다. 룰 ID 를 누르면 그 룰의 상세가 열린다.
 *
 * 목록은 서버 페이징(page 0 부터·size 20, I29). [내용 편집 →] 으로 `ruleEdit` 로 간다(I28).
 * 룰 등록은 목록 헤더의 [룰 등록]이 여는 팝업에서 한다 — 상세 옆에 등록 폼을 늘 펴 두지 않는다.
 * 배포 대상 칸·조건은 두지 않는다(D11).
 *
 * Part B §4-3 MUST: 분할 골격(`ContentBody`/`ContentPanel`)은 `page.tsx` 의 **직접 자식**이어야 drag bar 가 붙는다
 * (shared `ContentBody.tsx` 의 `isLayoutItem` 은 `React.Children` 로 받은 직접 자식의 type 만 본다). 그래서 상세는
 * `RuleDetailPanel` 이 내용만 돌려주고 골격은 여기서 그린다(dmc `codeMng` 선례).
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
import { Modal } from "@dk-oasis/shared/modal";
import { MdmPageLayout, badgeStyle, fmtVer } from "@/shell";
import { openRuleEdit } from "@/dme/rule-handoff";

import { searchRules, viewRule } from "./api";
import { RuleRegisterForm } from "./components/RuleRegisterForm";
import { RuleDetailPanel } from "./RuleDetailPanel";
import {
  RULE_KIND_LABELS,
  RULE_PAGE_SIZE,
  RULE_STATUS_LABELS,
  emptyFilters,
  type RuleListRow,
  type RuleMngView,
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
  return `${fmtVer(row.pendingVer)} ${row.pendingStatus ?? ""}${owner}`.trim();
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
  // 선택된 룰의 상세(D-105) — 목록에서 고른 룰 하나만 불러온다.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RuleMngView | null>(null);
  const [isDetailBusy, setIsDetailBusy] = useState(false);
  const [isRegOpen, setIsRegOpen] = useState(false);

  const loadDetail = useCallback(async (ruleId: string | null) => {
    if (!ruleId) {
      setDetail(null);
      return;
    }
    setIsDetailBusy(true);
    try {
      setDetail(await viewRule(ruleId));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      setDetail(null);
    } finally {
      setIsDetailBusy(false);
    }
  }, []);

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

  // 첫 진입 자동 조회 없음 — [조회] 버튼으로만 조회(2026-10-02 사용자 요청)

  // 첫 목록이 오면 그 첫 줄을 연다 — 상세가 빈 화면으로 남지 않게(dmc codeMng 과 같은 접합).
  useEffect(() => {
    if (selectedId || rows.length === 0) return;
    setSelectedId(rows[0].maruRuleId);
  }, [rows, selectedId]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

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
      {
        key: "releasedVer",
        header: "적용 버전",
        width: 80,
        minWidth: 60,
        align: "center",
        render: (value) => fmtVer(value as string | null),
      },
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

      <ContentBody root resizable storageKey="mdm.dme.ruleMng">
        <ContentPanel>
          <GridPanel
            title="룰 목록"
            count={totalCount}
            buttons={[
              {
                id: "btn_rule_reg",
                label: "룰 등록",
                onClick: () => setIsRegOpen(true),
                // 권한이 없으면 숨기지 않고 비활성으로 둔다(§6.7.0).
                disabled: !canDoButton(rbac, SCREEN_ID, "reg"),
              },
            ]}
          >
            <AgDataGrid
              columnSizing="fit"
              columns={columns}
              data={gridRows}
              rowKey="maruRuleId"
              sortable={false}
              loading={isBusy}
              loadingMessage="조회 중..."
              emptyMessage="조회된 룰이 없습니다."
              emptyTestId="rule-list-empty"
              highlightedRowKey={selectedId ?? undefined}
              onRowClick={(row) => setSelectedId(row.maruRuleId as string)}
            />
          </GridPanel>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalCount}
            disabled={isBusy}
            onPageChange={(p) => void load(applied, p)}
          />
        </ContentPanel>

        {/* 오른쪽 = ① 헤더·② 버전(D-105). 내용 편집은 여기 없다 — `ruleEdit` 화면이 맡는다. */}
        <ContentPanel flex="1 1 0">
          {detail ? (
            <RuleDetailPanel
              view={detail}
              reload={() => loadDetail(selectedId)}
              canDo={(action) => canDoButton(rbac, SCREEN_ID, action)}
              busy={isBusy || isDetailBusy}
              onError={setErrorMessage}
              onContentEdit={(ruleId, ver) => openRuleEdit(ruleId, ver)}
            />
          ) : (
            <p data-testid="rule-detail-empty" style={{ color: "var(--color-text-secondary)" }}>
              {isDetailBusy ? "불러오는 중..." : "룰을 고르세요."}
            </p>
          )}
        </ContentPanel>
      </ContentBody>

      {/*
        열 때만 마운트한다 — 열 때마다 칸이 비고, 닫힌 채 폼 칸이 DOM 에 남지 않는다. 등록 오류는 팝업을 닫지 않고
        그 위에 ErrorModal 로 띄워 입력값을 고쳐 다시 보낼 수 있게 한다(그래서 ErrorModal 보다 먼저 그린다).
        shared `Modal` 은 열린 창마다 window Escape 를 받아 Escape 한 번에 두 창이 함께 닫힌다(실측) — 오류창이
        떠 있는 동안에는 이 팝업의 닫기를 무시한다.
      */}
      {isRegOpen && (
        <Modal
          open
          title="룰 등록"
          size="md"
          onClose={() => {
            if (!errorMessage) setIsRegOpen(false);
          }}
        >
          <RuleRegisterForm
            canRegister={canDoButton(rbac, SCREEN_ID, "reg")}
            onRegistered={(ruleId) => {
              setIsRegOpen(false);
              setSelectedId(ruleId);
              void load(applied, 0);
            }}
            onCancel={() => setIsRegOpen(false)}
            onError={setErrorMessage}
          />
        </Modal>
      )}

      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
