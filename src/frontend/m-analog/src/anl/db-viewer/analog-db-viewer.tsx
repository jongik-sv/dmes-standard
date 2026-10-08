"use client";

/**
 * DB 뷰어 (anl/dbViewer) — 읽기전용 오라클 테이블 브라우저 (ADR-0002).
 * 구성(PageLayout 본문 3단 분할, 모두 드래그로 크기 조절·사용자별 저장):
 *  - 왼쪽: 스키마·테이블 트리
 *  - 가운데: SQL 편집창(위) ↔ 조회 결과 그리드(아래)
 *  - 오른쪽: 컬럼 속성 사이드바 — 접으면 세로 막대만 남고, 막대를 누르면 다시 펼친다.
 * 실행: 상단 [실행] · F8 · 편집창 Ctrl/⌘+Enter.
 * - shared 컴포넌트만 사용 (AgDataGrid, form, layout). ag-grid·Mantine 직접 import 금지.
 * - 결과 0건이어도 그리드를 유지한다 (성능 가이드 R6).
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
import { DbMenuTree } from "./db-menu-tree";
import DbSqlEditor, { type DbSqlEditorHandle } from "./db-sql-editor";
import type { DbColumnInfo, DbQueryResult } from "./types";
import "./db-viewer.css";

const MAX_ROWS = 200;
/** 분할 크기 저장 키 — ContentBody resizable storageKey (<모듈>.<그룹>.<화면>). */
const SPLIT_STORAGE_KEY = "analog.anl.dbViewer";
/** 컬럼 속성 사이드바 펼침 여부(이 브라우저 편의값). */
const PROPS_OPEN_KEY = "analog.anl.dbViewer.propsOpen";
const INITIAL_SQL = "SELECT * FROM MCMAPUSER.TB_MCM_CODE_MASTER";

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
  { key: "KEYS", header: "키", width: 64, align: "center", tooltip: false, render: renderKeys },
  { key: "COLUMN_NAME", header: "컬럼", width: 170 },
  { key: "TYPE_TEXT", header: "타입", width: 120 },
  { key: "NULLABLE", header: "Null", width: 50, align: "center" },
];

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "요청이 실패했습니다.";
}

/** VARCHAR2 → VARCHAR2(100) 처럼 길이를 붙인 표시용 타입. 길이가 의미 없는 타입은 그대로 둔다. */
function typeText(col: DbColumnInfo): string {
  const lengthTypes = ["CHAR", "NCHAR", "VARCHAR2", "NVARCHAR2", "RAW"];
  return lengthTypes.includes(col.DATA_TYPE)
    ? `${col.DATA_TYPE}(${col.DATA_LENGTH})`
    : col.DATA_TYPE;
}

function readPropsOpen(): boolean {
  try {
    return window.localStorage.getItem(PROPS_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function writePropsOpen(open: boolean) {
  try {
    window.localStorage.setItem(PROPS_OPEN_KEY, open ? "1" : "0");
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 유지한다.
  }
}

function SidebarIcon({ collapse }: { collapse: boolean }) {
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
      <line x1="15" y1="4" x2="15" y2="20" />
      <polyline points={collapse ? "8 9 11 12 8 15" : "11 9 8 12 11 15"} />
    </svg>
  );
}

export function AnalogDbViewer() {
  const gfn = useGfnMessage();
  const editorRef = useRef<DbSqlEditorHandle>(null);
  const [tablesBySchema, setTablesBySchema] = useState<Record<string, string[]>>(
    {},
  );
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [sqlSeed, setSqlSeed] = useState({ text: INITIAL_SQL, revision: 0 });
  const [columns, setColumns] = useState<DbColumnInfo[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [propsOpen, setPropsOpen] = useState(true);
  const [result, setResult] = useState<DbQueryResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setPropsOpen(readPropsOpen());
  }, []);

  const toggleProps = useCallback(() => {
    setPropsOpen((prev) => {
      writePropsOpen(!prev);
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

  const handleSelectTable = useCallback(
    async (schema: string, table: string) => {
      setSelectedTableKey(`${schema}.${table}`);
      setSqlSeed((prev) => ({
        text: defaultSql(schema, table),
        revision: prev.revision + 1,
      }));
      setColumnsLoading(true);
      try {
        setColumns(await fetchColumns(schema, table));
      } catch (err) {
        gfn(errText(err), "", "", "warning");
        setColumns([]);
      } finally {
        setColumnsLoading(false);
      }
    },
    [gfn],
  );

  const runningRef = useRef(false);
  const handleRun = useCallback(async () => {
    const sql = (editorRef.current?.getValue() ?? "").trim();
    if (runningRef.current) return;
    if (sql === "") {
      gfn("실행할 SQL 을 입력해 주세요.", "", "", "warning");
      return;
    }
    runningRef.current = true;
    setRunning(true);
    try {
      const queryResult = await runQuery({ sql });
      setResult(queryResult);
      if (queryResult.rowCount >= MAX_ROWS) {
        gfn(`최대 ${MAX_ROWS}건까지만 표시합니다.`, "", "", "toast");
      }
    } catch (err) {
      gfn(errText(err), "", "", "warning");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [gfn]);

  const runFromEditor = useCallback(() => void handleRun(), [handleRun]);

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

  const resultColumns: GridColumn[] = useMemo(
    () =>
      (result?.columns ?? []).map((col) => ({
        key: col,
        header: col,
        width: 160,
      })),
    [result],
  );

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
        {/* 왼쪽 — 스키마·테이블 트리 */}
        <ContentPanel key="tree" width={280} minSize={200}>
          <div className="anl-db-panel">
            <div className="anl-db-panel-head">
              <span className="anl-db-panel-title">테이블</span>
              {!tablesLoading && !tablesError && (
                <span className="anl-db-panel-count">{tableCount}</span>
              )}
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
                onSelectTable={(schema, table) =>
                  void handleSelectTable(schema, table)
                }
              />
            )}
          </div>
        </ContentPanel>

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
              titleExtra={
                result ? (
                  <span className="anl-db-elapsed">{result.elapsedMs}ms</span>
                ) : undefined
              }
            >
              <AgDataGrid
                columns={resultColumns}
                data={resultRows}
                columnSizing={resultColumns.length > 8 ? "fixed" : "fit"}
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
                  <span className="anl-db-props-table" title={selectedTableKey ?? ""}>
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
    </PageLayout>
  );
}
