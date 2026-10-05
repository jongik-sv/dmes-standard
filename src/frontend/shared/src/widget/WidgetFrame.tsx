"use client";

/**
 * 위젯 공통 틀 — 제목 줄(제목·부제·위젯 고유 자리·새로 고침·화면 열기 / 편집: 잠금·빼기)과 본문.
 * 본체는 등록부 load() 로 지연 로딩하고, 위젯마다 오류 경계를 둬 한 위젯이 죽어도 다른 위젯·보드는 그대로다(스펙 §6).
 * 제목 줄(.cm-widget__head)이 끌기 손잡이이고, 버튼(.cm-widget__btn)에서는 끌기가 시작되지 않는다(WidgetBoard dragConfig).
 * 관리자가 사용 중지한 위젯(meta.disabled)은 본체를 불러오지 않고 자리를 지키는 빈 칸을 그린다(스펙 widget-admin-generic §1.1·§12, W-D20).
 */
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type KeyboardEvent as ReactKeyboardEvent,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

import { MIN_REFRESH_SEC } from "./constants";
import { openPortalPage, WidgetFrameContext, type WidgetFrameApi, type WidgetRenameHandler, type WidgetStatus } from "./frame-context";
import { WidgetStyle } from "./styles";
import { WidgetTitleRename } from "./WidgetTitleRename";
import { useWidgetVisible } from "./use-widget-visible";
import type { WidgetComponent, WidgetItem, WidgetMoveKey, WidgetProps, WidgetRegistryEntry } from "./types";

export interface WidgetFrameProps {
  item: WidgetItem;
  /** undefined 면 등록부에 없는 위젯 — 「없는 위젯」 칸을 그린다. */
  entry: WidgetRegistryEntry | undefined;
  editing: boolean;
  /** 크기 조절 중 이름표(예: "10 × 20"). */
  sizeLabel?: string | null;
  onToggleLock: (instId: string) => void;
  onRemove: (instId: string) => void;
  onKeyMove?: (instId: string, key: WidgetMoveKey, mode: "move" | "resize") => void;
  /** 제목 줄의 제목·부제를 그리지 않는다(기본 false). 도구 창처럼 바깥 틀이 제목을 따로 보이는 곳용 — aria-label 은 그대로다. */
  hideTitle?: boolean;
}

// 지연 로딩 캐시는 entry 객체가 아니라 본체 로더(entry.load) 기준이다 — 덮어쓰기 행으로 meta 만 바뀐 새 entry 가 와도
// 같은 본체 컴포넌트를 써서 본체가 다시 마운트되지 않는다(widget-render-findings W2).
const lazyCache = new WeakMap<WidgetRegistryEntry["load"], LazyExoticComponent<WidgetComponent>>();

function lazyBody(entry: WidgetRegistryEntry): LazyExoticComponent<WidgetComponent> {
  let comp = lazyCache.get(entry.load);
  if (!comp) {
    comp = lazy(async () => {
      const mod = await entry.load();
      if (typeof mod.default !== "function") throw new Error(`${entry.meta.id}: default export 가 컴포넌트가 아닙니다.`);
      return { default: mod.default as WidgetComponent };
    });
    lazyCache.set(entry.load, comp);
  }
  return comp;
}

