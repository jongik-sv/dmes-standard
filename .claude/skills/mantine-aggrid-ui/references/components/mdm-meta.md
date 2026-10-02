# MDM 화면 메타 (MdmMetaProvider · useMdmColumn · MdmMetaCard · MdmFieldLabel · useMdmValidation)

그리드 머리글·폼 라벨·상세 표(th) 라벨의 캡션과 툴팁을 MDM 컬럼 사전에서 가져오고, 입력값을 MDM 정의(필수·형식·길이·허용 코드·표준식)로 즉시 검사할 때 쓴다. 포털 탭이 공급자를 자동으로 씌우므로 캡션·툴팁은 화면이 아무것도 하지 않아도 붙는다. 값 검사는 화면이 켠다.

- import: `import { MdmMetaProvider, useMdmColumn, useMdmColumns, MdmMetaCard, MdmFieldLabel, resolveCaption, toPhysName, useMdmValidation, validateMdmValue, codePointLength } from "@dk-oasis/shared/mdm-meta";` (CSS import 없음. 툴팁 모양은 호스트가 싣는 `@dk-oasis/shared/form.css` 의 `.form-tip-text` 를 쓴다)
- 서버 오류 → 칸 오류: `import { toFieldErrors } from "@dk-oasis/shared/http";`
- 소스: `src/frontend/shared/src/mdm-meta/`(`context.tsx`·`store.ts`·`caption.ts`·`names.ts`·`MdmMetaCard.tsx`·`MdmFieldLabel.tsx`·`validate.ts`), `src/frontend/shared/src/components/form/useHoverTip.tsx`(FormGroup 과 MdmFieldLabel 이 함께 쓰는 내부 포털 툴팁 — 화면은 직접 쓰지 않는다), `src/frontend/shared/src/http/index.ts`(`toFieldErrors`)
- 설계: `docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md` §2 B1~B8·C1·C2·C5·C9, §4, §5
- 받는 곳: 업무 BE `POST /api/{module}/mdmMeta/columns`(본문 `{"names":[…]}`)·`/domains`(본문 `{"domainIds":[…]}`). 한 화면에서 등록한 이름을 16ms 동안 모아 모듈마다 한 번 부르고, 받은 것은 5분 둔다. 404·401·403·연결 실패면 그 모듈은 세션 동안 메타 없이 두고 다시 부르지 않는다(401 에도 로그인 화면으로 보내지 않는다).

## 언제 쓰나

- 쓴다: 그리드 `header`·폼 `label` 을 표준 용어(MDM)로 맞추고 싶을 때 — 새 화면은 그냥 비운다. 기존 화면을 표준 캡션으로 바꿀 때는 header 를 지우지 말고 `captionPriority="mdm"` 을 쓴다(대체 캡션 유지). 화면이 직접 메타를 읽어 표시할 때 `useMdmColumn`. 화면 고유 위치에 MDM 정보 카드를 띄울 때 `MdmMetaCard`. **상세 표(th/td)의 라벨은 `MdmFieldLabel`** — 캡션과 hover·focus 툴팁이 함께 붙는다.
- 쓴다(값 검사): 폼은 `useMdmValidation()` 결과를 `FormGroup error` 로, 그리드는 `mdmValidate`, 저장 전 전체 검사는 `validateRows`, 저장 실패는 `toFieldErrors` → 그리드 `fieldErrors`·폼 `error`.
- 쓰지 않는다: 값 검사에 `useMdmColumn` 으로 메타를 읽어 길이·필수를 손으로 비교하지 않는다 — `useMdmValidation` 이나 `validateMdmValue(column, value)`(같은 판정)가 서버와 같은 판정·문구를 낸다. 비즈니스식(업무 규칙)은 화면에서 검사하지 않는다(서버 `MdmValidator` 몫).
- [ag-data-grid](ag-data-grid.md)·[form-group](form-group.md) 은 이 공급자를 스스로 읽는다. 머리글·라벨에는 이 문서의 훅을 따로 쓰지 않는다. `FormGroup` 을 쓰지 않는 상세 표(th/td) 라벨만 `MdmFieldLabel` 로 잇는다.

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

