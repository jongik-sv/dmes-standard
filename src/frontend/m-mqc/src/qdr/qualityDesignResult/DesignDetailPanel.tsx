"use client";

/**
 * 오른쪽 설계결과 — 주문 머리(번호·상태·긴급재), 주문 요약, 6단계 판정 띠, 이상징후, 섹션 아코디언(설계 형상 포함).
 * 동작 단추(설계계산·확정·보류·변경이력·품질협정서)는 화면 머리 단추에 있다.
 */
import { memo, useMemo } from "react";

import { Badge } from "@dk-oasis/shared/form";

import { DesignAccordion, KvGrid, type KvItem } from "./DesignSections";
import { RUN_VERDICT_LABEL, RUN_VERDICT_TONE, STATUS_TONE, fmtThk, fmtWid } from "./format";
import { AnomalyList, StageStrip } from "./RunWidgets";
import { sectionOfPath, type SectionKey } from "./sections";
import type { DesignView } from "./types";

export function orderStrip(view: DesignView): KvItem[] {
  const o = view.order;
  const h = view.run?.design?.head;
  const items: KvItem[] = [
    { label: "최종수요가", value: `${o.cusCd} : ${o.cusNm}` },
    { label: "규격약호", value: o.spcAvr },
    { label: "주문Size", value: `${fmtThk(o.thk)} × ${fmtWid(o.wid)}` },
    { label: "품명", value: o.prdLabel },
    { label: "용도", value: o.usgFull || `${o.usgCd} : ${o.usgNm}` },
    { label: "재질/원자재", value: `${o.matLabel}${h?.mat2 ? " / " + h.mat2 : ""}` },
  ];
  if (h?.bom) items.push({ label: "BOM", value: h.bom });
  return items;
}

/** 이상징후를 섹션별로 센다(ref 가 설계 경로일 때). */
export function anomalyCounts(view: DesignView): Partial<Record<SectionKey, number>> {
  const out: Partial<Record<SectionKey, number>> = {};
  for (const a of view.run?.anomalies ?? []) {
    if (!a.ref || a.severity === "info") continue;
    const k = sectionOfPath(a.ref);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export const DesignDetailPanel = memo(function DesignDetailPanel({ view, loading }: { view: DesignView | null; loading: boolean }) {
  const counts = useMemo(() => (view ? anomalyCounts(view) : {}), [view]);
  if (!view) {
    return <div className="mqc-qd-muted">{loading ? "설계결과를 불러오는 중입니다." : "왼쪽 목록에서 주문을 고르세요."}</div>;
  }
  const run = view.run;
  const o = view.order;
  return (
    <div className="mqc-qd-pane" aria-busy={loading}>
      <div className="mqc-qd-head">
        <b className="mqc-qd-mono">{o.orderKey}</b>
        <Badge label={view.statusNm} tone={STATUS_TONE[view.status] ?? "neutral"} />
        {o.urgent ? <Badge label="긴급재" tone="danger" /> : null}
        {o.export ? <Badge label="수출" tone="primary" /> : null}
        {run?.summary ? (
          <Badge label={`파이프라인 ${RUN_VERDICT_LABEL[run.summary.verdict] ?? run.summary.verdict}`} tone={RUN_VERDICT_TONE[run.summary.verdict] ?? "neutral"} />
        ) : null}
        <span className="mqc-qd-spacer" />
        <span className="mqc-qd-muted">
          {view.calcAt ? `계산 ${view.calcAt}${view.calcBy ? " · " + view.calcBy : ""}` : "계산 기록 없음"}
          {view.confAt ? ` · 확정 ${view.confAt}${view.confBy ? " · " + view.confBy : ""}` : ""}
        </span>
      </div>
      <KvGrid items={orderStrip(view)} />
      {!view.stored ? (
        <div className="mqc-qd-notice info">미계산 미리보기 — 저장된 설계결과가 없어 지금 기준으로 계산해 보였습니다. 「설계계산」 을 누르면 저장합니다.</div>
      ) : null}
      {run ? (
        <>
          <div className="mqc-qd-row">
            <span className="mqc-qd-muted">
              기준 출처: {run.source?.label ?? "-"}
              {run.source?.note ? ` · ${run.source.note}` : ""} · 평가 {run.evalTs}
              {run.mainLine ? ` · 주공정 ${run.mainLine}` : ""}
            </span>
          </div>
          <StageStrip stages={run.stages ?? []} />
          {run.blockedAt > 0 ? (
            <div className="mqc-qd-notice danger">
              {run.blockedAt}단계에서 막혔습니다. 뒤 단계는 참고값입니다.
            </div>
          ) : null}
          <AnomalyList anomalies={run.anomalies ?? []} />
          <DesignAccordion design={run.design} shape={run.shape} anomalyCounts={counts} />
        </>
      ) : (
        <div className="mqc-qd-muted">설계결과가 없습니다.</div>
      )}
    </div>
  );
});
