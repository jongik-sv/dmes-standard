# HtmlEditor

설명·안내 글처럼 서식이 있는 글을 HTML 문자열로 편집할 때 쓴다. 서식 모드(도구 막대)와 HTML 원문 모드를 [HTML] 단추로 오가며 고친다.

- import: `import { HtmlEditor, HTML_EDITOR_LOSS_MESSAGE, textToHtml, htmlToText, unsupportedRichTags, type HtmlEditorProps } from "@dk-oasis/shared/html-editor";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/html-editor/` (`HtmlEditor.tsx`·`HtmlToolbar.tsx`·`extensions.ts`·`convert.ts`·`styles.tsx`)
- 내부 구현: 서식 모드는 Tiptap 3(`@tiptap/react`·`starter-kit` 의 밑줄·링크·코드·코드 블록·구분선·되돌리기, 표 확장 없음), 원문 모드는 고정폭 `textarea`, 미리보기·읽기 모습은 [NoticeBodyView](notice-body-view.md) `format="HTML"`(DOMPurify 소독). 서식 모드 글 모양도 NoticeBodyView 의 `.nbv-doc` 스타일이라 편집 칸이 곧 읽기 모습이다. 도구 막대는 shared `Button`·`Input`(form)과 Tabler 아이콘. 새 의존성은 없다(markdown-editor 와 같은 Tiptap 패키지).
- Part B 허용 목록(§1): `html-editor` SHOULD.

## 언제 쓰나

- 쓴다: 저장 형식이 **HTML** 인 설명·안내 글(예: MDM 컬럼 설명 — 툴팁·팝오버가 HTML 로 그린다). 표·그림이 들어간 HTML 을 고쳐야 할 때도 원문 모드로 다룬다.
- 쓰지 않는다: 저장 형식이 마크다운인 메모 → [MarkdownEditor](markdown-editor.md). 읽기만 → [NoticeBodyView](notice-body-view.md). 서식 없는 여러 줄 입력 → [Textarea](textarea.md).
- 서식 모드 단추: 굵게·기울임·밑줄·취소선 │ 제목 2·3 │ 글머리·번호 목록 │ 인용·코드(글자 안 코드)·링크(http·https 만)·구분선 │ 되돌리기·다시하기. 스키마는 h1~h6·코드 블록(`pre`)도 지킨다(단추만 없다).
- 표·그림·`sub`·`dl` 처럼 서식 모드가 지키지 못하는 태그가 값에 있으면 **원문 모드로 연다.** 원문 → 서식으로 바꿀 때 지금 원문에 그런 태그가 있으면 「표·이미지 등 일부 서식이 사라집니다」 확인을 받고, 확인하면 서식이 빠진 HTML 을 곧바로 `onChange` 로 낸다.
- 미리보기: 서식 모드 자체가 보기다. 원문 모드에서만 [미리보기] 단추가 있다(소독한 HTML).
- 저장 값: 열기만 해서는 `onChange` 가 불리지 않는다(Tiptap 이 `<b>`→`<strong>` 으로 다듬어도). 다 지우면 `""`(빈 `<p></p>` 가 아니다). 맨 위 블록마다 줄을 나눠 쓴다. 빈 줄은 `<p><br></p>` 로 쓴다 — 읽기 모습의 빈 `<p></p>` 는 높이가 0 이라 줄이 사라진다.
- 번들 크기: Tiptap·ProseMirror 가 들어가므로 이 서브패스를 import 한 화면 모듈만 그 크기를 진다.

## 표준 사용

```tsx
import { HtmlEditor } from "@dk-oasis/shared/html-editor";
import { useMessage } from "@dk-oasis/shared/message-provider";

type Row = { id: string; description: string };

export function DescriptionSection({ row, onChange }: { row: Row; onChange: (html: string) => void }) {
  const { showMessage } = useMessage();
  const confirm = (message: string) =>
    new Promise<boolean>((resolve) =>
      showMessage({ title: "확인", message, alertType: "confirm", onConfirm: () => resolve(true), onCancel: () => resolve(false) })
    );
  return (
    <HtmlEditor
      key={row.id}
      value={row.description}
      onChange={onChange}
      editable
      maxLength={20000}
      testId="form-description-html"
      ariaLabel="설명"
      confirm={confirm}
    />
  );
}
```

고치는 대상(행·항목)이 바뀌면 `key` 로 새로 그린다 — 편집기 되돌리기 기록과 처음 모드(원문/서식) 판별이 새 값에서 시작한다. `confirm` 을 주지 않아도 공용 메시지 확인창(MessageProvider, 없으면 `window.confirm`)으로 묻는다.

