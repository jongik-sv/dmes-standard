"use client";

/**
 * GridPanel 밖에 놓인 AgDataGrid 의 「그리드 설정」 아이콘 — 그리드 머리글 줄 오른쪽 끝 위에 겹쳐 놓는다(내부 부품, AgDataGrid 가 그린다).
 *
 * - 메뉴는 GridPanel 머리줄과 같은 GridSettingsMenu 라서 항목·순서·이름·testid 가 같다. 값은 useGridSettingsMenuProps 가 같은 방식으로 만든다.
 * - 그리드 높이를 늘리는 막대를 만들지 않는다. 머리글 높이(28px) 안, 마지막 열 머리글의 오른쪽 여백(grid.css 의 `cm-grid-settings-on`) 위에 놓는다.
 * - 평소에는 흐리고 그리드에 마우스가 오거나 키보드 초점이 들어오면 진해진다(CSS). 항목이 하나도 없으면 AgDataGrid 가 이 부품을 그리지 않는다.
 */
import { memo } from "react";

import type { GridPanelGridControls } from "./grid-panel-context";
import { GridSettingsMenu } from "./GridSettingsMenu";
import { useGridSettingsMenuProps } from "./useGridSettingsMenu";

interface GridSettingsOverlayProps {
  controls: GridPanelGridControls;
}

function GridSettingsOverlayComponent({ controls }: GridSettingsOverlayProps) {
  const menuProps = useGridSettingsMenuProps(controls);
  if (menuProps === null) return null;
  return (
    <div className="cm-grid-settings-overlay" data-testid="grid-settings-overlay">
      <GridSettingsMenu {...menuProps} />
    </div>
  );
}

export const GridSettingsOverlay = memo(GridSettingsOverlayComponent);
