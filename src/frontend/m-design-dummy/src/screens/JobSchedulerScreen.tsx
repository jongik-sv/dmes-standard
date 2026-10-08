/**
 * 예약 작업 관리 — 화면 시안(mock 데이터만 사용, 백엔드 호출 없음).
 * 설계 문서: docs/superpowers/specs/2026-10-08-job-scheduler-design.md (§8 관리 화면)
 * 구조는 위젯관리(m-mcm csa/commWidgetMng)를 따른다: 조회 조건 + 왼쪽 목록(위) / 실행 이력(아래) + 오른쪽 상세
 * (공통 칸 → 일정 → 유형 편집 → 변수 → 고급), [새 작업] → 유형 고르기 → 빈 상세, [복사]·[저장]·[삭제] 흐름.
 * 시안에서 설계 문서와 달라진 점: 실행 유형 6종(코드·BPMN·쿼리·수집·HTTP·보관 삭제), 모든 유형이 변수 표를 가짐,
 * 고급 설정(재시도·이어 실행·실패 알림)은 제안 항목.
 */
import { useCallback, useMemo, useState } from "react";
import {
  ContentBody,
  ContentPanel,
  MaxHandle,
  PageLayout,
  ResizableFormPanel,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  INITIAL_JOBS,
  JOB_KINDS,
  JOB_MODULES,
  RUN_STATUS_LABEL,
  type JobConfig,
  type JobKind,
  type JobRecord,
  type RunRecord,
  type RunStatus,
} from "../data/job-scheduler-mock";
import { StatusBadge } from "../components/StatusBadge";
import { describeCron, formatDateTime, parseCron, runTimes } from "./job-scheduler/cron";
import { buildAllHistory, formatDuration } from "./job-scheduler/history-seed";
import { JobDetailForm } from "./job-scheduler/JobDetailForm";
import { KindBadges, RunStatusBadge, UseBadge } from "./job-scheduler/JobBadges";
import { blankJob, copyForm, isFormDirty, toForm, toRecord, validateJob, type JobForm } from "./job-scheduler/job-form";
import { JOB_KIND_INFO } from "./job-scheduler/job-kinds";
import { KindPickerModal } from "./job-scheduler/KindPickerModal";

type JobGridRow = {
  jobId: string;
  module: string;
  name: string;
  kind: JobKind;
  kindLabel: string;
  cron: string;
  scheduleDesc: string;
  useYn: "Y" | "N";
  nextRun: string;
  lastStatus: string;
  lastServer: string;
  codeMissing: boolean;
};

type HistoryGridRow = {
  id: string;
  schedAt: string;
  trigger: string;
  status: RunStatus;
  server: string;
  startedAt: string;
  endedAt: string;
  duration: string;
  itemCnt: number | null;
  message: string;
};

interface Filters {
  module: string;
  kind: string;
  use: string;
  status: string;
  keyword: string;
}

const EMPTY_FILTERS: Filters = { module: "", kind: "", use: "", status: "", keyword: "" };

const ALL = { value: "", label: "전체" };
const MODULE_FILTER_OPTIONS = [ALL, ...JOB_MODULES.map((m) => ({ value: m, label: m }))];
const KIND_FILTER_OPTIONS = [ALL, ...JOB_KINDS.map((k) => ({ value: k, label: JOB_KIND_INFO[k].label }))];
const USE_FILTER_OPTIONS = [ALL, { value: "Y", label: "사용" }, { value: "N", label: "중지" }];
const STATUS_FILTER_OPTIONS = [
  ALL,
  ...(["OK", "FAIL", "RUN", "SKIP", "TIMEOUT"] as RunStatus[]).map((s) => ({ value: s, label: RUN_STATUS_LABEL[s] })),
];

const JOB_COLUMNS: GridColumn[] = [
  { key: "module", header: "모듈", width: 64, align: "center", meta: false },
  { key: "jobId", header: "작업 ID", width: 172, align: "left", meta: false },
  { key: "name", header: "작업명", width: 160, align: "left", meta: false },
  {
    key: "kindLabel",
    header: "유형",
    width: 156,
    align: "left",
    meta: false,
    render: (v, row) => <KindBadges label={String(v ?? "")} codeMissing={row.codeMissing === true} />,
  },
  { key: "cron", header: "crontab 식", width: 124, align: "left", meta: false },
  { key: "scheduleDesc", header: "일정 설명", width: 150, align: "left", meta: false },
  { key: "useYn", header: "사용", width: 64, align: "center", meta: false, render: (v) => <UseBadge useYn={String(v)} /> },
  { key: "nextRun", header: "다음 예정", width: 132, align: "center", meta: false },
  { key: "lastStatus", header: "최근 결과", width: 90, align: "center", meta: false, render: (v) => <RunStatusBadge status={String(v ?? "")} /> },
  { key: "lastServer", header: "최근 실행 서버", width: 160, align: "left", meta: false },
];

