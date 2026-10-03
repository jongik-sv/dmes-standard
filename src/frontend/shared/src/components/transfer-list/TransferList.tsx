"use client";

/**
 * 전송 목록 — 좌(가능)/우(소속) 두 목록 사이로 코드를 옮기는 제어형 부품.
 * - 소속 집합은 부모가 쥔다(`value`·`onChange`). 이 부품은 `value` 를 복사해 두지 않고, 검색어·분류 필터·좌우 선택·
 *   Shift 기준점만 로컬로 둔다. 이동(`>`·`>>`·`<`·`<<`)은 그 자리에서 `onChange(next)` 를 부른다.
 * - 선택: 행 클릭은 토글, Shift 클릭은 마지막으로 누른 행부터 범위, 열 머리 체크박스는 보이는 목록 전체.
 *   행 안 체크박스를 눌러도 같다(토글은 행 onClick 한 곳에서만 한다).
 * - `>`·`<` 는 그쪽 선택이 있어야, `>>`·`<<` 는 그쪽 보이는 목록이 있어야 켜진다. `>`·`<` 는 옮긴 뒤 선택을 비운다.
 * - 분류 필터는 `getGroup` 이 낸 값이 하나라도 있을 때만 그린다. 배지·가능 쪽 숨김 규칙·문구·testId 는 props 로 받는다.
 * - testId 는 접두어 하나로 조립한다: 뿌리 `{testId}`, 검색 `-search`, 분류 `-{groupTestIdSuffix}`, 열 `-available`·
 *   `-member`, 항목 `-item-{side}-{code}`, 배지 `-mark-{code}`, 이동 `-move-right`·`-move-right-all`·`-move-left`·
 *   `-move-left-all`.
 */
import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { Button, Checkbox, Input, Select } from "../form";
import { GridBadge } from "../grid/GridBadge";
import {
  groupOptions, moveAllVisible, moveSelected, rangeSelect, removeAllVisible, removeSelected, selectAllVisible,
  toggleSelect, visibleList, type TransferListItem, type TransferListSide,
} from "./transfer-set";

/** 항목 옆 배지(그리드 배지 모양). */
export interface TransferListBadge {
  label: ReactNode;
  /** 배경색 — 의미 토큰(`var(--color-…)`). */
  bg?: string;
  /** 글자색 — 의미 토큰(`var(--color-…)`). */
  color?: string;
  title?: string;
}

export interface TransferListLabels {
  /** 검색 칸 placeholder(기본 "코드·이름 검색"). */
  search?: string;
  /** 왼쪽 열 이름(기본 "가능"). */
  available?: string;
  /** 오른쪽 열 이름(기본 "소속"). */
  member?: string;
  /** 건수 단위(기본 "건") — 열 머리에 `{열 이름} {n}{단위}` 로 보인다. */
  countUnit?: string;
  /** 분류 필터의 '전체' 항목 글(기본 "분류 전체"). */
  groupAll?: string;
}

export interface TransferListProps<T extends TransferListItem = TransferListItem> {
  /** 후보 전체(가능·소속 양쪽). 순서대로 그린다. */
  items: readonly T[];
  /** 지금 소속 코드 집합(제어형). */
  value: ReadonlySet<string>;
  /** 이동할 때마다 새 소속 집합으로 부른다. */
  onChange: (next: Set<string>) => void;
  /** false 면 이동·선택·전체선택이 꺼진다(검색·분류 필터는 된다). 기본 true. */
  editable?: boolean;
  /** testId 접두어(기본 "transfer-list"). */
  testId?: string;
  /** 항목의 분류 값 — 주면 분류 필터를 그린다(값이 하나도 없으면 그리지 않는다). */
  getGroup?: (item: T) => string | null | undefined;
  /** 분류 필터 testId 접미(기본 "group" → `{testId}-group`). */
  groupTestIdSuffix?: string;
  /** true 인 항목은 가능 쪽에 보이지 않는다(소속 쪽에는 남는다). */
  hideFromAvailable?: (item: T) => boolean;
  /** 항목 옆 배지. null·undefined 면 그리지 않는다. */
  getBadge?: (item: T) => TransferListBadge | null | undefined;
  /** 문구. */
  labels?: TransferListLabels;
}

const hint: CSSProperties = {
  color: "var(--color-text-secondary)",
  fontSize: "var(--font-size-sm)",
  margin: "0 0 var(--spacing-xs) 0",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: "var(--spacing-sm)",
  alignItems: "stretch",
  minHeight: 0,
};

const columnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
};

const listStyle: CSSProperties = {
  flex: 1,
  minHeight: 200,
  maxHeight: 320,
  overflowY: "auto",
  padding: "var(--spacing-xs)",
};

const buttonsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "var(--spacing-xs)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-xs)",
  padding: "2px var(--spacing-xs)",
  fontSize: "var(--font-size-sm)",
};

