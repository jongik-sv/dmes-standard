"use client";

/**
 * 닫을 수 있는 탭 — 탭 머리(제목·저장 안 한 변경 점·닫기 단추) + 모든 탭의 패널을 늘 그려 두는(마운트 유지) 탭 묶음.
 *
 * - 여러 문서를 한 화면에 열어 두고 오가는 편집 화면용이다. 영역 안 보기 전환만 필요하면 `@dk-oasis/shared/tabs`.
 * - 탭 머리는 Mantine `Tabs` 가 아니라 네이티브 요소다. Mantine `Tabs` 의 keepMounted 는 숨은 패널을
 *   React Activity 로 감싸 효과(useEffect)를 내리므로, 숨은 탭의 beforeunload·keydown 리스너가 사라진다.
 *   여기서는 고르지 않은 패널을 `hidden` 속성 + 인라인 `display:none` 으로만 숨기고 마운트·효과를 그대로 둔다.
 * - 닫기 확인(저장 안 한 변경 등)은 호출자가 `onClose` 안에서 한다. 이 부품은 탭 목록을 바꾸지 않는다.
 * - 키보드: 탭 단추에서 ←/→ 로 이웃 탭을 고른다(끝에서 반대 끝으로 돈다). 지금 탭만 tabIndex 0(roving tabindex).
 *   닫을 수 있는 탭은 Delete 키로도 닫는다(닫기 단추는 tabIndex -1 — Tab 정지를 늘리지 않는다).
 * 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3).
 */
import { IconX } from "@tabler/icons-react";
import React, { useCallback, useId, useRef } from "react";

export interface ClosableTabItem {
  key: string;
  label: React.ReactNode;
  /** 탭 머리 툴팁(title) */
  title?: string;
  /** 저장하지 않은 변경 점(●) 표시 */
  dirty?: boolean;
  /** false 면 이 탭만 닫기 단추를 숨긴다(기본 true) */
  closable?: boolean;
}

export interface ClosableTabsProps {
  items: ClosableTabItem[];
  activeKey: string;
  onSelect(key: string): void;
  /** 없으면 닫기 단추를 그리지 않는다. 닫기 확인(저장 안 한 변경 등)은 호출자가 한다. */
  onClose?(key: string): void;
  /** 모든 탭의 패널을 늘 그린다(마운트 유지). 고르지 않은 패널은 hidden 속성 + 인라인 display:none. */
  renderPanel(item: ClosableTabItem): React.ReactNode;
  /** 탭 머리 줄 끝의 상태 메시지(role="status") */
  message?: React.ReactNode;
  /** 기본 true — 탭이 하나뿐이면 닫기 단추를 그리지 않는다 */
  keepLast?: boolean;
  ariaLabel?: string;
  /** 기본 "closable-tab". testid: 머리 줄 `${p}s`, 탭 단추 `${p}-${key}`(aria-selected), 점 `${p}-dirty-${key}`, 닫기 `${p}-close-${key}`, 패널 `${p}-panel-${key}`, 메시지 `${p}s-message` */
  testIdPrefix?: string;
  /** 닫기 단추 aria-label 문구 만들기. 기본 (label) => `${label} 탭 닫기`(label 이 문자열이 아니면 key) */
  closeLabel?(item: ClosableTabItem): string;
  /** 점 aria-label. 기본 "저장하지 않은 변경" */
  dirtyLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

const STYLE_HREF = "cm-closable-tabs";

export const CLOSABLE_TABS_CSS = `
.cm-closable-tabs { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; min-width: 0; }
.cm-closable-tabs__head { display: flex; align-items: flex-end; flex: 0 0 auto; min-width: 0; background: var(--color-bg-header); border-bottom: 1px solid var(--color-border); }
.cm-closable-tabs__list { display: flex; align-items: flex-end; gap: 2px; flex: 0 1 auto; min-width: 0; padding: var(--spacing-xs) var(--spacing-xs) 0; margin-bottom: -1px; overflow-x: auto; overflow-y: hidden; }
.cm-closable-tabs__tab { display: inline-flex; align-items: center; gap: var(--spacing-xs); flex: 0 0 auto; max-width: 240px; margin-bottom: -1px; padding-right: var(--spacing-xs); border: 1px solid transparent; border-bottom: 0; border-radius: var(--radius-md) var(--radius-md) 0 0; color: var(--color-text-secondary); }
.cm-closable-tabs__tab:hover { background: var(--color-bg-hover); color: var(--color-text); }
.cm-closable-tabs__tab[data-active="true"] { background: var(--color-bg); border-color: var(--color-border); color: var(--color-text); font-weight: 600; }
.cm-closable-tabs__btn { display: inline-flex; align-items: center; gap: var(--spacing-xs); min-width: 0; height: 28px; margin: 0; padding: 0 var(--spacing-xs) 0 var(--spacing-sm); border: 0; background: transparent; color: inherit; font: inherit; font-size: var(--font-size-sm); cursor: pointer; white-space: nowrap; }
.cm-closable-tabs__btn:focus-visible, .cm-closable-tabs__close:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; border-radius: var(--radius-sm); }
.cm-closable-tabs__label { overflow: hidden; text-overflow: ellipsis; }
.cm-closable-tabs__dirty { flex: 0 0 auto; color: var(--color-primary); font-size: 10px; line-height: 1; }
.cm-closable-tabs__close { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 16px; height: 16px; margin: 0; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.cm-closable-tabs__close:hover { background: var(--color-bg-hover); color: var(--color-text); }
.cm-closable-tabs__message { flex: 0 1 auto; align-self: center; min-width: 0; margin-left: auto; padding: 0 var(--spacing-sm) var(--spacing-xs); color: var(--color-text-muted); font-size: var(--font-size-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-closable-tabs__message:empty { padding: 0; }
.cm-closable-tabs__panel { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; min-width: 0; }
`;

/** 스타일을 한 번만 넣는다(React 19 가 같은 href 의 style 을 하나로 합친다). */
function ClosableTabsStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {CLOSABLE_TABS_CSS}
    </style>
  );
}

