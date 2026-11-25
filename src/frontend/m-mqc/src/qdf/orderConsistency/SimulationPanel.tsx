"use client";

/**
 * 「주문 시뮬레이션」 탭 — 왼쪽 주문 입력(프리셋 5건·핵심 항목 12개·추가 항목 접기), 오른쪽 체크 결과.
 * 결과: 요약 줄(평가·발화·미입력으로 평가 못 한 룰) → 통과 / 조건부 통과 / 판정 불가 / 발화 카드(동시발화 상자·접힌 룰).
 * 발화 여부는 서버(qcdRule judge, COLLECT)가 정하고, 카드의 조건별 ✓/✕ 는 화면이 셀 조건으로 다시 본다.
 */
import { memo, useId, useMemo, useState, type CSSProperties } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { Badge, Button, Input, Select } from "@dk-oasis/shared/form";
import { CardFrame, CardGroup, MutedText } from "@dk-oasis/shared/card";
import { JUDGE_STATUS_LABEL, type JudgeStatus } from "@/common/rule";

import { CondLine, RuleHead } from "./parts";
import type { OcField, ValueLabel } from "./model";
import { SIM_CORE_FIELDS, SIM_PRESETS } from "./presets";
import { condPhrase } from "./sentence";
import {
  fireBlocks,
  type FiredView,
  type OrderValues,
  type SimOutcome,
} from "./simulate";

export interface SimResult {
  status: JudgeStatus | null;
  ver: string | null;
  outcome: SimOutcome | null;
  /** 숫자 항목에 숫자가 아닌 값 — 있으면 서버에 보내지 않았다. */
  formatErrors: { field: string; label: string; value: string }[];
  message: string | null;
}

const BOX: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "8px 10px",
  marginBottom: 8,
};

const tone = (bg: string, color: string): CSSProperties => ({
  ...BOX,
  background: bg,
  color,
  borderColor: color,
});

