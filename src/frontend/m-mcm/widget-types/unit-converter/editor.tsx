"use client";

/**
 * 단위 계산기 편집기 — 「보일 분류」 체크 목록(전체 선택·해제)과 「기본 분류」 선택(보일 분류 안에서만).
 * 아무것도 고르지 않으면 전체 분류를 보인다. 체크를 바꾸면 알려진 분류만 표 순서로 올리고, 기본 분류가 보일 분류 밖으로 나가면
 * 첫 분류(length 가 있으면 length)로 맞춘다 — 그래서 편집기로는 틀린 설정을 만들 수 없고, 밖에서 들어온 틀린 값(모르는 분류 id 등)은
 * 검사 오류(onValidate)로 알린다. 오류 문구는 관리 화면이 목록으로 보인다. 미리보기는 관리 화면 미리보기가 맡는다.
 */
import { Button, Checkbox, FormGroup, Select } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { useReportErrors } from "../_content/hooks";
import { ContentStyle } from "../_content/styles";
import {
  buildUnitConfig,
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
  /** 체크된 분류(알려진 id 만, 표 순서). 비어 있으면 「전체」. */
  const selected = readUnitSelection(value);
  useReportErrors(validateUnitConfig(value), onValidate);

  const emit = (next: readonly CategoryId[]) => onChange(buildUnitConfig(next, cfg.defaultCategory));

  const toggle = (id: CategoryId, checked: boolean) => emit(checked ? [...selected, id] : selected.filter((c) => c !== id));

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
            <Button size="sm" disabled={selected.length === CATEGORY_IDS.length} onClick={() => emit(CATEGORY_IDS)} data-testid="widget-unit-select-all">
              전체 선택
            </Button>
            <Button size="sm" disabled={selected.length === 0} onClick={() => emit([])} data-testid="widget-unit-select-none">
              전체 해제
            </Button>
          </div>
          <div className="mcm-uc-edit__checks">
            {CATEGORIES.map((c) => (
              <div key={c.id} data-testid={`widget-unit-cat-${c.id}`}>
                <Checkbox label={c.label} checked={selected.includes(c.id)} onChange={(checked) => toggle(c.id, checked)} />
              </div>
            ))}
          </div>
          <div className="mcm-wt-editor__note" data-testid="widget-unit-note">
            {selected.length === 0 ? UNIT_EDITOR_ALL_NOTE : unitEditorCountNote(selected.length)}
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
