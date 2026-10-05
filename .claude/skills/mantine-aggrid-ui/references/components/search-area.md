# SearchArea

조회조건 입력칸을 격자로 배치하고 어느 입력에서든 Enter 로 조회가 실행되게 할 때 쓴다. 칸 하나는 SearchField 로 만든다.

- import: `import { SearchArea, SearchField } from "@dk-oasis/shared/layout";`
- 소스: `src/frontend/shared/src/layout/SearchArea.tsx`, `src/frontend/shared/src/layout/SearchField.tsx`
- 내부 구현: Mantine `Paper`(SearchArea), `Text`(SearchField 라벨). 입력칸은 shared 의 [Input](input.md)·[Select](select.md)·[Radio](radio.md)

## 언제 쓰나

- 쓴다: 목록 위의 조회조건 영역 전체.
- 쓴다: 텍스트·선택·라디오·날짜 등 조회조건 한 칸(SearchField).
- 쓰지 않는다: 상세 폼의 라벨-값 입력 → [detail-form](detail-form.md).

## 표준 사용

```tsx
import { SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { DatePicker } from "@dk-oasis/shared/form";

<SearchArea onSearch={() => void handleSearch()}>
  <SearchField label="품번" value={f.itemCd} onChange={(v) => set("itemCd", v)} />
  <SearchField
    label="검사유형"
    type="select"
    value={f.inspType}
    onChange={(v) => set("inspType", v)}
    options={[{ value: "", label: "전체" }, { value: "IN", label: "수입검사" }]}
  />
  <SearchField label="검사일자"><DatePicker value={f.fromDt} onChange={(v) => set("fromDt", v)} /></SearchField>
  <SearchField label="~"><DatePicker value={f.toDt} onChange={(v) => set("toDt", v)} /></SearchField>
</SearchArea>
```

`onSearch` 는 생략하지 않는다. 지정하면 내부가 `form` 이 되어 Enter 가 조회로 이어진다.

## 변형

### 기간(From~To)

두 개의 SearchField 로 쓰고 두 번째 label 을 정확히 `"~"` 로 둔다. SearchArea 가 직전 필드와 한 칸(span 2)으로 묶는다. 인라인 `div`·`span` 으로 묶지 않는다. 기본값은 시작이 오늘 7일 전, 종료가 오늘이며 문자열은 `yyyy-MM-dd` 다: `formatDateStr(addDays(today(), -7))`·`formatDateStr(today())`(`@dk-oasis/shared/utils`). `today()`·`addDays()` 는 `yyyyMMdd` 를 돌려주므로 `formatDateStr` 를 꼭 거친다. `formatDate` 는 UTC 계산이라 하루가 밀릴 수 있어 쓰지 않는다.

### 복합 입력(입력 2개 이상)

`children` 에 입력 요소가 2개 이상이면 SearchField 가 자동으로 `span-2` 를 붙인다. 입력 하나짜리를 넓히고 싶을 때만 `className="span-2"` 를 직접 준다.

```tsx
<SearchField label="마루 코드" className="span-2">
  <Input value={f.code} onChange={(v) => set("code", v)} />
</SearchField>
```

### 최근 입력값(historyKey)

텍스트칸은 최근 입력값 드롭다운이 붙을 수 있다. 현재는 pageId 가 `mpn:` 으로 시작하는 APS 화면에서만 켜지고 다른 모듈에서는 `historyKey` 가 아무 효과가 없다. 한 화면에 같은 label 의 텍스트칸이 둘 이상이면 `historyKey` 를 따로 준다.

### MDM 라벨 툴팁(name·meta)

`name` 을 주면 라벨에 마우스를 올릴 때 MDM 컬럼 사전 카드 툴팁이 뜬다([mdm-meta](mdm-meta.md) 의 `MdmFieldLabel` 과 같은 규칙: `name` → 물리명, `meta` 문자열이 `name` 보다 우선, `meta={false}` 면 끔). `name` 이 없으면 예전과 DOM·요청이 같다. 필터 키(`edt_`·`cbo_`)에서 이름을 추론하지 않으므로 업무 키를 직접 적는다. 라벨 글자는 기본(explicit)에서 `label` 그대로이고 Radio `name`·최근 입력값 키도 `label` 을 쓴다.

