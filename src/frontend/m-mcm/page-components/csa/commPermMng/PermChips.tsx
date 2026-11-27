"use client";

/**
 * 퍼미션 칩 묶음 — shared ToggleChipGroup 에 이 화면의 칩 모습(ChipState)을 잇는 얇은 감싸개.
 *
 * shared 부품에 없는 두 가지는 칩 글자(label)로 메운다(부품 CSS 는 덮지 않는다):
 * - 오브젝트에서 빠진 값(D15): 끈 채 누를 수 없는 옵션 + 줄 그은 글자(<s>) + 설명.
 * - 버튼·팝업 코드 조회 조건에 걸린 값: 굵은 글자(.cpm-hit).
 * 조회 때와 다른 칩(추가·빠짐)은 부품의 baseValue 비교 모양을 그대로 쓴다.
 */
import { memo, useMemo } from "react";
import { ToggleChipGroup, type ToggleChipOption, type ToggleChipPreset } from "@dk-oasis/shared/toggle-chip-group";
import type { ChipState } from "./perm-chips";

const OUT_TITLE = "오브젝트에서 빠진 값 — 계산에서 빠집니다";

export interface PermChipsProps {
  chips: readonly ChipState[];
  /** 켜진 허용 값 목록(오브젝트 순서). 없으면 읽기 전용. */
  onChange?: (next: string[]) => void;
  presets?: readonly ToggleChipPreset[];
  ariaLabel: string;
  /** 그리드 칸: 한 줄로 두고 넘치는 칩은 칸이 자른다. */
  line?: boolean;
  emptyText?: string;
  testId?: string;
}

export const PermChips = memo(function PermChips({
  chips,
  onChange,
  presets,
  ariaLabel,
  line = false,
  emptyText = "-",
  testId,
}: PermChipsProps) {
  const { options, value, base, readOnly } = useMemo(() => {
    const opts: ToggleChipOption[] = chips.map((c) => ({
      value: c.code,
      // 줄 긋기·굵게는 눈으로만 보이므로 화면 읽기 프로그램용 숨은 글을 함께 둔다.
      label: c.out ? (
        <>
          <s>{c.code}</s>
          <span className="cpm-sr"> (오브젝트에서 빠진 값)</span>
        </>
      ) : c.hit ? (
        <>
          <b className="cpm-hit">{c.code}</b>
          <span className="cpm-sr"> (조건에 맞음)</span>
        </>
      ) : (
        c.code
      ),
      title: c.out ? OUT_TITLE : c.code,
      disabled: c.out,
    }));
    return {
      options: opts,
      value: chips.filter((c) => c.on).map((c) => c.code),
      // 조회 때 켜져 있던 값 = 지금 켜짐 XOR 바뀜(밖 값은 비교하지 않는다).
      base: chips.filter((c) => !c.out && c.on !== c.changed).map((c) => c.code),
      readOnly: chips.every((c) => c.disabled),
    };
  }, [chips]);

  if (chips.length === 0) return <span className="cpm-none">{emptyText}</span>;
  const group = (
    <ToggleChipGroup
      options={options}
      value={value}
      baseValue={base}
      onChange={onChange ?? noop}
      readOnly={readOnly || !onChange}
      presets={presets}
      size={line ? "xs" : "sm"}
      aria-label={ariaLabel}
      diffTitles={{ added: "저장하면 켜짐", removed: "저장하면 꺼짐" }}
      testId={testId}
    />
  );
  return line ? <span className="cpm-chipline">{group}</span> : group;
});

function noop() {}
