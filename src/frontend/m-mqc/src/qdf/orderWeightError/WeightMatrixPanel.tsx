"use client";

/**
 * 「단중에러 기준」 탭 — 왼쪽 단중 × 분할 매트릭스(허용범위 칸 강조·수정값 표시), 오른쪽 간편 판정(qcdRule judge).
 * 칸을 누르면 그 단중·분할로 판정하고 칸에 테두리를 그린다. 매트릭스는 보기 전용이다(편집은 Maru).
 */
import {
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { Badge, Button, Input } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import {
  MatrixTable,
  type MatrixTableColumn,
  type MatrixTableRow,
} from "@dk-oasis/shared/matrix-table";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";
import { JUDGE_STATUS_LABEL, judgeRule, type JudgeResult } from "@/common/rule";

import { NUM_RE } from "../shared/cond";
import {
  cellKey,
  feasibleSplits,
  fmtValue,
  fmtWeight,
  RANGE_VAR,
  RULE_ID,
  SPLIT_VAR,
  VALUE_VAR,
  WGT_VAR,
  type WeightCell,
  type WeightLimit,
  type WeightMatrix,
} from "./weight";

const CELL_BUTTON: CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  cursor: "pointer",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const LEGEND_SWATCH: CSSProperties = {
  display: "inline-block",
  width: 12,
  height: 12,
  marginRight: 4,
  verticalAlign: "middle",
  border: "1px solid var(--color-border)",
};

function cellStyleOf(
  cell: WeightCell | undefined,
  picked: boolean,
): CSSProperties | undefined {
  if (!cell) return undefined;
  const style: CSSProperties = {};
  if (cell.inRange) {
    style.background = "var(--color-success-soft)";
    style.color = "var(--color-success)";
    style.fontWeight = 600;
  } else if (cell.edited) style.background = "var(--color-edited)";
  if (cell.edited) style.textDecoration = "underline dotted";
  if (picked) {
    style.outline = "2px solid var(--color-primary)";
    style.outlineOffset = -2;
  }
  return style;
}

export interface WeightMatrixPanelProps {
  screenId: string;
  matrix: WeightMatrix;
  limit: WeightLimit | null;
  /** 허용 범위와 룰 결과가 다른 칸. */
  mismatches: WeightCell[];
  ver: string | null;
  applyFrom: string | null;
  loading: boolean;
  loaded: boolean;
  canJudge: boolean;
  evalTs: string | undefined;
  /** 코드(허용 범위)를 받았는가 — 받기 전에는 「읽지 못했다」 를 보이지 않는다. */
  codesLoaded: boolean;
}

export const WeightMatrixPanel = memo(function WeightMatrixPanel({
  screenId,
  matrix,
  limit,
  mismatches,
  ver,
  applyFrom,
  loading,
  loaded,
  canJudge,
  evalTs,
  codesLoaded,
}: WeightMatrixPanelProps) {
  const { showMessage } = useMessage();
  const idBase = useId();
  const [weight, setWeight] = useState("");
  const [split, setSplit] = useState("");
  const [inputError, setInputError] = useState<Record<string, string>>({});
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [judged, setJudged] = useState<{ w: number; s: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0);

  const run = useCallback(
    async (w: string, s: string) => {
      const errors: Record<string, string> = {};
      if (!NUM_RE.test(w.trim()))
        errors.w = w.trim() === "" ? "주문단중을 넣으세요" : "숫자가 아닙니다";
      if (!/^\d+$/.test(s.trim()))
        errors.s =
          s.trim() === "" ? "분할 수를 넣으세요" : "분할 수는 정수입니다";
      setInputError(errors);
      if (Object.keys(errors).length > 0) return;
      const id = ++runRef.current;
      setBusy(true);
      try {
        const out = await judgeRule(
          RULE_ID,
          { [WGT_VAR]: w.trim(), [SPLIT_VAR]: s.trim() },
          evalTs,
        );
        if (id !== runRef.current) return;
        setResult(out);
        setJudged({ w: Number(w), s: Number(s) });
      } catch (e) {
        if (id === runRef.current)
          showMessage({
            title: "오류",
            message: errorMessage(e),
            alertType: "error",
          });
      } finally {
        if (id === runRef.current) setBusy(false);
      }
    },
    [evalTs, showMessage],
  );

  const pick = useCallback(
    (w: number, s: number) => {
      const ws = fmtWeight(w);
      const ss = String(s);
      setWeight(ws);
      setSplit(ss);
      if (canJudge) void run(ws, ss);
      else setJudged({ w, s });
    },
    [canJudge, run],
  );

  const clear = () => {
    runRef.current += 1;
    setWeight("");
    setSplit("");
    setInputError({});
    setResult(null);
    setJudged(null);
    setBusy(false);
  };

  const pickedKey = judged ? cellKey(judged.w, judged.s) : "";
  const columns = useMemo<MatrixTableColumn[]>(
    () =>
      matrix.splits.map((s) => ({
        key: String(s),
        header: `${s}분할`,
        highlight: judged?.s === s,
      })),
    [matrix.splits, judged?.s],
  );
  const rows = useMemo<MatrixTableRow[]>(
    () =>
      matrix.weights.map((w) => ({
        key: String(w),
        label: <b>{fmtWeight(w)}</b>,
        renderCell: (col) => {
          const cell = matrix.cells.get(cellKey(w, Number(col)));
          if (!cell) return <MutedText>—</MutedText>;
          return (
            <button
              type="button"
              style={CELL_BUTTON}
              data-testid={`${screenId}-cell-${fmtWeight(w)}-${col}`}
              title={`단중 ${fmtWeight(w)} × ${col}분할 = ${fmtValue(cell.value)}${
                cell.edited ? ` (계산값 ${fmtValue(cell.base)} → 수정값)` : ""
              }${cell.inRange ? " · 범위 내" : ""}`}
              onClick={() => pick(w, Number(col))}
            >
              {fmtValue(cell.value)}
            </button>
          );
        },
        cellStyle: (col) =>
          cellStyleOf(
            matrix.cells.get(cellKey(w, Number(col))),
            pickedKey === cellKey(w, Number(col)),
          ),
      })),
    [matrix, pick, pickedKey, screenId],
  );

  const hitValue = result?.results[VALUE_VAR];
  const hitRange = result?.results[RANGE_VAR];
  const judgedWeight = judged ? judged.w : null;
  const splitsOk =
    judgedWeight !== null && matrix.weights.includes(judgedWeight)
      ? feasibleSplits(matrix, judgedWeight)
      : null;

  return (
    <ContentBody root>
      <ContentPanel scrollY>
        <CardFrame
          title="분할 단중표 (주문단중 × 분할 수)"
          testId={`${screenId}-matrix`}
          right={
            <>
              {ver ? (
                <Badge
                  label={`v${ver}${applyFrom ? ` · ${applyFrom} 적용` : ""}`}
                  tone="neutral"
                />
              ) : null}{" "}
              <Badge
                label={`범위 내 ${matrix.inRangeCount}셀`}
                tone="success"
                testId={`${screenId}-in-range-count`}
              />{" "}
              <Badge
                label={`수정값 ${matrix.editedCount}셀`}
                tone="warning"
                testId={`${screenId}-edited-count`}
              />
            </>
          }
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span data-testid={`${screenId}-limit`}>
              허용 단중 범위{" "}
              <b>
                {limit
                  ? `${limit.min.toFixed(1)} ~ ${limit.max.toFixed(1)} ${limit.unit}`
                  : "—"}
              </b>
            </span>
            <span>
              <span
                style={{
                  ...LEGEND_SWATCH,
                  background: "var(--color-success-soft)",
                }}
              />
              범위 내 (생산 가능)
            </span>
            <span>
              <span
                style={{ ...LEGEND_SWATCH, background: "var(--color-edited)" }}
              />
              <span style={{ textDecoration: "underline dotted" }}>수정값</span>{" "}
              (계산값과 다른 값)
            </span>
          </div>
          {codesLoaded && !limit ? (
            <p className="form-error-message" role="status">
              허용 범위 코드(QC_ORD_WGT_LIMIT)를 읽지 못했습니다. 칸 색은 룰
              결과(허용범위)를 따릅니다.
            </p>
          ) : null}
          {mismatches.length > 0 ? (
            <p className="form-error-message" role="status">
              허용 범위와 룰 결과가 다른 칸 {mismatches.length}개:{" "}
              {mismatches
                .slice(0, 5)
                .map((c) => `${fmtWeight(c.weight)} × ${c.split}분할`)
                .join(", ")}
              {mismatches.length > 5 ? ` 외 ${mismatches.length - 5}개` : ""}
            </p>
          ) : null}
          {loaded && matrix.cells.size === 0 ? (
            <MutedText>
              기준일에 적용 중인 룰 버전이 없습니다. Maru 에 룰이 등록됐는지
              확인하세요.
            </MutedText>
          ) : (
            <div style={{ overflowX: "auto", overscrollBehaviorX: "contain" }}>
              <MatrixTable
                cornerHeader="주문단중(MT) \ 분할"
                columns={columns}
                rows={rows}
              />
            </div>
          )}
          <MutedText>
            행: 주문단중(MT) · 열: 분할 수 · 칸: 분할 단중 = 주문단중 ÷ 분할
            수(MT/개). 칸을 누르면 그 값으로 판정합니다. 값을 바꾸려면 [Maru에서
            편집] 을 누르세요.
          </MutedText>
          {matrix.skipped > 0 ? (
            <MutedText>
              단중·분할이 한 값(=)이 아니어서 표에 놓지 못한 행 {matrix.skipped}
              개가 있습니다.
            </MutedText>
          ) : null}
        </CardFrame>
      </ContentPanel>
      <ContentPanel width={340} scrollY>
        <CardFrame title="간편 판정" testId={`${screenId}-judge`}>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>
                  <label htmlFor={`${idBase}-w`}>주문단중 (MT)</label>
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    id={`${idBase}-w`}
                    data-testid={`${screenId}-judge-weight`}
                    value={weight}
                    onChange={setWeight}
                    error={inputError.w}
                    inputMode="decimal"
                    placeholder="예: 24.0"
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>
                  <label htmlFor={`${idBase}-s`}>분할 수 (개)</label>
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    id={`${idBase}-s`}
                    data-testid={`${screenId}-judge-split`}
                    value={split}
                    onChange={setSplit}
                    error={inputError.s}
                    inputMode="numeric"
                    placeholder="예: 6"
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={DETAIL_VALUE_CELL}>
                  <Button
                    variant="primary"
                    data-testid={`${screenId}-judge-run`}
                    onClick={() => void run(weight, split)}
                    disabled={busy || loading || !canJudge}
                    title={!canJudge ? "판정 권한이 없습니다" : undefined}
                  >
                    판정
                  </Button>{" "}
                  <Button
                    variant="default"
                    data-testid={`${screenId}-judge-clear`}
                    onClick={clear}
                  >
                    지우기
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
          {result ? (
            <div
              data-testid={`${screenId}-judge-result`}
              style={{ marginTop: 12, display: "grid", gap: 6 }}
            >
              <div>
                <Badge
                  label={JUDGE_STATUS_LABEL[result.status]}
                  tone={
                    result.status === "MATCHED"
                      ? "success"
                      : result.status === "NO_MATCH"
                        ? "neutral"
                        : "danger"
                  }
                />{" "}
                {result.ver ? <MutedText>v{result.ver}</MutedText> : null}
              </div>
              {result.status === "MATCHED" ? (
                <>
                  <div>
                    분할 단중{" "}
                    <b style={{ fontSize: 18 }}>
                      {fmtValue(
                        hitValue === null || hitValue === undefined
                          ? null
                          : Number(hitValue),
                      )}
                    </b>{" "}
                    MT/개
                  </div>
                  <div>
                    {String(hitRange) === "Y" ? (
                      <Badge label="범위 내 — 생산 가능" tone="success" />
                    ) : (
                      <Badge label="범위 밖 — 단중 에러" tone="danger" />
                    )}
                  </div>
                  <MutedText>
                    적중 행 순번 {result.hits[0]?.seq ?? "—"} (행 ID{" "}
                    {result.hits[0]?.rowId ?? "—"})
                  </MutedText>
                </>
              ) : (
                <MutedText>
                  {result.status === "NO_MATCH"
                    ? "기준표에 없는 단중·분할입니다. 단중은 0.5 MT 단위, 분할은 표의 열 값만 있습니다."
                    : (result.message ?? "판정하지 못했습니다.")}
                </MutedText>
              )}
              {splitsOk ? (
                <div data-testid={`${screenId}-judge-feasible`}>
                  단중 {fmtWeight(judgedWeight!)} 의 생산 가능 분할:{" "}
                  <b>
                    {splitsOk.length > 0
                      ? splitsOk.map((s) => `${s}분할`).join(", ")
                      : "없음"}
                  </b>
                </div>
              ) : null}
            </div>
          ) : (
            <MutedText>
              주문단중과 분할 수를 넣고 [판정] 을 누르거나, 표의 칸을 누르세요.
            </MutedText>
          )}
        </CardFrame>
      </ContentPanel>
    </ContentBody>
  );
});
