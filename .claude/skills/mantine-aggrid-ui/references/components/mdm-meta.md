# MDM 화면 메타 (MdmMetaProvider · useMdmColumn · MdmMetaCard)

그리드 머리글·폼 라벨의 캡션과 툴팁을 MDM 컬럼 사전에서 가져올 때 쓴다. 포털 탭이 공급자를 자동으로 씌우므로 화면은 보통 아무것도 하지 않는다.

- import: `import { MdmMetaProvider, useMdmColumn, useMdmColumns, MdmMetaCard, resolveCaption, toPhysName } from "@dk-oasis/shared/mdm-meta";` (CSS import 없음)
- 소스: `src/frontend/shared/src/mdm-meta/`(`context.tsx`·`store.ts`·`caption.ts`·`names.ts`·`MdmMetaCard.tsx`)
- 설계: `docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md` §2 B1~B8, §4
- 받는 곳: 업무 BE `POST /api/{module}/mdmMeta/columns`(본문 `{"names":[…]}`)·`/domains`(본문 `{"domainIds":[…]}`). 한 화면에서 등록한 이름을 16ms 동안 모아 모듈마다 한 번 부르고, 받은 것은 5분 둔다. 404·401·403·연결 실패면 그 모듈은 세션 동안 메타 없이 두고 다시 부르지 않는다(401 에도 로그인 화면으로 보내지 않는다).

## 언제 쓰나

- 쓴다: 그리드 `header`·폼 `label` 을 표준 용어(MDM)로 맞추고 싶을 때 — 그냥 비운다. 화면이 직접 메타를 읽어 표시할 때 `useMdmColumn`. 화면 고유 위치에 MDM 정보 카드를 띄울 때 `MdmMetaCard`.
- 쓰지 않는다: 화면 값 검증(필수·길이 등)에 이 훅을 직접 쓰지 않는다 — 검증은 `useMdmValidation`(같은 서브패스, C 단계)과 그리드 `mdmValidate` 가 맡는다.
- [ag-data-grid](ag-data-grid.md)·[form-group](form-group.md) 은 이 공급자를 스스로 읽는다. 머리글·라벨에는 이 문서의 훅을 따로 쓰지 않는다.

## 표준 사용

포털 탭 안의 화면은 `header`·`label` 을 생략하는 것만으로 MDM 캡션·툴팁이 붙는다.

```tsx
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

const COLUMNS: GridColumn[] = [
  { key: "TITLE", width: 300 },      // 머리글 = MDM labelShort, 툴팁 = MdmMetaCard
  { key: "regDt", header: "등록일" }, // 적은 header 가 이긴다(기본 explicit)
];
```

화면 전체를 MDM 캡션으로 통일하려면 한 줄로 우선순위를 바꾼다.

```tsx
import { MdmMetaProvider } from "@dk-oasis/shared/mdm-meta";

<MdmMetaProvider captionPriority="mdm">
  <AgDataGrid columns={COLUMNS} data={rows} rowKey="NOTICE_ID" />
</MdmMetaProvider>
```

## 변형

### 메타를 직접 읽기

```tsx
const { column, domain, loading } = useMdmColumn("noticeTitle"); // 물리명 NOTICE_TITLE 로 찾는다
const info = useMdmColumns([{ name: "title" }, { name: "etc", meta: false }]); // 키 = name, POST 한 번
```

공급자 밖이거나 `meta: false` 면 `{ column: null, domain: null, loading: false }` 이고 아무것도 부르지 않는다.

### 캡션만 계산

`resolveCaption(column, "grid" | "form", 적은값, "explicit" | "mdm", 화면키)` — 그리드는 `labelShort` → `labelMid` → `labelLong` → `columnName`, 폼은 `labelMid` → `labelLong` → `labelShort` → `columnName`.

## Props

### MdmMetaProvider

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| module | `string` | 바깥 공급자 → 탭 pageId 의 `:` 앞부분 | 메타를 받을 업무 모듈 |
| captionPriority | `"explicit" \| "mdm"` | 바깥 공급자 → `"explicit"` | `mdm` 이면 MDM 캡션이 화면이 적은 캡션을 이긴다 |
| disabled | `boolean` | 바깥 공급자 → `false` | 이 아래에서 메타를 받지 않는다 |
| children | `ReactNode` | 필수 | |

### MdmMetaCard

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| column | `MdmScreenColumn` | 필수 | 컬럼 메타 |
| domain | `MdmDomainMeta \| null` | 없음 | 도메인 메타(단위·도메인 표준식) |

순서: 제목(`labelLong`)+물리명 → 설명·사용 메모 → 형식(`STRING(20)`·`NUMBER(3,1)`)·필수·기본값 → 도메인(ID·종류)·단위 → 표준식 → 허용 코드 앞 10개("외 N개") → 서버 업무 규칙 안내. 글자색·배경은 감싸는 툴팁을 따른다.

## 표준값: 모든 화면 동일

- 화면은 공급자를 직접 두지 않는다(포털 탭이 둔다). 우선순위를 바꿀 때만 `MdmMetaProvider captionPriority="mdm"` 를 둔다.
- 연결 키는 그리드 `key`·폼 `name` 을 물리명으로 바꾼 값이다. 맞지 않으면 `meta="물리명"`, 엉뚱하게 맞으면 `meta={false}`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| MDM 캡션을 쓰려고 `header: ""`·`label=""` 를 준다 | 생략한다. `""` 는 일부러 비운 캡션으로 그대로 남는다 |
| 엑셀 내보내기에서 `c.header` 를 읽어 빈 머리글이 나온다 | `useResolvedGridColumns(COLUMNS)` 결과를 쓴다 |
| 화면에서 `fetch("/api/mls/mdmMeta/columns")` 를 직접 부른다 | `useMdmColumn(s)`·`requestColumns` — 묶음 요청·보관·401 처리가 들어 있다 |
| 다른 모듈 화면의 부품을 띄웠는데 탭 모듈(pageId)로 메타를 찾는다 | 그 부분만 `MdmMetaProvider module="mqc"` 로 감싼다 |

## 실제 사용 예

- `src/frontend/shared/src/portal-shell/portal-shell.tsx` `TabPageSlot`: 탭 본문을 `MdmMetaProvider` 로 감싼다.
- 화면 파일럿: m-mls `lsh/noticeMgmt`(T6 에서 적용).
