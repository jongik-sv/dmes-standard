# FormGroup

라벨과 입력을 한 줄로 묶고 필수 표시·툴팁·오류 문구를 자동 연결해 주는 기존 화면용 폼 행이 필요할 때 쓴다. 새 화면에서는 쓰지 않는다.

- import: `import { FormGroup, type FormGroupProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/FormGroup.tsx`
- 내부 구현: Mantine `Input.Label` + 자체 툴팁(`document.body` 포털). `form.css` 를 스스로 import 한다.

## 언제 쓰나

- 쓴다: 이미 `FormGroup` 으로 만들어진 기존 화면을 최소 수정할 때만.
- 쓰지 않는다: 새 화면의 상세·등록 폼 → [detail-form](detail-form.md)의 라벨-값 표(`DETAIL_TABLE_STYLE` 등). 표준은 이쪽이다.
- 이유: 상세 표와 모양이 다르고(라벨 기본 폭 120 대 상세 표의 130) 현재 `src/frontend/m-*` 에서 사용처가 0 이다.

## 표준 사용

새 화면의 표준은 FormGroup 이 아니라 상세 표다. 같은 화면을 FormGroup 대신 이렇게 쓴다.

```tsx
import { DETAIL_TABLE_STYLE, DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Input } from "@dk-oasis/shared/form";

<table style={DETAIL_TABLE_STYLE}>
  <tbody>
    <tr>
      <th style={DETAIL_LABEL_CELL}>품번 *</th>
      <td style={DETAIL_VALUE_CELL}><Input value={form?.itemCd ?? ""} onChange={(v) => handleFormChange("itemCd", v)} /></td>
    </tr>
  </tbody>
</table>
```

## 변형

### 기존 FormGroup 화면을 고칠 때

라벨 옆에 자식 하나를 둔다. 자식이 하나이면 FormGroup 이 `id`·`aria-labelledby`·`aria-describedby`·`aria-invalid` 를 자식에 자동으로 넣는다. 자식이 둘 이상이거나 `Fragment` 이면 자동 연결이 되지 않는다.

```tsx
<FormGroup label="품번" required error={errors.itemCd} tip="영문 대문자와 숫자">
  <Input value={form?.itemCd ?? ""} onChange={(v) => handleFormChange("itemCd", v)} />
</FormGroup>
```

필수 표시는 라벨 앞의 `*` 이고, 상세 표의 규칙(라벨 끝 " *")과 위치가 반대다. 새 화면으로 옮길 때 라벨 끝 " *" 로 바꾼다.

### MDM 캡션·툴팁(2026-10-03)

`name`(화면 필드 이름)을 주면 포털 탭 안에서 MDM 컬럼 사전 메타를 찾는다([mdm-meta](mdm-meta.md)). `label` 을 생략하면 폼 캡션(`labelMid` → `labelLong` → `labelShort` → `columnName`), `tip` 을 생략하면 `MdmMetaCard` 가 라벨 툴팁이 된다. 적은 `label`·`tip` 이 이긴다(공급자 `captionPriority="mdm"` 이면 라벨은 MDM 이 이긴다). FormGroup 은 입력값을 보지 않는다 — 값 검사는 화면이 하고 결과를 `error` 로 준다.

```tsx
<FormGroup name="title" required error={errors.title}>
  <Input value={form.title} onChange={(v) => set("title", v)} />
</FormGroup>
```

MDM 정의로 값을 검사하려면 `useMdmValidation()`(`@dk-oasis/shared/mdm-meta`)의 결과를 `error` 로 준다. 저장 실패 오류는 `toFieldErrors(e)`(`@dk-oasis/shared/http`)에서 그 칸(`field`)의 `message` 를 `error` 로 준다.

```tsx
const { validateValue } = useMdmValidation();
<FormGroup name="title" required error={errors.title}>
  <Input value={form.title} onChange={(v) => { set("title", v); setError("title", validateValue("title", v)?.message); }} />
</FormGroup>
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| label | `string` | 없음 | 라벨 글자. 생략하고 `name` 이 있으면 MDM 폼 캡션, 그것도 없으면 `name`. |
| name | `string` | 없음 | MDM 컬럼 사전 연결 이름(`noticeTitle` → `NOTICE_TITLE`). 포털 탭 밖에서는 쓰지 않는다. |
| meta | `string \| false` | 없음 | 명시 물리명(`name` 보다 우선). `false` 면 MDM 연결을 끈다. |
| required | `boolean` | `false` | 라벨 앞에 `*` 를 붙인다. |
| children | `ReactNode` | 없음 | 입력 컴포넌트. 하나일 때 접근성 속성이 자동 연결된다. |
| labelWidth | `number` | `120` | 라벨 고정 폭(px). |
| error | `string` | 없음 | 오류 문구와 `aria-invalid`. |
| tip | `string \| ReactNode` | 없음 | 라벨에 올리거나 입력에 포커스하면 뜨는 툴팁. 생략하고 MDM 메타가 있으면 `MdmMetaCard`. |
| className | `string` | `""` | 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 배치에만 쓴다. |

## 표준값: 모든 화면 동일

- 새 화면에서는 쓰지 않는다. 상세 폼은 상세 표로 만든다.
- 기존 화면에서 쓰더라도 `labelWidth` 를 화면마다 바꾸지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 새 화면에 FormGroup 으로 폼을 만든다 | 상세 표로 만든다. |
| 자식 여럿(예: Input 과 Button)을 FormGroup 에 넣고 접근성 연결을 기대한다 | 자동 연결은 자식 하나일 때만 된다. 상세 표의 값 칸에 넣는다. |
| `error` 로 직접 오류를 넘기고 자식에도 `error` 를 준다 | 오류 문구가 두 번 나온다. 한쪽만 쓴다. |
| 툴팁 문구에 긴 설명을 넣는다 | 한 줄 안내만 넣는다. 긴 설명은 화면 안내 문구로 둔다. |

## 실제 사용 예

- 아직 사용처 없음(`src/frontend/m-*` 에서 `<FormGroup` 검색 결과 0건).