```tsx
<SearchField label="제목" name="title" value={f.title} onChange={(v) => set("title", v)} />
<SearchField label="코드" name="code" meta="MASTER_CD" value={f.code} onChange={(v) => set("code", v)} />
```

## Props

SearchAreaProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| children | `React.ReactNode` | 필수 | SearchField 들. |
| onSearch | `() => void` | 없음 | Enter 조회 핸들러. 지정하면 form 으로 렌더되고 최근 검색값 저장 이벤트도 낸다. |

SearchFieldProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| label | `string` | 필수 | 라벨. `"~"` 이면 직전 필드와 묶인다. |
| name | `string` | 없음 | MDM 컬럼 사전 키(업무 키, 예 `"title"`). 있고 사전에 있으면 라벨에 MDM 카드 툴팁이 뜬다. |
| meta | `string \| false` | 없음 | 명시 물리명(`name` 보다 우선). `false` 면 MDM 연결을 끈다. `name` 이 있을 때만 쓴다. |
| type | `"text" \| "select" \| "radio"` | `"text"` | 내장 입력 종류. `children` 이 있으면 무시된다. |
| value | `string` | `""`(내장 입력) | 내장 입력의 값. |
| onChange | `(value: string) => void` | 없음 | 내장 입력의 변경 콜백. |
| onKeyDown | `(e: React.KeyboardEvent) => void` | 없음 | 텍스트칸 키 핸들러. |
| options | `readonly SearchFieldOption[]` | `[]` | select·radio 선택지(`{ value, label }`). |
| placeholder | `string` | 없음 | 텍스트칸 안내 문구. |
| disabled | `boolean` | `false` | 비활성. |
| children | `React.ReactNode` | 없음 | 커스텀 입력(DatePicker·ComboBox 등). |
| historyKey | `string` | label | 최근 입력값 저장 키. |
| disableHistory | `boolean` | `false` | 최근 입력값 기능을 끈다. |
| className | `string` | `""` | 추가 클래스(예: `span-2`). |

## 표준값: 모든 화면 동일

- select 의 첫 항목은 반드시 `{ value: "", label: "전체" }` 다.
- 기간은 `label="~"` 쌍이다. 두 번째 필드의 label 문구를 바꾸지 않는다.
- 필수·선택 표시는 조회조건에 붙이지 않는다(상세 폼에만 " *").

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `onSearch` 를 빼고 조회 버튼만 둔다 | Enter 조회가 되지 않는다. 항상 `onSearch` 를 준다. |
| 기간을 `SearchField` 하나에 `div`·`span "~"` 로 묶는다 | `label="~"` 두 번째 SearchField 를 쓴다. |
| select 에 "전체" 를 빼거나 `value` 를 `"all"` 로 둔다 | `{ value: "", label: "전체" }` 로 통일한다. |
| `label` 이 같은 텍스트칸 둘에 `historyKey` 를 안 준다 | 최근 입력값이 서로 섞이므로 키를 따로 준다. |
| 필터 키(`edt_title`·`cbo_type`)를 `name` 으로 준다 | 사전에 없는 이름이라 툴팁이 안 뜬다. 업무 키(`"title"`)나 `meta="TITLE"` 로 적는다. |
| `name` 없이 `meta` 만 준다 | `meta` 는 `name` 이 있을 때만 쓴다. `name` 도 함께 준다. |

## 실제 사용 예

- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx:255` SearchArea·텍스트·select·기간. 단, 기간(268줄)이 `label="~"` 쌍이 아니라 `className="span-2"` 안에 인라인 `div`·`span` 으로 묶여 있어 표준과 다르다.
- `src/frontend/m-mcm/page-components/cme/masterCodeMngList/page.tsx:264` `onSearch` 만 지정한 조회조건.
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:434` 복합 입력에 `span-2`.
- `label="~"` 쌍을 쓰는 화면은 아직 사용처 없음.