const HISTORY_COLUMNS: GridColumn[] = [
  { key: "schedAt", header: "예정 시각", width: 128, align: "center", meta: false },
  { key: "trigger", header: "구분", width: 60, align: "center", meta: false },
  { key: "status", header: "상태", width: 84, align: "center", meta: false, render: (v) => <RunStatusBadge status={String(v ?? "")} /> },
  { key: "server", header: "실행 서버", width: 160, align: "left", meta: false },
  { key: "startedAt", header: "시작", width: 150, align: "center", meta: false },
  { key: "endedAt", header: "끝", width: 150, align: "center", meta: false },
  { key: "duration", header: "소요", width: 80, align: "right", meta: false },
  { key: "itemCnt", header: "건수", width: 70, align: "right", meta: false, render: (v) => (v == null ? "" : Number(v).toLocaleString()) },
  { key: "message", header: "메시지", width: 280, minWidth: 160, align: "left", meta: false },
];

function toGridRow(job: JobRecord, last: RunRecord | undefined, now: Date): JobGridRow {
  const parsed = parseCron(job.cron);
  const next =
    job.useYn === "Y" && !job.codeMissing && parsed.ok ? (runTimes(parsed.cron, now, 1)[0] ?? null) : null;
  return {
    jobId: job.jobId,
    module: job.module,
    name: job.name,
    kind: job.kind,
    kindLabel: JOB_KIND_INFO[job.kind].label,
    cron: job.cron,
    scheduleDesc: describeCron(job.cron),
    useYn: job.useYn,
    nextRun: next ? formatDateTime(next) : "-",
    lastStatus: last?.status ?? "",
    lastServer: last?.server ?? "",
    codeMissing: job.codeMissing === true,
  };
}

const toHistoryRow = (r: RunRecord): HistoryGridRow => ({
  id: r.id,
  schedAt: r.schedAt,
  trigger: r.trigger,
  status: r.status,
  server: r.server,
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  duration: formatDuration(r.durationSec),
  itemCnt: r.itemCnt,
  message: r.message,
});

