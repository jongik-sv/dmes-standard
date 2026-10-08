"use client";

/**
 * jobSchedMng — 예약 작업 관리(공통관리 > 시스템관리, SYSADMIN). 설계 docs/superpowers/specs/2026-10-08-job-scheduler-design.md §7.
 * 조회 조건 → 왼쪽 「작업 목록」과 아래 「실행 이력」 → 오른쪽 상세(공통 칸·일정·유형별 입력·변수·고급).
 * 상세 폼 state 는 JobDetailForm 안에 있고 이 루트는 ref 핸들로 대화한다(화면 성능 가이드 R12).
 * 단추는 메뉴 RBAC action(save·setUse·runNow·delete)으로 막는다. 서버도 같은 권한으로 막는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import {
  canDoButton,
  ContentBody,
  ContentPanel,
  MaxHandle,
  PageLayout,
  SearchArea,
  SearchField,
  useUserButtonRbac,
  type PageButton,
} from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { jobSchedApi } from "./api";
import { copyForm, emptyForm, formatTimestamp, isJobListTruncated, JOB_LIST_MAX, toForm, toJobGridRow, toRunGridRow, toSaveRequest, type JobForm } from "./form-model";
import { HistoryPanel } from "./HistoryPanel";
import { KindBadges, RunStatusBadge, UseBadge } from "./JobBadges";
import { JobDetailForm, checkForm, type JobDetailAction, type JobDetailHandle, type LastFailure } from "./JobDetailForm";
import { kindLabel } from "./kind-label";
import { KindPickerModal } from "./KindPickerModal";
import {
  EMPTY_FILTERS,
  JOB_KINDS,
  JOB_MODULES,
  RUN_STATUS_LABEL,
  SCREEN_ID,
  type HandlerRow,
  type JobGridRow,
  type JobKind,
  type JobListFilters,
  type JobRunGridRow,
  type RunStatus,
} from "./types";

const ALL = { value: "", label: "전체" };
const MODULE_FILTER_OPTIONS = [ALL, ...JOB_MODULES.map((m) => ({ value: m, label: m }))];
const KIND_FILTER_OPTIONS = [ALL, ...JOB_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))];
const USE_FILTER_OPTIONS = [ALL, { value: "Y", label: "사용" }, { value: "N", label: "중지" }];
const STATUS_FILTER_OPTIONS = [
  ALL,
  ...(["OK", "FAIL", "RUN", "SKIP", "TIMEOUT"] as RunStatus[]).map((s) => ({ value: s, label: RUN_STATUS_LABEL[s] })),
];

const JOB_COLUMNS: GridColumn[] = [
  { key: "moduleCd", header: "모듈", width: 1, minWidth: 64, align: "center", meta: false },
  { key: "jobId", header: "작업 ID", width: 3, minWidth: 150, align: "left", meta: false },
  { key: "jobNm", header: "작업명", width: 100, minWidth: 150, align: "left", meta: false },
  {
    key: "kindLabel",
    header: "유형",
    width: 2,
    minWidth: 140,
    align: "left",
    meta: false,
    render: (v, row) => <KindBadges label={String(v ?? "")} codeMissing={row.codeMissing === true} />,
  },
  { key: "cronExpr", header: "crontab 식", width: 2, minWidth: 110, align: "left", meta: false },
  { key: "cronDesc", header: "일정 설명", width: 3, minWidth: 130, align: "left", meta: false },
  { key: "useYn", header: "사용", width: 1, minWidth: 64, align: "center", meta: false, render: (v) => <UseBadge useYn={String(v ?? "")} /> },
  { key: "nextRun", header: "다음 예정", width: 2, minWidth: 130, align: "center", meta: false },
  { key: "lastStatus", header: "최근 결과", width: 1, minWidth: 86, align: "center", meta: false, render: (v) => <RunStatusBadge status={String(v ?? "")} /> },
  { key: "lastServerNm", header: "최근 실행 서버", width: 3, minWidth: 150, align: "left", meta: false },
];

const errorText = (e: unknown): string => (e instanceof Error && e.message ? e.message : "요청을 처리하지 못했습니다.");

export default function JobSchedMngPage() {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac();
  const permissions = useMemo(
    () => ({
      save: canDoButton(rbac, SCREEN_ID, "save"),
      setUse: canDoButton(rbac, SCREEN_ID, "setUse"),
      runNow: canDoButton(rbac, SCREEN_ID, "runNow"),
      delete: canDoButton(rbac, SCREEN_ID, "delete"),
    }),
    [rbac],
  );

  const detailRef = useRef<JobDetailHandle>(null);
  const [filters, setFilters] = useState<JobListFilters>(EMPTY_FILTERS);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const [jobs, setJobs] = useState<JobGridRow[]>([]);
  const jobsRef = useRef<JobGridRow[]>([]);
  jobsRef.current = jobs;
  const [handlers, setHandlers] = useState<HandlerRow[]>([]);
  /** 고른 작업의 ID. 새 작업(저장 전)이거나 선택이 없으면 "". */
  const [selectedId, setSelectedId] = useState("");
  const selectedIdRef = useRef("");
  selectedIdRef.current = selectedId;
  /** 선택을 바꾼다 — ref 도 바로 맞춰, 늦게 끝난 요청이 바뀐 선택을 알아본다(렌더를 기다리지 않는다). */
  const select = useCallback((id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
  }, []);
  const [runs, setRuns] = useState<JobRunGridRow[]>([]);
  const [lastFailure, setLastFailure] = useState<LastFailure | null>(null);
  const [historyTitle, setHistoryTitle] = useState("실행 이력");
  const [listBusy, setListBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const loadSeq = useRef(0);
  const historySeq = useRef(0);

  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorText(e), alertType: "error" }), [showMessage]);

  const loadList = useCallback(async (): Promise<JobGridRow[]> => {
    const seq = ++loadSeq.current;
    setListBusy(true);
    try {
      const rows = (await jobSchedApi.list(filtersRef.current)).map(toJobGridRow);
      if (seq === loadSeq.current) setJobs(rows);
      return rows;
    } finally {
      if (seq === loadSeq.current) setListBusy(false);
    }
  }, []);

  const loadHistory = useCallback(async (jobId: string, name: string) => {
    const seq = ++historySeq.current;
    setHistoryBusy(true);
    try {
      const raw = await jobSchedApi.history(jobId);
      if (seq !== historySeq.current) return;
      setRuns(raw.map(toRunGridRow));
      setHistoryTitle(`실행 이력 · ${name}`);
      const last = raw[0];
      setLastFailure(last && (last.status === "FAIL" || last.status === "TIMEOUT") ? { status: last.status, schedAt: formatTimestamp(last.schedAt), serverNm: last.serverNm, msg: last.msg } : null);
    } catch (e) {
      if (seq === historySeq.current) fail(e);
    } finally {
      if (seq === historySeq.current) setHistoryBusy(false);
    }
  }, [fail]);

  const clearHistory = useCallback(() => {
    historySeq.current++;
    setRuns([]);
    setLastFailure(null);
    setHistoryTitle("실행 이력");
    setHistoryBusy(false);
  }, []);

  // 진입 조회는 SearchArea autoSearch 가 맡는다. 처리기 목록은 한 번만 받는다(코드 실행 유형의 선택지).
  useEffect(() => {
    let alive = true;
    jobSchedApi
      .handlers()
      .then((hs) => {
        if (alive) setHandlers(hs);
      })
      .catch(() => {
        // 처리기 목록을 못 받으면 코드 실행 유형의 선택지만 비어 보인다. 다른 유형은 쓸 수 있다.
      });
    return () => {
      alive = false;
    };
  }, []);

  const guard = useCallback(
    (message: string, action: () => void) => {
      if (!detailRef.current?.isDirty()) {
        action();
        return;
      }
      showMessage({ title: "확인", message, alertType: "confirm", onConfirm: action });
    },
    [showMessage],
  );

  const openJob = useCallback(
    async (jobId: string, codeMissing: boolean) => {
      const previous = selectedIdRef.current;
      select(jobId);
      clearHistory();
      setActionBusy(true);
      try {
        const def = await jobSchedApi.get(jobId);
        if (selectedIdRef.current !== jobId) return;
        detailRef.current?.load(toForm(def, codeMissing));
        void loadHistory(jobId, def.jobNm);
      } catch (e) {
        // 못 열었으면 폼에 남은 이전 작업으로 선택을 되돌린다(강조·저장 대상이 어긋나지 않게, 같은 행을 다시 눌러 열 수 있게).
        if (selectedIdRef.current === jobId) {
          select(previous);
          const shown = detailRef.current?.getForm();
          if (previous && shown && !shown.isNew) void loadHistory(previous, shown.jobNm);
        }
        fail(e);
      } finally {
        setActionBusy(false);
      }
    },
    [fail, loadHistory, clearHistory, select],
  );

  const handleSearch = useCallback(async () => {
    try {
      const rows = await loadList();
      // 서버가 500건까지만 돌려주고 총건수를 주지 않는다 — 상한에 닿으면 건수만으로는 전체인지 알 수 없다.
      if (isJobListTruncated(rows.length)) {
        showMessage({ message: `작업이 ${JOB_LIST_MAX}건까지만 표시됩니다. 모듈·유형 같은 조건으로 좁혀 조회하세요.`, alertType: "warning" });
      }
    } catch (e) {
      fail(e);
    }
  }, [loadList, fail, showMessage]);

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const id = String(row.jobId);
      const current = detailRef.current?.getForm();
      if (id === selectedIdRef.current && current && !current.isNew) return;
      guard("저장하지 않은 변경을 버릴까요?", () => void openJob(id, row.codeMissing === true));
    },
    [guard, openJob],
  );

  const handleNew = useCallback(() => guard("저장하지 않은 변경을 버릴까요?", () => setPickerOpen(true)), [guard]);

  const handlePickKind = useCallback(
    (kind: JobKind) => {
      setPickerOpen(false);
      const moduleCd = filtersRef.current.moduleCd || "MCM";
      select("");
      clearHistory();
      detailRef.current?.load(emptyForm(kind, moduleCd));
    },
    [clearHistory],
  );

  /** 저장·사용 변경 같은 뒤처리: 목록을 다시 받고 그 작업을 폼에 다시 연다. */
  const reopen = useCallback(
    async (jobId: string, expectedSelected: string) => {
      const rows = await loadList();
      const def = await jobSchedApi.get(jobId);
      // 기다리는 동안 사용자가 다른 작업을 열었으면 그 화면을 덮어쓰지 않는다.
      if (selectedIdRef.current !== expectedSelected) return;
      select(jobId);
      detailRef.current?.load(toForm(def, rows.find((r) => r.jobId === jobId)?.codeMissing === true));
      void loadHistory(jobId, def.jobNm);
    },
    [loadList, loadHistory, select],
  );

  const doSave = useCallback(async () => {
    const form = detailRef.current?.getForm();
    if (!form) return;
    const error = checkForm(form);
    if (error) {
      showMessage({ message: error, alertType: "warning" });
      return;
    }
    setActionBusy(true);
    try {
      const expected = selectedIdRef.current;
      const def = await jobSchedApi.save(toSaveRequest(form));
      // 저장은 끝났다 — 응답으로 먼저 폼을 맞춰 두면, 뒤따르는 재조회가 실패해도 옛 ver·새 작업 상태로 남지 않는다.
      const stillHere = selectedIdRef.current === expected;
      if (stillHere) {
        select(def.jobId);
        detailRef.current?.load(toForm(def, form.codeMissing));
      }
      showMessage({ message: "저장되었습니다. 다음 분부터 새 설정으로 실행합니다.", alertType: "success", toast: true });
      // 목록·이력은 저장 뒤에 다시 받는다. 실패해도 저장은 끝났고 폼은 응답으로 맞춰져 있다.
      if (stillHere) await reopen(def.jobId, def.jobId);
      else await loadList();
    } catch (e) {
      fail(e);
    } finally {
      setActionBusy(false);
    }
  }, [showMessage, reopen, loadList, select, fail]);

  const doCopy = useCallback(() => {
    const form = detailRef.current?.getForm();
    if (!form || form.isNew) return;
    select("");
    clearHistory();
    detailRef.current?.load(copyForm(form));
  }, [clearHistory]);

  const doToggleUse = useCallback(async () => {
    const form = detailRef.current?.getForm();
    if (!form || form.isNew) return;
    if (detailRef.current?.isDirty()) {
      showMessage({ message: "저장하지 않은 변경이 있습니다. 저장한 뒤 바꾸세요.", alertType: "warning" });
      return;
    }
    const next = form.useYn === "N" ? "Y" : "N";
    setActionBusy(true);
    try {
      await jobSchedApi.setUse(form.jobId, next);
      await reopen(form.jobId, form.jobId);
      showMessage({
        message: next === "Y" ? "사용으로 바꿨습니다." : "사용을 중지했습니다. 일정에 따른 실행이 멈춥니다.",
        alertType: "success",
        toast: true,
      });
    } catch (e) {
      fail(e);
    } finally {
      setActionBusy(false);
    }
  }, [showMessage, reopen, fail]);

  const doRunNow = useCallback(() => {
    const form = detailRef.current?.getForm();
    if (!form || form.isNew) return;
    if (detailRef.current?.isDirty()) {
      showMessage({ message: "저장하지 않은 변경이 있습니다. 저장한 뒤 실행하세요.", alertType: "warning" });
      return;
    }
    showMessage({
      title: "확인",
      message: `「${form.jobNm}」을 지금 한 번 실행합니다. 일정은 바뀌지 않습니다. 실행할까요?`,
      alertType: "confirm",
      onConfirm: () => {
        void (async () => {
          setActionBusy(true);
          try {
            const result = await jobSchedApi.runNow(form.jobId);
            if (result.accepted) {
              showMessage({ message: result.message || "실행을 요청했습니다.", alertType: "success", toast: true });
            } else {
              showMessage({ message: result.message || "실행하지 못했습니다.", alertType: "warning" });
            }
            await loadList();
            // 접수를 기다리는 동안 다른 작업을 열었으면 그 작업의 이력을 덮어쓰지 않는다.
            if (selectedIdRef.current === form.jobId) await loadHistory(form.jobId, form.jobNm);
          } catch (e) {
            fail(e);
          } finally {
            setActionBusy(false);
          }
        })();
      },
    });
  }, [showMessage, loadList, loadHistory, fail]);

  const doDelete = useCallback(() => {
    const form = detailRef.current?.getForm();
    if (!form || form.isNew) return;
    showMessage({
      title: "확인",
      message: `「${form.jobNm}」과 실행 이력을 함께 삭제합니다. 삭제할까요?`,
      alertType: "confirm",
      onConfirm: () => {
        void (async () => {
          setActionBusy(true);
          try {
            await jobSchedApi.remove(form.jobId);
            select("");
            detailRef.current?.load(null);
            clearHistory();
            await loadList();
            showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true });
          } catch (e) {
            fail(e);
          } finally {
            setActionBusy(false);
          }
        })();
      },
    });
  }, [showMessage, clearHistory, loadList, fail]);

  const handleAction = useCallback(
    (action: JobDetailAction) => {
      if (action === "save") void doSave();
      else if (action === "copy") doCopy();
      else if (action === "toggleUse") void doToggleUse();
      else if (action === "runNow") doRunNow();
      else doDelete();
    },
    [doSave, doCopy, doToggleUse, doRunNow, doDelete],
  );

  const setFilter = useCallback(<K extends keyof JobListFilters>(key: K, value: JobListFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isBusy = listBusy || actionBusy;

  const pageButtons: PageButton[] = [
    { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", action: "search", disabled: isBusy },
  ];

  const listButtons = useMemo(
    () => [{ id: "job_new", label: "새 작업", onClick: handleNew, disabled: !permissions.save || actionBusy }],
    [handleNew, permissions.save, actionBusy],
  );

  return (
    <PageLayout title="예약 작업 관리" breadcrumb="공통관리 > 시스템관리 > 예약 작업 관리" screenId={SCREEN_ID} objId={SCREEN_ID} buttons={pageButtons}>
      <SearchArea onSearch={() => void handleSearch()} autoSearch>
        <SearchField label="모듈" name="moduleCd" type="select" options={MODULE_FILTER_OPTIONS} value={filters.moduleCd} onChange={(v) => setFilter("moduleCd", v)} />
        <SearchField label="유형" name="jobKind" type="select" options={KIND_FILTER_OPTIONS} value={filters.jobKind} onChange={(v) => setFilter("jobKind", v)} />
        <SearchField label="사용" name="useYn" type="select" options={USE_FILTER_OPTIONS} value={filters.useYn} onChange={(v) => setFilter("useYn", v)} />
        <SearchField label="최근 결과" defaultKey="lastStatus" type="select" options={STATUS_FILTER_OPTIONS} value={filters.lastStatus} onChange={(v) => setFilter("lastStatus", v)} />
        <SearchField label="이름/ID" defaultKey="keyword" placeholder="작업명·작업 ID" value={filters.keyword} onChange={(v) => setFilter("keyword", v)} />
      </SearchArea>

      <div data-testid="job-sched-page" style={{ display: "contents" }}>
        <ContentBody root resizable storageKey="mcm.csa.jobSchedMng">
          <ContentBody direction="column" resizable storageKey="mcm.csa.jobSchedMng.left" flex="1 1 0">
            <ContentPanel panelId="job-list">
              <GridPanel title="작업 목록" count={jobs.length} headerExtra={<MaxHandle panelId="job-list" />} buttons={listButtons} loading={listBusy}>
                <AgDataGrid
                  gridId="jobList"
                  rowKey="jobId"
                  columns={JOB_COLUMNS}
                  data={jobs}
                  columnSizing="fixed"
                  highlightedRowKey={selectedId || null}
                  onRowClick={handleRowClick}
                  loading={listBusy}
                />
              </GridPanel>
            </ContentPanel>
            <ContentPanel height="40%">
              <HistoryPanel title={historyTitle} rows={runs} loading={historyBusy} />
            </ContentPanel>
          </ContentBody>
          <ContentPanel width={560}>
            <JobDetailForm ref={detailRef} handlers={handlers} busy={actionBusy} permissions={permissions} lastFailure={lastFailure} onAction={handleAction} />
          </ContentPanel>
        </ContentBody>
      </div>

      <KindPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePickKind} />
    </PageLayout>
  );
}

export type { JobForm };
