# SqlCodeEditor

SQL 을 입력하는 칸(쿼리 정의·예약 작업 SQL·DB 뷰어 편집창)에 쓰는 공용 Monaco 편집기다. SQL 색 강조, 키워드·후보 자동 완성, `:이름` 바인드 강조, 선택할 수 있는 큰 팝업 편집을 한 부품으로 준다. Monaco 를 불러오는 동안과 불러오기에 실패했을 때는 같은 testId·aria-label 의 `Textarea` 로 대신한다.

- import: `import { SqlCodeEditor, type SqlCodeEditorHandle, type SqlCompletionProvider } from "@dk-oasis/shared/code-editor";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/code-editor/`
  - `SqlCodeEditor.tsx` 편집기·큰 팝업·핸들
  - `monaco-loader.ts` Monaco 동적 로드 싱글턴(`loadMonaco`). `import("monaco-editor")` 동적 호출만 쓴다
  - `code-theme.ts` 전역 테마 `dmes-code`(`DMES_CODE_THEME_ID`)
  - `sql-completion.ts` 전역 `sql` 자동 완성 제공자 1개 + 모델별 분배(`attachCompletion`)
  - `sql-text.ts`·`sql-keywords.ts`·`bind-ranges.ts` 순수 함수(문장 범위·칸 이름 끼우기 공백 규칙·키워드·바인드 위치)
- 의존: `monaco-editor` 는 shared 의 `dependencies` 에 `^0.55.1` 한 벌만 둔다(`tsup` external). 화면 패키지(m-mcm·m-analog 등)에는 직접 두지 않는다.
- Part B 허용 목록(§1): `code-editor` SHOULD.

## 언제 쓰나

- 쓴다: 사용자가 SQL 을 쓰거나 고치는 모든 칸. 위젯 쿼리 정의, 예약 작업의 실행 SQL·원천 SQL, 공용 쿼리 정의, DB 뷰어 편집창.
- 쓰지 않는다: 한두 줄 짧은 글 → [Input](input.md). 서식이 있는 글 → [MarkdownEditor](markdown-editor.md). 읽기만 하는 코드·로그 → 화면이 `loadMonaco` 로 읽기 전용 편집기를 직접 만든다(로그 뷰어 방식).
- Monaco 테마는 페이지 전체에 하나다. 그래서 DMES 의 모든 Monaco 편집기는 테마 `dmes-code` 하나를 쓴다(`monaco.editor.create({ theme: DMES_CODE_THEME_ID })`). `defineTheme`·`setTheme` 는 로더만 부른다. 화면에서 다른 테마 이름을 주면 같은 페이지의 다른 편집기(로그 강조)가 바뀐다.
- 자동 완성은 SQL 키워드가 기본이다. 표·칸 같은 데이터 후보는 부르는 쪽이 `completionProvider` 로 넘긴다. 단어 기반 제안은 끈다.
- 테스트(jsdom)에서는 Monaco 가 돌지 않는다. vitest `resolve.alias` 로 `monaco-editor` 를 불러오기가 실패하는 대역으로 바꾸면 대체 칸(`Textarea`)으로 돈다. 대체 칸 모습에서는 testId 가 `Textarea` 에 붙고, Monaco 가 뜬 뒤에는 뿌리 틀에 붙는다.

## 표준 사용

```tsx
import { SqlCodeEditor } from "@dk-oasis/shared/code-editor";

// 제어형 — 폼 상태와 함께 쓴다.
<SqlCodeEditor
  value={form.sql}
  onChange={(sql) => setForm({ ...form, sql })}
  height={200}
  testId="job-query-sql"
  ariaLabel="실행 SQL"
  expandTitle="실행 SQL"
  placeholder={"SELECT ...\n  FROM ..."}
/>
```

비제어형(DB 뷰어 방식 — 타이핑마다 부모를 다시 그리지 않는다):