const FiredCard = memo(function FiredCard({
  f,
  labelOf,
  labels,
  screenId,
}: {
  f: FiredView;
  labelOf: (field: string) => string;
  labels: ReadonlyMap<string, ValueLabel>;
  screenId: string;
}) {
  const ok = f.checks.filter((c) => c.state === "P").length;
  return (
    <div style={BOX} data-testid={`${screenId}-fired-${f.rule.key}`}>
      <RuleHead rule={f.rule} />
      <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
        {f.checks.map((c, i) => {
          const p = condPhrase(
            c.field,
            labelOf(c.field),
            c.cond,
            false,
            false,
            labels,
          );
          const vl =
            c.value === null ? undefined : labels.get(`${c.field}:${c.value}`);
          return (
            <div key={`${c.field}-${i}`}>
              <span
                style={{
                  color:
                    c.state === "P"
                      ? "var(--color-success)"
                      : "var(--color-danger)",
                  fontWeight: 700,
                }}
              >
                {c.state === "P" ? "✓" : "✕"}
              </span>{" "}
              <CondLine p={p} />{" "}
              <MutedText>
                주문값:{" "}
                {c.value === null ? (
                  <i>(미입력)</i>
                ) : (
                  <>
                    {c.value}
                    {vl?.label ? ` (${vl.label})` : ""}
                  </>
                )}
              </MutedText>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 4 }}>
        → 조건 {ok}/{f.checks.length} 충족 — 에러 발생 · 조치: {f.rule.actor}
      </div>
      {f.folded.length > 0 ? (
        <MutedText>
          같은 내용 룰 {f.folded.length}건 접힘: {f.folded.join(", ")}
        </MutedText>
      ) : null}
    </div>
  );
});

const ResultView = memo(function ResultView({
  result,
  labelOf,
  labels,
  screenId,
}: {
  result: SimResult | null;
  labelOf: (field: string) => string;
  labels: ReadonlyMap<string, ValueLabel>;
  screenId: string;
}) {
  const [showNull, setShowNull] = useState(false);
  if (!result)
    return (
      <MutedText>
        프리셋을 고르거나 값을 넣고 [정합성 체크 실행] 을 누르세요.
      </MutedText>
    );
  if (result.formatErrors.length > 0)
    return (
      <div
        style={tone("var(--color-danger-soft)", "var(--color-danger)")}
        data-testid={`${screenId}-sim-blocked`}
      >
        <b>⚠ 판정 불가 — 숫자 항목에 숫자가 아닌 값이 있습니다</b>
        <div>
          {result.formatErrors
            .map((x) => `${x.label} "${x.value}"`)
            .join(" · ")}{" "}
          — 값을 고쳐 다시 실행하세요.
        </div>
      </div>
    );
  const o = result.outcome;
  if (!o || (result.status !== "MATCHED" && result.status !== "NO_MATCH"))
    return (
      <div style={tone("var(--color-danger-soft)", "var(--color-danger)")}>
        <b>
          ⚠ {result.status ? JUDGE_STATUS_LABEL[result.status] : "판정 불가"}
        </b>
        <div>{result.message ?? "판정하지 못했습니다."}</div>
      </div>
    );
  const blocks = fireBlocks(o.fired);
  return (
    <div data-testid={`${screenId}-sim-result`}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span>
          평가 <b>{o.evaluated}</b>건
        </span>
        <span>
          에러{" "}
          <b
            style={{
              color: o.fired.length ? "var(--color-danger)" : undefined,
            }}
            data-testid={`${screenId}-sim-fired-count`}
          >
            {o.fired.length}
          </b>
          건 발생
        </span>
        {o.skippedByNull > 0 ? (
          <Button
            size="mini"
            variant="default"
            aria-expanded={showNull}
            onClick={() => setShowNull((v) => !v)}
          >
            미평가 {o.skippedByNull}건(미입력 {o.nullFields.length}개 항목){" "}
            {showNull ? "▴" : "▾"}
          </Button>
        ) : (
          <span>미평가 0건(미입력)</span>
        )}
        {result.ver ? <MutedText>v{result.ver} 기준</MutedText> : null}
      </div>
      {showNull && o.nullFields.length > 0 ? (
        <div style={BOX}>
          <MutedText>
            미입력이라 평가되지 않은 룰의 원인 항목 — 값을 채우면 그 룰이 판정에
            들어갑니다.
          </MutedText>
          {o.nullFields.map((n) => (
            <div key={n.field}>
              <b>{n.label}</b> <MutedText>{n.field}</MutedText> · 룰 {n.rules}건{" "}
              <MutedText>
                {n.keys.slice(0, 8).join(" · ")}
                {n.keys.length > 8 ? ` 외 ${n.keys.length - 8}건` : ""}
              </MutedText>
            </div>
          ))}
        </div>
      ) : null}
      {o.mismatches.length > 0 ? (
        <p className="form-error-message" role="status">
          서버 판정과 화면 조건 풀이가 다른 룰: {o.mismatches.join(", ")} — 발화
          여부는 서버 판정을 따릅니다.
        </p>
      ) : null}
      {o.fired.length === 0 && o.skippedByNull > 0 ? (
        <div style={tone("var(--color-bg-light)", "var(--color-text)")}>
          <b>
            △ 조건부 통과 — 미입력 {o.nullFields.length}개 항목 때문에 룰{" "}
            {o.skippedByNull}건이 평가되지 않았습니다
          </b>
          <div>
            발화한 에러는 없습니다(평가 {o.evaluated}건 중 발화 0건). 비어 있는
            항목:{" "}
            {o.nullFields
              .slice(0, 4)
              .map((n) => `${n.label}(룰 ${n.rules}건)`)
              .join(" · ")}
            {o.nullFields.length > 4
              ? ` 외 ${o.nullFields.length - 4}개 항목`
              : ""}
            . 값을 채워 다시 실행해야 판정이 완전해집니다.
          </div>
        </div>
      ) : null}
      {o.fired.length === 0 && o.skippedByNull === 0 ? (
        <div style={tone("var(--color-success-soft)", "var(--color-success)")}>
          <b>✓ 통과 — 발생한 에러가 없습니다</b>
          <div>
            평가 {o.evaluated}건 중 발화 0건 · 미입력으로 미평가된 룰 없음
          </div>
        </div>
      ) : null}
      {blocks.map((b) =>
        b.co ? (
          <div
            key={b.key}
            style={{ ...BOX, background: "var(--color-bg-light)" }}
            data-testid={`${screenId}-cofire-${b.items[0].rule.target}`}
          >
            <b>
              동시발화 — 같은 항목의 별개 결함 {b.items.length}건 (모순 아님)
            </b>
            {b.items.map((f) => (
              <FiredCard
                key={f.rule.key}
                f={f}
                labelOf={labelOf}
                labels={labels}
                screenId={screenId}
              />
            ))}
          </div>
        ) : (
          <FiredCard
            key={b.key}
            f={b.items[0]}
            labelOf={labelOf}
            labels={labels}
            screenId={screenId}
          />
        ),
      )}
      <MutedText>
        전 룰 평가(우선순위 중단 없음) · 빈칸은 미입력(NULL), 0 은 0 으로
        평가합니다 · 범위 경계는 룰 칸 정의(≤x≤ / ≤x&lt;)를 따릅니다.
      </MutedText>
    </div>
  );
});

export interface SimulationPanelProps {
  screenId: string;
  fields: OcField[];
  labels: ReadonlyMap<string, ValueLabel>;
  /** 항목 → 입력 후보(사전 라벨·룰 값). */
  fieldOptions: ReadonlyMap<string, { value: string; label: string }[]>;
  values: OrderValues;
  onValueChange: (field: string, value: string) => void;
  presetKey: string;
  onPreset: (key: string) => void;
  /** 값을 통째로 바꿀 때(프리셋·룰에서 만든 주문·지우기)마다 바뀌는 번호 — 추가 항목 접기를 다시 정한다. */
  inputVersion: number;
  result: SimResult | null;
  busy: boolean;
  disabled: boolean;
  canJudge: boolean;
  onRun: () => void;
  onClear: () => void;
}

export const SimulationPanel = memo(function SimulationPanel({
  screenId,
  fields,
  labels,
  fieldOptions,
  values,
  onValueChange,
  presetKey,
  onPreset,
  inputVersion,
  result,
  busy,
  disabled,
  canJudge,
  onRun,
  onClear,
}: SimulationPanelProps) {
  const idBase = useId();
  const labelMap = useMemo(
    () => new Map(fields.map((f) => [f.key, f.label])),
    [fields],
  );
  const labelOf = useMemo(
    () => (field: string) => labelMap.get(field) ?? field,
    [labelMap],
  );
  const core = useMemo(
    () =>
      SIM_CORE_FIELDS.map((k) => fields.find((f) => f.key === k)).filter(
        (f): f is OcField => !!f,
      ),
    [fields],
  );
  const extra = useMemo(
    () =>
      fields
        .filter((f) => !SIM_CORE_FIELDS.includes(f.key))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    [fields],
  );
  const extraFilled = extra.some((f) => (values[f.key] ?? "").trim() !== "");
  const preset = SIM_PRESETS.find((p) => p.key === presetKey);
  const presetOptions = useMemo(
    () => [
      { value: "", label: "직접 입력" },
      ...SIM_PRESETS.map((p) => ({ value: p.key, label: p.name })),
    ],
    [],
  );

  const row = (f: OcField) => {
    const id = `${idBase}-${f.key}`;
    const opts = f.type === "number" ? [] : (fieldOptions.get(f.key) ?? []);
    return (
      <tr key={f.key}>
        <th style={DETAIL_LABEL_CELL}>
          <label htmlFor={id} title={f.key}>
            {f.label}
            {f.unit ? ` (${f.unit})` : ""}
          </label>
        </th>
        <td style={DETAIL_VALUE_CELL}>
          <Input
            id={id}
            data-testid={`${screenId}-sim-${f.key}`}
            value={values[f.key] ?? ""}
            onChange={(v) => onValueChange(f.key, v)}
            inputMode={f.type === "number" ? "decimal" : undefined}
            placeholder="빈칸 = 미입력"
            autoComplete="off"
            list={opts.length > 0 ? `${id}-list` : undefined}
          />
          {opts.length > 0 ? (
            <datalist id={`${id}-list`}>
              {opts.slice(0, 40).map((o) => (
                <option
                  key={o.value}
                  value={o.value}
                  label={o.label || undefined}
                />
              ))}
            </datalist>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <ContentBody root>
      <ContentPanel width={440} scrollY>
        <CardFrame
          title="주문 입력 — 빈칸 = 미입력(NULL) · 0 은 0"
          testId={`${screenId}-sim-input`}
        >
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            <Select
              aria-label="프리셋"
              data-testid={`${screenId}-sim-preset`}
              value={presetKey}
              onChange={onPreset}
              options={presetOptions}
            />
            {preset ? <MutedText>{preset.hint}</MutedText> : null}
            <div>
              <Button
                variant="primary"
                data-testid={`${screenId}-sim-run`}
                onClick={onRun}
                disabled={busy || disabled || !canJudge}
                title={!canJudge ? "판정 권한이 없습니다" : undefined}
              >
                정합성 체크 실행
              </Button>{" "}
              <Button
                variant="default"
                data-testid={`${screenId}-sim-clear`}
                onClick={onClear}
              >
                지우기
              </Button>
            </div>
          </div>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>{core.map(row)}</tbody>
          </table>
        </CardFrame>
        <CardGroup
          key={`extra-${inputVersion}`}
          id="extra"
          testIdPrefix={`${screenId}-sim`}
          title={`추가 항목 ${extra.length}개`}
          defaultOpen={extraFilled}
        >
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>{extra.map(row)}</tbody>
          </table>
        </CardGroup>
      </ContentPanel>
      <ContentPanel scrollY>
        <CardFrame
          title="체크 결과"
          testId={`${screenId}-sim-output`}
          right={busy ? <Badge label="판정 중" tone="primary" /> : null}
        >
          <ResultView
            result={result}
            labelOf={labelOf}
            labels={labels}
            screenId={screenId}
          />
        </CardFrame>
      </ContentPanel>
    </ContentBody>
  );
});
