# SearchArea

조회조건 입력칸을 격자로 배치하고 어느 입력에서든 Enter 로 조회가 실행되게 할 때 쓴다. 칸 하나는 SearchField 로 만든다. 사용자별 조회 기본값(`autoSearch`·`defaultKey`·`dependsOn`)도 여기서 켠다.

- import: `import { SearchArea, SearchField } from "@dk-oasis/shared/layout";`
- 소스: `src/frontend/shared/src/layout/SearchArea.tsx`, `src/frontend/shared/src/layout/SearchField.tsx`, 사용자 기본값은 `src/frontend/shared/src/layout/search-defaults/`
- 내부 구현: Mantine `Paper`(SearchArea), `Text`(SearchField 라벨). 입력칸은 shared 의 [Input](input.md)·[Select](select.md)·[Radio](radio.md)·[DatePicker](date-picker.md)
- 함께 그려지는 내부 부품: 조회 영역 오른쪽 위의 설정 아이콘·메뉴·설정 창([search-settings-menu](search-settings-menu.md)). 화면이 직접 쓰지 않는다.

## 언제 쓰나

- 쓴다: 목록 위의 조회조건 영역 전체.
- 쓴다: 텍스트·선택·라디오·날짜 등 조회조건 한 칸(SearchField).
- 쓴다: 새 화면의 목록 조회 조건은 모두 이것으로 만들고 칸마다 `name` 또는 `defaultKey` 를 단다. 패널 안에서 `Input` 과 [조회] 단추를 직접 그리지 않는다(audit `P-S1` 경고).
- 쓰지 않는다: 대화 상자(`role="dialog"`) 안의 조회 칸, 패널 안에서 이미 받은 목록을 화면에서 좁혀 보는 빠른 찾기 칸(서버 조회 조건이 아님, 예: DB 뷰어 표 목록의 테이블명 검색).
- 쓰지 않는다: 상세 폼의 라벨-값 입력 → [detail-form](detail-form.md).

## 표준 사용

```tsx
import { SearchArea, SearchField } from "@dk-oasis/shared/layout";

const set = (k: keyof Filters, v: string) => setF((p) => ({ ...p, [k]: v }));

<SearchArea onSearch={() => void handleSearch()} autoSearch>
  <SearchField label="품번" name="itemCd" value={f.itemCd} onChange={(v) => set("itemCd", v)} />
  <SearchField
    label="검사유형"
    name="inspType"
    type="select"
    value={f.inspType}
    onChange={(v) => set("inspType", v)}
    options={[{ value: "", label: "전체" }, { value: "IN", label: "수입검사" }]}
  />
  <SearchField label="검사일자" defaultKey="fromDt" type="date" value={f.fromDt} onChange={(v) => set("fromDt", v)} />
  <SearchField label="~" type="date" value={f.toDt} onChange={(v) => set("toDt", v)} />
</SearchArea>
```

- `onSearch` 는 생략하지 않는다. 지정하면 내부가 `form` 이 되어 Enter 가 조회로 이어진다.
- 진입할 때 한 번 조회하는 화면은 마운트 effect 대신 `autoSearch` 를 단다(아래 「사용자 기본값」).
- 조회 칸의 `onChange` 는 지난 상태를 복사하지 않고 함수형 갱신(`setF((p) => ({ ...p, [k]: v }))`)으로 쓴다. 기본값이 여러 칸에 한꺼번에 들어올 때 앞 칸 값이 사라지지 않게 하려는 규칙이다.
- 날짜 칸은 `DatePicker` 를 직접 그리지 않고 `type="date"` 로 쓴다. 기간은 `type="date"` 두 칸을 `label="~"` 짝으로 둔다.
- 칸마다 `name`(MDM 컬럼 사전 키) 또는 `defaultKey` 가 있어야 사용자 기본값 대상이 된다. 기간의 두 번째 칸은 키가 없어도 `{첫 칸 키}~to` 로 정해진다.

## 변형

### 기간(From~To)

