"use client";

/**
 * mdmCacheMng — MDM 캐시 관리(시스템관리 > MDM 캐시 관리). 화면 유형 D(마스터-디테일) + E(등록 팝업).
 * 위: 업무 모듈별 캐시 상태, 아래: 고른 모듈의 캐시 항목. 신규 = 고른 모듈 인스턴스에 미리 적재, 삭제·재등록 = MDM 변경 기록에 강제 기록
 * (모든 모듈·인스턴스가 다음 확인 때 반영). spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §6,
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §D·§E, docs/guide/FrontEnd/Local-Rules.md §9(중요 액션).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { fetchAllStatus, fetchEntries, forceKeys, groupByType } from "./api";
import { RegisterModal } from "./RegisterModal";
import {
  MDM_CACHE_MODULES,
  MODULE_STATE_LABELS,
  TARGET_TYPE_LABELS,
  TARGET_TYPE_OPTIONS,
  emptyFilters,
  type CacheEntryRow,
  type EntryFilters,
  type ForceKind,
  type MdmTargetType,
  type ModuleState,
  type ModuleStatusRow,
} from "./types";

const SCREEN_ID = "mdmCacheMng";

/** 상태 배지 색: 의미 토큰만 쓴다(screen-patterns.md §배지 색). */
const STATE_BADGE: Record<ModuleState, { bg?: string; color?: string; muted?: boolean }> = {
  OK: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  LAGGING: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  FAILING: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
  DOWN: { muted: true },
};

const MODULE_COLUMNS: GridColumn[] = [
  { key: "module", header: "모듈", width: 80, align: "left" },
  {
    key: "state",
    header: "상태",
    width: 80,
    align: "center",
    render: (v) => <GridBadge label={MODULE_STATE_LABELS[v as ModuleState] ?? String(v)} {...STATE_BADGE[v as ModuleState]} />,
  },
  { key: "instanceId", header: "인스턴스", width: 180, align: "left" },
  { key: "appliedSeq", header: "적용 순번", width: 100, align: "right", type: "number" },
  { key: "latestSeq", header: "MDM 순번", width: 100, align: "right", type: "number" },
  { key: "lastSuccessAt", header: "마지막 확인", width: 140, align: "center" },
  { key: "consecutiveFailures", header: "연속 실패", width: 100, align: "right", type: "number" },
  { key: "total", header: "항목 수", width: 100, align: "right", type: "number" },
];

