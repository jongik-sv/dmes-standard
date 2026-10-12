"use client";

/**
 * 로그 분석 (anl/logViewer) — Tree 탭.
 * JSON 탭과 같은 GET log/range/time/tree 응답을 서비스 실행 트리로 보여 준다.
 * 위쪽 요약 줄 / 왼쪽 실행 트리(도구 막대·가상 스크롤) / 오른쪽 속성 패널 / 쿼리 뷰어(떠 있는 창).
 * 탭이 숨겨져도 마운트를 유지하므로(doc-tabs.tsx) 쿼리 뷰어 창은 active 일 때만 연다.
 */

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, copyText } from "@dk-oasis/shared/form";
import { FloatingPanel } from "@dk-oasis/shared/floating-panel";
import {
  allExpandable,
  bindParams,
  defaultExpanded,
  findNode,
  firstSelection,
  flattenRows,
  formatRunTime,
  formatTimestamp,
  heatLevel,
  MSG_GROUP,
  propsOf,
  toTreeRequests,
  type TreeNode,
  type TreeProp,
  type TreeRow,
} from "./tree-model";

const ROW_HEIGHT = 26;
const OVERSCAN = 8;
const VIEWER_STORAGE_KEY = "analog-log-viewer:tree-query-viewer";
const VIEWER_DEFAULT_RECT = { x: 160, y: 200, width: 480, height: 380 };

interface TreeTabProps {
  data: unknown;
  /** 이 탭이 보이는 중인지 — 떠 있는 쿼리 뷰어 창을 이때만 연다. */
  active: boolean;
  /** 쿼리 뷰어 「Binder 탭으로 보내기」 — SQL 을 Binder 에 채우고 탭을 전환하는 것은 상위가 한다. */
  onSendToBinder: (sql: string) => void;
}

/** 배지 클래스 — 모르는 종류(원문 objectType)는 기본 모양. */
function badgeClass(kind: string): string {
  return `anl-tree-badge anl-tree-badge-${/^[A-Z]{3}$/.test(kind) ? kind : "other"}`;
}

function RunTimeCell({ runTime, className }: { runTime: number | undefined; className?: string }) {
  if (runTime === undefined) return <span className={className} />;
  return <span className={`${className ?? ""} anl-tree-heat-${heatLevel(runTime)}`.trim()}>{formatRunTime(runTime)}</span>;
}

interface TreeRowViewProps {
  row: TreeRow;
  selected: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

const TreeRowView = memo(function TreeRowView({ row, selected, onToggle, onSelect }: TreeRowViewProps) {
  const { node, depth, open, hasKids, forced } = row;
  const isGroup = node.kind === MSG_GROUP;
  const dim = isGroup || node.kind === "MSG" || node.kind === "BND";
  const cls = ["anl-tree-label", node.hasError && node.kind !== "REQ" ? "anl-tree-label-error" : "", dim ? "anl-tree-label-dim" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={`anl-tree-row ${selected ? "anl-tree-row-selected" : ""}`.trim()}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasKids ? open : undefined}
    >
      <div className="anl-tree-cell" style={{ paddingLeft: depth * 20 + 4 }}>
        {hasKids ? (
          <button
            type="button"
            className="anl-tree-toggle"
            aria-label={`${open ? "접기" : "펼치기"}: ${node.label}`}
            disabled={forced}
            onClick={() => onToggle(node.id)}
          >
            {open ? "−" : "+"}
          </button>
        ) : (
          <span className="anl-tree-toggle-gap" aria-hidden="true" />
        )}
        <span className={badgeClass(isGroup ? "MSG" : node.kind)}>{isGroup ? "MSG" : node.kind}</span>
        {isGroup ? <span className="anl-tree-group-count">×{node.children.length}</span> : null}
        <button type="button" className={cls} title={node.label} onClick={() => onSelect(node.id)}>
          {node.label}
        </button>
      </div>
      <RunTimeCell runTime={node.runTime} className="anl-tree-time" />
    </div>
  );
});

function PropRow({ prop }: { prop: TreeProp }) {
  return (
    <div className="anl-tree-prop">
      <span className="anl-tree-prop-key">{prop.key}</span>
      <span className={prop.mono ? "anl-tree-mono" : undefined}>{prop.value}</span>
    </div>
  );
}

function TimeProps({ node }: { node: TreeNode }) {
  if (node.startMs === undefined) return null;
  return (
    <>
      <PropRow prop={{ key: "StartTime", value: formatTimestamp(node.startMs), mono: true }} />
      {node.runTime !== undefined ? (
        <>
          <PropRow prop={{ key: "EndTime", value: formatTimestamp(node.startMs + node.runTime), mono: true }} />
          <div className="anl-tree-prop">
            <span className="anl-tree-prop-key">RunTime</span>
            <RunTimeCell runTime={node.runTime} className="anl-tree-mono anl-tree-time-chip" />
          </div>
        </>
      ) : null}
    </>
  );
}

