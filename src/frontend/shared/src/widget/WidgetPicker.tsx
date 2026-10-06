"use client";

/**
 * [위젯 추가] 서랍 — 이름·설명 검색, 눌러서 첫 빈 자리에 추가, 끌어서 원하는 자리에 놓기(스펙 §3.4).
 * 사용 중지 위젯은 보이지 않고, 정의 위젯(kind "def")은 제목 아래에 유형 이름을 작은 글씨로 보인다(스펙 widget-admin-generic §2).
 */
import { useMemo, useState } from "react";

import { WidgetStyle } from "./styles";
import type { WidgetItem, WidgetMeta, WidgetRegistry } from "./types";
import { setDraggingWidget } from "./widget-dnd";
import { canAddWidget } from "./widget-layout";
import { resolveWidgetPlacement } from "./widget-placement";

export interface WidgetPickerProps {
  registry: WidgetRegistry;
  items: readonly WidgetItem[];
  onAdd: (widgetId: string) => void;
  /** 위젯 유형 ID → 이름("query-table" → "쿼리 표"). 정의 위젯 제목 아래에 보인다. */
  typeTitles?: Readonly<Record<string, string>>;
  /** 분류 코드(WIDGET_CTG) → 분류 이름. 주면 서랍이 분류별로 묶이고 분류 칩 필터가 생긴다(목록 순서가 묶음 순서). */
  categoryTitles?: Readonly<Record<string, string>>;
  /** 항목에 마우스를 올리면 그 위젯 메타, 벗어나면 null 을 알린다(미리 배치용). */
  onPreview?: (meta: WidgetMeta | null) => void;
}

/** 분류를 모르거나 지정하지 않은 위젯이 모이는 묶음 이름. */
const OTHER_GROUP = "기타";

/** 정의 위젯의 유형 이름 — 코드 위젯이거나 이름을 모르면 null. */
function typeTitleOf(meta: WidgetMeta, typeTitles?: Readonly<Record<string, string>>): string | null {
  if (meta.kind !== "def" || !meta.typeId || !typeTitles) return null;
  return typeTitles[meta.typeId] ?? null;
}

export function WidgetPicker({ registry, items, onAdd, typeTitles, categoryTitles, onPreview }: WidgetPickerProps) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const list = useMemo(() => {
    const q = query.trim();
    return Object.values(registry)
      .map((e) => e.meta)
      .filter((m) => !m.disabled)
      // 배치가 「업무 화면만」(B)인 위젯은 보드에 놓지 않으므로 서랍에서 뺀다(2026-10-06).
      .filter((m) => resolveWidgetPlacement(m).board)
      // 비공개는 검색어가 위젯 ID 와 전부 같을 때만 보인다(2026-10-05 위젯 개선 §10) — 이때는 이름 검색을 우회한다.
      .filter((m) => !m.private || q === m.id)
      .filter((m) => !categoryTitles || !activeCat || m.category === activeCat)
      .filter(
        (m) =>
          !q ||
          (m.private && q === m.id) ||
          m.title.includes(q) ||
          (m.description ?? "").includes(q) ||
          (typeTitleOf(m, typeTitles) ?? "").includes(q),
      )
      .sort((a, b) => a.title.localeCompare(b.title, "ko"));
  }, [registry, query, typeTitles, categoryTitles, activeCat]);

  // 분류 칩: 검색어를 뺀 사용 중 위젯에 실제로 있는 분류만(categoryTitles 순서, 비공개 제외).
  const chipCats = useMemo(() => {
    if (!categoryTitles) return [];
    const present = new Set(
      Object.values(registry)
        .map((e) => e.meta)
        .filter((m) => !m.disabled && !m.private && m.category && resolveWidgetPlacement(m).board)
        .map((m) => m.category as string),
    );
    return Object.keys(categoryTitles).filter((c) => present.has(c));
  }, [registry, categoryTitles]);

  // 분류별 묶음: categoryTitles 순서대로, 분류가 없거나 모르는 위젯은 맨 끝 「기타」.
  const sections = useMemo(() => {
    if (!categoryTitles) return null;
    const known = Object.keys(categoryTitles);
    const out = known.map((c) => ({ key: c, label: categoryTitles[c], metas: list.filter((m) => m.category === c) }));
    out.push({ key: "", label: OTHER_GROUP, metas: list.filter((m) => !m.category || !known.includes(m.category)) });
    return out.filter((s) => s.metas.length > 0);
  }, [categoryTitles, list]);

  const renderItem = (m: WidgetMeta) => {
    const enabled = canAddWidget(items, m);
    const typeTitle = typeTitleOf(m, typeTitles);
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
        onMouseEnter={onPreview ? () => onPreview(m) : undefined}
        onMouseLeave={onPreview ? () => onPreview(null) : undefined}
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
        {typeTitle && <span className="cm-widget-picker__type">{typeTitle}</span>}
        {m.description && (
          <p className="cm-widget-picker__desc" title={m.description}>
            {m.description}
          </p>
        )}
      </button>
    );
  };

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
        {chipCats.length > 0 && categoryTitles && (
          <div className="cm-widget-picker__cats" role="group" aria-label="분류 필터">
            {[null, ...chipCats].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                className="cm-widget-picker__cat"
                aria-pressed={activeCat === c}
                onClick={() => setActiveCat(c === null || c === activeCat ? null : c)}
              >
                {c === null ? "전체" : categoryTitles[c]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="cm-widget-picker__list">
        {list.length === 0 && <div className="cm-widget__state">검색 결과가 없습니다.</div>}
        {sections
          ? sections.map((sec) => (
              <section key={sec.key || "etc"} className="cm-widget-picker__section">
                <h5 className="cm-widget-picker__group">{sec.label}</h5>
                {sec.metas.map(renderItem)}
              </section>
            ))
          : list.map(renderItem)}
      </div>
      <div className="cm-widget-picker__foot">눌러서 첫 빈 자리에 추가하거나, 끌어서 원하는 자리에 놓습니다.</div>
    </aside>
  );
}
