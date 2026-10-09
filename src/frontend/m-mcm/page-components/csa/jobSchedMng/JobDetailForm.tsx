"use client";

/**
 * 예약 작업 상세 — 공통 칸 → 일정(CronInput) → 유형별 입력 → 변수 표 → 고급(접힘). 아래 줄에 복사·사용/중지·지금 실행·삭제·저장.
 * 입력 state 는 이 컴포넌트에만 있다(화면 성능 가이드 R12). 루트는 ref 핸들(load·getForm·isDirty)로 대화하고, 단추를 누르면 onAction 으로 알린다.
 * 서버 호출은 하지 않는다. 일정 미리보기(cronPreview)만 이 안에서 부른다.
 */
import { memo, useCallback, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";

import { CardFrame, CardGroup, MutedText } from "@dk-oasis/shared/card";
import { CronInput, formatWithDow, validateCron, type CronPreview } from "@dk-oasis/shared/cron-input";
import { Badge, Button, Checkbox, Input, Radio, Select, Textarea } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { VariableTable, type JobVarRow } from "@dk-oasis/shared/variable-table";

import { jobSchedApi } from "./api";
import {
  applyHandler,
  changeModule,
  collectMinGapMin,
  isFormDirty,
  switchKind,
  validateForm,
  type JobForm,
} from "./form-model";
import { JOB_KIND_INFO, NEW_JOB_KINDS } from "./job-kinds";
import { KindEditor } from "./KindEditors";
import { JOB_MODULES, RUN_STATUS_LABEL, type HandlerRow, type JobKind, type RunStatus } from "./types";

export type JobDetailAction = "save" | "copy" | "toggleUse" | "runNow" | "delete";

export interface JobDetailHandle {
  /** 폼을 연다(기준 폼도 같은 값으로 둔다). null 이면 고른 작업이 없는 상태. */
  load(form: JobForm | null): void;
  getForm(): JobForm | null;
  /** 새 작업이거나 기준 폼과 달라졌는가. */
  isDirty(): boolean;
}

export interface JobDetailPermissions {
  save: boolean;
  setUse: boolean;
  runNow: boolean;
  delete: boolean;
}

/** 가장 최근 실행이 실패·시간 초과일 때 상단에 보이는 사유. */
export interface LastFailure {
  status: string;
  schedAt: string;
  serverNm: string;
  msg: string;
}

export interface JobDetailFormProps {
  ref: Ref<JobDetailHandle>;
  handlers: readonly HandlerRow[];
  /** 조회·저장 등 처리 중이면 단추를 막는다. */
  busy: boolean;
  permissions: JobDetailPermissions;
  lastFailure: LastFailure | null;
  onAction: (action: JobDetailAction) => void;
}

const REQUIRED_MARK = <span style={{ color: "var(--color-danger)" }}> *</span>;

const USE_OPTIONS = [
  { value: "Y", label: "사용" },
  { value: "N", label: "중지" },
];
const MODULE_OPTIONS = JOB_MODULES.map((m) => ({ value: m, label: m }));
const KIND_OPTIONS = NEW_JOB_KINDS.map((k) => ({ value: k, label: JOB_KIND_INFO[k].label }));

const STACK: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--spacing-sm)", padding: "var(--spacing-sm)" };

function Row({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <tr>
      <th style={DETAIL_LABEL_CELL}>
        {label}
        {required ? REQUIRED_MARK : null}
      </th>
      <td style={DETAIL_VALUE_CELL}>{children}</td>
    </tr>
  );
}

/**
 * 아래 세 카드는 자기 칸이 바뀔 때만 다시 그린다. 상세 폼 state 가 한 글자마다 바뀌어도 CronInput·VariableTable·고급 입력은 props 가 그대로라 건너뛴다
 * (shared 의 CardFrame·CronInput·VariableTable 이 memo 가 아니므로 화면에서 막는다. 화면 성능 가이드 R12 「함께 할 것」).
 */
interface ScheduleCardProps {
  openSeq: number;
  value: string;
  disabled: boolean;
  minGapMin: number | undefined;
  preview: CronPreview | null;
  onRequestPreview: (expr: string) => void;
  onChange: (value: string) => void;
}

const ScheduleCard = memo(function ScheduleCard({ openSeq, value, disabled, minGapMin, preview, onRequestPreview, onChange }: ScheduleCardProps) {
  return (
    <CardFrame title="일정" testId="job-card-schedule">
      <CronInput key={openSeq} value={value} disabled={disabled} minGapMin={minGapMin} preview={preview} onRequestPreview={onRequestPreview} onChange={onChange} />
    </CardFrame>
  );
});