function TreeTabComponent({ data, active, onSendToBinder }: TreeTabProps) {
  const requests = useMemo(() => toTreeRequests(data), [data]);
  const [requestIdx, setRequestIdx] = useState(0);
  const request = requests[Math.min(requestIdx, requests.length - 1)];
  const root = request?.root;

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [errOnly, setErrOnly] = useState(false);
  const [bizOnly, setBizOnly] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerBound, setViewerBound] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => setRequestIdx(0), [data]);
  // 새 조회 결과(또는 다른 Request)로 바뀌면 펼침·선택을 처음 상태로 되돌린다.
  useEffect(() => {
    setExpanded(defaultExpanded(root));
    setSelectedId(firstSelection(root)?.id ?? null);
    setViewerOpen(false);
    setErrOnly(false);
    setQuery("");
  }, [root]);

  const rows = useMemo(
    () => flattenRows(root, expanded, { query: deferredQuery, errOnly, bizOnly }),
    [root, expanded, deferredQuery, errOnly, bizOnly],
  );

  // 가상 스크롤 — 보이는 구간 행만 그린다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(520);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  // 행 구성이 바뀌거나(검색·필터·새 조회) 탭이 다시 보이면 스크롤 위치를 실제 값에 맞춘다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [root, deferredQuery, errOnly, bizOnly]);
  useEffect(() => {
    if (active) setScrollTop(scrollRef.current?.scrollTop ?? 0);
  }, [active]);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop), []);

  const start = Math.min(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN), Math.max(0, rows.length - 1));
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const select = useCallback((id: string) => setSelectedId(id), []);

  const selected = selectedId ? findNode(root, selectedId) : undefined;
  const isQuery = selected?.kind === "SQL";
  const params = selected?.params ?? [];
  const viewerText = isQuery
    ? viewerBound
      ? bindParams(selected.sql ?? "", params)
      : (selected.sql ?? "")
    : "";
  const selectedText = selected?.text;
  const isGroupSel = selected?.kind === MSG_GROUP;
  const groupMsgs = isGroupSel ? (selected?.children ?? []) : [];

  if (!request || !root) {
    return <div className="anl-tree-empty">Tree 로 볼 데이터가 없습니다. 「JSON」 조회나 서비스 목록의 「트리」를 눌러 주세요.</div>;
  }

  return (
    <div className="anl-tree-pane">
      <div className="anl-tree-summary">
        <span className="anl-tree-summary-name">{request.name}</span>
        {request.serviceTag ? (
          <span className="anl-tree-muted">
            태그 {request.serviceTag}
            {request.thread ? ` · ${request.thread}` : ""}
          </span>
        ) : null}
        <span className="anl-tree-muted anl-tree-mono">
          {request.start}
          {request.end ? ` ~ ${request.end}` : ""}
        </span>
        {request.runTime !== undefined ? (
          <span className={`anl-tree-chip anl-tree-heat-${heatLevel(request.runTime)}`}>{formatRunTime(request.runTime)}</span>
        ) : null}
        <span className="anl-tree-muted">
          SQL {request.sqlCount} · MSG {request.msgCount}
        </span>
        {request.errorCount > 0 ? <span className="anl-tree-chip anl-tree-chip-error">오류 {request.errorCount}</span> : null}
        {requests.length > 1 ? (
          <select
            className="anl-tree-request-select"
            aria-label="Request 선택"
            value={requestIdx}
            onChange={(e) => setRequestIdx(Number(e.target.value))}
          >
            {requests.map((r, i) => (
              <option key={r.root.id} value={i}>
                {`${i + 1}/${requests.length} ${r.name} ${r.serviceTag}`.trim()}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="anl-tree-split">
        <section className="anl-tree-left" aria-label="실행 트리">
          <div className="anl-tree-toolbar">
            <Input
              type="search"
              className="anl-tree-search"
              value={query}
              onChange={setQuery}
              placeholder="트리 검색 (이름 · SQL · 메시지)"
              aria-label="트리 검색"
            />
            <Button size="sm" onClick={() => setExpanded(allExpandable(root))}>
              모두 펼치기
            </Button>
            <Button size="sm" onClick={() => setExpanded(new Set([root.id]))}>
              모두 접기
            </Button>
            <Button size="sm" variant={bizOnly ? "primary" : "default"} aria-pressed={bizOnly} onClick={() => setBizOnly((v) => !v)}>
              SQL·업무 노드만
            </Button>
            {request.errorCount > 0 ? (
              <Button size="sm" variant={errOnly ? "danger" : "default"} aria-pressed={errOnly} onClick={() => setErrOnly((v) => !v)}>
                오류 경로만
              </Button>
            ) : null}
          </div>
          <div className="anl-tree-head">
            <span>서비스</span>
            <span className="anl-tree-head-right">수행시간</span>
          </div>
          <div ref={scrollRef} className="anl-tree-scroll" role="tree" aria-label="서비스 실행 트리" onScroll={onScroll}>
            <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
              <div style={{ position: "absolute", top: start * ROW_HEIGHT, left: 0, right: 0 }}>
                {rows.slice(start, end).map((row) => (
                  <TreeRowView
                    key={row.node.id}
                    row={row}
                    selected={row.node.id === selectedId}
                    onToggle={toggle}
                    onSelect={select}
                  />
                ))}
              </div>
              {rows.length === 0 ? <div className="anl-tree-empty-inline">일치하는 노드가 없습니다.</div> : null}
            </div>
          </div>
        </section>
        <section className="anl-tree-right" aria-label="속성">
          <div className="anl-tree-right-head">
            <span className="anl-tree-right-title">속성</span>
            {selected ? (
              <span className={badgeClass(isGroupSel ? "MSG" : selected.kind)}>{isGroupSel ? "MSG" : selected.kind}</span>
            ) : null}
          </div>
          <div className="anl-tree-prop anl-tree-prop-header">
            <span>속성</span>
            <span>값</span>
          </div>
          <div className="anl-tree-props">
            {selected ? (
              <>
                {propsOf(selected).map((p) => (
                  <PropRow key={p.key} prop={p} />
                ))}
                {selectedText !== undefined ? (
                  <div className="anl-tree-prop">
                    <span className="anl-tree-prop-key">Message</span>
                    <pre className={`anl-tree-message ${selected.kind === "ERR" ? "anl-tree-error-text" : ""}`.trim()}>{selectedText}</pre>
                  </div>
                ) : null}
                {isGroupSel ? (
                  <>
                    <div className="anl-tree-prop">
                      <span className="anl-tree-prop-key">첫 메시지</span>
                      <pre className="anl-tree-message">{groupMsgs[0]?.text}</pre>
                    </div>
                    <div className="anl-tree-prop">
                      <span className="anl-tree-prop-key">마지막 메시지</span>
                      <pre className="anl-tree-message">{groupMsgs[groupMsgs.length - 1]?.text}</pre>
                    </div>
                    <div className="anl-tree-section">전체 메시지</div>
                    <ol className="anl-tree-msg-list">
                      {groupMsgs.map((m) => (
                        <li key={m.id}>{m.text}</li>
                      ))}
                    </ol>
                  </>
                ) : null}
                {isQuery ? (
                  <>
                    <div className="anl-tree-prop">
                      <span className="anl-tree-prop-key">SQL</span>
                      <div className="anl-tree-sql-box">
                        <pre className="anl-tree-sql">{selected.sql}</pre>
                        <div className="anl-tree-actions">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setViewerBound(false);
                              setViewerOpen(true);
                            }}
                          >
                            쿼리 보기
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setViewerBound(true);
                              setViewerOpen(true);
                            }}
                          >
                            값 바인딩 보기
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="anl-tree-section">Param</div>
                    {params.length === 0 ? (
                      <div className="anl-tree-muted anl-tree-no-params">바인딩 값 없음</div>
                    ) : (
                      params.map((pm, i) => (
                        <PropRow key={i} prop={{ key: `#${pm.idx} ${pm.type}`.trim(), value: pm.value, mono: true }} />
                      ))
                    )}
                  </>
                ) : null}
                <TimeProps node={selected} />
              </>
            ) : null}
          </div>
        </section>
      </div>
      <FloatingPanel
        title="쿼리 뷰어"
        open={active && viewerOpen && isQuery}
        onClose={() => setViewerOpen(false)}
        storageKey={VIEWER_STORAGE_KEY}
        defaultRect={VIEWER_DEFAULT_RECT}
        minWidth={320}
        minHeight={220}
        testId="anl-tree-query-viewer"
      >
        <div className="anl-tree-viewer">
          <div className="anl-tree-viewer-bar" role="group" aria-label="보기 방식">
            <Button size="sm" variant={viewerBound ? "default" : "primary"} aria-pressed={!viewerBound} onClick={() => setViewerBound(false)}>
              원문
            </Button>
            <Button size="sm" variant={viewerBound ? "primary" : "default"} aria-pressed={viewerBound} onClick={() => setViewerBound(true)}>
              값 바인딩
            </Button>
          </div>
          <pre className="anl-tree-viewer-text">{viewerText}</pre>
          <div className="anl-tree-viewer-foot">
            <Button size="sm" onClick={() => void copyText(viewerText)}>
              복사
            </Button>
            <Button size="sm" variant="primary" onClick={() => onSendToBinder(viewerText)}>
              Binder 탭으로 보내기
            </Button>
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
}

export const TreeTab = memo(TreeTabComponent);
