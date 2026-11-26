"use client";

/**
 * termMng 상세 폼(A-DETAIL) + 유사어 추천(A-RECO).
 *
 * 입력 state 는 이 컴포넌트에만 둔다(Screen-Performance-Guide R12). 화면 루트가 폼을 들고 있으면 한 글자마다 루트 전체와
 * 추천 그리드 셀이 다시 그려졌다(docs/perf-render/mdm-after-fix.md §3.2). 루트는 `ref` 핸들로 폼을 채우고(`load`)
 * 저장 때 읽는다(`getForm`) — 저장 단추가 루트의 머리 버튼 줄에 있기 때문이다.
 */
import { memo, useCallback, useImperativeHandle, useMemo, useState, type Ref } from "react";

import { ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, Textarea } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { useDebouncedEffect } from "@/hooks/use-debounced-effect";

import { recommend } from "./api";
import type { RecommendCandidate, TermForm } from "./types";

/** 루트가 상세 폼과 대화하는 핸들. */
export type TermDetailHandle = {
  /**
   * 폼을 새로 채운다(행 선택·등록·조회 뒤 비우기). 추천 후보는 `clearCandidates` 일 때만 비운다 — 행 선택은 새 추천이 올 때까지
   * 이전 후보를 그대로 보인다(분리 전 동작).
   */
  load(form: TermForm | null, opts?: { clearCandidates?: boolean }): void;
  /** 지금 입력된 폼 값(저장용). */
  getForm(): TermForm | null;
};

/** A-RECO 유사어 추천 그리드 열. 행 키는 `{stage}-{termId}`(같은 용어가 1차·2차에 함께 나올 수 있다). */
const RECO_COLUMNS_BASE: GridColumn[] = [
  { key: "stageText", header: "구분", meta: false, width: 70, align: "center" },
  { key: "termName", header: "표기", width: 120, align: "left" },
  { key: "engName", header: "영문명", width: 150, align: "left" },
  { key: "systemsText", header: "사용 시스템", meta: "SYS_LIST", width: 110, align: "left" },
  { key: "scoreText", header: "유사도", meta: false, width: 70, align: "right" },
];

/** D-002(표기)가 2자 이상이어야 1차 추천을 실행한다(I18). */
const MIN_RECOMMEND_LENGTH = 2;

/** 추천 개수 입력 범위(서버 검사와 같다). 처음 값은 서버 기본값과 같은 5. */
const RECO_COUNT_MIN = 1;
const RECO_COUNT_MAX = 100;
const RECO_COUNT_DEFAULT = "5";

/** 입력 칸 글을 추천 개수로 바꾼다. 범위 밖이거나 정수가 아니면 보내지 않는다(서버 설정을 쓴다). */
export function parseRecoCount(text: string): number | undefined {
  if (!/^\d+$/.test(text.trim())) return undefined;
  const n = Number(text.trim());
  return n >= RECO_COUNT_MIN && n <= RECO_COUNT_MAX ? n : undefined;
}

type TextField = Exclude<keyof TermForm, "termId">;

/** 상세 표 한 줄. `name` 은 칸이 바인딩한 폼 키 — 라벨 툴팁이 MDM 컬럼 사전에서 찾는다(`meta={false}` 면 끈다). */
function Row({
  name,
  meta,
  label,
  required,
  children,
}: {
  name: string;
  meta?: false;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <th style={DETAIL_LABEL_CELL}>
        <MdmFieldLabel name={name} meta={meta} label={label} required={required} />
      </th>
      <td style={DETAIL_VALUE_CELL}>{children}</td>
    </tr>
  );
}

