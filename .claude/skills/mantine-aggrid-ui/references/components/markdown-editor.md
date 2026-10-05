# MarkdownEditor

메모·설명처럼 서식(제목·굵게·목록·할 일·인용·링크)이 있는 글을 마크다운 문자열로 편집하고 보여 줄 때 쓴다. 서식 모드와 MD(원문) 모드를 오가며 고친다. 도움말·가이드 같은 긴 문서는 목차가 붙은 `MarkdownDocViewer` 로 읽기만 보여 준다.

- import: `import { MarkdownEditor, MarkdownField, MarkdownView, MarkdownDocViewer, splitMarkdownSections, tocOf, type MarkdownEditorProps, type MarkdownFieldProps, type MarkdownViewProps, type MarkdownDocViewerProps, type DocSection, type MarkdownEditMode, type MarkdownToolbarPlacement } from "@dk-oasis/shared/markdown-editor";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/markdown-editor/` (`MarkdownEditor.tsx`·`MarkdownField.tsx`·`MarkdownView.tsx`·`MarkdownDocViewer.tsx`·`doc-sections.ts`·`MarkdownToolbar.tsx`·`markdown.ts`·`md-ops.ts`·`edit-mode.ts`·`styles.tsx`)
- 내부 구현: 서식 모드는 Tiptap 3(`@tiptap/react`·`starter-kit`·`extension-list`·`markdown`), MD 모드는 `textarea` + 기호 넣기 함수(`md-ops.ts`). 마크다운 읽기는 HTML 을 만들지 않는 전용 `marked` 인스턴스. 도구 막대는 shared `Button`·`Input`(form) 과 Tabler 아이콘. Mantine `@mantine/tiptap` 은 쓰지 않는다([mantine-catalog](../mantine-catalog.md) ①).
- Part B 허용 목록(§1): `markdown-editor` SHOULD.

## 언제 쓰나

- 쓴다: 서식이 필요한 메모·설명·안내 글. 폼·패널 칸은 `MarkdownField`(고칠 수 있으면 처음부터 도구 막대 + 편집 칸), 여닫기를 화면이 정하는 편집기(캔버스 노드 등)는 `MarkdownEditor`, 읽기만 하면 `MarkdownView`.
- 쓰지 않는다: 서식 없는 여러 줄 입력(비고·사유·검증식) → [Textarea](textarea.md). 한 줄 입력 → [Input](input.md). 저장 형식이 HTML 인 글 → [HtmlEditor](html-editor.md).
- 저장 형식: **마크다운 문자열**이다. HTML 은 받지 않는다(`<b>` 같은 태그는 글자 그대로 보인다). 그림·HTML 문법은 글자로 남는다. **표(GFM)** 는 읽기 전용 `MarkdownView`·`MarkdownDocViewer` 만 `<table>` 로 그린다(머리글 thead·본문 tbody, `:---:` 정렬, 칸 안 굵게·기울임·코드·링크·취소선, `\|`, 가로로 넘치면 표 틀 안 스크롤). 편집기(`MarkdownEditor`)·`MarkdownField` 의 편집 칸에는 표 노드가 없어 표가 글자로 남고 저장 때 그대로 돌아간다. 링크는 `http://`·`https://` 만 링크가 된다(`javascript:` 등은 글자). 열기만 해서는 `onChange` 가 불리지 않는다.
- 번들 크기: Tiptap·ProseMirror·marked 가 약 1MB 다. 이 서브패스를 import 한 화면 모듈만 그 크기를 진다(다른 shared 서브패스와 섞지 않는다). 글자 몇 줄이면 Textarea 로 충분하다.

## 표준 사용

```tsx
import { MarkdownField } from "@dk-oasis/shared/markdown-editor";

type Item = { id: string; memo: string };

export function MemoSection({ item, editable, onChange }: { item: Item; editable: boolean; onChange: (memo: string) => void }) {
  return (
    <MarkdownField
      key={item.id}
      value={item.memo}
      editable={editable}
      ariaLabel="메모"
      modeStorageKey="mdm:memoEditMode"
      testId="item-memo-editor"
      viewTestId="item-memo-view"
      onChange={onChange}
    />
  );
}
```

`editable` 이면 처음부터 도구 막대와 편집 칸을 보인다(누르기 단계 없음, 초점이 빠지거나 Esc 를 눌러도 도구 막대가 숨지 않는다). 처음 그릴 때 초점을 가져가지 않고 `onChange` 도 부르지 않는다. `editable=false` 면 테두리 상자 안 읽기 모습이다(빈 글은 `emptyText`). 고치는 대상(행)이 바뀌면 `key` 로 새로 그려 편집기 되돌리기 기록이 다른 글로 넘어가지 않게 한다.

## 변형

### 남은 높이 채우기(fill)

