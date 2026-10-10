/**
 * DMES SQL 편집기 공용 — 자동 완성 제공자(전역 1개) + 모델별 분배.
 *
 * `sql` 언어의 completion provider 는 Monaco 전역이라 같은 페이지의 모든 `sql` 모델에 걸린다(로그 뷰어의 SQL 바인드 편집창 포함).
 * 그래서 provider 는 전역에 한 번만 등록하고, 편집기가 자기 모델을 `attachCompletion` 으로 넘긴 경우에만 후보를 돌려준다.
 * 넘기지 않은 모델에는 빈 목록을 준다(WeakMap — 모델이 사라지면 같이 사라진다).
 * 후보 = SQL 키워드(`keywords` 가 false 를 돌려주지 않는 한) + 편집기가 넘긴 `SqlCompletionProvider.provide` 결과.
 */
import type * as Monaco from "monaco-editor";
import { SQL_KEYWORDS } from "./sql-keywords";
import { statementRange } from "./sql-text";

export interface SqlCompletionContext {
  /** 커서가 든 문장 안에서 커서 앞 글(문장 시작 ~ 커서). */
  textBefore: string;
  /** 커서가 든 문장 전체(`;` 기준). */
  statement: string;
  /** 커서가 든 줄에서 커서 앞 글. `별칭.` 접두 판정에 쓴다. */
  lineBefore: string;
  /** 커서 자리의 단어(이미 친 부분). */
  word: string;
}

export interface SqlCompletionItem {
  label: string;
  kind: "keyword" | "table" | "column" | "bind" | "module" | "other";
  insertText?: string;
  /** 라벨 옆에 흐리게 보일 설명(예: 스키마·별칭). */
  detail?: string;
  filterText?: string;
  /** 같은 목록 안 정렬 키. 없으면 라벨 순. */
  sortText?: string;
  /** true 면 고른 뒤 제안창을 다시 연다(`스키마.` 다음 표 고르기). */
  retrigger?: boolean;
}

export interface SqlCompletionProvider {
  /** 키워드 후보에 더할 후보. */
  provide(ctx: SqlCompletionContext): Promise<SqlCompletionItem[]> | SqlCompletionItem[];
  /** false 를 돌려주면 키워드 후보를 빼고 `provide` 결과만 보인다(`별칭.` 뒤, 표 이름 자리). 없으면 늘 키워드를 더한다. */
  keywords?(ctx: SqlCompletionContext): boolean;
}

const providers = new WeakMap<Monaco.editor.ITextModel, SqlCompletionProvider>();
const registered = new WeakSet<object>();

function kindOf(monaco: typeof Monaco, kind: SqlCompletionItem["kind"]): Monaco.languages.CompletionItemKind {
  const k = monaco.languages.CompletionItemKind;
  switch (kind) {
    case "keyword":
      return k.Keyword;
    case "table":
      return k.Struct;
    case "column":
      return k.Field;
    case "bind":
      return k.Variable;
    case "module":
      return k.Module;
    default:
      return k.Text;
  }
}

/** 커서 위치의 후보 맥락을 뽑는다(순수 입력 → Monaco 모델에서만 읽는다). */
function contextAt(model: Monaco.editor.ITextModel, position: Monaco.Position): SqlCompletionContext {
  const full = model.getValue();
  const offset = model.getOffsetAt(position);
  const [from, to] = statementRange(full, offset);
  return {
    textBefore: full.slice(from, offset),
    statement: full.slice(from, to),
    lineBefore: model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    }),
    word: model.getWordUntilPosition(position).word,
  };
}

function registerGlobalProvider(monaco: typeof Monaco): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);
  monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: ["."],
    async provideCompletionItems(model, position) {
      const provider = providers.get(model);
      if (!provider) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const ctx = contextAt(model, position);
      const suggestions: Monaco.languages.CompletionItem[] = [];

      let items: SqlCompletionItem[] = [];
      try {
        items = await provider.provide(ctx);
      } catch {
        items = [];
      }
      for (const item of items) {
        suggestions.push({
          label: item.detail ? { label: item.label, description: item.detail } : item.label,
          kind: kindOf(monaco, item.kind),
          insertText: item.insertText ?? item.label,
          filterText: item.filterText,
          sortText: item.sortText,
          range,
          command: item.retrigger ? { id: "editor.action.triggerSuggest", title: "다시 제안" } : undefined,
        });
      }
      if (provider.keywords?.(ctx) !== false) {
        for (const kw of SQL_KEYWORDS) {
          suggestions.push({ label: kw, kind: monaco.languages.CompletionItemKind.Keyword, insertText: kw, range, sortText: `1${kw}` });
        }
      }
      return { suggestions };
    },
  });
}

/**
 * 이 모델에 자동 완성을 건다(공급자 없이도 키워드 후보는 나온다). 돌려준 함수를 부르면 뗀다.
 * 전역 제공자는 monaco 인스턴스당 한 번만 등록한다.
 */
export function attachCompletion(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  provider: SqlCompletionProvider | undefined,
): () => void {
  registerGlobalProvider(monaco);
  providers.set(model, provider ?? { provide: () => [] });
  return () => {
    providers.delete(model);
  };
}

/** 이미 걸린 모델의 공급자만 바꾼다(편집기가 다시 그려지며 새 공급자를 받을 때). 걸리지 않은 모델이면 아무것도 안 한다. */
export function updateCompletionProvider(
  model: Monaco.editor.ITextModel,
  provider: SqlCompletionProvider | undefined,
): void {
  if (providers.has(model)) providers.set(model, provider ?? { provide: () => [] });
}
