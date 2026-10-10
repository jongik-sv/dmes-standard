"use client";

/**
 * 오른쪽 실행 영역 — 고른 쿼리의 정의(getDef)대로 조회조건(SearchArea)과 결과 그리드를 그린다. 스펙 §8.1.
 * 입력 값·결과·로딩 상태는 이 컴포넌트가 가진다. 화면 루트는 상단 [조회] 를 `search()` 핸들로만 부르고 값을 모른다(화면 성능 가이드 R12).
 * - 쿼리를 고르면 getDef 를 받아 조건을 기본값(initialValues)으로 되돌리고 결과를 비운다. 자동 조회하지 않는다.
 * - 정의에 출력 열이 있으면 조회 전에도 그 열로 빈 그리드를 그리고(안내 문구는 그리드의 빈 결과 문구), 조회 뒤에는 같은 열 정의·같은 그리드에 행만 채운다.
 *   출력 열이 없는 쿼리는 열을 알 수 없으므로 조회 뒤 결과 열로 그린다.
 * - 필수 값이 비면 서버를 부르지 않고 「조건을 입력하고 조회하세요」 를 보인다.
 * - 조건 칸이 쿼리마다 바뀌므로 SearchArea 의 사용자 기본값 저장은 끈다(`defaults={false}`).
 * - 엑셀은 그리드 설정 메뉴의 「엑셀 출력」이 맡는다(받은 행·보이는 열 그대로, 파일 이름 「{쿼리 이름}_{yyyyMMdd}.xlsx」).
 */
