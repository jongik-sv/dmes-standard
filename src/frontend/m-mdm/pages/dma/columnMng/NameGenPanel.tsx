"use client";

/**
 * columnMng 「컬럼명 자동 생성」 영역 — 한국어 ↔ 물리명 분해, 토큰 표, 추천 도메인·중복 검사, [상세에 적용].
 *
 * 입력·분해 결과 state 는 이 컴포넌트에만 둔다(Screen-Performance-Guide R12). 분해 입력 한 글자마다 화면 루트가 다시 그려지지 않게 한다.
 * 루트와는 콜백 props(`onApply`·`onOpenColumn`·`onError`)와 `ref` 핸들(`reset`)로만 대화한다.
 * 분해 호출(compare)의 진행 표시는 루트의 `useBusy` 키 "compare" 를 쓴다(`run`) — 분해 중에는 루트 머리 버튼도 잠긴다(기존 동작).
 */
import { memo, useCallback, useImperativeHandle, useMemo, useState, type Ref } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { badgeStyle } from "@/shell";
import { uiCols } from "@/ui-meta";

import { compareName } from "./api";
import { mutedText, panelScrollStyle, panelTitleStyle, rowStyle } from "./styles";
import {
  PLACEHOLDER,
  composeLogicalName,
  composePhysName,
  hasPlaceholder,
  replaceToken,
  TOKEN_COLUMN_SIZES,
} from "./tokens";
import type { ColumnForm, CompareResult, Direction, NameToken, PickedTerm } from "./types";
import { TermRegPopModal } from "../termRegPop";

const STATUS_TEXT: Record<NameToken["status"], string> = {
  MATCHED: "등록됨",
  SYNONYM: "동의어",
  AMBIGUOUS: "동음이의어",
  NO_ABBR: "약어 없음",
  UNKNOWN: "미등록",
};

/** 사용자가 고른 동음이의어 — compare 를 다시 불러도 seq·surface 가 같으면 되살린다. */
type Picks = Record<number, { surface: string; term: PickedTerm }>;

/** [상세에 적용] 으로 루트에 넘기는 값 — 루트가 상세 폼 핸들(`apply`)과 구성 용어(`formTerms`)에 그대로 반영한다. */
export type NameGenApply = {
  patch: Partial<ColumnForm>;
  domainLabel?: string;
  appliedPhys: string | null;
  /** 구성 용어 ID(미등록·약어 없음 자리는 null). */
  terms: (number | null)[];
};

/** 루트가 이 영역과 대화하는 핸들. */
export type NameGenHandle = {
  /** [신규] — 분해 결과·입력·추천 도메인·동음이의어 선택을 비운다(방향 선택은 그대로). */
  reset(): void;
};

type Props = {
  ref: Ref<NameGenHandle>;
  /** columnMng × "compare" 권한. */
  canCompare: boolean;
  /** 루트의 어느 작업이든 진행 중인지 — 분해·적용 단추를 잠근다. */
  busy: boolean;
  /** 루트 `useBusy().run` — compare 호출을 키 "compare" 로 감싼다. */
  run: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
  onApply: (next: NameGenApply) => void;
  onOpenColumn: (columnId: number) => void;
  onError: (e: unknown) => void;
};

