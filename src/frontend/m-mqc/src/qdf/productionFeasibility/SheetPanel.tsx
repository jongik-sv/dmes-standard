"use client";

/**
 * 시트 탭 하나 — 왼쪽 B.D 생산범위 시트(제목·범례·안내·후처리 표·재질 그룹별 폭 × 두께 칸), 오른쪽 가부 간편조회(qcdRule judge).
 * 칸을 누르면 그 그룹·폭·두께로 판정하고 칸에 테두리를 그린다. 시트는 보기 전용이다(편집은 Maru).
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
import { Badge, Button, Input, Select } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import {
  MatrixTable,
  type MatrixTableColumn,
  type MatrixTableRow,
} from "@dk-oasis/shared/matrix-table";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";
import {
  cellOf,
  conditionSentence,
  judgeRule,
  JUDGE_STATUS_LABEL,
  type JudgeResult,
  type RuleView,
} from "@/common/rule";

import { NUM_RE } from "../shared/cond";
import {
  expandGroup,
  GRP_VAR,
  groupOfMaterial,
  isOverlay,
  locate,
  STAT_VAR,
  stateOf,
  THK_VAR,
  WID_VAR,
  type FeasCell,
  type FeasGroup,
  type FeasSheet,
  type FeasState,
} from "./feasibility";

const CELL_BUTTON: CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  minWidth: 18,
  height: 16,
  cursor: "pointer",
};

const SWATCH: CSSProperties = {
  display: "inline-block",
  width: 14,
  height: 12,
  marginRight: 4,
  verticalAlign: "middle",
  border: "1px solid var(--color-border)",
};

const PRE_LINE: CSSProperties = { whiteSpace: "pre-line" };

interface PickedCell {
  group: string;
  wi: number;
  ti: number;
}

/** 범례 — 상태 이름과 색. */
export function StateLegend({ states }: { states: readonly FeasState[] }) {
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 12 }}>
      {states.map((s) => (
        <span key={s.code}>
          <span
            style={{ ...SWATCH, background: s.background ?? "var(--color-bg)" }}
          />
          {s.name}
        </span>
      ))}
    </span>
  );
}

const GroupMatrix = memo(function GroupMatrix({
  screenId,
  group,
  grid,
  states,
  picked,
  onPick,
  sheetShort,
}: {
  screenId: string;
  group: FeasGroup;
  grid: FeasCell[][];
  states: readonly FeasState[];
  /** 이 그룹에서 고른 칸(없으면 null). */
  picked: { wi: number; ti: number } | null;
  onPick: (group: string, wi: number, ti: number) => void;
  sheetShort: string;
}) {
  const columns = useMemo<MatrixTableColumn[]>(
    () =>
      group.thicks.map((t, ti) => ({
        key: String(ti),
        header: t.label,
        highlight: picked?.ti === ti,
      })),
    [group.thicks, picked?.ti],
  );
  const rows = useMemo<MatrixTableRow[]>(
    () =>
      group.widths.map((w, wi) => ({
        key: String(wi),
        label: <b>{w.label}</b>,
        renderCell: (col) => {
          const ti = Number(col);
          if (isOverlay(group, wi, ti)) return null;
          const cell = grid[wi]?.[ti];
          const name =
            cell?.state === null || cell === undefined
              ? "해당 없음"
              : (stateOf(states, cell.state)?.name ?? cell.state);
          const label = `[${sheetShort} · ${group.name}] 폭 ${w.label} × 두께 ${group.thicks[ti]?.label} : ${name}`;
          return (
            <button
              type="button"
              style={CELL_BUTTON}
              title={label}
              aria-label={label}
              data-testid={`${screenId}-cell-${group.code}-${wi}-${ti}`}
              onClick={() => onPick(group.code, wi, ti)}
            />
          );
        },
        cellStyle: (col) => {
          const ti = Number(col);
          const style: CSSProperties = { padding: "2px 4px" };
          if (isOverlay(group, wi, ti))
            style.background = group.overlay?.red
              ? "var(--color-danger-soft)"
              : "var(--color-bg-disabled)";
          else {
            const s = stateOf(states, grid[wi]?.[ti]?.state ?? null);
            if (s?.background) style.background = s.background;
          }
          if (picked && picked.wi === wi && picked.ti === ti) {
            style.outline = "2px solid var(--color-primary)";
            style.outlineOffset = -2;
          }
          return style;
        },
      })),
    [group, grid, states, picked, onPick, screenId, sheetShort],
  );
  return (
    <CardFrame
      title={group.name}
      testId={`${screenId}-group-${group.code}`}
      right={
        <Badge
          label={group.code}
          tone="neutral"
          variant="outline"
          mono
          title="룰 조건 재질 그룹(MAT_GRP_CD) 값"
        />
      }
    >
      <div style={{ display: "grid", gap: 4, marginBottom: 6 }}>
        {group.materialsText ? <span>{group.materialsText}</span> : null}
        {group.warn ? (
          <span style={{ color: "var(--color-warning)", fontWeight: 600 }}>
            {group.warn}
          </span>
        ) : null}
        {group.warnbox ? (
          <span
            style={{
              ...PRE_LINE,
              background: "var(--color-danger-soft)",
              color: "var(--color-danger)",
              border: "1px solid var(--color-danger)",
              borderRadius: 4,
              padding: "4px 8px",
              justifySelf: "start",
              fontWeight: 600,
            }}
          >
            {group.warnbox}
          </span>
        ) : null}
        {group.overlay ? (
          <MutedText>
            주석 영역(왼쪽 위 폭 {group.overlay.rows}단 × 두께{" "}
            {group.overlay.cols}단, 원본 시트 참조):{" "}
            <span
              style={{
                ...PRE_LINE,
                color: group.overlay.red ? "var(--color-danger)" : undefined,
              }}
            >
              {group.overlay.text}
            </span>
          </MutedText>
        ) : null}
      </div>
      <div style={{ overflowX: "auto", overscrollBehaviorX: "contain" }}>
        <MatrixTable
          cornerHeader="폭(mm) \ 두께(mm)"
          columns={columns}
          rows={rows}
          align="center"
        />
      </div>
    </CardFrame>
  );
});

