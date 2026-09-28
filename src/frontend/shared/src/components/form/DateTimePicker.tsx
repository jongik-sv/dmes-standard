"use client";

import { useCallback, useEffect, useId, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from "react";
import { Input, Popover } from "@mantine/core";
import { InlineDateTimePicker } from "@mantine/dates";
import clsx from "clsx";

/**
 * 트리거가 `<input>` 이라 `<button>` 전용·`type`·`size` 같은 속성은 받지 않는다.
 * `data-*` 는 전부 입력 칸에 그대로 실린다(`data-testid` 를 화면이 준다).
 */
export interface DateTimePickerProps {
  /** 값(`yyyy-MM-dd HH:mm:ss`). 빈 값은 `""`. */
  value?: string;
  /** 고른 값. 해제하면 `""`. */
  onChange?: (value: string) => void;
  error?: string;
  id?: string;
  /** 숨은 input 의 name(hidden input 으로 폼에 실린다). */
  name?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** 빈 값일 때 보여줄 문구. 기본 `YYYY-MM-DD HH:mm:ss`. */
  placeholder?: string;
  title?: string;
  /** 고를 수 있는 날짜의 하한·상한(`yyyy-MM-dd`). `DatePicker` 와 같은 이름으로 받는다. */
  min?: string;
  max?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  [key: `data-${string}`]: string | number | boolean | undefined;
}

/** `yyyy-MM-dd HH:mm:ss`(구분자는 공백 또는 `T`). 초는 있어야 한다 — 화면 표기와 같게. */
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month !== 2) return DAYS_IN_MONTH[month - 1];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

/**
 * 입력 문자열을 서버/피커 공통 형식 `yyyy-MM-dd HH:mm:ss`(KST 벽시계 그대로)로 읽는다.
 * 분기값·존재하지 않는 날짜·범위 밖 시각은 null 이다(아래 `DatePicker` 와 같이 조용히 버린다).
 */