기존 화면을 표준 캡션으로 바꿀 때는 header 를 지우지 말고 `captionPriority="mdm"` 을 쓴다(대체 캡션 유지) — `module` 은 지정하지 않는다(바깥 포털 공급자를 따른다). MDM 이 있으면 표준 캡션, 없거나 받지 못하면 적어 둔 header 가 보인다. 사전에 없는 파생 열은 `meta: false` 로 연결을 끈다.

## 변형

### 메타를 직접 읽기

```tsx
const { column, domain, loading } = useMdmColumn("noticeTitle"); // 물리명 NOTICE_TITLE 로 찾는다
const info = useMdmColumns([{ name: "title" }, { name: "etc", meta: false }]); // 키 = name, POST 한 번
```

공급자 밖이거나 `meta: false` 면 `{ column: null, domain: null, loading: false }` 이고 아무것도 부르지 않는다.

### 캡션만 계산

`resolveCaption(column, "grid" | "form", 적은값, "explicit" | "mdm", 화면키)` — 그리드는 `labelShort` → `labelMid` → `labelLong` → `columnName`, 폼은 `labelMid` → `labelLong` → `labelShort` → `columnName`.

### 상세 표(th/td)에서 — MdmFieldLabel 과 훅

새 화면의 상세 폼은 `DETAIL_*` 표라 `FormGroup name` 이 없다([detail-form](detail-form.md)). 라벨은 `MdmFieldLabel` 을 th 안에 넣고, 값 검사는 훅으로 직접 잇는다.

```tsx
const { column } = useMdmColumn("TITLE");   // 값 검사용 — 메타 요청은 이 한 번(마운트·이름이 바뀔 때). MdmFieldLabel 도 같은 칸을 묶어 요청한다
const issue = column ? validateMdmValue(column, v) : null;   // 같은 column 으로 바로 판정(렌더마다 불러도 요청 없음)

<tr>
  <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="TITLE" label="제목" required /></th>
  <td style={DETAIL_VALUE_CELL}>
    <Input value={v} error={serverError ?? issue?.message} onChange={onChange} />
  </td>
</tr>
```

- `MdmFieldLabel` 은 `label`(적은 캡션)과 MDM 캡션 중 우선순위로 글자를 고르고(`FormGroup label` 과 같다: 기본 적은 값이 이기고, 화면이 `captionPriority="mdm"` 이면 MDM 이 이긴다), 사전에 있으면 라벨에 마우스를 올리거나 포커스가 들어올 때 `MdmMetaCard` 를 `FormGroup` 과 같은 포털 툴팁으로 띄운다.
- 사전에 없거나·못 받았거나·공급자(포털 탭) 밖이면 `label ?? name` 글자 그대로이고 툴팁은 없다. DOM 도 단순 텍스트와 같다(`th` 안이 글자뿐).
- 입력의 `aria-label` 도 보이는 라벨과 같아야 하면 `resolveCaption(column, "form", "제목", useMdmCaptionPriority(), "TITLE")` 로 같은 글자를 구한다.
- 서버 오류(`toFieldErrors(e, grid)` 결과)는 칸별 상태에 담아 `error` 로 준다. 그 칸을 고치거나 다른 행을 열면 지운다.
- 저장 전 `validateRow(row, names)` 로 막을 칸은 서버 `MdmValidator.columns(...)` 와 같게 둔다.
- 훅은 공급자(포털 탭) 밖이면 아무것도 부르지 않고 늘 통과다 — 포털 밖 단독 실행에서도 같은 코드가 돈다.
- 빈 칸은 입력 중에는 검사하지 않는다(필수는 저장 때). 예: `m-mls/pages/lsh/noticeMgmt/NoticeTitleRow.tsx`.
- 라벨 글자가 툴팁 트리거라 키보드 Tab 이 라벨에도 멈춘다(`tabIndex` 0). 사전에 있는 칸에만 생긴다.

### 화면 값 검증(C, 2026-10-03)