const ENTRY_COLUMNS: GridColumn[] = [
  { key: "type", header: "대상", width: 100, align: "left", render: (v) => TARGET_TYPE_LABELS[v as MdmTargetType] ?? String(v) },
  { key: "key", header: "키", width: 180, minWidth: 180, align: "left" },
  {
    key: "absent",
    header: "값",
    width: 80,
    align: "center",
    render: (v) =>
      v ? <GridBadge label="없음" muted /> : <GridBadge label="있음" bg="var(--color-success-soft)" color="var(--color-success)" />,
  },
  { key: "loadedAt", header: "적재 시각", width: 140, align: "center" },
  { key: "hits", header: "조회 수", width: 100, align: "right", type: "number" },
  { key: "remainingSeconds", header: "남은 수명(초)", width: 100, align: "right", type: "number" },
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function MdmCacheMngPage() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<EntryFilters>(emptyFilters);
  const [modules, setModules] = useState<ModuleStatusRow[]>([]);
  const [latestSeq, setLatestSeq] = useState(-1);
  const [entries, setEntries] = useState<CacheEntryRow[]>([]);
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<(string | number)[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isDetailBusy, setIsDetailBusy] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const selectedEntries = useMemo(() => entries.filter((e) => selectedKeys.includes(e.rowId)), [entries, selectedKeys]);

  const loadEntries = useCallback(
    async (module: string, f: EntryFilters) => {
      setIsDetailBusy(true);
      try {
        setEntries((await fetchEntries(module, f)).items);
        setSelectedKeys([]);
      } catch (e) {
        setEntries([]);
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      } finally {
        setIsDetailBusy(false);
      }
    },
    [showMessage],
  );

  const handleSearch = useCallback(async () => {
    setIsBusy(true);
    try {
      const { rows, latestSeq: latest } = await fetchAllStatus(MDM_CACHE_MODULES);
      setModules(rows);
      setLatestSeq(latest);
      const keep = rows.find((r) => r.module === selectedModule && r.state !== "DOWN");
      if (keep) {
        await loadEntries(keep.module, filters);
      } else {
        setSelectedModule("");
        setEntries([]);
        setSelectedKeys([]);
      }
    } catch (e) {
      showMessage({ title: "오류", message: errorText(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  }, [filters, loadEntries, selectedModule, showMessage]);

  useEffect(() => {
    // 첫 진입 때 한 번 조회한다(조회 결과를 상태에 담는 비동기 호출이라 effect 안 setState 규칙에 걸린다).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 위 행을 누르면 그 모듈의 항목을 조회한다. 연결 안 된 모듈은 항목을 비운다. */
  const handleModuleClick = useCallback(
    async (row: Record<string, unknown>) => {
      const moduleId = String(row.module ?? "");
      setSelectedModule(moduleId);
      if (row.state === "DOWN") {
        setEntries([]);
        setSelectedKeys([]);
        return;
      }
      await loadEntries(moduleId, filters);
    },
    [filters, loadEntries],
  );

  const openRegister = () => {
    const row = modules.find((r) => r.module === selectedModule);
    if (!row || row.state === "DOWN") {
      showMessage({ message: "모듈을(를) 선택하세요.", alertType: "warning" });
      return;
    }
    setRegisterOpen(true);
  };

  const runForce = useCallback(
    async (kind: ForceKind) => {
      setIsBusy(true);
      try {
        for (const [type, keys] of groupByType(selectedEntries)) {
          await forceKeys(type, keys, kind);
        }
        showMessage({ message: kind === "EVICT" ? "삭제되었습니다." : "재등록을 요청했습니다.", alertType: "success", toast: true });
        setSelectedKeys([]);
      } catch (e) {
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      } finally {
        setIsBusy(false);
      }
    },
    [selectedEntries, showMessage],
  );

  /** 중요 액션(Local-Rules §9) — 영향 범위(모든 모듈·인스턴스, 다음 확인 약 10초)를 보여 주고 확인을 받는다. */
  const confirmForce = (kind: ForceKind) =>
    showMessage({
      title: "확인",
      message:
        kind === "EVICT"
          ? `선택한 ${selectedEntries.length}건을 모든 모듈 캐시에서 삭제하시겠습니까? 각 모듈이 다음 확인(약 10초) 때 지웁니다.`
          : `선택한 ${selectedEntries.length}건을 모든 모듈에서 다시 적재하시겠습니까? 각 모듈이 다음 확인(약 10초) 때 지우고 다시 받습니다.`,
      alertType: "confirm",
      onConfirm: () => void runForce(kind),
    });

  const setFilter = (key: keyof EntryFilters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <PageLayout
      title="MDM 캐시 관리"
      breadcrumb="시스템관리 > MDM 캐시 관리"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: isBusy, action: "search" },
        { id: "btn_new", label: "신규", onClick: openRegister, disabled: isBusy, action: "save" },
        { id: "btn_delete", label: "삭제", onClick: () => confirmForce("EVICT"), disabled: isBusy || selectedEntries.length === 0, action: "delete" },
        { id: "btn_reload", label: "재등록", onClick: () => confirmForce("RELOAD"), disabled: isBusy || selectedEntries.length === 0, action: "reload" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()}>
        <SearchField label="대상 종류" type="select" options={TARGET_TYPE_OPTIONS} value={filters.type} onChange={(v) => setFilter("type", v)} />
        <SearchField label="키" value={filters.q} onChange={(v) => setFilter("q", v)} />
      </SearchArea>

      <ContentBody root direction="column" resizable storageKey="mcm.csa.mdmCacheMng">
        <ContentPanel>
          <GridPanel title={latestSeq >= 0 ? `모듈 상태 (MDM 최신 순번 ${latestSeq})` : "모듈 상태"} count={modules.length}>
            <AgDataGrid
              rowKey="module"
              columns={MODULE_COLUMNS}
              data={modules}
              columnSizing="fit"
              highlightedRowKey={selectedModule}
              onRowClick={(row) => void handleModuleClick(row)}
              loading={isBusy}
            />
          </GridPanel>
        </ContentPanel>
        <ContentPanel height="40%">
          <GridPanel title={selectedModule ? `캐시 항목 — ${selectedModule}` : "캐시 항목"} count={entries.length}>
            <AgDataGrid
              rowKey="rowId"
              columns={ENTRY_COLUMNS}
              data={entries}
              columnSizing="fit"
              selectable
              multiSelect
              selectedRows={selectedKeys}
              onRowSelect={(ids) => setSelectedKeys(ids)}
              loading={isDetailBusy}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      <RegisterModal
        open={registerOpen}
        module={selectedModule}
        onClose={() => setRegisterOpen(false)}
        onRegistered={() => void loadEntries(selectedModule, filters)}
      />
    </PageLayout>
  );
}
