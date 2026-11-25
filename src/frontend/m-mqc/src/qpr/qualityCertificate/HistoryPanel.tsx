"use client";

/** 5 이력 — 승인된 버전 기록과 저장·승인 이력(서버 search 결과 그대로). */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import { Lead, Stack } from "@/common/ui";

import { fmtAt, type WtyStore } from "./store";

const ACT: Record<string, string> = {
  INIT: "기본 문서",
  DRAFT: "초안 수정",
  REQUEST: "승인 요청",
  UNREQUEST: "요청 취소",
  DISCARD: "초안 버림",
  APPROVE: "승인",
  RESET: "초기화",
};
const VER_COLUMNS: GridColumn[] = [
  { key: "ver", header: "버전", width: 56, align: "center", render: (v) => `v${String(v)}` },
  { key: "at", header: "승인 시각", width: 120, align: "center" },
  { key: "by", header: "승인자", width: 80, align: "center" },
  { key: "memo", header: "내용", width: 260, minWidth: 160, align: "left" },
];
const HIST_COLUMNS: GridColumn[] = [
  { key: "at", header: "시각", width: 120, align: "center" },
  { key: "act", header: "구분", width: 80, align: "center" },
  { key: "msg", header: "내용", width: 220, minWidth: 140, align: "left" },
  { key: "by", header: "사용자", width: 80, align: "center" },
];

export function HistoryPanel({ store }: { store: WtyStore; version: number }) {
  const vers = store.versions.map((v) => ({ ver: v.ver, at: fmtAt(v.approvedAt), by: v.approvedBy ?? "", memo: v.memo ?? "" }));
  const hist = store.hist.map((h, i) => ({ i, at: fmtAt(h.at), act: ACT[h.act] ?? h.act, msg: h.msg ?? "", by: h.by ?? "" }));
  return (
    <Stack>
      <Lead>승인하면 적용본 버전이 하나 올라가고 그 시점이 다음 비교 기준이 됩니다. 저장·승인 기록은 최근 100건까지 보입니다.</Lead>
      <AgDataGrid gridId="wty-versions" title="버전 기록" count={vers.length} rowKey="ver" columns={VER_COLUMNS} data={vers} columnSizing="fit" height="auto" emptyMessage="버전 기록이 없습니다." />
      <AgDataGrid gridId="wty-hist" title="이력" count={hist.length} rowKey="i" columns={HIST_COLUMNS} data={hist} columnSizing="fit" height={360} emptyMessage="이력이 없습니다." />
    </Stack>
  );
}
