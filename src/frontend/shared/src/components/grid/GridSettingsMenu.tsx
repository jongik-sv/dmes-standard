"use client";

/**
 * GridPanel 머리줄 오른쪽 끝의 「그리드 설정」 아이콘 메뉴(내부 부품, 툴팁은 GridHelpButton 처럼 title) — 「칸별 필터 보기」 스위치(맨 위, 필터가 있는 그리드는 늘)·(구분선)·[컬럼 설정…]·「자동 설정 저장」 스위치·[설정 초기화…]·(구분선)·[엑셀 출력] 순서로 한 메뉴에 모은다.
 *
 * - 항목은 대상 그리드가 올려 둔 명령에 따라 보인다: 칸별 필터는 `hasFilterRow`, 개인화 항목(컬럼 설정·자동 설정 저장·초기화)은 `hasPersonalize`,
 *   [컬럼 원래대로](개인화가 꺼진 그리드)는 `hasColumnReset`, 엑셀은 `hasExcel` 일 때만.
 *   개인화 그리드: 칸별 필터 | 컬럼 설정·자동 저장·설정 초기화 | 엑셀. 개인화가 꺼진 그리드: 칸별 필터·컬럼 원래대로 | 엑셀.
 * - 「칸별 필터 보기」 는 누르면 메뉴를 닫는다 — 펼쳐진 입력 줄이 바로 보이게. 서버 페이징 GridPanel 의 filter 생략 그리드는 이름이 「필터 창 보기」 이고 검색 칸도 함께 켠다.
 * - 엑셀 항목은 서버 페이징 그리드(`excelPaged`)면 「엑셀 출력 (현재 페이지)」 로 보여 지금 쪽의 행만 나간다는 것을 알린다.
 * - 「자동 설정 저장」 은 누르면 값만 바꾸고 메뉴를 닫지 않는다(`closeMenuOnClick={false}`). 항목 전체가 누름 대상이고, 안의 스위치는 보여 주기만 한다
 *   (스위치 입력을 눌러도 항목의 onClick 이 한 번만 돈다).
 * - 항목 이름은 grid-settings-labels 의 값을 머리글 우클릭 메뉴와 같이 쓴다.
 */
import { memo } from "react";
import { ActionIcon, Menu, Switch } from "@mantine/core";
import { IconArrowBackUp, IconColumns3, IconDeviceFloppy, IconDownload, IconFilter, IconRestore, IconSettings } from "@tabler/icons-react";

import { GRID_SETTINGS_LABELS } from "./grid-settings-labels";

export interface GridSettingsMenuProps {
  /** 개인화 항목(컬럼 설정·자동 설정 저장·설정 초기화)을 보인다. */
  hasPersonalize: boolean;
  /** 엑셀 내려받기 항목을 보인다. */
  hasExcel: boolean;
  /** 「칸별 필터 보기」 항목을 보인다(filter={true} 그리드와 filter 를 생략한 GridPanel 안 그리드 — filter={false} 는 뺀다). */
  hasFilterRow?: boolean;
  /** 이 항목이 빠른 검색 칸도 함께 켜는가(서버 페이징 GridPanel 의 filter 생략 그리드) — 이름이 「필터 창 보기」 가 된다. */
  filterRowWithSearch?: boolean;
  /** [컬럼 원래대로] 항목을 보인다(개인화가 꺼진 그리드). */
  hasColumnReset?: boolean;
  /** 칸 순서·너비·숨김을 열 정의대로 되돌린다(저장 없음, 확인 없음). */
  onResetColumns?: () => void;
  /** 입력 줄 항목의 툴팁 — 걸러 보기가 찾는 범위 안내. */
  filterNotice?: string;
  /** 입력 줄 항목이 켜져 있는가. */
  filterRowOpen?: boolean;
  /** 입력 줄 항목을 켜고 끈다. */
  onToggleFilterRow?: (next: boolean) => void;
  /** 자동 설정 저장 스위치의 지금 값. */
  autoSave: boolean;
  /** 엑셀 항목을 비활성으로 둔다(내려받을 행이 없을 때). */
  excelDisabled: boolean;
  /** 서버 페이징 그리드 — 엑셀 항목에 「(현재 페이지)」 를 붙인다. */
  excelPaged?: boolean;
  onOpenSettings: () => void;
  onToggleAutoSave: (next: boolean) => void;
  onExportExcel: () => void;
  /** 초기화 요청(확인 창은 그리드가 띄운다). */
  onRequestReset: () => void;
  /** 메뉴가 열릴 때 — 열 때마다 비활성 판정을 다시 읽게 부른 쪽이 다시 그린다. */
  onOpen?: () => void;
}