class WidgetErrorBoundary extends Component<{ onRetry: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[widget] 렌더 실패", error, info.componentStack);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="cm-widget__state cm-widget__state--error">
          위젯을 불러오지 못했습니다.
          <button type="button" className="cm-widget__text-btn" data-action="retry" onClick={this.props.onRetry}>
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const KEY_MAP: Record<string, WidgetMoveKey> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

export function WidgetFrame({ item, entry, editing, sizeLabel, onToggleLock, onRemove, onKeyMove, hideTitle = false }: WidgetFrameProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<WidgetStatus>({ kind: "ready" });
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  // 본체가 useWidgetTitle 로 덮어쓴 제목. 위젯 ID 와 함께 기억해 렌더 중에 걸러 쓴다 — 다른 위젯이 같은 칸에 오면 effect 없이 풀린다
  // (부모 effect 로 초기화하면 이미 불러온 본체의 자식 effect 가 먼저 정한 제목을 지운다).
  const [titleOverride, setTitleOverride] = useState<{ widgetId: string; title: string } | null>(null);
  // 본체가 useWidgetRename 으로 등록한 이름 바꾸기 처리기 — 제목 덮어쓰기와 같은 이유로 위젯 ID 와 함께 기억한다(함수를 state 에 넣으려 객체로 감싼다).
  const [renameReg, setRenameReg] = useState<{ widgetId: string; handler: WidgetRenameHandler } | null>(null);
  const [renaming, setRenaming] = useState(false);
  /** 키보드로 이름 바꾸기를 마치면 포커스를 연필 버튼으로 돌려준다 — 입력칸이 사라지며 포커스가 body 로 떨어지지 않게. */
  const restoreFocusRef = useRef(false);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const [bodySize, setBodySize] = useState<{ width: number; height: number | null }>({ width: 0, height: null });
  const bodyRef = useRef<HTMLDivElement>(null);
  const meta = entry?.meta;
  // 본문(bodyRef)은 「없는 위젯」·사용 중지 칸에는 없다 — 같은 틀이 그 칸에서 본문 있는 칸으로 바뀌면 관찰을 다시 붙인다.
  const hasBody = !!entry && !entry.meta.disabled;

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      // 포털 탭이 숨겨지면 폭 0 이 온다 — 보이지 않는 본체를 다시 그리지 않게 무시한다(Screen-Performance-Guide K6).
      if (width <= 0) return;
      setBodySize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasBody]);

  // 자동 새로 고침 — 보기 모드에서만, 최소 30초. 사용 중지 위젯은 본체가 없으므로 타이머도 걸지 않는다.
  // 숨은 탭·화면 밖·hidden 문서에서는 멈추고, 다시 보일 때 주기가 이미 찼으면 밀린 1회만 새로 고친다(R14).
  const refreshSec = meta?.disabled ? undefined : meta?.refreshSec;
  const visible = useWidgetVisible(bodyRef, hasBody);
  const lastRefreshAt = useRef<number | null>(null);
  useEffect(() => {
    if (editing || !refreshSec || !visible) return;
    const periodMs = Math.max(MIN_REFRESH_SEC, refreshSec) * 1000;
    const refresh = () => {
      lastRefreshAt.current = Date.now();
      setRefreshKey((k) => k + 1);
    };
    if (lastRefreshAt.current === null) lastRefreshAt.current = Date.now();
    else if (Date.now() - lastRefreshAt.current >= periodMs) refresh();
    const t = window.setInterval(refresh, periodMs);
    return () => window.clearInterval(t);
  }, [editing, refreshSec, visible]);

  const widgetId = entry?.meta.id ?? item.widgetId;
  const setTitle = useCallback(
    (title: string | null) => setTitleOverride(title && title.trim() ? { widgetId, title } : null),
    [widgetId]
  );
  const setRenameHandler = useCallback(
    (handler: WidgetRenameHandler | null) => setRenameReg(handler ? { widgetId, handler } : null),
    [widgetId]
  );
  const api = useMemo<WidgetFrameApi>(
    () => ({ setStatus, setTitle, setRenameHandler, bodySize, actionsSlot, titleSlot }),
    [setTitle, setRenameHandler, bodySize, actionsSlot, titleSlot]
  );
  // 이름 바꾸기는 보기 모드에서만 — 편집 모드의 잠금·빼기·끌기와 겹치지 않는다. 처리기를 등록한 위젯에서만 켠다.
  const renameHandler = !editing && renameReg && renameReg.widgetId === widgetId ? renameReg.handler : null;
  const showRename = renaming && renameHandler !== null;
  useEffect(() => {
    if (renaming && renameHandler === null) setRenaming(false);
  }, [renaming, renameHandler]);
  useEffect(() => {
    if (showRename || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    pencilRef.current?.focus();
  }, [showRename]);
  const shownTitle = titleOverride && titleOverride.widgetId === widgetId ? titleOverride.title : (entry?.meta.title ?? "");

  const retryLoad = useCallback(() => {
    // lazy 는 실패한 import 를 기억하므로 캐시를 지워 다시 불러오게 한다.
    if (entry) lazyCache.delete(entry.load);
    setStatus({ kind: "ready" });
    setAttempt((a) => a + 1);
  }, [entry]);

  const onHeadKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!editing || !onKeyMove || item.locked) return;
    const key = KEY_MAP[e.key];
    if (key) {
      e.preventDefault();
      onKeyMove(item.instId, key, e.shiftKey ? "resize" : "move");
    } else if (e.key === "Delete") {
      e.preventDefault();
      onRemove(item.instId);
    }
  };

  if (!entry) {
    return (
      <section className="cm-widget cm-widget--missing" data-inst-id={item.instId} data-widget-id={item.widgetId} data-editing={editing ? "true" : undefined}>
        <WidgetStyle />
        <div className="cm-widget__head">
          <h3 className="cm-widget__title">없는 위젯</h3>
          <span className="cm-widget__spacer" />
          {editing && (
            <button type="button" className="cm-widget__btn" data-action="remove" title="빼기" aria-label="빼기" onClick={() => onRemove(item.instId)}>
              ✕
            </button>
          )}
        </div>
        <div className="cm-widget__state">
          등록부에 없는 위젯입니다
          <code>{item.widgetId}</code>
          ✕ 로 빼면 저장할 때 함께 사라집니다.
        </div>
      </section>
    );
  }

  const editButtons = editing ? (
    <>
      <button
        type="button"
        className="cm-widget__btn"
        data-action="lock"
        aria-pressed={item.locked}
        title={item.locked ? "잠금 풀기" : "잠그기"}
        aria-label={item.locked ? "잠금 풀기" : "잠그기"}
        onClick={() => onToggleLock(item.instId)}
      >
        {item.locked ? "🔒" : "🔓"}
      </button>
      <button
        type="button"
        className="cm-widget__btn"
        data-action="remove"
        title="빼기"
        aria-label="빼기"
        disabled={item.locked}
        onClick={() => onRemove(item.instId)}
      >
        ✕
      </button>
    </>
  ) : null;

  // 사용 중지 — 본체(load)를 부르지 않고 제목만 남긴 빈 칸. 보기 모드에서도 자리를 지키고, 편집 모드의 잠금·빼기는 평소와 같다.
  if (entry.meta.disabled) {
    return (
      <section
        className="cm-widget cm-widget--disabled"
        data-widget-id={entry.meta.id}
        data-inst-id={item.instId}
        data-editing={editing ? "true" : undefined}
        data-locked={item.locked ? "true" : undefined}
        aria-label={entry.meta.title}
      >
        <WidgetStyle />
        <div className="cm-widget__head" tabIndex={editing ? 0 : -1} onKeyDown={onHeadKeyDown}>
          <h3 className="cm-widget__title">{entry.meta.title}</h3>
          <span className="cm-widget__spacer" />
          {!editing && item.locked && <span className="cm-widget__sub" title="잠김">🔒</span>}
          {editButtons}
        </div>
        <div className="cm-widget__disabled" data-widget-disabled="true">
          사용 중지된 위젯입니다
        </div>
        {sizeLabel && <span className="cm-widget__size">{sizeLabel}</span>}
      </section>
    );
  }

  const Body = lazyBody(entry);
  const props: WidgetProps = {
    instanceId: item.instId,
    size: { w: item.w, h: item.h },
    config: item.config,
    refreshKey,
    // 정의 위젯은 mergeWidgetRegistry 가 감싼 본체가 definition 을 덮어 넘긴다. 코드 위젯은 null.
    definition: null,
    widgetId: item.widgetId,
    title: entry.meta.title,
  };
  const padded = meta?.bodyPadding !== false;

  return (
    <section
      className="cm-widget"
      data-widget-id={entry.meta.id}
      data-inst-id={item.instId}
      data-editing={editing ? "true" : undefined}
      data-locked={item.locked ? "true" : undefined}
      aria-label={shownTitle}
    >
      <WidgetStyle />
      <div className="cm-widget__head" tabIndex={editing ? 0 : -1} onKeyDown={onHeadKeyDown}>
        {!hideTitle &&
          (showRename ? (
            <WidgetTitleRename initial={shownTitle} onCommit={renameHandler!} onClose={(restoreFocus) => {
                restoreFocusRef.current = restoreFocus;
                setRenaming(false);
              }}
            />
          ) : (
            <>
              <h3 className="cm-widget__title" onDoubleClick={renameHandler ? () => setRenaming(true) : undefined}>
                {shownTitle}
              </h3>
              {renameHandler && (
                <button ref={pencilRef} type="button" className="cm-widget__btn" data-action="rename" title="이름 바꾸기" aria-label="이름 바꾸기" onClick={() => setRenaming(true)}>
                  ✎
                </button>
              )}
            </>
          ))}
        {!hideTitle && entry.meta.subtitle && <span className="cm-widget__sub">{entry.meta.subtitle}</span>}
        <span className="cm-widget__title-extra" ref={setTitleSlot} />
        <span className="cm-widget__spacer" />
        <span className="cm-widget__actions" ref={setActionsSlot} />
        {!editing && (
          <>
            {item.locked && <span className="cm-widget__sub" title="잠김">🔒</span>}
            <button type="button" className="cm-widget__btn" data-action="refresh" title="새로 고침" aria-label="새로 고침" onClick={() => { lastRefreshAt.current = Date.now(); setRefreshKey((k) => k + 1); }}>
              ↻
            </button>
            {entry.meta.linkPageId && (
              <button type="button" className="cm-widget__btn" data-action="open" title="화면 열기" aria-label="화면 열기" onClick={() => openPortalPage(entry.meta.linkPageId!)}>
                ↗
              </button>
            )}
          </>
        )}
        {editButtons}
      </div>
      {status.kind === "loading" && (
        <div className="cm-widget__loading" role="status">
          불러오는 중…
        </div>
      )}
      <div
        ref={bodyRef}
        className={`cm-widget__body${padded ? " cm-widget__body--padded" : ""}`}
        aria-busy={status.kind === "loading" ? "true" : undefined}
      >
        <WidgetFrameContext.Provider value={api}>
          <WidgetErrorBoundary key={attempt} onRetry={retryLoad}>
            <Suspense fallback={<div className="cm-widget__skeleton"><i style={{ width: "60%" }} /><i /><i style={{ width: "80%" }} /></div>}>
              {status.kind === "error" ? (
                <div className="cm-widget__state cm-widget__state--error">
                  {status.message}
                  {status.retry && (
                    <button type="button" className="cm-widget__text-btn" data-action="retry" onClick={status.retry}>
                      다시 시도
                    </button>
                  )}
                </div>
              ) : null}
              <div hidden={status.kind === "error"} style={{ height: "100%" }}>
                <Body {...props} />
              </div>
            </Suspense>
          </WidgetErrorBoundary>
        </WidgetFrameContext.Provider>
      </div>
      {sizeLabel && <span className="cm-widget__size">{sizeLabel}</span>}
    </section>
  );
}
