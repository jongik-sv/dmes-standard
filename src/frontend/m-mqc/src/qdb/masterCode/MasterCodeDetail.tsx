"use client";

/**
 * 마스터코드 상세 — 위는 고른 코드 묶음의 머리 정보(라벨-값 표), 아래는 항목 그리드(빠른 찾기 칸).
 * 항목 열은 묶음마다 다르므로(계층·속성 라벨) 열 개인화는 끈다. 빠른 찾기는 받은 항목만 좁힌다(조회 아님).
 * 다른 묶음을 고르면 빠른 찾기 글은 조회 검색어로 다시 시작한다 — 검색어로 찾은 묶음은 맞은 항목만 먼저 보인다.
 */
import { memo, useMemo, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { Input } from "@dk-oasis/shared/form";

import type { CodeSet } from "@/common/rule";

import { NA } from "../common/codes";
import {
  itemColumns,
  itemColumnSpec,
  itemMatches,
  itemRows,
  usedByText,
  type GroupRow,
} from "./groups";

const NO_ITEMS: CodeSet["items"] = [];

export interface MasterCodeDetailProps {
  row: GroupRow | null;
  set: CodeSet | undefined;
  /** 조회 검색어 — 묶음을 바꾸면 빠른 찾기가 이 글로 시작한다. */
  keyword: string;
  loading: boolean;
}

export const MasterCodeDetail = memo(function MasterCodeDetail({
  row,
  set,
  keyword,
  loading,
}: MasterCodeDetailProps) {
  const codeId = row?.codeId ?? "";
  const items = set?.items ?? NO_ITEMS;
  // 빠른 찾기 — 묶음별 글. 다른 묶음이면 조회 검색어로 시작한다(효과 없이 그 자리에서 정한다).
  const [find, setFind] = useState<{ codeId: string; text: string }>({
    codeId: "",
    text: "",
  });
  const findText = find.codeId === codeId ? find.text : keyword;

  const spec = useMemo(() => itemColumnSpec(codeId, items), [codeId, items]);
  const columns = useMemo(() => itemColumns(spec), [spec]);
  const rows = useMemo(
    () => itemRows(items.filter((i) => itemMatches(i, findText))),
    [items, findText],
  );

  return (
    <ContentBody
      direction="column"
      resizable
      storageKey="mqc.qdb.masterCode.detail"
    >
      <ContentPanel height={210} scrollY>
        <GroupHead row={row} />
      </ContentPanel>
      <ContentPanel>
        <GridPanel
          title={row ? `${row.title} 항목` : "코드 항목"}
          count={rows.length}
          titleExtra={
            <Input
              aria-label="항목 빠른 찾기"
              data-testid="masterCode-item-find"
              placeholder="코드·이름·속성으로 좁히기"
              value={findText}
              onChange={(text) => setFind({ codeId, text })}
              disabled={!row}
            />
          }
        >
          <AgDataGrid
            gridId="items"
            rowKey="code"
            columns={columns}
            data={rows}
            columnSizing={columns.length > 8 ? "fixed" : "fit"}
            personalize={false}
            loading={loading}
            emptyMessage={
              !row
                ? "왼쪽에서 코드 묶음을 고르세요."
                : items.length === 0
                  ? "적용 중인 코드 항목이 없습니다. Maru 에 항목이 등록됐는지 확인하세요."
                  : "찾는 글에 맞는 항목이 없습니다."
            }
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
});

function GroupHead({ row }: { row: GroupRow | null }) {
  return (
    <table style={DETAIL_TABLE_STYLE} data-testid="masterCode-detail">
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>코드 ID</th>
          <td style={DETAIL_VALUE_CELL} data-testid="masterCode-detail-codeId">
            {row?.codeId ?? NA}
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>이름</th>
          <td style={DETAIL_VALUE_CELL}>{row?.title ?? NA}</td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>분류</th>
          <td style={DETAIL_VALUE_CELL}>{row?.category ?? NA}</td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>적용 버전 · 항목 수</th>
          <td style={DETAIL_VALUE_CELL} data-testid="masterCode-detail-ver">
            {row
              ? `${row.ver ? `v${row.ver}` : "적용 버전 없음"} · ${row.itemCount}건`
              : NA}
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>사용 화면</th>
          <td style={DETAIL_VALUE_CELL}>{row ? usedByText(row.usedBy) : NA}</td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>설명</th>
          <td style={DETAIL_VALUE_CELL}>{row?.desc || NA}</td>
        </tr>
      </tbody>
    </table>
  );
}
