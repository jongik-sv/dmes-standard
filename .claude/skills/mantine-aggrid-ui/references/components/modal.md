# Modal

등록·수정·선택 팝업을 화면 위에 띄울 때 쓴다. 알림·확인 대화상자(`MessageModal`)는 직접 쓰지 않고 `useMessage` 로 띄운다.

- import: `import { Modal, ModalFill, ModalFillPart, MessageModal, type ModalProps, type ModalFillProps, type ModalFillPartProps, type MessageModalProps, type AlertType } from "@dk-oasis/shared/modal";` (`modal.tsx` 가 `modal.css` 를 스스로 불러온다)
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

### 바깥 누름과 닫기

모든 창은 기본으로 바깥(오버레이)을 눌러도 닫히지 않는다(2026-11-26부터, 알림·확인 창 `MessageModal` 포함). 잘못 누른 한 번에 입력하던 내용이 사라지지 않게 하려는 것이다. X·ESC·[취소]·[닫기]로 닫는다. 닫혀도 잃을 것이 없는 창에서 바깥 누름으로 닫고 싶을 때만 `closeOnClickOutside` 를 켠다.

### 크기 조절·이동과 높이 채우기 (2026-11-28 기본 켬)

모든 창은 기본으로 크기를 조절하고(`resizable`) 옮길 수 있다(`draggable`). 끄려면 `false` 를 준다. 확인·알림 창(`MessageModal`)은 켜지 않는다.

- 크기: 오른쪽 아래 모서리를 끌면 가로·세로가 바뀐다(최소 480×320, 최대는 화면 안 — 여백 16px). 왼쪽 위를 고정한 채 모서리가 포인터를 1:1 로 따라온다. 조절한 창에는 `cm-modal--resized` 클래스가 붙는다.
- 이동: 제목 줄을 끌면 옮겨진다. 머리줄은 화면 안에 남고, 머리줄 안 단추·입력에서 시작한 누름은 끌기가 아니다. 제목 줄을 두 번 누르면 가운데·기본 크기로 돌아간다.
- 기억: 조절한 크기·위치는 localStorage 에 남아 다음에 열 때 복원된다. 키를 안 주면 제목 기준(`cm-modal-box:<title>`)이다. 제목에 이름·번호가 들어가 바뀌는 창은 `resizeStorageKey` 로 고정 키를 준다. `null` 이면 남기지 않는다.
- 높이: 본문은 창의 남는 높이를 채운다. **팝업 안 그리드는 `height` 를 비워 채운다** — 본문에 바로 둔 그리드는 남는 높이를 채우고, 그리드가 둘 이상이거나 조회 조건·안내 줄과 함께면 `ModalFill` 로 감싼다. `ModalFill` 안에서 높이를 비운 그리드(`AgDataGrid`·`GridPanel`)는 남는 높이를 같은 비율로 나눠 갖고, 다른 줄은 제 높이다. 비율을 바꾸려면 그리드를 `ModalFillPart weight={2}` 로 감싼다(최소 높이 기본 120px). 창 크기를 조절하면 그리드가 따라 늘고 준다.
- 숫자 `height` 를 주면 지금처럼 그 높이로 고정된다(행이 적은 목록은 `height="auto"`).
- 저장 키 계산은 `modalBoxKey(resizeStorageKey, title)` 순수 함수다(준 키 → 그 키, `null` → 없음, 생략 → `cm-modal-box:<title>`).
- 크기 프리셋 높이: `md` 최소 400px, `lg` 최소 화면 70%, `xl` 최소 화면 80%(모두 화면 안). 폭은 sm 400·md 600·lg 900·xl 1024px.

```tsx
import { Modal, ModalFill, ModalFillPart } from "@dk-oasis/shared/modal";
import { AgDataGrid } from "@dk-oasis/shared/grid";

<Modal open title="적용 이력" size="xl" onClose={onClose}>
  <ModalFill>
    <div className="my-query-row">{/* 조회 조건 — 제 높이 */}</div>
    <AgDataGrid title="적용" columns={hisCols} data={his} rowKey="APPLY_ID" />            {/* height 없음 = 채움 */}
    <ModalFillPart weight={2}>
      <AgDataGrid title="바꾼 것" columns={dtlCols} data={dtl} rowKey="SEQ_NO" />         {/* 아래 칸이 두 배 */}
    </ModalFillPart>
  </ModalFill>
</Modal>
```

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
| closeOnClickOutside | `boolean` | `false` | 바깥(오버레이) 누름으로 닫을지. 기본은 닫지 않는다. 닫혀도 잃을 것이 없는 창만 `true`. X·ESC·[취소]는 영향 없다 |
| resizable | `boolean` | `true` | 오른쪽 아래 모서리 손잡이로 창 크기를 조절한다. 최소 480×320, 최대는 화면 안. 조절하면 창에 `cm-modal--resized` 클래스. 끄려면 `false` |
| draggable | `boolean` | `true` | 제목 줄을 끌어 창 위치를 옮긴다. 머리줄은 항상 화면 안, 두 번 누르면 가운데·기본 크기로 복귀. 끄려면 `false` |
| resizeStorageKey | `string \| null` | 제목 기준 | 조절한 크기·위치를 localStorage 에 남기는 키. 생략 = `cm-modal-box:<title>`, `null` = 남기지 않음(열려 있는 동안만 유지) |

