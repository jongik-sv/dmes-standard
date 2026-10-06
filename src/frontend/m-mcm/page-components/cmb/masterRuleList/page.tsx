"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { createMasterRuleListRepository, type SaveRow } from "./repository";
import { RULE_COLUMNS, DEFAULT_FILTERS, ROW_ADD_DEFAULTS } from "./constants";
import type { RuleFilters, RuleRow } from "./types";

/**
 * 업무기준 목록조회 (masterRuleList) — As-Is `MasterRuleList.xfdl` 의 To-Be 단일 그리드 CRUD.
 *
 * 인용:
 *  - 분석리포트 §1 / §3 / §4 / §6.1 / §7.2 / §12 (USD 보존 / 이력행·활성 필터 / delete 부재)
 *  - BPMN: services/cmb/masterRuleList.bpmn — search / save 2 액션
 *  - BE: MasterRuleListService (com.dongkuk.dmes.mcm.cmb.masterRuleList.service — mcm-core)
 *
 * 형제 masterCategoryMng 과의 차이:
 *  - rowStatus C/U 만 (delete 부재 — As-Is 기존행 서버 삭제 없음, USE_TP 논리삭제)
 *  - 단일 그리드 (allList 중복체크 미사용 — As-Is AllList 노드 부재). 중복 PK 는 서버 existsById.
 *  - 우측 메뉴 = 행추가 / 행삭제 (엑셀은 그리드 설정 메뉴 「엑셀 출력」, rowCopy / rowCancel 없음 — 분석 §4.2)
 */

type RowStatus = "" | "inserted" | "updated";

interface GridRow extends Record<string, unknown> {
  __gridTempId?: string;
  __rowId?: string;
  nativeeditor_status?: RowStatus;
}

function getRowKey(row: GridRow): string {
  return (row.__gridTempId as string) || (row.__rowId as string) || `${row.ruleId ?? ""}`;
}

/** 조회 행에 합성 rowKey 부여 (AgDataGrid rowKey 단일 컬럼 — RULE_ID 단일 PK). */
function withSyntheticId<T extends Partial<RuleRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `r-${idx}-${r.ruleId ?? ""}` };
}

function stripInternal<T extends GridRow>(row: T): Record<string, unknown> {
  const { __gridTempId: _t, __rowId: _r, nativeeditor_status: _s, ...rest } = row as Record<string, unknown>;
  return rest;
}

function emptyRule(): RuleRow {
  return {
    ruleId: "",
    ruleNm: "",
    ruleDesc: "",
    ruleVer: ROW_ADD_DEFAULTS.ruleVer,       // '1' (As-Is xfdl:231)
    ruleTp: ROW_ADD_DEFAULTS.ruleTp,         // 'A' (As-Is xfdl:229)
    ruleOwnerEmpNo: "",
    useTp: ROW_ADD_DEFAULTS.useTp,           // 'Y' (As-Is xfdl:230)
    creationTimestamp: "",
    lastUpdatedObjectId: "",
    lastUpdateTimestamp: "",
  };
}

