"use client";

/**
 * 도메인 한 개를 정하는 입력 칸 — 전체 목록 콤보 대신 쓴다. 칸에 도메인명·표준명을 직접 넣고 Enter·포커스 이동으로 확정하면 서버에서 찾아
 * 하나로 정해지면 바로 적용하고(`matchDomain`), 정하지 못하면 그 글자로 찾기 팝업을 연다. [찾기] 는 빈 검색어로 팝업을 연다. 칸을 비우면 해제한다.
 * 서버 검색은 `search` props 로 받는다(MDM 도메인 데이터에 묶인 위젯이라 `@dk-oasis/shared` 에 두지 않는다).
 */
import { useEffect, useRef, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { DomainSearchBox, matchDomain, type DomainRow, type DomainSearchFn } from "./DomainSearchBox";

export interface DomainFieldProps {
  /** 현재 도메인 ID — 없으면 null. */
  domainId: number | null;
  /** 현재 도메인을 칸에 보일 글자(도메인명 등). */
  label: string;
  search: DomainSearchFn;
  /** 고르면 줄을, 해제하면 null 을 알린다. */
  onChange: (row: DomainRow | null) => void;
  disabled?: boolean;
  testId: string;
  /** 입력 칸의 접근성 이름. */
  ariaLabel?: string;
  /** 검색 결과에서 바로 적용할 도메인을 고른다. 기본은 `matchDomain`(정확 일치, 없으면 단건). */
  autoPick?: (rows: readonly DomainRow[], text: string) => DomainRow | null;
  /** 찾기 팝업이 열리고 닫힐 때 알린다 — 바깥 팝업이 Escape 를 무시할 때 쓴다(Local-Rules §18). */
  onPopupChange?: (open: boolean) => void;
}

export function DomainField({ domainId, label, search, onChange, disabled, testId, ariaLabel, autoPick = matchDomain, onPopupChange }: DomainFieldProps) {
  const [text, setText] = useState(label);
  const [popup, setPopupState] = useState<string | null>(null);
  const setPopup = (v: string | null) => {
    setPopupState(v);
    onPopupChange?.(v !== null);
  };
  /** 확정 검색 순번(Local-Rules §11·§15) — [찾기]·새 확정이 시작되면 그 전에 시작된 확정 응답은 적용하지 않는다. */
  const seq = useRef(0);

  // 밖에서 도메인이 바뀌면(행 선택·초기화) 칸 글자를 맞춘다.
  useEffect(() => {
    setText(label);
  }, [label, domainId]);

  const pick = (row: DomainRow) => {
    onChange(row);
    setText(row.domainName || row.stdName);
    setPopup(null);
  };

  const confirm = async () => {
    const t = text.trim();
    if (t === "") {
      if (domainId != null) onChange(null);
      return;
    }
    if (domainId != null && t === label.trim()) return;
    const mine = ++seq.current;
    let found: DomainRow[] = [];
    try {
      found = await search(t);
    } catch {
      // 검색 오류는 팝업이 다시 검색하며 보인다.
    }
    if (mine !== seq.current) return;
    const hit = autoPick(found, t);
    if (hit) pick(hit);
    else setPopup(t);
  };

  // [찾기]를 누르면 칸을 떠날 때(blur) 시작된 확정 검색을 무른다 — 늦게 온 한 건 응답이 막 연 팝업을 닫지 않게.
  const openFinder = () => {
    seq.current++;
    setPopup("");
  };

  return (
    <div style={{ display: "flex", gap: "var(--spacing-xs)", alignItems: "center" }}>
      <Input
        data-testid={testId}
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        placeholder="도메인명·표준명 입력"
        onChange={setText}
        onBlur={() => void confirm()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) void confirm();
        }}
      />
      <Button disabled={disabled} data-testid={`${testId}-find`} onClick={openFinder}>
        찾기
      </Button>
      <Modal open={popup !== null} title="도메인 찾기" size="md" onClose={() => setPopup(null)}>
        {popup !== null && (
          <DomainSearchBox key={popup} search={search} testId={`${testId}-box`} initialKeyword={popup} onPick={pick} onClose={() => setPopup(null)} />
        )}
      </Modal>
    </div>
  );
}
