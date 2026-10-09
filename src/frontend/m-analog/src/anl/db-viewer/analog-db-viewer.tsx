"use client";

/**
 * DB 뷰어 (anl/dbViewer) — 읽기전용 오라클 테이블 브라우저 (ADR-0002).
 * 구성(PageLayout 본문 3단 분할, 모두 드래그로 크기 조절·사용자별 저장):
 *  - 왼쪽: 스키마·테이블 트리 — 오른쪽과 같이 접으면 세로 막대만 남는다.
 *  - 가운데: SQL 편집창(위) ↔ 조회 결과 그리드(아래)
 *  - 오른쪽: 컬럼 속성 사이드바 — 접으면 세로 막대만 남고, 막대를 누르면 다시 펼친다.
 * 실행: 상단 [실행] · F8 · 편집창 Ctrl/⌘+Enter.
 * - 왼쪽 트리에서 테이블을 고르면 기본 SQL 을 곧바로 실행해 조회 결과를 그 테이블로 바꾼다.
 *   키보드로 빠르게 훑을 때는 마지막 선택만 조회하고(SELECT_DEBOUNCE_MS), 늦게 도착한 이전 응답은 버린다.
 *   조회 결과 제목 옆 칩이 지금 결과의 출처(테이블 또는 직접 실행)를 보인다.
 *   건수 제한(MAX_ROWS)은 서버가 DB 단계(FETCH FIRST + setMaxRows)에서 건다.
 * - 결과가 상한에 걸려 잘렸으면(서버 hasMore) 「더보기」 단추로 끝까지(서버 전체 상한까지) 묶음 단위로 이어 붙인다.
 *   묶음 사이 순서를 고정하려고 서버가 ROWID·기본키로 정렬하므로 첫 묶음부터 다시 읽어 그리드를 그 순서로 바꾼다.
 *   테이블을 바꾸거나 새로 실행하면 진행 중인 더보기는 멈춘다(요청 순번).
 * - shared 컴포넌트만 사용 (AgDataGrid, form, layout). ag-grid·Mantine 직접 import 금지.
 * - 결과 0건이어도 그리드를 유지한다 (성능 가이드 R6).
 * - LOB 칸은 서버 요약 글자 + 「보기」 단추로 그리고, 단추를 누르면 그 한 칸만 다시 읽어 상세 창에 보인다.
 * - 컬럼 속성 행을 더블클릭하면 칸 이름을, 조회 결과 셀을 더블클릭하면 셀 값(SQL 리터럴)을 편집창 커서 위치에 넣는다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import {
  ContentBody,
  ContentPanel,
  PageLayout,
  type PageButton,
} from "@dk-oasis/shared/layout";
import { Button, Spinner } from "@dk-oasis/shared/form";
import { useGfnMessage } from "@dk-oasis/shared/message-provider";
import {
  ALLOWED_SCHEMAS,
  defaultSql,
  fetchColumns,
  fetchTables,
  runQuery,
} from "./db-viewer-api";
import { LobCell } from "./lob-cell";
import { LobViewerModal, type LobTarget } from "./lob-viewer-modal";
import { DbMenuTree } from "./db-menu-tree";
import DbSqlEditor, { type DbSqlEditorHandle } from "./db-sql-editor";
import { identifierText, toSqlLiteral } from "./sql-assist";
import { createSeq } from "./latest-seq";
import { loadAllChunks } from "./load-more";
import type { DbColumnInfo, DbQueryResult } from "./types";
import "./db-viewer.css";

const MAX_ROWS = 200;
/** 분할 크기 저장 키 — ContentBody resizable storageKey (<모듈>.<그룹>.<화면>). */
const SPLIT_STORAGE_KEY = "analog.anl.dbViewer";
/** 컬럼 속성 사이드바 펼침 여부(이 브라우저 편의값). */
const PROPS_OPEN_KEY = "analog.anl.dbViewer.propsOpen";
/** 표 목록 사이드바 펼침 여부(이 브라우저 편의값). */
const TREE_OPEN_KEY = "analog.anl.dbViewer.treeOpen";
const INITIAL_SQL = "SELECT * FROM MCMAPUSER.TB_MCM_CODE_MASTER";
/** 테이블 선택 뒤 조회를 내보내기까지 기다리는 시간 — 트리를 키보드로 훑을 때 테이블마다 조회가 나가지 않게 한다. */
const SELECT_DEBOUNCE_MS = 200;
/** 조회 결과의 출처 칩 — 편집창 SQL 을 사용자가 직접 실행한 결과. */
const DIRECT_RUN_LABEL = "직접 실행";

