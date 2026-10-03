"use client";

/**
 * 카테고리 추가 팝업(TSK-06-04 design.md §1·§2). 목록은 ag-grid 가 그려 이 팝업만 담당한다 — 마루 데이터
 * (dataItemMng) 쪽 같은 이름 컴포넌트와 짝을 이룬다.
 *
 * ID·이름을 먼저 고르게 한다. 여기서 곧바로 저장되지는 않고 로컬 diff(`__local: "new"`) 에만 들어가 상단 [저장]이
 * 보낸다 — 그래도 ID 는 저장 시 `TB_MDM_CODE_CATE.CATE_ID` 가 되는 값이라, 자동 생성 placeholder(`NEW_…`)로
 * 넘기면 되돌릴 수 없다. 마루 데이터(dataItemMng) 쪽 同名 컴포넌트와 모양·testid 을 같게 둔다.
 */
import { useState } from "react";

import { Button, Input, Select } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { CategoryDef } from "../categories";

export interface CategoryAddModalProps {
  open: boolean;
  onClose: () => void;
  /** 로컬 diff 에 새 카테고리를 얹는다 — 저장은 상단 [저장]이 한다. */
  onAdd: (def: CategoryDef) => void;
  /**
   * 이 버전에 이미 있는 카테고리 ID(서버 행·로컬 새 행·닫기 표시 행). 겹치면 추가하지 않고 ID 칸에 서버와 같은 문구를 보인다 —
   * 로컬 diff 라 추가 때 서버가 거부하지 않고 [저장] 때에야 거부되기 때문이다(2026-10-03).
   */
  existingIds?: readonly string[];
  /**
   * existingIds 가운데 닫기 표시(삭제 예정)한 행의 ID. 서버는 같은 저장에서 닫기를 먼저 적용해 같은 ID 추가를 받을 수 있지만,
   * 화면의 로컬 행은 cateId 를 키로 써(그리드 rowKey·[취소]·[닫기]) 같은 ID 행이 둘이 되면 로컬 상태가 깨진다 — 그래서 막고
   * 그 행의 [취소] 로 닫기를 풀어 쓰라고 안내한다(검토 M4).
   */
  closedIds?: readonly string[];
}

/** 서버 `MasterCodeCateSegmentOps` 의 CATE_ID_OVERLAP 문구와 같다. */
export const CATE_ID_OVERLAP_TEXT = "이 버전에 이미 있는 카테고리다";
export const CATE_ID_CLOSED_TEXT = "닫기 표시한 카테고리다. 그 행의 [취소] 로 닫기를 풀어 쓴다";

/** 라벨은 shared `Input`/`Select` 래퍼에 `label` prop 이 없어(래퍼가 정한 모양) 폼 라벨로 따로 둔다. */
const field = { display: "flex", flexDirection: "column", gap: 4 } as const;
const fieldLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 500 } as const;

export function CategoryAddModal({ open, onClose, onAdd, existingIds = [], closedIds = [] }: CategoryAddModalProps) {
  const [cateId, setCateId] = useState("");
  const [cateName, setCateName] = useState("");
  const [defKind, setDefKind] = useState<"REGEX" | "TABLE">("TABLE");
  // 빈 칸으로 [추가]를 누르면 칸 아래에 무엇이 빠졌는지 알린다(아무 반응이 없으면 버튼이 고장 난 것처럼 보인다).
  const [missing, setMissing] = useState<{ id: boolean; name: boolean }>({ id: false, name: false });
  const [duplicate, setDuplicate] = useState<"none" | "open" | "closed">("none");
  // 열릴 때마다 칸을 비운다 — [취소] 로 닫았다가 다시 열어도 옛 입력이 남지 않게. 열리는 렌더 안에서 바로 맞춰
  // 옛 값이 한 번도 그려지지 않는다(React 의 prop 변화에 따른 상태 조정).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCateId("");
      setCateName("");
      setDefKind("TABLE");
      setMissing({ id: false, name: false });
      setDuplicate("none");
    }
  }
  // shared `Modal` 은 닫힌 첫 렌더에도 content 를 마운트한다(Transition 초기 상태). 목록에 인라인 폼을 두지 않기로
  // 한 이상, 닫혀 있는데 폼 칸이 DOM 에 남아 있으면 그게 계약 위반이다 — 닫혔으면 아예 그리지 않는다. 훅을 모두 부른 뒤에 돌아간다.
  if (!open) return null;

  const submit = () => {
    const next = { id: !cateId.trim(), name: !cateName.trim() };
    setMissing(next);
    if (next.id || next.name) return;
    if (existingIds.includes(cateId.trim())) {
      setDuplicate(closedIds.includes(cateId.trim()) ? "closed" : "open");
      return;
    }
    onAdd({
      cateId: cateId.trim(),
      cateName: cateName.trim(),
      defKind,
      // REGEX 는 대상 칸이 반드시 있어야 저장된다(서버 `CodeCateEditService.validate`) — 기본값을 넣어 첫 저장이
      // 정규식 없어서 거절되지 않게 한다. 정식·대상 칸은 저장 뒤 그리드에서 고쳐도 된다.
      defExpr: defKind === "REGEX" ? ".*" : null,
      defTarget: defKind === "REGEX" ? "CODE" : null,
      description: null,
    });
    setCateId("");
    setCateName("");
    setDefKind("TABLE");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="카테고리 추가">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)", padding: "var(--spacing-md)" }}>
        <div style={field}>
          <span style={fieldLabel}>ID</span>
          <Input
            data-testid="cate-add-id"
            value={cateId}
            placeholder="cate_id"
            error={
              missing.id
                ? "카테고리 ID를 입력하세요"
                : duplicate === "closed"
                  ? CATE_ID_CLOSED_TEXT
                  : duplicate === "open"
                    ? CATE_ID_OVERLAP_TEXT
                    : undefined
            }
            onChange={(v) => { setCateId(v); setMissing((m) => ({ ...m, id: false })); setDuplicate("none"); }}
          />
        </div>
        <div style={field}>
          <span style={fieldLabel}>이름</span>
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
          추가한 카테고리는 상단 [저장]을 눌러야 서버에 반영됩니다.
        </p>
        <div style={{ display: "flex", gap: "var(--spacing-sm)", justifyContent: "flex-end" }}>
          <Button data-testid="cate-add-cancel" onClick={onClose}>취소</Button>
          <Button data-testid="cate-add-submit" variant="primary" onClick={submit}>추가</Button>
        </div>
      </div>
    </Modal>
  );
}
