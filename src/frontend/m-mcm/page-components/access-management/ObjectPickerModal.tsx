"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { Input } from "@dk-oasis/shared/form";
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
        <div
          style={{
            maxHeight: 420,
            overflow: "auto",
            border: "1px solid #e0e0e0",
            borderRadius: 4,
          }}
        >
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#999" }}>
              로딩 중...
            </div>
          ) : (
            <table
              style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
            >
              <thead>
                <tr style={{ background: "#f5f5f5", position: "sticky", top: 0 }}>
                  <th style={th}>OBJECT ID</th>
                  <th style={th}>객체명</th>
                  <th style={{ ...th, width: 80 }}>모듈</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      style={{ padding: 24, textAlign: "center", color: "#999" }}
                    >
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                )}
                {filteredRows.map((r) => (
                  <tr
                    key={r.objId}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--color-selection, #e3f2fd)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                    onClick={() => {
                      onSelect(r);
                      onClose();
                    }}
                  >
                    <td style={td}>{r.objId}</td>
                    <td style={td}>{r.objNm}</td>
                    <td style={td}>{r.sysCd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#999", textAlign: "right" }}>
          {filteredRows.length} / {rows.length} 건
        </div>
      </div>
    </Modal>
  );
};

const th: React.CSSProperties = {
  padding: 6,
  border: "1px solid #ddd",
  textAlign: "left",
};
const td: React.CSSProperties = { padding: 4, border: "1px solid #eee" };

export const ObjectPickerModal = memo(ObjectPickerModalImpl);