/** id 안에 쓸 수 있게 공백을 바꾼다(HTML id 는 공백만 금지). */
const idPart = (key: string) => key.replace(/\s/g, "_");

const defaultCloseLabel = (item: ClosableTabItem) =>
  `${typeof item.label === "string" ? item.label : item.key} 탭 닫기`;

export function ClosableTabs({
  items,
  activeKey,
  onSelect,
  onClose,
  renderPanel,
  message,
  keepLast = true,
  ariaLabel,
  testIdPrefix = "closable-tab",
  closeLabel = defaultCloseLabel,
  dirtyLabel = "저장하지 않은 변경",
  className,
  style,
}: ClosableTabsProps) {
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const p = testIdPrefix;
  const tabId = (key: string) => `${baseId}-tab-${idPart(key)}`;
  const panelId = (key: string) => `${baseId}-panel-${idPart(key)}`;

  const hasActive = items.some((it) => it.key === activeKey);
  const canClose = (it: ClosableTabItem) =>
    !!onClose && it.closable !== false && !(keepLast && items.length <= 1);

  const select = useCallback(
    (key: string) => {
      if (key !== activeKey) onSelect(key);
    },
    [activeKey, onSelect]
  );

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (items.length < 2) return;
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      const next = items[(index + step + items.length) % items.length];
      tabRefs.current.get(next.key)?.focus();
      select(next.key);
      return;
    }
    if (e.key === "Delete") {
      const it = items[index];
      if (canClose(it)) {
        e.preventDefault();
        onClose?.(it.key);
      }
    }
  };

  return (
    <div className={["cm-closable-tabs", className].filter(Boolean).join(" ")} style={style}>
      <ClosableTabsStyle />
      <div className="cm-closable-tabs__head">
        <div
          role="tablist"
          aria-label={ariaLabel}
          aria-orientation="horizontal"
          className="cm-closable-tabs__list"
          data-testid={`${p}s`}
        >
          {items.map((it, i) => {
            const active = it.key === activeKey;
            const focusable = active || (!hasActive && i === 0);
            return (
              <div
                key={it.key}
                className="cm-closable-tabs__tab"
                data-active={active ? "true" : "false"}
              >
                <button
                  ref={(el) => {
                    if (el) tabRefs.current.set(it.key, el);
                    else tabRefs.current.delete(it.key);
                  }}
                  type="button"
                  role="tab"
                  id={tabId(it.key)}
                  aria-selected={active}
                  aria-controls={panelId(it.key)}
                  tabIndex={focusable ? 0 : -1}
                  title={it.title}
                  className="cm-closable-tabs__btn"
                  data-testid={`${p}-${it.key}`}
                  onClick={() => select(it.key)}
                  onKeyDown={(e) => onTabKeyDown(e, i)}
                >
                  <span className="cm-closable-tabs__label">{it.label}</span>
                  {it.dirty ? (
                    <span
                      role="img"
                      aria-label={dirtyLabel}
                      className="cm-closable-tabs__dirty"
                      data-testid={`${p}-dirty-${it.key}`}
                    >
                      ●
                    </span>
                  ) : null}
                </button>
                {canClose(it) ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={closeLabel(it)}
                    title={closeLabel(it)}
                    className="cm-closable-tabs__close"
                    data-testid={`${p}-close-${it.key}`}
                    onClick={() => onClose?.(it.key)}
                  >
                    <IconX size={12} stroke={2} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {/* 상태 메시지는 tablist 밖 형제로 둔다(tablist 의 자식은 탭만). 빈 채로도 늘 그려 둬야 바뀐 문구를 읽어 준다. */}
        <span role="status" className="cm-closable-tabs__message" data-testid={`${p}s-message`}>
          {message}
        </span>
      </div>
      {items.map((it) => {
        const active = it.key === activeKey;
        return (
          <div
            key={it.key}
            role="tabpanel"
            id={panelId(it.key)}
            aria-labelledby={tabId(it.key)}
            hidden={!active}
            style={active ? undefined : { display: "none" }}
            className="cm-closable-tabs__panel"
            data-testid={`${p}-panel-${it.key}`}
          >
            {renderPanel(it)}
          </div>
        );
      })}
    </div>
  );
}

export default ClosableTabs;
