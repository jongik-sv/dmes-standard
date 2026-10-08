"use client";

/**
 * 로그 분석 (anl/logViewer) — 워크스페이스 멀티탭 바.
 * 원본: analog-express-ui-plate AnlaogMainPage.js 의 ResponsiveNav(removable 탭) + Navbar 이식.
 * 원본 상단 Navbar 는 포털 셸이 대체하므로, stageTitle·로딩 wave·New Workspace 버튼을
 * 탭바 줄 우측에 배치한다.
 */

import { useSyncExternalStore } from "react";
import { Button } from "@dk-oasis/shared/form";
import type { RequestCounter } from "./request-counter";
import type { Workspace } from "./types";

interface WorkspaceTabBarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  /** 동시 요청 카운터 — 진행 중 요청이 있으면 wave 애니메이션 표시(탭바만 구독한다). */
  requests: RequestCounter;
  stageTitle: string;
  onSelect: (workspaceId: string) => void;
  onAdd: () => void;
  onRemove: (workspaceId: string) => void;
}

/** 원본 wave 로딩 애니메이션 (10 막대). */
function LoadingWave() {
  return (
    <div className="anl-wave-group" aria-label="로딩 중">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="anl-wave" />
      ))}
    </div>
  );
}

export function WorkspaceTabBar({
  workspaces,
  activeWorkspaceId,
  requests,
  stageTitle,
  onSelect,
  onAdd,
  onRemove,
}: WorkspaceTabBarProps) {
  const loading = useSyncExternalStore(
    requests.subscribe,
    requests.isLoading,
    () => false,
  );
  const removable = workspaces.length > 1;

  return (
    <div className="anl-tab-bar">
      <div className="anl-tab-list" role="tablist" aria-label="워크스페이스 탭">
        {workspaces.map((ws) => {
          const active = ws.workspaceId === activeWorkspaceId;
          return (
            <div
              key={ws.workspaceId}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              className={`anl-tab ${active ? "anl-tab-active" : ""}`.trim()}
              onClick={() => onSelect(ws.workspaceId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  onSelect(ws.workspaceId);
              }}
            >
              <span className="anl-tab-label">{ws.label}</span>
              {removable && (
                <button
                  type="button"
                  className="anl-tab-close"
                  aria-label={`워크스페이스 ${ws.label} 닫기`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(ws.workspaceId);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        <Button size="sm" onClick={onAdd} ariaLabel="새 워크스페이스">
          + New Workspace
        </Button>
      </div>
      <div className="anl-tab-bar-right">
        {loading && <LoadingWave />}
        {stageTitle && <span className="anl-stage-title">{stageTitle}</span>}
      </div>
    </div>
  );
}
