"use client";

/**
 * 환율 위젯 렌더러 — 최신 값 표(통화·단위·값·전일 대비 ▲▼)와 통화별 추이(Sparkline). 스펙 2026-10-02-widget-admin-generic §6·§8.
 * 데이터는 widgetExt/exchange(서버가 DB·제공자를 맡는다). 제공자 실패로 DB 값만 온 경우(stale)는 제목 줄에 「갱신 실패」 를 보인다.
 * 읽기·서식·표 행 만들기는 _ext 의 순수 함수가 맡는다.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkline } from "@dk-oasis/shared/dashboard";
import { Badge } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { useWidgetStatus, WidgetTitleExtra, type WidgetProps } from "@dk-oasis/shared/widget";

import { fetchExchange } from "@/widget-types/_ext/api";
import { exchangeRequest, readExchangeConfig } from "@/widget-types/_ext/config";
import { latestDateOf, toExchangeRows } from "@/widget-types/_ext/format";
import { EXT_CSS, EXT_STYLE_HREF } from "@/widget-types/_ext/styles";
import type { ExchangeResult, ExchangeRow } from "@/widget-types/_ext/types";

const LOAD_ERROR = "환율 정보를 불러오지 못했습니다";

const SPARK_COLOR: Record<ExchangeRow["dir"], string> = {
  up: "var(--color-danger)",
  down: "var(--color-primary)",
  flat: "var(--color-text-muted)",
  none: "var(--color-text-muted)",
};

// 열 정의는 모듈 상수(매 렌더 새 배열을 만들지 않는다). fit 에서 width 는 비율 가중치.
const COLUMNS: GridColumn[] = [
  {
    key: "label",
    header: "통화",
    width: 3,
    minWidth: 70,
    align: "left",
    render: (v) => <span className="mcm-ext-cur">{String(v)}</span>,
  },
  { key: "rateText", header: "환율(원)", width: 3, minWidth: 72, align: "right" },
  {
    key: "diffText",
    header: "전일 대비",
    width: 3,
    minWidth: 76,
    align: "right",
    render: (v, row) => <span className={`mcm-ext-diff mcm-ext-diff--${String(row.dir)}`}>{String(v)}</span>,
  },
  {
    key: "spark",
    header: "추이",
    width: 3,
    minWidth: 68,
    align: "center",
    sortable: false,
    tooltip: false,
    render: (v, row) => {
      const values = Array.isArray(v) ? (v as number[]) : [];
      if (values.length < 2) return <span className="mcm-ext-diff mcm-ext-diff--none">–</span>;
      return (
        <span className="mcm-ext-spark">
          <Sparkline
            values={values}
            width={60}
            height={20}
            color={SPARK_COLOR[row.dir as ExchangeRow["dir"]] ?? SPARK_COLOR.none}
            ariaLabel={`${String(row.cur)} 추이`}
          />
        </span>
      );
    },
  },
];

export default function ExchangeWidget({ definition, refreshKey }: WidgetProps) {
  const setStatus = useWidgetStatus();
  const cfg = useMemo(() => readExchangeConfig(definition), [definition]);
  const req = useMemo(() => exchangeRequest(cfg), [cfg]);
  // 설정 객체의 참조가 매번 바뀌어도 다시 부르지 않도록 값(문자열·숫자)만 의존성으로 쓴다.
  const symbolsKey = req.symbols.join(",");
  const days = req.days;
  const [result, setResult] = useState<ExchangeResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (symbolsKey === "") {
      setStatus({ kind: "ready" });
      return;
    }
    let cancelled = false;
    setStatus({ kind: "loading" });
    fetchExchange(symbolsKey.split(","), days)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setStatus({ kind: "ready" });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // 서버 거절 문구(정의에 없는 통화·기간, 요청이 너무 잦음 등)는 그대로 보인다 — 관리 화면 미리보기에서 저장 전 통화가
        // 왜 안 보이는지 알 수 있게. 네트워크 실패(브라우저 영어 TypeError)는 fetchExchange 가 한국어 문구로 바꿔 던진다.
        // 문구가 없으면 고정 문구.
        const message = e instanceof Error && e.message.trim() ? e.message : LOAD_ERROR;
        setStatus({ kind: "error", message, retry: () => setAttempt((a) => a + 1) });
      });
    return () => {
      cancelled = true;
    };
  }, [symbolsKey, days, refreshKey, attempt, setStatus]);

  const rows = useMemo(() => (result ? toExchangeRows(result, symbolsKey === "" ? [] : symbolsKey.split(",")) : []), [result, symbolsKey]);
  const asOf = useMemo(() => latestDateOf(rows), [rows]);
  const hasAny = rows.some((r) => r.rateText !== "-");

  return (
    <div className="mcm-ext" data-testid="widget-exchange">
      <style href={EXT_STYLE_HREF} precedence="default">
        {EXT_CSS}
      </style>
      {result?.stale && (
        <WidgetTitleExtra>
          <Badge tone="warning" label="갱신 실패" title="환율을 새로 받지 못해 저장된 값을 보여 줍니다" />
        </WidgetTitleExtra>
      )}
      {symbolsKey === "" ? (
        <div className="mcm-ext__state">표시할 통화가 없습니다</div>
      ) : result === null ? null : result.disabled && !hasAny ? (
        <div className="mcm-ext__state">외부 정보 연결이 꺼져 있어 환율을 가져올 수 없습니다</div>
      ) : (
        <>
          <AgDataGrid
            rowKey="cur"
            columns={COLUMNS}
            data={rows}
            columnSizing="fit"
            height="auto"
            sortable={false}
            ariaLabel="환율 목록"
          />
          <p className="mcm-ext__foot">{asOf ? `기준일 ${asOf} · 최근 ${days}일 추이` : `최근 ${days}일 추이`}</p>
        </>
      )}
    </div>
  );
}
