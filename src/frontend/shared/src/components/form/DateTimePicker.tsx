"use client";

import { useId, type CSSProperties } from "react";
import { DateTimePicker as MantineDateTimePicker } from "@mantine/dates";
import clsx from "clsx";

/**
 * 트리거가 `<button>` 이라 `<input>` 전용 속성(`type`·`size`·`step` 등)은 받지 않는다.
 * `data-*` 는 전부 트리거 버튼에 그대로 실린다(`data-testid` 를 화면이 준다).
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

/** 서버/피커 공통 형식(`yyyy-MM-dd HH:mm:ss`)과 `datetime-local` 의 `T` 구분자. 초는 없어도 허용한다. */
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

/**
 * 날짜 + 시각 입력(24시간제, 초까지). `DatePicker`(`DateInput`)와 같은 문자열 계약이다.
 *
 * - 값은 문자열로 주고받는다: `onChange("2026-07-01 09:30:15")`. 빈 값은 `""`.
 * - 브라우저 기본 `datetime-local` 과 달리 OS 지역 설정을 따르지 않는다. 표시·값 모두 24시간제이고,
 *   시·분·초 세 칸(TimePicker)을 직접 고친다(기본 `12h` 아님).
 * - 트리거는 `<button role=combobox>` 이고, 눌러 달력+시간 패널이 열린다. 달력은 날짜를, 시간 칸은
 *   시·분·초를 고친다(Mantine `assignTime` 이 값을 `YYYY-MM-DD HH:mm:ss` 로 맞춘다).
 * - `min`·`max` 는 `DatePicker` 와 같이 날짜 경계(`minDate`/`maxDate`)로 넘어간다.
 * - 트리거 버튼에 `data-testid` 등 `data-*` 속성을 그대로 넘긴다.
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
  const pickerId = id || autoId;
  const errorId = `${pickerId}-error`;
  const resolvedAriaInvalid = externalAriaInvalid ?? !!error;
  const resolvedAriaDescribedBy = externalAriaDescribedBy ?? (error ? errorId : undefined);

  return (
    <MantineDateTimePicker
      id={pickerId}
      name={name}
      value={DATE_TIME.test(value ?? "") ? (value as string) : null}
      onChange={(v) => onChange?.(v ?? "")}
      valueFormat="YYYY-MM-DD HH:mm:ss"
      // 24시간제(TimePicker 기본값이지만 명시한다) + 초 입력. 시·분·초 칸에 스크린리더 이름을 준다.
      withSeconds
      timePickerProps={{ format: "24h", hoursInputLabel: "시", minutesInputLabel: "분", secondsInputLabel: "초" }}
      // 적용 시작 일시는 보통 미래라서 달력을 몇 달씩 넘겨 봐야 한다. 연·월 네이티브 select 로 한 번에 옮긴다.
      withNativeLevelSelect
      placeholder={placeholder ?? "YYYY-MM-DD HH:mm:ss"}
      title={title ?? "YYYY-MM-DD HH:mm:ss"}
      clearable
      disabled={disabled}
      readOnly={readOnly}
      minDate={min ? String(min) : undefined}
      maxDate={max ? String(max) : undefined}
      style={style}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      error={
        error ? (
          <span id={errorId} className="form-error-message" role="alert">
            {error}
          </span>
        ) : undefined
      }
      // Mantine InputBase 는 자신의 error prop 으로만 aria-invalid/aria-describedby 를 계산해 부모(FormGroup
      // 등)가 주입한 값을 덮어써 버린다(Input.tsx·DatePicker.tsx 절 참고). 여기서도 attributes.input 으로
      // 첫 페인트부터 최종값을 강제한다.
      attributes={{
        input: {
          "aria-invalid": resolvedAriaInvalid ? "true" : "false",
          ...(resolvedAriaDescribedBy ? { "aria-describedby": resolvedAriaDescribedBy } : {}),
        },
      }}
      classNames={{ input: clsx("form-datepicker", "form-datetimepicker", error && "form-error", className) }}
      {...rest}
    />
  );
}
