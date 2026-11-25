"use client";

/**
 * 근거 추적 — ⑥ 설계값에서 고른 값의 출처를 쌓아 보인다: 기준 룰(ID·버전·적중 행, 기준 화면·Maru 열기) ·
 * 품질사양 오버라이드(표준값 → 사양 → 값, 나중 사양이 이긴다) · 산식·표준값. 「기대값으로 고정」 으로 핀을 더한다. 아래는 이상징후 목록.
 */
import { memo } from "react";

import { Badge, Button } from "@dk-oasis/shared/form";

import { openRuleEdit } from "@/common/rule/open-rule-edit";
import { EVIDENCE_KIND_LABEL, EVIDENCE_KIND_TONE, openScreen, ruleRef, screenTitle } from "@/qdr/qualityDesignResult/format";
import { AnomalyList } from "@/qdr/qualityDesignResult/RunWidgets";
import type { Anomaly, ValueTrace } from "@/qdr/qualityDesignResult/types";

export interface TracePanelProps {
  path: string | null;
  traces: ValueTrace[];
  anomalies: Anomaly[];
  pinned: Set<string>;
  busy: boolean;
  onPin: (t: ValueTrace) => void;
}

function TraceCard({ t, pinned, busy, onPin }: { t: ValueTrace; pinned: boolean; busy: boolean; onPin: (t: ValueTrace) => void }) {
  const ref = ruleRef(t.ruleId, t.ver, t.ruleKey, t.seq);
  return (
    <div className={`mqc-qd-card${t.kind === "missing" ? " err" : ""}`}>
      <div className="mqc-qd-row">
        <b>{t.label}</b>
        <Badge label={EVIDENCE_KIND_LABEL[t.kind] ?? t.kind} tone={EVIDENCE_KIND_TONE[t.kind] ?? "neutral"} />
      </div>
      <div className="mqc-qd-row">
        <span className="mqc-qd-mono">{t.value == null || t.value === "" ? "값 없음" : t.value}</span>
        {t.unit ? <span className="mqc-qd-muted">{t.unit}</span> : null}
      </div>
      <div className="mqc-qd-muted mqc-qd-mono">{t.path}</div>
      {t.kind === "spec" ? (
        <div className="mqc-qd-ev">
          <span>사양 오버라이드</span>
          <span className="mqc-qd-mono">
            {t.base ?? "표준값 없음"} → {(t.specs ?? []).join(" → ") || "-"} → {t.value ?? "-"}
          </span>
          <span className="mqc-qd-muted">(나중 사양이 이깁니다)</span>
          <button type="button" className="mqc-qd-link" onClick={() => openScreen("qualitySpec")}>
            {screenTitle("qualitySpec")} →
          </button>
        </div>
      ) : null}
      {t.ruleId ? (
        <div className="mqc-qd-ev">
          <span>기준 룰</span>
          <span className="mqc-qd-mono">{ref}</span>
          {t.screen ? (
            <button type="button" className="mqc-qd-link" onClick={() => openScreen(t.screen)}>
              {screenTitle(t.screen)} →
            </button>
          ) : null}
          <button type="button" className="mqc-qd-link" onClick={() => openRuleEdit(t.ruleId as string, t.ver)}>
            Maru 룰 →
          </button>
        </div>
      ) : null}
      {t.formula ? <div className="mqc-qd-muted">산식: {t.formula}</div> : null}
      {t.note ? <div className="mqc-qd-muted">{t.note}</div> : null}
      <div>
        <Button onClick={() => onPin(t)} disabled={busy || pinned}>
          {pinned ? "핀 고정됨" : "현재값을 기대값으로"}
        </Button>
      </div>
    </div>
  );
}

export const TracePanel = memo(function TracePanel({ path, traces, anomalies, pinned, busy, onPin }: TracePanelProps) {
  return (
    <div className="mqc-qd-pane">
      <b>근거 추적</b>
      {!path ? (
        <div className="mqc-qd-muted">⑥ 설계값 산출에서 값을 누르세요.</div>
      ) : traces.length === 0 ? (
        <div className="mqc-qd-muted">
          <span className="mqc-qd-mono">{path}</span> 의 근거 기록이 없습니다 — 표준 기준값으로 정해진 값입니다.
        </div>
      ) : (
        traces.map((t) => <TraceCard key={t.path} t={t} pinned={pinned.has(t.path)} busy={busy} onPin={onPin} />)
      )}
      <div className="mqc-qd-sub">이상징후 ({anomalies.length}건)</div>
      <AnomalyList anomalies={anomalies} />
    </div>
  );
});