판정과 문구는 서버 저장 검증(cactus-core `MdmValidator`)과 같다. 순서: 빈 값(공백만 포함) → 필수 → 타입 → 길이·소수 자리 → 허용 코드 → 도메인 표준식, 첫 실패에서 멈춘다.

| 코드 | 판정 | 문구(캡션 = 폼 캡션 `labelMid` → `labelLong` → `labelShort` → `columnName` → 물리명) |
|---|---|---|
| `REQUIRED` | `required` 인데 빈 값 | `{캡션}은(는) 필수입니다` |
| `TYPE` | NUMBER: 숫자·평문 십진 문자열(`1,000`·`1e3` 거부), DATE: `YYYY-MM-DD`·`YYYYMMDD`·`YYYY/MM/DD`·`… HH:mm(:ss)`·`YYYYMMDDHHmmss`·ISO 오프셋·`Date`(달력 엄격), BOOLEAN: 불린·TRUE/FALSE, STRING: 문자열·숫자 | `…은(는) 숫자여야 합니다` · `…은(는) 날짜 형식이 아닙니다` · `{캡션}: 값 형식이 올바르지 않습니다` |
| `LENGTH` | STRING 의 code point 수 > `length`(이모지 한 글자 = 1, `codePointLength`) | `{캡션}은(는) 최대 {n}자입니다` |
| `SCALE` | NUMBER(p,s): 정수부 > p−s 또는 소수부 > s(끝자리 0 은 세지 않는다, `scale` 없으면 0) | `{캡션}은(는) 정수 {p−s}자리, 소수 {s}자리까지입니다` |
| `CODE` | `allowedCodes` 를 받았고 그 안에 없음 | `{캡션}: 허용되지 않은 코드입니다` |
| `STD_EXPR` | 도메인 표준식(`stdExpr.ast`, 변수는 `value` 하나)이 거짓·NULL | `{캡션}: 표준 규칙을 만족하지 않습니다({stdExpr.text})` |

표준식을 화면이 평가할 수 없으면(`isSupported` 거짓 — `CODE`·`MASTER` 등, 판정 오류, 불린이 아닌 결과) 통과로 두고 서버에 맡긴다.

```tsx
import { FormGroup } from "@dk-oasis/shared/form";
import { AgDataGrid } from "@dk-oasis/shared/grid";
import { toFieldErrors } from "@dk-oasis/shared/http";
import { useMdmValidation } from "@dk-oasis/shared/mdm-meta";

const { validateValue, validateRows } = useMdmValidation();

// 폼 — 입력이 바뀔 때 그 칸만
<FormGroup name="title" required error={errors.title}>
  <Input value={form.title} onChange={(v) => { set("title", v); setError("title", validateValue("title", v)?.message); }} />
</FormGroup>

// 그리드 — 편집한 칸 즉시 표시 + 저장 전 전체 검사 + 서버 오류 칸 표시
const [fieldErrors, setFieldErrors] = useState<AgDataGridProps["fieldErrors"]>([]);
async function save() {
  const issues = validateRows(rows, ["TITLE", "CATEGORY"]);   // 지운 행은 건너뛴다
  if (issues.length > 0) {
    setFieldErrors(issues.map((i) => ({ rowIndex: i.rowIndex, field: i.field, message: i.issue.message })));
    return;
  }
  try { await saveApi(changed); setFieldErrors([]); }
  catch (e) { setFieldErrors(toFieldErrors(e, "master")); }    // e.errors(서버 ErrorDetail 목록) → 칸 오류. 두 번째 인자 = 요청의 grid 이름
}
<AgDataGrid columns={COLUMNS} data={rows} rowKey="NOTICE_ID" mdmValidate fieldErrors={fieldErrors} />
```