interface VariablesCardProps {
  vars: JobVarRow[];
  valueOnly: boolean;
  disabled: boolean;
  hint: string | undefined;
  onChange: (vars: JobVarRow[]) => void;
}

const VariablesCard = memo(function VariablesCard({ vars, valueOnly, disabled, hint, onChange }: VariablesCardProps) {
  return (
    <CardFrame title="변수" testId="job-card-variables">
      <VariableTable value={vars} mode={valueOnly ? "valueOnly" : "full"} disabled={disabled} hint={hint} idPrefix="job-variable" onChange={onChange} />
    </CardFrame>
  );
});

interface AdvancedCardProps {
  timeoutSec: string;
  retryCount: string;
  retryIntervalMin: string;
  misfireRunOnce: boolean;
  disabled: boolean;
  onPatch: (patch: Partial<JobForm>) => void;
}

const AdvancedCard = memo(function AdvancedCard({ timeoutSec, retryCount, retryIntervalMin, misfireRunOnce, disabled, onPatch }: AdvancedCardProps) {
  return (
    <CardGroup id="advanced" title="고급 설정" testIdPrefix="job-group" defaultOpen={false}>
      <CardFrame title="시간 초과 · 재시도" testId="job-card-advanced">
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <Row label="시간 초과(초)" required>
              <Input type="number" min={10} max={86400} value={timeoutSec} disabled={disabled} data-testid="job-timeout" onChange={(v) => onPatch({ timeoutSec: v })} />
            </Row>
            <Row label="실패 시 재시도">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)" }}>
                <div style={{ width: 80 }}>
                  <Input type="number" min={0} max={5} value={retryCount} disabled={disabled} aria-label="재시도 횟수" onChange={(v) => onPatch({ retryCount: v })} />
                </div>
                <span>회, 간격</span>
                <div style={{ width: 80 }}>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={retryIntervalMin}
                    disabled={disabled || Number(retryCount) === 0}
                    aria-label="재시도 간격(분)"
                    onChange={(v) => onPatch({ retryIntervalMin: v })}
                  />
                </div>
                <span>분</span>
              </div>
            </Row>
            <Row label="놓친 회차">
              <Checkbox
                label="서버가 꺼져 있어 놓친 회차를 한 번 실행"
                checked={misfireRunOnce}
                disabled={disabled}
                data-testid="job-misfire-run-once"
                onChange={(on) => onPatch({ misfireRunOnce: on })}
              />
            </Row>
          </tbody>
        </table>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "var(--spacing-xs)" }}>
          시간 초과를 넘기면 실행 기록이 시간 초과로 남습니다. 재시도는 최대 5회입니다. 놓친 회차는 2분 넘게 늦은 회차이며, 켜면 건너뛰지 않고 한 번만 실행하고(이력 구분 「놓친 회차」) 끄면 건너뜀으로 남깁니다.
        </div>
      </CardFrame>
    </CardGroup>
  );
});

/** 저장을 막는 첫 오류 문구(없으면 null) — 일정 식 검사는 shared 의 validateCron 이 맡는다. */
export function checkForm(form: JobForm): string | null {
  const cronError = form.cronExpr.trim() === "" ? null : validateCron(form.cronExpr, collectMinGapMin(form));
  return validateForm(form, { cronError });
}

