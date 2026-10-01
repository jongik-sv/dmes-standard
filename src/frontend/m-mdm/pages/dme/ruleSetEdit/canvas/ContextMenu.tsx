"use client";

/**
 * 캔버스 우클릭·[+] 메뉴(3단계 계획 P4) — 떠 있는 레이어 하나(`position: fixed`, 포털 없이 page 안)에 항목 버튼을 세로로 둔다.
 * 항목을 누르면 `run()` 뒤 닫는다. Esc·바깥 누르기·스크롤로 닫는다. 화면 밖으로 넘치면 안쪽으로 당긴다. 항목이 0개면 열지 않는다.
 * 메뉴는 캔버스 감싸개 안에 있으므로 메뉴 안 키 입력은 여기서 끊는다 — 메뉴 단추에 초점이 있을 때 Delete 등이 캔버스 단축키로 올라가지 않게.
 * `children` 은 떠 있는 하위 메뉴가 아니라 제목 아래 들여 쓴 버튼 묶음으로 그린다(분기 풀기 갈래 고르기).
 * `swatches` 가 있는 항목은 [아이콘 + 라벨] 단추로 그리고, 누르면 메뉴를 닫지 않고 그 아래에 3열 견본 격자를 펼친다(색상). 견본을 누르면 `run()` 뒤 닫는다.
 * 화면 모듈은 Mantine 을 쓰지 않으므로(Part B §4-2) 기본 버튼과 `styles/menu.ts` 규칙으로 그린다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { IconBrush, type TablerIcon } from "@tabler/icons-react";

import type { MenuItem } from "./context-menu";

export interface ContextMenuProps {
  items: MenuItem[];
  /** 화면 좌표(clientX·clientY). null 이면 닫힘. */
  at: { x: number; y: number } | null;
  onClose(): void;
}

/** 화면 가장자리와 띄울 간격(px). */
const EDGE_GAP = 4;

function ItemButton({ item, onClose, nested }: { item: MenuItem; onClose(): void; nested: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`rsf-menu-item${nested ? " rsf-menu-item-nested" : ""}`}
      data-testid={`flow-menu-item-${item.id}`}
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

const ITEM_ICON: Readonly<Record<NonNullable<MenuItem["icon"]>, TablerIcon>> = { brush: IconBrush };

/** 견본 격자를 펼치는 항목(색상) — 단추는 메뉴를 닫지 않고, 견본을 누르면 run 뒤 닫는다. */
function SwatchEntry({ item, onClose, onResize }: { item: MenuItem; onClose(): void; onResize(): void }) {
  const [open, setOpen] = useState(false);
  const Icon = item.icon ? ITEM_ICON[item.icon] : null;
  return (
    <div className="rsf-menu-group">
      <button
        type="button"
        role="menuitem"
        className="rsf-menu-item rsf-menu-item-icon"
        data-testid={`flow-menu-item-${item.id}`}
        aria-expanded={open}
        disabled={item.disabled}
        title={item.title}
        onClick={() => {
          setOpen((v) => !v);
          onResize();
        }}
      >
        {Icon && <Icon size={14} aria-hidden="true" />}
        <span>{item.label}</span>
      </button>
      {open && (
        <div className="rsf-menu-swatches" role="group" aria-label={item.label}>
          {item.swatches!.map((sw) => (
            <button
              key={sw.id}
              type="button"
              className="rsf-menu-swatch"
              data-color={sw.color}
              data-testid={`flow-menu-swatch-${sw.color}`}
              aria-label={sw.label}
              title={sw.label}
              aria-pressed={sw.active}
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

function Entry({ item, onClose, onResize }: { item: MenuItem; onClose(): void; onResize(): void }) {
  if (item.swatches && item.swatches.length > 0) return <SwatchEntry item={item} onClose={onClose} onResize={onResize} />;
  if (!item.children || item.children.length === 0) return <ItemButton item={item} onClose={onClose} nested={false} />;
  return (
    <div className="rsf-menu-group" role="group" aria-label={item.label}>
      {item.run ? (
        <ItemButton item={item} onClose={onClose} nested={false} />
      ) : (
        <div className="rsf-menu-group-title" data-testid={`flow-menu-item-${item.id}`} title={item.title}>
          {item.label}
        </div>
      )}
      {item.children.map((c) => (
        <ItemButton key={c.id} item={c} onClose={onClose} nested />
      ))}
    </div>
  );
}

export function ContextMenu({ items, at, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(at);
  const open = !!at && items.length > 0;
  /** 항목이 메뉴 높이를 바꾸면(색상 격자 펼침) 올려 위치 당김을 다시 돌린다. */
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

  // 열리면 첫 항목에 초점을 준다 — 키보드만으로도 쓸 수 있게(활성 항목이 없으면 메뉴 틀에).
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = el.querySelector<HTMLButtonElement>("button:not(:disabled)");
    (first ?? el).focus();
    // 닫힐 때 초점이 메뉴 안이거나 아무 데도 없으면 열기 전 자리(캔버스)로 돌려 단축키가 이어서 먹게 한다.
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
    const onDown = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("wheel", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onScroll, { capture: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  const p = pos ?? at;
  return (
    <div
      ref={ref}
      className="rsf-menu"
      data-testid="flow-menu"
      role="menu"
      tabIndex={-1}
      style={{ left: p.x, top: p.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {items.map((item) => (
        <Entry key={item.id} item={item} onClose={onClose} onResize={onResize} />
      ))}
    </div>
  );
}
