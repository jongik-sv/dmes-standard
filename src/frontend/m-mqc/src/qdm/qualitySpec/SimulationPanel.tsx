"use client";

/**
 * 주문 적용 시뮬레이션 탭 — OMS 에서 받은 주문에 어떤 품질사양이 매칭되어 설계결과가 만들어지는지 미리 검증한다(확정·전송완료 사양만 적용).
 * 왼쪽 수신 주문 목록, 오른쪽 실행 결과: ① 품질사양 매칭 카드 ② 설계결과(기준 데이터 + 품질사양 적용) 표. 같은 항목을 여러 사양이 바꾸면 뒤 사양(사양번호 순)이 이긴다.
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridBadgeGroup, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { JsonView } from "@dk-oasis/shared/json-view";

import { runSimulation } from "./api";
import { StatusBadge, TermChip, VERDICT_LABEL, VERDICT_TONE } from "./badges";
import { displayValue, inboundPayload, parseJsonText } from "./dsl";
import type { DesignRow, MatchCond, MatchView, OrderView, RunResult } from "./types";

const ORDER_COLUMNS: GridColumn[] = [
  { key: "ordNo", header: "주문번호", width: 130, minWidth: 120, align: "left" },
  { key: "cusNm", header: "고객사", width: 110, minWidth: 90, align: "left", render: (v, row) => `${String(v ?? "")} (${String(row.cusCd)})` },
  { key: "prdNmCd", header: "품명", width: 60, minWidth: 56, align: "center", render: (v, row) => `${String(v)} : ${String(row.prdNm ?? "")}` },
  { key: "qty", header: "수량", width: 70, minWidth: 64, align: "right" },
  { key: "recvAt", header: "수신", width: 120, minWidth: 110, align: "center" },
];

const COND_COLUMNS: GridColumn[] = [
  {
    key: "pass",
    header: "판정",
    width: 50,
    minWidth: 50,
    align: "center",
    render: (v) =>
      v ? <GridBadge label="✓" bg="var(--color-success-soft)" color="var(--color-success)" /> : <GridBadge label="✕" bg="var(--color-danger-soft)" color="var(--color-danger)" />,
  },
  { key: "attrNm", header: "조건", width: 120, minWidth: 100, align: "left" },
  { key: "val", header: "사양 값", width: 110, minWidth: 90, align: "left", render: (v, row) => `${displayValue((row as unknown as MatchCond).op, String(v))}${row.unit ? ` ${String(row.unit)}` : ""}` },
  { key: "orderVal", header: "주문값", width: 110, minWidth: 90, align: "left", render: (v) => (v == null || v === "" ? "(없음)" : String(v)) },
];

const DESIGN_COLUMNS: GridColumn[] = [
  { key: "attrNm", header: "설계 항목", width: 130, minWidth: 110, align: "left", render: (v, row) => `${String(v)}${row.unit ? ` (${String(row.unit)})` : ""}` },
  {
    key: "baseVal",
    header: "표준 기준값",
    width: 120,
    minWidth: 100,
    align: "left",
    render: (v, row) => (row.overridden ? <GridBadge label={String(v ?? "—")} dimmed title="품질사양이 덮어씀" /> : String(v ?? "—")),
  },
  { key: "finalVal", header: "최종 적용값", width: 130, minWidth: 110, align: "left", cellClassRules: { "cell-warning": (row) => row.overridden === true } },
  {
    key: "sources",
    header: "근거",
    width: 160,
    minWidth: 120,
    align: "left",
    filter: false,
    render: (_v, row) => {
      const d = row as unknown as DesignRow;
      return d.sources.length === 0 ? (
        <GridBadge label="표준" muted />
      ) : (
        <GridBadgeGroup>
          {d.sources.map((s) => (
            <GridBadge key={s} label={s} bg="var(--color-warning-soft)" color="var(--color-warning)" />
          ))}
        </GridBadgeGroup>
      );
    },
  },
];

const STEPS = ["1 주문 수신", "2 품질사양 매칭", "3 기준 적용", "4 설계결과 생성"];

export interface SimulationPanelProps {
  orders: OrderView[];
  loading: boolean;
  canRun: boolean;
}

export const SimulationPanel = memo(function SimulationPanel({ orders, loading, canRun }: SimulationPanelProps) {
  const { showMessage } = useMessage();
  const [selectedNo, setSelectedNo] = useState<string | null>(orders[0]?.ordNo ?? null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const requestRef = useRef(0);
  const order = orders.find((o) => o.ordNo === selectedNo) ?? orders[0] ?? null;

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    requestRef.current += 1;
    setSelectedNo(String(row.ordNo));
    setResult(null);
  }, []);

  const run = async () => {
    if (!order) return;
    const id = ++requestRef.current;
    setRunning(true);
    try {
      const r = await runSimulation({ ordNo: order.ordNo });
      if (id === requestRef.current) setResult(r);
    } catch (e) {
      if (id === requestRef.current) showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });
    } finally {
      setRunning(false);
    }
  };

  const preview = useMemo(() => (order ? inboundPayload(order) : null), [order]);
  const resultPayload = useMemo(() => parseJsonText(result?.payload), [result]);
  const designRows = useMemo(() => (result?.design ?? []) as unknown as Record<string, unknown>[], [result]);
  const overriddenCount = result?.design.filter((d) => d.overridden).length ?? 0;

  return (
    <ContentBody root resizable storageKey="mqc.qdm.qualitySpec.sim">
      <ContentPanel width={460}>
        <GridPanel title="수신 주문 (OMS → MES)" count={orders.length} loading={loading}>
          <AgDataGrid
            gridId="sim-orders"
            rowKey="ordNo"
            columns={ORDER_COLUMNS}
            data={orders as unknown as Record<string, unknown>[]}
            columnSizing="fit"
            highlightedRowKey={order?.ordNo ?? null}
            onRowClick={handleRowClick}
            loading={loading}
          />
        </GridPanel>
      </ContentPanel>
      <ContentPanel scrollY>
        <CardFrame
          title="품질설계 실행 결과"
          right={
            <Button variant="primary" onClick={() => void run()} disabled={!order || running || !canRun}>
              ▶ 품질설계 실행
            </Button>
          }
        >
          <MutedText>OMS에서 수신된 주문에 어떤 품질사양이 매칭되어 설계결과가 만들어지는지 사전 검증합니다. (확정·전송완료 사양만 적용)</MutedText>
          <div>
            {STEPS.map((s, i) => (
              <span key={s}>
                <Badge label={s} tone={result ? "success" : running && i === 0 ? "primary" : "neutral"} />
                {i < STEPS.length - 1 ? " ▶ " : null}
              </span>
            ))}
          </div>
          {order ? (
            <div>
              <MutedText>
                {order.ordNo} · {order.cusNm ?? "-"} ({order.cusCd}) · 품명 {order.prdNmCd} : {order.prdNm ?? "-"} · {order.qty} · 수신 {order.recvAt}
              </MutedText>
            </div>
          ) : (
            <MutedText>수신 주문이 없습니다.</MutedText>
          )}
        </CardFrame>

        {!result ? (
          preview ? (
            <CardFrame title="수신 전문 (실행 전)">
              <JsonView value={preview} defaultExpandDepth={1} />
            </CardFrame>
          ) : null
        ) : (
          <>
            <CardFrame title={`① 품질사양 매칭 (${result.matches.length}건)`}>
              {result.matches.length === 0 ? <MutedText>고객사·품명이 같은 품질사양이 없습니다. 표준 기준값만 적용합니다.</MutedText> : null}
            </CardFrame>
            {result.matches.map((m) => (
              <MatchCard key={m.specNo} match={m} />
            ))}

            <CardFrame title="② 설계결과 (기준 데이터 + 품질사양 적용)" right={<Badge tone={overriddenCount > 0 ? "warning" : "neutral"} label={`사양 적용 ${overriddenCount}건`} />}>
              {result.conflicts.map((c) => (
                <div key={c.attrCd}>
                  <Badge tone="warning" label={`항목 중복 적용: ${c.attrNm} (${c.chain} — 뒤 사양 우선)`} title={c.specNos.join(" → ")} />
                </div>
              ))}
              <AgDataGrid gridId="sim-design" title="설계결과" rowKey="attrCd" columns={DESIGN_COLUMNS} data={designRows} columnSizing="fit" height="auto" filter={false} />
              <MutedText>실제 시스템에서는 이 결과가 품질설계결과(QD_RESULT)로 저장됩니다.</MutedText>
            </CardFrame>

            <CardFrame title="수신 전문">
              <JsonView value={resultPayload} defaultExpandDepth={1} />
            </CardFrame>
          </>
        )}
      </ContentPanel>
    </ContentBody>
  );
});

function MatchCard({ match }: { match: MatchView }) {
  const conds = useMemo(() => match.conds.map((c, i) => ({ ...c, _key: i })), [match]);
  return (
    <CardFrame
      title={`${match.specNo} · Rev.${match.rev}`}
      right={
        <>
          <StatusBadge status={match.status} /> <Badge tone={VERDICT_TONE[match.verdict]} label={VERDICT_LABEL[match.verdict]} />
        </>
      }
    >
      {conds.length === 0 ? <MutedText>추가 조건 없음 — 고객사·품명이 같으면 늘 매칭합니다.</MutedText> : null}
      <AgDataGrid gridId={`sim-match-${match.specNo}`} rowKey="_key" columns={COND_COLUMNS} data={conds} columnSizing="fit" height="auto" header={false} settingsMenu={false} filter={false} personalize={false} />
      <div>
        <Badge tone="primary" label="THEN" />{" "}
        {match.results.map((t) => (
          <TermChip key={t.seq} term={t} side="THEN" />
        ))}
      </div>
    </CardFrame>
  );
}
