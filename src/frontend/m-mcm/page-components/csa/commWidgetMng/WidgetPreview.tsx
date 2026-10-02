"use client";

/**
 * 위젯 관리 미리보기 — 저장 전 상세 값으로 WidgetFrame 을 기본 크기 비율로 그린다(스펙 2026-10-02-widget-admin-generic §10.1).
 * - 코드 위젯: { meta: applyWidgetOverride(코드 메타, 폼 행), load: 코드 본체 }.
 * - 정의 위젯: { meta: defWidgetMeta(폼 행, 유형), load: defWidgetLoader(유형, config) } — config 의 `__preview`(쿼리 시험 결과)를
 *   그대로 넘겨 렌더러가 서버를 부르지 않게 한다(계획 「화면 전용 키 규칙」).
 * - WidgetFrame 은 entry 객체마다 본체를 새로 불러오므로 값이 바뀌면 300ms 디바운스 뒤에 entry 를 새로 만든다.
 *   선택이 바뀌면 화면이 key 로 다시 마운트하므로 첫 entry 는 바로 만든다.
 * - 크기: 폭 = 미리보기 영역 × w/24, 높이 = h×20 + (h−1)×8 px(previewBox). 영역 폭은 ResizeObserver 로 잰다.
 */
import { useEffect, useRef, useState } from "react";

import {
  applyWidgetOverride,
  defWidgetLoader,
  defWidgetMeta,
  WidgetFrame,
  type WidgetItem,
  type WidgetRegistryEntry,
  type WidgetTypeRegistryEntry,
} from "@dk-oasis/shared/widget";

import { formToRow, previewBox } from "./form-model";
import type { DefForm } from "./types";

const DEBOUNCE_MS = 300;
/** 아직 저장 전인 정의 위젯의 미리보기용 ID. */
const PREVIEW_WIDGET_ID = "def.preview";
const noop = () => {};

/** 폼 값으로 미리보기 entry 를 만든다. 코드 본체·유형이 없으면 null(미리보기 없음). */
function buildPreviewEntry(
  form: DefForm,
  codeEntry: WidgetRegistryEntry | undefined,
  typeEntry: WidgetTypeRegistryEntry | undefined
): WidgetRegistryEntry | null {
  const row = formToRow(form);
  if (form.srcTp === "C") {
    return codeEntry ? { meta: applyWidgetOverride(codeEntry.meta, row), load: codeEntry.load } : null;
  }
  if (!typeEntry) return null;
  const meta = defWidgetMeta({ ...row, widgetId: row.widgetId || PREVIEW_WIDGET_ID }, typeEntry);
  return { meta, load: defWidgetLoader(typeEntry, row.config) };
}

export interface WidgetPreviewProps {
  form: DefForm;
  /** 코드 위젯의 등록부 항목(코드 위젯만). */
  codeEntry?: WidgetRegistryEntry;
  /** 정의 위젯의 유형 등록부 항목(정의 위젯만). */
  typeEntry?: WidgetTypeRegistryEntry;
}

export function WidgetPreview({ form, codeEntry, typeEntry }: WidgetPreviewProps) {
  const [entry, setEntry] = useState<WidgetRegistryEntry | null>(() => buildPreviewEntry(form, codeEntry, typeEntry));
  const builtFrom = useRef(JSON.stringify(form));
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaWidth, setAreaWidth] = useState(0);

  useEffect(() => {
    const sig = JSON.stringify(form);
    if (sig === builtFrom.current) return;
    const t = window.setTimeout(() => {
      builtFrom.current = sig;
      setEntry(buildPreviewEntry(form, codeEntry, typeEntry));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [form, codeEntry, typeEntry]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    setAreaWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setAreaWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size = entry?.meta.defaultSize ?? { w: 1, h: 1 };
  const box = previewBox(areaWidth, size);
  const item: WidgetItem = {
    instId: "preview",
    widgetId: entry?.meta.id ?? PREVIEW_WIDGET_ID,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    locked: false,
    config: null,
  };

  return (
    // 미리보기 크기는 영역 폭에 따라 계산되는 값이라 인라인 style 로 준다(색·글꼴 없음).
    <div ref={areaRef} data-testid="widget-admin-preview" style={{ width: "100%" }}>
      {entry ? (
        <div style={{ width: box.width, height: box.height }}>
          <WidgetFrame item={item} entry={entry} editing={false} onToggleLock={noop} onRemove={noop} />
        </div>
      ) : (
        <span className="form-error-message">유형을 알 수 없어 미리보기를 그릴 수 없습니다.</span>
      )}
    </div>
  );
}
