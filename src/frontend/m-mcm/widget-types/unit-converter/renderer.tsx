"use client";

/**
 * 단위 계산기 렌더러 — 길이·무게·면적·부피·온도·압력·힘·속도·에너지 환산(서버 호출 없음).
 * - 위쪽 분류 선택: 보일 분류가 5개 이상이면 Select, 2~4개면 SegmentedControl, 1개면 이름만 보인다.
 * - 값 입력 + 「변환 전」 단위, [⇄] 로 두 단위를 맞바꾸고(결과를 입력으로 잇는다), 결과 + 「변환 후」 단위. 결과는 입력 즉시 바뀐다.
 *   입력으로 잇는 값은 반올림하지 않은 정밀 값(유효숫자 17자리)이고 화면 결과만 10자리로 보인다. 입력을 고치지 않고 [⇄] 를 다시 누르면
 *   직전 입력·단위를 그대로 되돌린다(긴 소수가 입력 칸에 남지 않는다).
 * - 아래 목록은 같은 값을 분류의 모든 단위로 환산한 것. 줄을 누르면 그 단위가 「변환 후」 단위가 된다. 목록 부분만 스크롤한다.
 * - 마지막으로 고른 분류·단위·입력값은 사용자·위젯 인스턴스별로 이 브라우저에 기억한다(use-unit-state.ts·unit-storage.ts). 미리보기·인스턴스 없음·사용자를 모르면 기억하지 않는다.
 * - 좁은 본문(< 300px)에서는 값 칸이 한 줄을 다 쓰고 단위 선택칸이 그 아래로 쌓인다(컨테이너 쿼리, unit-styles.ts).
 * 계산·서식·설정 읽기는 순수 모듈(units·unit-format·unit-model)이 맡는다.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconArrowsUpDown, IconCheck, IconCopy } from "@tabler/icons-react";
import { Button, copyText, Input, SegmentedControl, Select } from "@dk-oasis/shared/form";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import {
  computeView,
  readUnitConfig,
  resolveCategory,
  resolveUnits,
  UNIT_ABSOLUTE_ZERO_WARNING,
  type UnitPair,
} from "./unit-model";
import { MAX_INPUT_LENGTH } from "./unit-format";
import { UNIT_CSS, UNIT_STYLE_HREF } from "./unit-styles";
import { getCategory, isCategoryId, type CategoryDef, type CategoryId } from "./units";
import { useUnitState } from "./use-unit-state";

/** 이 개수 이하의 분류는 SegmentedControl, 넘으면 Select. */
const SEGMENTED_MAX = 4;
const COPIED_MS = 1200;
const COPIED_NOTICE = "복사했습니다";

/** [⇄] 직전 상태 — 입력을 고치지 않고 다시 누르면 이것으로 되돌린다. */
interface SwapMemo {
  category: CategoryId;
  text: string;
  pair: UnitPair;
}

function UnitStyle() {
  return (
    <style href={UNIT_STYLE_HREF} precedence="default">
      {UNIT_CSS}
    </style>
  );
}

