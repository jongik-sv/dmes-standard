# MDM 화면 메타 (MdmMetaProvider · useMdmColumn · MdmMetaCard · useMdmValidation)

그리드 머리글·폼 라벨의 캡션과 툴팁을 MDM 컬럼 사전에서 가져오고, 입력값을 MDM 정의(필수·형식·길이·허용 코드·표준식)로 즉시 검사할 때 쓴다. 포털 탭이 공급자를 자동으로 씌우므로 캡션·툴팁은 화면이 아무것도 하지 않아도 붙는다. 값 검사는 화면이 켠다.

- import: `import { MdmMetaProvider, useMdmColumn, useMdmColumns, MdmMetaCard, resolveCaption, toPhysName, useMdmValidation, validateMdmValue, codePointLength } from "@dk-oasis/shared/mdm-meta";` (CSS import 없음)
- 서버 오류 → 칸 오류: `import { toFieldErrors } from "@dk-oasis/shared/http";`
- 소스: `src/frontend/shared/src/mdm-meta/`(`context.tsx`·`store.ts`·`caption.ts`·`names.ts`·`MdmMetaCard.tsx`·`validate.ts`), `src/frontend/shared/src/http/index.ts`(`toFieldErrors`)
- 설계: `docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md` §2 B1~B8·C1·C2·C5·C9, §4, §5
- 받는 곳: 업무 BE `POST /api/{module}/mdmMeta/columns`(본문 `{"names":[…]}`)·`/domains`(본문 `{"domainIds":[…]}`). 한 화면에서 등록한 이름을 16ms 동안 모아 모듈마다 한 번 부르고, 받은 것은 5분 둔다. 404·401·403·연결 실패면 그 모듈은 세션 동안 메타 없이 두고 다시 부르지 않는다(401 에도 로그인 화면으로 보내지 않는다).

## 언제 쓰나

- 쓴다: 그리드 `header`·폼 `label` 을 표준 용어(MDM)로 맞추고 싶을 때 — 그냥 비운다. 화면이 직접 메타를 읽어 표시할 때 `useMdmColumn`. 화면 고유 위치에 MDM 정보 카드를 띄울 때 `MdmMetaCard`.
- 쓴다(값 검사): 폼은 `useMdmValidation()` 결과를 `FormGroup error` 로, 그리드는 `mdmValidate`, 저장 전 전체 검사는 `validateRows`, 저장 실패는 `toFieldErrors` → 그리드 `fieldErrors`·폼 `error`.
- 쓰지 않는다: 값 검사에 `useMdmColumn` 으로 메타를 읽어 직접 비교하지 않는다 — `useMdmValidation` 이 서버와 같은 판정·문구를 낸다. 비즈니스식(업무 규칙)은 화면에서 검사하지 않는다(서버 `MdmValidator` 몫).
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
import { HttpError, toFieldErrors } from "@dk-oasis/shared/http";
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
  catch (e) { setFieldErrors(toFieldErrors(e, "notice")); }    // HttpError.errors(ErrorDetail) → 칸 오류
}
<AgDataGrid columns={COLUMNS} data={rows} rowKey="NOTICE_ID" mdmValidate fieldErrors={fieldErrors} />
```

- `useMdmValidation()` 은 공급자 안(포털 탭)에서만 검사한다. 밖이거나 `disabled` 면 늘 통과다. 받아 둔 메타만 쓰므로(동기) 그리드 열·`FormGroup name` 으로 등록되지 않은 이름은 첫 호출에서 요청만 걸고 건너뛴다.
- `validateValue(name, value, row?, meta?)` · `validateRow(row, names)` → `{ 이름: 오류 }` · `validateRows(rows, names)` → `[{ rowIndex, field, issue }]`(`rowStatus` `D`·`deleted`, `_rowState`·`nativeeditor_status` `deleted` 행 제외).
- `validateMdmValue(column, value, row?, caption?)` 는 메타를 이미 가진 곳(시험·특수 화면)에서 쓴다.
- `toFieldErrors(source, grid?)` 는 `apiRequest` 가 던진 `HttpError`(`errors` = 서버 `ErrorDetail` 목록), OASIS 봉투 `{ meta, errors }`, 배열을 받아 `field` 가 있는 것만 `{ rowKey, rowIndex, field, message }` 로 돌려준다. `grid` 를 주면 그 그리드와 grid 없는 것만. 검증 불가(`MDM_UNAVAILABLE`, field 없음)는 빠지므로 메시지로 보인다.

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
| 문자열 길이를 `s.length` 로 잰다(이모지 2자) | `codePointLength(s)` — 서버도 code point 로 잰다 |
| 서버가 rowIndex 를 준 오류를 바뀐 행만 보낸 화면에서 그대로 `fieldErrors` 로 넘긴다 | 그리드는 rowIndex 를 `data` 의 자리로 본다. 행에 `rowKey` 를 실어 보내거나 rowIndex 를 data 자리로 바꿔 넘긴다 |
| 화면 검사를 통과했으니 서버 오류는 없다고 본다 | 비즈니스식·룰 세트·화면이 못 하는 표준식은 서버만 본다. 저장 실패는 늘 `toFieldErrors` 로 칸에 보인다 |
| 다른 모듈 화면의 부품을 띄웠는데 탭 모듈(pageId)로 메타를 찾는다 | 그 부분만 `MdmMetaProvider module="mqc"` 로 감싼다 |

## 실제 사용 예

- `src/frontend/shared/src/portal-shell/portal-shell.tsx` `TabPageSlot`: 탭 본문을 `MdmMetaProvider` 로 감싼다.
- 화면 파일럿: m-mls `lsh/noticeMgmt`(T6 에서 적용).