/** 코드 칸 폭을 고정해야 이름이 줄마다 같은 자리에서 시작한다. */
const codeStyle: CSSProperties = {
  flex: "0 0 88px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const nameStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function TransferList<T extends TransferListItem>(props: TransferListProps<T>) {
  const {
    items, value, onChange, editable = true, testId = "transfer-list", getGroup, groupTestIdSuffix = "group",
    hideFromAvailable, getBadge, labels,
  } = props;
  const searchLabel = labels?.search ?? "코드·이름 검색";
  const availableLabel = labels?.available ?? "가능";
  const memberLabel = labels?.member ?? "소속";
  const countUnit = labels?.countUnit ?? "건";
  const groupAll = labels?.groupAll ?? "분류 전체";

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [availableSelected, setAvailableSelected] = useState<Set<string>>(new Set());
  const [memberSelected, setMemberSelected] = useState<Set<string>>(new Set());
  const [availableAnchor, setAvailableAnchor] = useState<string | null>(null);
  const [memberAnchor, setMemberAnchor] = useState<string | null>(null);

  const groupOpts = useMemo(() => (getGroup ? groupOptions(items, getGroup) : []), [items, getGroup]);
  const available = useMemo(
    () => visibleList(items, value, "available", { query, group, getGroup, hideFromAvailable }),
    [items, value, query, group, getGroup, hideFromAvailable],
  );
  const member = useMemo(
    () => visibleList(items, value, "member", { query, group, getGroup, hideFromAvailable }),
    [items, value, query, group, getGroup, hideFromAvailable],
  );

  const clickItem = (side: TransferListSide, code: string, shiftKey: boolean) => {
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

  const moveRight = () => { onChange(moveSelected(value, availableSelected)); setAvailableSelected(new Set()); };
  const moveRightAll = () => onChange(moveAllVisible(value, available));
  const moveLeft = () => { onChange(removeSelected(value, memberSelected)); setMemberSelected(new Set()); };
  const moveLeftAll = () => onChange(removeAllVisible(value, member));

  const renderColumn = (
    side: TransferListSide, list: T[], selected: Set<string>, setSelected: (s: Set<string>) => void,
  ) => (
    <div data-testid={`${testId}-${side}`} style={columnStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)", padding: "var(--spacing-xs)" }}>
        <Checkbox
          checked={list.length > 0 && list.every((it) => selected.has(it.code))}
          disabled={!editable || list.length === 0}
          onChange={(checked) => setSelected(checked ? selectAllVisible(list) : new Set())} />
        <span style={hint}>{side === "available" ? availableLabel : memberLabel} {list.length}{countUnit}</span>
      </div>
      <div style={listStyle}>
        {list.map((it) => {
          const badge = getBadge?.(it);
          return (
            <div key={it.code} data-testid={`${testId}-item-${side}-${it.code}`} style={rowStyle}
              onClick={(e: MouseEvent) => editable && clickItem(side, it.code, e.shiftKey)}>
              {/* 토글은 행 onClick 한 곳에서만 한다 — 체크박스 클릭도 행으로 올라오므로 여기서 또 토글하면 서로 지운다. */}
              <Checkbox checked={selected.has(it.code)} disabled={!editable} />
              <span style={codeStyle}>{it.code}</span>
              <span style={{ ...hint, ...nameStyle }}>{it.name ?? ""}</span>
              {badge && (
                <span data-testid={`${testId}-mark-${it.code}`}>
                  <GridBadge label={badge.label} bg={badge.bg} color={badge.color} title={badge.title} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div data-testid={testId}>
      <div style={{ display: "flex", gap: "var(--spacing-sm)", padding: "0 var(--spacing-sm) var(--spacing-xs)" }}>
        <Input data-testid={`${testId}-search`} value={query} onChange={setQuery} placeholder={searchLabel} />
        {groupOpts.length > 0 && (
          <Select data-testid={`${testId}-${groupTestIdSuffix}`} value={group ?? ""} onChange={(v) => setGroup(v || null)}
            placeholder={groupAll} options={groupOpts.map((v) => ({ value: v, label: v }))} />
        )}
      </div>
      <div style={gridStyle}>
        {renderColumn("available", available, availableSelected, setAvailableSelected)}
        <div style={buttonsStyle}>
          <Button data-testid={`${testId}-move-right`} size="mini" disabled={!editable || availableSelected.size === 0}
            onClick={moveRight}>&gt;</Button>
          <Button data-testid={`${testId}-move-right-all`} size="mini" disabled={!editable || available.length === 0}
            onClick={moveRightAll}>&gt;&gt;</Button>
          <Button data-testid={`${testId}-move-left`} size="mini" disabled={!editable || memberSelected.size === 0}
            onClick={moveLeft}>&lt;</Button>
          <Button data-testid={`${testId}-move-left-all`} size="mini" disabled={!editable || member.length === 0}
            onClick={moveLeftAll}>&lt;&lt;</Button>
        </div>
        {renderColumn("member", member, memberSelected, setMemberSelected)}
      </div>
    </div>
  );
}
