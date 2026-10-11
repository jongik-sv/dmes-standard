"use client";

/**
 * 다시 가져오기 반영(D10, S2-14) — 검토 패널 "DB 차이" 탭. DB 와 모델의 차이 목록에서 사람이 고른 항목만 DRAFT 에 넣는다.
 * - 요청은 import kind=APPLY_DIFF(itemsJson = 고른 항목 id, 차이 목록 순서)다. 서버가 잠금 안에서 차이를 다시 계산해 restore 하나로 넣고,
 *   확정·기각한 관계 상태를 지킨다. 모델 변화는 SSE change 로 들어온다. 이 부품은 델타를 얹지 않는다.
 * - 이 요청은 편집 문맥의 명령 줄(ctx.apply)을 거치지 않고 ctx.exclusive 안에서 보낸다(같은 세션 에코를 다른 묶음의 에코로 잘못 읽지 않게). 보내는 중인 묶음이 있으면 단추를 막는다.
 * - FK_ADDED 를 고르면 그 FK 에 딸린 TABLE_ADDED·COLUMN_ADDED 를 함께 보낸다(withFkCompanions).
 *   이 rev 는 Ctrl+Z(내 마지막 명령) 대상이 아니다. 되돌리기는 변경 기록 탭에서 그 rev 를 고른다.
 * - 표·컬럼을 지우는 항목(TABLE_REMOVED·COLUMN_REMOVED)이 있으면 확인을 받는다.
 * - 거절은 서버 문구를 알림으로 보인다. 낡은 항목이면 차이를 다시 읽는다. 모델이 바뀌면 늦은 응답을 순번으로 버린다(Local-Rules §37).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { applyDbDiff } from "../api";
import { typeText } from "../canvas/erd-geometry";
import type { ErdEditContext } from "../edit-context";
import { shortReason } from "../state/permissions";
import type { ErdColumnSpec, ErdDbDiffItem, ErdDbDiffView, ErdDiffApplySummary, ErdRejection } from "../types";

export const DIFF_LABEL: Record<ErdDbDiffItem["kind"], string> = {
  TABLE_ADDED: "DB 에 생긴 표", TABLE_REMOVED: "DB 에서 사라진 표", COLUMN_ADDED: "DB 에 생긴 컬럼", COLUMN_REMOVED: "DB 에서 사라진 컬럼",
  COLUMN_CHANGED: "컬럼 다름", FK_ADDED: "DB 에 생긴 FK", FK_REMOVED: "DB 에서 사라진 FK",
};
const KIND_ORDER = Object.keys(DIFF_LABEL) as ErdDbDiffItem["kind"][];

const specText = (s: ErdColumnSpec | null): string => (s ? `${typeText(s)}${s.notNull ? " NN" : ""}` : "");

/** 단계 1 차이 행(검토 패널 읽기 목록과 같은 값). */
export function diffRows(view: ErdDbDiffView | null): Record<string, unknown>[] {
  if (!view) return [];
  return view.items.map((i) => ({ id: i.id, kind: DIFF_LABEL[i.kind], table: i.table, column: i.column ?? "", before: specText(i.before), after: specText(i.after) }));
}

export const APPLY_LIMIT = 500;
const REMOVING: ReadonlySet<ErdDbDiffItem["kind"]> = new Set<ErdDbDiffItem["kind"]>(["TABLE_REMOVED", "COLUMN_REMOVED"]);

/** 고른 id 를 차이 목록 순서로. 목록에 없는 id 는 뺀다. */
export function orderedSelection(view: ErdDbDiffView | null, selected: readonly string[]): string[] {
  if (!view) return [];
  const want = new Set(selected);
  return view.items.filter((i) => want.has(i.id)).map((i) => i.id);
}

/** FK_ADDED 항목 id: `FK_ADDED:<자식>(<컬럼,…>)><부모>(<컬럼,…>)`(ErdDbDiff.fkKey). */
const FK_ID_RE = /^FK_ADDED:([^(]+)\(([^)]*)\)>([^(]+)\(([^)]*)\)$/;

