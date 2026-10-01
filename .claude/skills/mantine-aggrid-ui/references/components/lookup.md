# LookupModal (LookupTextField · LookupIconButton)

코드(품목·부서 등)를 직접 입력하거나, 돋보기 버튼·F4 로 검색 팝업을 열어 코드·명 한 행을 골라 채울 때 쓴다.

- import: `import { LookupModal, LookupTextField, LookupIconButton, type LookupFetchFn, type LookupRow, type LookupFilter } from "@dk-oasis/shared/lookup";`
- 소스: `src/frontend/shared/src/components/lookup/` (`LookupModal.tsx`, `LookupTextField.tsx`, `LookupIconButton.tsx`, `lookup-shortcuts.ts`)
- 내부 구현: shared `Modal`·`AgDataGrid`·`Pagination`·`Button` + Mantine `TextInput`·`NativeSelect`·`ActionIcon`. `lookup-shortcuts.ts` 의 `shouldOpenLookupPopupFromKey`(F4 판정)는 서브패스 export 에 없고 `LookupTextField` 가 내부에서 쓴다
- Part B 허용 목록(§1)에 `lookup` 서브패스가 없다. 사용 전 확인이 필요한 항목이다(ASK).

## 언제 쓰나

- 쓴다: 값이 `{ code, name }` 한 쌍인 선택(부서·품목·거래처). 입력 칸 + 팝업 검색을 함께 제공할 때.
- 쓰지 않는다: 선택지가 적은 고정 목록 → `Select`·`ComboBox`(form). 여러 열을 가진 행을 고르는 팝업 → [modal](modal.md) 안에 [AgDataGrid](ag-data-grid.md) 를 직접 둔다.

## 표준 사용

```tsx
import { useState } from "react";
import { LookupModal, LookupTextField, type LookupFetchFn, type LookupRow } from "@dk-oasis/shared/lookup";
import { searchDepts } from "./api"; // (keyword: string) => Promise<LookupRow[]>

// BE 가 page/size 를 지원하지 않으면 전체 조회 후 이 안에서 잘라 같은 계약을 맞춘다.
const fetchDepts: LookupFetchFn = async ({ keyword, page, size }) => {
  const all = await searchDepts(keyword);
  return { rows: all.slice(page * size, (page + 1) * size), totalElements: all.length };
};

export function DeptField({ onPick }: { onPick: (row: LookupRow) => void }) {
  const [deptCd, setDeptCd] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <>
      <LookupTextField
        value={deptCd}
        onChange={setDeptCd}
        onOpenPopup={(keyword) => { setDeptCd(keyword); setOpen(true); }}
        placeholder="부서코드"
      />
      <LookupModal
        open={open}
        title="부서 검색"
        placeholder="부서코드 또는 부서명 입력"
        fetchFn={fetchDepts}
        initialKeyword={deptCd}
        searchOnOpen
        onSelect={(row) => { setDeptCd(row.code); onPick(row); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

## 변형

### 조회조건 추가

키워드 외에 고유 필터가 필요하면 `filters` 를 준다. select 는 값을 바꾸면 곧바로 재조회하고, 값은 `fetchFn` 의 `filters` 맵으로 온다. select 옵션 맨 앞은 `{ value: "", label: "전체" }` 로 둔다.

```tsx
const FILTERS: LookupFilter[] = [
  { key: "useYn", label: "사용", options: [{ value: "", label: "전체" }, { value: "Y", label: "사용" }], defaultValue: "Y" },
];
// <LookupModal … filters={FILTERS} fetchFn={({ filters }) => fetchWith(filters.useYn)} />
```

### 아이콘 버튼만 쓰기

입력 칸 없이 팝업만 여는 버튼이 필요하면 `LookupIconButton` 을 쓴다.

```tsx
<LookupIconButton onClick={() => setOpen(true)} ariaLabel="부서 검색" />
```

## Props

LookupModal

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| open | `boolean` | 필수 | 열림 여부 |
| title | `string` | 필수 | 팝업 제목 |
| fetchFn | `LookupFetchFn` | 필수 | `({ keyword, page, size, filters, signal }) => Promise<{ rows: LookupRow[]; totalElements: number }>`. page 는 0부터 |
| onSelect | `(row: LookupRow) => void` | 필수 | 확정 시 호출. 이어서 `onClose` 도 호출된다 |
| onClose | `() => void` | 필수 | 취소·바깥 클릭·ESC·확정 뒤 공통 |
| placeholder | `string` | `"코드 또는 명 입력"` | 검색어 칸 안내 |
| initialKeyword | `string` | `""` | 열릴 때 검색어 칸에 먼저 채울 값 |
| filters | `LookupFilter[]` | - | 고유 조회조건. `LookupFilter`: `key`, `label`, `type?`(`"select" \| "text"`), `options?`, `defaultValue?`, `placeholder?`, `width?`(기본 130) |
| searchOnOpen | `boolean` | `false` | 참이면 열리자마자 첫 페이지를 조회한다 |

`LookupRow` 는 `{ code: string; name: string }` 하나뿐이다. 다른 열이 필요하면 `fetchFn` 안에서 `code`·`name` 으로 매핑한다.

LookupTextField

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string` | 필수 | 입력값(제어형) |
| onChange | `(value: string) => void` | 필수 | 입력 변경 |
| onSearch | `() => void` | - | Enter 입력 시 호출 |
| onOpenPopup | `(initialKeyword: string) => void` | - | 돋보기 버튼·F4. 현재 입력값을 넘긴다. 없으면 버튼이 안 보인다 |
| placeholder | `string` | `""` | 안내 문구 |
| disabled | `boolean` | `false` | 입력과 버튼 모두 비활성 |
| readOnly | `boolean` | `false` | 입력만 막고 팝업 버튼은 유지 |
| id | `string` | 자동 생성 | 라벨 연결용 id |
| buttonAriaLabel | `string` | `"상세 검색"` | 버튼 접근성 라벨 |
| className / style | `string` / `CSSProperties` | - | 루트 클래스·스타일(폭 등 간격 용도) |