## 변형

### 「글 | HTML」 형식을 고르는 칸

같은 칸에 일반 글과 HTML 을 함께 받으면 화면이 형식 선택([SegmentedControl](segmented-control.md))을 두고, 글 → HTML 은 `textToHtml`, HTML → 글은 확인 뒤 `htmlToText` 로 바꾼다. 형식 판별 규칙(어떤 값을 HTML 로 볼지)은 업무 규칙이라 화면 쪽에 둔다. 예: `m-mdm/pages/dma/columnMng/DescriptionField.tsx`(판별은 `@/column-info` 의 `descriptionFormat`).

### 읽기 전용

`editable={false}` 면 소독한 HTML 읽기 상자만 보인다(도구 막대·편집 칸 없음).

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `value` | `string` | — | HTML 문자열 |
| `onChange` | `(html: string) => void` | — | 사용자가 고칠 때마다 새 HTML(다 지우면 `""`) |
| `editable` | `boolean` | — | `true` 면 편집기, `false` 면 읽기 모습 |
| `maxLength` | `number` | 없음 | 글자 수(HTML 문자열 길이) 상한. 주면 원문 모드에서 `n / 상한자`, 서식 모드에서 `글자 보이는수 · HTML n / 상한자` 를 보이고(상한 판정은 HTML 길이) 넘으면 경고만 한다(입력은 막지 않는다 — 서버가 최종 판정) |
| `testId` | `string` | `"html-editor"` | 뿌리 `data-testid`. 안쪽은 앞머리로 쓴다: `-rich`·`-source`·`-preview`·`-tb-<명령>`·`-mode-html`·`-preview-toggle`·`-link-input`·`-count`·`-view` |
| `ariaLabel` | `string` | `"본문"` | 편집 칸 접근성 이름 |
| `minHeight` | `number \| string` | `120` | 편집 칸(서식·원문·미리보기) 최소 높이 |
| `confirm` | `(message: string) => Promise<boolean>` | 공용 확인창 | 서식이 사라질 때 묻는 확인창 |

도우미(같은 서브패스):

- `textToHtml(text)` — 줄마다 `<p>`, `&`·`<`·`>` 이스케이프, 가운데 빈 줄은 `<p><br></p>`, 끝 빈 줄은 버림. 줄 안 공백은 지킴: 탭은 공백 4칸, 연속 공백은 줄 앞·뒤면 모두 `&nbsp;`, 줄 안이면 첫 칸만 일반 공백이고 나머지는 `&nbsp;`. 빈 글은 `""`.
- `htmlToText(html)` — 글자만. 블록 사이·`<br>` 은 줄바꿈, 블록 끝 `<br>` 은 줄을 더하지 않음, 표 칸은 탭, `script`·`style` 내용은 버림. `textToHtml` 결과를 되돌리면 원래 글이다(탭만 공백 4칸으로 돌아온다).
- `unsupportedRichTags(html)` — 서식 모드가 지키지 못하는 태그 이름 목록(빈 목록이면 서식 모드로 열어도 서식이 그대로).
- `HTML_EDITOR_LOSS_MESSAGE` — 원문 → 서식 확인 문구.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 모달 안에서 쓰는데 Escape 로 모달이 닫히며 편집 중인 내용이 사라짐 | 편집기는 Escape 를 처리하지 않아 모달로 올라간다. 모달 안에서 쓸 때 주의(Local-Rules §18) |
| `maxLength` 로 입력을 자르려고 `textarea maxLength` 를 따로 줌 | 붙여 넣은 글이 말없이 잘린다. 이 컴포넌트는 경고만 하고 서버가 거부한다 |
| 열 때 `getHTML()` 과 `value` 를 비교해 다르면 저장 안 됨 표시 | 열기만 해서는 `onChange` 가 없다. Tiptap 이 다듬은 HTML 은 사용자가 고칠 때만 나간다 |
| 다른 행으로 바꿔도 `key` 없이 같은 편집기를 씀 | `key={행 id}` — 되돌리기 기록과 처음 모드 판별이 새 값에서 시작한다 |
| 표가 든 HTML 을 서식 모드로 강제로 엶 | 원문 모드로 연다. 서식 모드로 바꾸면 표가 사라진다는 확인을 거친다 |
| 마크다운 메모에 이 편집기를 씀 | 저장 형식이 마크다운이면 [MarkdownEditor](markdown-editor.md) |
| HTML 미리보기를 `dangerouslySetInnerHTML` 로 직접 그림 | 원문 모드 [미리보기]·읽기 모습이 NoticeBodyView 로 소독해 그린다 |