/**
 * FK_ADDED 를 고르면 그 FK 의 부모 표 TABLE_ADDED 와 부모·자식 컬럼 COLUMN_ADDED 가 차이 목록에 있을 때 함께 고른다.
 * 서버는 부모·자식 표나 컬럼을 풀 수 없는 FK_ADDED 를 낡은 항목(INVALID itemsJson)으로 거절한다(README "다시 가져오기 반영").
 * 고른 순서를 지키고 더한 id 를 뒤에 붙인다. 보낼 때는 orderedSelection 으로 차이 목록 순서로 다시 줄 세운다.
 */
export function withFkCompanions(view: ErdDbDiffView | null, ids: readonly string[]): string[] {
  const out = [...ids];
  if (!view) return out;
  const present = new Set(view.items.map((i) => i.id));
  const seen = new Set(ids);
  const add = (id: string) => {
    if (present.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const id of ids) {
    const m = FK_ID_RE.exec(id);
    if (!m) continue;
    const [, child, childCols, parent, parentCols] = m;
    add(`TABLE_ADDED:${parent}`);
    for (const c of parentCols.split(",")) add(`COLUMN_ADDED:${parent}.${c}`);
    for (const c of childCols.split(",")) add(`COLUMN_ADDED:${child}.${c}`);
  }
  return out;
}

export function selectionSummary(view: ErdDbDiffView | null, ids: readonly string[]): string {
  if (!view) return "";
  const want = new Set(ids);
  const counts = new Map<ErdDbDiffItem["kind"], number>();
  for (const i of view.items) if (want.has(i.id)) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  return KIND_ORDER.filter((k) => counts.has(k)).map((k) => `${DIFF_LABEL[k]} ${counts.get(k)}`).join(" · ");
}

export function removingCount(view: ErdDbDiffView | null, ids: readonly string[]): number {
  if (!view) return 0;
  const want = new Set(ids);
  return view.items.filter((i) => want.has(i.id) && REMOVING.has(i.kind)).length;
}

type CountKey = Exclude<keyof ErdDiffApplySummary, "items" | "removedIds">;
const SUMMARY_LABEL: [CountKey, string][] = [
  ["tablesAdded", "표 추가"], ["tablesRemoved", "표 삭제"], ["columnsAdded", "컬럼 추가"], ["columnsRemoved", "컬럼 삭제"],
  ["columnsChanged", "컬럼 바뀜"], ["relationsAdded", "관계 추가"], ["dbFkSet", "DB FK 표시"], ["dbFkCleared", "DB FK 해제"],
];

/** 가져온 결과 글. 사람 글에는 rev 를 넣지 않는다(rev 는 결과 줄 title 에만). */
export function applySummaryText(s: ErdDiffApplySummary): string {
  const parts = SUMMARY_LABEL.filter(([k]) => s[k] > 0).map(([k, label]) => `${label} ${s[k]}`);
  if (s.removedIds.length > 0) parts.push(`지운 요소 ${s.removedIds.length}개`);
  return `${s.items}건을 가져왔습니다${parts.length > 0 ? ` — ${parts.join(" · ")}` : ""}`;
}

export function applyBlockReason(ctx: Pick<ErdEditContext, "rights" | "pendingIds">, count: number): string | null {
  if (!ctx.rights.model.ok) return `읽기 전용 — ${shortReason(ctx.rights.model.reason ?? "모델을 고칠 수 없습니다.")}`; // 긴 이유는 위 막대 칩이 맡는다(U19)
  if (count === 0) return "항목을 먼저 고르세요.";
  if (count > APPLY_LIMIT) return `한 번에 ${APPLY_LIMIT}건까지 가져옵니다. 나눠서 고르세요.`;
  if (ctx.pendingIds.size > 0) return "보내는 중인 변경이 끝난 뒤 가져오세요.";
  return null;
}

export function rejectionLine(r: ErdRejection | null): string {
  if (!r) return "가져오기가 거절되었습니다.";
  // 기계용 hint 는 화면에 보이지 않는다(U27) — 사람이 읽는 userHint 만 쓴다.
  return r.userHint ? `${r.message} — ${r.userHint}` : r.message;
}

/** 낡은 항목 거절(README: INVALID, property itemsJson, choices = 낡은 id 전부)이면 그 id. */
export function staleIdsOf(r: ErdRejection | null): string[] {
  return r?.code === "INVALID" && r.property === "itemsJson" && Array.isArray(r.choices) ? r.choices.map(String) : [];
}

const DIFF_COLUMNS: GridColumn[] = [
  { key: "kind", header: "종류", width: 150, meta: false },
  { key: "table", header: "표", width: 200, meta: false },
  { key: "column", header: "컬럼", width: 160, meta: false },
  { key: "before", header: "모델", width: 160, meta: false },
  { key: "after", header: "DB", width: 160, meta: false },
];
const WRAP: CSSProperties = { position: "absolute", inset: 0, display: "flex", flexDirection: "column" };
const BAR: CSSProperties = { flex: "none", display: "flex", alignItems: "center", gap: "var(--spacing-xs)", padding: "var(--spacing-xs) var(--spacing-sm)" };
const NOTE: CSSProperties = { flex: "none", minHeight: 18, padding: "0 var(--spacing-sm)", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const RESULT: CSSProperties = { ...NOTE, color: "var(--color-success)" };
const STALE: CSSProperties = { ...NOTE, color: "var(--color-danger)" };
const GRID_BOX: CSSProperties = { position: "relative", flex: 1, minHeight: 0 };
const FILL: CSSProperties = { position: "absolute", inset: 0 };

export interface DbDiffApplyProps {
  ctx: ErdEditContext;
  diff: ErdDbDiffView | null;
  onReload(): void;
}

export function DbDiffApply({ ctx, diff, onReload }: DbDiffApplyProps) {
  const { showMessage } = useMessage();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;
  const seq = useRef(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; rev: number } | null>(null);
  const [stale, setStale] = useState(0);
  const rows = useMemo(() => diffRows(diff), [diff]);

  // 모델이 바뀌면 고르기·결과를 비우고, 날아오는 옛 응답을 버린다.
  useEffect(() => {
    seq.current += 1;
    setSelected([]);
    setResult(null);
    setStale(0);
    setBusy(false);
  }, [ctx.modelId]);
  // 차이를 다시 읽으면 목록에 없는 고르기를 뺀다.
  useEffect(() => {
    const present = new Set(diff?.items.map((i) => i.id) ?? []);
    setSelected((cur) => {
      const next = cur.filter((id) => present.has(id));
      return next.length === cur.length ? cur : next;
    });
  }, [diff]);

  const picked = useMemo(() => orderedSelection(diff, selected), [diff, selected]);
  // FK_ADDED 에 딸린 TABLE_ADDED·COLUMN_ADDED 를 함께 보낸다. 상한·안내 줄도 이 목록으로 센다.
  const ids = useMemo(() => orderedSelection(diff, withFkCompanions(diff, picked)), [diff, picked]);
  const extra = ids.length - picked.length;
  // 확인창이 떠 있는 동안 단추를 막는다(두 번 눌러 확인창 둘 → 두 번 보내기 방지).
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);
  const block = busy ? "가져오는 중입니다." : confirming ? "확인창에서 고르세요." : applyBlockReason(ctx, ids.length);
  const onRowSelect = useCallback((keys: (string | number)[]) => {
    setSelected(keys.map(String));
    setStale(0); // 다시 고르기 시작하면 낡은 항목 안내를 내린다
  }, []);

  const send = useCallback(async (itemIds: string[]) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const c = ctxRef.current;
    const mine = ++seq.current;
    setBusy(true);
    setResult(null);
    setStale(0);
    try {
      // 내 쓰기 줄이 빈 뒤 보낸다(README: apply 밖의 쓰기는 ctx.exclusive 안). baseRev 는 보낼 때의 rev 다.
      const r = await c.exclusive(() => applyDbDiff(c.modelId, ctxRef.current.state.rev, c.session, itemIds));
      if (seq.current !== mine) return;
      if (r.applied) {
        setResult({ text: r.summary ? applySummaryText(r.summary) : "가져왔습니다.", rev: r.rev });
        setSelected([]);
        reloadRef.current();
        return;
      }
      ctxRef.current.notify(rejectionLine(r.rejection), "error");
      const staleIds = staleIdsOf(r.rejection);
      if (staleIds.length > 0) {
        setStale(staleIds.length);
        reloadRef.current();
      }
    } catch (e) {
      if (seq.current === mine) ctxRef.current.notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      inFlight.current = false;
      if (seq.current === mine) setBusy(false);
    }
  }, []);

  const onApply = () => {
    if (block) return;
    const itemIds = ids;
    const n = removingCount(diff, itemIds);
    if (n === 0) {
      void send(itemIds);
      return;
    }
    // 확인창이 떠 있는 동안 모델·권한·대기 묶음이 바뀌었으면 보내지 않는다(옛 모델의 id 를 새 모델에 보내지 않게).
    const modelAt = ctx.modelId;
    const seqAt = seq.current;
    setConfirming(true);
    showMessage({
      alertType: "confirm",
      title: "DB 다시 가져오기",
      message: `고른 항목 중 ${n}건은 모델에서 표·컬럼을 지웁니다. 그 표·컬럼에 걸린 키·관계도 함께 지워집니다. 가져올까요?`,
      onConfirm: () => {
        setConfirming(false);
        const c = ctxRef.current;
        if (c.modelId !== modelAt || seq.current !== seqAt || applyBlockReason(c, itemIds.length) !== null) return;
        void send(itemIds);
      },
      onCancel: () => setConfirming(false),
    });
  };

  // 꺼진 이유는 note 와 같은 글이다(U34)
  const runTip = block ?? undefined;
  const note = ids.length > 0
    ? `고른 ${ids.length}건${extra > 0 ? `(FK 에 딸린 ${extra}건 포함)` : ""}: ${selectionSummary(diff, ids)}${block ? ` — ${block}` : ""}`
    : block ?? "";

  return (
    <div data-testid="erd-diff-apply" style={WRAP}>
      <div style={BAR}>
        {/* 꺼진 단추는 title 이 안 보이므로 감싼 span 에 이유를 단다(U34) */}
        <span data-testid="erd-diff-apply-tip" title={runTip}>
          <Button size="sm" variant="primary" data-testid="erd-diff-apply-run" disabled={block !== null} onClick={onApply}>
            고른 항목 가져오기
          </Button>
        </span>
      </div>
      <div data-testid="erd-diff-apply-note" style={NOTE}>
        {note}
      </div>
      {result && (
        <div data-testid="erd-diff-apply-result" role="status" style={RESULT} title={`변경 번호 ${result.rev}`}>
          {result.text}
        </div>
      )}
      {stale > 0 && (
        <div data-testid="erd-diff-apply-stale" role="alert" style={STALE}>
          고른 항목 중 {stale}건을 넣을 수 없습니다(차이 목록에 없거나 함께 고를 항목이 빠짐). 차이를 다시 읽었으니 다시 고르세요.
        </div>
      )}
      <div style={GRID_BOX}>
        <div style={FILL}>
          <AgDataGrid gridId="erdDbDiff" title="DB 차이" columnSizing="fit" columns={DIFF_COLUMNS} data={rows} rowKey="id"
            selectable multiSelect selectedRows={selected} onRowSelect={onRowSelect}
            emptyMessage={diff ? "DB 와 모델이 같습니다." : "DB 차이를 읽는 중입니다."} />
        </div>
      </div>
    </div>
  );
}
