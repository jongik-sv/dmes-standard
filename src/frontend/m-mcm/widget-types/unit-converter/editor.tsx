"use client";

/**
 * 단위 계산기 편집기 — 「보일 분류」 체크 목록(전체 선택)과 「기본 분류」 선택(보일 분류 안에서만).
 * categories 가 빈 배열이면 전체 분류를 보이므로 체크박스를 모두 켠 채로 보인다. 모두 켜져 있으면(「전체 선택」 포함) `[]` 로 저장해
 * 분류가 새로 늘어도 보이게 한다. 체크는 하나 이상 남아야 해서 마지막 하나는 끌 수 없다(전부 끄면 전체와 같아져 혼란스럽다).
 * 체크를 바꾸면 알려진 분류만 표 순서로 올리되 기본 분류는 건드리지 않는다 — 틀린 기본 분류(보일 분류 밖·모르는 id)는 검사 오류(onValidate)로
 * 알리고 선택칸은 「선택하세요」로 보이며, 사용자가 기본 분류를 고를 때 바로잡힌다. 오류 문구는 관리 화면이 목록으로 보인다. 미리보기는 관리 화면 미리보기가 맡는다.
 */
import { Button, Checkbox, FormGroup, Select } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { useReportErrors } from "../_content/hooks";
import { ContentStyle } from "../_content/styles";
import {
  buildUnitConfig,
  changeUnitSelection,
  readUnitConfig,
  readUnitSelection,
  UNIT_EDITOR_ALL_NOTE,
  unitEditorCountNote,
  validateUnitConfig,
} from "./unit-model";
import { UNIT_CSS, UNIT_STYLE_HREF } from "./unit-styles";
import { CATEGORIES, CATEGORY_IDS, getCategory, isCategoryId, type CategoryId } from "./units";

export default function UnitConverterEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = readUnitConfig(value);
  /** 저장된 보일 분류(알려진 id 만, 표 순서). 비어 있으면 「전체」. */
  const selected = readUnitSelection(value);
  /** 체크된 분류 — 저장된 목록이 비었으면 전체(모두 켠 채로 보인다). */
  const checked = selected.length === 0 ? CATEGORY_IDS : selected;
  const isAll = checked.length === CATEGORY_IDS.length;
  useReportErrors(validateUnitConfig(value), onValidate);

  const toggle = (id: CategoryId, on: boolean) => onChange(changeUnitSelection(value, on ? [...checked, id] : checked.filter((c) => c !== id)));

  const rawDefault = typeof value === "object" && value !== null ? (value as { defaultCategory?: unknown }).defaultCategory : undefined;
  const missingDefault = rawDefault === undefined || rawDefault === null || rawDefault === "";
  /** 선택칸에 보일 값 — 빠졌으면 읽은 기본 분류, 틀렸거나 보일 분류 밖이면 빈 값(「선택하세요」)이라 사용자가 알아채고 고를 수 있다. */
  const defaultShown = missingDefault
    ? cfg.defaultCategory
    : isCategoryId(rawDefault) && cfg.categories.includes(rawDefault)
      ? rawDefault
      : "";

  return (
    <div className="mcm-wt-editor" data-testid="widget-type-editor-unit-converter">
      <ContentStyle />
      <style href={UNIT_STYLE_HREF} precedence="default">
        {UNIT_CSS}
      </style>
      <FormGroup label="보일 분류" labelWidth={80} className="mcm-fg-block">
        <div>
          <div className="mcm-uc-edit__actions">
            <Button size="sm" disabled={selected.length === 0} onClick={() => onChange(changeUnitSelection(value, []))} data-testid="widget-unit-select-all">
              전체 선택
            </Button>
          </div>
          <div className="mcm-uc-edit__checks">
            {CATEGORIES.map((c) => (
              <div key={c.id} data-testid={`widget-unit-cat-${c.id}`}>
                <Checkbox
                  label={c.label}
                  checked={checked.includes(c.id)}
                  disabled={!isAll && checked.length === 1 && checked.includes(c.id)}
                  onChange={(on) => toggle(c.id, on)}
                />
              </div>
            ))}
          </div>
          <div className="mcm-wt-editor__note" data-testid="widget-unit-note">
            {isAll ? UNIT_EDITOR_ALL_NOTE : unitEditorCountNote(checked.length)}
          </div>
        </div>
      </FormGroup>
      <FormGroup label="기본 분류" labelWidth={80}>
        <Select
          value={defaultShown}
          options={cfg.categories.map((id) => ({ value: id, label: getCategory(id).label }))}
          placeholder="선택하세요"
          aria-label="기본 분류"
          onChange={(v) => {
            if (isCategoryId(v) && cfg.categories.includes(v)) onChange(buildUnitConfig(selected, v));
          }}
          data-testid="widget-unit-default"
        />
      </FormGroup>
    </div>
  );
}
