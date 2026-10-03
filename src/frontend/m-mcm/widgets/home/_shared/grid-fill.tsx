"use client";

/**
 * 홈 기본 표 위젯(작업 지시·출하) 공용 틀 — 표가 위젯 본문의 남은 높이를 채우고, 표 아래 줄(GridExcelFoot)은 바닥에 고정한다.
 * 쿼리 표(widget-types/_query/parts.tsx 의 .wq-fill)와 같은 세로 flex 구조다. 표는 `AgDataGrid height="100%"` 로 둔다.
 * 스타일은 React 19 `<style href precedence>` 로 이 틀이 직접 넣는다 — 홈 페이지 말고 다른 보드에서 위젯을 띄워도 레이아웃이 유지된다
 * (Local-Rules §17, 같은 href 는 한 번만 실린다). 색·간격은 쓰지 않고 배치 규칙만 둔다.
 */
import type { ReactNode } from "react";

export const GRID_FILL_STYLE_HREF = "mcm-home-grid-fill";

export const GRID_FILL_CSS = `
.mcm-home-gridfill { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.mcm-home-gridfill__grow { flex: 1 1 0; min-height: 0; }
`;

export interface HomeGridFillProps {
  /** 표 — 남은 높이를 채운다(`AgDataGrid height="100%"`). */
  children: ReactNode;
  /** 표 아래 줄(GridExcelFoot) — 바닥에 고정된다. */
  foot: ReactNode;
}

export function HomeGridFill({ children, foot }: HomeGridFillProps) {
  return (
    <>
      <style href={GRID_FILL_STYLE_HREF} precedence="default">
        {GRID_FILL_CSS}
      </style>
      <div className="mcm-home-gridfill" data-testid="home-grid-fill">
        <div className="mcm-home-gridfill__grow" data-testid="home-grid-fill-grow">
          {children}
        </div>
        {foot}
      </div>
    </>
  );
}
