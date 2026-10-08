"use client";

/**
 * crontab 직접 입력 — 분·시·일·월·요일 다섯 칸을 따로 둔다. 칸마다 이름표·허용 범위·짧은 예를 보이고,
 * 잘못된 칸만 빨간 테두리와 그 칸의 오류 문구를 보인다. 어느 칸이든 식 통째(또는 @daily 같은 매크로)를 붙여 넣으면 다섯 칸으로 나뉜다.
 */
import { Input } from "../form";
import { CRON_FIELD_SPECS, splitExpression, validateFieldText } from "./cron";

export interface CronDirectEditorProps {
  /** 다섯 칸의 글자(비어 있을 수 있다). */
  fields: string[];
  onChange: (fields: string[]) => void;
  /** 일·요일을 함께 제한한 경우 두 칸을 함께 표시한다. */
  crossFieldError: boolean;
  disabled: boolean;
}

export function CronDirectEditor({ fields, onChange, crossFieldError, disabled }: CronDirectEditorProps) {
  const errors = fields.map((f, i) => validateFieldText(i, f));

  const handleChange = (index: number, text: string) => {
    if (/\s/.test(text.trim()) || text.trim().startsWith("@")) {
      const split = splitExpression(text);
      if (split) {
        onChange(split);
        return;
      }
    }
    onChange(fields.map((f, i) => (i === index ? text : f)));
  };

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "var(--spacing-xs)" }}
      data-testid="cron-direct-fields"
    >
      {CRON_FIELD_SPECS.map((spec, i) => {
        const invalid = errors[i] !== null || (crossFieldError && (i === 2 || i === 4));
        return (
          <div key={spec.label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <label htmlFor={`cron-field-${i}`} style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
              {spec.label}
            </label>
            <Input
              id={`cron-field-${i}`}
              value={fields[i] ?? ""}
              disabled={disabled}
              className={invalid ? "form-error" : ""}
              aria-invalid={invalid}
              placeholder="*"
              data-testid={`cron-field-${i}`}
              onChange={(v) => handleChange(i, v)}
            />
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{spec.range}</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>예 {spec.example.split(", ").join(" · ")}</span>
            {errors[i] ? (
              <span className="form-error-message" role="alert" style={{ fontSize: "var(--font-size-xs)" }}>
                {errors[i]}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