- `useMdmValidation()` 은 공급자 안(포털 탭)에서만 검사한다. 밖이거나 `disabled` 면 늘 통과다. **받아 둔 메타만 쓰고 요청하지 않는다**(동기, 렌더 중 불러도 부수 효과 없음) — 검사할 칸은 그리드 열·`FormGroup name`·`useMdmColumn(s)` 로 등록해 둔다. 등록하지 않았거나 아직 못 받은(MDM 장애 unavailable·500) 이름은 건너뛰고 서버에 맡긴다. 렌더마다 요청을 걸면 장애 중 글자마다 POST 가 나가므로 훅이 일부러 걸지 않는다.
- `validateValue(name, value, row?, meta?)` · `validateRow(row, names)` → `{ 이름: 오류 }` · `validateRows(rows, names)` → `[{ rowIndex, field, issue }]`(`rowStatus` `D`·`deleted`, `_rowState`·`nativeeditor_status` `deleted` 행 제외).
- `validateMdmValue(column, value, row?, caption?)` 는 메타를 이미 가진 곳(같은 컴포넌트의 `useMdmColumn` 결과, 시험)에서 쓴다.
- `toFieldErrors(source, grid?)` 는 `errors` 배열을 가진 값(OASIS 봉투 `{ meta, errors }`, `errors` 를 실은 오류 객체, `apiRequest` 가 HTTP 4xx·5xx 에서 던진 `HttpError`)이나 배열을 받아 `field` 가 있는 것만 `{ rowKey, rowIndex, field, message }` 로 돌려준다. `grid` 를 주면 그 그리드와 grid 없는 것만. 검증 불가(`MDM_UNAVAILABLE`, field 없음)는 빠지므로 메시지로 보인다.
- **OASIS 서비스는 `BusinessException` 을 HTTP 200 + `meta.success=false` 봉투로 돌려준다** — `apiRequest` 가 던지지 않는다. 화면의 봉투 해제 함수가 거부를 판정해 오류를 던질 때 봉투의 `errors` 를 그 오류 객체의 `errors` 칸에 실어야 `toFieldErrors(e)` 가 읽는다(또는 봉투를 그대로 넘긴다).

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

### MdmFieldLabel

th 안이나 아무 라벨 자리에 넣는 인라인 라벨(`FormGroup` 을 쓰지 않는 화면용).

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| name | `string` | 필수 | 화면 키 — 물리명으로 바꿔(`noticeTitle` → `NOTICE_TITLE`, `TITLE`) 사전에서 찾는다. 사전에 없을 때 `label` 도 없으면 이 값이 글자로 보인다 |
| meta | `string \| false` | 없음 | 명시 물리명(`name` 보다 우선). `false` 면 MDM 연결을 끈다 |
| label | `string` | 없음 | 명시 캡션. 기본(`explicit`)에서는 이 값이 이기고, 공급자가 `captionPriority="mdm"` 이면 MDM 캡션이 이긴다 |
| required | `boolean` | `false` | 라벨 뒤에 ` *` (색 없음, 글자 하나로) |
| kind | `"form" \| "grid"` | `"form"` | 캡션 칸 선택. `form` 은 `labelMid` → `labelLong` → `labelShort` → `columnName`, `grid` 는 `labelShort` 부터 |
| className | `string` | 없음 | 라벨 글자 span 에 붙는다. 메타가 없을 때도 값이 있으면 span 으로 감싼다 |
| style | `CSSProperties` | 없음 | 위와 같다 |

툴팁(메타가 있을 때): 글자 `span.form-tip-trigger` 에 마우스를 올리거나 포커스가 들어오면 `document.body` 에 `.form-tip-text.form-tip-text--portal`(position: fixed, 최상단)로 `MdmMetaCard` 가 뜬다. 위치·위/아래 판정·가장자리 보정은 `FormGroup` 과 같고, 앵커는 라벨 글자다. 스크린리더 설명(`aria-describedby`)은 body 로 포털한 `.form-sr-only` 에 두어 th 글자와 접근 이름을 늘리지 않는다. 상자 폭은 form.css 의 `.form-tip-text`(최소 220px·최대 320px, 위치는 오른쪽 가장자리에서 안쪽으로 당겨 최대 폭을 확보)가 정한다.

## 표준값: 모든 화면 동일

