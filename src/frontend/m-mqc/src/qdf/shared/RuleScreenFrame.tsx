"use client";

/**
 * 생산가부관리(qdf) 화면 3종의 공통 틀 — 상단 [조회]·[Maru에서 편집], 조회 조건 「기준일」, 탭 막대.
 * 룰 표준 틀(RuleStandardScreen)은 탭 4개(룰 목록·간편판정·변경 이력·코드 범례)가 고정이라, 탭을 화면이 정하는 qdf 화면은 이 틀을 쓴다.
 * 조회는 SearchArea autoSearch 가 진입 때 한 번 부른다(마운트 effect 를 쓰지 않는다). 편집은 Maru 룰 편집 화면으로 넘긴다.
 */
import type { ReactNode } from "react";

import { PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { screenMeta } from "@/common/screens";
import { evalTsOf, openRuleEdit } from "@/common/rule";

export interface RuleScreenFrameProps {
  screenId: string;
  /** [Maru에서 편집] 이 열 룰. 비면 단추를 끈다. */
  editRuleId: string;
  /** 편집 화면에 넘길 버전(지금 보고 있는 버전). */
  editVer: string | null;
  loading: boolean;
  /** 기준일(YYYY-MM-DD, 비면 지금). */
  evalDate: string;
  onEvalDateChange: (date: string) => void;
  /** 조회 — 평가 시각(기준일 23:59:59, 비면 undefined = 지금). */
  onSearch: (evalTs: string | undefined) => void;
  tabs: TabItem[];
  tab: string;
  onTabChange: (key: string) => void;
  children: ReactNode;
}

export function RuleScreenFrame({
  screenId,
  editRuleId,
  editVer,
  loading,
  evalDate,
  onEvalDateChange,
  onSearch,
  tabs,
  tab,
  onTabChange,
  children,
}: RuleScreenFrameProps) {
  const meta = screenMeta(screenId);
  const search = () => onSearch(evalTsOf(evalDate));
  return (
    <PageLayout
      title={meta.title}
      breadcrumb={meta.breadcrumb}
      screenId={screenId}
      objId={screenId}
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: search,
          type: "primary",
          disabled: loading,
          action: "search",
        },
        // 이동만 하므로 조회 권한으로 건다. 편집 권한은 Maru 화면이 검사한다.
        {
          id: "btn_open_maru",
          label: "Maru에서 편집",
          onClick: () => openRuleEdit(editRuleId, editVer),
          disabled: !editRuleId,
          action: "search",
          emitSearch: false,
        },
      ]}
    >
      <SearchArea onSearch={search} autoSearch>
        <SearchField
          label="기준일"
          type="date"
          defaultKey="evalDate"
          value={evalDate}
          onChange={onEvalDateChange}
          placeholder="비우면 현재"
        />
      </SearchArea>
      <Tabs items={tabs} activeKey={tab} onChange={onTabChange} />
      {children}
    </PageLayout>
  );
}
