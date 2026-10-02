"use client";

/** [위젯 추가] 서랍 — 이름·설명 검색, 눌러서 맨 아래에 추가, 끌어서 원하는 자리에 놓기(스펙 §3.4). */
import { useMemo, useState } from "react";

import { WidgetStyle } from "./styles";
import type { WidgetItem, WidgetRegistry } from "./types";
import { setDraggingWidget } from "./widget-dnd";
import { canAddWidget } from "./widget-layout";

export interface WidgetPickerProps {
  registry: WidgetRegistry;
  items: readonly WidgetItem[];
  onAdd: (widgetId: string) => void;
}

export function WidgetPicker({ registry, items, onAdd }: WidgetPickerProps) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim();
    return Object.values(registry)
      .map((e) => e.meta)
      .filter((m) => !q || m.title.includes(q) || (m.description ?? "").includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, "ko"));
  }, [registry, query]);

  return (
    <aside className="cm-widget-picker" aria-label="위젯 추가">
      <WidgetStyle />
      <div className="cm-widget-picker__head">
        <h4 className="cm-widget-picker__title">위젯 추가</h4>
        <input
          className="cm-widget-picker__search"
          placeholder="위젯 이름 검색"
          aria-label="위젯 이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="cm-widget-picker__list">
        {list.length === 0 && <div className="cm-widget__state">검색 결과가 없습니다.</div>}
        {list.map((m) => {
          const enabled = canAddWidget(items, m);
          return (
            <button
              key={m.id}
              type="button"
              className="cm-widget-picker__item"
              data-widget-id={m.id}
              disabled={!enabled}
              draggable={enabled}
              title={enabled ? "눌러서 추가하거나 격자로 끌어 놓습니다" : "이미 놓였거나 탭에 위젯이 30개입니다"}
              onClick={() => onAdd(m.id)}
              onDragStart={(e) => {
                setDraggingWidget(m.id);
                // Firefox 는 dataTransfer 가 비면 끌기를 시작하지 않는다.
                e.dataTransfer?.setData("text/plain", m.id);
              }}
              onDragEnd={() => setDraggingWidget(null)}
            >
              <span className="cm-widget-picker__name">
                {m.title}
                <span className="cm-widget-picker__size">
                  {m.defaultSize.w}×{m.defaultSize.h}
                </span>
              </span>
              {m.description && <p className="cm-widget-picker__desc">{m.description}</p>}
            </button>
          );
        })}
      </div>
      <div className="cm-widget-picker__foot">눌러서 맨 아래에 추가하거나, 끌어서 원하는 자리에 놓습니다.</div>
    </aside>
  );
}
