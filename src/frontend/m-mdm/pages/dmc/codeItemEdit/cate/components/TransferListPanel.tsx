"use client";

/**
 * TABLE 카테고리 소속 편집 영역 — 좌(가능)/우(소속) transfer-list(TSK-06-04 design.md §2). 로직은 `../transfer.ts`
 * 순수 함수만 쓴다(전체선택 체크박스+건수, 검색, attr(lvl1) 필터, Shift 범위선택, `>`/`>>`/`<`/`<<`). 코드 탭의 미저장
 * 변경은 항목 옆 배지(`미저장`·`삭제 예정`)로 보인다(D-101).
 */
import { useMemo, useState, type MouseEvent } from "react";
import { Button, Checkbox, Input, Select } from "@dk-oasis/shared/form";
import { GridBadge } from "@dk-oasis/shared/grid";
import {
  lvl1Options, moveAllVisible, moveSelected, rangeSelect, removeAllVisible, removeSelected,
  selectAllVisible, toggleSelect, visibleList, type TransferItem, type TransferMark, type TransferSide,
} from "../transfer";
import { hint, transferButtons, transferColumn, transferGrid, transferList, transferRow } from "./styles";

export interface TransferListPanelProps {
  items: TransferItem[];
  memberCodes: ReadonlySet<string>;
  editable: boolean;
  onChange: (next: Set<string>) => void;
}

const MARK: Record<TransferMark, { label: string; bg: string; color: string }> = {
  unsaved: { label: "미저장", bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  deleted: { label: "삭제 예정", bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

export function TransferListPanel(props: TransferListPanelProps) {
  const { items, memberCodes, editable, onChange } = props;
  const [query, setQuery] = useState("");
  const [lvl1, setLvl1] = useState<string | null>(null);
  const [availableSelected, setAvailableSelected] = useState<Set<string>>(new Set());
  const [memberSelected, setMemberSelected] = useState<Set<string>>(new Set());
  const [availableAnchor, setAvailableAnchor] = useState<string | null>(null);
  const [memberAnchor, setMemberAnchor] = useState<string | null>(null);

  const lvl1Opts = useMemo(() => lvl1Options(items), [items]);
  const available = useMemo(() => visibleList(items, memberCodes, "available", query, lvl1), [items, memberCodes, query, lvl1]);
  const member = useMemo(() => visibleList(items, memberCodes, "member", query, lvl1), [items, memberCodes, query, lvl1]);

  const clickItem = (side: TransferSide, code: string, shiftKey: boolean) => {
    const visible = side === "available" ? available : member;
    const setSelected = side === "available" ? setAvailableSelected : setMemberSelected;
    const anchor = side === "available" ? availableAnchor : memberAnchor;
    const setAnchor = side === "available" ? setAvailableAnchor : setMemberAnchor;
    if (shiftKey) {
      setSelected(rangeSelect(visible, anchor, code));
    } else {
      setSelected((prev) => toggleSelect(prev, code));
      setAnchor(code);
    }
  };

  const moveRight = () => { onChange(moveSelected(memberCodes, availableSelected)); setAvailableSelected(new Set()); };
  const moveRightAll = () => onChange(moveAllVisible(memberCodes, available));
  const moveLeft = () => { onChange(removeSelected(memberCodes, memberSelected)); setMemberSelected(new Set()); };
  const moveLeftAll = () => onChange(removeAllVisible(memberCodes, member));

  const renderColumn = (
    side: TransferSide, list: TransferItem[], selected: Set<string>, setSelected: (s: Set<string>) => void,
  ) => (
    <div data-testid={`cate-transfer-${side}`} style={transferColumn}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)", padding: "var(--spacing-xs)" }}>
        <Checkbox data-testid={`cate-transfer-select-all-${side}`}
          checked={list.length > 0 && list.every((it) => selected.has(it.code))}
          disabled={!editable || list.length === 0}
          onChange={(checked) => setSelected(checked ? selectAllVisible(list) : new Set())} />
        <span style={hint}>{side === "available" ? "가능" : "소속"} {list.length}건</span>
      </div>
      <div style={transferList}>
        {list.map((it) => (
          <div key={it.code} data-testid={`cate-transfer-item-${side}-${it.code}`} style={transferRow}
            onClick={(e: MouseEvent) => editable && clickItem(side, it.code, e.shiftKey)}>
            <Checkbox checked={selected.has(it.code)} disabled={!editable} onChange={() => editable && clickItem(side, it.code, false)} />
            <span>{it.code}</span>
            <span style={hint}>{it.name ?? ""}</span>
            {it.mark && (
              <span data-testid={`cate-transfer-mark-${it.code}`}>
                <GridBadge label={MARK[it.mark].label} bg={MARK[it.mark].bg} color={MARK[it.mark].color} />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div data-testid="cate-transfer">
      <div style={{ display: "flex", gap: "var(--spacing-sm)", padding: "0 var(--spacing-sm) var(--spacing-xs)" }}>
        <Input data-testid="cate-transfer-search" value={query} onChange={setQuery} placeholder="코드·이름 검색" />
        {lvl1Opts.length > 0 && (
          <Select data-testid="cate-transfer-lvl1" value={lvl1 ?? ""} onChange={(v) => setLvl1(v || null)}
            placeholder="1차 전체" options={lvl1Opts.map((v) => ({ value: v, label: v }))} />
        )}
      </div>
      <div style={transferGrid}>
        {renderColumn("available", available, availableSelected, setAvailableSelected)}
        <div style={transferButtons}>
          <Button data-testid="cate-transfer-move-right" size="mini" disabled={!editable || availableSelected.size === 0}
            onClick={moveRight}>&gt;</Button>
          <Button data-testid="cate-transfer-move-right-all" size="mini" disabled={!editable || available.length === 0}
            onClick={moveRightAll}>&gt;&gt;</Button>
          <Button data-testid="cate-transfer-move-left" size="mini" disabled={!editable || memberSelected.size === 0}
            onClick={moveLeft}>&lt;</Button>
          <Button data-testid="cate-transfer-move-left-all" size="mini" disabled={!editable || member.length === 0}
            onClick={moveLeftAll}>&lt;&lt;</Button>
        </div>
        {renderColumn("member", member, memberSelected, setMemberSelected)}
      </div>
    </div>
  );
}