export default function MasterRuleListPage() {
  const repo = useMemo(() => createMasterRuleListRepository(), []);
  const { showMessage } = useMessage();

  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·선택 키는 가볍게, 조회 결과 행은 bulky.
  const [filters, setFilters] = useCarryState<RuleFilters>("filters", DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useCarryState<(RuleRow & GridRow)[]>("rows", [], { bulky: true });
  const [selectedKey, setSelectedKey] = useCarryState<string | null>("selectedKey", null);
  const restored = useCarryRestored();

  const hasAnyChanges = useMemo(() => rows.some((r) => r.nativeeditor_status), [rows]);

  // ── load (search) ──
  const loadRules = useCallback(
    async (f: RuleFilters) => {
      setIsSearching(true);
      setError(null);
      try {
        const result = await repo.search(f);
        setRows(
          result.list.map((r, i) => ({
            ...withSyntheticId(r, i),
            nativeeditor_status: "" as RowStatus,
          })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
      } finally {
        setIsSearching(false);
      }
    },
    [repo, setRows],
  );

  useEffect(() => {
    // 마운트 자동 조회 — 새 창이 이어받은 행이 있으면 건너뛴다(행 없이 복원됐으면 이어받은 조건으로 조회).
    // 조회 결과를 상태에 담는 비동기 호출이라 effect 안 setState 규칙에 걸린다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!restored || rows.length === 0) void loadRules(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (k: keyof RuleFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadRules(filters);

  // ── grid handlers ──
  /**
   * 행추가 / 행삭제 통합 핸들러.
   *  - addedRowKey 有 → 신규행 (emptyRule + 기본값 RULE_TP='A'/USE_TP='Y'/RULE_VER='1')
   *  - addedRowKey 無 → 행삭제: 신규행만 client 제거. 기존행 삭제 시도 → BR-008 차단
   *    ("행추가로 추가한 데이터만 삭제가 가능합니다.") — As-Is 기존행 서버 삭제 부재 보존.
   */
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        setRows((prev) => {
          const newRow: RuleRow & GridRow = {
            ...emptyRule(),
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const removedExisting = prev
            .filter((r) => !newKeys.has(getRowKey(r)))
            .filter((r) => r.nativeeditor_status !== "inserted");
          if (removedExisting.length > 0) {
            // BR-008 — 기존행 실삭제 차단 (논리삭제는 USE_TP UPDATE)
            setError("행추가로 추가한 데이터만 삭제가 가능합니다.");
            return prev;
          }
          return newData as (RuleRow & GridRow)[];
        });
      }
    },
    [setRows, setSelectedKey],
  );

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (getRowKey(r) !== String(p.rowKey)) return r;
          // BR-006 — 기존행 PK(ruleId)·담당자 변경 차단 (신규행만)
          if (
            r.nativeeditor_status !== "inserted" &&
            (p.field === "ruleId" || p.field === "ruleOwnerEmpNo")
          ) {
            return r;
          }
          const updated = { ...r, [p.field]: p.newValue };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        }),
      );
    },
    [setRows],
  );

  // ── save ──
  const handleSave = useCallback(async () => {
    const cRows = rows.filter((r) => r.nativeeditor_status === "inserted");
    const uRows = rows.filter((r) => r.nativeeditor_status === "updated");

    if (cRows.length + uRows.length === 0) {
      setError("변경된 데이터가 없습니다."); // BR-004 / MSG-001
      return;
    }

    // 클라이언트 필수 검증 (BR-005 / MSG-002) — As-Is fn_checkSave
    for (const r of cRows.concat(uRows)) {
      if (!String(r.ruleId ?? "").trim()) {
        setError("업무기준ID를 입력해 주십시오.");
        return;
      }
      if (!String(r.ruleNm ?? "").trim()) {
        setError("업무기준명을 입력해 주십시오.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: SaveRow[] = [
        ...cRows.map((r, i) => ({ ...stripInternal(r), rowKey: `c-${i}`, rowStatus: "C" as const })),
        ...uRows.map((r, i) => ({ ...stripInternal(r), rowKey: `u-${i}`, rowStatus: "U" as const })),
      ];
      // BE save() 가 { cnt_save, list } 반환 — 후속 재조회 결과 동봉 (네트워크 1회).
      // 중복 PK 는 서버 existsById → DUPLICATE_DATA (modal 에 "[id] 동일한 업무기준ID가 존재합니다.").
      const result = await repo.save(filters, payload);
      showMessage({ message: `${result.cntSave}건 저장 되었습니다.` });
      setRows(
        result.list.map((r, i) => ({
          ...withSyntheticId(r, i),
          nativeeditor_status: "" as RowStatus,
        })),
      );
      setSelectedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [rows, filters, repo, showMessage, setRows, setSelectedKey]);

  // 엑셀 출력(B-005)은 목록 그리드의 「그리드 설정」 메뉴 [엑셀 출력] 이 맡는다(공통 기능 — 컬럼 순서·정렬·필터 반영).

  return (
    <PageLayout
      title="업무기준 목록조회"
      breadcrumb="공통관리 > 업무기준 관리(원장) > 업무기준 목록조회"
      objId="masterRuleList"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary" as const,
          disabled: isSearching || isSaving,
          action: "search",
        },
        {
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save" as const,
          disabled: !hasAnyChanges || isSaving,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="업무기준 ID"
          name="ruleId"
          value={filters.pRuleId}
          onChange={(v) => handleFilterChange("pRuleId", v)}
        />
        <SearchField
          label="업무기준명"
          name="ruleNm"
          value={filters.pRuleNm}
          onChange={(v) => handleFilterChange("pRuleNm", v)}
        />
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="업무기준 목록"
            count={rows.length}
            showAddButton
            showDeleteButton
            data={rows}
            rowKey="__rowId"
            columns={RULE_COLUMNS}
            selectedRowKey={selectedKey}
            onDataChange={handleDataChange}
            loading={isSaving}
          >
            <AgDataGrid
              gridId="main"
              columnSizing="fit"
              columns={RULE_COLUMNS}
              data={rows}
              rowKey="__rowId"
              sortable
              singleClickEdit
              stopEditingWhenCellsLoseFocus={false}
              highlightedRowKey={selectedKey}
              onRowClick={(row) => setSelectedKey(getRowKey(row as GridRow))}
              onCellValueChanged={handleCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage="조회된 업무기준이 없습니다."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
