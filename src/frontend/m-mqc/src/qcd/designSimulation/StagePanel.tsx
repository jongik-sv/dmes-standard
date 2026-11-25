"use client";

/**
 * 단계 패널 — ①~⑥ 한 단계의 상세(입력 누락·정합성 에러·단중·생산가부·사양 매칭·설계값)와 그 단계가 부른 기준 룰 근거.
 */
import { memo, useMemo, type ReactNode } from "react";

import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge } from "@dk-oasis/shared/form";

import { DesignAccordion, KvGrid } from "@/qdr/qualityDesignResult/DesignSections";
import { openScreen, screenTitle, stageLabel, verdictText, verdictTone } from "@/qdr/qualityDesignResult/format";
import { EvidenceList } from "@/qdr/qualityDesignResult/RunWidgets";
import { sectionOfPath, type SectionKey } from "@/qdr/qualityDesignResult/sections";
import type {
  ConsistencyDetail,
  FeasibilityDetail,
  InputDetail,
  PipelineRun,
  SpecDetail,
  Stage,
  WeightDetail,
} from "@/qdr/qualityDesignResult/types";

const OK_BADGE = { bg: "var(--color-success-soft)", color: "var(--color-success)" };
const NG_BADGE = { bg: "var(--color-danger-soft)", color: "var(--color-danger)" };
const WA_BADGE = { bg: "var(--color-warning-soft)", color: "var(--color-warning)" };

function stateBadge(state: string | null, label: string) {
  if (state === "P") return <GridBadge label={`${state} ${label}`} {...OK_BADGE} />;
  if (state === "C") return <GridBadge label={`${state} ${label}`} {...WA_BADGE} />;
  if (state === "-" || state === "X") return <GridBadge label={`${state} ${label}`} {...NG_BADGE} />;
  return <GridBadge label={label || "해당 없음"} muted />;
}

// ── ① 입력 ──
const INPUT_COLUMNS: GridColumn[] = [
  { key: "field", header: "항목", width: 2, minWidth: 130, align: "left", meta: false },
  { key: "label", header: "이름", width: 2, minWidth: 110, align: "left", meta: false },
  { key: "value", header: "주문값", width: 2, minWidth: 100, align: "left", meta: false },
  {
    key: "missing",
    header: "상태",
    width: 1,
    minWidth: 70,
    align: "center",
    meta: false,
    render: (v) => (v ? <GridBadge label="누락" {...NG_BADGE} /> : <GridBadge label="입력" {...OK_BADGE} />),
  },
];

function InputBody({ d }: { d: InputDetail }) {
  return (
    <div className="mqc-qd-blocks">
      <div className={d.missing?.length ? "mqc-qd-notice danger" : "mqc-qd-notice info"}>
        {d.missing?.length ? `필수 항목 누락: ${d.missing.join(", ")}` : "필수 항목이 모두 채워졌습니다."}
      </div>
      <AgDataGrid gridId="stage-input" title="필수 항목" rowKey="field" columns={INPUT_COLUMNS} data={(d.required ?? []) as unknown as Record<string, unknown>[]} height="auto" columnSizing="fit" personalize={false} />
    </div>
  );
}