```tsx
const editor = useRef<SqlCodeEditorHandle>(null);

<SqlCodeEditor
  ref={editor}
  defaultValue={initialSql}
  revision={revision}      // 같은 값으로 되돌릴 때 올린다
  onRun={() => run(editor.current!.getValue())}   // Ctrl/⌘+Enter, F8
  completionProvider={tableColumnProvider}
/>
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `value` | `string` | — | 제어형 값. 있으면 `onChange` 와 함께 쓴다. 부모가 바꾼 값은 `onChange` 를 부르지 않는다 |
| `defaultValue` | `string` | `""` | 비제어형 처음 값. 현재 값은 `ref.getValue()` 로 읽는다 |
| `revision` | `number` | — | 비제어형에서 `defaultValue` 로 되돌릴 때 올리는 번호(같은 값이어도 되돌린다) |
| `onChange` | `(sql: string) => void` | — | 사용자가 고칠 때, 큰 창 [적용] 때, 핸들 `setValue` 때 부른다 |
| `onRun` | `() => void` | — | Ctrl/⌘+Enter, F8. 큰 창 안에서는 적용한 뒤 부른다 |
| `readOnly` | `boolean` | `false` | 읽기 전용. 큰 창에는 [닫기]만 있다 |
| `height` | `number \| string` | `160` | 틀 높이(숫자는 px) |
| `expandable` | `boolean` | `true` | 우상단 [크게 보기] 버튼과 큰 창 |
| `expandTitle` | `string` | `"SQL"` | 큰 창 제목 |
| `completionProvider` | `SqlCompletionProvider` | — | 키워드에 더할 후보(표·칸·바인드 등) |
| `highlightBinds` | `boolean` | `true` | `:이름` 강조(주석·문자열 안은 제외) |
| `minimap` | `boolean` | `false` | 오른쪽 미니맵 |
| `editorOptions` | `Monaco.editor.IStandaloneEditorConstructionOptions` | — | Monaco 생성 옵션 덮어쓰기(만들 때 한 번만 적용). 기본값(DB 뷰어 값: 줄바꿈 켬·글자 13·단어 제안 끔)과 달라야 하는 화면용. `theme`·`language`·`value` 는 덮어쓰지 않는다 |
| `bordered` | `boolean` | `true` | 바깥 테두리. 부모 패널이 이미 테두리를 두른 자리(꽉 채움)에서는 `false` |
| `placeholder` | `string` | — | 빈 칸 안내 글 |
| `ariaLabel` | `string` | — | 접근성 이름. 대체 칸에도 같은 값이 붙는다 |
| `testId` | `string` | — | 뿌리 `data-testid`. 큰 창은 `${testId}-expand`(버튼)·`${testId}-modal`(큰 창 편집기 틀)·`${testId}-apply`·`${testId}-cancel` |

### `SqlCodeEditorHandle` (ref)

| 메서드 | 설명 |
|---|---|
| `getValue()` / `setValue(sql)` | 현재 값 읽기 / 값을 바꾸고 `onChange` 호출 |
| `focus()` | 초점 |
| `setSelection(start, end)` | 오프셋 구간 선택(`SELECT *` 의 `*` 를 골라 두는 식) |
| `captureInsertPoint()` | 지금 커서 위치를 잡아 `InsertPoint` 로 돌려준다(비동기 작업 뒤에 그 자리에 끼우려고) |
| `insertAtCursor(text, kind?, at?)` | 커서(선택 영역)에 끼운다. `kind` `"column"` 은 칸 이름(목록 안이면 쉼표), `"value"` 는 SQL 리터럴(필요할 때만 공백), `"raw"`(기본)는 그대로. `at` 이 있고 그 뒤로 내용이 안 바뀌었으면 그 자리에. 실행 취소 가능, 초점은 편집기로 |

### `SqlCompletionProvider`

```ts
interface SqlCompletionProvider {
  provide(ctx: { textBefore: string; statement: string; lineBefore: string; word: string }):
    Promise<SqlCompletionItem[]> | SqlCompletionItem[];
  /** false 를 돌려주면 키워드 후보를 뺀다(`별칭.` 뒤, 표 이름 자리). 없으면 늘 키워드를 더한다. */
  keywords?(ctx): boolean;
}
interface SqlCompletionItem {
  label: string;
  kind: "keyword" | "table" | "column" | "bind" | "module" | "other";
  insertText?: string; detail?: string; filterText?: string; sortText?: string;
  retrigger?: boolean;   // 고른 뒤 제안창을 다시 연다(`스키마.` → 표)
}
```

- `ctx.textBefore` 는 커서가 든 문장 안의 커서 앞 글, `statement` 는 그 문장 전체(`;` 기준), `lineBefore` 는 커서가 든 줄의 커서 앞 글, `word` 는 커서의 단어다.
- `provide` 가 던지면 키워드 후보만 나온다. 편집기를 다시 만들지 않아도 최신 `completionProvider` prop 을 쓴다.

## 큰 팝업

- 우상단 [크게 보기]가 화면의 약 90% 크기 `Modal` 에 같은 내용의 두 번째 편집기를 띄운다.
- [적용]이 값을 돌려준다(`onChange` 또는 `setValue`). [취소]·Esc·창 밖 닫기는 버린다. 큰 창 안 Ctrl/⌘+Enter 는 적용한 뒤 `onRun` 을 부른다(`onRun` 이 있을 때만).
- `readOnly` 면 [닫기]만 있다.
- 큰 창은 `Modal closeOnClickOutside={false}` 라 바깥을 눌러도 닫히지 않는다(초안 보호). 오른쪽 아래 모서리를 끌어 크기를 조절할 수 있다(`resizable`, 최소 480×320·화면 안, 크기는 localStorage `dmes.sqlCodeEditor.expandSize` 에 남는다). X·Esc·[취소]는 초안을 버린다. 겹친 모달은 ESC 한 번에 맨 위 하나만 닫힌다(`modal-stack.ts`). 편집기 끝까지 스크롤한 뒤의 휠은 바깥 영역으로 넘어간다(`scrollbar.alwaysConsumeMouseWheel: false`).

## 보조 함수·상수 (같은 진입점에서 export)

화면이 자기 Monaco 편집기(로그 뷰어)나 자기 후보 공급자(DB 뷰어)를 만들 때 쓴다. Monaco·React 에 의존하지 않는 순수 함수다.

| 이름 | 설명 |
|---|---|
| `loadMonaco()` | Monaco 동적 로드 싱글턴. 처음 한 번 테마 `dmes-code` 를 정의한다. 실패하면 다음 호출이 다시 시도한다 |
| `DMES_CODE_THEME_ID` | `"dmes-code"`. 모든 DMES Monaco 편집기가 `create({ theme })` 에 쓴다 |
| `LOG_THEME_RULES` | 테마에 들어 있는 로그 토큰 색 규칙(참고용) |
| `attachCompletion(monaco, model, provider)` | 모델에 자동 완성을 건다. 돌려준 함수를 부르면 뗀다 |
| `SQL_KEYWORDS` | Oracle 위주 키워드 목록 |
| `findBindRanges(sql)` | `:이름` 위치 `{ start, end, name }[]`(주석·문자열 안은 제외) |
| `maskCommentsAndStrings(sql)` | 주석·문자열을 같은 길이 공백으로 가린 글 |
| `statementRange(sql, offset)` | 커서가 든 문장 구간 `[start, end)`(`;` 기준) |
| `previousWord(before)` | 커서 앞 마지막 의미 있는 단어(대문자) |
| `columnAffixes(before, after)` / `valueAffixes(before, after)` | 칸 이름·값을 끼울 때 앞뒤에 붙일 공백·쉼표 |
| `NON_ALIAS_WORDS` | 표 이름 바로 뒤에 와도 별칭이 아닌 단어(절·조인 키워드) 집합 |
| `Monaco` (타입) | `import type { Monaco } from "@dk-oasis/shared/code-editor"` — 화면 패키지가 `monaco-editor` 를 직접 의존하지 않고 `Monaco.editor.IStandaloneCodeEditor` 같은 타입을 쓰는 통로 |

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| SQL 칸에 `Textarea` 를 그대로 둠 | `SqlCodeEditor`. 같은 testId·aria-label 을 준다 |
| 화면 패키지 `package.json` 에 `monaco-editor` 를 직접 추가 | 두지 않는다. shared 한 벌만(`pnpm why monaco-editor` 로 확인) |
| 화면에서 `monaco.editor.defineTheme`·`setTheme`, 전역 `sql` 자동 완성 제공자 등록 | 테마는 `dmes-code` 로 `create` 만, 후보는 `completionProvider` 로 |
| `import * as monaco from "monaco-editor"` 정적 import | 쓰지 않는다. `loadMonaco()` 로만 읽는다(SSR 오류) |
| 제어형인데 `onChange` 안에서 값을 가공해 다시 `value` 로 줌 | 사용자가 치는 도중에는 가공하지 않는다. 저장 때 정리한다 |
| 시험에서 Monaco 를 직접 조작하려 함 | jsdom 은 대체 칸으로 돈다. Monaco 동작은 브라우저에서 확인한다 |
