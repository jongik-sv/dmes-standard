# printElementAsPage

화면의 한 영역(요소 하나)을 그 크기의 한 장짜리 페이지로 인쇄할 때 쓴다. 인쇄 창에서 「PDF로 저장」을 고르면 잘림 없는 PDF 한 장이 된다. 다른 출처 iframe(외부 웹 주소, sandbox srcdoc)도 찍힌다.

- import: `import { printElementAsPage, PRINT_PAGE_MAX_PX, type PrintElementOptions } from "@dk-oasis/shared/utils";`
- 소스: `src/frontend/shared/src/utils/libPrint.ts`
- 내부 구현: 그림 캡처(html-to-image 등)는 다른 출처 iframe 의 내용을 읽지 못해 쓰지 않고 브라우저 인쇄(`window.print()`)를 쓴다. 인쇄하는 동안 head 에 `@page { size: W×H; margin: 0 }` 와 `@media print` 스타일을 넣고 대상에 `data-print-target` 을 단다. 대상 밖(대상의 조상·형제)만 `visibility: hidden` 으로 숨기고, 대상 후손의 `visibility` 는 상속에 맡긴다(후손이 스스로 hidden 인 부품 — ag-grid `.ag-invisible` 등 — 은 숨은 채로 찍힌다). 대상은 화면 왼쪽 위에 `position: fixed` 로 전체 높이를 펼친다. 대상과 후손에 `print-color-adjust: exact` 를 걸어 배경·그라데이션을 화면 그대로 찍는다.
- 정리(스타일·속성 제거, 제목·스크롤 복원)는 `afterprint` 에서 한다. `print()` 가 바로 돌아오는 브라우저를 위해 돌아온 뒤에도 `afterprint` 가 오지 않으면 1000ms 뒤 안전망 타이머가 정리한다(미리보기를 그리는 동안은 스타일이 남는다). `print()` 가 던지면 즉시 정리하고 예외를 그대로 다시 던진다. 정리는 호출마다 한 번만 하고 끝나면 자기 `afterprint` 리스너를 떼므로, 늦게 온 `afterprint`·타이머가 끝난 호출의 제목·스크롤이나 다음 호출을 건드리지 않는다
- 확인한 브라우저는 Chrome(인쇄 창이 닫힐 때까지 `print()` 가 돌아오지 않는다)뿐이다.

## 언제 쓰나

- 쓴다: 홈 위젯 화면처럼 여러 부품·iframe 이 섞인 영역을 보이는 모습 그대로 PDF 한 장으로 남길 때.
- 쓰지 않는다: 목록 데이터를 파일로 내려받기 → [exportToExcel](export-to-excel.md). 양식이 정해진 장표(A4 여러 쪽)는 서버 보고서로 만든다.

## 표준 사용

```tsx
import { useRef } from "react";
import { printElementAsPage, today } from "@dk-oasis/shared/utils";
import { Button } from "@dk-oasis/shared/form";

export function BoardWithPdf() {
  const ref = useRef<HTMLDivElement>(null);
  const savePdf = () => {
    if (ref.current) printElementAsPage(ref.current, { title: `현황판_${today()}` });
  };
  return (
    <div ref={ref}>
      <Button data-print-hide="" onClick={savePdf}>PDF</Button>
      {/* 찍을 내용 */}
    </div>
  );
}
```

홈 위젯 화면은 직접 부르지 않는다. `WidgetWorkspace` 의 `pdfTarget` 을 주면 도구 줄에 [PDF] 단추가 생긴다([widget](widget.md)).

## 변형

### 찍지 않을 부품

대상 안에서 `data-print-hide` 를 단 요소(와 그 후손)는 PDF 에 나오지 않는다. 자리는 그대로 남는다(visibility). 도구 줄 단추와, 눌렀을 때 뜨는 메뉴·팝오버(`position: fixed` 라 인쇄 때도 남는다)·재시도 단추처럼 찍히면 안 되는 부품에 단다. `WidgetWorkspace`·`WidgetTabs` 는 [PDF]·[배치 편집]·탭 ⋯ 단추·(+)·탭 메뉴·불러오기 실패 띠의 [다시 시도]에 이미 달았다.

