"use client";

/**
 * 로그 분석 (anl/logViewer) — 메인 컨테이너.
 * 원본: analog-express-ui-plate App.js + AnlaogMainPage.js + LogViewer.js 오케스트레이션 이식.
 *
 * 구성: 워크스페이스 탭바 / 좌측 검색 사이드바 / 본문(Monaco 로그 에디터 + 하단 문서 탭) /
 *       서비스 목록 오버레이. 원본 상단 Navbar(로고)는 포털 셸이 대체하므로 이식하지 않음.
 *
 * 원본 대비 의도적 수정:
 *  - 메타(GET api/meta) 실패 시 무한 로딩 → 재시도 버튼 있는 오류 화면.
 *  - 네트워크/조회 오류를 console 만 찍던 것 → useGfnMessage 로 화면에 표시.
 *  - 일시 검증 실패 시 undefined 반환으로 요청이 그대로 나가던 버그 → 명시적 중단.
 *  - alert 모달 → shared message-provider.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@dk-oasis/shared/form";
import { useGfnMessage } from "@dk-oasis/shared/message-provider";
import {
  buildDownloadUrl,
  fetchAnalogMeta,
  fetchLogRangeTimeTree,
  refreshRealtimeLog,
  searchLogRangeTime,
} from "./log-viewer-api";
import { addSecondsToYyyymmddhh24miss, toYyyymmddhh24miss } from "./time-util";
import { bindSql } from "./sql-bind";
import { useWorkspaces } from "./use-workspaces";
import { WorkspaceTabBar } from "./workspace-tab-bar";
import { SearchSidebar } from "./search-sidebar";
import { DocTabBar } from "./doc-tabs";
import { JsonTreeView } from "./json-tree-view";
import { ServiceListPanel } from "./service-list-panel";
import LogMonacoEditor, {
  type LogMonacoEditorHandle,
} from "./log-monaco-editor";
import SqlBinderEditor, {
  type SqlBinderEditorHandle,
} from "./sql-binder-editor";
import type {
  AnalogMeta,
  DocTabKey,
  LogSearchParams,
  SearchCond,
  SearchOptions,
} from "./types";
import "./log-viewer.css";

/** 메타 로드 게이트 — 성공 시 본 화면, 실패 시 재시도 화면 (원본 무한 로딩 고침). */
export function AnalogLogViewer() {
  const [meta, setMeta] = useState<AnalogMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    setMeta(null);
    setMetaError(null);
    try {
      setMeta(await fetchAnalogMeta());
    } catch (err) {
      setMetaError(
        err instanceof Error ? err.message : "메타 정보를 불러오지 못했습니다.",
      );
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  if (metaError) {
    return (
      <div className="anl-log-viewer anl-meta-state">
        <div className="anl-meta-error">메타 정보 로드 실패: {metaError}</div>
        <Button variant="primary" onClick={() => void loadMeta()}>
          재시도
        </Button>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="anl-log-viewer anl-meta-state">
        <Spinner label="메타 정보 로드 중..." />
      </div>
    );
  }

  return <LogViewerMain meta={meta} />;
}

function LogViewerMain({ meta }: { meta: AnalogMeta }) {
  const gfn = useGfnMessage();
  const defaultModule = meta.modules[0]?.value ?? "";
  const ws = useWorkspaces(defaultModule);
  // 동시 요청 카운터 — >0 이면 wave 로딩 표시 (원본 loadingRequestCnt 동일).
  const [requestCount, setRequestCount] = useState(0);
  const [activeDocTab, setActiveDocTab] = useState<DocTabKey>("text");
  const [serviceListOpen, setServiceListOpen] = useState(false);
  const logEditorRef = useRef<LogMonacoEditorHandle>(null);
  const binderRef = useRef<SqlBinderEditorHandle>(null);

  const activeWs = ws.activeWorkspace;
  const logValue = ws.logDataMap[activeWs.workspaceId] ?? "";

  const beginLoading = () => setRequestCount((count) => count + 1);
  const endLoading = () => setRequestCount((count) => Math.max(0, count - 1));

  /**
   * cond → API 파라미터 변환 + 일시 14자리 검증.
   * 실패 시 메시지 표시 후 null 반환 — 호출부는 명시적으로 중단한다 (원본 undefined 버그 고침).
   */
  const toParams = (
    cond: SearchCond,
    startTime?: string,
    endTime?: string,
  ): LogSearchParams | null => {
    const from = startTime || toYyyymmddhh24miss(cond.from);
    const to = endTime || toYyyymmddhh24miss(cond.to);
    if (from.length !== 14 || to.length !== 14) {
      gfn(
        "일시 입력이 잘못되었습니다. (형식: YYYY-MM-DD HH:mm:ss)",
        "",
        "",
        "warning",
      );
      return null;
    }
    return {
      from,
      to,
      keyword: cond.keyword,
      serverType: "all",
      module: cond.module,
      clientType: "app",
      ignoreCase: cond.ignoreCase,
      byThread: cond.byThread,
    };
  };

  /** 검색/JSON/다운로드 실행 — serviceTag 가 있으면 서비스 태그 드릴다운. */
  const runSearch = async (opts: SearchOptions) => {
    const workspace = ws.activeWorkspace;
    const workspaceId = workspace.workspaceId;

    if (opts.type === "download") {
      const params = toParams(workspace.cond);
      if (!params) return;
      window.open(buildDownloadUrl(params), "_blank");
      return;
    }

    let params: LogSearchParams | null;
    const isDrilldown = Boolean(opts.serviceTag);
    if (opts.serviceTag) {
      // 드릴다운 시간창: action 있으면 행 시작−10초, 없으면 lastCond.from−300초 /
      //                 runTime 있으면 행 종료+10초, 없으면 lastCond.to+300초 (원본 동일).
      const baseCond = workspace.lastCond ?? workspace.cond;
      const adjustedStart = opts.action
        ? addSecondsToYyyymmddhh24miss(
            toYyyymmddhh24miss(opts.startTime ?? ""),
            -10,
          )
        : addSecondsToYyyymmddhh24miss(toYyyymmddhh24miss(baseCond.from), -300);
      const adjustedEnd = opts.runTime
        ? addSecondsToYyyymmddhh24miss(
            toYyyymmddhh24miss(opts.endTime ?? ""),
            10,
          )
        : addSecondsToYyyymmddhh24miss(toYyyymmddhh24miss(baseCond.to), 300);
      const base = toParams(baseCond, adjustedStart, adjustedEnd);
      params = base ? { ...base, keyword: opts.serviceTag } : null;
    } else {
      params = toParams(workspace.cond);
    }
    if (!params) return;

    beginLoading();
    try {
      if (opts.type === "json") {
        const tree = await fetchLogRangeTimeTree(params);
        ws.setJsonData(workspaceId, tree);
      } else {
        const result = await searchLogRangeTime(params);
        ws.setLogData(workspaceId, result.log);
        if (!isDrilldown) {
          // 드릴다운 응답의 serviceList 는 무시하고 기존 목록 유지 (원본 동일).
          ws.setServiceList(workspaceId, result.serviceList);
        }
      }
    } catch (err) {
      gfn(
        err instanceof Error
          ? err.message
          : "로그 조회 중 오류가 발생했습니다.",
        "",
        "",
        "error",
      );
    } finally {
      endLoading();
    }
  };

  /** 실시간 로그 다시 가져오기 — 응답 텍스트를 토스트로 표시. */
  const runRefresh = async () => {
    const module = ws.activeWorkspace.cond.module;
    beginLoading();
    try {
      const text = await refreshRealtimeLog(module);
      gfn(text.trim() || "실시간 로그를 다시 가져왔습니다.", "", "", "toast");
    } catch (err) {
      gfn(
        err instanceof Error
          ? err.message
          : "실시간 로그 갱신 중 오류가 발생했습니다.",
        "",
        "",
        "error",
      );
    } finally {
      endLoading();
    }
  };

  /** 쿼리 바인더 실행 — 로그 에디터 선택 텍스트를 Binder 로 넘기고 탭 전환. */
  const runBinderFromSelection = () => {
    const selected = logEditorRef.current?.getSelectedText() ?? "";
    ws.setBindData(activeWs.workspaceId, selected);
    setActiveDocTab("binder");
  };

  /** Binder 묶기 — 에디터 현재 텍스트를 bindSql 결과로 교체 (오류는 메시지 표시 후 중단). */
  const runBind = () => {
    const raw = binderRef.current?.getValue() ?? "";
    try {
      const bound = bindSql(raw);
      binderRef.current?.setValue(bound);
      ws.setBindData(activeWs.workspaceId, bound);
    } catch (err) {
      gfn(
        err instanceof Error
          ? err.message
          : "SQL 묶기 처리 중 오류가 발생했습니다.",
        "",
        "",
        "warning",
      );
    }
  };

  const resetBind = () => {
    binderRef.current?.setValue("");
    ws.setBindData(activeWs.workspaceId, "");
  };

  /** 문서 탭 전환 — Binder 를 떠날 때 에디터 내용을 워크스페이스로 flush (원본 동일 의도). */
  const selectDocTab = (tab: DocTabKey) => {
    if (tab !== activeDocTab && activeDocTab === "binder") {
      const value = binderRef.current?.getValue();
      if (value != null) ws.setBindData(activeWs.workspaceId, value);
    }
    setActiveDocTab(tab);
  };

  return (
    <div className="anl-log-viewer">
      <WorkspaceTabBar
        workspaces={ws.workspaces}
        activeWorkspaceId={ws.activeWorkspaceId}
        loading={requestCount > 0}
        stageTitle={meta.stageTitle}
        onSelect={ws.selectWorkspace}
        onAdd={ws.addWorkspace}
        onRemove={ws.removeWorkspace}
      />
      <div className="anl-body">
        <SearchSidebar
          modules={meta.modules}
          cond={activeWs.cond}
          serviceListCount={activeWs.serviceList.length}
          serviceListOpen={serviceListOpen}
          onCondChange={(patch) => ws.updateCond(activeWs.workspaceId, patch)}
          onSearch={() => {
            void runSearch({ type: "search" });
            setActiveDocTab("text");
          }}
          onDownload={() => void runSearch({ type: "download" })}
          onRefresh={() => void runRefresh()}
          onRunBinder={runBinderFromSelection}
          onJsonSearch={() => {
            void runSearch({ type: "json" });
            setActiveDocTab("json");
          }}
          onToggleServiceList={() => setServiceListOpen((prev) => !prev)}
        />
        <div className="anl-content">
          <div className="anl-doc-panes">
            <div
              className={`anl-doc-pane ${activeDocTab === "text" ? "" : "anl-pane-hidden"}`.trim()}
            >
              <LogMonacoEditor ref={logEditorRef} value={logValue} />
            </div>
            <div
              className={`anl-doc-pane ${activeDocTab === "json" ? "" : "anl-pane-hidden"}`.trim()}
            >
              <JsonTreeView data={activeWs.jsonData} />
            </div>
            <div
              className={`anl-doc-pane anl-binder-pane ${
                activeDocTab === "binder" ? "" : "anl-pane-hidden"
              }`.trim()}
            >
              <div className="anl-binder-toolbar">
                <Button size="sm" onClick={runBind}>
                  묶기
                </Button>
                <Button size="sm" onClick={resetBind}>
                  초기화
                </Button>
              </div>
              <SqlBinderEditor
                ref={binderRef}
                value={activeWs.bindData}
                onFlush={(value) => ws.setBindData(activeWs.workspaceId, value)}
              />
            </div>
          </div>
          <DocTabBar active={activeDocTab} onSelect={selectDocTab} />
          {serviceListOpen && (
            <ServiceListPanel
              serviceList={activeWs.serviceList}
              onLogClick={(serviceTag, startTime, endTime, action, runTime) => {
                void runSearch({
                  type: "search",
                  serviceTag,
                  startTime,
                  endTime,
                  action,
                  runTime,
                });
                setActiveDocTab("text");
              }}
              onJsonClick={(
                serviceTag,
                startTime,
                endTime,
                action,
                runTime,
              ) => {
                void runSearch({
                  type: "json",
                  serviceTag,
                  startTime,
                  endTime,
                  action,
                  runTime,
                });
                setActiveDocTab("json");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