`type="date"` SearchField 두 개로 쓰고 두 번째 label 을 정확히 `"~"` 로 둔다. SearchArea 가 직전 필드와 한 칸(span 2)으로 묶고, 사용자 기본값에서도 한 쌍(기간 한 줄)으로 다룬다. 인라인 `div`·`span` 으로 묶지 않는다. 코드 기본값은 시작이 오늘 7일 전, 종료가 오늘이며 문자열은 `yyyy-MM-dd` 다: `formatDateStr(addDays(today(), -7))`·`formatDateStr(today())`(`@dk-oasis/shared/utils`). `today()`·`addDays()` 는 `yyyyMMdd` 를 돌려주므로 `formatDateStr` 를 꼭 거친다. `formatDate` 는 UTC 계산이라 하루가 밀릴 수 있어 쓰지 않는다.

```tsx
<SearchField label="조회 기간" defaultKey="fromDt" type="date" value={f.fromDt} onChange={(v) => set("fromDt", v)} />
<SearchField label="~" type="date" value={f.toDt} onChange={(v) => set("toDt", v)} />
```

이미 `DatePicker` 를 children 으로 그리는 화면은 그리기를 바꾸지 않고 SearchField 에도 `type="date"`·`value`·`onChange` 를 함께 주면 대상이 된다(아래 「대상 칸 판정」).

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

`name` 을 주면 라벨 영역 전체(`.search-field__label`, 글자 밖 포함)에 마우스를 올릴 때 MDM 컬럼 사전 카드 툴팁이 뜬다([mdm-meta](mdm-meta.md) 의 `MdmFieldLabel` 과 같은 규칙: `name` → 물리명, `meta` 문자열이 `name` 보다 우선, `meta={false}` 면 끔). `name` 이 없으면 사전을 찾지 않고 포털 탭 안에서는 라벨 글자 툴팁만 뜬다(공급자 밖은 예전과 DOM 이 같다). 사전에 없는 `name`·`meta={false}` 는 라벨 + 흐린 글자 `name` 툴팁이다. 필터 키(`edt_`·`cbo_`)에서 이름을 추론하지 않으므로 업무 키를 직접 적는다. 라벨 글자는 기본(explicit)에서 `label` 그대로이고 Radio `name`·최근 입력값 키도 `label` 을 쓴다.

```tsx
<SearchField label="제목" name="title" value={f.title} onChange={(v) => set("title", v)} />
<SearchField label="코드" name="code" meta="MASTER_CD" value={f.code} onChange={(v) => set("code", v)} />
```

`name` 은 사용자 기본값의 저장 키도 겸한다. 툴팁 동작을 바꾸지 않고 기본값 키만 달려면 `name` 대신 `defaultKey` 를 쓴다(`defaultKey` 는 툴팁에 영향이 없다).

## 사용자 기본값

사용자는 조회 영역 오른쪽 위의 설정 아이콘 「조회 기본값」에서 칸마다 기본값 규칙을 정한다. 규칙은 고정 값, 상대 날짜(날짜 칸만), 마지막 조회값 세 가지이고, 「사용 안 함」은 규칙이 없는 상태다. 규칙은 서버에 사용자·화면(`pageId`)·칸 키 단위로 저장되고 브라우저에도 사본이 남는다. 화면을 열면 SearchArea 가 규칙으로 계산한 값을 칸에 넣는다. 설정 아이콘·메뉴·설정 창의 동작은 [search-settings-menu](search-settings-menu.md) 에 있다.

**화면은 선언만 한다.** 기본값을 읽거나 칸에 넣고 비우는 코드를 화면에 두지 않는다. 화면이 하는 일은 칸 묶기(`value`·`onChange`·`defaultKey`), 자동 조회(`autoSearch`), 의존 칸(`dependsOn`), 끄기(`defaults`·`defaultable`) 선언뿐이다.

### 대상 칸 판정

| 조건 | 대상 여부 |
|---|---|
| 내장 입력(`type` 이 text·select·radio·date)이고 칸 키가 있음 | 대상 |
| children 칸이고 SearchField 에 `value`·`onChange` 를 함께 줬고 칸 키가 있음 | 대상(그리기는 children 이 그대로 맡는다) |
| children 칸이고 SearchField 에 `value`·`onChange` 가 없음 | 대상 아님(`IdPicker`·`Checkbox`·읽기 전용 칸 등, 지금 동작 그대로) |
| 칸 키가 없음 | 대상 아님 |
| `defaultable={false}` | 대상 아님(설정 창에도 나오지 않는다) |

