/**
 * 예약 작업 상세 — 공통 칸 표 + 일정(CronInput) + 유형별 편집 영역 + 변수 표 + 고급(접힘).
 * 위젯관리 상세(WidgetDetailForm)와 같은 순서로 "공통 칸 → 유형 편집기" 를 쌓는다.
 */
import type { CSSProperties, ReactNode } from "react";
import { Input, Radio, Select, Textarea } from "@dk-oasis/shared/form";
import { CardFrame, CardGroup, MutedText } from "@dk-oasis/shared/card";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { JOB_MODULES, RUN_STATUS_LABEL, type JobConfig, type JobModule, type JobRecord, type RunRecord } from "../../data/job-scheduler-mock";
import { StatusBadge } from "../../components/StatusBadge";
import { CronInput } from "./CronInput";
import { collectMinGapMin, type JobForm } from "./job-form";
import { JOB_KIND_INFO } from "./job-kinds";
import { KindEditor } from "./KindEditors";
import { VariableTable } from "./VariableTable";

const REQUIRED_MARK = <span style={{ color: "var(--color-danger)" }}> *</span>;

const USE_OPTIONS = [
  { value: "Y", label: "사용" },
  { value: "N", label: "중지" },
];

const MODULE_OPTIONS = JOB_MODULES.map((m) => ({ value: m, label: m }));

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

const STACK: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--spacing-sm)", padding: "var(--spacing-sm)" };

export interface JobDetailFormProps {
  /** null 이면 고른 작업이 없다. */
  form: JobForm | null;
  /** 이어 실행할 작업 선택지를 만들 전체 작업. */
  jobs: readonly JobRecord[];
  /** 가장 최근 실행 기록 — 실패·시간 초과면 상단에 사유를 보인다. */
  lastRun?: RunRecord;
  /** 저장을 막는 오류. */
  errors: readonly string[];
  disabled: boolean;
  onChange: (patch: Partial<JobForm>) => void;
  onConfig: (patch: Partial<JobConfig>) => void;
}

export function JobDetailForm({ form, jobs, lastRun, errors, disabled, onChange, onConfig }: JobDetailFormProps) {
  if (!form) {
    return (
      <div className="data-table-empty" data-testid="job-detail-empty">
        왼쪽 목록에서 작업을 고르거나 [새 작업]을 눌러 만드세요.
      </div>
    );
  }

  const info = JOB_KIND_INFO[form.kind];
  const isCode = form.kind === "CODE";
  const nextOptions = [
    { value: "", label: "(없음)" },
    ...jobs.filter((j) => j.jobId !== form.jobId).map((j) => ({ value: j.jobId, label: `${j.jobId} · ${j.name}` })),
  ];
  const failed = !form.isNew && lastRun && (lastRun.status === "FAIL" || lastRun.status === "TIMEOUT");

  return (
    <div style={STACK}>
      {failed && lastRun ? (
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
          <strong>최근 실행이 {RUN_STATUS_LABEL[lastRun.status]}했습니다.</strong>{" "}
          <span>{lastRun.message || "사유가 기록되지 않았습니다."}</span>{" "}
          <MutedText>
            ({lastRun.schedAt} · {lastRun.server})
          </MutedText>
        </div>
      ) : null}

      <CardFrame title="기본" testId="job-card-basic">
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <Row label="모듈" required>
              <Select
                value={form.module}
                options={MODULE_OPTIONS}
                disabled={disabled || !form.isNew}
                aria-label="모듈"
                onChange={(v) => onChange({ module: v as JobModule })}
              />
            </Row>
            <Row label="작업 ID" required>
              <Input
                value={form.jobId}
                readOnly={!form.isNew}
                disabled={disabled || !form.isNew}
                maxLength={60}
                placeholder={`예: ${form.module.toLowerCase()}.dailyReport (저장하면 바꿀 수 없습니다)`}
                onChange={(v) => onChange({ jobId: v })}
              />
            </Row>
            <Row label="작업명" required={!isCode}>
              <Input value={form.name} disabled={disabled || isCode} maxLength={100} onChange={(v) => onChange({ name: v })} />
            </Row>
            <Row label="유형">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
                <span style={{ display: "inline-flex", color: "var(--color-primary)" }}>{info.icon}</span>
                <strong>{info.label}</strong>
                <MutedText>({form.kind}) 저장한 뒤에는 바꿀 수 없습니다.</MutedText>
                {form.codeMissing ? <StatusBadge tone="danger">코드 없음</StatusBadge> : null}
              </div>
            </Row>
            <Row label="설명">
              <Textarea rows={2} value={form.desc} disabled={disabled || isCode} maxLength={500} onChange={(v) => onChange({ desc: v })} />
            </Row>
            <Row label="사용">
              <Radio name="jobUseYn" options={USE_OPTIONS} value={form.useYn} disabled={disabled} onChange={(v) => onChange({ useYn: v === "N" ? "N" : "Y" })} />
            </Row>
          </tbody>
        </table>
      </CardFrame>

      <CardFrame title="일정" testId="job-card-schedule">
        <CronInput value={form.cron} disabled={disabled} minGapMin={collectMinGapMin(form)} onChange={(v) => onChange({ cron: v })} />
      </CardFrame>

      <CardFrame title={`${info.label} 설정`} testId="job-card-kind">
        <KindEditor form={form} onConfig={onConfig} disabled={disabled} />
      </CardFrame>

      <CardFrame title="변수" testId="job-card-variables">
        <VariableTable kind={form.kind} variables={form.variables} disabled={disabled} onChange={(variables) => onChange({ variables })} />
      </CardFrame>

      <CardGroup id="advanced" title="고급 설정 (제안)" testIdPrefix="job-group" defaultOpen={false}>
        <CardFrame title="시간 초과·재시도·후속 작업·알림" testId="job-card-advanced">
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <Row label="시간 초과(초)" required>
                <Input type="number" min={1} value={form.timeoutSec} disabled={disabled} onChange={(v) => onChange({ timeoutSec: v })} />
              </Row>
              <Row label="실패 시 재시도">
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)" }}>
                  <div style={{ width: 80 }}>
                    <Input type="number" min={0} value={form.retryCount} disabled={disabled || isCode} aria-label="재시도 횟수" onChange={(v) => onChange({ retryCount: v })} />
                  </div>
                  <span>회, 간격</span>
                  <div style={{ width: 80 }}>
                    <Input type="number" min={1} value={form.retryIntervalMin} disabled={disabled || isCode || Number(form.retryCount) === 0} aria-label="재시도 간격(분)" onChange={(v) => onChange({ retryIntervalMin: v })} />
                  </div>
                  <span>분</span>
                </div>
              </Row>
              <Row label="성공하면 이어 실행">
                <Select value={form.nextJobId} options={nextOptions} disabled={disabled || isCode} aria-label="이어 실행할 작업" onChange={(v) => onChange({ nextJobId: v })} />
              </Row>
              <Row label="실패 알림 받는 사람">
                <Input value={form.alertTo} disabled={disabled || isCode} placeholder="이메일, 쉼표로 여러 명" onChange={(v) => onChange({ alertTo: v })} />
              </Row>
            </tbody>
          </table>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "var(--spacing-xs)" }}>
            설계 문서에 아직 없는 제안 항목입니다. 코드 작업은 시간 초과만 바꿀 수 있습니다.
          </div>
        </CardFrame>
      </CardGroup>

      {errors.length > 0 ? (
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
          <ul style={{ margin: "2px 0 0", paddingLeft: "var(--spacing-lg)" }}>
            {errors.map((m) => (
              <li key={m} className="form-error-message">
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
