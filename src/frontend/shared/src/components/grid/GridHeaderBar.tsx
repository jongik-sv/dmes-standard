"use client";

/**
 * 그리드 머리줄(내부 부품) — 그리드명·건수 배지·도움말·(업무 버튼)·빠른 검색 칸·「그리드 설정」 메뉴와 그 아래 「걸린 조건」 칩 줄.
 *
 * GridPanel 과 AgDataGrid 가 같은 부품을 쓴다 — GridPanel 안 그리드는 GridPanel 이, GridPanel 밖 그리드는 AgDataGrid 가 스스로 그린다
 * (CSS 클래스·testid 는 GridPanel 머리줄 그대로: grid-panel-header · grid-panel-title · grid-panel-count · grid-panel-settings-slot …).
 * 거른 건수·검색 칸 보임·설정 메뉴 값·칩 구독은 모두 이 부품 안에서 한다. 구독이 바뀌어도 이 부품만 다시 그려지고 부른 쪽(그리드)은 다시 그려지지 않는다.
 *
 * - `filterControls`: 걸러 보기 대상 그리드의 명령(검색 칸·거른 건수·칩). 없으면 null 이라 검색 칸·칩 줄이 없다.
 * - `menuControls`: 설정 메뉴 대상 그리드의 명령. 없거나 보일 항목이 없으면 메뉴를 그리지 않는다.
 * - 칩 줄은 머리줄 아래에 이어 붙는다(걸린 조건이 없으면 DOM 없음).
 */
import { memo, useCallback, useState, type ReactNode } from "react";

import { GridHelpButton, type GridHelpConfig } from "./GridHelpButton";
import { GridFilterChips } from "./GridFilterChips";
import { GridQuickFilter, useGridFilterCount, useGridQuickFilterVisible } from "./GridQuickFilter";
import { GridSettingsMenu } from "./GridSettingsMenu";
import type { GridPanelGridControls } from "./grid-panel-context";
import { useGridSettingsMenuProps } from "./useGridSettingsMenu";

export interface GridHeaderBarProps {
  /** 그리드명. 없으면 이름 자리를 비운다(건수 배지와 메뉴만 남는다). */
  title?: ReactNode;
  help?: GridHelpConfig;
  /** 직접 넘기는 건수. 걸러져 있는 동안은 「보이는 행 / 전체 행」 이 대신 보인다. 없으면 건수 배지도 없다. */
  count?: number;
  /** 서버 페이징 목록 — 설정 메뉴의 엑셀 항목 이름·검색 안내 글이 「현재 페이지」 로 바뀐다. */
  serverPaged?: boolean;
  titleExtra?: ReactNode;
  /** 업무 버튼 묶음(이미 그려진 노드). 검색 칸 뒤에 놓인다. */
  buttons?: ReactNode;
  /** 업무 버튼 뒤, 설정 메뉴 앞에 놓일 노드. */
  headerExtra?: ReactNode;
  filterControls: GridPanelGridControls | null;
  menuControls: GridPanelGridControls | null;
  /** 바깥에서 올리는 검색 칸 초기화 키 — GridPanel 의 행추가·행복사가 검색어를 비울 때 올린다(검색 칸을 다시 마운트해 입력을 비운다). */
  quickResetKey?: number;
}

function GridHeaderBarComponent({
  title,
  help,
  count,
  serverPaged = false,
  titleExtra,
  buttons,
  headerExtra,
  filterControls,
  menuControls,
  quickResetKey = 0,
}: GridHeaderBarProps) {
  const menuProps = useGridSettingsMenuProps(menuControls, serverPaged);
  const filterCount = useGridFilterCount(filterControls);
  // filter 생략 그리드는 기본으로 검색 칸이 있다(서버 페이징은 「필터 창 보기」 를 켠 동안만). 칸이 사라지면 건수 표시도 사라진다(그리드가 검색어를 지운다).
  const quickVisible = useGridQuickFilterVisible(filterControls);
  // 검색어 칩을 지우면 검색 칸을 다시 마운트해 입력도 비운다(칸은 자기 입력값을 들고 있다). 이 상태는 이 부품만 다시 그린다.
  const [chipResetKey, setChipResetKey] = useState(0);
  const onQuickCleared = useCallback(() => setChipResetKey((k) => k + 1), []);
  const hasActions = buttons != null || headerExtra != null || menuProps !== null || quickVisible;

  return (
    <>
      <div className="grid-panel-header" data-testid="grid-panel-header">
        <div className="grid-panel-title">
          {title ? (
            <span className="grid-panel-title-text" data-testid="grid-panel-title">
              {title}
            </span>
          ) : null}
          {help ? <GridHelpButton {...help} /> : null}
          {filterCount ? (
            <span className="grid-panel-count grid-panel-count-filtered" data-testid="grid-panel-filter-count">
              <b>{filterCount.shown}</b> / {filterCount.total}건
            </span>
          ) : count !== undefined ? (
            <span className="grid-panel-count" data-testid="grid-panel-count">
              {count}건
            </span>
          ) : null}
          {titleExtra}
        </div>
        {hasActions ? (
          <div className="grid-panel-header-actions">
            {/* 빠른 검색 칸 — 걸러 보기 대상이 있으면 기본으로 보인다(서버 페이징 filter 생략은 「필터 창 보기」 를 켰을 때만). 업무 버튼 앞. */}
            {filterControls && quickVisible ? (
              <GridQuickFilter key={`grid_quick_filter_${quickResetKey}_${chipResetKey}`} controls={filterControls} serverPaged={serverPaged} />
            ) : null}
            {buttons}
            {headerExtra ? <div className="grid-panel-header-extra">{headerExtra}</div> : null}
            {/* 그리드 설정 메뉴 — 머리줄의 맨 오른쪽 끝, 업무 버튼·headerExtra 보다 늘 뒤(예외 없음: DOM 순서가 마지막이고 CSS order 도 최대값).
                개인화가 켜졌거나 엑셀 출력이 켜진 그리드가 있을 때만. 컬럼 설정·자동 설정 저장·설정 초기화·엑셀 출력을 모은다. 권한 검사·loading 과 무관하게 늘 활성
                (그리드 모양 설정과 화면에 보이는 행 내려받기라 데이터를 바꾸지 않는다). */}
            {menuProps ? (
              <div className="grid-panel-settings-slot" data-testid="grid-panel-settings-slot">
                <GridSettingsMenu key="grid_settings_menu" {...menuProps} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <GridFilterChips controls={filterControls} onQuickCleared={onQuickCleared} />
    </>
  );
}

export const GridHeaderBar = memo(GridHeaderBarComponent);