export const TermDetailPane = memo(function TermDetailPane({ ref, busy }: { ref: Ref<TermDetailHandle>; busy: boolean }) {
  const [form, setForm] = useState<TermForm | null>(null);
  const [candidates, setCandidates] = useState<RecommendCandidate[]>([]);
  const [stage2Enabled, setStage2Enabled] = useState(false);
  // 추천 개수 입력 칸 글. 고른 행이 바뀌어도 그대로 둔다.
  const [stage1Count, setStage1Count] = useState(RECO_COUNT_DEFAULT);
  const [stage2Count, setStage2Count] = useState(RECO_COUNT_DEFAULT);
  const stage1TopN = parseRecoCount(stage1Count);
  const stage2TopN = parseRecoCount(stage2Count);

  useImperativeHandle(
    ref,
    () => ({
      load: (next, opts) => {
        setForm(next);
        // 이미 비어 있으면 그대로 둔다 — 새 빈 배열은 같은 내용으로 한 번 더 그리게 한다(R7).
        if (opts?.clearCandidates) setCandidates((prev) => (prev.length === 0 ? prev : []));
      },
      getForm: () => form,
    }),
    [form],
  );

  const change = useCallback((key: TextField, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  /** A-RECO — D-002·D-004·D-007 중 하나라도 바뀌고 표기가 2자 이상이면 디바운스 후 compare 1회. */
  useDebouncedEffect(
    async (signal) => {
      if (!form || form.termName.trim().length < MIN_RECOMMEND_LENGTH) {
        setCandidates((prev) => (prev.length === 0 ? prev : []));
        setStage2Enabled(false);
        return;
      }
      try {
        const payload = await recommend(form.termId, form.termName, form.definition, form.engName, signal, {
          stage1TopN,
          stage2TopN,
        });
        setCandidates(payload.candidates ?? []);
        setStage2Enabled(!!payload.stage2Enabled);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        // 추천 실패는 조용히 무시한다 — 화면 핵심 흐름(저장)을 막지 않는다.
      }
    },
    [form?.termName, form?.definition, form?.engName, form?.termId, stage1TopN, stage2TopN],
    300,
  );

  /** B-005/GB-001 동의어로 확정 — D12(a): 후보의 termName+후보의 systems 를 "{name}({systems})" 로 붙인다. */
  const handleConfirmSynonym = useCallback((candidate: RecommendCandidate) => {
    const systemsPart = candidate.systems && candidate.systems.length > 0 ? `(${candidate.systems.join(",")})` : "";
    const entry = `${candidate.termName}${systemsPart}`;
    setForm((prev) => {
      if (!prev) return prev;
      const existing = prev.synonyms.split(",").map((s) => s.trim()).filter(Boolean);
      if (existing.includes(entry)) return prev;
      return { ...prev, synonyms: [...existing, entry].join(",") };
    });
  }, []);

  const recoRows = useMemo(
    () =>
      candidates
        .filter((c) => c.stage === "1" || stage2Enabled)
        .map((c) => ({
          ...c,
          recoKey: `${c.stage}-${c.termId}`,
          stageText: c.stage === "1" ? "1차 이름" : "2차 의미",
          systemsText: (c.systems ?? []).join(", "),
          scoreText: c.score.toFixed(2),
        })),
    [candidates, stage2Enabled],
  );
  // 열 정의는 폼 값이 아니라 "폼이 있는지"에만 의존한다 — 폼 객체에 의존하면 한 글자마다 추천 그리드 셀이 다시 그려진다(R12).
  const hasForm = form != null;
  const recoColumns = useMemo<GridColumn[]>(
    () => [
      ...RECO_COLUMNS_BASE.map((col) =>
        col.key === "termName"
          ? {
              ...col,
              render: (v: unknown, r: Record<string, unknown>) => (
                <span data-testid={`reco-candidate-${String(r.recoKey)}`}>{String(v ?? "")}</span>
              ),
            }
          : col,
      ),
      {
        key: "confirm",
        header: "",
        meta: false,
        width: 110,
        align: "center",
        sortable: false,
        tooltip: false,
        render: (_v: unknown, r: Record<string, unknown>) => (
          <Button size="mini" data-testid={`reco-confirm-${String(r.recoKey)}`} disabled={!hasForm} onClick={() => handleConfirmSynonym(r as unknown as RecommendCandidate)}>
            동의어로 확정
          </Button>
        ),
      },
    ],
    [hasForm, handleConfirmSynonym],
  );

  const disabled = !form || busy;
  const field = (key: TextField, placeholder?: string) => (
    <Input value={form?.[key] ?? ""} placeholder={placeholder} disabled={disabled} onChange={(v) => change(key, v)} />
  );
  const area = (key: TextField, rows: number) => (
    <Textarea value={form?.[key] ?? ""} rows={rows} disabled={disabled} onChange={(v) => change(key, v)} />
  );

  return (
    <>
      <ContentPanel>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <Row name="termName" label="표기" required>{field("termName")}</Row>
            <Row name="senseNo" label="의미 번호" required>{field("senseNo")}</Row>
            <Row name="definition" label="정의" required>{area("definition", 3)}</Row>
            <Row name="context" label="맥락">{field("context")}</Row>
            <Row name="systems" label="사용 시스템">{field("systems", "MES,ERP")}</Row>
            <Row name="engName" label="영문명">{field("engName")}</Row>
            <Row name="engAbbr" label="영문 약어">{field("engAbbr")}</Row>
            <Row name="synonyms" label="동의어">{field("synonyms", "배치(ERP)")}</Row>
            <Row name="aliases" label="별칭">{field("aliases", "코일ID,COIL_ID")}</Row>
            <Row name="stdBasis" label="표준 결정 근거">{area("stdBasis", 2)}</Row>
          </tbody>
        </table>
        {!form && (
          <p style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
            목록에서 행을 선택하거나 [등록] 을 눌러 작성하세요.
          </p>
        )}
      </ContentPanel>

      <RecoPanel
        rows={recoRows}
        columns={recoColumns}
        stage2Enabled={stage2Enabled}
        stage1Count={stage1Count}
        stage2Count={stage2Count}
        onStage1CountChange={setStage1Count}
        onStage2CountChange={setStage2Count}
      />
    </>
  );
});

/** 추천 개수 입력 칸 하나(라벨 + 숫자 칸). 범위 밖 값이면 칸을 오류 모양으로 보이고 서버 설정을 쓴다. */
function RecoCountField({
  label,
  value,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  testId: string;
  onChange: (v: string) => void;
}) {
  const invalid = value.trim() !== "" && parseRecoCount(value) === undefined;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-xs)" }}>
      <span>{label}</span>
      <Input
        type="number"
        data-testid={testId}
        aria-label={`${label} 추천 개수`}
        aria-invalid={invalid}
        title={`${RECO_COUNT_MIN}~${RECO_COUNT_MAX}. 비우면 서버 설정(5)을 씁니다.`}
        className={invalid ? "form-error" : undefined}
        min={RECO_COUNT_MIN}
        max={RECO_COUNT_MAX}
        step={1}
        value={value}
        disabled={disabled}
        style={{ width: 64 }}
        onChange={onChange}
      />
    </label>
  );
}

