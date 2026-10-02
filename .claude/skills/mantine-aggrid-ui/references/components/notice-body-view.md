# NoticeBodyView

공지 본문을 일반 글(TEXT)·마크다운(MD)·HTML 세 형식으로 읽기 전용으로 보여 줄 때 쓴다. 세 형식 모두 같은 문서 서식(제목·목록·인용·코드·표·링크)으로 보인다.

- import: `import { NoticeBodyView, sanitizeNoticeHtml, type NoticeBodyViewProps, type NoticeBodyFormat } from "@dk-oasis/shared/notice-body-view";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/notice-body-view/` (`NoticeBodyView.tsx`·`sanitize.ts`)
- 내부 구현: TEXT 는 React 이스케이프 + `white-space: pre-wrap`, MD 는 [MarkdownView](markdown-editor.md) 재사용, HTML 은 `dompurify`(shared dependencies)로 소독한 뒤 넣는다. 서버 렌더에서는 HTML 을 비우고 마운트 뒤에 채운다.
- Part B 허용 목록(§1): `notice-body-view` SHOULD.

## 언제 쓰나

- 쓴다: 포털 홈 공지 카드, 공지 관리 화면의 미리보기처럼 형식이 섞인 공지 본문을 읽기만 할 때.
- 쓰지 않는다: 마크다운 한 형식만 보이거나 편집이 필요할 때 → [MarkdownEditor](markdown-editor.md)(`MarkdownView`·`MarkdownField`). 서식 없는 입력 → [Textarea](textarea.md).
- MD 형식은 `MarkdownView` 의 문법 범위를 따른다: 제목·굵게·기울임·취소선·목록·**할 일 목록**·인용·코드·링크는 되고, **GFM 표는 지원하지 않아 글자로 남는다**. 표가 필요하면 HTML 형식을 쓴다.
- HTML 소독 규칙: script·style·iframe·object·embed·form(입력 계열)·svg·math 태그, `on*` 속성, 인라인 `style` 속성, http/https 가 아닌 링크·이미지 주소(`a[href]`·`img[src]`, 상대 주소·`data:`·`javascript:` 포함)를 지운다. 링크는 `target="_blank" rel="noopener noreferrer"` 로 연다. 이미지 주소 규칙은 서버 소독(mls `NoticeHtmlSanitizer`, `img[src]` http·https 만)과 같아서 미리보기가 저장 결과와 같게 보인다. 붙여 넣은 `data:` 이미지는 미리보기에서도 빈 그림이 된다.
- 표·긴 코드는 이 컴포넌트 안에서만 가로로 스크롤하고 부모 폭을 늘리지 않는다.

## 표준 사용

```tsx
import { NoticeBodyView } from "@dk-oasis/shared/notice-body-view";

export function NoticeCardBody({ body, format }: { body: string; format: "TEXT" | "MD" | "HTML" }) {
  return <NoticeBodyView value={body} format={format} emptyText="내용이 없습니다." testId="notice-card-body" />;
}
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `value` | `string` | — | 본문 원문 |
| `format` | `"TEXT" \| "MD" \| "HTML"` | — | 본문 형식 |
| `className` | `string` | — | 뿌리에 더할 클래스(`nbv` 는 늘 붙는다) |
| `testId` | `string` | `"notice-body-view"` | 뿌리 `data-testid`. MD 일 때 안쪽 뷰는 `<testId>-md` |
| `emptyText` | `string` | 없음 | 본문이 비었을 때 보일 글 |

`sanitizeNoticeHtml(html): string | null` — 같은 규칙으로 HTML 을 소독한 문자열(브라우저 DOM 이 없으면 null).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 공지 HTML 을 `dangerouslySetInnerHTML` 로 직접 넣음 | 이 컴포넌트로 보인다(소독 포함) |
| MD 본문에서 표가 안 보인다고 `marked` 를 직접 씀 | 표는 HTML 형식으로 저장한다. `MarkdownView` 는 표를 지원하지 않는다 |
| 부모 폭이 늘어남을 화면 CSS 로 덮음 | 이 컴포넌트가 표·코드를 안에서 스크롤한다. 부모에 `min-width: 0` 만 확인한다 |
