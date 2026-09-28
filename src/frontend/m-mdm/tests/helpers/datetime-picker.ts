// 확정 화면 시험 공용 — `DateTimePicker`(shared/form) 조작 도우미.
//
// 희망 적용 시작 일시는 브라우저 기본 `datetime-local` 이 아니라 달력 + 시·분·초 칸(24시간제)이다.
// 화면 사용자가 하듯 트리거를 눌러 패널을 열고, 연·월 select 로 달력을 옮기고, 날짜를 고른 뒤
// 시·분·초를 직접 넣어 onChange 를 통과시킨다(`onChange("yyyy-MM-dd HH:mm:ss")`).

import { act } from "react";

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** 네이티브 setter 로 값을 넣는다 — React 의 값 추적을 우회해야 onChange 가 뜬다. */
function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
}

function dropdown(): HTMLElement {
  const el = document.body.querySelector("[data-dates-dropdown]");
  if (!el) throw new Error("DateTimePicker 패널이 열려 있지 않습니다");
  return el as HTMLElement;
}

function timeInput(label: string): HTMLInputElement {
  const el = dropdown().querySelector(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`시간 칸(${label})이 없습니다`);
  return el as HTMLInputElement;
}

/**
 * `DateTimePicker` 트리거(testid 를 돌려주는 함수)에 `yyyy-MM-dd HH:mm:ss` 값을 넣는다.
 * 트리거는 진짜 `<input>` 이라 직접 치는 것도 되지만(시험 대상), 여기서는 달력 + 시·분·초 칸을 조작해
 * 화면 사용자가 고르는 경로를 태운다.
 */
export async function pickDateTime(trigger: () => HTMLElement, value: string): Promise<void> {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`pickDateTime 은 "yyyy-MM-dd HH:mm:ss" 를 받는다: ${value}`);
  const [, year, month, day, hours, minutes, seconds] = m;

  await act(async () => {
    trigger().click();
  });
  await settle();

  // 연 → 월 순서로 옮긴다(달력 헤더의 네이티브 select).
  for (const [which, v] of [["year", year], ["month", String(Number(month) - 1)]] as const) {
    const sel = dropdown().querySelector(`select[data-select="${which}"]`) as HTMLSelectElement | null;
    if (!sel) throw new Error(`달력의 ${which} select 이 없습니다`);
    if (!Array.from(sel.options).some((o) => o.value === v)) {
      throw new Error(`달력 ${which} select 에 ${v} 가 없습니다 — Mantine 기본 범위는 (올해-100) ~ (올해+50) 입니다`);
    }
    await act(async () => {
      setNativeValue(sel, v);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  // 해당 월의 그 날짜 — 앞뒤 달 spillover 칸(data-outside)은 제외한다.
  const dayCell = Array.from(dropdown().querySelectorAll("button"))
    .find((b) => b.textContent?.trim() === String(Number(day)) && !b.hasAttribute("data-outside"));
  if (!dayCell) throw new Error(`달력에 ${day} 일이 없습니다`);
  await act(async () => {
    (dayCell as HTMLElement).click();
  });
  await settle();

  for (const [label, v] of [["시", hours], ["분", minutes], ["초", seconds]] as const) {
    const input = timeInput(label);
    await act(async () => {
      setNativeValue(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
  }

  // Escape 로 패널을 닫는다(입력 칸에 되돌린 뒤 닫힌다).
  await act(async () => {
    trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await settle();
}