패널·구역의 남은 세로 공간을 칸으로 채우려면 `fill` 을 준다. 편집 칸(서식·MD)이 그 높이까지 늘고 넘치면 칸 안에서 스크롤한다. 칸을 담은 부모 사슬(패널 → 구역 → 구역 본문)이 모두 세로 flex(`display: flex; flex-direction: column; flex: 1 1 0; min-height: 0`)여야 한다 — 그렇지 않으면 높이가 늘지 않는다. 칸 뒤의 단추 줄은 그대로 두면 맨 아래에 놓인다.

`<MarkdownField … fill />`. 화면에서 인라인 style 로 flex `div` 를 새로 감싸지 않는다 — 부모 사슬은 화면 스타일 파일의 클래스로 준다. 예: 룰 세트 화면 `m-mdm/pages/dme/ruleSetEdit/styles/note-editor.ts` 의 `.rsf-panel-fill` 규칙(스크롤 칸 → 패널 → 펼친 구역 → 구역 본문).

### 여닫기를 화면이 정하는 편집기(MarkdownEditor)

`editable` 이 `true` 면 도구 막대와 편집 칸, `false` 면 읽기 모습이다. 여는 시점(두 번 누름 등)은 화면이 정하고, `onExit`(Esc·초점 나감)에서 닫는다. 좁은 상자 안이면 `toolbar="floating"` 으로 도구 막대를 편집 칸 위로 띄운다(감싸는 상자가 `overflow: hidden` 이면 `.cm-md-editing` 이 있는 동안만 풀어 준다).

```tsx
import { useState } from "react";
import { MarkdownEditor } from "@dk-oasis/shared/markdown-editor";

export function NoteBox({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div onDoubleClick={() => setOpen(true)}>
      <MarkdownEditor
        value={text}
        editable={open}
        autoFocus
        toolbar="floating"
        modeStorageKey="mdm:noteEditMode"
        onChange={onChange}
        onExit={() => setOpen(false)}
      />
    </div>
  );
}
```

### 끌기·확대가 걸린 캔버스 안(React Flow 등)

편집 중에 바깥 끌기·휠·단축키를 끄는 클래스는 `editingClassName` 으로, 읽기 모습 링크를 눌러도 끌리지 않게 하는 클래스는 `linkClassName` 으로 넘긴다. 컴포넌트는 이 클래스 이름을 모른다(화면 전용 값). 룰 세트 흐름도 메모가 예다: `editingClassName="nodrag nowheel nopan nokey"`, `linkClassName="nodrag nopan"`.

### 읽기만(MarkdownView)

```tsx
import { MarkdownView } from "@dk-oasis/shared/markdown-editor";

<MarkdownView value={row.description} />
```

### 목차 있는 긴 문서(MarkdownDocViewer)

도움말·가이드처럼 긴 마크다운 문서를 왼쪽 목차(`##`·`###`)와 오른쪽 본문으로 보여 준다. 목차를 누르면 그 절로 부드럽게 이동하고, 본문을 내리면 목차의 현재 절이 따라 바뀐다. 읽기 전용이며 본문은 `MarkdownView` 로 절마다 그린다.

```tsx
import { MarkdownDocViewer } from "@dk-oasis/shared/markdown-editor";

// 모달·서랍 안에서 높이를 채운다(뿌리가 height:100% 이므로 부모가 높이를 가져야 한다).
<div style={{ height: "calc(100vh - 120px)" }}>
  <MarkdownDocViewer markdown={GUIDE_MARKDOWN} />
</div>
```