export const NameGenPanel = memo(function NameGenPanel({ ref, canCompare, busy, run, onApply, onOpenColumn, onError }: Props) {
  const [direction, setDirection] = useState<Direction>("FORWARD");
  const [genInput, setGenInput] = useState("");
  const [gen, setGen] = useState<CompareResult | null>(null);
  const [genTokens, setGenTokens] = useState<NameToken[]>([]);
  const [genDomain, setGenDomain] = useState("");
  const [picks, setPicks] = useState<Picks>({});
  const [popToken, setPopToken] = useState<NameToken | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        setGen(null);
        setGenTokens([]);
        setGenInput("");
        setGenDomain("");
        setPicks({});
      },
    }),
    [],
  );

  const runCompare = useCallback(
    (dir: Direction, input: string, keep: Picks) =>
      run("compare", async () => {
        try {
          const result = await compareName(dir, input);
          let tokens = result.tokens ?? [];
          for (const [seq, pick] of Object.entries(keep)) {
            const t = tokens.find((x) => x.seq === Number(seq));
            if (t && t.surface === pick.surface && t.status === "AMBIGUOUS") {
              tokens = replaceToken(tokens, t.seq, pick.term).map((x) =>
                x.seq === t.seq ? { ...x, status: "AMBIGUOUS" } : x,
              );
            }
          }
          setGen(result);
          setGenTokens(tokens);
          setGenDomain(
            result.recommendedDomainId != null
              ? String(result.recommendedDomainId)
              : "",
          );
        } catch (e) {
          onError(e);
        }
      }),
    [onError, run],
  );

  const handleDecompose = useCallback(() => {
    setPicks({});
    void runCompare(direction, genInput, {});
  }, [direction, genInput, runCompare]);

  const handlePickCandidate = useCallback(
    (token: NameToken, termId: string) => {
      const cand = token.candidates.find((c) => String(c.termId) === termId);
      if (!cand) return;
      const term: PickedTerm = {
        termId: cand.termId,
        termName: cand.termName,
        senseNo: cand.senseNo,
        engAbbr: cand.engAbbr ?? null,
      };
      setPicks((prev) => ({
        ...prev,
        [token.seq]: { surface: token.surface, term },
      }));
      setGenTokens((prev) =>
        replaceToken(prev, token.seq, term).map((x) =>
          x.seq === token.seq ? { ...x, status: "AMBIGUOUS" } : x,
        ),
      );
    },
    [],
  );

  /** 팝업에서 용어를 고르면(새로 등록했든 기존 유사어든) 그 자리를 바꾸고 compare 를 다시 불러 추천·중복·표시명을 새로 받는다. */
  const handleTermPicked = useCallback(
    (term: PickedTerm) => {
      if (!popToken) return;
      const replaced = replaceToken(genTokens, popToken.seq, term);
      const logical = composeLogicalName(replaced);
      setPopToken(null);
      setGenInput(logical);
      void runCompare("FORWARD", logical, picks);
    },
    [genTokens, picks, popToken, runCompare],
  );

  const previewPhys = gen
    ? gen.direction === "FORWARD"
      ? composePhysName(genTokens)
      : gen.physName
    : "";

  const handleApply = useCallback(() => {
    if (!gen) return;
    const forward = gen.direction === "FORWARD";
    const phys = forward ? composePhysName(genTokens) : gen.physName;
    const logical = forward ? composeLogicalName(genTokens) : gen.logicalName;
    const rec = genDomain
      ? gen.domains.find((d) => String(d.domainId) === genDomain)
      : undefined;
    onApply({
      patch: {
        columnName: logical,
        physName: phys,
        ...(forward && gen.labels
          ? {
              labelLong: gen.labels.labelLong,
              labelMid: gen.labels.labelMid,
              labelShort: gen.labels.labelShort,
            }
          : {}),
        ...(genDomain ? { domainId: genDomain } : {}),
      },
      domainLabel: genDomain
        ? (rec?.domainName ?? `도메인 ${genDomain}`)
        : undefined,
      appliedPhys: hasPlaceholder(genTokens) ? null : phys,
      terms: genTokens.map((t) =>
        t.status === "UNKNOWN" || t.status === "NO_ABBR" ? null : t.termId,
      ),
    });
  }, [gen, genDomain, genTokens, onApply]);

  // ── 분해 토큰 그리드 ──────────────────────────────────────────────────
  // 처리 칸은 ACTION 값으로 그린다 — 행 키로 갱신하는 그리드는 값이 바뀐 칸만 다시 그리므로, 보이는 내용(상태·용어·방향)이
  // 바뀌면 값도 바뀌게 한다. 동음이의(AMBIGUOUS) 행은 칸을 눌러 후보를 고르며 값은 고른 termId 다.
  const genDirection = gen?.direction;
  const tokenRows = useMemo(
    () =>
      genTokens.map((t) => ({
        seq: t.seq,
        surface: t.surface,
        status: t.status,
        MATCH_TEXT: t.termName
          ? `${t.termName}${t.senseNo && t.senseNo > 1 ? ` (${t.senseNo})` : ""}`
          : "—",
        ABBR_TEXT:
          t.status === "UNKNOWN" || t.status === "NO_ABBR" ? PLACEHOLDER : t.abbr,
        ACTION:
          t.status === "AMBIGUOUS"
            ? t.termId != null
              ? String(t.termId)
              : ""
            : `${t.status}|${t.termId ?? ""}|${t.termName ?? ""}|${genDirection ?? ""}`,
      })),
    [genTokens, genDirection],
  );
  const tokenColumns = useMemo<GridColumn[]>(
    () => uiCols([
      {
        key: "seq",
        header: "순서",
        ...TOKEN_COLUMN_SIZES.seq,
        align: "right",
        render: (v) => <span data-testid={`token-row-${v}`}>{String(v)}</span>,
      },
      { key: "surface", header: "토큰", ...TOKEN_COLUMN_SIZES.surface },
      { key: "MATCH_TEXT", header: "매칭", ...TOKEN_COLUMN_SIZES.MATCH_TEXT },
      { key: "ABBR_TEXT", header: "약어", ...TOKEN_COLUMN_SIZES.ABBR_TEXT },
      {
        key: "ACTION",
        header: "처리",
        ...TOKEN_COLUMN_SIZES.ACTION,
        tooltip: false,
        editable: (row) => row.status === "AMBIGUOUS",
        cellEditor: "select",
        cellEditorOptionsGetter: (row) =>
          (genTokens.find((t) => t.seq === row.seq)?.candidates ?? []).map((c) => ({
            value: String(c.termId),
            label: `${c.termName} (${c.senseNo}) ${c.engAbbr ?? ""}`,
          })),
        render: (_v, row) => {
          const t = genTokens.find((x) => x.seq === row.seq);
          return t ? renderAction(t) : null;
        },
      },
    ]),
    // renderAction 은 gen 방향·후보 선택 처리기를 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [genTokens, genDirection, handlePickCandidate],
  );
  const handleTokenCellChange = useCallback(
    (p: { rowKey: string | number; newValue: unknown }) => {
      const t = genTokens.find((x) => String(x.seq) === String(p.rowKey));
      if (t && p.newValue != null && p.newValue !== "") handlePickCandidate(t, String(p.newValue));
    },
    [genTokens, handlePickCandidate],
  );

  return (
    <div style={panelScrollStyle}>
      <p style={panelTitleStyle}>컬럼명 자동 생성</p>
      <div style={rowStyle}>
        <Select
          data-testid="gen-direction"
          value={direction}
          options={[
            { value: "FORWARD", label: "한국어 → 물리명" },
            { value: "REVERSE", label: "물리명 → 논리명" },
          ]}
          onChange={(v) => setDirection(v as Direction)}
          style={{ width: 160 }}
        />
        <Input
          data-testid="gen-input"
          value={genInput}
          placeholder={
            direction === "FORWARD"
              ? "예: 원재료 코일두께"
              : "예: RMTL_COIL_THK"
          }
          onChange={setGenInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCompare && genInput.trim())
              handleDecompose();
          }}
          style={{ width: 240 }}
        />
        <Button
          data-testid="gen-decompose"
          variant="primary"
          onClick={handleDecompose}
          disabled={busy || !canCompare || !genInput.trim()}
        >
          분해
        </Button>
      </div>

      {gen ? (
        <>
          <div style={{ marginTop: "var(--spacing-sm)" }}>
            <AgDataGrid gridId="nameTokens"
              title="분해 토큰"
              columnSizing="fit"
              columns={tokenColumns}
              data={tokenRows}
              rowKey="seq"
              height="auto"
              singleClickEdit
              stopEditingWhenCellsLoseFocus
              onCellValueChanged={handleTokenCellChange}
            />
          </div>

          <table
            style={{
              ...DETAIL_TABLE_STYLE,
              marginTop: "var(--spacing-sm)",
            }}
          >
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>
                  <MdmFieldLabel
                    name="genPreview"
                    meta={false}
                    label={
                      gen.direction === "FORWARD"
                        ? "물리명 미리보기"
                        : "논리명"
                    }
                  />
                </th>
                <td style={DETAIL_VALUE_CELL} data-testid="gen-preview">
                  {gen.direction === "FORWARD"
                    ? previewPhys
                    : gen.logicalName}
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="genDomain" meta={false} label="추천 도메인" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Select
                    data-testid="gen-domain"
                    value={genDomain}
                    options={[
                      {
                        value: "",
                        label:
                          gen.domains.length === 0
                            ? "추천 없음"
                            : "선택 안 함",
                      },
                      ...gen.domains.map((d) => ({
                        value: String(d.domainId),
                        label: `${d.domainName} (${d.stdName})`,
                      })),
                    ]}
                    onChange={setGenDomain}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="genDuplicates" meta={false} label="중복 검사" /></th>
                <td
                  style={DETAIL_VALUE_CELL}
                  data-testid="gen-duplicates"
                >
                  {gen.duplicates.length === 0 ? (
                    <span style={badgeStyle("success")}>신규</span>
                  ) : (
                    gen.duplicates.map((d, i) => (
                      <div
                        key={`${d.columnId}-${d.matchedBy}-${i}`}
                        style={rowStyle}
                      >
                        <span style={badgeStyle("warning")}>
                          {d.matchedBy}
                        </span>
                        <span>
                          {d.systemCode ? `${d.systemCode} · ` : ""}
                          {d.columnName} ({d.physName}) —{" "}
                          {d.domainName ?? "-"}
                        </span>
                        <Button
                          size="mini"
                          onClick={() => onOpenColumn(d.columnId)}
                        >
                          열기
                        </Button>
                      </div>
                    ))
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ ...rowStyle, marginTop: "var(--spacing-sm)" }}>
            <Button
              data-testid="gen-apply"
              onClick={handleApply}
              disabled={busy}
            >
              상세에 적용
            </Button>
          </div>
        </>
      ) : (
        <p style={{ ...mutedText, marginTop: "var(--spacing-sm)" }}>
          한국어 논리명을 넣고 [분해]를 누르면 용어로 나눠 표준 물리명을
          만듭니다.
        </p>
      )}

      <TermRegPopModal
        open={popToken != null}
        token={popToken?.surface ?? ""}
        onSelect={handleTermPicked}
        onClose={() => setPopToken(null)}
      />
    </div>
  );

  // 처리 칸은 render 전용이라 셀 툴팁을 끈다(tooltip:false). 최소 폭(220px)에서 긴 후보 이름·안내가 말줄임돼도 전체를 보도록
  // 글자·버튼마다 제목(title)을 붙인다(Local-Rules §30, 2026-10-03).
  function renderAction(t: NameToken) {
    const titled = (text: string) => <span title={text}>{text}</span>;
    switch (t.status) {
      case "MATCHED":
        return titled("등록됨");
      case "SYNONYM":
        return titled(`동의어 → ${t.termName ?? ""}`);
      case "AMBIGUOUS": {
        // 칸을 누르면 후보 편집기가 열린다(그리드 인라인 편집)
        const picked = t.candidates.find((c) => c.termId === t.termId);
        const text = picked ? `${picked.termName} (${picked.senseNo}) ${picked.engAbbr ?? ""}` : "후보를 고르세요";
        return (
          <span data-testid={`token-candidate-${t.seq}`} title={text}>
            {picked ? text : <span style={mutedText}>{text}</span>}
          </span>
        );
      }
      case "NO_ABBR":
        return titled("약어 없음 — 용어 관리에서 약어 등록");
      case "UNKNOWN":
        return gen?.direction === "FORWARD" ? (
          <Button
            size="mini"
            data-testid={`token-placeholder-${t.seq}`}
            title={`${PLACEHOLDER} 용어 등록`}
            onClick={() => setPopToken(t)}
          >
            {PLACEHOLDER} 용어 등록
          </Button>
        ) : (
          <span data-testid={`token-placeholder-${t.seq}`} title={STATUS_TEXT.UNKNOWN}>
            {STATUS_TEXT.UNKNOWN}
          </span>
        );
      default:
        return titled(STATUS_TEXT[t.status]);
    }
  }
});