/** PK·FK 배지. FK 는 참조 테이블을 툴팁으로 보인다. */
function renderKeys(_value: unknown, row: Record<string, unknown>) {
  const pk = row.PK_YN === "Y";
  const fk = row.FK_YN === "Y";
  if (!pk && !fk) return null;
  return (
    <span className="anl-db-keys">
      {pk && <span className="anl-db-key anl-db-key--pk">PK</span>}
      {fk && (
        <span
          className="anl-db-key anl-db-key--fk"
          title={row.FK_REF ? `참조: ${String(row.FK_REF)}` : "외래키"}
        >
          FK
        </span>
      )}
    </span>
  );
}

const COLUMN_PROP_COLUMNS: GridColumn[] = [
  { key: "NO", header: "#", width: 40, type: "number" },
  {
    key: "KEYS",
    header: "키",
    width: 64,
    align: "center",
    tooltip: false,
    render: renderKeys,
  },
  { key: "COLUMN_NAME", header: "컬럼", width: 170 },
  { key: "TYPE_TEXT", header: "타입", width: 120 },
  { key: "NULLABLE", header: "Null", width: 50, align: "center" },
];

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "요청이 실패했습니다.";
}

/** 건수 글 — 만 단위로 떨어지면 「3만 건」, 아니면 쉼표 숫자. */
function countText(n: number): string {
  return n % 10000 === 0
    ? `${n / 10000}만 건`
    : `${n.toLocaleString("ko-KR")}건`;
}

/** VARCHAR2 → VARCHAR2(100) 처럼 길이를 붙인 표시용 타입. 길이가 의미 없는 타입은 그대로 둔다. */
function typeText(col: DbColumnInfo): string {
  const lengthTypes = ["CHAR", "NCHAR", "VARCHAR2", "NVARCHAR2", "RAW"];
  return lengthTypes.includes(col.DATA_TYPE)
    ? `${col.DATA_TYPE}(${col.DATA_LENGTH})`
    : col.DATA_TYPE;
}

function readOpen(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) !== "0";
  } catch {
    return true;
  }
}

function writeOpen(storageKey: string, open: boolean) {
  try {
    window.localStorage.setItem(storageKey, open ? "1" : "0");
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 유지한다.
  }
}

/** 사이드바 접기·펼치기 아이콘. side 는 사이드바가 붙은 쪽 — 접기 화살표는 그 쪽으로, 펼치기는 반대로 향한다. */
function SidebarIcon({
  collapse,
  side = "right",
}: {
  collapse: boolean;
  side?: "left" | "right";
}) {
  const left = side === "left";
  // 접기는 사이드바 쪽(‹ 왼쪽 / › 오른쪽)으로, 펼치기는 그 반대로 향한다.
  const points = left
    ? collapse
      ? "7 9 4 12 7 15"
      : "4 9 7 12 4 15"
    : collapse
      ? "8 9 11 12 8 15"
      : "11 9 8 12 11 15";
  const dividerX = left ? 9 : 15;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1={dividerX} y1="4" x2={dividerX} y2="20" />
      <polyline points={points} />
    </svg>
  );
}

