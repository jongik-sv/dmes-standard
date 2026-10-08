/**
 * crontab 식 입력 칸 — 「쉬운 설정」(반복 종류별 칸) / 「직접 입력」(분·시·일·월·요일 다섯 칸) 전환 +
 * 만들어진 식 한 줄 + 자주 쓰는 식 칩 + 사람이 읽는 설명 + 다음 예정 5개.
 * 업무에 묶이지 않는 부품이라 나중에 @dk-oasis/shared 공통 컴포넌트로 옮길 후보다(설계 문서 §8).
 * 값(value)은 늘 crontab 5칸 식 한 줄이다. 쉬운 설정이 식을 만들 수 없는 상태면 빈 글자를 올려 저장을 막는다.
 */
import { useMemo, useState } from "react";
import { Button, CopyTextButton, Input, SegmentedControl } from "@dk-oasis/shared/form";
import { CronDirectEditor } from "./CronDirectEditor";
import { CronEasyEditor } from "./CronEasyEditor";
import {
  buildCron,
  CRON_PRESETS,
  DEFAULT_EASY,
  describeCron,
  formatWithDow,
  parseCron,
  runTimes,
  splitExpression,
  toEasy,
  validateCron,
  validateFieldText,
  type EasyConfig,
} from "./cron";

type Mode = "easy" | "direct";

const NOT_EASY = "쉬운 설정으로 나타낼 수 없는 식입니다.";
const CROSS_ERROR = "일과 요일 중 하나는 * 로 두세요.";
const MODE_OPTIONS = [
  { value: "easy", label: "쉬운 설정" },
  { value: "direct", label: "직접 입력" },
];

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

const fieldsOf = (expr: string, fallback: string[]): string[] => splitExpression(expr) ?? fallback;

export function CronInput({ value, onChange, disabled = false, minGapMin, previewCount = 5 }: CronInputProps) {
  const initialEasy = useMemo(() => toEasy(value), []);
  const [mode, setMode] = useState<Mode>(initialEasy ? "easy" : "direct");
  const [easy, setEasy] = useState<EasyConfig>(initialEasy ?? DEFAULT_EASY);
  const [fields, setFields] = useState<string[]>(() => fieldsOf(value, ["", "", "", "", ""]));
  const [notice, setNotice] = useState<string | null>(initialEasy ? null : NOT_EASY);
  /** 이 부품이 마지막으로 올렸거나 받아들인 값 — 다르면 바깥(다른 작업을 고름 등)에서 바뀐 것이라 처음부터 다시 연다. */
  const [synced, setSynced] = useState(value);

  if (value !== synced) {
    const external = toEasy(value);
    setSynced(value);
    setMode(external ? "easy" : "direct");
    if (external) setEasy(external);
    setFields(fieldsOf(value, ["", "", "", "", ""]));
    setNotice(external ? null : NOT_EASY);
  }

  const emit = (next: string) => {
    setSynced(next);
    onChange(next);
  };

  const handleEasy = (patch: Partial<EasyConfig>) => {
    const next = { ...easy, ...patch };
    setEasy(next);
    const built = buildCron(next);
    emit(built.ok ? built.cron : "");
  };
  const easyBuild = useMemo(() => buildCron(easy), [easy]);

  const handleFields = (next: string[]) => {
    setFields(next);
    emit(next.map((f) => f.trim()).join(" ").trim());
  };

  const handleMode = (target: string) => {
    if (target === mode) return;
    if (target === "direct") {
      setFields((prev) => fieldsOf(value, prev));
      setNotice(null);
      setMode("direct");
      return;
    }
    const converted = toEasy(value);
    if (!converted) {
      setNotice(NOT_EASY);
      return;
    }
    setEasy(converted);
    setNotice(null);
    setMode("easy");
  };

  const handlePreset = (preset: string) => {
    const converted = toEasy(preset);
    if (converted) setEasy(converted);
    setFields(fieldsOf(preset, fields));
    setNotice(null);
    emit(preset);
  };

  const error = useMemo(() => (value ? validateCron(value, minGapMin) : null), [value, minGapMin]);
  const anyFieldError = mode === "direct" && fields.some((f, i) => validateFieldText(i, f) !== null);
  const crossFieldError = !anyFieldError && error === CROSS_ERROR;
  // 직접 입력에서 칸 오류가 있으면 칸 아래 문구가 맡고, 쉬운 설정에서는 만들 수 없는 사유가 맡는다.
  const shownError = mode === "direct" ? (anyFieldError ? null : error) : easyBuild.ok ? error : null;
  const invalid = mode === "direct" ? anyFieldError || error !== null : !easyBuild.ok || error !== null;

  const description = useMemo(() => (value ? describeCron(value) : ""), [value]);
  const next = useMemo(() => {
    const parsed = parseCron(value);
    return parsed.ok && !error ? runTimes(parsed.cron, new Date(), previewCount) : [];
  }, [value, error, previewCount]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" }}>
      <SegmentedControl value={mode} options={MODE_OPTIONS} disabled={disabled} ariaLabel="입력 방식" testId="cron-mode" onChange={handleMode} />
      {notice ? (
        <span className="form-error-message" role="alert" data-testid="cron-mode-notice">
          {notice}
        </span>
      ) : null}

      {mode === "easy" ? (
        <CronEasyEditor easy={easy} onChange={handleEasy} error={easyBuild.ok ? null : easyBuild.error} disabled={disabled} />
      ) : (
        <CronDirectEditor fields={fields} onChange={handleFields} crossFieldError={crossFieldError} disabled={disabled} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
        <span style={{ flex: "0 0 auto", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>만들어진 식</span>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <Input value={value || "-"} readOnly aria-label="만들어진 crontab 식" data-testid="cron-expression" />
        </div>
        <CopyTextButton text={value} label="복사" />
      </div>
      {shownError ? (
        <span className="form-error-message" role="alert" data-testid="cron-error">
          {shownError}
        </span>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-xs)" }}>
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", marginRight: "var(--spacing-xs)" }}>자주 쓰는 식</span>
        {CRON_PRESETS.map((p) => (
          <Button key={p.value} size="sm" disabled={disabled} variant={value === p.value ? "primary" : "default"} title={p.value} onClick={() => handlePreset(p.value)}>
            {p.label}
          </Button>
        ))}
      </div>

      <div style={{ fontSize: "var(--font-size-sm)" }} role="status">
        <span style={{ color: "var(--color-text-muted)" }}>일정 설명 </span>
        <strong>{invalid || !description ? "-" : description}</strong>
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
          <span style={{ color: "var(--color-text-muted)" }}>{invalid ? "식을 고치면 다음 예정이 나옵니다." : "앞으로 실행될 시각이 없습니다."}</span>
        )}
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        시안에서는 브라우저가 계산한 값입니다. 실제 화면은 저장 전에 서버가 같은 규칙으로 계산해 보여 줍니다.
      </div>
    </div>
  );
}