import { memo, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";

import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { SearchArea } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { ConditionField } from "../../../widget-types/_query/ConditionBar";
import { QUERY_EMPTY, TABLE_ROW_KEY, type ParamValues } from "../../../widget-types/_query/format";
import { QueryStyle } from "../../../widget-types/_query/parts";
import { getUserQueryRunDef, runUserQuery } from "../../_userq/api";
import { UserQueryStyle } from "./QueryListPane";
import {
  conditionParams,
  decideRun,
  defaultValues,
  definedColumns,
  NEED_INPUT_MESSAGE,
  READY_MESSAGE,
  resultColumns,
  resultRows,
  truncationNote,
  withoutRows,
} from "./run-model";
import type { UserQueryRunDef, UserQueryRunResult } from "../../_userq/types";

/** 조회 전 빈 그리드의 행. 새 배열을 만들지 않는다(R12). */
const NO_ROWS: Record<string, unknown>[] = [];

/** 쿼리 이름이 없을 때 엑셀 파일 이름 — 「쿼리_{yyyyMMdd}.xlsx」. */
const EXCEL_FALLBACK = "쿼리";

export interface RunPaneHandle {
  /** 상단 [조회] — 필수 값을 확인하고 실행한다. 쿼리를 고르지 않았거나 실행 중이면 아무것도 하지 않는다. */
  search(): void;
}

export interface RunPaneProps {
  ref?: Ref<RunPaneHandle>;
  queryId: string | null;
  /** 정의를 받는 중이거나 실행 중이다. 루트가 [조회] 를 비활성으로 두는 데 쓴다. */
  onBusyChange: (busy: boolean) => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function RunPaneImpl({ ref, queryId, onBusyChange }: RunPaneProps) {
  const { showMessage } = useMessage();
  const baseId = useId();
  const [def, setDef] = useState<UserQueryRunDef | null>(null);
  const [defLoading, setDefLoading] = useState(false);
  const [defError, setDefError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParamValues>({});
  const [result, setResult] = useState<UserQueryRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [needInput, setNeedInput] = useState(false);
  /** 늦게 온 응답이 다른 쿼리 화면을 덮지 않게 하는 번호. 쿼리를 바꾸면 올린다. */
  const epoch = useRef(0);

  // 쿼리를 고르면 정의를 받는다. 값·결과는 비우고 자동 조회하지 않는다.
  useEffect(() => {
    const mine = ++epoch.current;
    setDef(null);
    setResult(null);
    setNeedInput(false);
    setDefError(null);
    setRunning(false);
    if (!queryId) {
      setDefLoading(false);
      return;
    }
    setDefLoading(true);
    getUserQueryRunDef(queryId)
      .then((d) => {
        if (epoch.current !== mine) return;
        setDef(d);
        setDraft(defaultValues(conditionParams(d.params)));
      })
      .catch((e: unknown) => {
        if (epoch.current !== mine) return;
        const message = errorText(e);
        setDefError(message);
        showMessage({ title: "오류", message, alertType: "error" });
      })
      .finally(() => {
        if (epoch.current === mine) setDefLoading(false);
      });
    // showMessage 는 쿼리 선택 때만 정의를 다시 받도록 deps 에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryId]);

  useEffect(() => {
    onBusyChange(defLoading || running);
  }, [defLoading, running, onBusyChange]);

  const params = useMemo(() => (def ? conditionParams(def.params) : []), [def]);

  const search = useCallback(() => {
    if (!def || running) return;
    const decision = decideRun(params, draft);
    if (!decision.run) {
      // 이미 그린 그리드는 언마운트하지 않고 행만 비운다(R6).
      setResult((prev) => (prev ? withoutRows(prev) : prev));
      setNeedInput(true);
      return;
    }
    setNeedInput(false);
    const mine = epoch.current;
    setRunning(true);
    runUserQuery(def.queryId, decision.values)
      .then((r) => {
        if (epoch.current === mine) setResult(r);
      })
      .catch((e: unknown) => {
        if (epoch.current !== mine) return;
        setResult((prev) => (prev ? withoutRows(prev) : prev));
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      })
      .finally(() => {
        if (epoch.current === mine) setRunning(false);
      });
  }, [def, params, draft, running, showMessage]);

  useImperativeHandle(ref, () => ({ search }), [search]);

  // 정의 열은 정의(def)에서만 만든다: 조회 결과가 바뀌어도 같은 참조라 그리드가 열을 다시 계산하지 않는다(R6·R12).
  const definedCols = useMemo(() => (def ? definedColumns(def.columns) : []), [def]);
  const hasDefinedCols = definedCols.length > 0;
  const columns = useMemo(
    () => (hasDefinedCols ? definedCols : def && result ? resultColumns(result, def.columns) : []),
    [hasDefinedCols, definedCols, def, result]
  );
  const rows = useMemo(() => (result ? resultRows(result) : NO_ROWS), [result]);
  const rowCount = result?.rows.length ?? 0;
  const note = result ? truncationNote(result) : undefined;
  // 잘리지 않았으면 note 를 주지 않아 기본 「N행」이 나온다. 객체는 값이 바뀔 때만 새로 만든다.
  const excelExport = useMemo(
    () => ({ title: def?.queryNm || undefined, fallbackName: EXCEL_FALLBACK, note, testId: "uq-excel" }),
    [def?.queryNm, note]
  );

  const setValue = useCallback((name: string, value: string) => setDraft((p) => ({ ...p, [name]: value })), []);

  let body;
  if (!queryId) {
    body = (
      <div className="uq-run__hint" role="status" data-testid="uq-run-idle">
        왼쪽에서 쿼리를 고르세요
      </div>
    );
  } else if (defError) {
    body = (
      <div className="uq-run__hint uq-run__error" role="alert" data-testid="uq-run-error">
        {defError}
      </div>
    );
  } else if (!def) {
    body = (
      <div className="uq-run__hint" role="status" data-testid="uq-run-loading">
        불러오는 중입니다
      </div>
    );
  } else if (!result && !hasDefinedCols) {
    // 출력 열을 모르는 쿼리는 조회 뒤 결과 열로 그린다.
    body = (
      <div className="uq-run__hint" role="status" data-testid={needInput ? "uq-run-need-input" : "uq-run-ready"}>
        {needInput ? NEED_INPUT_MESSAGE : running ? "조회 중입니다" : READY_MESSAGE}
      </div>
    );
  } else {
    // 0건이어도, 조회 전이어도 그리드를 언마운트하지 않는다(R6). excelExport 도 늘 준다: 객체를 줬다 뺐다 하면 그리드 뿌리가 바뀌어 다시 마운트된다.
    // 조회 전 안내는 그리드의 빈 결과 문구가 맡는다.
    body = (
      <GridPanel title={def.queryNm || def.queryId} count={rowCount}>
        <AgDataGrid
          key={def.queryId}
          gridId={`query-${def.queryId}`}
          personalize={false}
          resetColumnsMenu={false}
          rowKey={TABLE_ROW_KEY}
          columns={columns}
          data={rows}
          columnSizing="fit"
          loading={running}
          ariaLabel="쿼리 결과"
          excelExport={excelExport}
          emptyMessage={result ? QUERY_EMPTY : needInput ? NEED_INPUT_MESSAGE : READY_MESSAGE}
          emptyTestId="uq-empty"
        />
      </GridPanel>
    );
  }

  return (
    <div className="uq-run" data-testid="uq-run">
      <UserQueryStyle />
      <QueryStyle />
      {def && params.length > 0 && (
        <SearchArea onSearch={() => search()} defaults={false}>
          {params.map((p) => (
            <ConditionField
              key={p.name}
              param={p}
              inputId={`${baseId}-${p.name}`}
              value={draft[p.name] ?? ""}
              onChange={(v) => setValue(p.name, v)}
            />
          ))}
        </SearchArea>
      )}
      {def?.queryDesc && <div className="uq-run__desc">{def.queryDesc}</div>}
      {needInput && result && (
        <div className="uq-run__notice" role="status" data-testid="uq-run-need-input">
          {NEED_INPUT_MESSAGE}
        </div>
      )}
      <div className="uq-run__grid">{body}</div>
    </div>
  );
}

/** props(ref·queryId·onBusyChange)가 안정적이라 루트의 busy 변화로 다시 그리지 않는다(R5). */
export const RunPane = memo(RunPaneImpl);
