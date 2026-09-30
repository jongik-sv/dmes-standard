"use client";

/**
 * 카테고리 추가 팝업(D-104 의 옛 dataCateEdit 등록 폼을 그대로 옮김, TSK-07-02 design.md §2).
 *
 * 목록은 ag-grid 가 그려 이 팝업만 담당한다 — 마루 코드(codeItemEdit) 쪽同名 컴포넌트와 짝을 이룬다.
 * ID·이름을 먼저 고르게 한다: 서버 `dataCateEdit.reg` 가 이 두 값을 받는데, 여기서 비워 두고 등록하면 서버가
 * 만들어 줄 이름이 없다. ID 는 `TB_MDM_DATA_CATE.CATE_ID` 가 되는 값이라 되돌릴 수 없다(중복이면 등록이 거절된다).
 */
import { useState } from "react";

import { Button, Input, Select } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

export interface CategoryAddModalProps {
  open: boolean;
  onClose: () => void;
  /** 서버 등록이 끝나면 닫고 목록은 `write` 가 다시 읽는다. */
  onAdd: (cateId: string, cateName: string, defKind: "REGEX" | "TABLE") => void | Promise<void>;
  /** 등록 중 — 버튼을 잠가 두 번 등록되지 않게 한다. */
  busy?: boolean;
}

/** 라벨은 shared `Input`/`Select` 래퍼에 `label` prop 이 없어(래퍼가 정한 모양) 폼 라벨로 따로 둔다. */
const field = { display: "flex", flexDirection: "column", gap: 4 } as const;
const fieldLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 500 } as const;

export function CategoryAddModal({ open, onClose, onAdd, busy = false }: CategoryAddModalProps) {
  // shared `Modal` 은 닫힌 첫 렌더에도 content 를 마운트한다(Transition 초기 상태). 목록에 인라인 폼을 두지 않기로
  // 한 이상, 닫혀 있는데 폼 칸이 DOM 에 남아 있으면 그게 계약 위반이다 — 닫혔으면 아예 그리지 않는다.
  if (!open) return null;
  const [cateId, setCateId] = useState("");
  const [cateName, setCateName] = useState("");
  const [defKind, setDefKind] = useState<"REGEX" | "TABLE">("TABLE");
  // 빈 칸으로 [추가]를 누르면 칸 아래에 무엇이 빠졌는지 알린다(아무 반응이 없으면 버튼이 고장 난 것처럼 보인다).
  const [missing, setMissing] = useState<{ id: boolean; name: boolean }>({ id: false, name: false });

  const submit = () => {
    const next = { id: !cateId.trim(), name: !cateName.trim() };
    setMissing(next);
    if (next.id || next.name) return;
    void Promise.resolve(onAdd(cateId.trim(), cateName.trim(), defKind)).then(() => {
      setCateId("");
      setCateName("");
      setDefKind("TABLE");
      onClose();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="카테고리 추가">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)", padding: "var(--spacing-md)" }}>
        <div style={field}>
          <span style={fieldLabel}>카테고리 ID</span>
          <Input
            data-testid="cate-add-id"
            value={cateId}
            placeholder="cate_id"
            error={missing.id ? "카테고리 ID를 입력하세요" : undefined}
            onChange={(v) => { setCateId(v); setMissing((m) => ({ ...m, id: false })); }}
          />
        </div>
        <div style={field}>
          <span style={fieldLabel}>카테고리 이름</span>
          <Input
            data-testid="cate-add-name"
            value={cateName}
            placeholder="카테고리 이름"
            error={missing.name ? "카테고리 이름을 입력하세요" : undefined}
            onChange={(v) => { setCateName(v); setMissing((m) => ({ ...m, name: false })); }}
          />
        </div>
        <div style={field}>
          <span style={fieldLabel}>종류</span>
          <Select
            data-testid="cate-add-kind"
            value={defKind}
            onChange={(v) => setDefKind(v as "REGEX" | "TABLE")}
            options={[{ value: "TABLE", label: "TABLE" }, { value: "REGEX", label: "REGEX" }]}
          />
        </div>
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          TABLE 은 정규식 없이 아래 [소속] 으로 항목을 고릅니다. REGEX 는 대상 칸과 정규식을 [편집]에서 정합니다.
        </p>
        <div style={{ display: "flex", gap: "var(--spacing-sm)", justifyContent: "flex-end" }}>
          <Button data-testid="cate-add-cancel" onClick={onClose}>취소</Button>
          <Button data-testid="cate-add-submit" variant="primary" disabled={busy} onClick={submit}>추가</Button>
        </div>
      </div>
    </Modal>
  );
}