export function parseDateTime(text: string | null | undefined): string | null {
  const m = DATE_TIME.exec((text ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${y}-${mo}-${d} ${hh}:${mm}:${ss}`;
}

/** 값 → 입력 칸에 보이는 글자. 해석되는 값은 정규화하고, 그렇지 않으면 빈 칸으로 둔다. */
function toInputText(value: string | null | undefined): string {
  return parseDateTime(value) ?? "";
}

/**
 * 날짜 + 시각 입력(24시간제, 초까지). `DatePicker`(`DateInput`)와 같은 문자열 계약이다.
 *
 * - 값은 문자열로 주고받는다: `onChange("2026-07-01 09:30:15")`. 빈 값은 `""`.
 * - 브라우저 기본 `datetime-local` 과 달리 OS 지역 설정을 따르지 않는다. 표시·값 모두 24시간제이고,
 *   시·분·초 세 칸(TimePicker)을 직접 고친다(기본 `12h` 아님).
 * - 입력 칸이 진짜 `<input>` 이다. `yyyy-MM-dd HH:mm:ss` 를 직접 치거나 붙여 넣으면 곧바로 값이 되고,
 *   해석되지 않는 글자(빈 값·`2026-13-01`·`25:00:00` 등)는 포커스를 벗어날 때 원래 값으로 되돌린다
 *   (`DateInput` 의 `fixOnBlur` 와 같은 처리다). Enter 는 확정 + 닫기, Escape 는 되돌리고 닫기.
 * - 입력 칸을 누르면 달력 + 시·분·초 패널이 열린다. 달력은 날짜를, 시간 칸은 시·분·초를 고친다
 *   (Mantine `assignTime` 이 값을 `yyyy-MM-dd HH:mm:ss` 로 맞춘다).
 * - `min`·`max` 는 `DatePicker` 와 같이 날짜 경계(`minDate`/`maxDate`)로 넘어간다.
 */
export function DateTimePicker({
  id,
  value = "",
  onChange,
  disabled = false,
  className = "",
  style,
  min,
  max,
  readOnly = false,
  placeholder,
  title,
  name,
  error,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-invalid": externalAriaInvalid,
  "aria-describedby": externalAriaDescribedBy,
  ...rest
}: DateTimePickerProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const errorId = `${inputId}-error`;
  const resolvedAriaInvalid = externalAriaInvalid ?? !!error;
  const resolvedAriaDescribedBy = externalAriaDescribedBy ?? (error ? errorId : undefined);
  const errorNode = error ? (
    <span id={errorId} className="form-error-message" role="alert">
      {error}
    </span>
  ) : undefined;

  const [text, setText] = useState(() => toInputText(value));
  const [opened, setOpened] = useState(false);

  // 값이 바뀌면(달력·시간 칸·바깥에서) 입력 칸 글자를 맞춘다. 해석되는 입력이 곧바로 값을 바꾸므로
  // 치는 중에는 이 effects 가 돌지 않아 글자를 가로채지 않는다.
  useEffect(() => {
    setText(toInputText(value));
  }, [value]);

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value;
    setText(next);
    const parsed = parseDateTime(next);
    // 빈 칸은 해제다. 그 외에는 형식이 맞을 때만 값을 바꾼다.
    if (parsed) onChange?.(parsed);
    else if (next.trim() === "") onChange?.("");
  }, [onChange]);

  /** Enter 나 패널의 확인(✓) — 읽을 수 없는 글자는 원래 값으로 되돌리고(`fixOnBlur`) 닫는다. */
  const commit = useCallback(() => {
    setText(toInputText(value));
    setOpened(false);
  }, [value]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "Escape") {
      // Enter 든 Escape 든 읽을 수 없는 글자는 원래 값으로 되돌리고 닫는다.
      event.preventDefault();
      commit();
    } else if (event.key === "ArrowDown" && !opened) {
      event.preventDefault();
      setOpened(true);
    }
  }, [commit, opened]);

  return (
    <Input.Wrapper id={inputId} size="sm" error={errorNode}>
      <Popover
        opened={opened}
        onChange={(next) => setOpened(next)}
        position="bottom-start"
        disabled={readOnly || disabled}
        withRoles={false}
      >
        <Popover.Target>
          <Input
            data-dates-input
            data-read-only={readOnly || undefined}
            autoComplete="off"
            name={name}
            value={text}
            onChange={handleInputChange}
            onFocus={() => setOpened(true)}
            // 포커스를 잃는다고 닫지 않는다 — 달력·시간 칸을 누르면 입력 칸에서 포커스가 빠져 그 때문이다.
            // 닫는 것은 바깥 클릭(Mantine 기본)·Escape·Enter·패널의 ✓ 가 맡는다.
            onBlur={() => setText(toInputText(value))}
            onClick={() => setOpened(true)}
            onKeyDown={handleKeyDown}
            readOnly={readOnly}
            disabled={disabled}
            error={errorNode}
            placeholder={placeholder ?? "YYYY-MM-DD HH:mm:ss"}
            title={title ?? "YYYY-MM-DD HH:mm:ss"}
            style={style}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            // Mantine InputBase 는 자신의 error prop 으로만 aria-invalid/aria-describedby 를 계산해 부모(FormGroup
            // 등)가 주입한 값을 덮어써 버린다(Input.tsx·DatePicker.tsx 절 참고). 여기서도 attributes.input 으로
            // 첫 페인트부터 최종값을 강제한다.
            attributes={{
              input: {
                "aria-invalid": resolvedAriaInvalid ? "true" : "false",
                ...(resolvedAriaDescribedBy ? { "aria-describedby": resolvedAriaDescribedBy } : {}),
              },
            }}
            __clearSection={
              <Input.ClearButton
                onClick={() => {
                  onChange?.("");
                  setText("");
                  setOpened(false);
                }}
                aria-label="지우기"
              />
            }
            __clearable={!readOnly && !disabled && parseDateTime(value) !== null}
            __clearSectionMode="clear"
            classNames={{ input: clsx("form-datepicker", "form-datetimepicker", error && "form-error", className) }}
            {...rest}
          />
        </Popover.Target>
        <Popover.Dropdown data-dates-dropdown>
          <InlineDateTimePicker
            value={parseDateTime(value)}
            onChange={(next) => onChange?.(next ?? "")}
            // 드롭다운(Popover)은 기본 폭이 `max-content`(내용에 붙는)이다. 달력 `<table>` 은
            // `table-layout: fixed` 이고 `fullWidth` 면 `width: 100%` 를 받는데(설치된 CSS 의
            // `[data-full-width]{width:100%}`), 100% 를 max-content 상자 안에서 재면 상자와 표가 서로를
            // 재는 순환이 되어 Chromium 이 폭을 끝없이 키운다(실측 666693px). Mantine 자체
            // `DateTimePicker` 도 그래서 여기에 `fullWidth: false` 를 명시한다 — 같은 값을 그대로 준다.
            fullWidth={false}
            withSeconds
            timePickerProps={{
              format: "24h",
              hoursInputLabel: "시",
              minutesInputLabel: "분",
              secondsInputLabel: "초",
            }}
            // 적용 시작 일시는 보통 미래라서 달력을 몇 달씩 넘겨 봐야 한다. 연·월 네이티브 select 로 한 번에 옮긴다.
            withNativeLevelSelect
            minDate={min || undefined}
            maxDate={max || undefined}
            onSubmit={commit}
          />
        </Popover.Dropdown>
      </Popover>
    </Input.Wrapper>
  );
}
