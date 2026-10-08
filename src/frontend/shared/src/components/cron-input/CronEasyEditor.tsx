"use client";

/**
 * crontab 쉬운 설정 — 반복 종류를 고르면 그 종류에 필요한 칸만 나온다.
 * CronInput 의 일부이며 공통 컴포넌트로 옮길 때 함께 간다. 값 ↔ 식 변환은 cron.ts(buildCron·toEasy)가 맡는다.
 */
import type { CSSProperties, ReactNode } from "react";
import { Button, Checkbox, Input, Select } from "../form";
import { DOW_KO, EASY_INTERVALS, EASY_KIND_LABEL, easyNotice, type EasyConfig, type EasyKind } from "./cron";

const KIND_OPTIONS = (Object.keys(EASY_KIND_LABEL) as EasyKind[]).map((k) => ({ value: k, label: EASY_KIND_LABEL[k] }));
const INTERVAL_OPTIONS = EASY_INTERVALS.map((n) => ({ value: String(n), label: `${n}분` }));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => ({ value: String(i), label: `${i}분` }));
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${i}시` }));

/** 월~일 순서로 보이고 값은 crontab 요일(일=0). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

const ROW: CSSProperties = { display: "flex", alignItems: "flex-start", gap: "var(--spacing-sm)" };
const LABEL: CSSProperties = {
  flex: "0 0 76px",
  paddingTop: 5,
  color: "var(--color-text-secondary)",
  fontSize: "var(--font-size-sm)",
};
const HINT: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={ROW}>
      <span style={LABEL}>{label}</span>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>{children}</div>
    </div>
  );
}

const same = (a: number[], b: number[]) => a.length === b.length && b.every((v) => a.includes(v));

function WeekdayPicker({ value, onChange, disabled, optional }: { value: number[]; onChange: (v: number[]) => void; disabled: boolean; optional: boolean }) {
  const toggle = (d: number) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)" }} role="group" aria-label="요일">
        {WEEK_ORDER.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={value.includes(d) ? "primary" : "default"}
            disabled={disabled}
            aria-pressed={value.includes(d)}
            style={{ minWidth: 34 }}
            data-testid={`cron-dow-${d}`}
            onClick={() => toggle(d)}
          >
            {DOW_KO[d]}
          </Button>
        ))}
        <Button size="sm" disabled={disabled} variant={same(value, WEEKDAYS) ? "primary" : "default"} onClick={() => onChange([...WEEKDAYS])}>
          평일
        </Button>
        <Button size="sm" disabled={disabled} variant={same(value, WEEKEND) ? "primary" : "default"} onClick={() => onChange([...WEEKEND])}>
          주말
        </Button>
        {optional ? (
          <Button size="sm" disabled={disabled || value.length === 0} onClick={() => onChange([])}>
            해제
          </Button>
        ) : null}
      </div>
      {optional ? <span style={HINT}>고르지 않거나 모두 고르면 요일 제한이 없습니다.</span> : null}
    </>
  );
}

function HourLimit({ e, onChange, disabled }: { e: EasyConfig; onChange: (p: Partial<EasyConfig>) => void; disabled: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
      <Checkbox label="시간대 제한" checked={e.limitHours} disabled={disabled} onChange={(on) => onChange({ limitHours: on })} />
      {e.limitHours ? (
        <>
          <div style={{ width: 84 }}>
            <Select value={String(e.hourFrom)} options={HOUR_OPTIONS} disabled={disabled} aria-label="시작 시" onChange={(v) => onChange({ hourFrom: Number(v) })} />
          </div>
          <span>부터</span>
          <div style={{ width: 84 }}>
            <Select value={String(e.hourTo)} options={HOUR_OPTIONS} disabled={disabled} aria-label="끝 시" onChange={(v) => onChange({ hourTo: Number(v) })} />
          </div>
          <span>까지</span>
        </>
      ) : null}
    </div>
  );
}

function TimeList({ e, onChange, disabled }: { e: EasyConfig; onChange: (p: Partial<EasyConfig>) => void; disabled: boolean }) {
  const setAt = (i: number, v: string) => onChange({ times: e.times.map((t, idx) => (idx === i ? v : t)) });
  const add = () => {
    const last = e.times[e.times.length - 1];
    const m = /^(\d{1,2}):(\d{2})$/.exec(last ?? "");
    const next = m ? `${String(Math.min(23, Number(m[1]) + 1)).padStart(2, "0")}:${m[2]}` : "09:00";
    onChange({ times: [...e.times, next] });
  };
  return (
    <>
      {e.times.map((t, i) => (
        // 시각 칸은 목록 위치가 곧 식별이다(같은 시각을 두 번 넣어도 하나로 합쳐진다).
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)" }}>
          <div style={{ width: 120 }}>
            <Input type="time" value={t} disabled={disabled} aria-label={`시각 ${i + 1}`} onChange={(v) => setAt(i, v)} />
          </div>
          <Button size="sm" disabled={disabled || e.times.length <= 1} onClick={() => onChange({ times: e.times.filter((_, idx) => idx !== i) })}>
            삭제
          </Button>
        </div>
      ))}
      <div>
        <Button size="sm" disabled={disabled} onClick={add} data-testid="cron-time-add">
          시각 추가
        </Button>
      </div>
    </>
  );
}

function DayPicker({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled: boolean }) {
  const toggle = (d: number) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 40px)", gap: "var(--spacing-xs)" }} role="group" aria-label="날짜">
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <Button
          key={d}
          size="mini"
          style={{ width: 40, paddingInline: 0 }}
          variant={value.includes(d) ? "primary" : "default"}
          disabled={disabled}
          aria-pressed={value.includes(d)}
          data-testid={`cron-day-${d}`}
          onClick={() => toggle(d)}
        >
          {d}
        </Button>
      ))}
    </div>
  );
}

export interface CronEasyEditorProps {
  easy: EasyConfig;
  onChange: (patch: Partial<EasyConfig>) => void;
  /** buildCron 오류(있으면 식을 만들 수 없는 상태). */
  error: string | null;
  disabled: boolean;
}

export function CronEasyEditor({ easy: e, onChange, error, disabled }: CronEasyEditorProps) {
  const notice = easyNotice(e);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" }}>
      <Field label="반복">
        <div style={{ width: 160 }}>
          <Select value={e.kind} options={KIND_OPTIONS} disabled={disabled} aria-label="반복" onChange={(v) => onChange({ kind: v as EasyKind })} />
        </div>
      </Field>

      {e.kind === "everyMinute" ? <span style={HINT}>매분 실행합니다.</span> : null}

      {e.kind === "everyNMinutes" ? (
        <>
          <Field label="간격">
            <div style={{ width: 110 }}>
              <Select value={String(e.interval)} options={INTERVAL_OPTIONS} disabled={disabled} aria-label="간격" onChange={(v) => onChange({ interval: Number(v) })} />
            </div>
          </Field>
          <Field label="시간대">
            <HourLimit e={e} onChange={onChange} disabled={disabled} />
          </Field>
          <Field label="요일">
            <WeekdayPicker value={e.weekdays} onChange={(weekdays) => onChange({ weekdays })} disabled={disabled} optional />
          </Field>
        </>
      ) : null}

      {e.kind === "hourly" ? (
        <>
          <Field label="몇 분에">
            <div style={{ width: 110 }}>
              <Select value={String(e.minute)} options={MINUTE_OPTIONS} disabled={disabled} aria-label="몇 분에" onChange={(v) => onChange({ minute: Number(v) })} />
            </div>
          </Field>
          <Field label="시간대">
            <HourLimit e={e} onChange={onChange} disabled={disabled} />
          </Field>
          <Field label="요일">
            <WeekdayPicker value={e.weekdays} onChange={(weekdays) => onChange({ weekdays })} disabled={disabled} optional />
          </Field>
        </>
      ) : null}

      {e.kind === "daily" ? (
        <>
          <Field label="시각">
            <TimeList e={e} onChange={onChange} disabled={disabled} />
          </Field>
          <Field label="요일">
            <WeekdayPicker value={e.weekdays} onChange={(weekdays) => onChange({ weekdays })} disabled={disabled} optional />
          </Field>
        </>
      ) : null}

      {e.kind === "weekly" ? (
        <>
          <Field label="요일">
            <WeekdayPicker value={e.weekdays} onChange={(weekdays) => onChange({ weekdays })} disabled={disabled} optional={false} />
          </Field>
          <Field label="시각">
            <TimeList e={e} onChange={onChange} disabled={disabled} />
          </Field>
        </>
      ) : null}

      {e.kind === "monthly" ? (
        <>
          <Field label="날짜">
            <DayPicker value={e.days} onChange={(days) => onChange({ days })} disabled={disabled} />
          </Field>
          <Field label="시각">
            <TimeList e={e} onChange={onChange} disabled={disabled} />
          </Field>
        </>
      ) : null}

      {notice ? (
        <span role="status" style={HINT}>
          {notice}
        </span>
      ) : null}
      {error ? (
        <span className="form-error-message" role="alert" data-testid="cron-easy-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
