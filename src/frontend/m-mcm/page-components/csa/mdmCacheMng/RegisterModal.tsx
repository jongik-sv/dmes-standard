"use client";

/**
 * mdmCacheMng 등록 팝업 — 고른 모듈 인스턴스에 대상 종류·키를 미리 적재한다(load). 화면 유형 E.
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §E
 */
import { useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Select, Textarea } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { describeLoadResult, loadKeys, parseKeys } from "./api";
import { REGISTER_TYPE_OPTIONS, type MdmTargetType } from "./types";

export interface RegisterModalProps {
  open: boolean;
  /** 적재할 모듈(위 그리드에서 고른 행). */
  module: string;
  onClose: () => void;
  /** 등록이 끝나면 부모가 항목을 다시 조회한다. */
  onRegistered: () => void;
}

export function RegisterModal({ open, module, onClose, onRegistered }: RegisterModalProps) {
  const { showMessage } = useMessage();
  const [type, setType] = useState<MdmTargetType>("COLUMN");
  const [keysText, setKeysText] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  // 열 때마다 빈 폼으로 시작한다(렌더 중 상태 보정 — effect 안 setState 를 피한다).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setType("COLUMN");
      setKeysText("");
    }
  }

  const handleSubmit = async () => {
    const keys = parseKeys(keysText);
    if (keys.length === 0) {
      showMessage({ message: "키를 입력하세요.", alertType: "warning" });
      return;
    }
    setIsBusy(true);
    try {
      const r = await loadKeys(module, type, keys);
      if (r.missing.length > 0 || r.unavailable.length > 0) {
        showMessage({ title: "확인", message: describeLoadResult(r), alertType: "warning" });
      } else {
        showMessage({ message: "적재했습니다.", alertType: "success", toast: true });
      }
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
      title={`캐시 등록 — ${module}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isBusy}>
            등록
          </Button>
        </>
      }
    >
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>대상 종류 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select value={type} options={REGISTER_TYPE_OPTIONS} disabled={isBusy} onChange={(v) => setType(v as MdmTargetType)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>키 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea value={keysText} disabled={isBusy} onChange={setKeysText} />
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
