/**
 * crontab 식 입력 칸 — 식 입력 + 자주 쓰는 식 고르기 + 사람이 읽는 설명 + 다음 예정 5개.
 * 업무에 묶이지 않는 부품이라 나중에 @dk-oasis/shared 공통 컴포넌트로 옮길 후보다(설계 문서 §8).
 * 화면 전용 값을 props 로만 받고, 색은 의미 토큰만 쓴다.
 */
import { useMemo } from "react";
import { Input, Select } from "@dk-oasis/shared/form";
import { CRON_PRESETS, describeCron, formatWithDow, parseCron, runTimes, validateCron } from "./cron";

export interface CronInputProps {
  /** crontab 5칸 식. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** 실행 간격 하한(분). 주면 더 짧은 식은 오류로 보인다. */
  minGapMin?: number;
  /** 보여 줄 다음 예정 개수. 기본 5. */
  previewCount?: number;
}

export function CronInput({ value, onChange, disabled = false, minGapMin, previewCount = 5 }: CronInputProps) {
  const error = useMemo(() => validateCron(value, minGapMin), [value, minGapMin]);
  const description = useMemo(() => describeCron(value), [value]);
  const next = useMemo(() => {
    const parsed = parseCron(value);
    return parsed.ok ? runTimes(parsed.cron, new Date(), previewCount) : [];
  }, [value, previewCount]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <Input
            value={value}
            disabled={disabled}
            placeholder="분 시 일 월 요일  예: 0 2 * * *"
            aria-label="crontab 식"
            error={error ?? undefined}
            onChange={onChange}
          />
        </div>
        <div style={{ flex: "0 0 190px" }}>
          <Select
            value=""
            options={CRON_PRESETS}
            placeholder="자주 쓰는 식 고르기"
            disabled={disabled}
            aria-label="자주 쓰는 식"
            onChange={(v) => {
              if (v) onChange(v);
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: "var(--font-size-sm)" }} role="status">
        <span style={{ color: "var(--color-text-muted)" }}>일정 설명 </span>
        <strong>{error ? "-" : description}</strong>
        <span style={{ color: "var(--color-text-muted)" }}> · Asia/Seoul</span>
      </div>
      <div style={{ fontSize: "var(--font-size-sm)" }}>
        <div style={{ color: "var(--color-text-muted)", marginBottom: 2 }}>다음 예정 {previewCount}개</div>
        {next.length > 0 ? (
          <ol style={{ margin: 0, paddingLeft: "var(--spacing-lg)" }}>
            {next.map((d) => (
              <li key={d.getTime()}>{formatWithDow(d)}</li>
            ))}
          </ol>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>{error ? "식을 고치면 다음 예정이 나옵니다." : "앞으로 실행될 시각이 없습니다."}</span>
        )}
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        시안에서는 브라우저가 계산한 값입니다. 실제 화면은 저장 전에 서버가 같은 규칙으로 계산해 보여 줍니다.
      </div>
    </div>
  );
}
