"use client";

/**
 * TABLE 카테고리 소속 편집 영역 — 좌(가능)/우(소속) transfer-list(TSK-06-04 design.md §2). 모습·동작은 shared
 * `TransferList`(전체선택 체크박스+건수, 검색, attr(lvl1) 필터, Shift 범위선택, `>`/`>>`/`<`/`<<`)가 맡고, 이 화면은
 * testId 접두어 `cate-transfer`·lvl1 필터·코드 탭 미저장 배지(`미저장`·`삭제 예정`, D-101)·삭제 표시 숨김만 넘긴다.
 */
import { TransferList, type TransferListBadge } from "@dk-oasis/shared/transfer-list";
import { isDeletedMark, lvl1Of, MARK, type TransferItem } from "../transfer";

export interface TransferListPanelProps {
  items: TransferItem[];
  memberCodes: ReadonlySet<string>;
  editable: boolean;
  onChange: (next: Set<string>) => void;
}

const markBadge = (it: TransferItem): TransferListBadge | null => (it.mark ? MARK[it.mark] : null);

const LABELS = { groupAll: "1차 전체" };

export function TransferListPanel(props: TransferListPanelProps) {
  const { items, memberCodes, editable, onChange } = props;
  return (
    <TransferList
      items={items}
      value={memberCodes}
      onChange={onChange}
      editable={editable}
      testId="cate-transfer"
      getGroup={lvl1Of}
      groupTestIdSuffix="lvl1"
      hideFromAvailable={isDeletedMark}
      getBadge={markBadge}
      labels={LABELS}
    />
  );
}
