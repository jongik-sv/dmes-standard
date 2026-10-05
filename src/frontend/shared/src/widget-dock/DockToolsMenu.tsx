"use client";

/**
 * 포털 머리의 「도구」 버튼 + 메뉴 — floatable·사용 중지 아님 위젯을 제목순으로 보이고, 고르면 떠 있는 창으로 띄운다.
 * 버튼에는 열린 창 수, 항목에는 그 위젯의 열린 창 수를 보인다. 창 수 한도면 새로 여는 항목을 막는다
 * (한 번만 놓는 위젯이 이미 열려 있으면 그 창을 앞으로 가져오므로 막지 않는다).
 */
import type { Ref } from "react";
import { Menu, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconTool } from "@tabler/icons-react";

import type { WidgetRegistryEntry } from "../widget/types";
import { DOCK_MAX_WINDOWS } from "./dock-model";
import { WidgetDockStyle } from "./styles";
import type { DockRegistryStatus, DockWindow } from "./types";

export interface DockToolsMenuProps {
  /** 띄울 수 있는 위젯(제목순) — listDockableEntries 결과. */
  entries: WidgetRegistryEntry[];
  /** 지금 열린 창(그릴 수 있는 것). */
  windows: DockWindow[];
  /** 저장값을 불러왔는지. 그 전에는 항목을 막는다. */
  loaded: boolean;
  registryStatus: DockRegistryStatus;
  onOpen: (widgetId: string) => void;
  maxWindows?: number;
  testId?: string;
  /** 「도구」 버튼 요소 — 호스트가 창을 닫은 뒤 키보드 포커스를 이 버튼으로 돌릴 때 쓴다. */
  triggerRef?: Ref<HTMLButtonElement>;
}

export function DockToolsMenu({
  entries,
  windows,
  loaded,
  registryStatus,
  onOpen,
  maxWindows = DOCK_MAX_WINDOWS,
  testId = "widget-dock-tools",
  triggerRef,
}: DockToolsMenuProps) {
  const openCount = windows.length;
  const atLimit = openCount >= maxWindows;
  const countOf = (widgetId: string) =>
    windows.reduce((n, w) => (w.widgetId === widgetId ? n + 1 : n), 0);
  const waiting = !loaded || (registryStatus === "loading" && entries.length === 0);

  return (
    <>
      <WidgetDockStyle />
      <Menu
        shadow="md"
        width={240}
        position="bottom-end"
        withinPortal
        transitionProps={{ duration: 0 }}
      >
        <Menu.Target>
          <UnstyledButton
            ref={triggerRef}
            className="cm-widget-dock-tools"
            data-testid={testId}
            aria-label={openCount > 0 ? `도구 (열린 창 ${openCount}개)` : "도구"}
          >
            <IconTool size={16} stroke={2} />
            <span>도구</span>
            {openCount > 0 && <span className="cm-widget-dock-tools__count">{openCount}</span>}
            <IconChevronDown size={14} stroke={2} />
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown data-testid={`${testId}-menu`}>
          <Menu.Label>업무 화면 위에 띄우기</Menu.Label>
          {waiting ? (
            <Menu.Item disabled>불러오는 중…</Menu.Item>
          ) : entries.length === 0 ? (
            <Menu.Item disabled>
              {registryStatus === "error"
                ? "도구 목록을 불러오지 못했습니다"
                : "띄울 수 있는 도구가 없습니다"}
            </Menu.Item>
          ) : (
            entries.map((entry) => {
              const count = countOf(entry.meta.id);
              const focusOnly = entry.meta.multiple === false && count > 0;
              return (
                <Menu.Item
                  key={entry.meta.id}
                  data-widget-id={entry.meta.id}
                  disabled={atLimit && !focusOnly}
                  onClick={() => onOpen(entry.meta.id)}
                  rightSection={
                    count > 0 ? (
                      <span className="cm-widget-dock-menu__count">{count}</span>
                    ) : undefined
                  }
                >
                  {entry.meta.title}
                </Menu.Item>
              );
            })
          )}
          {atLimit && (
            <div className="cm-widget-dock-menu__note">
              창은 {maxWindows}개까지 띄울 수 있습니다.
            </div>
          )}
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