### iframe 안 문서의 색

iframe 안 문서는 부모 스타일을 물려받지 않는다. 직접 만드는 srcdoc 이면 문서 안에 `<style>@media print{*,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}</style>`(코드의 `HTML_FRAME_PRINT_STYLE`)를 문서 맨 앞에 붙여야 배경이 빠지지 않는다(m-mcm `widget-types/_content/html-frame.ts` 참고). srcdoc 문서는 HTML 명세상 doctype 이 없거나 style 이 doctype 앞에 와도 늘 표준 모드이므로 doctype 을 찾아 그 뒤에 끼울 필요가 없다(그런 정규식은 연속 주석에서 지수적으로 역추적한다). 외부 사이트 iframe 은 그 사이트의 인쇄 스타일을 따른다.

## Props

`printElementAsPage(el, opts?): void`

| 인자 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| el | `HTMLElement` | 필수 | 찍을 요소. 용지 크기는 `scrollWidth × scrollHeight`(스크롤해 둔 상태여도 처음부터 찍고 끝나면 스크롤을 되돌린다) |
| opts.title | `string` | - | 인쇄하는 동안의 `document.title`. Chrome 「PDF로 저장」의 기본 파일 이름이 된다. 끝나면 원래 제목으로 돌린다 |

`PRINT_PAGE_MAX_PX`(= 19200): Chrome PDF 한 장의 최대 변 길이(약 200인치). 대상이 이보다 크면 CSS `zoom` 으로 줄여 한 장에 넣고 용지도 줄인 크기로 잡는다.

## 표준값: 모든 화면 동일

- 파일 이름(`title`)은 `<화면·탭 이름>_<yyyyMMdd>`(`today()`), 파일 이름에 못 쓰는 글자(`\ / : * ? " < > |`)는 `_`.
- 인쇄 단추에는 `data-print-hide` 를 단다. title 은 「… PDF 로 저장(인쇄 창에서 'PDF로 저장' 선택)」.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 인쇄 창의 대상을 프린터로 둔 채 인쇄한다 | 프린터는 `@page` 크기를 무시하고 A4 로 자른다. 대상을 「PDF로 저장」으로 고르도록 단추 title 에 적는다 |
| 그리드·메모처럼 안쪽에 스크롤이 있는 부품이 다 찍힐 줄 안다 | 대상 자신의 스크롤만 펼친다. 부품 안쪽 스크롤 영역은 지금 보이는 부분만 찍힌다 |
| html-to-image 같은 캡처로 바꾼다 | 다른 출처 iframe 이 빈칸으로 나온다 |
| 정리 전에 다시 부를까 걱정해 상태를 따로 둔다 | 다시 부르면 앞의 것을 먼저 정리한다 |
| `print()` 가 던질 수 있다는 걸 잊는다 | 던지면 정리한 뒤 예외를 다시 던진다. 부르는 쪽(`WidgetWorkspace`)이 잡아 알림을 보인다 |
| 대상 후손에 `visibility: visible` 을 강제하는 스타일을 따로 더한다 | 후손의 의도된 hidden(ag-grid 의 `.ag-invisible` 등)이 풀려 찍힌다. 후손은 상속에 맡긴다 |

## 실제 사용 예

- `src/frontend/shared/src/widget/WidgetWorkspace.tsx`: `pdfTarget` 이 있으면 [PDF] 단추가 대상(없으면 작업 공간)을 「{탭 이름}_{yyyyMMdd}」로 찍는다.
- `src/frontend/m-mcm/page-components/home/page.tsx`: 홈 뿌리 `.mcm-home` 을 `pdfTarget` 으로 넘긴다.