칸 키는 `defaultKey ?? name` 이다. `label` 은 키로 쓰지 않는다(문구가 바뀌면 저장값이 끊기고, `~` 처럼 한 화면에서 겹친다).

- 기간의 두 번째 칸(`label="~"`)은 자기 키가 없으면 `{첫 칸 키}~to` 를 쓴다.
- 한 SearchArea 안에서 같은 키가 두 번 등록되면 개발 모드에서 경고하고 나중 칸을 대상에서 뺀다.
- 한 화면에 SearchArea 가 둘 이상이면(탭마다 조회 영역이 있는 화면) 두 번째부터 `defaultsScope="이름"` 을 준다. 저장 키가 `{defaultsScope}.{칸 키}` 가 되어 같은 `name` 을 써도 섞이지 않는다.
- 저장 키의 화면 값은 `pageId` 다. 포털 밖(`pageId` 없음)과 대화 상자(`role="dialog"`) 안의 SearchArea 는 기본값 기능이 전체 꺼진다(설정 아이콘도, 값 넣기도 없다).

### 넣는 시점

- 화면을 마운트할 때 한 번 넣는다. 탭 전환은 마운트가 아니므로 사용자가 바꾼 조건이 그대로 유지된다. 브라우저를 새로 고치면 다시 마운트되어 기본값이 다시 들어간다.
- 우선순위는 분리 창이 이어받은 값(carry) > handoff 등 화면의 명시 동작 > 사용자 기본값 > 코드 기본값이다. 분리 창이 이어받은 값으로 시작하면 넣지 않는다.
- 서버에서 받은 규칙의 사본이 이 PC 에 없으면 저장소 응답을 최대 1.5초 기다린다. 넘으면 넣지 않고 끝낸다. 기다리는 동안 사용자가 고친 칸은 덮지 않는다.
- handoff 로 조건을 정하는 화면은 handoff 가 활성인 동안 `<SearchArea defaults={!handoffActive}>` 로 넣기를 막는다.
- 상단 초기화 버튼(`id: "btn_reset"`, 또는 `resetsSearch`)을 누르면 코드 기본값 위에 사용자 기본값이 다시 들어간다. 「마지막 조회값」 규칙인 칸은 코드 기본값으로 둔다. 버튼 `onClick` 은 조회 조건을 동기로 비워야 하고, 비동기로 비우는 화면은 `resetsSearch: false` 로 두고 직접 `emitSearchReset(pageId)` 를 부른다.
- 「마지막 조회값」은 사용자가 조회 버튼이나 Enter 로 실제 조회한 순간의 값이다. `autoSearch` 의 자동 조회는 기록하지 않는다. 저장소는 이 PC 의 localStorage 다.

### 자동 조회: autoSearch

마운트 effect 에서 조회하면 기본값이 들어가기 전의 조건으로 조회해서, 칸에는 기본값이 보이는데 목록은 코드 기본값으로 조회된 상태가 된다. 진입 때 한 번 조회하는 화면은 마운트 effect 를 지우고 `autoSearch` 를 단다.

```tsx
<SearchArea onSearch={handleSearch} autoSearch>
```

- 기본값을 다 넣은 다음 커밋에서 `onSearch` 를 한 번 부른다. 그 커밋의 `onSearch` 가 새 조건을 잡고 있다.
- 분리 창이 이어받은 값으로 시작했으면 부르지 않는다. 이어받기를 쓰는 화면은 `useCarryRefetch` 대신 「복원됐는데 행이 비었을 때만 조회하는 마운트 effect」(`if (restored && rows.length === 0) void handleSearch()`)를 둔다([use-carry-state.md](use-carry-state.md) 규칙 5).
- 서버에서 받는 선택지에 아직 없는 고정 값이 있으면 조회를 최대 1.5초 미룬다. 그 안에 값을 넣으면 넣은 값으로, 넘으면 지금 값으로 조회한다.
- 자동 조회는 최근 입력값·마지막 조회값에 남기지 않는다.
- 기본값을 기다리는 동안 사용자가 먼저 조회(Enter·조회 버튼)했고 그 뒤 넣은 값이 없으면 뒤늦은 자동 조회는 건너뛴다. 자동 조회가 부르는 `onSearch` 에는 `"auto"` 가 넘어오므로(사용자 조회는 인자 없음), 진입 조회와 사용자 조회를 가르는 화면은 이 인자로 판단한다.

