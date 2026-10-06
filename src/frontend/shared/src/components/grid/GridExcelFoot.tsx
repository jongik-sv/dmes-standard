"use client";

/**
 * 표 아래 줄 — 왼쪽 안내 글(행 수 등)과 오른쪽 [엑셀] 단추.
 * - 높이를 스스로 키우지 않고(`flex: none`) 윗 테두리만 둔다. 세로 flex 안에서 표(`AgDataGrid height="100%"`)가
 *   남은 높이를 채우게 하면 이 줄이 바닥에 고정된다.
 * - 단추는 누르면 `onExcel` 만 부른다. GridPanel 의 「그리드 설정」 메뉴가 엑셀을 맡는 그리드는 `hideButton` 으로 단추를 빼고 안내 글만 남긴다. 파일 만들기(exportToExcel)·이름·컬럼은 화면이 정한다.
 * - 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3).
 */
import { IconDownload } from "@tabler/icons-react";

import { Button } from "../form/Button";

export interface GridExcelFootProps {
  /** 왼쪽 안내 글 — 「3행」「N건」「상위 500행만 표시합니다」 등. 길면 말줄임. */
  note: string;
  /** [엑셀] 을 눌렀을 때. */
  onExcel: () => void;
  /** 내려받을 행이 없을 때 단추를 비활성으로 둔다. */
  disabled?: boolean;
  /** [엑셀] 단추의 data-testid. 기본 `grid-excel`. */
  testId?: string;
  /** 단추를 그리지 않고 안내 글만 둔다 — 설정 메뉴가 엑셀 내려받기를 대신할 때. */
  hideButton?: boolean;
}

const STYLE_HREF = "cm-grid-foot";

export const GRID_FOOT_CSS = `
.cm-grid-foot { flex: none; display: flex; align-items: center; gap: var(--spacing-sm); padding: 2px 6px 2px 8px; border-top: 1px solid var(--color-border-light); font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-grid-foot__note { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/** 아래 줄 스타일을 한 번만 넣는다(React 19 가 같은 href 의 style 을 하나로 합친다). */
function GridExcelFootStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {GRID_FOOT_CSS}
    </style>
  );
}

export function GridExcelFoot({ note, onExcel, disabled, testId = "grid-excel", hideButton = false }: GridExcelFootProps) {
  return (
    <>
      <GridExcelFootStyle />
      <div className="cm-grid-foot" data-testid="grid-foot">
        <span className="cm-grid-foot__note" data-testid="grid-foot-note">
          {note}
        </span>
        {hideButton ? null : (
          <Button
            size="mini"
            onClick={onExcel}
            disabled={disabled}
            title="보이는 행을 엑셀로 내려받기"
            data-testid={testId}
          >
            <IconDownload size={12} aria-hidden="true" style={{ marginRight: 2 }} />
            엑셀
          </Button>
        )}
      </div>
    </>
  );
}
