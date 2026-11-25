"use client";

/**
 * 사양 상세 창(프로토타입의 오른쪽 서랍) — 원본 텍스트, 구조화 결과(IF·THEN), 기본 정보, 이력 바로가기, 이 사양의 I/F 이력.
 * 아래 단추는 상태로 정한다: 삭제·수정, 확정(작성중), OMS 전송(확정·매핑 완료), 재전송(전송실패·매핑 완료), 코드 매핑 필요(매핑 안 됨).
 */
import { memo } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";

import { StatusBadge } from "./badges";
import type { IfLogView, Term, ViewResult } from "./types";

const TERM_COLUMNS: GridColumn[] = [
  { key: "attrNm", header: "항목명", width: 130, minWidth: 110, align: "left" },
  {
    key: "attrCd",
    header: "코드",
    width: 110,
    minWidth: 100,
    align: "center",
    render: (v) =>
      v ? <GridBadge label={String(v)} muted /> : <GridBadge label="미매핑" bg="var(--color-warning-soft)" color="var(--color-warning)" />,
  },
  { key: "op", header: "연산자", width: 60, minWidth: 60, align: "center" },
  { key: "val", header: "값", width: 130, minWidth: 100, align: "left" },
  { key: "unit", header: "단위", width: 60, minWidth: 60, align: "center" },
];

const IF_COLUMNS: GridColumn[] = [
  { key: "ifNo", header: "I/F 번호", width: 130, minWidth: 120, align: "left" },
  { key: "ifAt", header: "일시", width: 130, minWidth: 120, align: "center" },
  {
    key: "resultNm",
    header: "결과",
    width: 70,
    minWidth: 60,
    align: "center",
    render: (v, row) =>
      (row as unknown as IfLogView).result === "OK" ? (
        <GridBadge label={String(v)} bg="var(--color-success-soft)" color="var(--color-success)" />
      ) : (
        <GridBadge label={String(v)} bg="var(--color-danger-soft)" color="var(--color-danger)" />
      ),
  },
  { key: "msg", header: "메시지", width: 200, minWidth: 160, align: "left" },
];

const termKey = (t: Term) => `${t.side}-${t.seq}`;

export interface SpecDetailModalProps {
  open: boolean;
  data: ViewResult | null;
  loading: boolean;
  busy: boolean;
  cusName: (code: string) => string | null;
  prdName: (code: string) => string | null;
  canSave: boolean;
  canDelete: boolean;
  canConfirm: boolean;
  canSend: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onSend: () => void;
  onShowHistory: (specNo: string) => void;
}

