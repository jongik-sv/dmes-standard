# Modal

등록·수정·선택 팝업을 화면 위에 띄울 때 쓴다. 알림·확인 대화상자(`MessageModal`)는 직접 쓰지 않고 `useMessage` 로 띄운다.

- import: `import { Modal, MessageModal, type ModalProps, type MessageModalProps, type AlertType } from "@dk-oasis/shared/modal";` (`modal.tsx` 가 `modal.css` 를 스스로 불러온다)
- 소스: `src/frontend/shared/src/components/modal.tsx`
- 내부 구현: Mantine `Modal.Root` + 초점·ESC 보정 훅(`useModalA11yCompat`, `useEscapeCompat`). `MessageModal` 은 같은 구현 위에 아이콘·확인 버튼을 얹는다

## 언제 쓰나

- 쓴다: 등록 폼·적용/선택 팝업·행 편집 팝업. 안의 목록은 `AgDataGrid`, 입력은 상세 폼 표 규칙을 따른다.
- 쓰지 않는다: 메시지·확인·오류 알림 → [message](message.md) 의 `showMessage`. 코드·명 선택 팝업 → [lookup](lookup.md).

## 표준 사용

```tsx
import { useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { Button, Input } from "@dk-oasis/shared/form";
import { DETAIL_TABLE_STYLE, DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";

export function UnitRegModal({ open, isBusy, onClose, onSubmit }: {
  open: boolean; isBusy: boolean; onClose: () => void; onSubmit: (unitNm: string) => void;
}) {
  const [unitNm, setUnitNm] = useState("");
  return (
    <Modal
      open={open}
      title="단위 등록"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => onSubmit(unitNm)} disabled={isBusy}>저장</Button>
        </>
      }
    >
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>단위명 *</th>
            <td style={DETAIL_VALUE_CELL}><Input value={unitNm} onChange={setUnitNm} /></td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
```

## 변형

### 닫기만 있는 팝업

실행할 동작이 없으면 버튼은 `<Button onClick={onClose}>닫기</Button>` 하나다.

```tsx
<Modal open={open} title="헤더 추가" size="md" onClose={onClose} footer={<Button onClick={onClose}>닫기</Button>}>
  {/* AgDataGrid */}
</Modal>
```

### footer 버튼 순서

취소(왼쪽, 기본 variant) → 실행(오른쪽, `variant="primary"`). 실행 문구는 동작 그대로("저장"·"적용"·"선택")다. footer 는 오른쪽 정렬이라 DOM 순서가 그대로 왼쪽에서 오른쪽 순서가 된다.

### 겹친 모달과 ESC

모달 위에 모달을 띄워도(예: SQL 큰 창 위의 확인 창) ESC 한 번에 맨 위 하나만 닫힌다. 열린 모달 순서는 `modal-stack.ts` 가 관리하고 `closeOnEscape` 와 Tab 가두기는 맨 위 모달만 처리한다. 화면에서 따로 할 일은 없다. 단, `modals.open*`(Mantine `ModalsProvider`)로 띄운 창은 순서표 밖이다.

### 바깥을 눌러도 닫히지 않게

긴 입력 초안이 있는 창은 `closeOnClickOutside={false}` 로 둔다. X·ESC·[취소]로는 지금처럼 닫힌다.

### 사용자가 크기를 조절하게 하기

긴 내용을 편집하는 창(SQL 큰 창 등)만 `resizable` 을 켠다. 오른쪽 아래 모서리를 끌면 가로·세로가 바뀐다(최소 480×320, 최대는 화면 안 — 여백 16px). 왼쪽 위를 고정한 채 모서리가 포인터를 1:1 로 따라온다. 조절한 창에는 `cm-modal--resized` 클래스가 붙으므로, 안쪽 내용이 높이를 따라 늘어나야 하면 이 클래스 아래에서 `flex: 1 1 0; min-height: 0` 으로 둔다. `draggable` 을 켜면 제목 줄을 끌어 창을 옮길 수 있다(머리줄이 화면 안에 남도록 막고, 머리줄 안 단추·입력에서 시작한 누름은 끌기가 아니며, 제목 줄을 두 번 누르면 가운데·기본 크기로 돌아간다). `resizeStorageKey` 를 주면 크기·위치를 localStorage 에 남겨 다음에 열 때 복원한다(화면이 바뀌어 머리줄이 밖이면 가운데로, 저장이 안 돼도 기본 모양).

### 열 때마다 상태를 새로 시작하기

`open` 만 바꾸면 안쪽 상태가 남는다. 열 때마다 비워야 하면 부모에서 `{isOpen && <Modal open …>}` 로 조건부로 만든다.

## Props

