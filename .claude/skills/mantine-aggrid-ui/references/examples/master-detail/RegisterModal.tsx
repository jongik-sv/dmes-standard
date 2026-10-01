"use client";

/**
 * 작업지시 등록 팝업. 화면 유형 E(등록 팝업) 표준 예제.
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §E
 */
import { useEffect, useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, DatePicker, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { registerWorkOrder } from "./api";
import { emptyRegisterForm, type WorkOrderRegisterForm } from "./types";

export interface RegisterModalProps {
  open: boolean;
  onClose: () => void;
  /** 등록에 성공하면 부모가 목록을 다시 조회한다. */
  onRegistered: () => void;
}

export function RegisterModal({ open, onClose, onRegistered }: RegisterModalProps) {
  const { showMessage } = useMessage();
  const [form, setForm] = useState<WorkOrderRegisterForm>(emptyRegisterForm);
  const [isBusy, setIsBusy] = useState(false);

  // 열 때마다 빈 폼으로 시작한다.
  useEffect(() => {
    if (open) setForm(emptyRegisterForm());
  }, [open]);

  const setField = (key: keyof WorkOrderRegisterForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.itemCd.trim() || !(Number(form.planQty) > 0)) {
      showMessage({ message: "품번과 계획수량을 입력하세요.", alertType: "warning" });
      return;
    }
    setIsBusy(true);
    try {
      await registerWorkOrder(form);
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      onRegistered();
      onClose();
    } catch (e) {
      showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="작업지시 등록"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isBusy}>
            저장
          </Button>
        </>
      }
    >
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>품번 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input value={form.itemCd} disabled={isBusy} onChange={(v) => setField("itemCd", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>계획수량 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input type="number" value={form.planQty} disabled={isBusy} onChange={(v) => setField("planQty", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>계획일자</th>
            <td style={DETAIL_VALUE_CELL}>
              <DatePicker value={form.planDt} disabled={isBusy} onChange={(v) => setField("planDt", v)} />
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