export function AnalogDbViewer() {
  const gfn = useGfnMessage();
  const editorRef = useRef<DbSqlEditorHandle>(null);
  const [tablesBySchema, setTablesBySchema] = useState<
    Record<string, string[]>
  >({});
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [sqlSeed, setSqlSeed] = useState({ text: INITIAL_SQL, revision: 0 });
  const [columns, setColumns] = useState<DbColumnInfo[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [propsOpen, setPropsOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  const [result, setResult] = useState<DbQueryResult | null>(null);
  /** 지금 결과가 어느 테이블 것인지("스키마.테이블") — null 이면 편집창 SQL 을 직접 실행한 결과다. */
  const [resultTableKey, setResultTableKey] = useState<string | null>(null);
  /** 테이블 결과가 바뀔 때마다 올려 그리드를 새로 만든다 — 이전 테이블의 정렬·스크롤·열 너비가 남지 않게 한다. */
  const [gridEpoch, setGridEpoch] = useState(0);
  const [running, setRunning] = useState(false);
  /** 「더보기」 진행 중이면 지금까지 불러온 행 수, 아니면 null. */
  const [moreCount, setMoreCount] = useState<number | null>(null);
  const [lobTarget, setLobTarget] = useState<LobTarget | null>(null);

  useEffect(() => {
    setPropsOpen(readOpen(PROPS_OPEN_KEY));
    setTreeOpen(readOpen(TREE_OPEN_KEY));
  }, []);

  const toggleProps = useCallback(() => {
    setPropsOpen((prev) => {
      writeOpen(PROPS_OPEN_KEY, !prev);
      return !prev;
    });
  }, []);

  const toggleTree = useCallback(() => {
    setTreeOpen((prev) => {
      writeOpen(TREE_OPEN_KEY, !prev);
      return !prev;
    });
  }, []);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    setTablesError(null);
    try {
      const entries = await Promise.all(
        ALLOWED_SCHEMAS.map(async (schema) => {
          try {
            return [schema, await fetchTables(schema)] as const;
          } catch (err) {
            // 스키마 단위 실패는 조용히 0개로 두지 않고 사유를 남긴다 — 0개와 "조회 실패" 를 구분해야 한다.
            gfn(`${schema}: ${errText(err)}`, "", "", "warning");
            return [schema, [] as string[]] as const;
          }
        }),
      );
      setTablesBySchema(Object.fromEntries(entries));
    } catch (err) {
      setTablesError(errText(err));
    } finally {
      setTablesLoading(false);
    }
  }, [gfn]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  // 요청 순번 — 가장 나중에 낸 요청의 응답만 화면에 반영한다(늦게 온 이전 응답은 버린다).
  const querySeqRef = useRef(createSeq());
  const columnsSeqRef = useRef(createSeq());
  const runningRef = useRef(false);
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 마지막으로 고른 테이블의 기본 SQL — 편집창이 그대로면 직접 실행이 아니라 그 테이블 결과로 본다. */
  const tableSqlRef = useRef<{ key: string; sql: string } | null>(null);
  /** 지금 그리드에 보이는 결과를 만든 SQL — 「더보기」는 편집창이 아니라 이 SQL 로 이어 읽는다. */
  const resultSqlRef = useRef("");

  /** 디바운스 대기 중인 테이블 선택 — 타이머가 터지면 이 테이블을 조회하고, 그 전에 수동 실행하면 컬럼 속성만 먼저 받는다. */
  const pendingTableRef = useRef<{
    schema: string;
    table: string;
    columnsTicket: number;
  } | null>(null);

  // 화면을 떠나면 대기 타이머를 지우고 요청 순번을 올려 진행 중인 조회·더보기가 상태를 쓰지 못하게 한다.
  useEffect(() => {
    const querySeq = querySeqRef.current;
    const columnsSeq = columnsSeqRef.current;
    return () => {
      if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
      querySeq.next();
      columnsSeq.next();
    };
  }, []);

  /**
   * 조회를 실행해 결과를 바꾼다. tableKey 는 결과 출처(테이블이면 "스키마.테이블", 직접 실행이면 null).
   * auto 가 참이면 테이블 선택에 따른 자동 조회라 결과 그리드를 새로 만든다.
   */
  const execute = useCallback(
    async (sql: string, tableKey: string | null, auto = false) => {
      const ticket = querySeqRef.current.next();
      runningRef.current = true;
      setRunning(true);
      setMoreCount(null);
      try {
        const queryResult = await runQuery({ sql });
        if (!querySeqRef.current.isLatest(ticket)) return;
        resultSqlRef.current = sql;
        setResult(queryResult);
        setResultTableKey(tableKey);
        if (auto) setGridEpoch((prev) => prev + 1);
        if (queryResult.hasMore && queryResult.moreBlocked) {
          gfn(queryResult.moreBlocked, "", "", "toast");
        }
      } catch (err) {
        if (querySeqRef.current.isLatest(ticket)) {
          gfn(errText(err), "", "", "warning");
        }
      } finally {
        // 더 나중에 낸 요청이 있으면 실행 중 표시는 그 요청이 끝날 때 내린다.
        if (querySeqRef.current.isLatest(ticket)) {
          runningRef.current = false;
          setRunning(false);
        }
      }
    },
    [gfn],
  );

  /** 고른 테이블의 컬럼 속성을 받는다. columnsTicket 은 선택한 순간 받은 번호표다. */
  const loadColumns = useCallback(
    async (schema: string, table: string, columnsTicket: number) => {
      try {
        const loaded = await fetchColumns(schema, table);
        if (columnsSeqRef.current.isLatest(columnsTicket)) setColumns(loaded);
      } catch (err) {
        if (columnsSeqRef.current.isLatest(columnsTicket)) {
          gfn(errText(err), "", "", "warning");
          setColumns([]);
        }
      } finally {
        if (columnsSeqRef.current.isLatest(columnsTicket)) {
          setColumnsLoading(false);
        }
      }
    },
    [gfn],
  );

  const handleSelectTable = useCallback(
    (schema: string, table: string) => {
      const key = `${schema}.${table}`;
      const sql = defaultSql(schema, table);
      setSelectedTableKey(key);
      tableSqlRef.current = { key, sql };
      setSqlSeed((prev) => ({ text: sql, revision: prev.revision + 1 }));
      // 이전 선택의 컬럼 속성은 비우고, 진행 중이던 조회·더보기는 버린다(응답이 와도 반영하지 않는다).
      const columnsTicket = columnsSeqRef.current.next();
      querySeqRef.current.next();
      runningRef.current = false;
      setRunning(false);
      setMoreCount(null);
      setColumns([]);
      setColumnsLoading(true);
      // 선택 표시·기본 SQL 은 곧바로 바꾸고, 서버 조회는 마지막 선택만 내보낸다.
      if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
      pendingTableRef.current = { schema, table, columnsTicket };
      selectTimerRef.current = setTimeout(() => {
        selectTimerRef.current = null;
        pendingTableRef.current = null;
        void execute(sql, key, true);
        void loadColumns(schema, table, columnsTicket);
      }, SELECT_DEBOUNCE_MS);
    },
    [execute, loadColumns],
  );

  const handleRun = useCallback(async () => {
    const sql = (editorRef.current?.getValue() ?? "").trim();
    if (runningRef.current) {
      gfn("이미 조회 중입니다.", "", "", "toast");
      return;
    }
    if (sql === "") {
      gfn("실행할 SQL 을 입력해 주세요.", "", "", "warning");
      return;
    }
    // 테이블을 고른 직후 디바운스 대기 중이면 기본 SQL 조회는 취소하고(방금 실행하는 SQL 이 이긴다) 컬럼 속성만 먼저 받는다.
    const pending = pendingTableRef.current;
    if (pending) {
      if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
      selectTimerRef.current = null;
      pendingTableRef.current = null;
      void loadColumns(pending.schema, pending.table, pending.columnsTicket);
    }
    const fromTable = tableSqlRef.current;
    await execute(
      sql,
      fromTable && fromTable.sql === sql ? fromTable.key : null,
    );
  }, [execute, gfn, loadColumns]);

  /**
   * 「더보기」 — 지금 결과를 만든 SQL 을 서버 묶음 단위로 끝까지 이어 읽는다.
   * 서버가 묶음마다 같은 정렬(ROWID·기본키)로 자르므로 첫 묶음(offset 0)부터 읽어 그리드를 그 순서로 채운다.
   * 새 조회·테이블 선택이 요청 순번을 올리면 다음 응답부터 버리고 멈춘다.
   */
  const loadMore = useCallback(async () => {
    const sql = resultSqlRef.current;
    if (sql === "" || runningRef.current) return;
    const ticket = querySeqRef.current.next();
    setMoreCount(0);
    try {
      await loadAllChunks({
        sql,
        fetchChunk: runQuery,
        isCurrent: () => querySeqRef.current.isLatest(ticket),
        onProgress: (merged, part) => {
          setResult(merged);
          setMoreCount(merged.rows.length);
          if (part.capReached) {
            gfn(
              `${countText(merged.rows.length)}까지만 볼 수 있습니다. WHERE 로 좁혀 주세요.`,
              "",
              "",
              "warning",
            );
          }
        },
      });
    } catch (err) {
      if (querySeqRef.current.isLatest(ticket)) {
        gfn(errText(err), "", "", "warning");
      }
    } finally {
      if (querySeqRef.current.isLatest(ticket)) setMoreCount(null);
    }
  }, [gfn]);

  const runFromEditor = useCallback(() => void handleRun(), [handleRun]);

  // 컬럼 속성 행 더블클릭 → 칸 이름을 편집창에 넣는다.
  const insertColumnName = useCallback((row: Record<string, unknown>) => {
    const name = row.COLUMN_NAME;
    if (typeof name !== "string" || name === "") return;
    editorRef.current?.insertAtCursor(identifierText(name), "column");
  }, []);

  // 조회 결과 셀 더블클릭 → 셀 값을 SQL 리터럴로 편집창에 넣는다.
  // 어느 셀인지는 shared 를 건드리지 않고 이벤트 대상의 가장 가까운 [col-id] 칸에서 읽는다.
  const resultRef = useRef(result);
  resultRef.current = result;
  // 결과가 나온 표의 칸 정보 — 표 단위로 한 번만 받는다(칸 형식으로 '10' 과 10 을 가른다).
  const typeCacheRef = useRef(new Map<string, Promise<DbColumnInfo[]>>());
  const columnTypesOf = useCallback((schema: string, table: string) => {
    const key = `${schema}.${table}`;
    let hit = typeCacheRef.current.get(key);
    if (!hit) {
      hit = fetchColumns(schema, table).catch(() => {
        typeCacheRef.current.delete(key);
        return [] as DbColumnInfo[];
      });
      typeCacheRef.current.set(key, hit);
    }
    return hit;
  }, []);
  // 결과가 나오면 그 표의 칸 형식을 미리 받아 둔다 — 첫 더블클릭이 응답을 기다리지 않게 한다.
  useEffect(() => {
    if (result && result.schema && result.table) {
      void columnTypesOf(result.schema, result.table);
    }
  }, [result, columnTypesOf]);
  const insertCellValue = useCallback(
    async (row: Record<string, unknown>, event: Event) => {
      const current = resultRef.current;
      const target = event.target;
      if (!current || !(target instanceof Element)) return;
      const colId = target.closest("[col-id]")?.getAttribute("col-id");
      if (!colId || !current.columns.includes(colId)) return;
      const lobs = current.lobColumns ?? {};
      if (lobs[colId] ?? lobs[colId.toUpperCase()]) {
        gfn("LOB 칸은 칸 안의 「보기」 단추로 확인해 주세요.", "", "", "toast");
        return;
      }
      // 칸 형식을 받는 동안 커서가 옮겨져도 더블클릭한 때의 자리에 넣도록 위치를 먼저 잡는다.
      const at = editorRef.current?.captureInsertPoint() ?? null;
      // 칸 형식을 못 구하면(받기 실패·별칭 칸) 값 모양으로 짐작한다.
      const dataType = (
        await columnTypesOf(current.schema, current.table)
      ).find((c) => c.COLUMN_NAME === colId)?.DATA_TYPE;
      editorRef.current?.insertAtCursor(
        toSqlLiteral(row[colId], dataType),
        "value",
        at,
      );
    },
    [gfn, columnTypesOf],
  );

  const pageButtons: PageButton[] = useMemo(
    () => [
      {
        id: "btn_run",
        label: running ? "실행 중" : "실행",
        type: "primary",
        disabled: running,
        onClick: () => void handleRun(),
      },
    ],
    [handleRun, running],
  );

  // 안정 콜백 — 열 정의 deps 에 넣어도 참조가 변하지 않는다.
  const openLob = useCallback((target: LobTarget) => {
    setLobTarget(target);
  }, []);
  const closeLob = useCallback(() => setLobTarget(null), []);

  // 열 정의에 쓰는 값이 바뀔 때만 다시 만든다(더보기 묶음마다 result 객체는 바뀌지만 이 값들은 그대로다).
  // LOB 칸은 요약 글자 + 「보기」 단추(ROWID 가 없으면 단추 없음).
  const resultColumnNames = result?.columns;
  const resultLobTypes = result?.lobColumns;
  const resultRowIdKey = result?.rowIdKey ?? null;
  const resultSchema = result?.schema ?? "";
  const resultTable = result?.table ?? "";
  const resultColumns: GridColumn[] = useMemo(() => {
    const lobTypes = resultLobTypes ?? {};
    return (resultColumnNames ?? []).map((col): GridColumn => {
      const base: GridColumn = { key: col, header: col, width: 160 };
      const dataType = lobTypes[col] ?? lobTypes[col.toUpperCase()];
      if (!dataType) return base;
      return {
        ...base,
        width: 240,
        tooltip: false,
        render: (value, row) => {
          const rowid = resultRowIdKey ? row[resultRowIdKey] : null;
          const canOpen =
            value != null && typeof rowid === "string" && rowid !== "";
          return (
            <LobCell
              summary={value == null ? "" : String(value)}
              canOpen={canOpen}
              onOpen={() =>
                openLob({
                  schema: resultSchema,
                  table: resultTable,
                  column: col,
                  dataType,
                  rowid: String(rowid),
                })
              }
            />
          );
        },
      };
    });
  }, [
    resultColumnNames,
    resultLobTypes,
    resultRowIdKey,
    resultSchema,
    resultTable,
    openLob,
  ]);

  const resultRows = useMemo(
    () =>
      (result?.rows ?? []).map((row, index) => ({ ...row, id: String(index) })),
    [result],
  );

  const columnPropRows = useMemo(
    () =>
      columns.map((col, index) => ({
        ...col,
        id: String(index),
        NO: index + 1,
        // 정렬·엑셀용 값 — 표시는 renderKeys 배지가 맡는다.
        KEYS: [col.PK_YN === "Y" ? "PK" : "", col.FK_YN === "Y" ? "FK" : ""]
          .filter(Boolean)
          .join(","),
        TYPE_TEXT: typeText(col),
      })),
    [columns],
  );

  const tableCount = useMemo(
    () =>
      Object.values(tablesBySchema).reduce((sum, list) => sum + list.length, 0),
    [tablesBySchema],
  );

  const selectedTableName = selectedTableKey?.split(".")[1] ?? null;

  return (
    <PageLayout title="DB 뷰어" buttons={pageButtons} className="anl-db-viewer">
      <ContentBody root resizable storageKey={SPLIT_STORAGE_KEY}>
        {/* 왼쪽 — 스키마·테이블 트리(접기/펼치기) */}
        {treeOpen ? (
          <ContentPanel key="tree" width={280} minSize={200}>
            <div className="anl-db-panel">
              <div className="anl-db-panel-head">
                <span className="anl-db-panel-title">테이블</span>
                {!tablesLoading && !tablesError && (
                  <span className="anl-db-panel-count">{tableCount}</span>
                )}
                <button
                  type="button"
                  className="anl-db-icon-btn anl-db-panel-head-end"
                  onClick={toggleTree}
                  title="테이블 접기"
                  aria-label="테이블 접기"
                  aria-expanded
                >
                  <SidebarIcon collapse side="left" />
                </button>
              </div>
              {tablesLoading ? (
                <div className="anl-db-panel-state">
                  <Spinner />
                </div>
              ) : tablesError ? (
                <div className="anl-db-panel-state">
                  <div className="anl-db-error-text">{tablesError}</div>
                  <Button variant="primary" onClick={() => void loadTables()}>
                    재시도
                  </Button>
                </div>
              ) : (
                <DbMenuTree
                  tablesBySchema={tablesBySchema}
                  schemaOrder={ALLOWED_SCHEMAS}
                  selectedKey={selectedTableKey}
                  onSelectTable={handleSelectTable}
                />
              )}
            </div>
          </ContentPanel>
        ) : (
          <button
            key="tree-rail"
            type="button"
            className="anl-db-rail"
            onClick={toggleTree}
            title="테이블 펼치기"
            aria-label="테이블 펼치기"
            aria-expanded={false}
          >
            <SidebarIcon collapse={false} side="left" />
            <span className="anl-db-rail-text">테이블</span>
          </button>
        )}

        {/* 가운데 — SQL 편집창 ↔ 조회 결과 */}
        <ContentBody
          key="main"
          direction="column"
          resizable
          storageKey={`${SPLIT_STORAGE_KEY}.v`}
          minSize={360}
        >
          <ContentPanel key="sql" height={190} minSize={110}>
            <div className="anl-db-panel">
              <div className="anl-db-panel-head">
                <span className="anl-db-panel-title">SQL</span>
                {selectedTableKey && (
                  <span className="anl-db-chip" title={selectedTableKey}>
                    {selectedTableKey}
                  </span>
                )}
                <span className="anl-db-panel-hint">
                  Ctrl/⌘+Enter · F8 실행 · 읽기전용 SELECT · 최대 {MAX_ROWS}건
                </span>
              </div>
              <div className="anl-db-sql-body">
                <DbSqlEditor
                  ref={editorRef}
                  value={sqlSeed.text}
                  revision={sqlSeed.revision}
                  tablesBySchema={tablesBySchema}
                  onRun={runFromEditor}
                />
              </div>
            </div>
          </ContentPanel>
          <ContentPanel key="result">
            {/* 열이 곧 결과 항목이라 개인화는 끈다(엑셀 출력 메뉴는 남긴다). */}
            <GridPanel
              title="조회 결과"
              count={result?.rowCount ?? 0}
              headerExtra={
                moreCount !== null ? (
                  <span className="anl-db-elapsed" role="status">
                    불러오는 중 {moreCount.toLocaleString("ko-KR")}건
                  </span>
                ) : result?.hasMore && !result.moreBlocked ? (
                  <Button
                    variant="default"
                    disabled={running}
                    onClick={() => void loadMore()}
                  >
                    더보기
                  </Button>
                ) : result?.capReached ? (
                  <span className="anl-db-elapsed">
                    {countText(result.rowCount)}까지만 볼 수 있습니다
                  </span>
                ) : undefined
              }
              titleExtra={
                result ? (
                  <>
                    <span
                      className="anl-db-chip"
                      title={resultTableKey ?? DIRECT_RUN_LABEL}
                    >
                      {resultTableKey ?? DIRECT_RUN_LABEL}
                    </span>
                    <span className="anl-db-elapsed">{result.elapsedMs}ms</span>
                  </>
                ) : undefined
              }
            >
              <AgDataGrid
                key={gridEpoch}
                columns={resultColumns}
                data={resultRows}
                columnSizing={resultColumns.length > 8 ? "fixed" : "fit"}
                onRowDoubleClick={insertCellValue}
                personalize={false}
                loading={running}
                ariaLabel="조회 결과"
              />
            </GridPanel>
          </ContentPanel>
        </ContentBody>

        {/* 오른쪽 — 컬럼 속성 사이드바(접기/펼치기) */}
        {propsOpen ? (
          <ContentPanel key="props" width={380} minSize={260}>
            <GridPanel
              title="컬럼 속성"
              count={columns.length}
              titleExtra={
                selectedTableName ? (
                  <span
                    className="anl-db-props-table"
                    title={selectedTableKey ?? ""}
                  >
                    {selectedTableName}
                  </span>
                ) : undefined
              }
              headerExtra={
                <button
                  type="button"
                  className="anl-db-icon-btn"
                  onClick={toggleProps}
                  title="컬럼 속성 접기"
                  aria-label="컬럼 속성 접기"
                  aria-expanded
                >
                  <SidebarIcon collapse />
                </button>
              }
            >
              <AgDataGrid
                columns={COLUMN_PROP_COLUMNS}
                data={columnPropRows}
                columnSizing="fit"
                onRowDoubleClick={insertColumnName}
                settingsMenu={false}
                personalize={false}
                loading={columnsLoading}
                ariaLabel="컬럼 속성"
              />
            </GridPanel>
          </ContentPanel>
        ) : (
          <button
            key="props-rail"
            type="button"
            className="anl-db-rail"
            onClick={toggleProps}
            title="컬럼 속성 펼치기"
            aria-label="컬럼 속성 펼치기"
            aria-expanded={false}
          >
            <SidebarIcon collapse={false} />
            <span className="anl-db-rail-text">컬럼 속성</span>
          </button>
        )}
      </ContentBody>
      {/* 닫으면 언마운트되고, 열 때마다 새로 마운트돼 이전 응답·상태가 남지 않는다. */}
      {lobTarget && (
        <LobViewerModal
          key={`${lobTarget.schema}.${lobTarget.table}.${lobTarget.column}.${lobTarget.rowid}`}
          target={lobTarget}
          onClose={closeLob}
        />
      )}
    </PageLayout>
  );
}