### 칸 키: defaultKey·defaultable

- `defaultKey`: 기본값 저장 키. 없으면 `name` 을 쓴다. `name` 이 없는 칸을 대상으로 만들 때 쓰고, `name` 과 달리 MDM 툴팁 동작에 영향이 없다.
- `defaultable={false}`: 이 칸은 대상이 아니다. 설정 창에도 나오지 않는다.
- `defaults={false}`(SearchArea): 이 조회 영역은 기본값을 넣지 않고 설정 아이콘도 그리지 않는다.

### 의존 칸: dependsOn

어떤 칸이 바뀌면 다른 칸을 비우고 기본값으로 다시 채워야 하는 화면은 의존 칸을 선언한다. 기준 칸이 바뀌어도 화면이 조건을 직접 비우지 않는다.

```tsx
<SearchField label="마루 데이터" defaultKey="maruDataId" value={f.maruDataId} onChange={setMaruData}>…</SearchField>
<SearchField label="키" defaultKey="code" dependsOn="maruDataId" value={f.code} onChange={(v) => setF((p) => ({ ...p, code: v }))}>…</SearchField>
```

- `dependsOn` 값은 같은 SearchArea 에 있는 기준 칸의 키(`defaultKey ?? name`)다. 두 칸 모두 `value`·`onChange` 를 준 대상 칸이어야 한다.
- 기준 칸 값이 바뀐 커밋 뒤에 SearchArea 가 의존 칸을 처음 등록 때 값(코드 기본값)으로 비우고, 그 칸의 규칙(설정 값·마지막 조회값)으로 다시 채운다. 새 선택지에 없는 값은 넣지 않는다. 같은 커밋에서 화면이 직접 바꾼 의존 칸은 그대로 둔다.
- 선택지가 기준 칸을 따라 바뀌는 칸(서버에서 받는 선택지)은 기준 칸이 바뀐 뒤 10초 안에 선택지 내용이 바뀌면 새 선택지로 다시 판정한다. 사용자가 그 칸을 고치면 그만둔다.
- `defaults={false}` 인 영역이나 대화 상자 안에서도 비우기는 한다.

### 설정 창의 일괄 옵션

설정 창 머리에는 「이 화면 모든 칸: [사용 안 함] [마지막 조회값]」 일괄 옵션이 있다. 누르면 모든 줄의 방식을 그것으로 채우는 입력 편의일 뿐이고, 저장 모양(칸별 규칙)은 같다. 고정 값과 상대 날짜는 칸마다 직접 고른다. 화면이 따로 할 일은 없다.

## Props

SearchAreaProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| children | `React.ReactNode` | 필수 | SearchField 들. |
| onSearch | `() => void` | 없음 | Enter 조회 핸들러. 지정하면 form 으로 렌더되고 최근 검색값 저장 이벤트도 낸다. |
| autoSearch | `boolean` | `false` | 사용자 기본값을 넣은 다음 커밋에서 `onSearch` 를 한 번 부른다. 진입 때 자동 조회는 마운트 effect 대신 이것으로 한다. 분리 창이 이어받은 값으로 시작하면 부르지 않는다. |
| defaults | `boolean` | `true` | `false` 면 이 조회 영역은 사용자 기본값을 넣지 않고 설정 아이콘도 없다. |
| defaultsScope | `string` | 없음 | 한 화면에 SearchArea 가 둘 이상일 때 두 번째부터 준다. 저장 키가 `{defaultsScope}.{칸 키}` 가 된다. |

SearchFieldProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| label | `string` | 필수 | 라벨. `"~"` 이면 직전 필드와 묶인다. |
| name | `string` | 없음 | MDM 컬럼 사전 키(업무 키, 예 `"title"`). 있고 사전에 있으면 라벨에 MDM 카드 툴팁이 뜬다. |
| meta | `string \| false` | 없음 | 명시 물리명(`name` 보다 우선). `false` 면 MDM 연결을 끈다. `name` 이 있을 때만 쓴다. |
| type | `"text" \| "select" \| "radio" \| "date"` | `"text"` | 내장 입력 종류. `"date"` 는 shared DatePicker(`yyyy-MM-dd`)를 그린다. `children` 이 있으면 그리기는 children 이 맡고 `type` 은 기본값의 값 종류(상대 날짜 가능 여부 등)로만 쓰인다. |
| value | `string` | `""`(내장 입력) | 내장 입력의 값. children 칸이 `onChange` 와 함께 주면 사용자 기본값 대상이 된다. |
| onChange | `(value: string) => void` | 없음 | 내장 입력의 변경 콜백. 함수형 갱신으로 쓴다. |
| onKeyDown | `(e: React.KeyboardEvent) => void` | 없음 | 텍스트칸 키 핸들러. |
| options | `readonly SearchFieldOption[]` | `[]` | select·radio 선택지(`{ value, label }`). |
| placeholder | `string` | 없음 | 텍스트칸 안내 문구. |
| disabled | `boolean` | `false` | 비활성. |
| children | `React.ReactNode` | 없음 | 커스텀 입력(DatePicker·ComboBox 등). |
| historyKey | `string` | label | 최근 입력값 저장 키. |
| disableHistory | `boolean` | `false` | 최근 입력값 기능을 끈다. |
| className | `string` | `""` | 추가 클래스(예: `span-2`). |
| defaultKey | `string` | `name` | 사용자 기본값 저장 키. `name` 이 없는 칸을 대상으로 만들 때 쓴다. `label` 은 키로 쓰지 않는다. |
| defaultable | `boolean` | `true` | `false` 면 이 칸은 사용자 기본값 대상이 아니다. |
| dependsOn | `string` | 없음 | 기준 칸 키. 기준 칸이 바뀌면 이 칸을 코드 기본값으로 비우고 사용자 기본값으로 다시 채운다. |

## 표준값: 모든 화면 동일

- select 의 첫 항목은 반드시 `{ value: "", label: "전체" }` 다.
- 기간은 `type="date"` 두 칸의 `label="~"` 쌍이다. 두 번째 필드의 label 문구를 바꾸지 않는다.
- 진입 때 자동 조회는 `autoSearch` 로 하고 마운트 조회 effect 를 두지 않는다.
- 사용자 기본값을 처리하는 코드는 화면에 두지 않는다. 선언(`defaultKey`·`autoSearch`·`dependsOn` 등)으로만 끝낸다.
- 조건을 비우는 칸은 `dependsOn` 으로 선언한다. 기준 칸이 바뀐다고 화면이 직접 비우지 않는다.
- 필수·선택 표시는 조회조건에 붙이지 않는다(상세 폼에만 " *").

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `Input`·`DateTimePicker` 와 [조회] 단추로 자체 조회 폼을 그린다 | 기본값 기능이 빠진다. 화면 위쪽 `SearchArea`·`SearchField` 로 옮기고 [조회] 는 상단 버튼 줄(`btn_search`)에 둔다. 칸 키를 달지 않는 건 의도된 제외(`defaultable={false}`·팝업이 채우는 읽기 전용 칸·동적 칸)만 허용한다. |
| `onSearch` 를 빼고 조회 버튼만 둔다 | Enter 조회가 되지 않는다. 항상 `onSearch` 를 준다. |
| 기간을 `SearchField` 하나에 `div`·`span "~"` 로 묶는다 | `label="~"` 두 번째 SearchField 를 쓴다. |
| select 에 "전체" 를 빼거나 `value` 를 `"all"` 로 둔다 | `{ value: "", label: "전체" }` 로 통일한다. |
| `label` 이 같은 텍스트칸 둘에 `historyKey` 를 안 준다 | 최근 입력값이 서로 섞이므로 키를 따로 준다. |
| 필터 키(`edt_title`·`cbo_type`)를 `name` 으로 준다 | 사전에 없는 이름이라 툴팁이 안 뜬다. 업무 키(`"title"`)나 `meta="TITLE"` 로 적는다. |
| `name` 없이 `meta` 만 준다 | `meta` 는 `name` 이 있을 때만 쓴다. `name` 도 함께 준다. |
| 마운트 effect(`useEffect(() => { void handleSearch(); }, [])`)로 자동 조회한다 | 사용자 기본값이 빠진 조건으로 조회한다. effect 를 지우고 `<SearchArea autoSearch>` 를 쓴다. |
| children 칸(`Input`·`Select`·`DatePicker`)에 `value`·`onChange` 를 SearchField 에 주지 않는다 | 기본값 대상에서 빠진다. SearchField 에도 같은 `value`·`onChange`(필요하면 `type`·`options`)를 준다. 그리기는 children 이 그대로 맡는다. |
| `name` 없는 칸에 `label` 만 있으면 기본값이 된다고 기대한다 | `label` 은 키가 아니다. `name` 이나 `defaultKey` 를 달아야 대상이 된다. |
| 조회 칸 `onChange` 를 `setFilters({ ...filters, k: v })` 로 쓴다 | 기본값이 여러 칸에 한꺼번에 들어올 때 앞 칸 값이 사라진다. `setFilters((p) => ({ ...p, k: v }))` 함수형 갱신으로 쓴다. 개발 모드에서 경고가 난다. |
| 기준 칸이 바뀔 때 화면이 다른 조건 칸을 직접 비운다 | 기본값과 순서가 엇갈린다. 의존 칸에 `dependsOn="기준 칸 키"` 를 선언한다. |
| 한 화면의 두 번째 SearchArea 에 `defaultsScope` 를 주지 않는다 | 같은 `name` 의 저장 키가 겹친다. 두 번째부터 `defaultsScope` 를 준다. |
| `DatePicker` 를 children 으로 그리면서 `type="date"` 를 빼먹는다 | 날짜 칸이 상대 날짜 규칙을 쓸 수 없다. `type="date"` 를 함께 준다(새 화면은 children 없이 `type="date"` 만 쓴다). |