LookupIconButton: `onClick`(필수), `disabled`(`false`), `ariaLabel`(`"상세 검색"`), `title`(ariaLabel 을 따름), `size`(아이콘 px, 기본 14, 주지 않는다), `className`, `style`.

## 표준값: 모든 화면 동일

- 코드 입력 + 검색은 `LookupTextField` + `LookupModal`. 선택 확정은 `onSelect` 로 `code`·`name` 을 화면에 채운다.
- 팝업 제목은 "<대상> 검색"(예: "부서 검색"). F4 로도 열린다.
- 팝업 footer 는 취소 → 확인이다(내장). [Modal](modal.md) 표준의 "실행 문구는 동작 그대로"와 달리 "확인"으로 고정돼 있어 문구를 바꿀 수 없다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 조회가 실패했는데 빈 목록만 보인다 | `LookupModal` 은 `fetchFn` 의 오류를 `console.warn` 으로만 남기고 빈 목록을 보인다. 오류를 사용자에게 알려야 하면 `fetchFn` 안에서 `showMessage` 를 부른다 |
| `onSelect` 안에서 팝업을 닫으려고 `setOpen(false)` 를 또 호출한다 | 확정 뒤 `onClose` 가 자동으로 불린다 |
| 열 때마다 이전 검색어가 남기를 기대한다 | 열릴 때 상태가 초기화된다. 값은 `initialKeyword` 로 넘긴다 |
| 기본 조회 버튼을 눌러야 해서 빈 팝업이 먼저 보인다 | 바로 보여야 하면 `searchOnOpen` 을 켠다 |
| `LookupRow` 에 없는 열을 넘긴다 | 코드·명 두 칸만 그린다. 필요한 값은 `onSelect` 뒤 화면이 별도로 조회한다 |
| 배경·여백을 화면 CSS 로 바꾼다 | 이 팝업은 16진수 색·인라인 스타일을 내부에 쓰며 테마 토큰을 따르지 않는다. 바꾸려면 shared 를 고친다(보강 후보) |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:1366-1374`: `LookupModal` + `searchOnOpen` + `placeholder`. `fetchDeptLov` 가 `fetchFn` 계약을 맞춘다.
- `LookupTextField`·`LookupIconButton` 은 `src/frontend/m-design-dummy/src/screens/FormFeedbackCatalogScreen.tsx:176`, `:358` 의 카탈로그 샘플에만 있다. 실제 업무 화면에는 아직 사용처 없음.
