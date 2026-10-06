"use client";

/**
 * 위젯 관리 미리보기 — 저장 전 상세 값으로 WidgetFrame 을 기본 크기 비율로 그린다(스펙 2026-10-02-widget-admin-generic §10.1).
 * - 코드 위젯: { meta: applyWidgetOverride(코드 메타, 폼 행), load: 코드 본체 }.
 * - 정의 위젯: { meta: defWidgetMeta(폼 행, 유형), load: defWidgetLoader(유형, config) } — config 의 `__preview`(쿼리 시험 결과)를
 *   그대로 넘겨 렌더러가 서버를 부르지 않게 한다(계획 「화면 전용 키 규칙」).
 * - WidgetFrame 은 entry 객체마다 본체를 새로 불러오므로 값이 바뀌면 300ms 디바운스 뒤에 entry 를 새로 만든다.
 *   선택이 바뀌면 화면이 key 로 다시 마운트하므로 첫 entry 는 바로 만든다.
 * - 크기: 폭 = 미리보기 영역 × w/24, 높이 = h×20 + (h−1)×8 px(previewBox). 영역 폭은 ResizeObserver 로 잰다.
 * - 크기 조절: 위의 「기본/최소/최대」 로 대상을 고르면 그 크기로 그리고, 공통 GridResizeBox 의 손잡이를 끌어 격자 단위로 바꾼다.
 *   놓으면 onSizeChange 로 대상의 가로·세로 입력 칸 값을 넘긴다. 나머지 두 크기는 점선 틀로 겹쳐 보인다(입력 칸을 고치면 바로 반영).
 */
import { useEffect, useRef, useState } from "react";

import { SegmentedControl } from "@dk-oasis/shared/form";
import { GridResizeBox, type GridSize } from "@dk-oasis/shared/grid-resize-box";

import {
  applyWidgetOverride,
  defWidgetLoader,
  defWidgetMeta,
  WidgetFrame,
  type WidgetItem,
  type WidgetRegistryEntry,
  type WidgetTypeRegistryEntry,
} from "@dk-oasis/shared/widget";

import {
  formToRow,
  otherSizes,
  previewBox,
  previewSizes,
  SIZE_TARGET_OPTIONS,
  sizePatch,
  targetSize,
  type SizeTarget,
} from "./form-model";
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
  /** 미리보기로 보고 끌어 바꿀 크기 종류. */
  target: SizeTarget;
  onTargetChange: (target: SizeTarget) => void;
  /** 끌어서 확정한 크기 — 고른 대상의 가로·세로 입력 칸 값. */
  onSizeChange: (patch: Partial<DefForm>) => void;
  /** true 이면 끌 수 없다(저장 중 등). */
  disabled?: boolean;
}

/** 나머지 크기 점선 틀의 색 — 공통 토큰만 쓴다. */
const OTHER_COLOR: Record<SizeTarget, string> = {
  def: "var(--color-primary)",
  min: "var(--color-success)",
  max: "var(--color-warning)",
};
const TARGET_LABEL: Record<SizeTarget, string> = { def: "기본", min: "최소", max: "최대" };

const sizeLabel = (s: GridSize | null) => (s ? `${s.w}×${s.h}` : "제한 없음");

export function WidgetPreview({
  form,
  codeEntry,
  typeEntry,
  target,
  onTargetChange,
  onSizeChange,
  disabled = false,
}: WidgetPreviewProps) {
  const [entry, setEntry] = useState<WidgetRegistryEntry | null>(() => buildPreviewEntry(form, codeEntry, typeEntry));
  const builtFrom = useRef(JSON.stringify(form));
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaWidth, setAreaWidth] = useState(0);
  /** 끄는 중의 크기(끝나면 null) — 틀 안 WidgetFrame 의 w·h 로만 쓴다. */
  const [liveSize, setLiveSize] = useState<GridSize | null>(null);

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

  // 폼 칸 값이 곧 크기다(입력 칸을 고치면 바로 반영). 비운 칸은 코드·유형 값 → 최소는 4×6, 최대는 제한 없음.
  const sizes = previewSizes(form, codeEntry?.meta ?? typeEntry?.meta);
  const size = targetSize(sizes, target);
  const shown = liveSize ?? size;
  const others = otherSizes(sizes, target);
  const stageHeight = Math.max(
    previewBox(areaWidth, shown).height,
    ...others.map((o) => previewBox(areaWidth, o.size).height)
  );
  const item: WidgetItem = {
    instId: "preview",
    // 저장 전 정의 위젯은 "" — 쿼리 위젯이 자리 표시 ID(def.preview)로 서버 실행을 부르지 않게 한다(meta.id 는 자리 표시 그대로).
    widgetId: form.widgetId,
    x: 0,
    y: 0,
    w: shown.w,
    h: shown.h,
    locked: false,
    config: null,
  };

  return (
    // 미리보기 크기는 영역 폭에 따라 계산되는 값이라 인라인 style 로 준다(색은 토큰).
    <div ref={areaRef} data-testid="widget-admin-preview" style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap", marginBottom: "var(--spacing-xs)" }}>
        <SegmentedControl
          value={target}
          onChange={(v) => onTargetChange(v as SizeTarget)}
          options={SIZE_TARGET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          ariaLabel="미리보기 크기 종류"
          disabled={disabled}
        />
        <span data-testid="widget-admin-preview-summary" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          기본 {sizeLabel(sizes.def)} · 최소 {sizeLabel(sizes.min)} · 최대 {sizeLabel(sizes.max)}
        </span>
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: "var(--spacing-xs)" }}>
        오른쪽·아래 가장자리를 끌면 {TARGET_LABEL[target]} 크기가 바뀌어 위의 입력 칸에 들어갑니다.
        {target === "max" && !sizes.max ? " 최대 크기를 정하기 전이라 기본 크기에서 시작합니다." : ""}
      </div>
      {entry ? (
        <div style={{ position: "relative", height: stageHeight }}>
          {others.map((o) => {
            const box = previewBox(areaWidth, o.size);
            return (
              <div
                key={o.target}
                data-testid={`widget-admin-preview-ghost-${o.target}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: box.width,
                  height: box.height,
                  boxSizing: "border-box",
                  border: `1px dashed ${OTHER_COLOR[o.target]}`,
                  color: OTHER_COLOR[o.target],
                  fontSize: "var(--font-size-xs)",
                  pointerEvents: "none",
                  zIndex: 4,
                }}
              >
                <span style={{ position: "absolute", right: 4, top: 2 }}>
                  {TARGET_LABEL[o.target]} {sizeLabel(o.size)}
                </span>
              </div>
            );
          })}
          <GridResizeBox
            size={size}
            areaWidth={areaWidth}
            disabled={disabled}
            testId="widget-admin-preview-box"
            onResize={setLiveSize}
            onResizeEnd={(next) => onSizeChange(sizePatch(target, next))}
          >
            <WidgetFrame item={item} entry={entry} editing={false} onToggleLock={noop} onRemove={noop} />
          </GridResizeBox>
        </div>
      ) : (
        <span className="form-error-message">유형을 알 수 없어 미리보기를 그릴 수 없습니다.</span>
      )}
    </div>
  );
}
