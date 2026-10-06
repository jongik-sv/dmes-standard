"use client";

/**
 * 그리드 머리글 우클릭 메뉴(내부 부품) — 마우스 위치에 [컬럼 설정]·[기본값 복원] 을 띄운다. AgDataGrid 가 컬럼 개인화가 켜진 그리드에서만 쓴다.
 *
 * ag-grid community 33 에는 컨텍스트 메뉴가 없어 AgDataGrid 가 `contextmenu` 이벤트를 받아 위치를 넘긴다. Mantine `Menu.ContextMenu` 는 감싼
 * 요소의 모든 우클릭을 가로채고(대상 거름 없음) 글자 선택까지 끄므로 쓰지 않고, 제어형 `Menu` 의 `Menu.Target` 을 마우스 위치에 둔 크기 0 의
 * 고정 위치 요소로 한다. 그 요소는 body 로 포털해 조상의 transform 에 좌표가 어긋나지 않게 한다. Esc·바깥 클릭 닫기는 Menu 기본 동작이다.
 */
import { createPortal } from "react-dom";
import type { HTMLAttributes, Ref } from "react";
import { Menu } from "@mantine/core";

export interface GridHeaderContextMenuProps {
  /** 마우스 위치(viewport 좌표 — `MouseEvent.clientX/Y`). */
  x: number;
  y: number;
  /** 우클릭마다 바뀌는 번호 — 메뉴가 열린 채 다시 우클릭하면 새 위치에 다시 띄운다. */
  nonce: number;
  onOpenSettings: () => void;
  onReset: () => void;
  /** 닫힘(Esc·바깥 클릭·항목 선택). */
  onClose: () => void;
}

/** 마우스 위치의 크기 0 고정 요소. Menu.Target 이 ref 를 달아 위치 기준으로 쓴다. */
function CursorAnchor({
  x,
  y,
  ref,
  ...rest
}: { x: number; y: number; ref?: Ref<HTMLSpanElement> } & HTMLAttributes<HTMLSpanElement>) {
  return createPortal(
    <span
      ref={ref}
      {...rest}
      aria-hidden
      style={{ position: "fixed", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }}
    />,
    document.body,
  );
}

export function GridHeaderContextMenu({ x, y, nonce, onOpenSettings, onReset, onClose }: GridHeaderContextMenuProps) {
  return (
    <Menu
      key={nonce}
      opened
      onChange={(opened) => {
        if (!opened) onClose();
      }}
      position="bottom-start"
      shadow="md"
      width={160}
    >
      <Menu.Target>
        <CursorAnchor x={x} y={y} />
      </Menu.Target>
      <Menu.Dropdown data-testid="grid-header-menu">
        <Menu.Item
          data-testid="grid-header-menu-settings"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          컬럼 설정
        </Menu.Item>
        <Menu.Item
          data-testid="grid-header-menu-reset"
          onClick={() => {
            onClose();
            onReset();
          }}
        >
          기본값 복원
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
