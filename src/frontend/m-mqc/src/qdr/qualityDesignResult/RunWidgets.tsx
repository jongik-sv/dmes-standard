"use client";

/**
 * 파이프라인 결과 작은 부품 — 6단계 판정 띠, 이상징후 목록, 단계 근거(룰 호출) 목록. 품질설계결과·시뮬레이션 공용.
 */
import { memo } from "react";

import { Badge } from "@dk-oasis/shared/form";

import { openRuleEdit } from "@/common/rule/open-rule-edit";

import {
  EVIDENCE_STATUS_LABEL,
  EVIDENCE_STATUS_TONE,
  evidenceTitle,
  openScreen,
  ruleRef,
  screenTitle,
  stageLabel,
  verdictText,
} from "./format";
import type { Anomaly, Evidence, Stage } from "./types";

/** 판정 → 띠 칸 색 클래스. */
export function stageClass(s: Pick<Stage, "verdict" | "advisory">): string {
  if (s.advisory) return "gy adv";
  if (s.verdict === "P") return "ok";
  if (s.verdict === "F") return "no";
  if (s.verdict === "C") return "wa";
  return "gy";
}

export const StageStrip = memo(function StageStrip({
  stages,
  active,
  onSelect,
}: {
  stages: Stage[];
  active?: number;
  onSelect?: (no: number) => void;
}) {
  return (
    <div className="mqc-qd-stages" role={onSelect ? "tablist" : undefined} aria-label="설계 파이프라인 단계">
      {stages.map((s) => {
        const cls = ["mqc-qd-stage", stageClass(s)];
        if (onSelect) cls.push("btn");
        if (active === s.no) cls.push("on");
        const label = s.advisory ? "참고값" : verdictText(s.verdict);
        const body = (
          <>
            <div className="mqc-qd-stage-t">{stageLabel(s)}</div>
            <div className="mqc-qd-stage-s">
              {label}
              {s.summary ? ` · ${s.summary}` : ""}
            </div>
          </>
        );
        return onSelect ? (
          <button
            key={s.no}
            type="button"
            role="tab"
            aria-selected={active === s.no}
            className={cls.join(" ")}
            title={`${stageLabel(s)} — ${label}${s.summary ? " · " + s.summary : ""}`}
            onClick={() => onSelect(s.no)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const i = stages.findIndex((x) => x.no === s.no);
                const next = stages[i + (e.key === "ArrowRight" ? 1 : -1)];
                if (next) onSelect(next.no);
              }
            }}
          >
            {body}
          </button>
        ) : (
          <div key={s.no} className={cls.join(" ")} title={`${stageLabel(s)} — ${label}${s.summary ? " · " + s.summary : ""}`}>
            {body}
          </div>
        );
      })}
    </div>
  );
});

const SEVERITY_TONE = { error: "danger", warn: "warning", info: "neutral" } as const;
const SEVERITY_LABEL = { error: "오류", warn: "경고", info: "참고" } as const;

export const AnomalyList = memo(function AnomalyList({ anomalies, empty = "이상징후가 없습니다." }: { anomalies: Anomaly[]; empty?: string }) {
  if (!anomalies.length) return <div className="mqc-qd-muted">{empty}</div>;
  return (
    <div className="mqc-qd-anoms">
      {anomalies.map((a, i) => (
        <div key={`${a.kind}-${i}`} className="mqc-qd-anom">
          <Badge label={`${SEVERITY_LABEL[a.severity] ?? a.severity} · ${a.label}`} tone={SEVERITY_TONE[a.severity] ?? "neutral"} />
          <span>{a.detail}</span>
          {a.ref ? <span className="mqc-qd-muted mqc-qd-mono">{a.ref}</span> : null}
        </div>
      ))}
    </div>
  );
});

/** 룰 호출 한 건 — 이름, 상태, ID·버전·적중 행, 기준 화면·Maru 열기. */
export function EvidenceLine({ e }: { e: Evidence }) {
  return (
    <div className="mqc-qd-ev">
      <Badge label={EVIDENCE_STATUS_LABEL[e.status] ?? e.status} tone={EVIDENCE_STATUS_TONE[e.status] ?? "neutral"} />
      <b>{evidenceTitle(e)}</b>
      <span className="mqc-qd-mono">{ruleRef(e.ruleId, e.ver, e.ruleKey, e.seq)}</span>
      {e.message ? <span className="mqc-qd-muted">{e.message}</span> : null}
      {e.screen ? (
        <button type="button" className="mqc-qd-link" onClick={() => openScreen(e.screen)}>
          {screenTitle(e.screen)} 열기 →
        </button>
      ) : null}
      {e.status !== "UNAVAILABLE" ? (
        <button type="button" className="mqc-qd-link" onClick={() => openRuleEdit(e.ruleId, e.ver)}>
          Maru 룰 →
        </button>
      ) : null}
    </div>
  );
}

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <div className="mqc-qd-muted">이 단계는 기준 룰을 부르지 않았습니다.</div>;
  return (
    <div className="mqc-qd-anoms">
      {evidence.map((e, i) => (
        <EvidenceLine key={`${e.ruleId}-${i}`} e={e} />
      ))}
    </div>
  );
}
