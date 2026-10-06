"use client";

/**
 * GridPanel 머리줄 오른쪽 끝의 「그리드 설정」 아이콘 메뉴(내부 부품, 툴팁은 GridHelpButton 처럼 title) — [컬럼 설정…]·「자동 설정 저장」 스위치·[엑셀 내려받기]·[설정 초기화…] 를 한 메뉴로 모은다.
 *
 * - 항목은 대상 그리드가 올려 둔 명령에 따라 보인다: 개인화 항목(컬럼 설정·자동 설정 저장·초기화)은 `hasPersonalize`, 엑셀은 `hasExcel` 일 때만.
 * - 「자동 설정 저장」 은 누르면 값만 바꾸고 메뉴를 닫지 않는다(`closeMenuOnClick={false}`). 항목 전체가 누름 대상이고, 안의 스위치는 보여 주기만 한다
 *   (스위치 입력을 눌러도 항목의 onClick 이 한 번만 돈다).
 * - 항목 이름은 grid-settings-labels 의 값을 머리글 우클릭 메뉴와 같이 쓴다.
 */
import { memo } from "react";
import { ActionIcon, Menu, Switch } from "@mantine/core";
import { IconColumns3, IconDeviceFloppy, IconDownload, IconRestore, IconSettings } from "@tabler/icons-react";

import { GRID_SETTINGS_LABELS } from "./grid-settings-labels";

export interface GridSettingsMenuProps {
  /** 개인화 항목(컬럼 설정·자동 설정 저장·설정 초기화)을 보인다. */
  hasPersonalize: boolean;
  /** 엑셀 내려받기 항목을 보인다. */
  hasExcel: boolean;
  /** 자동 설정 저장 스위치의 지금 값. */
  autoSave: boolean;
  /** 엑셀 항목을 비활성으로 둔다(내려받을 행이 없을 때). */
  excelDisabled: boolean;
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
  autoSave,
  excelDisabled,
  onOpenSettings,
  onToggleAutoSave,
  onExportExcel,
  onRequestReset,
  onOpen,
}: GridSettingsMenuProps) {
  return (
    <Menu position="bottom-end" shadow="md" width={210} withinPortal onOpen={onOpen}>
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
                  styles={{ root: { display: "flex" } }}
                />
              }
              onClick={() => onToggleAutoSave(!autoSave)}
            >
              {GRID_SETTINGS_LABELS.autoSave}
            </Menu.Item>
          </>
        ) : null}
        {hasPersonalize && hasExcel ? <Menu.Divider /> : null}
        {hasExcel ? (
          <Menu.Item
            data-testid="grid-excel"
            disabled={excelDisabled}
            leftSection={<IconDownload size={14} aria-hidden="true" />}
            onClick={onExportExcel}
          >
            {GRID_SETTINGS_LABELS.excel}
          </Menu.Item>
        ) : null}
        {hasPersonalize ? <Menu.Divider /> : null}
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
      </Menu.Dropdown>
    </Menu>
  );
}

export const GridSettingsMenu = memo(GridSettingsMenuComponent);
