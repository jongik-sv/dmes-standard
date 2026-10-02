"use client";

/**
 * 위젯 공통 틀 — 제목 줄(제목·부제·위젯 고유 자리·새로 고침·화면 열기 / 편집: 잠금·빼기)과 본문.
 * 본체는 등록부 load() 로 지연 로딩하고, 위젯마다 오류 경계를 둬 한 위젯이 죽어도 다른 위젯·보드는 그대로다(스펙 §6).
 * 제목 줄(.cm-widget__head)이 끌기 손잡이이고, 버튼(.cm-widget__btn)에서는 끌기가 시작되지 않는다(WidgetBoard dragConfig).
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
import { openPortalPage, WidgetFrameContext, type WidgetFrameApi, type WidgetStatus } from "./frame-context";
import { WidgetStyle } from "./styles";
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
}

const lazyCache = new WeakMap<WidgetRegistryEntry, LazyExoticComponent<WidgetComponent>>();

function lazyBody(entry: WidgetRegistryEntry): LazyExoticComponent<WidgetComponent> {
  let comp = lazyCache.get(entry);
  if (!comp) {
    comp = lazy(async () => {
      const mod = await entry.load();
      if (typeof mod.default !== "function") throw new Error(`${entry.meta.id}: default export 가 컴포넌트가 아닙니다.`);
      return { default: mod.default as WidgetComponent };
    });
    lazyCache.set(entry, comp);
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

export function WidgetFrame({ item, entry, editing, sizeLabel, onToggleLock, onRemove, onKeyMove }: WidgetFrameProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<WidgetStatus>({ kind: "ready" });
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [bodySize, setBodySize] = useState<{ width: number; height: number | null }>({ width: 0, height: null });
  const bodyRef = useRef<HTMLDivElement>(null);
  const meta = entry?.meta;

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setBodySize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 자동 새로 고침 — 보기 모드에서만, 최소 30초.
  const refreshSec = meta?.refreshSec;
  useEffect(() => {
    if (editing || !refreshSec) return;
    const t = window.setInterval(() => setRefreshKey((k) => k + 1), Math.max(MIN_REFRESH_SEC, refreshSec) * 1000);
    return () => window.clearInterval(t);
  }, [editing, refreshSec]);

  const api = useMemo<WidgetFrameApi>(
    () => ({ setStatus, bodySize, actionsSlot, titleSlot }),
    [bodySize, actionsSlot, titleSlot]
  );

  const retryLoad = useCallback(() => {
    // lazy 는 실패한 import 를 기억하므로 캐시를 지워 다시 불러오게 한다.
    if (entry) lazyCache.delete(entry);
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

  const Body = lazyBody(entry);
  const props: WidgetProps = { instanceId: item.instId, size: { w: item.w, h: item.h }, config: item.config, refreshKey };
  const padded = meta?.bodyPadding !== false;

  return (
    <section
      className="cm-widget"
      data-widget-id={entry.meta.id}
      data-inst-id={item.instId}
      data-editing={editing ? "true" : undefined}
      data-locked={item.locked ? "true" : undefined}
      aria-label={entry.meta.title}
    >
      <WidgetStyle />
      <div className="cm-widget__head" tabIndex={editing ? 0 : -1} onKeyDown={onHeadKeyDown}>
        <h3 className="cm-widget__title">{entry.meta.title}</h3>
        {entry.meta.subtitle && <span className="cm-widget__sub">{entry.meta.subtitle}</span>}
        <span className="cm-widget__title-extra" ref={setTitleSlot} />
        <span className="cm-widget__spacer" />
        <span className="cm-widget__actions" ref={setActionsSlot} />
        {!editing && (
          <>
            {item.locked && <span className="cm-widget__sub" title="잠김">🔒</span>}
            <button type="button" className="cm-widget__btn" data-action="refresh" title="새로 고침" aria-label="새로 고침" onClick={() => setRefreshKey((k) => k + 1)}>
              ↻
            </button>
            {entry.meta.linkPageId && (
              <button type="button" className="cm-widget__btn" data-action="open" title="화면 열기" aria-label="화면 열기" onClick={() => openPortalPage(entry.meta.linkPageId!)}>
                ↗
              </button>
            )}
          </>
        )}
        {editing && (
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
        )}
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
