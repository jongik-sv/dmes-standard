"use client";

/**
 * OMS 전송 결과 창 — I/F 머리 정보, 사양별 결과(성공·실패·메시지·처리 ms), 건너뛴 사양, 송신 전문(payload).
 * 전송 결과는 서버가 정한다(시연용 고정 규칙). 화면은 받은 그대로 보인다.
 */
import { useMemo } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { JsonView } from "@dk-oasis/shared/json-view";

import { parseJsonText } from "./dsl";
import { SEND_META, type SendResult, type SendRow } from "./types";

const COLUMNS: GridColumn[] = [
  { key: "specNo", header: "품질사양번호", width: 120, minWidth: 110, align: "left" },
  { key: "rev", header: "Rev", width: 50, minWidth: 50, align: "center", type: "number" },
  { key: "ifNo", header: "I/F 번호", width: 130, minWidth: 120, align: "left" },
  {
    key: "result",
    header: "전송 상태",
    width: 80,
    minWidth: 74,
    align: "center",
    render: (v) =>
      v === "OK" ? (
        <GridBadge label="✓ 성공" bg="var(--color-success-soft)" color="var(--color-success)" />
      ) : (
        <GridBadge label="✕ 실패" bg="var(--color-danger-soft)" color="var(--color-danger)" />
      ),
  },
  { key: "msg", header: "메시지", width: 200, minWidth: 160, align: "left" },
  { key: "elapsedMs", header: "처리(ms)", width: 70, minWidth: 70, align: "right", type: "number" },
];

export function SendResultModal({ result, onClose }: { result: SendResult | null; onClose: () => void }) {
  const payload = useMemo(() => parseJsonText(result?.payload), [result]);
  return (
    <Modal
      open={result !== null}
      onClose={onClose}
      size="lg"
      title={result ? `전송 완료 — 성공 ${result.okCount} · 실패 ${result.failCount}` : "SAP ERP OMS 전송"}
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      {result ? (
        <>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>I/F ID</th>
                <td style={DETAIL_VALUE_CELL}>{result.ifId || SEND_META.ifId}</td>
                <th style={DETAIL_LABEL_CELL}>방식</th>
                <td style={DETAIL_VALUE_CELL}>{SEND_META.method}</td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>목적지</th>
                <td style={DETAIL_VALUE_CELL} colSpan={3}>
                  {SEND_META.dest}
                </td>
              </tr>
            </tbody>
          </table>
          <AgDataGrid
            gridId="send-result"
            title="전송 결과"
            rowKey="specNo"
            columns={COLUMNS}
            data={result.results as unknown as Record<string, unknown>[]}
            columnSizing="fit"
            height="auto"
            filter={false}
            getRowClassExtra={failRow}
          />
          {result.skipped.length > 0 ? (
            <CardFrame title={`건너뛴 사양 (${result.skipped.length})`}>
              {result.skipped.map((s) => (
                <div key={s.specNo}>
                  <MutedText>
                    {s.specNo} — {s.reason}
                  </MutedText>
                </div>
              ))}
            </CardFrame>
          ) : null}
          <CardFrame title="송신 전문 (payload)">
            <JsonView value={payload} defaultExpandDepth={2} />
          </CardFrame>
        </>
      ) : null}
    </Modal>
  );
}

const failRow = (row: Record<string, unknown>) => ((row as unknown as SendRow).result === "FAIL" ? "ag-row-error" : undefined);
