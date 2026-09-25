"use client";

/**
 * TABLE 카테고리 소속 transfer-list(TSK-07-02 design.md §2). 후보(items)는 부모가 view 로 이미 열린 항목만
 * 받아 온다(R5). 화면에서 좌(가능)↔우(소속)로 옮긴 뒤 「적용」을 눌러야 서버로 나간다(diffMembers, 전부-아니면-전무
 * 는 서버가 한다, R12).
 */
import { useMemo, useState } from "react";
import { Button, Input } from "@dk-oasis/shared/form";
import { availableOf, memberOf, type TransferItem } from "../transfer";

export interface TransferListPanelProps {
  items: TransferItem[];
  memberCodes: ReadonlySet<string>;
  canEdit: boolean;
  onChange: (next: Set<string>) => void;
  onApply: () => void;
}

export function TransferListPanel(props: TransferListPanelProps) {
  const { items, memberCodes, canEdit, onChange, onApply } = props;
  const [query, setQuery] = useState("");
  const available = useMemo(() => availableOf(items, memberCodes, query), [items, memberCodes, query]);
  const members = useMemo(() => memberOf(items, memberCodes, query), [items, memberCodes, query]);
  const [selectedAvailable, setSelectedAvailable] = useState<Set<string>>(new Set());
  const [selectedMember, setSelectedMember] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, setSet: (v: Set<string>) => void, code: string) => {
    const next = new Set(set);
    if (next.has(code)) next.delete(code); else next.add(code);
    setSet(next);
  };

  const moveRight = () => {
    const next = new Set(memberCodes);
    selectedAvailable.forEach((c) => next.add(c));
    onChange(next);
    setSelectedAvailable(new Set());
  };
  const moveLeft = () => {
    const next = new Set(memberCodes);
    selectedMember.forEach((c) => next.delete(c));
    onChange(next);
    setSelectedMember(new Set());
  };

  return (
    <div data-testid="transfer-list-panel" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)",
      padding: "var(--spacing-sm)" }}>
      <Input data-testid="transfer-query" value={query} onChange={setQuery} placeholder="코드·이름 검색" />
      <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
        <div data-testid="transfer-available" style={{ flex: 1, border: "1px solid var(--color-border)", minHeight: 160,
          overflowY: "auto" }}>
          {available.map((it) => (
            <div key={it.code} data-testid={`transfer-available-${it.code}`}
              onClick={() => canEdit && toggle(selectedAvailable, setSelectedAvailable, it.code)}
              style={{
                padding: "var(--spacing-xs)", cursor: canEdit ? "pointer" : "default",
                background: selectedAvailable.has(it.code) ? "var(--color-surface-selected)" : undefined,
              }}>
              {it.code} {it.name ?? ""}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "var(--spacing-xs)" }}>
          <Button data-testid="transfer-move-right" size="mini" disabled={!canEdit} onClick={moveRight}>&gt;</Button>
          <Button data-testid="transfer-move-left" size="mini" disabled={!canEdit} onClick={moveLeft}>&lt;</Button>
        </div>
        <div data-testid="transfer-member" style={{ flex: 1, border: "1px solid var(--color-border)", minHeight: 160,
          overflowY: "auto" }}>
          {members.map((it) => (
            <div key={it.code} data-testid={`transfer-member-${it.code}`}
              onClick={() => canEdit && toggle(selectedMember, setSelectedMember, it.code)}
              style={{
                padding: "var(--spacing-xs)", cursor: canEdit ? "pointer" : "default",
                background: selectedMember.has(it.code) ? "var(--color-surface-selected)" : undefined,
              }}>
              {it.code} {it.name ?? ""}
            </div>
          ))}
        </div>
      </div>
      <Button data-testid="transfer-apply" size="sm" disabled={!canEdit} onClick={onApply}>적용</Button>
    </div>
  );
}
