"use client";

/**
 * 로그 분석 (anl/logViewer) — 서비스 목록 패널(떠 있는 창 FloatingPanel 안에 넣어 쓴다).
 * 원본: analog-express-ui-plate ServiceListViewer_AG.js 이식.
 *  - ag-grid 직접 import 금지 정책에 따라 shared AgDataGrid 래퍼 사용.
 *  - 수행시간 히트맵: 원본의 연속 rgba alpha(cellStyle) 대신 cellClassRules 로 이산 버킷 구현
 *    (>=5초 진빨강+흰글씨, 4~5초 α0.64, 3~4초 α0.48, 2~3초 α0.32, 1~2초 α0.16).
 *  - 오류 행: 빨간 글씨 (getRowClassExtra). 오류 셀 표기는 true→"오류" 한국어로 정리.
 *  - 로그/JSON 링크 버튼 → 서비스 태그 드릴다운 콜백.
 *  - 다시 그리기 억제: 컴포넌트를 memo 로 감싸고, 컬럼·행·행 클래스 콜백을 안정 참조로 둔다.
 *    상위(탭 전환·로그 조회로 상태가 바뀌는 화면)가 다시 그려져도 serviceList 와 콜백 참조가 같으면
 *    그리드가 columnDefs 를 새로 만들지 않는다. 콜백은 상위가 useCallback 으로 고정해 넘긴다.
 */

import { memo, useMemo } from "react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import type { ServiceItem } from "./types";

/** 드릴다운 콜백 — (serviceTag, startTime, endTime, action, runTime). */
export type ServiceDrilldownHandler = (
  serviceTag: string,
  startTime: string,
  endTime: string,
  action: string | undefined,
  runTime: number | undefined,
) => void;

interface ServiceListPanelProps {
  serviceList: ServiceItem[];
  onLogClick: ServiceDrilldownHandler;
  onJsonClick: ServiceDrilldownHandler;
}

function rowRunTime(row: Record<string, unknown>): number {
  const value = row.runTime;
  return typeof value === "number" ? value : Number.NaN;
}

/** 수행시간 히트맵 버킷 (ms 구간 → css 클래스). */
const RUN_TIME_HEAT_RULES: Record<
  string,
  (row: Record<string, unknown>) => boolean
> = {
  "anl-heat-5": (row) => rowRunTime(row) >= 5000,
  "anl-heat-4": (row) => rowRunTime(row) >= 4000 && rowRunTime(row) < 5000,
  "anl-heat-3": (row) => rowRunTime(row) >= 3000 && rowRunTime(row) < 4000,
  "anl-heat-2": (row) => rowRunTime(row) >= 2000 && rowRunTime(row) < 3000,
  "anl-heat-1": (row) => rowRunTime(row) >= 1000 && rowRunTime(row) < 2000,
};

/** 오류 행 강조 — 모듈 상수라 렌더마다 새로 만들지 않는다. */
function rowClassExtra(row: Record<string, unknown>): string | undefined {
  return row.error === true ? "anl-row-error" : undefined;
}

function toHandlerArgs(
  row: Record<string, unknown>,
): Parameters<ServiceDrilldownHandler> {
  return [
    String(row.serviceTag ?? ""),
    String(row.startTime ?? ""),
    String(row.endTime ?? ""),
    typeof row.action === "string" ? row.action : undefined,
    typeof row.runTime === "number" ? row.runTime : undefined,
  ];
}

function ServiceListPanelComponent({
  serviceList,
  onLogClick,
  onJsonClick,
}: ServiceListPanelProps) {
  const columns = useMemo<GridColumn[]>(
    () => [
      { key: "serviceName", header: "서비스명", width: 180 },
      { key: "action", header: "Action", width: 120 },
      { key: "startTime", header: "시작시각", width: 220 },
      { key: "endTime", header: "종료시각", width: 220 },
      {
        key: "runTime",
        header: "수행시간",
        width: 120,
        align: "right",
        type: "number",
        cellClassRules: RUN_TIME_HEAT_RULES,
      },
      { key: "serviceTag", header: "태그", width: 80 },
      {
        key: "error",
        header: "오류",
        width: 80,
        render: (value) => (value === true ? "오류" : ""),
      },
      {
        key: "link",
        header: "",
        width: 110,
        sortable: false,
        render: (_value, row) => (
          <span>
            <button
              type="button"
              className="anl-link-button"
              onClick={() => onLogClick(...toHandlerArgs(row))}
            >
              로그
            </button>
            <button
              type="button"
              className="anl-link-button"
              onClick={() => onJsonClick(...toHandlerArgs(row))}
            >
              JSON
            </button>
          </span>
        ),
      },
    ],
    [onLogClick, onJsonClick],
  );

  const rows = useMemo(
    () =>
      serviceList.map((item, index) => ({
        ...item,
        id: String(index),
      })),
    [serviceList],
  );

  return (
    <div className="anl-service-popup">
      <AgDataGrid
        columns={columns}
        data={rows}
        columnSizing="fixed"
        emptyMessage="서비스 목록 없음"
        ariaLabel="서비스 목록"
        getRowClassExtra={rowClassExtra}
      />
    </div>
  );
}

export const ServiceListPanel = memo(ServiceListPanelComponent);
