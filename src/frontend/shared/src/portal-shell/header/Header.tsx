"use client";

import type { ReactNode } from "react";
import { Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconLogout, IconUser } from "@tabler/icons-react";
import "./Header.css";

export interface HeaderProps {
  appName: string;
  userName: string;
  loginId: string;
  onLogout: () => void;
  onGoHome?: () => void;
  /** 사용자 메뉴 앞에 그릴 도구 자리(예: 위젯 도크 「도구」 버튼). 없으면 아무것도 그리지 않는다. */
  toolsSlot?: ReactNode;
}

export function Header({ appName, userName, loginId, onLogout, onGoHome, toolsSlot }: HeaderProps) {
  return (
    <Group className="portal-header" h={44} px="md" justify="space-between" wrap="nowrap">
      <Group className="portal-header__left" gap="xs" wrap="nowrap">
        <img
          className="portal-header__logo"
          src="/images/dmes_logo_w.png"
          alt={appName}
          onClick={onGoHome}
          style={{ cursor: onGoHome ? "pointer" : undefined }}
        />
      </Group>

      <Group className="portal-header__right" gap={4} wrap="nowrap">
        {toolsSlot}
        <Menu
          shadow="md"
          width={240}
          position="bottom-end"
          withinPortal
          transitionProps={{ duration: 0 }}
        >
          <Menu.Target>
            <UnstyledButton className="portal-header__user-button" aria-label="개인 정보">
              <Group gap={6} wrap="nowrap">
                <IconUser size={16} stroke={2} />
                <Text className="portal-header__user-name" size="sm" fw={500} c="inherit">
                  {userName} 님
                </Text>
                <IconChevronDown size={14} stroke={2} />
              </Group>
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Label>개인 정보</Menu.Label>
            <Menu.Item component="div" className="portal-header__popup-field" disabled>
              사용자명 · {userName}
            </Menu.Item>
            <Menu.Item component="div" className="portal-header__popup-field" disabled>
              로그인 ID · {loginId}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item leftSection={<IconLogout size={14} stroke={2} />} onClick={onLogout}>
              로그아웃
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