ModalFill · ModalFillPart

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| gap (ModalFill) | `number` | `10` | 칸 사이 간격(px) |
| weight (ModalFillPart) | `number` | `1` | 남는 높이를 나눌 비율(flex-grow) |
| minHeight (ModalFillPart) | `number` | `120` | 칸 최소 높이(px) |
| className · testId | | - | 붙일 클래스·`data-testid` |

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

`MessageModal` 은 폭이 sm 으로 고정이고 크기 조절·이동이 없다. confirm 이면 취소(왼쪽) → 확인(오른쪽), 그 밖에는 확인 하나다. error·warning 에는 메시지 복사 버튼이 왼쪽 끝에 붙는다.

## 표준값: 모든 화면 동일

- footer 순서: 취소 → 실행(`variant="primary"`). 닫기만 있으면 "닫기" 하나.
- 등록 폼 팝업 `size` 는 `md`. 실행 버튼은 처리 중 `disabled={isBusy}`.
- 팝업 안의 목록도 `AgDataGrid` — `height` 를 비워 창 높이를 채운다(여럿이면 `ModalFill`). 행이 적으면 `height="auto"`. 입력은 상세 폼 표.
- GridPanel 안에서 띄운 팝업이어도 안의 `AgDataGrid` 는 자기 머리줄(그리드명·건수·엑셀 메뉴)을 그린다 — Modal 이 GridPanel 등록부를 끊는다(`GridPanelBoundary`, DOM 추가 없음). 바깥 GridPanel 의 건수·검색 칸·설정 메뉴는 영향을 받지 않는다. 안의 숫자 `height` 는 표 높이이고 머리줄(약 30~34px)이 더해지니, 팝업 안 고정 높이 칸에 넣을 때는 숫자에서 뺀다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 실행 버튼을 왼쪽에, 취소를 오른쪽에 둔다 | 취소가 왼쪽, 실행(primary)이 오른쪽이다 |
| 버튼 문구를 "확인"으로 통일한다 | 동작 그대로("저장"·"적용"·"선택")를 쓴다 |
| `onClose` 를 안 준다 | ESC·X 로 닫히지 않는다. 항상 준다 |
| 처리 중에도 ESC·X 로 닫힌다 | `onClose` 안에서 `isBusy` 를 보고 무시한다 |
| 바깥 누름을 막으려고 `closeOnClickOutside={false}` 를 붙인다 | 기본이 이미 닫지 않음이다. 붙이지 않는다 |
| 알림을 `MessageModal` 로 직접 그린다 | `showMessage` 를 쓴다([message](message.md)) |
| 같은 화면에 `Modal` 을 여러 개 같은 상태로 연다 | 팝업마다 열림 상태를 따로 둔다 |
| 팝업 안 그리드에 `height={240}` 같은 고정 높이를 준다 | 창을 키워도 그리드가 그대로다. `height` 를 비우고 여럿이면 `ModalFill` 로 감싼다 |
| 제목에 이름·번호가 들어가는 창에 저장 키를 안 준다 | 제목마다 저장 줄이 생긴다. `resizeStorageKey` 로 고정 키를 준다 |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dmc/codeMng/NewVersionModal.tsx:48-62`: 취소 → primary 순서. 단, 실행 문구가 "확인"이라 동작 그대로가 아니다(표준과 다름).
- `src/frontend/m-mdm/pages/dmb/layoutMng/components/HeaderPickModal.tsx:28`: 닫기만 있는 팝업 + 안의 `AgDataGrid`.
- `src/frontend/m-mdm/pages/dmb/layoutMng/components/ConstEditModal.tsx:61-76`: 적용 → 닫기 순서. 단, 표준(취소 → 실행)과 순서가 반대다.
- `src/frontend/m-mdm/pages/dme/ruleMng/page.tsx:289-308`: 조건부 마운트와 `onClose` 가드(오류 모달이 떠 있는 동안 닫기 무시).
- `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:1380-1400`: 팝업 본문에 `DETAIL_TABLE_STYLE` 상세 표를 쓴다.
- `MessageModal` 은 화면에서 직접 쓰는 곳이 아직 없다(아직 사용처 없음).