function JobDetailFormImpl({ ref, handlers, busy, permissions, lastFailure, onAction }: JobDetailFormProps) {
  const [form, setForm] = useState<JobForm | null>(null);
  const [baseline, setBaseline] = useState<JobForm | null>(null);
  const [preview, setPreview] = useState<CronPreview | null>(null);
  /** 폼을 열 때마다 올린다 — CronInput 을 새로 마운트해 같은 식이어도 서버 미리보기를 다시 받는다. */
  const [openSeq, setOpenSeq] = useState(0);

  const formRef = useRef<JobForm | null>(null);
  formRef.current = form;
  const dirtyRef = useRef(false);
  const dirty = form ? form.isNew || isFormDirty(baseline, form) : false;
  dirtyRef.current = dirty;
  /** 마지막으로 서버 미리보기를 요청한 식 — 늦게 온 낡은 응답을 버린다. */
  const previewExprRef = useRef("");

  useImperativeHandle(
    ref,
    () => ({
      load: (next) => {
        previewExprRef.current = "";
        setPreview(null);
        setOpenSeq((n) => n + 1);
        setForm(next);
        setBaseline(next);
      },
      getForm: () => formRef.current,
      isDirty: () => dirtyRef.current,
    }),
    [],
  );

  const patch = useCallback((p: Partial<JobForm>) => setForm((prev) => (prev ? { ...prev, ...p } : prev)), []);
  const handleCron = useCallback((v: string) => {
    previewExprRef.current = "";
    setPreview(null);
    setForm((prev) => (prev ? { ...prev, cronExpr: v } : prev));
  }, []);
  const handleRequestPreview = useCallback((expr: string) => {
    previewExprRef.current = expr;
    jobSchedApi
      .cronPreview(expr)
      .then((result) => {
        // 서버의 다음 예정은 ISO(Asia/Seoul 시각 그대로)다 — 입력 칸의 브라우저 계산과 같은 「날짜(요일) 시:분」 글자로 바꿔 보인다.
        const next = result.next?.map((t) => {
          const d = new Date(t);
          return Number.isNaN(d.getTime()) ? t : formatWithDow(d);
        });
        if (previewExprRef.current === expr) setPreview({ ...result, next });
      })
      .catch(() => {
        // 서버 미리보기를 못 받아도 브라우저 계산이 남는다.
      });
  }, []);
  const handleVars = useCallback((vars: JobVarRow[]) => patch({ vars }), [patch]);
  const handlePickHandler = useCallback((h: HandlerRow | null) => setForm((prev) => (prev ? applyHandler(prev, h) : prev)), []);

  const error = useMemo(() => (form && dirty ? checkForm(form) : null), [form, dirty]);

  if (!form) {
    return (
      <div className="data-table-empty" data-testid="job-detail-empty">
        왼쪽 목록에서 작업을 고르거나 [새 작업]을 눌러 만드세요.
      </div>
    );
  }

  const saved = !form.isNew;
  const info = JOB_KIND_INFO[form.jobKind];
  const codeOwned = form.ownerTp === "CODE" && saved;
  const isCodeKind = form.jobKind === "CODE";
  const disabled = busy;
  const failed = saved && lastFailure && (lastFailure.status === "FAIL" || lastFailure.status === "TIMEOUT");
  const statusBadge = dirty ? <Badge label={form.isNew ? "저장 전" : "변경됨"} tone="warning" /> : undefined;

  const copyEnabled = saved && !codeOwned && permissions.save && !busy;
  const useEnabled = saved && permissions.setUse && !busy;
  const runEnabled = saved && permissions.runNow && !busy && !form.codeMissing;
  const deleteEnabled = saved && form.ownerTp === "USER" && permissions.delete && !busy;
  const saveEnabled = dirty && permissions.save && !busy;

  return (
    <>
      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
        <div style={STACK}>
          {failed && lastFailure ? (
            <div
              role="alert"
              data-testid="job-last-failure"
              style={{
                border: "1px solid var(--color-danger)",
                background: "var(--color-danger-soft)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--spacing-xs) var(--spacing-md)",
                fontSize: "var(--font-size-sm)",
              }}
            >
              <strong>최근 실행이 {RUN_STATUS_LABEL[lastFailure.status as RunStatus] ?? lastFailure.status}했습니다.</strong>{" "}
              <span>{lastFailure.msg || "사유가 기록되지 않았습니다."}</span>{" "}
              <MutedText>
                ({lastFailure.schedAt} · {lastFailure.serverNm || "서버 미정"})
              </MutedText>
            </div>
          ) : null}

          <CardFrame title={saved ? `기본 · ${form.jobId}` : "기본 · 새 작업"} testId="job-card-basic" right={statusBadge}>
            <table style={DETAIL_TABLE_STYLE}>
              <tbody>
                <Row label="실행 모듈" required>
                  <Select
                    value={form.moduleCd}
                    options={MODULE_OPTIONS}
                    disabled={disabled || saved}
                    aria-label="실행 모듈"
                    data-testid="job-module"
                    onChange={(v) => setForm((prev) => (prev ? changeModule(prev, v) : prev))}
                  />
                </Row>
                <Row label="작업 ID" required>
                  <Input
                    value={form.jobId}
                    readOnly={saved}
                    disabled={disabled || saved}
                    maxLength={60}
                    placeholder={`예: ${form.moduleCd.toLowerCase()}.dailyReport (저장하면 바꿀 수 없습니다)`}
                    data-testid="job-id"
                    onChange={(v) => patch({ jobId: v })}
                  />
                </Row>
                <Row label="작업명" required>
                  <Input value={form.jobNm} disabled={disabled || codeOwned} maxLength={100} data-testid="job-name" onChange={(v) => patch({ jobNm: v })} />
                </Row>
                <Row label="유형">
                  {saved ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
                      <span style={{ display: "inline-flex", color: "var(--color-primary)" }}>{info.icon}</span>
                      <strong>{info.label}</strong>
                      <MutedText>({form.jobKind}) 저장한 뒤에는 바꿀 수 없습니다.</MutedText>
                      {form.codeMissing ? <Badge label="코드 없음" tone="danger" /> : null}
                    </div>
                  ) : (
                    <Select
                      value={form.jobKind}
                      options={KIND_OPTIONS}
                      disabled={disabled}
                      aria-label="유형"
                      data-testid="job-kind"
                      onChange={(v) => setForm((prev) => (prev ? switchKind(prev, v as JobKind) : prev))}
                    />
                  )}
                </Row>
                <Row label="설명">
                  <Textarea rows={2} value={form.jobDesc} disabled={disabled} maxLength={500} onChange={(v) => patch({ jobDesc: v })} />
                </Row>
                <Row label="사용">
                  <Radio name="jobUseYn" options={USE_OPTIONS} value={form.useYn} disabled={disabled} onChange={(v) => patch({ useYn: v === "N" ? "N" : "Y" })} />
                </Row>
              </tbody>
            </table>
          </CardFrame>

          <ScheduleCard
            openSeq={openSeq}
            value={form.cronExpr}
            disabled={disabled}
            minGapMin={collectMinGapMin(form)}
            preview={preview}
            onRequestPreview={handleRequestPreview}
            onChange={handleCron}
          />

          <CardFrame title={`${info.label} 설정`} testId="job-card-kind">
            <KindEditor form={form} handlers={handlers} disabled={disabled} onChange={patch} onPickHandler={handlePickHandler} />
          </CardFrame>

          <VariablesCard vars={form.vars} valueOnly={isCodeKind} disabled={disabled} hint={info.variableHint} onChange={handleVars} />

          <AdvancedCard
            timeoutSec={form.timeoutSec}
            retryCount={form.retryCount}
            retryIntervalMin={form.retryIntervalMin}
            misfireRunOnce={form.misfireRunOnce}
            disabled={disabled}
            onPatch={patch}
          />

          {error ? (
            <div
              role="alert"
              data-testid="job-form-errors"
              style={{
                border: "1px solid var(--color-danger)",
                background: "var(--color-danger-soft)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--spacing-xs) var(--spacing-md)",
                fontSize: "var(--font-size-sm)",
              }}
            >
              <strong>저장할 수 없음</strong>
              <div className="form-error-message">{error}</div>
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", gap: "var(--spacing-sm)", justifyContent: "flex-end", alignItems: "center", padding: "var(--spacing-sm)" }}>
        <Button disabled={!copyEnabled} title={codeOwned ? "코드가 등록한 작업은 복사할 수 없습니다" : undefined} data-testid="job-copy" onClick={() => onAction("copy")}>
          복사
        </Button>
        <Button disabled={!useEnabled} data-testid="job-use" onClick={() => onAction("toggleUse")}>
          {form.useYn === "N" ? "사용으로" : "중지로"}
        </Button>
        <Button
          disabled={!runEnabled}
          title={form.codeMissing ? "코드가 없는 작업은 실행할 수 없습니다" : undefined}
          data-testid="job-run"
          onClick={() => onAction("runNow")}
        >
          지금 실행
        </Button>
        <Button
          variant="danger"
          disabled={!deleteEnabled}
          title={saved && form.ownerTp !== "USER" ? "코드가 등록한 작업은 지울 수 없습니다. 사용을 중지하세요" : undefined}
          data-testid="job-delete"
          onClick={() => onAction("delete")}
        >
          삭제
        </Button>
        <Button variant="primary" disabled={!saveEnabled} data-testid="job-save" onClick={() => onAction("save")}>
          저장
        </Button>
      </div>
    </>
  );
}

/** 루트가 조회 조건 입력·목록 갱신으로 다시 그려져도 busy·권한·마지막 실패가 그대로면 건너뛴다. */
export const JobDetailForm = memo(JobDetailFormImpl);
