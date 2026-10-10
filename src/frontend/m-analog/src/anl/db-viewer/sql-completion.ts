/**
 * DB 뷰어 — SQL 편집창 자동 완성 후보 공급자(@dk-oasis/shared/code-editor 의 SqlCompletionProvider).
 *
 * Monaco 제공자 등록·모델별 분배·키워드 후보는 shared 가 맡는다. 여기는 DB 뷰어 데이터(표·칸)로 후보만 만든다.
 * 후보: 왼쪽 목록의 표 · 쿼리 FROM/JOIN 에 나온 표(별칭 포함)의 칸. 키워드는 shared 가 더한다(칸 접두 뒤·표 이름 자리는 뺀다).
 * 칸은 `/db/columns` 를 표 단위로 한 번만 받아 캐시한다(서버가 민감 칸을 이미 거른다).
 */

import type {
  SqlCompletionContext,
  SqlCompletionItem,
  SqlCompletionProvider,
} from "@dk-oasis/shared/code-editor";
import {
  extractTableRefs,
  identifierText,
  isTablePosition,
  qualifierBefore,
  tableInsertText,
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

/** 커서 자리가 어느 경우인지: 1) `별칭.` 뒤 2) FROM·JOIN 뒤 표 이름 자리 3) 그 밖. */
function situationOf(ctx: SqlCompletionContext) {
  const qualifier = qualifierBefore(ctx.lineBefore);
  if (qualifier !== null) return { kind: "qualified" as const, qualifier };
  if (isTablePosition(ctx.textBefore)) return { kind: "table" as const };
  return { kind: "other" as const };
}

export function createDbSqlCompletion(
  source: SqlAssistSource,
): SqlCompletionProvider {
  return {
    // 별칭 접두 뒤와 표 이름 자리에는 키워드를 섞지 않는다(원래 동작).
    keywords: (ctx) => situationOf(ctx).kind === "other",

    async provide(ctx) {
      const tables = source.getTables();
      const refs = extractTableRefs(ctx.statement);
      const situation = situationOf(ctx);
      const items: SqlCompletionItem[] = [];

      const columnItems = async (
        targets: { schema: string; table: string; label: string }[],
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
            items.push({
              label: name,
              kind: "column",
              detail: t.label,
              insertText: identifierText(name),
              filterText: name,
              sortText: `0${name}`,
            });
          }
        }
      };

      const tableItems = (rank: string) => {
        for (const [schema, list] of Object.entries(tables)) {
          for (const table of list) {
            items.push({
              label: table,
              kind: "table",
              detail: schema,
              insertText: tableInsertText(schema, table),
              filterText: table,
              sortText: `${rank}${table}`,
            });
          }
        }
      };

      // 1) `별칭.` · `표.` · `스키마.` 뒤
      if (situation.kind === "qualified") {
        const { qualifier } = situation;
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
          await columnItems(targets);
          return items;
        }
        const schemaTables = tables[qualifier];
        if (schemaTables) {
          for (const table of schemaTables) {
            items.push({
              label: table,
              kind: "table",
              insertText: tableInsertText(null, table),
              filterText: table,
              sortText: `0${table}`,
            });
          }
        }
        // 알 수 없는 접두 — 비운다.
        return items;
      }

      // 2) FROM·JOIN 뒤 — 표 이름
      if (situation.kind === "table") {
        for (const schema of Object.keys(tables)) {
          items.push({
            label: schema,
            kind: "module",
            insertText: `${schema}.`,
            retrigger: true,
            sortText: `1${schema}`,
          });
        }
        tableItems("0");
        return items;
      }

      // 3) 그 밖 — FROM/JOIN 표의 칸 → (shared 가 키워드) → 표
      const targets = refs.flatMap((r) =>
        resolveRef(r, tables).map((x) => ({ ...x, label: r.alias ?? x.table })),
      );
      await columnItems(targets);
      tableItems("2");
      return items;
    },
  };
}
