"use client";

/**
 * 세트 검색 팝업(하위 세트 spec §9) — 도구 상자 「룰 세트」·선 메뉴 「룰 세트 넣기」 가 연다. shared `Modal` 안에 세트 고르기(`IdPicker`)를 둔다.
 * 후보는 사용 중(INUSE) 세트만, 지금 편집 중인 세트는 뺀다. 순환이 될 세트는 저장 때 CALL_CYCLE 경고·확정 때 거부로 알리므로 여기서 미리 거르지 않는다.
 * 고르면 `onPick` — 편집기가 팝업을 닫고 그 선에 SET 노드를 끼운다(되돌리기 한 칸).
 * Modal 은 body 로 포털되어 탭 패널의 display:none 을 따르지 않는다 — 고르지 않은 탭이면 열지 않는다(`EditorActiveContext`, ui:7 결정 14-b).
 */
import { useContext } from "react";

import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { IdPicker, type IdPickRow } from "@/shell";

import { searchSets } from "../api";
import { EditorActiveContext } from "../tabs-context";

export interface SetPickModalProps {
  open: boolean;
  /** 지금 편집 중인 세트(후보에서 뺀다). */
  currentSetId: string | null;
  onPick(setId: string): void;
  onClose(): void;
  onError(message: string): void;
}

/** 서버 `RuleSetEditService.PICK_LIMIT` 과 같다. */
const LIMIT = 20;

/** 팝업 후보 — 사용 중이고 지금 세트가 아닌 세트(하위 세트 spec §9). 서버 찾기 결과에서 거른다. */
export function setPickRows(sets: readonly { setId: string; setName: string; status: string }[], currentSetId: string | null): IdPickRow[] {
  return sets.filter((s) => s.status === "INUSE" && s.setId !== currentSetId).map((s) => ({ id: s.setId, name: s.setName, status: s.status }));
}

export function SetPickModal({ open, currentSetId, onPick, onClose, onError }: SetPickModalProps) {
  const active = useContext(EditorActiveContext);
  const search = async (keyword: string): Promise<IdPickRow[]> => setPickRows((await searchSets(keyword)).sets ?? [], currentSetId);
  const shown = open && active;
  return (
    <Modal
      open={shown}
      title="부를 룰 세트 고르기"
      size="md"
      onClose={onClose}
      footer={
        <Button data-testid="set-pick-modal-cancel" onClick={onClose}>
          닫기
        </Button>
      }
    >
      {shown && (
        <div data-testid="set-pick-modal" style={{ minHeight: 280 }}>
          <p style={{ margin: "0 0 var(--spacing-sm)", color: "var(--color-text-secondary)" }}>
            사용 중인 세트만 보인다. 고르면 선에 룰 세트 노드를 끼운다
          </p>
          <IdPicker placeholder="세트 ID·세트명" noun="세트" testId="set-pick-modal-pick" search={search} limit={LIMIT} onPick={onPick} onError={onError} />
        </div>
      )}
    </Modal>
  );
}
