/**
 * 값 테스트 대상과 요청(TSK-08-04 design §6.5·§6.7 ④⑥). 대상은 편집본(BODY — 표 카드가 올린 편집 중인 표, 변수는 그 DRAFT 의 저장된 열, D4)
 * 또는 저장된 버전(VERSION)이다. 편집본은 `editable`(서버 판정)이고 선택 버전이 DRAFT 일 때만 고를 수 있다(I34).
 *
 * 값 테스트 카드(④)와 테스트 케이스 카드(⑥ "모두 돌리기")가 같은 요청 모양을 쓴다. 표에 칠할지 가리는 run 정보(rev·rowVersion)도 여기서 만든다
 * (BODY 는 돌릴 때의 표 rev, VERSION 은 그 버전의 row_version — `runShownOnTable`).
 */
import { useEffect, useState } from "react";

import { viewRule, type TableSaveRow, type ValueTestRequest } from "../api";
import type { TableDraft } from "../state/workbench-context";
import type { RuleEditView, StoredRow, ValueTestTarget } from "../types";
import type { TestRunView } from "./test-marks";

export interface TestTargetChoice {
  target: ValueTestTarget;
  ver: number;
}

export interface TargetOption {
  key: string;
  label: string;
  choice: TestTargetChoice;
}

export function targetKey(c: TestTargetChoice): string {
  return c.target === "BODY" ? "BODY" : `V:${c.ver}`;
}

/** 결과·케이스 표에 적는 대상 이름. */
export function targetLabel(c: { target: ValueTestTarget; ver: number | null }): string {
  return c.target === "BODY" ? "편집본" : `버전 ${c.ver}`;
}

/** 대상 선택지 — 편집본(editable 이고 선택 버전이 DRAFT)이 맨 앞, 그 뒤 버전 전부. */
export function targetOptions(view: RuleEditView, editable: boolean): TargetOption[] {
  const selected = view.versions.find((v) => v.ver === view.selectedVer);
  const out: TargetOption[] = [];
  if (editable && selected?.status === "DRAFT") {
    out.push({ key: "BODY", label: `편집본 · 버전 ${selected.ver} 저장 전`, choice: { target: "BODY", ver: selected.ver } });
  }
  for (const v of view.versions) out.push({ key: `V:${v.ver}`, label: `버전 ${v.ver} · ${v.status}`, choice: { target: "VERSION", ver: v.ver } });
  return out;
}

/** 고른 키가 선택지에 없으면(룰·버전·편집 가능 여부가 바뀜) 기본값 — 편집본, 없으면 보이는 버전, 없으면 첫 선택지. */
export function resolveTarget(options: readonly TargetOption[], key: string | null, view: RuleEditView): TargetOption | null {
  return (
    options.find((o) => o.key === key) ??
    options.find((o) => o.key === "BODY") ??
    options.find((o) => o.choice.ver === view.selectedVer) ??
    options[0] ??
    null
  );
}

/** 편집본이 쓸 표 — 표 카드가 올린 이 룰·버전의 표, 없으면 view 의 저장된 행. */
export function bodyTable(view: RuleEditView, ver: number, draft: TableDraft | null): { rows: StoredRow[]; hitPolicy: TableDraft["hitPolicy"]; rev: number | null } {
  if (draft && draft.ruleId === view.rule.maruRuleId && draft.ver === ver) return { rows: draft.rows, hitPolicy: draft.hitPolicy, rev: draft.rev };
  const selected = view.versions.find((v) => v.ver === ver);
  return { rows: view.rows, hitPolicy: selected?.hitPolicy ?? null, rev: null };
}

export interface PreparedRun {
  request: ValueTestRequest;
  /** 응답을 받으면 result 를 더해 `setTestRun` 으로 올린다. */
  run: Omit<TestRunView, "result">;
}

export function prepareRun(
  view: RuleEditView,
  choice: TestTargetChoice,
  draft: TableDraft | null,
  inputJson: string,
  runCases = false,
): PreparedRun {
  const ruleId = view.rule.maruRuleId;
  const version = view.versions.find((v) => v.ver === choice.ver);
  if (choice.target === "BODY") {
    const table = bodyTable(view, choice.ver, draft);
    const rows: TableSaveRow[] = table.rows.map((r) => ({ rowId: r.rowId, rowKind: r.rowKind, cells: r.cells, note: r.note ?? null }));
    return {
      request: {
        ruleId,
        target: "BODY",
        ver: choice.ver,
        hitPolicy: view.rule.ruleKind === "DECISION" ? table.hitPolicy : null,
        rows,
        inputJson,
        runCases,
      },
      run: { ruleId, target: "BODY", ver: choice.ver, rowVersion: version?.rowVersion ?? null, rev: table.rev },
    };
  }
  return {
    request: { ruleId, target: "VERSION", ver: choice.ver, inputJson, runCases },
    run: { ruleId, target: "VERSION", ver: choice.ver, rowVersion: version?.rowVersion ?? null, rev: null },
  };
}

/** 보이는 버전이 아닌 버전의 정의(view) — 룰·버전·row_version 마다 한 번만 부른다(`viewRule` 은 상태를 바꾸지 않는다, H6). */
const versionViews = new Map<string, Promise<RuleEditView>>();

export function clearVersionViewCache(): void {
  versionViews.clear();
}

/**
 * 대상 정의의 view. 편집본·보이는 버전이면 지금 view(편집본의 변수는 그 DRAFT 의 저장된 열, D4), 다른 버전이면 `viewRule(ruleId, ver)` 로
 * 받아 둔 것. 받는 중이면 null.
 */
export function useTargetView(view: RuleEditView, choice: { target: ValueTestTarget; ver: number | null } | null): { def: RuleEditView | null; error: string | null } {
  const ruleId = view.rule.maruRuleId;
  const local = !choice || choice.target === "BODY" || choice.ver === view.selectedVer;
  const ver = choice?.ver ?? null;
  const rowVersion = view.versions.find((v) => v.ver === ver)?.rowVersion ?? null;
  const cacheKey = local ? null : `${ruleId}:${ver}:${rowVersion}`;
  const [loaded, setLoaded] = useState<{ key: string; def: RuleEditView | null; error: string | null } | null>(null);

  useEffect(() => {
    if (cacheKey == null || ver == null) return;
    let cancelled = false;
    let p = versionViews.get(cacheKey);
    if (!p) {
      p = viewRule(ruleId, ver);
      versionViews.set(cacheKey, p);
      p.catch(() => versionViews.delete(cacheKey));
    }
    p.then(
      (def) => !cancelled && setLoaded({ key: cacheKey, def, error: null }),
      (e: unknown) => !cancelled && setLoaded({ key: cacheKey, def: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [cacheKey, ruleId, ver]);

  if (!choice) return { def: null, error: null };
  if (local) return { def: view, error: null };
  return loaded && loaded.key === cacheKey ? { def: loaded.def, error: loaded.error } : { def: null, error: null };
}

/** 정의의 기본 행 row_id(없으면 null) — 기본 행이 적용되면 엔진 hits 가 비므로 칠하기·기대값이 쓴다. */
export function defaultRowIdOf(rows: readonly StoredRow[]): number | null {
  return rows.find((r) => r.rowKind === "DEFAULT")?.rowId ?? null;
}
