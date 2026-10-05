"use client";

/**
 * 세트 검색 팝업(하위 세트 spec §9) — 도구 상자 「룰 세트」·선 메뉴 「룰 세트 넣기」 가 연다. shared `Modal` 안에 세트 고르기(`IdPicker`)를 둔다.
 * 후보는 사용 중(INUSE) 세트만, 지금 편집 중인 세트는 뺀다. 순환이 될 세트는 저장 때 CALL_CYCLE 경고·확정 때 거부로 알리므로 여기서 미리 거르지 않는다.
 * 고르면 `onPick` — 편집기가 팝업을 닫고 그 선에 SET 노드를 끼운다(되돌리기 한 칸).
 * Modal 은 body 로 포털되어 탭 패널의 display:none 을 따르지 않는다 — 고르지 않은 탭이면 열지 않는다(`EditorActiveContext`, ui:7 결정 14-b).
 * 서버는 거르기 전에 20건(`PICK_LIMIT`)에서 자르므로, 화면에서 거른 뒤 남은 줄이 20건보다 적으면 `IdPicker` 의 「20건까지」 안내가 뜨지 않는다.
 * 그래서 서버 건수가 20건에 닿았는데 거르며 줄이 빠졌으면 팝업이 따로 「더 좁혀 검색하라」 고 알린다(`pickCut`, ui:8 리뷰).
 */
import { useContext, useRef, useState } from "react";

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

/**
 * 서버가 20건에서 잘랐고 화면 거르기로 줄이 빠져 `IdPicker` 의 「20건까지」 안내가 뜨지 않는 경우 — 21번째 뒤의 사용 중 세트가 말없이 빠진다.
 * 거르기로 빠진 줄이 없으면(남은 줄이 20건) `IdPicker` 가 스스로 안내하므로 겹쳐 알리지 않는다.
 */
export function pickCut(serverCount: number, shownCount: number): boolean {
  return serverCount >= LIMIT && shownCount < LIMIT;
}

export function SetPickModal({ open, currentSetId, onPick, onClose, onError }: SetPickModalProps) {
  const active = useContext(EditorActiveContext);
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
      {shown && <SetPickBody currentSetId={currentSetId} onPick={onPick} onError={onError} />}
    </Modal>
  );
}

/** 팝업 본문 — 열 때마다 새로 그려 지난 찾기의 잘림 안내가 남지 않는다. */
function SetPickBody({ currentSetId, onPick, onError }: Pick<SetPickModalProps, "currentSetId" | "onPick" | "onError">) {
  const [cut, setCut] = useState(false);
  /**
   * 찾기 순번(Local-Rules §11) — 늦게 온 옛 찾기가 잘림 안내를 바꾸지 않게. 글자를 바꾸면 올려서, `IdPicker` 가 버리는 옛 응답이 안내를 띄우지 않게 한다.
   */
  const seq = useRef(0);
  const search = async (keyword: string): Promise<IdPickRow[]> => {
    const mine = ++seq.current;
    const sets = (await searchSets(keyword)).sets ?? [];
    const rows = setPickRows(sets, currentSetId);
    if (mine === seq.current) setCut(pickCut(sets.length, rows.length));
    return rows;
  };
  // 글자를 바꾸면 `IdPicker` 가 목록을 닫으므로 안내도 거둔다(입력 칸의 change 가 이 상자까지 올라온다).
  const onKeywordChange = () => {
    seq.current++;
    setCut(false);
  };
  return (
    <div data-testid="set-pick-modal" style={{ minHeight: 280 }} onChange={onKeywordChange}>
      <p style={{ margin: "0 0 var(--spacing-sm)", color: "var(--color-text-secondary)" }}>
        사용 중인 세트만 보인다. 고르면 선에 룰 세트 노드를 끼운다
      </p>
      {/* 찾기 목록은 칸 아래에 겹쳐 뜨므로 안내는 칸 위에 둔다. */}
      {cut && (
        <p data-testid="set-pick-modal-cut" style={{ margin: "0 0 var(--spacing-sm)", color: "var(--color-warning)" }}>
          앞 {LIMIT}건에서 사용 중이 아니거나 지금 세트인 줄을 뺐다. 사용 중인 세트가 더 있을 수 있으니 더 좁혀 검색하세요
        </p>
      )}
      <IdPicker placeholder="세트 ID·세트명" noun="세트" testId="set-pick-modal-pick" search={search} limit={LIMIT} onPick={onPick} onError={onError} />
    </div>
  );
}
