# 상세 폼 (DETAIL_TABLE_STYLE · DETAIL_LABEL_CELL · DETAIL_VALUE_CELL)

선택한 행의 상세 정보를 라벨-값 두 칸짜리 표로 보여 주고 수정할 때 쓴다.

- import: `import { DETAIL_TABLE_STYLE, DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";`
- 소스: `src/frontend/shared/src/layout/DetailFormStyles.ts`
- 내부 구현: 컴포넌트가 아니라 `CSSProperties` 상수 3개다. 표와 입력은 화면이 직접 만든다.

## 언제 쓰나

- 쓴다: 목록 옆(오른쪽 `ContentPanel width={460}`)의 상세·등록 폼.
- 쓴다: 팝업(`Modal`) 안의 등록 폼.
- 쓰지 않는다: 라벨이 위·입력이 아래인 세로 폼이나 라벨 옆 한 줄 폼 → 이 표를 쓴다. [FormGroup](form-group.md)은 새 화면에서 쓰지 않는다.
- 쓰지 않는다: `INPUT_BASE`·`INPUT_READONLY`·`INPUT_DISABLED` 로 원시 `<input>` 을 꾸미는 방식 → 대신 form 래퍼([Input](input.md), [Select](select.md), [DatePicker](date-picker.md), [Textarea](textarea.md), [ComboBox](combo-box.md), [Checkbox](checkbox.md), [Radio](radio.md)).

## 표준 사용

```tsx
import { DETAIL_TABLE_STYLE, DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { DatePicker, Input, Textarea } from "@dk-oasis/shared/form";

<table style={DETAIL_TABLE_STYLE}>
  <tbody>
    <tr>
      <th style={DETAIL_LABEL_CELL}>검사번호</th>
      <td style={DETAIL_VALUE_CELL}><Input value={form?.inspNo ?? ""} disabled readOnly /></td>
    </tr>
    <tr>
      <th style={DETAIL_LABEL_CELL}>검사일자 *</th>
      <td style={DETAIL_VALUE_CELL}>
        <DatePicker value={form?.inspDt ?? ""} disabled={!form || isBusy} onChange={(v) => handleFormChange("inspDt", v)} />
      </td>
    </tr>
    <tr>
      <th style={DETAIL_LABEL_CELL}>비고</th>
      <td style={DETAIL_VALUE_CELL}>
        <Textarea value={form?.remark ?? ""} rows={4} disabled={!form || isBusy} onChange={(v) => handleFormChange("remark", v)} />
      </td>
    </tr>
  </tbody>
</table>
```

`<thead>` 는 두지 않는다(목록이 아니므로 허용되는 예외다). `ContentPanel width={460}` 의 첫 자식이 곧바로 이 표이며 머리·제목을 따로 두지 않고, 패널 안을 `display: flex` 인 `div` 로 다시 감싸지 않는다.

## 변형

### 한 행에 항목 둘

라벨·값 쌍을 한 `<tr>` 에 두 번 둔다. 폭이 좁은 상세 패널(460px)에서는 쓰지 않고 한 행에 한 항목만 둔다.

```tsx
<tr>
  <th style={DETAIL_LABEL_CELL}>수량</th>
  <td style={DETAIL_VALUE_CELL}><Input type="number" value={form?.qty ?? ""} onChange={(v) => handleFormChange("qty", v)} /></td>
  <th style={DETAIL_LABEL_CELL}>단위</th>
  <td style={DETAIL_VALUE_CELL}><Input value={form?.unit ?? ""} onChange={(v) => handleFormChange("unit", v)} /></td>
</tr>
```

### 값 칸에 입력과 버튼 함께

값 칸 안에서 `div` 로 `flex` 를 쓰되 간격은 `var(--spacing-xs)` 같은 토큰만 쓴다. 버튼은 [Button](button.md)이다.

## 상수

| 상수 | 역할 | 값 요약 |
|---|---|---|
| `DETAIL_TABLE_STYLE` | 표 컨테이너 | 폭 100%, 셀 경계 합침, 글자 `--font-size-sm`, 배경 `--color-bg` |
| `DETAIL_LABEL_CELL` | 라벨 `th` | 회색 헤더 배경, 테두리, 왼쪽 정렬, 폭 130px 고정, 줄바꿈 없음 |
| `DETAIL_VALUE_CELL` | 값 `td` | 흰 배경, 테두리, 안쪽 여백 `4px 6px` |
| `INPUT_BASE`·`INPUT_READONLY`·`INPUT_DISABLED` | 원시 input 스타일 | 새 코드에서 쓰지 않는다 |

## 표준값: 모든 화면 동일

- 필수 항목은 라벨 끝에 " *" 를 붙인다(예: "검사일자 *").
- 읽기전용 값은 `readOnly` 와 `disabled` 를 함께 준다.
- 선택된 행이 없을 때(`form` 이 비어 있을 때)는 모든 입력에 `disabled` 를 준다.
- 안내 문구가 필요하면 표 아래에 `var(--color-text-muted)` 글자색으로 둔다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `<input style={INPUT_BASE} />` 로 원시 입력을 쓴다 | 같은 자리에 form 래퍼를 쓴다. 크기·색·포커스가 모든 화면에서 같아진다. |
| 라벨 셀에 `width` 를 덧씌운다 | 라벨 폭 130px 은 표준이다. 긴 라벨은 줄여 쓴다. |
| `FormGroup` 으로 상세 폼을 만든다 | 이 표로 만든다. |
| 필수 표시를 `*` 앞 공백 없이 붙이거나 빨간색 인라인으로 준다 | 라벨 끝에 " *" 만 붙인다. 색은 주지 않는다. |
| 선택 행이 없는데 입력이 활성이다 | `disabled={!form || isBusy}` 로 막는다. |

## 실제 사용 예

- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx:302` 목록 옆 상세 폼 전체(Input·Select·DatePicker·Textarea, 읽기전용 공지번호, 필수 " *", `!form` 비활성).
- `src/frontend/m-mdm/pages/dma/unitMng/page.tsx:262` ComboBox·읽기전용 Input 이 섞인 상세 폼. m-mdm 화면이므로 `MdmPageLayout` 아래에 있다.