// ── ② 정합성 ──
function ConsistencyBody({ d }: { d: ConsistencyDetail }) {
  if (!d.available) return <div className="mqc-qd-notice danger">주문정합성 룰을 불러오지 못했습니다. 이 단계는 판정하지 않았습니다.</div>;
  if (!d.fired?.length) return <div className="mqc-qd-notice info">발화한 에러 룰이 없습니다 — 통과.</div>;
  return (
    <div className="mqc-qd-blocks">
      <div className="mqc-qd-muted">에러 {d.errorCount}건 · 분류 순(누락 → 사용불가 → 불필요 → 한도위반 → 선택오류)</div>
      {d.fired.map((f, i) => (
        <div key={`${f.ruleKey}-${i}`} className="mqc-qd-card err">
          <div className="mqc-qd-row">
            <Badge label={`✕ ${f.errCd}`} tone="danger" mono />
            <b>{f.errMsg}</b>
            {f.concurrent ? <Badge label="동시발화" tone="warning" /> : null}
          </div>
          <div className="mqc-qd-row mqc-qd-muted">
            <span>대상 {f.targetLabel || f.targetItem}</span>
            <span>· 분류 {f.category}</span>
            <span>· 심각도 {f.severity}</span>
            <span>· 조치: {f.actor}</span>
            {f.ownerDept ? <span>· 담당 {f.ownerDept}</span> : null}
            <span className="mqc-qd-mono">· {f.ruleKey}</span>
            {f.source ? <span>· 출처 {f.source}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ③ 단중 ──
function WeightBody({ d }: { d: WeightDetail }) {
  const fmt = (n: number | null | undefined) => (n == null ? "—" : String(n));
  const verdict = d.inRange == null ? "판정 불가" : d.inRange ? "범위 안" : "범위 밖";
  return (
    <div className="mqc-qd-blocks">
      <div className={d.inRange === false ? "mqc-qd-notice danger" : d.inRange ? "mqc-qd-notice info" : "mqc-qd-notice"}>
        {d.inRange == null
          ? `판정할 수 없습니다${d.reason ? ` (${d.reason})` : ""}.`
          : `분할단중 ${fmt(d.unitWeight)} 이 허용범위 ${d.min}~${d.max} ${d.inRange ? "안에" : "밖에"} 있습니다.`}
      </div>
      <KvGrid
        items={[
          { label: "주문단중(MT)", value: fmt(d.weight) },
          { label: "분할 수", value: fmt(d.split) },
          { label: "분할 단중(MT/개)", value: fmt(d.unitWeight) },
          { label: "허용범위", value: `${d.min} ~ ${d.max}` },
          { label: "판정", value: verdict, flag: d.inRange === false ? "warn" : undefined },
          { label: "가능 분할수", value: d.okSplits?.length ? d.okSplits.join(", ") : "없음" },
        ]}
      />
      {d.note ? <div className="mqc-qd-muted">{d.note}</div> : null}
    </div>
  );
}

// ── ④ 생산가부 ──
const FEAS_COLUMNS: GridColumn[] = [
  {
    key: "line",
    header: "라인",
    width: 2,
    minWidth: 90,
    align: "left",
    meta: false,
    render: (v, row) => (
      <span>
        {String(v ?? "")} {row.main ? <GridBadge label="주공정" bg="var(--color-primary-soft)" color="var(--color-primary)" /> : null}
      </span>
    ),
  },
  { key: "title", header: "생산범위 시트", width: 3, minWidth: 150, align: "left", meta: false },
  { key: "matGrpNm", header: "재질그룹", width: 3, minWidth: 140, align: "left", meta: false },
  { key: "widthBand", header: "폭 밴드", width: 1, minWidth: 70, align: "right", meta: false },
  { key: "thk", header: "두께", width: 1, minWidth: 64, align: "right", meta: false },
  {
    key: "state",
    header: "판정",
    width: 2,
    minWidth: 100,
    align: "center",
    meta: false,
    render: (v, row) => stateBadge((v as string | null) ?? null, String(row.stateNm ?? "")),
  },
  {
    key: "flags",
    header: "비고",
    width: 2,
    minWidth: 110,
    align: "left",
    meta: false,
    render: (v) => (Array.isArray(v) ? v.join(", ") : ""),
  },
];

function FeasibilityBody({ d }: { d: FeasibilityDetail }) {
  return (
    <div className="mqc-qd-blocks">
      {d.missingSheet ? <div className="mqc-qd-notice danger">{d.missingSheet} 생산범위 시트가 없습니다 — 주공정을 판정하지 못했습니다.</div> : null}
      <div className="mqc-qd-muted">
        주공정 {d.mainLine ?? "-"} · 판정 {d.state ?? "-"} {d.stateNm ?? ""}
      </div>
      <AgDataGrid
        gridId="stage-feas"
        title="생산범위 시트별 판정"
        rowKey="ruleId"
        columns={FEAS_COLUMNS}
        data={(d.rows ?? []) as unknown as Record<string, unknown>[]}
        height="auto"
        columnSizing="fit"
        personalize={false}
      />
    </div>
  );
}

// ── ⑤ 사양 ──
const SPEC_ROW_COLUMNS: GridColumn[] = [
  { key: "attrNm", header: "항목", width: 2, minWidth: 110, align: "left", meta: false },
  { key: "base", header: "표준값", width: 2, minWidth: 90, align: "left", meta: false },
  { key: "value", header: "적용값", width: 2, minWidth: 90, align: "left", meta: false },
  {
    key: "srcs",
    header: "사양",
    width: 3,
    minWidth: 130,
    align: "left",
    meta: false,
    render: (v, row) => (
      <span>
        {Array.isArray(v) && v.length ? v.join(" → ") : "표준"}{" "}
        {row.conflict ? <GridBadge label="충돌" {...WA_BADGE} /> : null}
      </span>
    ),
  },
  { key: "path", header: "설계 경로", width: 2, minWidth: 110, align: "left", meta: false, render: (v) => (v ? String(v) : "미연결") },
];

function SpecBody({ d }: { d: SpecDetail }) {
  if (!d.available) return <div className="mqc-qd-notice">{d.note ?? "품질사양 표를 읽지 못해 이 단계를 건너뛰었습니다."}</div>;
  return (
    <div className="mqc-qd-blocks">
      {d.note ? <div className="mqc-qd-muted">{d.note}</div> : null}
      {!d.candidates?.length ? <div className="mqc-qd-muted">같은 고객사·품명의 품질사양이 없습니다.</div> : null}
      {(d.candidates ?? []).map((c) => (
        <div key={c.specNo} className="mqc-qd-card">
          <div className="mqc-qd-row">
            <b className="mqc-qd-mono">{c.specNo}</b>
            <Badge label={c.statusNm} />
            <Badge label={c.matched ? "조건 일치" : "조건 불일치"} tone={c.matched ? "success" : "neutral"} />
            {c.applied ? <Badge label="적용" tone="primary" /> : null}
            {c.excludedReason ? <span className="mqc-qd-muted">{c.excludedReason}</span> : null}
          </div>
          <div className="mqc-qd-row">
            <span className="mqc-qd-muted">IF</span>
            {c.conds.map((t, i) => (
              <Badge key={i} label={`${t.ok ? "✓" : "✕"} ${t.attrNm} ${t.op} ${t.val} (주문 ${t.orderVal ?? "없음"})`} tone={t.ok ? "success" : "danger"} />
            ))}
          </div>
          <div className="mqc-qd-row">
            <span className="mqc-qd-muted">THEN</span>
            {c.results.map((t, i) => (
              <Badge key={i} label={`${t.attrNm} ${t.op} ${t.val}${t.unit ? " " + t.unit : ""}`} tone="primary" />
            ))}
          </div>
        </div>
      ))}
      {d.conflicts?.length ? <div className="mqc-qd-notice">충돌: {d.conflicts.join(" · ")} (나중 사양이 이깁니다)</div> : null}
      <AgDataGrid
        gridId="stage-spec"
        title="적용 결과"
        rowKey="attrCd"
        columns={SPEC_ROW_COLUMNS}
        data={(d.rows ?? []) as unknown as Record<string, unknown>[]}
        height="auto"
        columnSizing="fit"
        personalize={false}
      />
    </div>
  );
}

// ── 패널 ──

export interface StagePanelProps {
  run: PipelineRun;
  stage: Stage;
  picked: string | null;
  onPick: (path: string) => void;
}

export const StagePanel = memo(function StagePanel({ run, stage, picked, onPick }: StagePanelProps) {
  const counts = useMemo(() => {
    const out: Partial<Record<SectionKey, number>> = {};
    for (const a of run.anomalies ?? []) {
      if (!a.ref || a.severity === "info") continue;
      const k = sectionOfPath(a.ref);
      if (k) out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }, [run]);

  let body: ReactNode;
  switch (stage.key) {
    case "input":
      body = <InputBody d={stage.detail as InputDetail} />;
      break;
    case "consistency":
      body = <ConsistencyBody d={stage.detail as ConsistencyDetail} />;
      break;
    case "weight":
      body = <WeightBody d={stage.detail as WeightDetail} />;
      break;
    case "feasibility":
      body = <FeasibilityBody d={stage.detail as FeasibilityDetail} />;
      break;
    case "spec":
      body = <SpecBody d={stage.detail as SpecDetail} />;
      break;
    case "design":
      body = (
        <DesignAccordion
          design={run.design}
          includeShape={false}
          defaultOpen={["common", "cgl"]}
          onPick={onPick}
          picked={picked}
          trace={run.design.trace}
          anomalyCounts={counts}
        />
      );
      break;
    default:
      body = null;
  }

  return (
    <div className="mqc-qd-blocks">
      <div className="mqc-qd-row">
        <b>{stageLabel(stage)}</b>
        <Badge label={stage.advisory ? "참고값" : verdictText(stage.verdict)} tone={verdictTone(stage.verdict, stage.advisory)} />
        {stage.blocked ? <Badge label="차단" tone="danger" /> : null}
        <span className="mqc-qd-muted">{stage.summary}</span>
        <span className="mqc-qd-spacer" />
        {stage.screen ? (
          <button type="button" className="mqc-qd-link" onClick={() => openScreen(stage.screen)}>
            {screenTitle(stage.screen)} 열기 →
          </button>
        ) : null}
      </div>
      {stage.advisory ? <div className="mqc-qd-notice">앞 단계에서 막혀 이 단계 결과는 참고값입니다.</div> : null}
      {body}
      <div className="mqc-qd-sub">근거 — 부른 기준 룰</div>
      <EvidenceList evidence={stage.evidence ?? []} />
    </div>
  );
});