- 화면은 공급자를 직접 두지 않는다(포털 탭이 둔다). 우선순위를 바꿀 때만 `MdmMetaProvider captionPriority="mdm"` 를 둔다.
- 연결 키는 그리드 `key`·폼 `name`·`MdmFieldLabel name` 을 물리명으로 바꾼 값이다. 맞지 않으면 `meta="물리명"`, 엉뚱하게 맞으면 `meta={false}`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| MDM 캡션을 쓰려고 `header: ""`·`label=""` 를 준다 | 생략한다. `""` 는 일부러 비운 캡션으로 그대로 남는다 |
| 기존 화면의 `header` 를 지워 MDM 캡션을 쓴다 | 지우지 말고 화면을 `captionPriority="mdm"` 으로 감싼다 — MDM 을 받지 못할 때 열 key 가 머리글로 보이고 다른 곳의 라벨과 어긋난다 |
| 엑셀 내보내기에서 `c.header` 를 읽어 빈 머리글이 나온다 | `useResolvedGridColumns(COLUMNS)` 결과를 쓴다 |
| 화면에서 `fetch("/api/mls/mdmMeta/columns")` 를 직접 부른다 | `useMdmColumn(s)`·`requestColumns` — 묶음 요청·보관·401 처리가 들어 있다 |
| 상세 표 th 에 `{caption} *` 를 손으로 그리거나 `useMdmColumn`+`resolveCaption` 으로 라벨만 만든다(툴팁이 없다) | th 안에 `<MdmFieldLabel name="TITLE" label="제목" required />` — 캡션과 툴팁이 함께 붙는다 |
| 문자열 길이를 `s.length` 로 잰다(이모지 2자) | `codePointLength(s)` — 서버도 code point 로 잰다 |
| 서버가 rowIndex 를 준 오류를 바뀐 행만 보낸 화면에서 그대로 `fieldErrors` 로 넘긴다 | 그리드는 rowIndex 를 `data` 의 자리로 본다. 행에 `rowKey` 를 실어 보내거나 rowIndex 를 data 자리로 바꿔 넘긴다 |
| 화면 검사를 통과했으니 서버 오류는 없다고 본다 | 비즈니스식·룰 세트·화면이 못 하는 표준식은 서버만 본다. 저장 실패는 늘 `toFieldErrors` 로 칸에 보인다 |
| 다른 모듈 화면의 부품을 띄웠는데 탭 모듈(pageId)로 메타를 찾는다 | 그 부분만 `MdmMetaProvider module="mqc"` 로 감싼다 |

## 실제 사용 예

- `src/frontend/shared/src/portal-shell/portal-shell.tsx` `TabPageSlot`: 탭 본문을 `MdmMetaProvider` 로 감싼다.
- 화면 파일럿: `src/frontend/m-mls/pages/lsh/noticeMgmt/`(2026-10-03)
  - `notice-columns.tsx`: `TITLE` 열은 대체 `header`("제목")를 두고, 화면(`page.tsx` 의 default export)이 `MdmMetaProvider captionPriority="mdm"` 으로 감싸 MDM 이 있으면 MDM 캡션·머리글 툴팁이 이긴다. 파생 열(`CATEGORY_LABEL` 등)은 header 를 적고 `meta: false` 로 연결을 끈다.
  - `NoticeTitleRow.tsx`: 상세 표(th/td) 제목 줄 — 라벨은 `MdmFieldLabel`(캡션 + 올리면 MDM 카드 툴팁), 입력 중 검사는 같은 `column` 으로 `validateMdmValue` → `Input error`(MDM 장애 중에도 요청은 등록 한 번).
  - `page.tsx`: 저장 전 `validateRow` 로 막고, 저장 실패는 `toFieldErrors(e, "master")` → 칸별 `error`(고치면 지운다). 그리드에 `mdmValidate`(목록이 읽기 전용이라 지금은 검사할 칸이 없다).
  - `api.ts`: `NoticeApiError.errors` 에 OASIS 봉투의 `errors` 를 실어 `toFieldErrors` 가 읽게 한다.
  - 시험: `m-mls/tests/lsh/noticeMgmt/notice-page-mdm.test.ts`(화면 전체), `notice-mdm-render.test.ts`(제목 줄·그리드 캡션·라벨 툴팁).
