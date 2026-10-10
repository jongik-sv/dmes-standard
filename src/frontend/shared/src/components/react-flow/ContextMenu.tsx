"use client";

/**
 * 캔버스 우클릭·[+] 메뉴(룰 세트 편집기 canvas/ContextMenu.tsx 복사본) — 떠 있는 레이어 하나(position: fixed)에 항목 버튼을 세로로 둔다.
 * 항목을 누르면 run() 뒤 닫는다. Esc·바깥 누르기·스크롤로 닫는다. 화면 밖으로 넘치면 안쪽으로 당긴다. 항목이 0개면 열지 않는다.
 * 메뉴 안 키 입력은 여기서 끊는다 — 메뉴 단추에 초점이 있을 때 Delete 등이 캔버스 단축키로 올라가지 않게.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { MenuItem } from "./context-menu";
import { DEFAULT_CLASS_PREFIX, menuCss, styleHref } from "./styles";

export interface ContextMenuProps {
  items: MenuItem[];
  /** 화면 좌표(clientX·clientY). null 이면 닫힘. */
  at: { x: number; y: number } | null;
  onClose(): void;
  /** 메뉴 틀 data-testid(기본 "flow-menu"). 항목 `${testId}-item-${id}`, 견본 `${testId}-swatch-${id}`. */
  testId?: string;
  /** 클래스 접두(기본 "rfx"). */
  classPrefix?: string;
}

/** 화면 가장자리와 띄울 간격(px). */
const EDGE_GAP = 4;

interface EntryProps {
  item: MenuItem;
  onClose(): void;
  onResize(): void;
  testId: string;
  p: string;
}

function ItemButton({ item, onClose, nested, testId, p }: Omit<EntryProps, "onResize"> & { nested: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${p}-menu-item${nested ? ` ${p}-menu-item-nested` : ""}`}
      data-testid={`${testId}-item-${item.id}`}
      data-danger={item.danger ? "true" : undefined}
      disabled={item.disabled}
      title={item.title}
      onClick={() => {
        item.run?.();
        onClose();
      }}
    >
      {item.label}
    </button>
  );
}

/** 견본 격자를 펼치는 항목 — 단추는 메뉴를 닫지 않고, 견본을 누르면 run 뒤 닫는다. */
function SwatchEntry({ item, onClose, onResize, testId, p }: EntryProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${p}-menu-group`}>
      <button
        type="button"
        role="menuitem"
        className={`${p}-menu-item ${p}-menu-item-icon`}
        data-testid={`${testId}-item-${item.id}`}
        aria-expanded={open}
        disabled={item.disabled}
        title={item.title}
        onClick={() => {
          setOpen((v) => !v);
          onResize();
        }}
      >
        {item.icon ?? null}
        <span>{item.label}</span>
      </button>
      {open && (
        <div className={`${p}-menu-swatches`} role="group" aria-label={item.label}>
          {item.swatches!.map((sw) => (
            <button
              key={sw.id}
              type="button"
              className={`${p}-menu-swatch`}
              data-swatch={sw.id}
              data-testid={`${testId}-swatch-${sw.id}`}
              aria-label={sw.label}
              title={sw.label}
              aria-pressed={sw.active}
              style={{ backgroundColor: sw.color, borderColor: sw.borderColor }}
              onClick={() => {
                sw.run();
                onClose();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Entry(props: EntryProps) {
  const { item, onClose, testId, p } = props;
  if (item.swatches && item.swatches.length > 0) return <SwatchEntry {...props} />;
  if (!item.children || item.children.length === 0) return <ItemButton item={item} onClose={onClose} nested={false} testId={testId} p={p} />;
  return (
    <div className={`${p}-menu-group`} role="group" aria-label={item.label}>
      {item.run ? (
        <ItemButton item={item} onClose={onClose} nested={false} testId={testId} p={p} />
      ) : (
        <div className={`${p}-menu-group-title`} data-testid={`${testId}-item-${item.id}`} title={item.title}>
          {item.label}
        </div>
      )}
      {item.children.map((c) => (
        <ItemButton key={c.id} item={c} onClose={onClose} nested testId={testId} p={p} />
      ))}
    </div>
  );
}

export function ContextMenu({ items, at, onClose, testId = "flow-menu", classPrefix = DEFAULT_CLASS_PREFIX }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(at);
  const open = !!at && items.length > 0;
  /** 항목이 메뉴 높이를 바꾸면(견본 격자 펼침) 올려 위치 당김을 다시 돌린다. */
  const [resizes, setResizes] = useState(0);
  const onResize = useCallback(() => setResizes((n) => n + 1), []);

  // 여는 자리가 바뀌면 그 자리에 두고, 그린 뒤 화면 밖으로 넘치면 안쪽으로 당긴다.
  useLayoutEffect(() => {
    if (!open || !at) return;
    const el = ref.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    const vw = typeof window === "undefined" ? 0 : window.innerWidth;
    const vh = typeof window === "undefined" ? 0 : window.innerHeight;
    const x = vw > 0 && at.x + w + EDGE_GAP > vw ? Math.max(EDGE_GAP, vw - w - EDGE_GAP) : at.x;
    const y = vh > 0 && at.y + h + EDGE_GAP > vh ? Math.max(EDGE_GAP, vh - h - EDGE_GAP) : at.y;
    setPos({ x, y });
  }, [open, at, resizes]);

  // 열리면 첫 항목에 초점을 준다(활성 항목이 없으면 메뉴 틀). 닫힐 때 초점이 메뉴 안이거나 없으면 열기 전 자리로 돌린다.
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = el.querySelector<HTMLButtonElement>("button:not(:disabled)");
    (first ?? el).focus();
    return () => {
      const cur = document.activeElement;
      if (prev?.isConnected && (!cur || cur === document.body || el.contains(cur))) prev.focus();
    };
  }, [open, at]);

  // Esc·바깥 누르기·스크롤로 닫는다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const outside = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", outside, true);
    window.addEventListener("wheel", outside, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", outside, true);
      window.removeEventListener("wheel", outside, { capture: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  const p = classPrefix;
  const at2 = pos ?? at;
  return (
    <div
      ref={ref}
      className={`${p}-menu`}
      data-testid={testId}
      role="menu"
      tabIndex={-1}
      style={{ left: at2.x, top: at2.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <style href={styleHref("menu", p)} precedence="default">
        {menuCss(p)}
      </style>
      {items.map((item) => (
        <Entry key={item.id} item={item} onClose={onClose} onResize={onResize} testId={testId} p={p} />
      ))}
    </div>
  );
}