## 알려진 한계

- 기간의 시작 > 끝 검사는 「오늘」 하나로만 한다. 예를 들어 「당월 1일 ~ 전일」은 매월 1일에만 뒤집혀 그날은 기본값을 넣지 않는다.
- 이 PC 에 규칙 사본이 없는 첫 진입에서 저장소 응답이 화면의 첫 조회보다 늦으면, 첫 조회는 코드 기본값으로 하고 의존 칸만 뒤늦게 채워질 수 있다.
- 기준 칸을 따라 바뀌는 선택지 칸은 새 선택지가 올 때까지(화면의 선택지 요청이 끝나기 전) 옛 선택지로 판정한 값이 잠깐 보인다. 그 사이 조회하거나 선택지 요청이 실패하면 그 값으로 조회된다.
- 선택지를 받은 뒤 바로 조회하는 화면은 선택지를 `flushSync` 로 커밋한 뒤 조회 조건을 읽어야 한다. 다시 채운 값이 커밋돼야 조회가 그 값을 본다(`dataItemMng` 의 `selectMaruData` 가 예다). 기본값 처리 코드가 아니라 커밋 순서를 보장하는 일이다.

## 실제 사용 예

- `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx` `autoSearch` 로 진입 조회. 마운트 조회 effect 는 분리 창이 행 없이 복원됐을 때만 조회한다.
- `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx` `label="~"` 짝. 첫 칸에 `defaultKey="fromDt"` 와 `type="date"`, children 은 `DatePicker` 그대로.
- `src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx` `dependsOn="maruDataId"`. 키·이름·카테고리·닫힌 항목이 마루 데이터 칸을 따라 비워지고 다시 채워진다. 카테고리 선택지를 `flushSync` 로 커밋한 뒤 조회한다.
- `src/frontend/m-mcm/page-components/csa/searchDefaultsSample/page.tsx` 칸 형식 전부(텍스트·select·radio·날짜·기간·children 묶기·`defaultKey`·`defaultable={false}`·대상 아님), `autoSearch`, `defaultsScope`, `defaults={false}` 를 한 화면에 모은 확인용 샘플(로컬 메뉴 「조회 기본값 샘플」).
- `src/frontend/m-mcm/page-components/cme/masterCodeMngList/page.tsx:287` `onSearch` 만 지정한 조회조건(자동 조회 없음).
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx` 복합 입력에 `span-2`. 마루 코드·버전·닫힌 코드 모두 `defaultKey` 대상이고, handoff 로 열면 `defaults={!handedOff}` 로 기본값이 넘겨 받은 코드를 덮지 않게 한다.
- `src/frontend/m-mdm/pages/dmc/codeConfirm/page.tsx` 상단 `SearchArea`(`autoSearch`) + 상단 버튼 줄 [조회]. 분리 창 복원 때는 행이 비었을 때만 이어받은 검색어로 조회하는 마운트 effect 를 둔다.
