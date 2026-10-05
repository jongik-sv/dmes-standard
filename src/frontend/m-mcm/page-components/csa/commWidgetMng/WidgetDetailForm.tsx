"use client";

/**
 * 위젯 관리 상세 — 공통 칸(이름·부제·설명·기본/최소/최대 크기·새로 고침·화면 열기·여러 번·사용) + 정의 위젯의 유형 편집기.
 * 스펙 2026-10-02-widget-admin-generic §10.1.
 * - 코드 위젯: 자리 표시(placeholder)에 코드 값을 보인다. 비우면 NULL = 코드 값.
 * - 정의 위젯: 유형 편집기(WIDGET_TYPE_REGISTRY[typeId].loadEditor())를 React.lazy 로 — 모듈 수준에서 유형마다 한 번만 만든다
 *   (렌더마다 lazy 를 새로 만들면 편집기가 다시 마운트돼 입력 중 상태를 잃는다).
 * - 크기 칸은 가로·세로 두 칸이라 표를 세 열(라벨 | 값 | 값)로 두고 한 칸짜리 값은 colSpan=2 로 둔다.
 */
import { lazy, Suspense, type LazyExoticComponent, type ReactNode } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Input, Radio, Select, Textarea } from "@dk-oasis/shared/form";
import { ErrorBoundary } from "@dk-oasis/shared/error-boundary";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { DESCRIPTION_LABEL } from "@/lib/ui-meta";
import {
  WIDGET_DEFAULT_MIN_SIZE,
  type WidgetMeta,
  type WidgetTypeEditorComponent,
  type WidgetTypeRegistryEntry,
} from "@dk-oasis/shared/widget";

import { WIDGET_TYPE_REGISTRY } from "@/lib/generated/widget-type-registry";

import { MULTIPLE_OPTIONS, USE_YN_OPTIONS, type DefForm } from "./types";

function lazyEditor(type: WidgetTypeRegistryEntry): LazyExoticComponent<WidgetTypeEditorComponent> {
  return lazy(async () => {
    const mod = await type.loadEditor();
    if (typeof mod.default !== "function") throw new Error(`${type.meta.id}: editor default export 가 컴포넌트가 아닙니다.`);
    return { default: mod.default as WidgetTypeEditorComponent };
  });
}

/** 유형별 편집기 — 모듈을 읽을 때 한 번만 만든다(유형 등록부는 생성물이라 고정). 실제 불러오기는 처음 그릴 때. */
const EDITORS: Readonly<Record<string, LazyExoticComponent<WidgetTypeEditorComponent>>> = Object.fromEntries(
  Object.values(WIDGET_TYPE_REGISTRY).map((t) => [t.meta.id, lazyEditor(t)])
);

const DATA_SRC_OPTIONS = [{ value: "mcm", label: "mcm (공통관리)" }];

/** 자리 표시 — 비운 칸이 무엇이 되는지(코드 위젯은 코드 값, 정의 위젯은 유형 값). */
interface Placeholders {
  title: string;
  subtitle: string;
  description: string;
  defW: string;
  defH: string;
  minW: string;
  minH: string;
  maxW: string;
  maxH: string;
  refreshSec: string;
  linkPageId: string;
  multiple: string;
  category: string;
}

function placeholdersOf(
  codeMeta: WidgetMeta | undefined,
  type: WidgetTypeRegistryEntry | undefined,
  categoryOptions?: readonly { value: string; label: string }[]
): Placeholders {
  const base = codeMeta ?? type?.meta;
  const min = base?.minSize ?? WIDGET_DEFAULT_MIN_SIZE;
  const categoryLabel = (cd?: string) =>
    cd ? (categoryOptions?.find((o) => o.value === cd)?.label ?? cd) : "";
  return {
    title: base?.title ?? "",
    subtitle: codeMeta?.subtitle ?? "",
    description: base?.description ?? "",
    defW: base ? String(base.defaultSize.w) : "",
    defH: base ? String(base.defaultSize.h) : "",
    minW: String(min.w),
    minH: String(min.h),
    maxW: base?.maxSize ? String(base.maxSize.w) : "제한 없음",
    maxH: base?.maxSize ? String(base.maxSize.h) : "제한 없음",
    refreshSec: codeMeta?.refreshSec ? String(codeMeta.refreshSec) : "없음",
    linkPageId: codeMeta?.linkPageId ?? "",
    multiple: codeMeta?.multiple === false ? "코드 값(허용 안 함)" : "코드 값(허용)",
    category: categoryLabel(codeMeta?.category),
  };
}