export const SpecDetailModal = memo(function SpecDetailModal(props: SpecDetailModalProps) {
  const { open, data, loading, busy, cusName, prdName, canSave, canDelete, canConfirm, canSend, onClose, onEdit, onDelete, onConfirm, onSend, onShowHistory } = props;
  const spec = data?.spec ?? null;
  const pipe = spec ? spec.rawText.indexOf("|") : -1;
  const rawIf = spec ? (pipe >= 0 ? spec.rawText.slice(0, pipe).trim() : spec.rawText) : "";
  const rawThen = spec && pipe >= 0 ? spec.rawText.slice(pipe + 1).trim() : "";

  const footer = spec ? (
    <>
      <Button onClick={onClose}>닫기</Button>
      <Button variant="danger" onClick={onDelete} disabled={busy || !canDelete}>
        삭제
      </Button>
      <Button onClick={onEdit} disabled={busy || !canSave}>
        수정
      </Button>
      {spec.status === "DRAFT" ? (
        <Button variant="primary" onClick={onConfirm} disabled={busy || !canConfirm || !spec.mapped || spec.results.length === 0}>
          확정
        </Button>
      ) : null}
      {(spec.status === "CONF" || spec.status === "FAIL") && spec.mapped ? (
        <Button variant="primary" onClick={onSend} disabled={busy || !canSend}>
          {spec.status === "FAIL" ? "재전송" : "OMS 전송"}
        </Button>
      ) : null}
      {(spec.status === "CONF" || spec.status === "FAIL") && !spec.mapped ? <Button disabled>코드 매핑 필요</Button> : null}
    </>
  ) : (
    <Button onClick={onClose}>닫기</Button>
  );

  return (
    <Modal open={open} onClose={onClose} size="lg" title={spec ? `${spec.specNo} · Rev.${spec.rev}` : "품질사양 상세"} footer={footer}>
      {!spec ? (
        <MutedText>{loading ? "조회 중..." : "사양을 찾을 수 없습니다."}</MutedText>
      ) : (
        <>
          <div>
            <StatusBadge status={spec.status} title={spec.failMsg} />{" "}
            <MutedText>
              {cusName(spec.cusCd) ?? spec.cusNm ?? "미등록 고객사"} ({spec.cusCd}) · 품명 {spec.prdNmCd} ({prdName(spec.prdNmCd) ?? spec.prdNm ?? "-"})
            </MutedText>
          </div>
          {spec.status === "FAIL" && spec.failMsg ? (
            <div>
              <Badge tone="danger" label={`OMS 전송 실패 — ${spec.failMsg}`} />
            </div>
          ) : null}

          <CardFrame title="원본 텍스트 (현업 입력)">
            <div>
              <Badge tone="neutral" label="IF" /> {rawIf}
            </div>
            {rawThen ? (
              <div>
                <Badge tone="primary" label="THEN" /> {rawThen}
              </div>
            ) : null}
          </CardFrame>

          <CardFrame title="구조화 결과">
            <AgDataGrid
              gridId="detail-if"
              title="조건 — 주문 매칭 (IF)"
              rowKey="_key"
              columns={TERM_COLUMNS}
              data={spec.conds.map((t) => ({ ...t, _key: termKey(t) }))}
              columnSizing="fit"
              height="auto"
              filter={false}
            />
            <AgDataGrid
              gridId="detail-then"
              title="설계결과 — 적용 값 (THEN)"
              rowKey="_key"
              columns={TERM_COLUMNS}
              data={spec.results.map((t) => ({ ...t, _key: termKey(t) }))}
              columnSizing="fit"
              height="auto"
              filter={false}
            />
          </CardFrame>

          <CardFrame title="기본 정보">
            <table style={DETAIL_TABLE_STYLE}>
              <tbody>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>등록자</th>
                  <td style={DETAIL_VALUE_CELL}>{spec.author}</td>
                  <th style={DETAIL_LABEL_CELL}>등록일</th>
                  <td style={DETAIL_VALUE_CELL}>{spec.createdAt}</td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>최종수정</th>
                  <td style={DETAIL_VALUE_CELL}>
                    {spec.updatedBy} · {spec.updatedAt}
                  </td>
                  <th style={DETAIL_LABEL_CELL}>상태</th>
                  <td style={DETAIL_VALUE_CELL}>{spec.statusNm}</td>
                </tr>
              </tbody>
            </table>
          </CardFrame>

          <CardFrame
            title={`이력 (${data?.changes.length ?? 0}건)`}
            right={
              <Button onClick={() => onShowHistory(spec.specNo)} disabled={busy}>
                이 사양의 변경 이력 보기 →
              </Button>
            }
          >
            {(data?.changes ?? []).slice(0, 5).map((c) => (
              <div key={c.chgId}>
                <MutedText>
                  {c.chgAt} · {c.actionNm} · {c.worker}
                </MutedText>
              </div>
            ))}
          </CardFrame>

          <AgDataGrid
            gridId="detail-iflog"
            title="이 사양의 I/F 이력"
            rowKey="ifNo"
            columns={IF_COLUMNS}
            data={(data?.ifLogs ?? []) as unknown as Record<string, unknown>[]}
            columnSizing="fit"
            height="auto"
            filter={false}
          />
        </>
      )}
    </Modal>
  );
});
