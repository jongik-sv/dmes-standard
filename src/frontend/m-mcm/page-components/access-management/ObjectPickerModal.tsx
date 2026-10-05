"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { createJsonApiClient } from "@/lib/http/json-api-client";

export interface PickedObject {
  objId: string;
  objNm: string;
  sysCd: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (obj: PickedObject) => void;
}

const COLUMNS: GridColumn[] = [
  { key: "objId", header: "OBJECT ID", meta: "OBJECT_ID", width: 200, align: "left" },
  { key: "objNm", header: "객체명", meta: "OBJECT_NM", width: 260, align: "left" },
  { key: "sysCd", header: "모듈", width: 80, align: "left" },
];

/**
 * 오브젝트 선택 팝업 — 권한관리 / 메뉴관리 등에서 보안객체 ID 를 직접 타이핑하지 않고
 * 등록된 OBJ 목록에서 골라 채울 수 있게 한다.
 *
 * 데이터: `/api/mcm/oasis/commObjMng/searchCmObj` 호출 → grids.ds_main.rows.
 *   (2026-06-01 legacy `/api/mcm/oasis/secObj/search` 폐기 → csa 신규 자산 commObjMng 으로 swap.
 *    응답 row 는 SNAKE_CASE — OBJECT_ID / OBJECT_NM / SYSTEM_CODE.)
 * 검색어로 OBJECT ID / 객체명 / 모듈을 부분일치 필터링.
 */
const ObjectPickerModalImpl = ({ open, onClose, onSelect }: Props) => {
  const [rows, setRows] = useState<PickedObject[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFilter("");
    const api = createJsonApiClient();
    api
      .request<{
        grids?: { ds_main?: { rows: Array<Record<string, unknown>> } };
      }>("/api/mcm/oasis/commObjMng/searchCmObj", {
        method: "POST",
        body: { meta: { userId: "system", menuId: "OBJ_PICKER" }, params: {} },
      })
      .then((res) => {
        const items = (res.grids?.ds_main?.rows ?? []).map((r) => ({
          objId: String(r.OBJECT_ID ?? ""),
          objNm: String(r.OBJECT_NM ?? ""),
          sysCd: String(r.SYSTEM_CODE ?? ""),
        }));
        setRows(items.filter((r) => r.objId));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filteredRows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter(
      (r) =>
        r.objId.toLowerCase().includes(f) ||
        r.objNm.toLowerCase().includes(f) ||
        r.sysCd.toLowerCase().includes(f)
    );
  }, [rows, filter]);

  return (
    <Modal open={open} onClose={onClose} title="오브젝트 선택" size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Input
          value={filter}
          onChange={setFilter}
          placeholder="OBJECT ID / 객체명 / 모듈 검색"
        />
        <AgDataGrid
          columns={COLUMNS}
          data={filteredRows as unknown as Record<string, unknown>[]}
          rowKey="objId"
          height={420}
          loading={loading}
          emptyMessage="검색 결과가 없습니다."
          onRowClick={(row) => {
            onSelect(row as unknown as PickedObject);
            onClose();
          }}
        />
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", textAlign: "right" }}>
          {filteredRows.length} / {rows.length} 건
        </div>
      </div>
    </Modal>
  );
};

export const ObjectPickerModal = memo(ObjectPickerModalImpl);
