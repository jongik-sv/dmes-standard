"use client";

/**
 * 로그 분석 (anl/logViewer) — 워크스페이스 멀티탭 상태 훅.
 * 원본: analog-express-ui-plate AnlaogMainPage.js 의 useReducer 모델 이식.
 *
 * 원본 대비 의도적 수정:
 *  - 기본 module = 메타 modules[0].value (원본 'module1' 하드코딩 버그 고침).
 *  - 액션 대상을 index 대신 workspaceId 로 지정 — 요청 비행 중 탭 전환 시 오귀속 방지.
 *  - 탭 제거 시 active 결정은 "제거 후 남은 배열" 기준 (원본 stale-closure 버그 고침),
 *    마지막 탭은 제거 불가(최소 1개 유지).
 *  - 사장된 serviceLogOnly 옵션 미이식.
 * 대용량 로그 문자열(logData)은 리듀서 밖 별도 state 로 분리한다(원본 설계 유지 — 리렌더 비용).
 */

import { useCallback, useReducer, useRef, useState } from "react";
import { generateWorkspaceKey } from "./string-util";
import { timeGenerator } from "./time-util";
import type { SearchCond, ServiceItem, Workspace } from "./types";

function createDefaultCond(defaultModule: string): SearchCond {
  return {
    from: timeGenerator(1),
    to: timeGenerator(0),
    module: defaultModule,
    keyword: "",
    ignoreCase: false,
    byThread: false,
  };
}

function createWorkspace(
  workspaceId: string,
  label: number,
  defaultModule: string,
): Workspace {
  return {
    workspaceId,
    label,
    cond: createDefaultCond(defaultModule),
    lastCond: null,
    bindData: "",
    jsonData: [],
    serviceList: [],
  };
}

type WorkspacesAction =
  | { type: "COND"; workspaceId: string; patch: Partial<SearchCond> }
  | { type: "SERVICE_LIST"; workspaceId: string; serviceList: ServiceItem[] }
  | { type: "JSON"; workspaceId: string; jsonData: unknown }
  | { type: "BIND"; workspaceId: string; bindData: string }
  | { type: "NEW_WORKSPACE"; workspace: Workspace }
  | { type: "REMOVE_WORKSPACE"; workspaceId: string };

function workspacesReducer(
  state: Workspace[],
  action: WorkspacesAction,
): Workspace[] {
  switch (action.type) {
    case "COND":
      return state.map((ws) =>
        ws.workspaceId === action.workspaceId
          ? { ...ws, cond: { ...ws.cond, ...action.patch } }
          : ws,
      );
    case "SERVICE_LIST":
      // 검색 성공 시 목록과 함께 lastCond 스냅샷 저장 (드릴다운 시간창 기준 — 원본 동일).
      return state.map((ws) =>
        ws.workspaceId === action.workspaceId
          ? { ...ws, serviceList: action.serviceList, lastCond: { ...ws.cond } }
          : ws,
      );
    case "JSON":
      return state.map((ws) =>
        ws.workspaceId === action.workspaceId
          ? { ...ws, jsonData: action.jsonData }
          : ws,
      );
    case "BIND":
      return state.map((ws) =>
        ws.workspaceId === action.workspaceId
          ? { ...ws, bindData: action.bindData }
          : ws,
      );
    case "NEW_WORKSPACE":
      return [...state, action.workspace];
    case "REMOVE_WORKSPACE":
      return state.filter((ws) => ws.workspaceId !== action.workspaceId);
    default:
      return state;
  }
}

export interface UseWorkspacesResult {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  /** 현재 활성 워크스페이스 (id 미일치 시 첫 워크스페이스 fallback). */
  activeWorkspace: Workspace;
  /** workspaceId → 로그 문자열. */
  logDataMap: Record<string, string>;
  selectWorkspace: (workspaceId: string) => void;
  addWorkspace: () => void;
  removeWorkspace: (workspaceId: string) => void;
  updateCond: (workspaceId: string, patch: Partial<SearchCond>) => void;
  setServiceList: (workspaceId: string, serviceList: ServiceItem[]) => void;
  setJsonData: (workspaceId: string, jsonData: unknown) => void;
  setBindData: (workspaceId: string, bindData: string) => void;
  setLogData: (workspaceId: string, logData: string) => void;
}

export function useWorkspaces(defaultModule: string): UseWorkspacesResult {
  const [workspaces, dispatch] = useReducer(
    workspacesReducer,
    defaultModule,
    (module) => [createWorkspace(generateWorkspaceKey(), 1, module)],
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => workspaces[0].workspaceId,
  );
  const [logDataMap, setLogDataMap] = useState<Record<string, string>>(() => ({
    [workspaces[0].workspaceId]: "",
  }));
  // 다음 탭 번호 (원본 tabCount 동일 — 1번 탭이 초기 생성이므로 2 부터).
  const nextLabelRef = useRef(2);

  const activeWorkspace =
    workspaces.find((ws) => ws.workspaceId === activeWorkspaceId) ??
    workspaces[0];

  const selectWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
  }, []);

  const addWorkspace = useCallback(() => {
    const workspace = createWorkspace(
      generateWorkspaceKey(),
      nextLabelRef.current,
      defaultModule,
    );
    nextLabelRef.current += 1;
    dispatch({ type: "NEW_WORKSPACE", workspace });
    setLogDataMap((prev) => ({ ...prev, [workspace.workspaceId]: "" }));
    setActiveWorkspaceId(workspace.workspaceId);
  }, [defaultModule]);

  const removeWorkspace = useCallback(
    (workspaceId: string) => {
      // 최소 1개 유지 — 마지막 탭은 제거하지 않는다.
      if (workspaces.length <= 1) return;
      const remaining = workspaces.filter(
        (ws) => ws.workspaceId !== workspaceId,
      );
      dispatch({ type: "REMOVE_WORKSPACE", workspaceId });
      setLogDataMap((prev) => {
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });
      // 제거된 탭이 활성이었으면 남은 배열의 첫 탭으로 이동 (원본 stale-closure 버그 고침).
      if (workspaceId === activeWorkspaceId) {
        setActiveWorkspaceId(remaining[0].workspaceId);
      }
    },
    [workspaces, activeWorkspaceId],
  );

  const updateCond = useCallback(
    (workspaceId: string, patch: Partial<SearchCond>) => {
      dispatch({ type: "COND", workspaceId, patch });
    },
    [],
  );

  const setServiceList = useCallback(
    (workspaceId: string, serviceList: ServiceItem[]) => {
      dispatch({ type: "SERVICE_LIST", workspaceId, serviceList });
    },
    [],
  );

  const setJsonData = useCallback((workspaceId: string, jsonData: unknown) => {
    dispatch({ type: "JSON", workspaceId, jsonData });
  }, []);

  const setBindData = useCallback((workspaceId: string, bindData: string) => {
    dispatch({ type: "BIND", workspaceId, bindData });
  }, []);

  const setLogData = useCallback((workspaceId: string, logData: string) => {
    setLogDataMap((prev) =>
      workspaceId in prev ? { ...prev, [workspaceId]: logData } : prev,
    );
  }, []);

  return {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    logDataMap,
    selectWorkspace,
    addWorkspace,
    removeWorkspace,
    updateCond,
    setServiceList,
    setJsonData,
    setBindData,
    setLogData,
  };
}
