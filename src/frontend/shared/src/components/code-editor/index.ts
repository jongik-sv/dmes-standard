export { SqlCodeEditor } from "./SqlCodeEditor";
export type { InsertPoint, SqlCodeEditorHandle, SqlCodeEditorProps } from "./SqlCodeEditor";
export type { SqlCompletionContext, SqlCompletionItem, SqlCompletionProvider } from "./sql-completion";
export { attachCompletion } from "./sql-completion";
export { loadMonaco } from "./monaco-loader";
export type { MonacoApi } from "./monaco-loader";
export { DMES_CODE_THEME_ID, LOG_THEME_RULES } from "./code-theme";
export { SQL_KEYWORDS } from "./sql-keywords";
export { findBindRanges } from "./bind-ranges";
export type { BindRange } from "./bind-ranges";
export { NON_ALIAS_WORDS, columnAffixes, maskCommentsAndStrings, previousWord, statementRange, valueAffixes } from "./sql-text";
// 화면 패키지는 monaco-editor 를 직접 의존하지 않는다(Part B §18-3). Monaco 타입이 필요하면 `import type { Monaco } from "@dk-oasis/shared/code-editor"`.
export type * as Monaco from "monaco-editor";
