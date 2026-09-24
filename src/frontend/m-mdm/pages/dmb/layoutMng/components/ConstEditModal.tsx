"use client";

/**
 * 상수 편집 팝업(TSK-05-02 design.md §2 — 3층 기본값 F9·불변 I10·I20). 행은 그 헤더의 CONST 항목만(AUTO·FILLER 는 나오지 않는다),
 * 열은 항목 / 헤더 기본값(텍스트, 입력 아님) / 이 전문의 값(placeholder = 헤더 기본값) / 재정의 배지. [적용] 은 화면 상태만 바꾸고
 * 저장은 [저장] 이 한다. 값은 코드값 전제다(MSSQL VARCHAR BIN2 — 한글 손실, design.md 인계).
 */
import { useEffect, useState } from "react";
import { Button, Input } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Modal } from "@dk-oasis/shared/modal";
import { badge, hint } from "@/layout/styles";
import type { HeaderStackRow } from "@/layout/types";

export interface ConstEditModalProps {
  header: HeaderStackRow | null;
  readOnly: boolean;
  onApply: (overrides: Record<number, string | null>) => void;
  onClose: () => void;
}

export function ConstEditModal({ header, readOnly, onApply, onClose }: ConstEditModalProps) {
  const consts = (header?.items ?? []).filter((i) => i.FILL_KIND === "CONST");
  const [values, setValues] = useState<Record<number, string>>({});
  useEffect(() => {
    const init: Record<number, string> = {};
    for (const i of header?.items ?? []) {
      if (i.FILL_KIND === "CONST") init[i.SEQ] = i.OVERRIDE_VALUE ?? "";
    }
    setValues(init);
  }, [header]);

  return (
    <Modal
      open={header != null}
      title={`상수 편집 — ${header?.HEADER_NAME ?? ""}`}
      size="lg"
      onClose={onClose}
      footer={
        <span style={{ display: "inline-flex", gap: "var(--spacing-sm)" }}>
          {!readOnly && (
            <Button data-testid="const-edit-apply" variant="primary" onClick={() => {
              const out: Record<number, string | null> = {};
              for (const [seq, v] of Object.entries(values)) out[Number(seq)] = v.trim() === "" ? null : v.trim();
              onApply(out);
            }}>적용</Button>
          )}
          <Button onClick={onClose}>닫기</Button>
        </span>
      }
    >
      <div data-testid="const-edit-modal">
        <p style={hint}>헤더 템플릿이 기본값을 제안하고 이 전문이 상수를 확정합니다. AUTO 는 송신 시점에 채워져 여기 나오지 않습니다.</p>
        <table style={DETAIL_TABLE_STYLE}>
          <thead>
            <tr>
              <th style={DETAIL_LABEL_CELL}>항목</th>
              <th style={DETAIL_LABEL_CELL}>헤더 기본값</th>
              <th style={DETAIL_LABEL_CELL}>이 전문의 값</th>
              <th style={DETAIL_LABEL_CELL}>재정의</th>
            </tr>
          </thead>
          <tbody>
            {consts.map((i) => {
              const phys = i.COLUMN_PHYS ?? String(i.SEQ);
              const v = values[i.SEQ] ?? "";
              return (
                <tr key={i.SEQ}>
                  <td style={DETAIL_VALUE_CELL}>{`${i.DISPLAY_NAME ?? phys} (${phys})`}</td>
                  <td style={DETAIL_VALUE_CELL}><span data-testid={`const-default-${phys}`}>{i.DEFAULT_VALUE ?? ""}</span></td>
                  <td style={DETAIL_VALUE_CELL}>
                    <Input data-testid={`const-input-${phys}`} aria-label={`${phys} 이 전문의 값`} value={v}
                      placeholder={i.DEFAULT_VALUE ?? ""} disabled={readOnly}
                      onChange={(nv) => setValues((m) => ({ ...m, [i.SEQ]: nv }))} />
                  </td>
                  <td style={DETAIL_VALUE_CELL}>{v.trim() !== "" && <span style={badge}>재정의</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