export default function UnitConverterRenderer({ definition, widgetId, instanceId }: WidgetProps) {
  const cfg = useMemo(() => readUnitConfig(definition), [definition]);
  const [state, update] = useUnitState(cfg, widgetId, instanceId);
  const resultId = useId();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swapMemo = useRef<SwapMemo | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

  // 설정이 바뀌어도(관리 화면 미리보기) 상태를 고쳐 쓰지 않고 그때그때 보일 분류·단위를 맞춘다.
  const category = resolveCategory(state.category, cfg);
  const cat = getCategory(category);
  const { from, to } = resolveUnits(category, state.units[category]);
  const view = computeView(state.text, category, from, to);

  // 상태의 분류는 사용자가 분류를 고를 때만 바꾼다 — 설정에서 빠진 분류를 기억하고 있어도 단위·입력을 고치다가 덮지 않는다.
  const setText = (text: string) => {
    swapMemo.current = null;
    update((s) => ({ ...s, text }));
  };

  const setCategory = (id: string) => {
    swapMemo.current = null;
    if (isCategoryId(id) && cfg.categories.includes(id)) update((s) => ({ ...s, category: id }));
  };

  const setPair = (patch: Partial<UnitPair>) => {
    swapMemo.current = null;
    update((s) => ({
      ...s,
      units: { ...s.units, [category]: { ...resolveUnits(category, s.units[category]), ...patch } },
    }));
  };

  /**
   * 두 단위를 맞바꾸고, 숫자 결과가 있으면 그 값(반올림하지 않은 17자리 정밀 값)을 입력으로 잇는다 — 화면 결과만 10자리로 보인다.
   * 입력·단위·분류를 고치지 않은 채 다시 누르면 직전 입력·단위를 그대로 되돌린다.
   */
  const swap = () => {
    const memo = swapMemo.current;
    swapMemo.current = null;
    if (memo && memo.category === category) {
      update((s) => ({ ...s, units: { ...s.units, [category]: memo.pair }, text: memo.text }));
      return;
    }
    swapMemo.current = { category, text: state.text, pair: { from, to } };
    update((s) => ({
      ...s,
      units: { ...s.units, [category]: { from: to, to: from } },
      text: view.ok && view.exactText ? view.exactText : s.text,
    }));
  };

  const copy = async () => {
    if (!view.ok) return;
    let ok = false;
    try {
      ok = await copyText(view.plainText);
    } catch {
      ok = false; // 클립보드가 막혀도 조용히 넘어간다
    }
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const categoryDefs = cfg.categories.map((id) => getCategory(id));
  const unitOptions = cat.units.map((u) => ({ value: u.id, label: u.label }));
  /** 빈 입력은 잘못된 입력이 아니다(「숫자를 입력하세요」 안내만). */
  const inputInvalid = !view.ok && view.problem !== "empty";

  return (
    <div className="mcm-uc" data-testid="widget-unit-converter">
      <UnitStyle />
      <div className="mcm-uc__cat">
        <CategoryPicker defs={categoryDefs} value={category} onChange={setCategory} />
      </div>

      <div className="mcm-uc__conv">
        <div className="mcm-uc__value">
          <Input
            value={state.text}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_INPUT_LENGTH}
            aria-label="변환할 값"
            aria-invalid={inputInvalid}
            aria-describedby={view.ok ? undefined : resultId}
            onChange={setText}
            data-testid="unit-input"
          />
        </div>
        <div className="mcm-uc__from">
          <Select
            value={from}
            options={unitOptions}
            aria-label="변환 전 단위"
            onChange={(v) => setPair({ from: v })}
            data-testid="unit-from"
          />
        </div>
        <Button
          size="sm"
          ariaLabel="단위 바꾸기"
          title="단위 바꾸기"
          className="mcm-uc__swap"
          onClick={swap}
          data-testid="unit-swap"
        >
          <IconArrowsUpDown size={14} aria-hidden="true" />
        </Button>
        <div className="mcm-uc__result" data-testid="unit-result-box">
          <span
            id={resultId}
            className={view.ok ? "mcm-uc__result-text" : "mcm-uc__result-text mcm-uc__result-text--msg"}
            role="status"
            aria-live="polite"
            title={view.ok ? view.resultText : undefined}
            data-testid="unit-result"
          >
            {view.resultText}
          </span>
          <Button
            size="mini"
            ariaLabel="결과 복사"
            title="결과 복사"
            className="mcm-uc__copy"
            disabled={!view.ok}
            onClick={() => void copy()}
            data-testid="unit-copy"
          >
            {copied ? <IconCheck size={13} aria-hidden="true" /> : <IconCopy size={13} aria-hidden="true" />}
          </Button>
          <span className="mcm-uc__sr" role="status" data-testid="unit-copy-notice">
            {copied ? COPIED_NOTICE : ""}
          </span>
        </div>
        <div className="mcm-uc__to">
          <Select
            value={to}
            options={unitOptions}
            aria-label="변환 후 단위"
            onChange={(v) => setPair({ to: v })}
            data-testid="unit-to"
          />
        </div>
      </div>

      {view.belowAbsoluteZero && (
        <div className="mcm-uc__warn" role="status" data-testid="unit-warn">
          {UNIT_ABSOLUTE_ZERO_WARNING}
        </div>
      )}

      <ul className="mcm-uc__list" role="list" aria-label={`${cat.label} 단위별 환산`} data-testid="unit-list">
        {view.rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="mcm-uc__row"
              aria-pressed={row.id === to}
              onClick={() => setPair({ to: row.id })}
              data-testid={`unit-row-${row.id}`}
            >
              <span className="mcm-uc__row-unit">{row.label}</span>
              <span className="mcm-uc__row-val">{row.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CategoryPickerProps {
  defs: readonly CategoryDef[];
  value: string;
  onChange: (id: string) => void;
}

/** 분류 선택 — 1개면 이름만, 2~4개면 세그먼트, 5개 이상이면 Select. */
function CategoryPicker({ defs, value, onChange }: CategoryPickerProps) {
  if (defs.length <= 1) {
    return (
      <span className="mcm-uc__cat-caption" data-testid="unit-category">
        {defs[0]?.label}
      </span>
    );
  }
  const options = defs.map((d) => ({ value: d.id, label: d.label }));
  if (defs.length <= SEGMENTED_MAX) {
    return <SegmentedControl value={value} options={options} onChange={onChange} ariaLabel="분류" fullWidth testId="unit-category" />;
  }
  return <Select value={value} options={options} aria-label="분류" onChange={onChange} data-testid="unit-category" />;
}