export interface WidgetDetailFormProps {
  /** null 이면 고른 행이 없다 — 모든 칸 비활성. */
  form: DefForm | null;
  /** 코드 위젯의 코드 메타(자리 표시용). */
  codeMeta?: WidgetMeta;
  /** 정의 위젯의 유형(없으면 알 수 없는 유형). */
  typeEntry?: WidgetTypeRegistryEntry;
  /** 분류 선택지(공통코드 WIDGET_CTG, useWidgetCategories). 없으면 분류칸이 자유 입력이 아닌 빈 선택지가 된다. */
  categoryOptions?: readonly { value: string; label: string }[];
  /** 선택이 바뀔 때마다 바뀌는 값 — 유형 편집기를 다시 마운트한다. */
  editorKey: string;
  disabled: boolean;
  /** 저장을 막는 오류(폼 검사 + 유형 편집기) — 표 아래 줄에 보인다. */
  errors: readonly string[];
  /** 미리보기(WidgetPreview) — 표 맨 아래 줄에 넣는다. */
  preview?: ReactNode;
  onChange: (patch: Partial<DefForm>) => void;
  onConfigChange: (next: unknown) => void;
  onEditorValidate: (errors: string[]) => void;
}

export function WidgetDetailForm({
  form,
  codeMeta,
  typeEntry,
  categoryOptions,
  editorKey,
  disabled,
  errors,
  preview,
  onChange,
  onConfigChange,
  onEditorValidate,
}: WidgetDetailFormProps) {
  const isDef = form?.srcTp === "D";
  const ph = placeholdersOf(isDef ? undefined : codeMeta, isDef ? typeEntry : undefined, categoryOptions);
  const off = disabled || !form;
  const text = (key: keyof DefForm) => {
    const v = form?.[key];
    return typeof v === "string" ? v : "";
  };
  const set = (key: keyof DefForm) => (v: string) => onChange({ [key]: v } as Partial<DefForm>);
  const isQuery = isDef && (form?.typeId ?? "").startsWith("query-");
  const Editor = isDef && typeEntry ? EDITORS[typeEntry.meta.id] : undefined;

  const kindText = !form
    ? ""
    : isDef
      ? `정의 위젯 · ${typeEntry ? typeEntry.meta.title : "알 수 없는 유형"} (${form.typeId ?? "-"})`
      : "코드 위젯";

  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="widgetId" label="ID" /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Input
              value={form ? form.widgetId || "(저장할 때 만들어집니다)" : ""}
              readOnly
              disabled
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="widgetKind" meta={false} label="구분" /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            {kindText}
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="title" label="이름" required={isDef} /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Input value={text("title")} maxLength={50} placeholder={ph.title} disabled={off} onChange={set("title")} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="subtitle" label="부제" /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Input value={text("subtitle")} maxLength={100} placeholder={ph.subtitle} disabled={off} onChange={set("subtitle")} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel {...DESCRIPTION_LABEL} /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Textarea
              rows={2}
              value={text("description")}
              maxLength={400}
              placeholder={ph.description}
              disabled={off}
              onChange={set("description")}
            />
          </td>
        </tr>
        {(
          [
            ["기본 크기(가로·세로)", "defW", "defH", ph.defW, ph.defH],
            ["최소 크기(가로·세로)", "minW", "minH", ph.minW, ph.minH],
            ["최대 크기(가로·세로)", "maxW", "maxH", ph.maxW, ph.maxH],
          ] as const
        ).map(([label, wKey, hKey, wPh, hPh]) => (
          <tr key={wKey}>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name={wKey} meta={false} label={label} /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                type="number"
                min={1}
                value={text(wKey)}
                placeholder={wPh}
                aria-label={`${label} 가로`}
                disabled={off}
                onChange={set(wKey)}
              />
            </td>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                type="number"
                min={1}
                value={text(hKey)}
                placeholder={hPh}
                aria-label={`${label} 세로`}
                disabled={off}
                onChange={set(hKey)}
              />
            </td>
          </tr>
        ))}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="refreshSec" label="새로 고침(초)" /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Input
              type="number"
              min={30}
              value={text("refreshSec")}
              placeholder={ph.refreshSec}
              disabled={off}
              onChange={set("refreshSec")}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="linkPageId" label="화면 열기 pageId" /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Input
              value={text("linkPageId")}
              maxLength={200}
              placeholder={ph.linkPageId || "예: mls:lsh/noticeMgmt"}
              disabled={off}
              onChange={set("linkPageId")}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="multipleYn" label="여러 번 놓기" /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Select
              value={form?.multipleYn ?? ""}
              options={MULTIPLE_OPTIONS}
              placeholder={isDef || !form ? undefined : ph.multiple}
              disabled={off}
              onChange={(v) => onChange({ multipleYn: v as DefForm["multipleYn"] })}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="categoryCd" label="분류" /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Select
              value={form?.categoryCd ?? ""}
              options={[{ value: "", label: isDef ? "없음" : "코드 값" }, ...(categoryOptions ?? [])]}
              placeholder={isDef || !form ? undefined : ph.category || "코드 값(없음)"}
              disabled={off}
              data-testid="widget-admin-category"
              onChange={(v) => onChange({ categoryCd: v })}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="useYn" label="사용" /></th>
          <td style={DETAIL_VALUE_CELL} colSpan={2}>
            <Radio
              name="useYn"
              options={USE_YN_OPTIONS}
              value={form?.useYn ?? "Y"}
              disabled={off}
              onChange={(v) => onChange({ useYn: v === "N" ? "N" : "Y" })}
            />
          </td>
        </tr>
        {isQuery && (
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="dataSrc" label="실행 모듈" meta={false} /></th>
            <td style={DETAIL_VALUE_CELL} colSpan={2}>
              <Select
                value={form?.dataSrc || "mcm"}
                options={DATA_SRC_OPTIONS}
                disabled={off}
                onChange={(v) => onChange({ dataSrc: v })}
              />
            </td>
          </tr>
        )}
        {isDef && (
          <tr>
            <th style={DETAIL_LABEL_CELL} colSpan={3}>
              <MdmFieldLabel name="typeConfig" meta={false} label="유형 설정" />
            </th>
          </tr>
        )}
        {isDef && (
          <tr>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              {Editor && form ? (
                <ErrorBoundary
                  key={editorKey}
                  fallback={<span className="form-error-message">유형 편집기를 불러오지 못했습니다.</span>}
                >
                  <Suspense fallback={<span>편집기를 불러오는 중…</span>}>
                    <Editor value={form.config} onChange={onConfigChange} onValidate={onEditorValidate} />
                  </Suspense>
                </ErrorBoundary>
              ) : (
                <span className="form-error-message">
                  알 수 없는 유형({form?.typeId ?? "-"})입니다. 이 정의는 지울 수만 있습니다.
                </span>
              )}
            </td>
          </tr>
        )}
        {form && errors.length > 0 && (
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="formErrors" meta={false} label="저장할 수 없음" /></th>
            <td style={DETAIL_VALUE_CELL} colSpan={2} role="alert" data-testid="widget-admin-errors">
              {errors.map((m, i) => (
                <span key={m} className="form-error-message">
                  {i > 0 && <br />}
                  {m}
                </span>
              ))}
            </td>
          </tr>
        )}
        {form && preview && (
          <tr>
            <th style={DETAIL_LABEL_CELL} colSpan={3}>
              <MdmFieldLabel name="preview" meta={false} label="미리보기(기본 크기)" />
            </th>
          </tr>
        )}
        {form && preview && (
          <tr>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              {preview}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