export interface SheetPanelProps {
  screenId: string;
  sheet: FeasSheet;
  rule: RuleView | undefined;
  groups: FeasGroup[];
  states: FeasState[];
  loading: boolean;
  loaded: boolean;
  canJudge: boolean;
  evalTs: string | undefined;
}

export const SheetPanel = memo(function SheetPanel({
  screenId,
  sheet,
  rule,
  groups,
  states,
  loading,
  loaded,
  canJudge,
  evalTs,
}: SheetPanelProps) {
  const { showMessage } = useMessage();
  const idBase = useId();
  const [groupCode, setGroupCode] = useState(groups[0]?.code ?? "");
  const [material, setMaterial] = useState("");
  const [width, setWidth] = useState("");
  const [thick, setThick] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<PickedCell | null>(null);
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0);

  const grids = useMemo(
    () => new Map(groups.map((g) => [g.code, expandGroup(rule, g)])),
    [groups, rule],
  );
  const sheetShort = sheet.tab
    .replace("B.D 생산범위", "")
    .replace(/[()]/g, "")
    .trim();
  const group =
    groups.find((g) => g.code === groupCode) ?? groups[0] ?? undefined;

  const run = useCallback(
    async (code: string, w: string, t: string) => {
      const target = groups.find((g) => g.code === code);
      const found: Record<string, string> = {};
      if (!target) found.group = "재질 그룹을 고르세요";
      if (!NUM_RE.test(w.trim()))
        found.w = w.trim() === "" ? "폭을 넣으세요" : "숫자가 아닙니다";
      if (!NUM_RE.test(t.trim()))
        found.t = t.trim() === "" ? "두께를 넣으세요" : "숫자가 아닙니다";
      setErrors(found);
      if (Object.keys(found).length > 0 || !target) return;
      const wi = locate(target.widths, Number(w), "width");
      const ti = locate(target.thicks, Number(t), "thick");
      setPicked(wi >= 0 && ti >= 0 ? { group: code, wi, ti } : null);
      if (!canJudge) return;
      const id = ++runRef.current;
      setBusy(true);
      try {
        const out = await judgeRule(
          sheet.ruleId,
          { [GRP_VAR]: code, [WID_VAR]: w.trim(), [THK_VAR]: t.trim() },
          evalTs,
        );
        if (id === runRef.current) setResult(out);
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
    [groups, canJudge, sheet.ruleId, evalTs, showMessage],
  );

  const onPick = useCallback(
    (code: string, wi: number, ti: number) => {
      const g = groups.find((x) => x.code === code);
      if (!g) return;
      const w = String(g.widths[wi]?.value ?? "");
      const t = g.thicks[ti]?.label ?? "";
      setGroupCode(code);
      setMaterial("");
      setWidth(w);
      setThick(t);
      void run(code, w, t);
    },
    [groups, run],
  );

  const changeMaterial = (v: string) => {
    setMaterial(v);
    const g = groupOfMaterial(groups, v);
    if (g) setGroupCode(g.code);
  };
  const clear = () => {
    runRef.current += 1;
    setMaterial("");
    setWidth("");
    setThick("");
    setErrors({});
    setPicked(null);
    setResult(null);
    setBusy(false);
  };

  const groupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.code,
        label:
          g.materials.length > 0
            ? `${g.name} (${g.materials.join(", ")})`
            : g.name,
      })),
    [groups],
  );
  const materialGroup = material.trim()
    ? groupOfMaterial(groups, material)
    : undefined;

  const hitRow =
    result && result.hits[0]
      ? rule?.rows.find((r) => r.rowId === result.hits[0].rowId)
      : undefined;
  const hitState = result?.results[STAT_VAR];
  const hitStateMeta = stateOf(
    states,
    hitState === null || hitState === undefined ? null : String(hitState),
  );
  const band = (name: string, label: string) =>
    hitRow && rule
      ? conditionSentence(cellOf(rule.vars, hitRow, name)?.summary, label)
      : null;
  const pickedGroup = picked
    ? groups.find((g) => g.code === picked.group)
    : undefined;
  const inOverlay =
    pickedGroup && picked
      ? isOverlay(pickedGroup, picked.wi, picked.ti)
      : false;

  return (
    <ContentBody root>
      <ContentPanel scrollY>
        <CardFrame
          title={sheet.title}
          testId={`${screenId}-sheet-${sheet.key}`}
          right={
            <>
              {sheet.rev ? <Badge label={sheet.rev} tone="neutral" /> : null}{" "}
              {rule?.ver ? (
                <Badge
                  label={`v${rule.ver}${rule.applyFrom ? ` · ${rule.applyFrom} 적용` : ""}`}
                  tone="neutral"
                />
              ) : null}
            </>
          }
        >
          <div style={{ display: "grid", gap: 6 }}>
            <StateLegend states={states} />
            {sheet.notes.map((n) => (
              <span key={n}>{n}</span>
            ))}
            {sheet.post ? (
              <div
                style={{ overflowX: "auto", overscrollBehaviorX: "contain" }}
              >
                <MatrixTable
                  cornerHeader={
                    <span style={PRE_LINE}>{sheet.post.heads[0] ?? ""}</span>
                  }
                  columns={sheet.post.heads.slice(1).map((h, i) => ({
                    key: String(i + 1),
                    header: <span style={PRE_LINE}>{h}</span>,
                  }))}
                  rows={sheet.post.rows.map((r, ri) => ({
                    key: String(ri),
                    label: <b>{r[0]}</b>,
                    renderCell: (col) => r[Number(col)] ?? "",
                  }))}
                  align="center"
                />
              </div>
            ) : null}
            <b>-. 생산가능 Size (재질별)</b>
            {sheet.titleNote ? (
              <MutedText>※ {sheet.titleNote}</MutedText>
            ) : null}
            <MutedText>
              행: 폭(mm) — 그 값 이상 ~ 윗행 값 미만(맨 위 행은 그 값만) · 열:
              Full Hard 두께(mm) — 그 값 이상 ~ 다음 열 값 미만(마지막 열은 그
              값만). 칸을 누르면 그 값으로 판정합니다.
            </MutedText>
          </div>
        </CardFrame>
        {loaded && groups.length === 0 ? (
          <MutedText>
            기준일에 적용 중인 룰 버전이 없습니다. Maru 에 룰이 등록됐는지
            확인하세요.
          </MutedText>
        ) : null}
        {groups.map((g) => (
          <GroupMatrix
            key={g.code}
            screenId={screenId}
            group={g}
            grid={grids.get(g.code) ?? []}
            states={states}
            picked={
              picked && picked.group === g.code
                ? { wi: picked.wi, ti: picked.ti }
                : null
            }
            onPick={onPick}
            sheetShort={sheetShort}
          />
        ))}
      </ContentPanel>
      <ContentPanel width={340} scrollY>
        <CardFrame title="가부 간편조회" testId={`${screenId}-lookup`}>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>
                  <label htmlFor={`${idBase}-m`}>재질코드</label>
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    id={`${idBase}-m`}
                    data-testid={`${screenId}-lookup-material`}
                    value={material}
                    onChange={changeMaterial}
                    placeholder="예: BA (그룹 자동 선택)"
                    error={
                      material.trim() && !materialGroup
                        ? "이 시트에 없는 재질코드입니다"
                        : undefined
                    }
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>
                  <label htmlFor={`${idBase}-g`}>재질 그룹</label>
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  <Select
                    id={`${idBase}-g`}
                    data-testid={`${screenId}-lookup-group`}
                    value={group?.code ?? ""}
                    onChange={(v) => {
                      setGroupCode(v);
                      setMaterial("");
                    }}
                    options={groupOptions}
                    error={errors.group}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>
                  <label htmlFor={`${idBase}-w`}>폭 (mm)</label>
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    id={`${idBase}-w`}
                    data-testid={`${screenId}-lookup-width`}
                    value={width}
                    onChange={setWidth}
                    error={errors.w}
                    inputMode="decimal"
                    placeholder="예: 1150"
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>
                  <label htmlFor={`${idBase}-t`}>두께 (mm)</label>
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    id={`${idBase}-t`}
                    data-testid={`${screenId}-lookup-thick`}
                    value={thick}
                    onChange={setThick}
                    error={errors.t}
                    inputMode="decimal"
                    placeholder="예: 0.30"
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={DETAIL_VALUE_CELL}>
                  <Button
                    variant="primary"
                    data-testid={`${screenId}-lookup-run`}
                    onClick={() => void run(group?.code ?? "", width, thick)}
                    disabled={busy || loading || !canJudge}
                    title={!canJudge ? "판정 권한이 없습니다" : undefined}
                  >
                    판정
                  </Button>{" "}
                  <Button
                    variant="default"
                    data-testid={`${screenId}-lookup-clear`}
                    onClick={clear}
                  >
                    해제
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
          {result ? (
            <div
              data-testid={`${screenId}-lookup-result`}
              style={{ marginTop: 12, display: "grid", gap: 6 }}
            >
              <div>
                <Badge
                  label={JUDGE_STATUS_LABEL[result.status]}
                  tone={result.status === "MATCHED" ? "success" : "neutral"}
                />{" "}
                {result.ver ? <MutedText>v{result.ver}</MutedText> : null}
              </div>
              {result.status === "MATCHED" ? (
                <>
                  <div>
                    <span
                      style={{
                        ...SWATCH,
                        background:
                          hitStateMeta?.background ?? "var(--color-bg)",
                      }}
                    />
                    {pickedGroup?.name ?? group?.name} · 폭 {width} × 두께{" "}
                    {thick} :{" "}
                    <b style={{ fontSize: 16 }}>
                      {hitStateMeta?.name ?? String(hitState ?? "")}
                    </b>
                  </div>
                  {band(WID_VAR, "폭") ? (
                    <MutedText>폭 구간: {band(WID_VAR, "폭")}</MutedText>
                  ) : null}
                  {band(THK_VAR, "두께") ? (
                    <MutedText>두께 구간: {band(THK_VAR, "두께")}</MutedText>
                  ) : null}
                  <MutedText>
                    적중 행 순번 {result.hits[0]?.seq ?? "—"} (행 ID{" "}
                    {result.hits[0]?.rowId ?? "—"})
                  </MutedText>
                </>
              ) : (
                <MutedText>
                  {inOverlay
                    ? "주석 영역입니다(원본 시트 참조). 판정 행이 없습니다."
                    : result.status === "NO_MATCH"
                      ? "시트 범위 밖의 폭·두께입니다(해당 없음)."
                      : (result.message ?? "판정하지 못했습니다.")}
                </MutedText>
              )}
            </div>
          ) : (
            <MutedText>
              재질 그룹·폭·두께를 넣고 [판정] 을 누르거나 시트 칸을 누르세요.
            </MutedText>
          )}
        </CardFrame>
        <CardFrame title="범례">
          <div style={{ display: "grid", gap: 4 }}>
            {states.map((s) => (
              <span key={s.code}>
                <span
                  style={{
                    ...SWATCH,
                    background: s.background ?? "var(--color-bg)",
                  }}
                />
                <b>{s.code}</b> {s.name}
              </span>
            ))}
            <span>
              <span
                style={{ ...SWATCH, background: "var(--color-bg-disabled)" }}
              />
              주석 영역(판정 행 없음)
            </span>
          </div>
        </CardFrame>
      </ContentPanel>
    </ContentBody>
  );
});