Modal

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| open | `boolean` | 필수 | 열림 여부 |
| title | `string` | - | 머리 제목. 제목도 닫기 버튼도 없으면 머리가 없다 |
| children | `ReactNode` | - | 본문 |
| footer | `ReactNode` | - | 하단 버튼 영역(오른쪽 정렬) |
| onClose | `() => void` | 아무 일 없음 | X 버튼·ESC·바깥 클릭(`closeOnClickOutside`)에서 호출. 안 주면 닫히지 않는다 |
| size | `"sm" \| "md" \| "lg" \| "xl"` | `"md"` | 폭. 등록 폼 기본은 md |
| showCloseButton | `boolean` | `true` | 머리의 X 버튼 |
| toolbar | `ReactNode` | - | 본문 위 도구줄 슬롯 |
| className | `string` | `""` | 창에 붙일 클래스 |
| bodyClassName | `string` | `""` | 본문에 붙일 클래스 |
| descriptionId | `string` | - | 창이 설명으로 참조할 본문 요소 id |
| closeOnClickOutside | `boolean` | `true` | 바깥(오버레이) 누름으로 닫을지. 초안이 사라지면 곤란한 창(SQL 큰 창 등)만 `false`. X·ESC·[취소]는 영향 없다 |
| resizable | `boolean` | `false` | 오른쪽 아래 모서리 손잡이로 창 크기를 조절한다. 최소 480×320, 최대는 화면 안. 조절하면 창에 `cm-modal--resized` 클래스 |
| draggable | `boolean` | `false` | 제목 줄을 끌어 창 위치를 옮긴다. 머리줄은 항상 화면 안, 두 번 누르면 가운데·기본 크기로 복귀 |
| resizeStorageKey | `string` | - | `resizable`·`draggable` 일 때 조절한 크기·위치를 localStorage 에 이 키로 남긴다(없으면 열려 있는 동안만 유지) |

MessageModal (보통 `MessageProvider` 가 대신 띄운다)

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| open | `boolean` | 필수 | 열림 여부 |
| onClose | `() => void` | 필수 | 닫기·취소 |
| title | `string` | `"알림"`(confirm 은 `"확인"`) | 제목 |
| message | `string \| ReactNode` | - | 본문 |
| alertType | `AlertType` | `"info"` | `"info" \| "warning" \| "error" \| "success" \| "confirm"` |
| onConfirm | `() => void` | - | confirm 의 확인 버튼. 호출 후 닫는 일은 호출자 몫이다 |
| confirmText | `string` | `"확인"` | 확인 버튼 문구 |
| cancelText | `string` | `"취소"` | confirm 의 취소 문구 |

`MessageModal` 은 폭이 sm 으로 고정이다. confirm 이면 취소(왼쪽) → 확인(오른쪽), 그 밖에는 확인 하나다. error·warning 에는 메시지 복사 버튼이 왼쪽 끝에 붙는다.

## 표준값: 모든 화면 동일

- footer 순서: 취소 → 실행(`variant="primary"`). 닫기만 있으면 "닫기" 하나.
- 등록 폼 팝업 `size` 는 `md`. 실행 버튼은 처리 중 `disabled={isBusy}`.
- 팝업 안의 목록도 `AgDataGrid`(행이 적으면 `height="auto"`), 입력은 상세 폼 표.
- GridPanel 안에서 띄운 팝업이어도 안의 `AgDataGrid` 는 자기 머리줄(그리드명·건수·엑셀 메뉴)을 그린다 — Modal 이 GridPanel 등록부를 끊는다(`GridPanelBoundary`, DOM 추가 없음). 바깥 GridPanel 의 건수·검색 칸·설정 메뉴는 영향을 받지 않는다. 안의 숫자 `height` 는 표 높이이고 머리줄(약 30~34px)이 더해지니, 팝업 안 고정 높이 칸에 넣을 때는 숫자에서 뺀다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 실행 버튼을 왼쪽에, 취소를 오른쪽에 둔다 | 취소가 왼쪽, 실행(primary)이 오른쪽이다 |
| 버튼 문구를 "확인"으로 통일한다 | 동작 그대로("저장"·"적용"·"선택")를 쓴다 |
| `onClose` 를 안 준다 | ESC·X 로 닫히지 않는다. 항상 준다 |
| 처리 중에도 바깥 클릭으로 닫힌다 | `onClose` 안에서 `isBusy` 를 보고 무시한다 |
| 알림을 `MessageModal` 로 직접 그린다 | `showMessage` 를 쓴다([message](message.md)) |
| 같은 화면에 `Modal` 을 여러 개 같은 상태로 연다 | 팝업마다 열림 상태를 따로 둔다 |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dmc/codeMng/NewVersionModal.tsx:48-62`: 취소 → primary 순서. 단, 실행 문구가 "확인"이라 동작 그대로가 아니다(표준과 다름).
- `src/frontend/m-mdm/pages/dmb/layoutMng/components/HeaderPickModal.tsx:28`: 닫기만 있는 팝업 + 안의 `AgDataGrid`.
- `src/frontend/m-mdm/pages/dmb/layoutMng/components/ConstEditModal.tsx:61-76`: 적용 → 닫기 순서. 단, 표준(취소 → 실행)과 순서가 반대다.
- `src/frontend/m-mdm/pages/dme/ruleMng/page.tsx:289-308`: 조건부 마운트와 `onClose` 가드(오류 모달이 떠 있는 동안 닫기 무시).
- `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:1380-1400`: 팝업 본문에 `DETAIL_TABLE_STYLE` 상세 표를 쓴다.
- `MessageModal` 은 화면에서 직접 쓰는 곳이 아직 없다(아직 사용처 없음).