export function JobSchedulerScreen() {
  const { showMessage } = useMessage();
  const [clock, setClock] = useState(() => new Date());
  const [jobs, setJobs] = useState<JobRecord[]>(INITIAL_JOBS);
  const [histories, setHistories] = useState<Record<string, RunRecord[]>>(() => buildAllHistory(INITIAL_JOBS, new Date()));
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  /** 저장된 작업을 고른 경우의 ID. 새 작업(저장 전)이거나 선택이 없으면 "". */
  const [selectedId, setSelectedId] = useState("mcm.lineUtilization");
  const [form, setForm] = useState<JobForm | null>(() => toForm(INITIAL_JOBS.find((j) => j.jobId === "mcm.lineUtilization") ?? INITIAL_JOBS[0]));
  const [baseline, setBaseline] = useState<JobForm | null>(form);
  const [pickerOpen, setPickerOpen] = useState(false);

  const rows = useMemo(() => jobs.map((j) => toGridRow(j, histories[j.jobId]?.[0], clock)), [jobs, histories, clock]);
  const visibleRows = useMemo(() => {
    const kw = applied.keyword.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!applied.module || r.module === applied.module) &&
        (!applied.kind || r.kind === applied.kind) &&
        (!applied.use || r.useYn === applied.use) &&
        (!applied.status || r.lastStatus === applied.status) &&
        (!kw || r.jobId.toLowerCase().includes(kw) || r.name.toLowerCase().includes(kw)),
    );
  }, [rows, applied]);

  const savedJob = selectedId ? (jobs.find((j) => j.jobId === selectedId) ?? null) : null;
  const historyRows = useMemo(() => (selectedId ? (histories[selectedId] ?? []).map(toHistoryRow) : []), [histories, selectedId]);
  const lastRun = selectedId ? histories[selectedId]?.[0] : undefined;

  const dirty = form ? form.isNew || isFormDirty(baseline, form) : false;
  const errors = useMemo(() => (form ? validateJob(form, jobs.map((j) => j.jobId)) : []), [form, jobs]);

  const openForm = useCallback((next: JobForm | null, id: string) => {
    setSelectedId(id);
    setForm(next);
    setBaseline(next);
  }, []);

  const guard = useCallback(
    (message: string, action: () => void) => {
      if (!dirty) {
        action();
        return;
      }
      showMessage({ title: "확인", message, alertType: "confirm", onConfirm: action });
    },
    [dirty, showMessage],
  );

  const handleSearch = useCallback(() => {
    setApplied(draft);
    setClock(new Date());
  }, [draft]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const id = String(row.jobId);
      if (id === selectedId && form && !form.isNew) return;
      guard("저장하지 않은 변경을 버릴까요?", () => {
        const job = jobs.find((j) => j.jobId === id);
        if (job) openForm(toForm(job), id);
      });
    },
    [selectedId, form, guard, jobs, openForm],
  );

  const handleNewClick = () => guard("저장하지 않은 변경을 버릴까요?", () => setPickerOpen(true));

  const handlePickKind = (kind: JobKind) => {
    setPickerOpen(false);
    openForm(blankJob(kind), "");
  };

  const handleCopy = () => {
    if (!baseline || baseline.isNew || baseline.kind === "CODE") return;
    guard("저장하지 않은 변경을 버리고 복사할까요?", () => openForm(copyForm(baseline), ""));
  };

  const patchForm = useCallback((patch: Partial<JobForm>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev)), []);
  const patchConfig = useCallback(
    (patch: Partial<JobConfig>) => setForm((prev) => (prev ? { ...prev, config: { ...prev.config, ...patch } } : prev)),
    [],
  );

  const handleSave = () => {
    if (!form) return;
    if (errors.length > 0) {
      showMessage({ message: errors[0], alertType: "warning" });
      return;
    }
    const record = toRecord({ ...form, jobId: form.jobId.trim(), name: form.name.trim() });
    setJobs((prev) => (form.isNew ? [...prev, record] : prev.map((j) => (j.jobId === record.jobId ? record : j))));
    if (form.isNew) setHistories((prev) => ({ ...prev, [record.jobId]: [] }));
    openForm(toForm(record), record.jobId);
    showMessage({ message: "저장되었습니다. 다음 분부터 새 일정으로 실행합니다(MCM 서버가 여러 대면 최대 30초 늦을 수 있습니다).", alertType: "success", toast: true });
  };

  const handleToggleUse = () => {
    if (!savedJob || !form || form.isNew) return;
    const nextUse = savedJob.useYn === "Y" ? "N" : "Y";
    setJobs((prev) => prev.map((j) => (j.jobId === savedJob.jobId ? { ...j, useYn: nextUse } : j)));
    setBaseline((prev) => (prev ? { ...prev, useYn: nextUse } : prev));
    setForm((prev) => (prev ? { ...prev, useYn: nextUse } : prev));
    showMessage({
      message: nextUse === "Y" ? "사용으로 바꿨습니다." : "사용을 중지했습니다. 일정에 따른 실행이 멈춥니다.",
      alertType: "success",
      toast: true,
    });
  };

  const handleRunNow = () => {
    if (!savedJob || !form || form.isNew) return;
    if (dirty) {
      showMessage({ message: "저장하지 않은 변경이 있습니다. 저장한 뒤 실행하세요.", alertType: "warning" });
      return;
    }
    if (savedJob.codeMissing) {
      showMessage({ message: "코드가 없는 작업은 실행할 수 없습니다.", alertType: "warning" });
      return;
    }
    if (histories[savedJob.jobId]?.[0]?.status === "RUN") {
      showMessage({ message: "이 작업은 이미 실행 중입니다. 끝난 뒤 다시 요청하세요.", alertType: "warning" });
      return;
    }
    showMessage({
      title: "확인",
      message: `「${savedJob.name}」을 지금 한 번 실행합니다. 일정은 바뀌지 않습니다. 실행할까요?`,
      alertType: "confirm",
      onConfirm: () => {
        const now = new Date();
        const row: RunRecord = {
          id: `${savedJob.jobId}#M${now.getTime()}`,
          schedAt: formatDateTime(now),
          trigger: "수동",
          status: "RUN",
          server: `mes-ap01:${savedJob.module.toLowerCase()}:4123`,
          startedAt: formatDateTime(now, true),
          endedAt: "",
          durationSec: null,
          itemCnt: null,
          message: "",
        };
        setHistories((prev) => ({ ...prev, [savedJob.jobId]: [row, ...(prev[savedJob.jobId] ?? [])] }));
        showMessage({ message: "실행을 요청했습니다. 해당 모듈 서버가 다음 분에 받아 실행합니다(최대 1분 30초).", alertType: "success", toast: true });
      },
    });
  };

  const handleDelete = () => {
    if (!savedJob) return;
    if (savedJob.kind === "CODE") {
      showMessage({ message: "코드 작업은 지울 수 없습니다. 일정을 멈추려면 [사용/중지]를 쓰세요.", alertType: "warning" });
      return;
    }
    showMessage({
      title: "확인",
      message: `「${savedJob.name}」과 실행 이력을 함께 삭제합니다. 삭제할까요?`,
      alertType: "confirm",
      onConfirm: () => {
        setJobs((prev) => prev.filter((j) => j.jobId !== savedJob.jobId).map((j) => (j.nextJobId === savedJob.jobId ? { ...j, nextJobId: "" } : j)));
        setHistories((prev) => {
          const { [savedJob.jobId]: _removed, ...rest } = prev;
          return rest;
        });
        openForm(null, "");
        showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true });
      },
    });
  };

  const saved = !!form && !form.isNew;
  const listButtons = [
    { id: "job_new", label: "새 작업", onClick: handleNewClick },
    { id: "job_copy", label: "복사", onClick: handleCopy, disabled: !saved || form?.kind === "CODE" },
    { id: "job_save", label: dirty ? "저장 *" : "저장", onClick: handleSave, disabled: !form || !dirty },
    { id: "job_use", label: "사용/중지", onClick: handleToggleUse, disabled: !saved },
    { id: "job_run", label: "지금 실행", onClick: handleRunNow, disabled: !saved },
    { id: "job_delete", label: "삭제", onClick: handleDelete, disabled: !saved },
  ];

  const detailTitle = form ? (form.isNew ? "작업 상세 · 새 작업" : `작업 상세 · ${form.jobId}`) : "작업 상세";
  const historyTitle = savedJob ? `실행 이력 · ${savedJob.name}` : "실행 이력";
  const historyEmpty = !form
    ? "작업을 고르면 최근 실행 이력이 보입니다."
    : form.isNew
      ? "저장하고 실행되면 이력이 쌓입니다."
      : "아직 실행 이력이 없습니다.";

  return (
    <PageLayout
      title="예약 작업 관리"
      breadcrumb="시스템관리(시안) > 예약 작업 관리"
      screenId="MCM-JOB-001"
      buttons={[
        {
          id: "search",
          label: "조회",
          type: "primary",
          action: "search",
          onClick: handleSearch,
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField label="모듈" type="select" options={MODULE_FILTER_OPTIONS} value={draft.module} onChange={(v) => setFilter("module", v)} />
        <SearchField label="유형" type="select" options={KIND_FILTER_OPTIONS} value={draft.kind} onChange={(v) => setFilter("kind", v)} />
        <SearchField label="사용" type="select" options={USE_FILTER_OPTIONS} value={draft.use} onChange={(v) => setFilter("use", v)} />
        <SearchField label="최근 결과" type="select" options={STATUS_FILTER_OPTIONS} value={draft.status} onChange={(v) => setFilter("status", v)} />
        <SearchField label="검색" placeholder="이름·ID" value={draft.keyword} onChange={(v) => setFilter("keyword", v)} historyKey="jobScheduler.keyword" />
      </SearchArea>

      <ContentBody root>
        <ContentPanel panelId="job-list">
          <div className="job-grid-stack">
            <div className="job-grid-stack__primary">
              <GridPanel
                title="작업 목록"
                count={visibleRows.length}
                headerExtra={<MaxHandle panelId="job-list" />}
                buttons={listButtons}
              >
                <AgDataGrid
                  gridId="jobList"
                  rowKey="jobId"
                  columns={JOB_COLUMNS}
                  data={visibleRows}
                  columnSizing="fixed"
                  highlightedRowKey={selectedId || null}
                  onRowClick={handleRowClick}
                  emptyMessage="조건에 맞는 예약 작업이 없습니다. 조건을 바꿔 [조회]하거나 [새 작업]으로 만드세요."
                />
              </GridPanel>
            </div>
            <div className="job-grid-stack__secondary">
              <GridPanel title={historyTitle} count={historyRows.length}>
                <AgDataGrid
                  gridId="jobHistory"
                  rowKey="id"
                  columns={HISTORY_COLUMNS}
                  data={historyRows}
                  columnSizing="fixed"
                  emptyMessage={historyEmpty}
                />
              </GridPanel>
            </div>
          </div>
        </ContentPanel>

        <ResizableFormPanel panelId="job-detail" defaultWidth={560} minWidth={420} maxWidth={820}>
          <div className="form-panel">
            <div className="grid-panel-header">
              <div className="grid-panel-title">
                <span>{detailTitle}</span>
              </div>
              {form && dirty ? <StatusBadge tone="warning">{form.isNew ? "저장 전" : "변경됨"}</StatusBadge> : null}
            </div>
            <div className="form-panel-content">
              <JobDetailForm
                form={form}
                jobs={jobs}
                lastRun={lastRun}
                errors={dirty ? errors : []}
                disabled={false}
                onChange={patchForm}
                onConfig={patchConfig}
              />
            </div>
          </div>
        </ResizableFormPanel>
      </ContentBody>

      <KindPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePickKind} />
    </PageLayout>
  );
}
