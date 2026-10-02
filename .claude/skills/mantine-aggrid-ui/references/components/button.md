# Button

팝업 footer, 상세 폼 안, 패널 머리처럼 PageLayout 상단 버튼이 아닌 자리에서 동작을 실행하는 버튼이 필요할 때 쓴다.

- import: `import { Button, type ButtonProps, type ButtonVariant } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/Button.tsx`
- 내부 구현: Mantine `Button` (variant 는 `default`→`default`, `primary`→`filled`+dmes, `danger`→`filled`+danger)

## 언제 쓰나

- 쓴다: `Modal` 의 `footer` 버튼(취소·저장·적용·선택·닫기).
- 쓴다: 상세 폼 값 칸 옆의 "검색" 같은 보조 버튼, 상세 패널 안의 실행 버튼.
- 쓰지 않는다: 화면 상단의 조회·신규·저장·삭제·엑셀 → 대신 [PageLayout](page-layout.md)의 `buttons` 배열.
- 쓰지 않는다: 그리드 머리의 행추가·행삭제·행복사 → `GridPanel` 의 `showAddButton`·`buttons`(행삭제 확인창 버튼)·`showCopyButton`.

## 표준 사용

```tsx
import { Button } from "@dk-oasis/shared/form";

// 팝업 footer: 취소(왼쪽, 기본) → 실행(오른쪽, primary)
footer={
  <>
    <Button onClick={onClose}>취소</Button>
    <Button variant="primary" onClick={() => void handleSubmit()} disabled={isBusy}>저장</Button>
  </>
}
```

닫기만 있는 팝업은 `<Button onClick={onClose}>닫기</Button>` 하나만 둔다.

## 변형

### variant

| variant | 쓰는 곳 |
|---|---|
| `default`(생략) | 취소·닫기·보조 동작 |
| `primary` | 팝업의 실행 버튼 한 개, 화면 안의 핵심 동작 한 개 |
| `danger` | 되돌리기 어려운 동작(폐기·중단 등). 한 영역에 하나 |

```tsx
<Button variant="danger" disabled={!canDeprecate} onClick={() => void handleDeprecate()}>폐기</Button>
```

### 폼 안의 submit

기본 `type` 은 `"button"` 이라 form 안에서 눌러도 제출되지 않는다. 제출 버튼만 `type="submit"` 을 준다.

### 복사 버튼 — CopyTextButton

식별자·오류 문구를 클립보드에 복사하는 작은 버튼은 `CopyTextButton` 을 쓴다(`form` 서브패스, 2026-10-02 공개 — props·동작은 `ErrorModal`·`MessageModal` 이 쓰던 그대로다). 누르면 1.5초 동안 "복사됨"/"복사 실패" 로 바뀐다. `text` 가 함수면 누를 때 계산한다. 보안 컨텍스트(https·localhost)가 아니면 숨긴 textarea + `execCommand("copy")` 로 대신한다. 같은 동작을 버튼 없이 쓰려면 `copyText(text): Promise<boolean>`.

```tsx
import { CopyTextButton } from "@dk-oasis/shared/form";

<CopyTextButton text={column.physName} />            // 기본 문구 "복사", data-testid="copy-text-button"
<CopyTextButton text={() => `오류\n${message}`} label="오류 복사" />
```

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| text | `string \| (() => string)` | — | 복사할 문자열 |
| label | `string` | `"복사"` | 평소 문구 |
| className | `string` | `"cm-btn cm-btn-outline"` | 클래스 |
| style | `React.CSSProperties` | 없음 | 배치용(색 금지) |

## Props

`ButtonProps` 는 `button` 요소의 HTML 속성(`type` 제외)을 모두 받는다. 아래는 이 래퍼가 직접 다루는 것이다.

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| children | `ReactNode` | 없음 | 버튼 문구. |
| variant | `"default" \| "primary" \| "danger"` | `"default"` | 모양. |
| onClick | `React.MouseEventHandler<HTMLButtonElement>` | 없음 | 클릭 핸들러. |
| disabled | `boolean` | `false` | 비활성. |
| type | `"button" \| "submit" \| "reset"` | `"button"` | HTML 버튼 종류. |
| size | `"default" \| "sm" \| "mini"` | `"default"` | 화면에서 지정하지 않는다(아래 참고). |
| className | `string` | `""` | 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 폭 같은 배치에만 쓴다(색·글꼴 금지). |
| ariaLabel | `string` | 없음 | `aria-label`. 아이콘만 있는 버튼에 쓴다. |

나머지 HTML 속성(`data-testid`, `title` 등)은 그대로 `button` 에 전달된다. `ButtonSize` 타입은 `form` 서브패스로 내보내지 않는다.

## 표준값: 모든 화면 동일

- 화면에서 `size` 를 지정하지 않는다. 좁은 트리 툴바·드로워용 `sm`·`mini` 는 shared 내부 전용이다.
- 팝업 footer 의 순서는 취소(왼쪽) → 실행(오른쪽, `variant="primary"`)이다.
- 실행 문구는 동작 그대로 쓴다("저장"·"적용"·"선택"). 업무명을 덧붙이지 않는다.
- 처리 중에는 `disabled={isBusy}` 를 준다.
- 색·`radius` prop 이나 16진수 색을 주지 않는다. 위험 동작은 `variant="danger"` 로 표현한다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 상단 조회·저장을 `<Button>` 으로 직접 그린다 | `PageLayout` 의 `buttons` 배열에 `PageButton` 으로 넣는다. 권한과 F8 이 거기서 처리된다. |
| `size="sm"` 으로 작게 만든다 | 지정하지 않는다. 기본 높이가 표준이다. |
| 폭을 맞추려고 `style={{ width: 110, background: ... }}` 를 준다 | 폭만 준다. 색은 `variant` 로 정한다. |
| `onClick={async () => {...}}` 로 Promise 를 버린다 | `onClick={() => void handleX()}` 로 쓴다. |
| 취소를 `primary` 로 둔다 | 취소는 기본 variant 이고 실행이 `primary` 다. |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:1158` 값 칸 옆 보조 버튼(`style={{ width: "100%" }}`). 폭 지정만 있어 표준에 맞는다.
- `src/frontend/m-mdm/pages/dme/ruleMng/RuleDetailPanel.tsx:240` `variant="danger"`.
- `src/frontend/m-mdm/pages/dme/ruleConfirm/page.tsx:324` 옆의 "검사"·"확정"(`variant="primary"`) 버튼. m-mdm 화면이다.
- `src/frontend/m-mdm/pages/dmc/codeMng/NewVersionModal.tsx:55` 팝업 footer 의 취소 → 실행 쌍(m-mdm 화면).
- 표준 예제: `.claude/skills/mantine-aggrid-ui/references/examples/master-detail/RegisterModal.tsx`.