- Props: `markdown`(원문, 필수), `testId`(기본 `md-doc-viewer`), `tocWidth`(목차 폭 px, 기본 220), `skipTitle`(문서 제목 `#` 절을 그리지 않음, 모달 제목에 이미 보일 때), `ariaLabel`(본문·목차 영역 접근 이름, 기본 `문서`).
- 접근성: 본문은 `role=region`·`tabIndex=0` 이고 목차를 누르면 그 절로 초점이 옮겨진다. `prefers-reduced-motion` 이면 부드러운 이동을 끈다. 색·글자 크기는 `--color-*`·`--font-size-*` 토큰만 쓴다.
- 문서 규칙: 제목은 `#`(문서 제목) + `##`(장) + `###`(절)까지만 목차가 된다. 코드 블록 안의 `#` 줄은 제목이 아니다. GFM 표는 `MarkdownView` 가 `<table>` 로 그리므로 써도 된다(문서 읽기 간격 안에서 위아래 여백 12px). 그림·HTML 은 그리지 않으므로 쓰지 않는다.
- 도식: ` ```mermaid ` 코드 블록은 mermaid 도식(SVG)으로 그린다(공통 `MarkdownView` 가 그림 — `MermaidDiagram`, 도식이 있는 문서에서만 mermaid 를 동적으로 불러온다). 구문 오류면 원래 코드를 그대로 보인다. 기본 크기는 자연 크기이되 본문 폭·최대 높이(480px·60vh 중 작은 값)를 넘으면 비율을 지켜 줄이고(작은 도식은 키우지 않음), 도식마다 [−] [배율] [+] [맞춤] 도구 막대(aria-label 「도식 축소」·「도식 확대」·「도식 크기 맞춤」, 50·75·100·125·150·200%)로 조절하며 틀보다 커지면 틀 안에서 가로·세로 스크롤한다. 어두운 모드면 테마를 맞춰 다시 그리고 인쇄 때는 도구 막대를 숨기고 폭에 맞춘다.
- 절을 직접 나눠야 하면 `splitMarkdownSections(markdown)`(순수 함수, `DocSection[]`)과 `tocOf(sections)` 를 쓴다.

## Props

`MarkdownEditor`

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string` | 필수 | 글(마크다운) |
| onChange | `(md: string) => void` | 필수 | 사용자가 고칠 때마다 새 마크다운. 열기·밖에서 바뀐 값 맞추기에는 불리지 않는다 |
| editable | `boolean` | 필수 | `true` 편집 중, `false` 읽기 모습 |
| autoFocus | `boolean` | - | 편집 칸이 나타날 때 초점(커서는 글 끝) |
| onExit | `() => void` | - | Esc 또는 초점이 편집기 밖으로 나갈 때 |
| toolbar | `"floating" \| "inline"` | `"inline"` | 도구 막대 자리. floating: 편집 칸 위로 뜸, inline: 칸 위에 줄로 |
| fill | `boolean` | `false` | 부모(세로 flex)의 남은 높이를 채운다. 편집 칸이 늘고 넘치면 칸 안에서 스크롤 |
| editingClassName | `string` | - | 편집 중에만 뿌리에 더할 클래스 |
| linkClassName | `string` | - | 읽기 모습 링크(`a`)에 더할 클래스 |
| modeStorageKey | `string` | `"cm-md:editMode"` | 편집 방식(서식·MD) 기억 저장 키(localStorage, JSON 문자열) |
| testId | `string` | `"md-editor"` | 뿌리 `data-testid` |
| ariaLabel | `string` | `"메모"` | 편집 칸 접근성 이름. 도구 막대는 `"<ariaLabel> 서식"`, MD 칸은 `"<ariaLabel> (마크다운 원문)"` |

`MarkdownField`: `value`·`onChange`·`editable`(필수), `testId`(`"md-editor"`, editable 일 때 편집기 뿌리), `viewTestId`(`"md-field-view"`, editable=false 일 때 읽기 상자), `ariaLabel`(`"메모"`), `emptyText`(`"메모 없음"`, 빈 글·고칠 수 없음), `fill`(`false`), `modeStorageKey`, `linkClassName`. 도구 막대는 늘 `inline`.