/** 유사어 추천 그리드 — 상세 칸 입력 중에는 props 가 그대로라 다시 그리지 않는다(R12). */
const RecoPanel = memo(function RecoPanel({
  rows,
  columns,
  stage2Enabled,
  stage1Count,
  stage2Count,
  onStage1CountChange,
  onStage2CountChange,
}: {
  rows: Record<string, unknown>[];
  columns: GridColumn[];
  stage2Enabled: boolean;
  stage1Count: string;
  stage2Count: string;
  onStage1CountChange: (v: string) => void;
  onStage2CountChange: (v: string) => void;
}) {
  return (
    <ContentPanel height={300}>
      <GridPanel
        title={`유사어 추천${stage2Enabled ? "" : " (1차 이름 비교만, 임베딩 인코더 꺼짐)"}`}
        count={rows.length}
        headerExtra={
          <>
            <RecoCountField label="1차 이름" value={stage1Count} testId="reco-count-stage1" onChange={onStage1CountChange} />
            <RecoCountField
              label="2차 의미"
              value={stage2Count}
              disabled={!stage2Enabled}
              testId="reco-count-stage2"
              onChange={onStage2CountChange}
            />
          </>
        }
      >
        <AgDataGrid gridId="similarReco"
          ariaLabel="유사어 추천"
          columnSizing="fit"
          columns={columns}
          data={rows}
          rowKey="recoKey"
          emptyMessage="표기를 2자 이상 입력하면 비슷한 용어를 보여 줍니다."
        />
      </GridPanel>
    </ContentPanel>
  );
});