function GridSettingsMenuComponent({
  hasPersonalize,
  hasExcel,
  hasFilterRow = false,
  filterRowWithSearch = false,
  hasColumnReset = false,
  onResetColumns,
  filterNotice,
  filterRowOpen = false,
  onToggleFilterRow,
  autoSave,
  excelDisabled,
  excelPaged = false,
  onOpenSettings,
  onToggleAutoSave,
  onExportExcel,
  onRequestReset,
  onOpen,
}: GridSettingsMenuProps) {
  const filterRowLabel = filterRowWithSearch ? GRID_SETTINGS_LABELS.filterRowPaged : GRID_SETTINGS_LABELS.filterRow;
  return (
    <Menu position="bottom-end" shadow="md" width={220} withinPortal onOpen={onOpen}>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size={24}
          title={GRID_SETTINGS_LABELS.menu}
          aria-label={GRID_SETTINGS_LABELS.menu}
          data-testid="grid-settings-menu"
        >
          <IconSettings size={16} aria-hidden="true" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown data-testid="grid-settings-dropdown">
        {hasFilterRow ? (
          <Menu.Item
            data-testid="grid-filter-row-item"
            title={filterNotice}
            aria-label={`${filterRowLabel} ${filterRowOpen ? "켜짐" : "꺼짐"}`}
            leftSection={<IconFilter size={14} aria-hidden="true" />}
            rightSection={
              <Switch
                size="xs"
                checked={filterRowOpen}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                data-testid="grid-filter-row-switch"
                onChange={() => {}}
                // 자동 설정 저장 스위치와 같은 이유 — 항목 버튼만 클릭을 받는다.
                styles={{ root: { display: "flex", pointerEvents: "none" } }}
              />
            }
            onClick={() => onToggleFilterRow?.(!filterRowOpen)}
          >
            {filterRowLabel}
          </Menu.Item>
        ) : null}
        {hasFilterRow && hasPersonalize ? <Menu.Divider /> : null}
        {hasColumnReset ? (
          <Menu.Item
            id="btn_grid_columns_reset"
            data-testid="grid-columns-reset-button"
            leftSection={<IconArrowBackUp size={14} aria-hidden="true" />}
            onClick={onResetColumns}
          >
            {GRID_SETTINGS_LABELS.resetColumns}
          </Menu.Item>
        ) : null}
        {hasPersonalize ? (
          <>
            <Menu.Item
              id="btn_grid_columns"
              data-testid="grid-columns-button"
              leftSection={<IconColumns3 size={14} aria-hidden="true" />}
              onClick={onOpenSettings}
            >
              {GRID_SETTINGS_LABELS.settings}
            </Menu.Item>
            <Menu.Item
              closeMenuOnClick={false}
              data-testid="grid-autosave-item"
              aria-label={`${GRID_SETTINGS_LABELS.autoSave} ${autoSave ? "켜짐" : "꺼짐"}`}
              leftSection={<IconDeviceFloppy size={14} aria-hidden="true" />}
              rightSection={
                <Switch
                  size="xs"
                  checked={autoSave}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  data-testid="grid-autosave-switch"
                  onChange={() => {}}
                  // 스위치 입력·트랙이 클릭을 따로 받으면 label 이 합성 클릭을 한 번 더 보내 항목 onClick 이 두 번 돈다. 항목 버튼만 받게 한다.
                  styles={{ root: { display: "flex", pointerEvents: "none" } }}
                />
              }
              onClick={() => onToggleAutoSave(!autoSave)}
            >
              {GRID_SETTINGS_LABELS.autoSave}
            </Menu.Item>
          </>
        ) : null}
        {hasPersonalize ? (
          <Menu.Item
            id="btn_grid_reset"
            data-testid="grid-reset-button"
            color="red"
            leftSection={<IconRestore size={14} aria-hidden="true" />}
            onClick={onRequestReset}
          >
            {GRID_SETTINGS_LABELS.reset}
          </Menu.Item>
        ) : null}
        {hasExcel && (hasPersonalize || hasColumnReset || hasFilterRow) ? <Menu.Divider /> : null}
        {hasExcel ? (
          <Menu.Item
            data-testid="grid-excel"
            disabled={excelDisabled}
            leftSection={<IconDownload size={14} aria-hidden="true" />}
            onClick={onExportExcel}
          >
            {excelPaged ? GRID_SETTINGS_LABELS.excelPaged : GRID_SETTINGS_LABELS.excel}
          </Menu.Item>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  );
}

export const GridSettingsMenu = memo(GridSettingsMenuComponent);