`MarkdownView`: `value`(필수), `className`(`cm-md-view` 뒤에 더함), `linkClassName`, `testId`(`"md-view"`), `mermaid`(기본 true — ` ```mermaid ` 블록을 도식으로 그림, 있을 때만 동적 import·실패 시 코드 블록, 편집 화면은 코드 블록 그대로).

`MarkdownEditMode`: `"wysiwyg" | "markdown"`.

내부 `data-testid`(시험용): 서식 칸 `md-editor-rich`, MD 칸 `md-editor-source`, 도구 막대 `md-toolbar`, 단추 `md-tb-<명령>`(`paragraph`·`h1`~`h3`·`bold`·`italic`·`strike`·`bulletList`·`orderedList`·`taskList`·`blockquote`·`link`), 모드 `md-mode-md`·`md-mode-wysiwyg`, 링크 칸 `md-link-input`·`md-link-apply`·`md-link-error`.

## 표준값: 모든 화면 동일

- 도구 막대: 문단·제목 1~3 │ 굵게·기울임·취소선 │ 글머리·번호·할 일 목록 │ 인용·링크 │ 오른쪽 끝 「MD | 서식」. 화면이 단추를 고르지 않는다.
- 편집 방식 기본은 서식. 고른 방식은 `modeStorageKey` 마다 기억되고, 같은 키를 쓰는 편집기끼리 즉시 같이 바뀐다(다른 탭 변경도 따라간다). 저장소가 막혀도 그 탭 안에서는 동작한다. 한 화면의 편집기들은 같은 키를 쓴다. 이미 쓰던 키가 있으면 바꾸지 않는다(사용자가 골라 둔 값을 잃는다).
- 목록 기호: 글머리는 disc(중첩 circle → square), 번호는 decimal 을 컴포넌트 CSS 가 명시한다 — 포털의 Tailwind preflight 가 `ol, ul { list-style: none }` 을 걸기 때문이다(이 `<style>` 은 layer 밖이라 이긴다). 할 일 목록은 기호 없이 체크박스만. 읽기 모습·서식 편집 칸 모두 같다.
- 문단 간격: 서식 모드 Enter 는 새 문단을 만들고, 문단 사이 간격은 줄 간격 수준(`0.25em`)이다 — 읽기 모습과 서식 편집 칸이 같다. 빈 문단(빈 줄)은 한 줄 높이다. 저장 형식(문단 사이 빈 줄 하나, 빈 줄 수 보존)은 이 간격과 무관하다.
- 색·간격은 공통 토큰만 쓴다. 클래스 접두는 `cm-md-`. 화면 CSS 로 편집기 모습을 덮지 않는다.
- 편집 중 Esc 가 아닌 키는 편집기 밖으로 올라가지 않는다(Delete·Ctrl+Z 가 화면 단축키로 새지 않는다). Esc 는 나가기이며 위로도 전달된다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 서식 없는 비고 칸에 쓴다 | [Textarea](textarea.md). 이 편집기는 약 1MB 를 화면 번들에 더한다 |
| HTML 문자열을 `value` 로 넣거나 저장 값을 HTML 로 바꿔 보낸다 | 저장 형식은 마크다운 문자열이다. HTML 은 글자로 보인다 |
| `@mantine/tiptap` 의 `RichTextEditor` 를 화면이나 shared 에 들인다 | 이 래퍼를 쓴다(포털이 그 CSS 를 싣지 않고, 화면은 Mantine 을 직접 쓰지 않는다) |
| 캔버스 노드 안에서 편집기 안 끌기가 노드를 끈다 | `editingClassName` 에 그 라이브러리의 끌기 막는 클래스를 넘긴다. 링크는 `linkClassName` |
| 화면마다 저장 키를 새로 만들어 같은 화면의 편집기들이 따로 바뀐다 | 한 화면은 한 키. 기존 키가 있으면 그대로 넘긴다 |
| 대상(행)이 바뀌어도 같은 `MarkdownField` 를 다시 쓴다 | `key={대상 id}` 로 새로 그린다 |
| `fill` 을 줬는데 높이가 늘지 않는다 | 부모 사슬이 세로 flex 가 아니다. 칸을 담은 요소들에 `display:flex; flex-direction:column` 과 `flex: 1 1 0; min-height: 0` 을 준다 |
| 화면 CSS 로 `ul { list-style: none }` 을 되돌리거나 목록 기호를 다시 그린다 | 컴포넌트가 이미 명시한다. 화면에서 덮지 않는다 |
| `onChange` 가 열기만 해도 불릴 거라 보고 저장 안 됨 표시를 따로 끈다 | 열기·밖에서 바뀐 값 맞추기에는 `onChange` 가 불리지 않는다 |
| `MarkdownDocViewer` 를 높이 없는 부모에 넣어 본문이 안 접히고 목차만 길어진다 | 부모에 높이(예: 모달 본문 `calc(100vh - …)`)를 준다. 뿌리가 `height:100%` 라 그 높이 안에서 목차·본문이 따로 스크롤된다 |
| 표가 들어간 마크다운을 `MarkdownEditor`·`MarkdownField` 편집 칸에서 고치면 표가 그려질 거라 본다 | 표는 읽기 전용(`MarkdownView`·`MarkdownDocViewer`)에서만 그려진다. 편집 칸에서는 표가 글자 그대로 보인다(저장 때도 그대로) |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx` `NoteNodeView`: 흐름도 메모 — `MarkdownEditor toolbar="floating"`, `editingClassName="nodrag nowheel nopan nokey"`, `linkClassName="nodrag nopan"`, `modeStorageKey="rsf:noteEditMode"`, 읽기 모습은 `MarkdownView`. 넘침 풀기·z-index 는 `styles/note-editor.ts`.
- `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx`: 오른쪽 패널 「메모」 칸 — `MarkdownField fill`(캔버스와 같은 키). 패널 쪽 세로 flex 사슬은 `styles/note-editor.ts` 의 `.rsf-panel-fill` 규칙.
- `src/frontend/m-mls/pages/lsh/noticeMgmt/NoticeBodyEditor.tsx`: 공지 본문 형식이 마크다운일 때 `MarkdownField fill`(`modeStorageKey="mls:noticeBodyEditMode"`, 공지마다 `key`, 세로 flex 사슬은 `notice-styles.ts` 의 `.nm-editor*`). 미리보기는 [NoticeBodyView](notice-body-view.md). MD 편집 칸은 표를 글자로 두므로(미리보기는 표를 그린다) 화면 안내 문구가 표가 필요하면 HTML 형식을 권한다.
