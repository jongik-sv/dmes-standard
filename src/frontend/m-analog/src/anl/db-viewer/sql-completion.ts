/**
 * DB 뷰어 — SQL 편집창 자동 완성 (Monaco completion provider).
 *
 * `sql` 언어의 provider 는 Monaco 전역이라 로그 뷰어의 SQL 바인드 편집창에도 걸린다.
 * 그래서 provider 는 전역에 한 번만 등록하고, DB 뷰어 편집창이 자기 모델을 `attachSqlAssist` 로
 * 넘긴 경우에만 후보를 돌려준다(WeakMap — 모델이 사라지면 같이 사라진다).
 *
 * 후보: SQL 키워드 · 왼쪽 목록의 표 · 쿼리 FROM/JOIN 에 나온 표(별칭 포함)의 칸.
 * 칸은 `/db/columns` 를 표 단위로 한 번만 받아 캐시한다(서버가 민감 칸을 이미 거른다).
 */

import type * as Monaco from "monaco-editor";
import {
  SQL_KEYWORDS,
  extractTableRefs,
  identifierText,
  isTablePosition,
  qualifierBefore,
  statementRange,
  type TableRef,
} from "./sql-assist";

export interface SqlAssistSource {
  /** 현재 화면의 표 목록(스키마 → 표 이름). 호출 때마다 최신 값을 읽는다. */
  getTables: () => Record<string, string[]>;
  /** 표 하나의 칸 이름 목록. 실패하면 던진다(캐시하지 않는다). */
  loadColumns: (schema: string, table: string) => Promise<string[]>;
}

/** 한 번에 칸을 불러올 표 수 상한 — FROM 에 표가 많아도 요청이 폭주하지 않게 한다. */
const MAX_REF_TABLES = 6;

const sources = new WeakMap<Monaco.editor.ITextModel, SqlAssistSource>();
let registered = false;

/** 칸 목록을 `SCHEMA.TABLE` 키로 캐시하는 loadColumns 래퍼. 실패한 표는 캐시에서 빼 다음에 다시 시도한다. */
export function cachedColumnLoader(
  fetcher: (schema: string, table: string) => Promise<string[]>,
): SqlAssistSource["loadColumns"] {
  const cache = new Map<string, Promise<string[]>>();
  return (schema, table) => {
    const key = `${schema}.${table}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = fetcher(schema, table).catch((err) => {
        cache.delete(key);
        throw err;
      });
      cache.set(key, hit);
    }
    return hit;
  };
}

/** 이 모델에 DB 뷰어 자동 완성을 건다. 돌려준 함수를 부르면 뗀다. */
export function attachSqlAssist(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  source: SqlAssistSource,
): () => void {
  registerProvider(monaco);
  sources.set(model, source);
  return () => {
    sources.delete(model);
  };
}

/** 참조된 표 하나가 가리킬 수 있는 (스키마, 표) 후보 — 스키마를 안 썼으면 같은 이름의 표를 가진 스키마 모두. */
function resolveRef(
  ref: TableRef,
  tables: Record<string, string[]>,
): { schema: string; table: string }[] {
  const out: { schema: string; table: string }[] = [];
  for (const [schema, list] of Object.entries(tables)) {
    if (ref.schema !== null && ref.schema !== schema) continue;
    if (list.includes(ref.table)) out.push({ schema, table: ref.table });
  }
  return out;
}

function registerProvider(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;
  const kinds = monaco.languages.CompletionItemKind;

  monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: ["."],
    async provideCompletionItems(model, position) {
      const source = sources.get(model);
      if (!source) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const fullText = model.getValue();
      const offset = model.getOffsetAt(position);
      const [from, to] = statementRange(fullText, offset);
      const statement = fullText.slice(from, to);
      const before = fullText.slice(from, offset);
      const tables = source.getTables();
      const refs = extractTableRefs(statement);
      const qualifier = qualifierBefore(
        model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        }),
      );

      const suggestions: Monaco.languages.CompletionItem[] = [];

      const columnItems = async (
        targets: { schema: string; table: string; label: string }[],
        sortPrefix: string,
      ) => {
        const loaded = await Promise.all(
          targets.slice(0, MAX_REF_TABLES).map(async (t) => {
            try {
              return {
                t,
                columns: await source.loadColumns(t.schema, t.table),
              };
            } catch {
              return { t, columns: [] as string[] };
            }
          }),
        );
        const seen = new Set<string>();
        for (const { t, columns } of loaded) {
          for (const name of columns) {
            // 같은 칸 이름이 여러 표에 있으면 첫 표 것만 보인다 — 별칭을 쳐서 구분하면 그 표 칸만 나온다.
            if (seen.has(name)) continue;
            seen.add(name);
            suggestions.push({
              label: { label: name, description: t.label },
              kind: kinds.Field,
              insertText: identifierText(name),
              filterText: name,
              range,
              sortText: `${sortPrefix}${name}`,
            });
          }
        }
      };

      // 1) `별칭.` · `표.` · `스키마.` 뒤
      if (qualifier !== null) {
        const byAlias = refs.filter((r) => r.alias === qualifier);
        const byName = refs.filter(
          (r) => r.alias === null && r.table === qualifier,
        );
        const matched = byAlias.length > 0 ? byAlias : byName;
        const targets = matched.flatMap((r) =>
          resolveRef(r, tables).map((x) => ({
            ...x,
            label: r.alias ?? x.table,
          })),
        );
        // `FROM 스키마.` 의 스키마도 참조로 읽히므로, 실제 표로 풀리는 경우만 칸을 낸다.
        if (targets.length > 0) {
          await columnItems(targets, "0");
          return { suggestions };
        }
        const schemaTables = tables[qualifier];
        if (schemaTables) {
          for (const table of schemaTables) {
            suggestions.push({
              label: table,
              kind: kinds.Struct,
              insertText: table,
              range,
              sortText: `0${table}`,
            });
          }
          return { suggestions };
        }
        // 알 수 없는 접두 — 키워드를 섞어 보이지 않고 비운다.
        return { suggestions };
      }

      const tableItems = (rank: string) => {
        for (const [schema, list] of Object.entries(tables)) {
          for (const table of list) {
            suggestions.push({
              label: { label: table, description: schema },
              kind: kinds.Struct,
              insertText: `${schema}.${table}`,
              filterText: table,
              range,
              sortText: `${rank}${table}`,
            });
          }
        }
      };

      // 2) FROM·JOIN 뒤 — 표 이름
      if (isTablePosition(before)) {
        for (const schema of Object.keys(tables)) {
          suggestions.push({
            label: schema,
            kind: kinds.Module,
            insertText: `${schema}.`,
            command: { id: "editor.action.triggerSuggest", title: "표 이름" },
            range,
            sortText: `1${schema}`,
          });
        }
        tableItems("0");
        return { suggestions };
      }

      // 3) 그 밖 — FROM/JOIN 표의 칸 → 키워드 → 표
      const targets = refs.flatMap((r) =>
        resolveRef(r, tables).map((x) => ({ ...x, label: r.alias ?? x.table })),
      );
      await columnItems(targets, "0");
      for (const kw of SQL_KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: kinds.Keyword,
          insertText: kw,
          range,
          sortText: `1${kw}`,
        });
      }
      tableItems("2");
      return { suggestions };
    },
  });
}
