# 맞춤 레포트 2차: 조건·출력 확장, 모달 동작, 모듈·분류, 견본

- 날짜: 2026-10-10. 기준 커밋: dev `2479ad2af`
- 기본 스펙: [2026-10-10-user-query-program-design.md](2026-10-10-user-query-program-design.md)(이하 「1차 스펙」). 이 문서는 1차 스펙에 덧붙이는 추가 스펙이다.
- 시안: [userq-mockup.html](assets/2026-10-10-userq-mockups/userq-mockup.html)의 `Q` 데이터(기간·다중·코드·상대 날짜·서식·합계)
- 출처: 2026-10-10 사용자 결정 A·B·C·E·F·G. D(다른 모듈 표 DB 권한)는 범위 밖이다.
- 바꾸는 1차 스펙 절: §0 「제외」의 시안 기능, §2.2 JSON 칸, §4.1·§4.2(모듈, `paramsJson` 16000자), §8.1 조건 칸 형, §12 미결 6. 나머지는 그대로다.

## 0. 결정 요약

| ID | 결정 |
|---|---|
| A | shared `Modal` 에 `closeOnClickOutside?: boolean`(기본 `true`)을 더한다. `SqlCodeEditor` 의 큰 창만 `false` 를 넘긴다. X·Esc·[취소]는 지금처럼 초안을 버리고 닫는다(의도한 동작이라 확인 창을 두지 않는다) |
| B | 겹친 모달은 Esc 한 번에 맨 위 하나만 닫는다. shared `Modal`·`MessageModal` 이 페이지 하나의 「열린 모달 순서표」를 함께 쓰고, 맨 위가 아닌 모달은 Mantine 에 `closeOnEscape={false}` 를 넘긴다 |
| C | 기간·다중 선택·공통코드 LoV·상대 날짜 기본값·숫자 서식·합계 줄·코드 표시를 넣는다. 위젯 `QueryParam`·`TableColumnConfig` 모양을 뒤 호환으로 넓힌다. 위젯도 같은 조건 형을 쓴다(§2.6) |
| E | 기능마다 견본 정의를 둔다(8개, 이름 앞 「[견본]」). 정의는 Flyway V15, 할당은 시더가 `admin` 에 넣는다 |
| F | 분류 코드 `USRQ_CTG` 처음 값을 9개로 늘린다(§6.2) |
| G | 정의에 `MODULE_CD` 를 더한다(Flyway V14). 값은 예약 작업과 같은 6개다 |

## 1. 공용 모달(A·B)

### 1.1 바깥 누름으로 닫지 않기(A)

- `ModalProps.closeOnClickOutside?: boolean`(기본 `true`)를 `M.Root` 로 넘긴다. 다른 모달의 동작은 바뀌지 않는다.
- `SqlCodeEditor` 큰 창만 `false` 를 쓴다. 긴 SQL 을 고치다 바깥을 잘못 누르면 초안이 사라지기 때문이다. X·Esc·[취소]는 일부러 하는 동작이라 지금처럼 초안을 버린다.

### 1.2 Esc 는 맨 위 모달만(B)

지금 동작: Mantine `useModal` 은 열린 모달마다 window 캡처 단계 keydown 리스너를 둔다. 리스너는 전파를 멈추지 않는다. 그래서 Esc 한 번에 열린 모달이 모두 닫힌다. Mantine 의 `Modal.Stack` 은 공통 부모가 있는 `Modal` 에만 쓰이고 `M.Root` 에는 쓰이지 않는다.

| 항목 | 설계 |
|---|---|
| 순서표 | `shared/src/components/modal-stack.ts`(새 파일, React 무관). `globalThis.__dkOasisModalStack = { ids: string[], listeners }`. hover-tip 가드와 같은 이유로 globalThis 에 둔다(shared 가 진입마다 따로 묶여 페이지에 여러 벌 실린다) |
| 등록 | `ModalCore` 가 `useId()` 로 id 를 얻는다. `open` 이 true 가 되는 커밋에서 맨 뒤에 넣고, false 가 되거나 언마운트되면 뺀다(`useLayoutEffect`) |
| 판정 | `isTop = useSyncExternalStore(subscribe, () => ids.at(-1) === id)` |
| Esc | `M.Root closeOnEscape={isTop}`. Esc 처리는 Mantine 에 그대로 맡긴다. 그래서 `isComposing`(한글 조합)·`data-mantine-stop-propagation`(드롭다운·Monaco·hover 카드) 규칙이 그대로 산다. `useEscapeCompat` 의 `preventDefault` 도 그대로 둔다(`modal-a11y` 계약) |
| Tab 가두기 | `useModalA11yCompat` 의 document keydown Tab 처리도 맨 위 모달만 한다(`isTopRef`). 지금은 아래 모달이 초점을 자기 첫 칸으로 끌어간다 |
| 같은 이벤트 | 브라우저는 이벤트를 보내기 시작할 때 리스너 목록을 정하고, 아래 모달의 리스너는 그때의 `closeOnEscape=false` 를 쥐고 있다. 그래서 Esc 하나에 모달 하나만 닫힌다. 레인은 이 동작을 시험으로 고정한다. 모달이 하나뿐인 화면은 동작이 같다 |
| 남는 범위 | `ui-provider` 의 Mantine `ModalsProvider`(`modals.open*`)로 띄운 창은 순서표 밖이다. 이번에는 고치지 않는다 |

### 1.3 날짜 기간 입력 칸(공통 부품 등록)

- 기간 칸은 업무와 무관한 입력 부품이라 shared `form/DateRangePicker.tsx` 로 새로 등록한다(CLAUDE.md 행동강령, Part B §18). 새 부품이라 승인 없이 진행한다.
- props: `from`, `to`(yyyy-MM-dd), `onChange(from, to)`, `id`, `toAriaLabel`, `required`, `testId`. 안쪽은 `DatePicker` 두 개와 `~` 다. 시작이 끝보다 늦으면 `error` 모양이다. 같은 레인에서 `mantine-aggrid-ui` 스킬 `references/components/date-range-picker.md`·`llms.txt` 를 갱신한다.

### 1.4 합계 줄(승인 필요)

- shared `AgDataGrid` 는 아래 고정 행을 지원하지 않는다. 그리드 안 합계 줄에는 선택형 prop `pinnedBottomRows?: Record<string, unknown>[]`(AG Grid `pinnedBottomRowData` 전달, 기본 없음)가 필요하다. 기존 shared props 를 바꾸는 일이라 사용자 승인이 필요하다(§10 미결 1).
- 승인 전 대안: `RunPane` 이 그리드 아래 줄에 「합계 · 생산량(t) 1,234.5 · 계획량(t) 2,000.0」을 글로 보인다. 합계 계산은 순수 함수 `columnSums()`(§2.5)로 두어 어느 쪽이든 그대로 쓴다.

## 2. 입력·출력 정의 계약(C)

### 2.1 입력 조건 `QueryParam` 2판

```ts
type QueryParamType = "text" | "number" | "date" | "select" | "daterange" | "multi";
interface QueryParam {
  name: string; label?: string; type: QueryParamType; default?: string; required?: boolean;
  options?: { value: string; label?: string }[];  // select·multi 고정 선택지
  codeGroup?: string;    // select·multi 공통코드 그룹(TB_SEC_CODE_GROUP.GROUP_CD). options 와 함께 쓸 수 없다
  toName?: string;       // daterange 끝 날짜 바인드 이름(daterange 는 필수)
  toDefault?: string;    // daterange 끝 기본값
  maxSpanDays?: number;  // daterange 최대 일수(1~3660, 없으면 제한 없음)
  countName?: string;    // multi 의 고른 개수 바인드 이름(선택)
}
```

| 형 | 화면 칸 | 값(`paramsJson`) | 바인드 |
|---|---|---|---|
| `daterange` | `DateRangePicker` | `{"fromDt":"2026-10-03","toDt":"2026-10-10"}`. 시작은 `name`, 끝은 `toName` 키 | 둘 다 yyyyMMdd 글자(VARCHAR). `date` 형과 같은 해석 |
| `multi` | `MultiSelectComboBox` | `{"statCd":["S","H"]}`. 글자 배열 | 글자 목록. Spring 이 `IN (?, ?)` 로 펼친다(§3.2) |
| `multi` 의 `countName` | (칸 없음) | 보내지 않는다. 보내도 서버가 읽지 않는다 | 고른 개수(NUMERIC). 비면 0 |
| `select`+`codeGroup` | `Select`, 선택지는 코드 LoV | 글자 하나 | VARCHAR |

- `toName`·`countName` 은 바인드 이름이다. 이름 형식(`^[A-Za-z][A-Za-z0-9_]{0,29}$`), 시스템 변수 금지, 중복 금지 검사를 `name` 과 같은 집합에서 한다.
- 이 두 이름은 「선언한 이름」에 들어간다. 이 집합을 `SqlGuard.checkDeclared`·`QueryParams.names`·`resolve` 와 FE `paramUsageNotes`·`appendUndeclaredParams` 가 함께 쓴다. 그래야 `:toDt` 가 「선언 안 된 조건」으로 잡히지 않는다.
- `multi` 의 `default` 는 쉼표로 나눈 글자다(`"S,H"`). 쉼표가 든 값은 기본값으로 쓸 수 없다. 필수면 `daterange` 는 시작·끝 둘 다, `multi` 는 하나 이상이 있어야 한다.

### 2.2 상대 날짜 기본값

- `date` 의 `default`, `daterange` 의 `default`·`toDefault` 는 절대 날짜(yyyy-MM-dd, yyyyMMdd) 또는 낱말을 받는다. 낱말 문법: `^[+-]?\d{1,3}[dwMy]$` 또는 `monthStart`·`monthEnd`·`prevMonthStart`·`prevMonthEnd`·`yearStart`. `d` 일, `w` 주, `M` 달, `y` 해다.
- 기준일은 Asia/Seoul 달력의 오늘이다(전기일 아님). 달·해 계산은 그 달 마지막 날로 맞춘다(Java `plusMonths` 규칙).
- FE `initialValues` 가 칸의 첫 값을 만든다(브라우저 날짜). 서버도 같은 규칙으로 해석한다. 저장 검사(`parseOne`), 미리보기(기본값 실행), 값 키가 없는 실행에서 쓴다. 서버는 실행기 `clock` 의 오늘을 `resolve` 에 넘긴다. 사용자 실행은 FE 가 보낸 값이 우선한다.
- 두 쪽 시험은 아래 표를 똑같이 쓴다(기준일 2026-03-31).

| 낱말 | 결과 | 낱말 | 결과 |
|---|---|---|---|
| `0d` | 2026-03-31 | `monthStart` | 2026-03-01 |
| `-7d` | 2026-03-24 | `monthEnd` | 2026-03-31 |
| `+1d` | 2026-04-01 | `prevMonthStart` | 2026-02-01 |
| `-1w` | 2026-03-24 | `prevMonthEnd` | 2026-02-28 |
| `-1M` | 2026-02-28 | `yearStart` | 2026-01-01 |
| `-13M` | 2025-02-28 | `-1y`(기준일 2024-02-29) | 2023-02-28 |

### 2.3 출력 열 `TableColumnConfig` 2판

```ts
type ColumnFormat = "text" | "number" | "date" | "code";
interface TableColumnConfig {
  field: string; header?: string; width?: number; align?: ColumnAlign; format?: ColumnFormat;
  mask?: string;       // number 전용. 예: "#,##0", "#,##0.0", "0.00"
  sum?: boolean;       // number 전용. 합계 줄에 넣는다
  codeGroup?: string;  // code 전용. 코드 값을 이름으로 보인다
  badge?: boolean;     // code 전용. 이름을 배지 모양으로 보인다
}
```

- `mask` 문법: `^(#,##)?0(\.(0{1,6}|#{1,6}))?$`. `#,##` 는 천 단위 구분이다. `.000` 은 소수 고정 자릿수, `.###` 은 최대 자릿수다. 없으면 지금 `formatNumber`(천 단위, 소수 3자리까지)다.
- `code` 형식은 그룹 LoV 에 없는 값을 글자 그대로 보인다. 배지는 shared `Badge` 중립 색 하나다. `GridColumn.render` 는 ReactNode 를 돌려줄 수 있어 배지를 그릴 수 있다. 엑셀(`AgDataGridExcel`)은 `render` 결과가 아니라 원래 값을 쓴다. 이번에는 바꾸지 않는다(코드 값·서식 없는 숫자, 합계 줄 없음).

### 2.4 검사 한도

| 항목 | 한도 | FE | 서버 |
|---|---|---|---|
| 조건 수 | 10개(daterange·multi 도 1개). 바인드 이름은 20개까지 | `validateParams` | `QueryParams.parse` |
| multi 고른 수 | 100개(Oracle `IN` 1000 한도 아래) | 칸이 막는다 | 넘으면 거절 |
| multi 원소 | 글자, 200자 이하, NUL 금지, 앞뒤 공백 지움, 중복 제거, 고정 선택지 또는 코드 그룹에 있는 값 | 칸 | `coerce` |
| 값 JSON 전체 | 4000자 → **16000자**(위젯·맞춤 레포트 함께). 원소 50자 × 100개가 5300자라 4000자로는 모자란다 | `cleanValues` | `VALUES_JSON_MAX` |
| `codeGroup` | `^[A-Z][A-Z0-9_]{1,49}$`, 저장 때 `TB_SEC_CODE_GROUP` 에 있고 `USE_YN='Y'` | 형식만 | 형식 + 존재 |
| `maxSpanDays` | 정수 1~3660 | 칸 | 넘으면 거절 |
| 기간 순서 | 시작 ≤ 끝 | 조회 막음 | 거절 |
| `mask` | 20자 이하, 위 문법, `format=number` 일 때만 | `validateColumns`(새) | `validateColumns` |
| `sum` | 불리언, `format=number` 일 때만 | 같음 | 같음 |
| `codeGroup`·`badge`(열) | `format=code` 일 때만, 그룹 형식 위와 같음 | 같음 | 같음(존재 검사 없음, 표시용) |

### 2.5 뒤 호환 규칙

- 새 키는 모두 선택이고 새 형·형식 값은 덧붙이기만 한다. 그래서 저장된 `CONFIG_JSON`·`PARAMS_JSON`·`COLUMNS_JSON` 은 이전 없이 같은 뜻으로 읽힌다.
- 글자만 담은 `paramsJson` 도 그대로 받는다. 배열은 `multi` 이름에만 받는다. 다른 이름의 배열과 `multi` 의 글자는 거절한다. 새 키가 지나가야 하는 지점을 모두 고친다. 하나라도 빠지면 편집기에서 저장할 때 새 키가 사라진다.

| 쪽 | 고칠 곳 |
|---|---|
| FE `_query/format.ts` | `QueryParamType`·`PARAM_TYPES`·`PARAM_TYPE_LABELS`, `paramsOf`, `validateParams`, `ParamValues`(→ `Record<string, string \| string[]>`), `initialValues`, `cleanValues`, `missingRequired`, `planRun`, `extractBindNames` 계열 안내, `ColumnFormat`·`FORMATS`·`FORMAT_LABELS`, `tableConfigOf`, `toColumnDefs`(옵션 `{ codeLabels }`), 새 `formatMask`·`columnSums`·`resolveDateDefault` |
| FE 편집기 | `ParamsEditor` `toRow`·`fromRow`·`normalizeCell`, `ColumnsEditor` `normalizeColumnCell` |
| BE `widget/query` | `QueryParam`(레코드 필드 추가. 6인자 보조 생성자를 남겨 기존 시험을 고치지 않는다), `QueryParam.Type`, `QueryParams.parseOne`·`names`·`parseValues`·`resolve`·`coerce`·`Bound.cacheValue` |
| BE `userq` | `UserQueryService.paramsView`(키를 하나씩 만든다. 새 키를 더한다), `UserQueryMngService.validateColumns`·`FORMATS`, `UserQueryRequest` 주석(4000자 → 16000자). 4000자 상한은 `QueryParams.VALUES_JSON_MAX` 한 곳뿐이다(2479ad2af 확인) |

- `columnSums(rows, columns)`: `sum=true` 열마다 받은 행의 숫자 합을 구한다. 숫자가 아닌 칸은 건너뛴다. 결과가 잘렸으면 합계 이름을 「표시한 행 합계」로 바꾼다.

### 2.6 위젯 쪽 노출(권고)

- 위젯과 맞춤 레포트는 `ConditionField`·`ParamsEditor`·`QueryParams` 를 함께 쓴다. 그래서 새 조건 형 6종을 위젯에도 그대로 연다. 갈래를 두면 코드가 둘로 갈린다.
- 위젯 `useQueryData` 의 값 모양(`ParamValues`)과 캐시 키가 배열을 다뤄야 한다(F6).
- 출력 열: `mask`·`code`·`badge` 는 `toColumnDefs` 를 함께 쓰므로 위젯 표에도 적용된다. `sum` 칸은 `ColumnsEditor` 의 새 prop `allowSum`(기본 `false`)이 켤 때만 보인다. 위젯 표에는 합계 줄이 없기 때문이다.

## 3. 서버(C)

### 3.1 코드 LoV

- 화면은 지금 분류 칸과 같은 `apiLovMaster("mcm", 그룹)`(cactus `LovController`, `/api/mcm/lov/master/{그룹}`)로 선택지를 얻는다. 이 경로는 권한키가 없어 인증한 사용자 누구나 읽는다. 레인은 이 경로가 `TB_SEC_CODE_ITEM` 을 읽는지, `USE_YN='Y'` 와 `SORT_ORD` 를 지키는지 먼저 확인한다. 다르면 FE 가 거르고 정렬한다.
- 새 훅 `_query/use-code-options.ts`: `useCodeOptions(group)`. `use-usrq-categories.ts` 규칙(그룹마다 모듈 수준 한 번, 8초 시간 상한, 실패·빈 결과는 보관 안 함)을 그룹 단위로 일반화한다. `use-usrq-categories.ts` 는 이 훅을 쓰도록 바꾼다.
- 서버는 실행 때 값이 그룹에 있는지 확인한다. 고정 선택지를 확인하는 것과 같은 규칙을 지키기 위해서다. `widget/query` 에 포트 `QueryCodeLookup { Set<String> items(String groupCd) }` 를 두고, mcm-core 의 `SecCodeItemService`(TB_SEC_CODE_ITEM, `USE_YN='Y'`)로 구현한다. 그룹마다 60초 보관, 그룹 200개까지 보관한다. 그룹 존재 검사는 저장 때만 한다. 실행 때는 보낸 값이 그룹 항목에 있는지만 본다. 그룹이 없는 DB 에서도 값을 비워 두면 실행된다(견본이 모든 DB 에 들어가기 때문이다). 저장 때 기본값도 항목 확인을 한다.

### 3.2 다중 선택 바인드(보안 검토 대상)

| 규칙 | 내용 |
|---|---|
| 자리 제한 | `multi` 이름(`:x`)은 `IN (:x)`·`NOT IN (:x)` 자리에만 쓸 수 있다. `SqlGuard.checkDeclared(sql, declared, listNames)` 가 가린 SQL(주석·글자 제외)에서 확인하고 어기면 저장·실행을 거절한다. 목록이 펼쳐지면 `:x IS NULL` 같은 자리는 문법이 깨지거나 뜻이 바뀌기 때문이다 |
| 빈 선택 | 빈 목록을 바인드하지 않는다(펼친 뒤 `IN ()` 가 된다). 비었으면 원소 하나짜리 `[null]`(VARCHAR)을 바인드한다. `IN (NULL)` 은 아무 행도 고르지 않는다 |
| 「비면 전체」 | 작성자가 `countName` 을 선언해 쓴다. 예: `AND (:statCnt = 0 OR C.STAT_CD IN (:statCd))` |
| 바인드 | `MapSqlParameterSource.addValue(name, List<String>, Types.VARCHAR)`. `QueryParams` 가 만든 불변 목록만 넘긴다. 원소마다 형이 붙는다 |
| 정규화 | 앞뒤 공백 지움 → 중복 제거 → 사전순 정렬. 같은 선택이 같은 캐시 키가 된다. `Bound.cacheValue` 는 불변 목록이다 |
| 바뀐 클래스 설명 | `QueryParams` 머리 주석의 「컬렉션을 만들 수 없다」를 「`multi` 만 글자 목록, 그 밖은 스칼라」로 고친다 |
| 실측 | spring-jdbc 7.0.7 `PreparedStatementCreatorFactory` 가 형 붙은 목록을 원소마다 형을 붙여 펼치는지 H2·레인 PDB 시험으로 확인한다 |

### 3.3 기간·상대 날짜·출력 검사

- `resolve(defs, usedNames, given, lenient, today)`. `daterange` 는 `name`·`toName` 두 바인드(`date` 형 해석)로 펼친 뒤 시작 ≤ 끝, `maxSpanDays` 를 확인한다. 상대 낱말 기본값은 `today` 로 바꾼 뒤 해석한다. `parseOne` 의 기본값 검사도 같은 함수를 쓴다.
- `UserQueryMngService.validateColumns`: `FORMATS` 에 `code` 를 더하고 §2.4 의 `mask`·`sum`·`codeGroup`·`badge` 규칙을 검사한다. 위젯 표 설정은 지금처럼 서버가 열을 검사하지 않는다.

## 4. 모듈(G)

| 항목 | 내용 |
|---|---|
| 값 | `MCM`·`MDM`·`MPP`·`MLS`·`MQC`·`MPN`. 예약 작업의 `JOB_MODULES`(`csa/jobSchedMng/types.ts`)·`JobSchedMngService.MODULES`·`CK_TB_MCM_JOB_DEF_MOD` 와 같은 집합이다. 이름표: 공통·기준정보·생산·물류·품질·APS |
| 상수 | 금지 경로를 건너지 않게 `_userq/types.ts`(`USRQ_MODULES`)와 `userq` 서비스(`MODULES`)에 따로 둔다 |
| DDL | `V14__user_query_module.sql`: `alter table TB_MCM_USRQ_DEF add (MODULE_CD varchar2(10 char) default 'MCM' not null)`, 확인 제약 `CK_TB_MCM_USRQ_DEF_MOD`, 칸 주석 `모듈 코드`. 기존 행(로컬 `UQ_TEST_ROWS` 포함)은 `MCM` 이 된다 |
| `userQueryMng` | `search` 조건 `moduleCd?`(같음), 목록 행 `moduleCd`, `get`·`save` 의 `moduleCd`(저장 때 필수, 위 6개 중 하나) |
| `userQuery` | `myList` 행과 `getDef` 에 `moduleCd` 를 더한다. `myList` SQL 에 `B.MODULE_CD` 를 더한다 |
| 화면 | 관리: 조회조건 「모듈」 select(전체+6), 목록 열 「모듈」(분류 다음), 정의 탭 기본 정보 「모듈」 select(새 정의 기본 MCM). 사용자: 왼쪽 위 한 줄에 모듈 select(폭 약 90px, 전체+6) + 이름 거르기 칸. 화면 안에서만 거른다. 목록 항목 오른쪽에 모듈 코드를 작은 글자로 보인다 |
| 권한 | 새 action 이 없다. `allActions`·`PERM_USRQ_USE` 는 그대로다. BPMN 이 params 를 이름으로 나열하면 `moduleCd` 를 더한다 |

## 5. 분류 코드(F)

- `UserQueryCategoryCodeSeeder` 가 `USRQ_CTG` 항목을 없을 때만 넣는다. 코드 이름은 `WIDGET_CTG` 와 맞춘다. 이미 있는 `ETC` 는 `SORT_ORD=10`·이름 「기타」일 때만 90 으로 고친다(사용자가 바꾼 값은 둔다).

| ITEM_CD | 이름 | SORT_ORD | ITEM_CD | 이름 | SORT_ORD |
|---|---|---|---|---|---|
| PROD | 생산 | 10 | COMMON | 공통 | 60 |
| QUAL | 품질 | 20 | SYS | 시스템 관리 | 70 |
| LOGI | 물류·출하 | 30 | SAMPLE | 견본 | 80 |
| EQP | 설비 | 40 | ETC | 기타 | 90 |
| MATL | 자재 | 50 | | | |

## 6. 견본 정의(E)

### 6.1 전달 방식

| 항목 | 결정 |
|---|---|
| 정의 | Flyway `V15__user_query_samples.sql`. `insert … select … from dual where not exists`(V10·V11 방식). 모든 DB 에 영구히 남는다. 머지 직전에 V14·V15 번호를 다시 확인한다 |
| CLOB | `to_clob('…') \|\| to_clob('…')` 조각으로 만든다. 한글은 3바이트라 4000바이트 리터럴 한도에 쉽게 닿는다 |
| 표 이름 | `MCMAPUSER.` 접두를 붙인다. 운영 실행 계정이 전용 계정일 수 있기 때문이다 |
| 할당 | 새 시더 `UserQuerySampleSeeder` 가 ID 가 `SAMPLE_` 로 시작하는 정의를 `admin` 에 없을 때만 할당한다. `admin` 은 `CoreRbacSeeder` 가 도는 곳에만 있다. Flyway 로 넣으면 다른 DB 에 「없는 사용자」 할당이 남는다. 개발자 계정 할당은 조정자가 화면에서 한다 |
| 분류·모듈 | 모두 `CATEGORY_CD='SAMPLE'`, `MODULE_CD='MCM'`. 로컬 시험 정의 `UQ_TEST_ROWS` 는 건드리지 않는다 |
| 코드 그룹 | 견본이 쓰는 `WIDGET_CTG`·`USRQ_CTG` 는 시더가 넣는다. 시더가 돌지 않은 DB 에서는 코드 견본의 선택지가 비고 코드 이름 대신 코드 값이 보인다 |

### 6.2 견본 목록

열 이름은 V1 기준선·V3·V13 에서 확인했다. 레인은 `SqlGuard` 금지 낱말·함수(`INTO`·`USE` 등)를 확인한 뒤 SQL 을 [oracle-sql-rules 4장](../../guide/Database/oracle-sql-rules.md#4-쿼리-서식) 서식으로 쓴다.

| QUERY_ID · 이름 | 보이는 기능 | 입력 | 출력·최대 행 |
|---|---|---|---|
| `SAMPLE_USER_FIND` [견본] 사용자 찾기 | 글자 부분 일치, 고정 select, 출력 정의 없음(결과 열 전부) | `userNm` text, `useTp` select `Y:사용,N:미사용` 기본 Y | 정의 없음. 1000 |
| `SAMPLE_JOB_RUN_HIST` [견본] 예약 작업 실행 이력 | 기간 + 상대 날짜(`-7d`·`0d`), 필수, 고정 multi + `countName`, 서식·합계 | `fromDt`~`toDt` daterange 필수 `maxSpanDays` 31, `status` multi `RUN·OK·FAIL·SKIP·TIMEOUT` `countName=statusCnt`, `jobId` text | `ITEM_CNT` `#,##0` 합계, `ELAPSED_SEC` `#,##0.0` 합계. 1000 |
| `SAMPLE_WIDGET_BY_CTG` [견본] 분류별 위젯 정의 | 코드 multi(`WIDGET_CTG`), 코드 배지 열 | `ctgCds` multi `codeGroup=WIDGET_CTG` `countName=ctgCnt`, `useYn` select `Y·N` | `CATEGORY_CD` code `WIDGET_CTG` 배지, `REFRESH_SEC` `#,##0`. 500 |
| `SAMPLE_SCREEN_USAGE` [견본] 화면 사용 통계 | 기간 `monthStart`~`0d`, number 조건, 집계 합계 | `fromDt`~`toDt` daterange 필수, `pageId` text, `minOpen` number 기본 1 | `OPEN_CNT` `#,##0` 합계, `USE_MIN` `#,##0.0` 합계. 1000 |
| `SAMPLE_MENU_ACTIVE` [견본] 기준일 유효 메뉴 | date + `0d`, 필수 날짜 | `baseDt` date 필수 기본 `0d`, `menuNm` text | 머리글만 한글로 고친 열 정의. 2000 |
| `SAMPLE_USRQ_LIST` [견본] 맞춤 레포트 목록 | 코드 select(`USRQ_CTG`), 모듈 고정 select, 코드 이름 열 | `ctgCd` select `codeGroup=USRQ_CTG`, `moduleCd` select 6개 | `CATEGORY_CD` code `USRQ_CTG`(배지 없음). SQL_TEXT 는 고르지 않는다. 500 |
| `SAMPLE_ROW_LIMIT` [견본] 행 잘림·숫자 서식 | 최대 행 잘림 안내, 소수 서식, 시스템 변수 | `rowCnt` number 필수 기본 100 | `AMT` `#,##0.00` 합계, `RATIO` `0.000`. **20** |
| `SAMPLE_MY_INFO` [견본] 내 정보 | 조건 없음, `:userId`·`:today`·`:bizDate` | 없음 | 정의 없음. 10 |

SQL 뼈대(서식은 레인이 맞춘다):

```sql
-- SAMPLE_JOB_RUN_HIST
SELECT R.JOB_ID, R.SCHED_AT, R.STATUS, R.STARTED_AT, R.ITEM_CNT
     , ROUND((CAST(R.ENDED_AT AS DATE) - CAST(R.STARTED_AT AS DATE)) * 86400, 1) ELAPSED_SEC, R.MSG
FROM   MCMAPUSER.TB_MCM_JOB_RUN R
WHERE  R.SCHED_AT >= TO_DATE(:fromDt, 'YYYYMMDD') AND R.SCHED_AT < TO_DATE(:toDt, 'YYYYMMDD') + 1
AND    (:statusCnt = 0 OR R.STATUS IN (:status))
AND    (:jobId IS NULL OR R.JOB_ID LIKE '%' || :jobId || '%')
-- SAMPLE_SCREEN_USAGE: TB_SEC_SCREEN_USAGE_DAY, USAGE_DT BETWEEN :fromDt AND :toDt, PAGE_ID 로 묶고
--   COUNT(DISTINCT USER_ID) USER_CNT, SUM(OPEN_CNT) OPEN_CNT, ROUND(SUM(DURATION_MS) / 60000, 1) USE_MIN,
--   HAVING (:minOpen IS NULL OR SUM(OPEN_CNT) >= :minOpen)
-- SAMPLE_MENU_ACTIVE: TB_MCM_SEC_MENU, TO_DATE(:baseDt,'YYYYMMDD') BETWEEN NVL(START_ACTIVE_DATE, DATE '1900-01-01')
--   AND NVL(END_ACTIVE_DATE, DATE '9999-12-31')
-- SAMPLE_ROW_LIMIT: SELECT LEVEL NO, LEVEL * 1234.5678 AMT, MOD(LEVEL * 37, 101) / 7 RATIO, :today BASE_DT
--   FROM DUAL CONNECT BY LEVEL <= LEAST(:rowCnt, 5000)
```

## 7. 작업 항목

| ID | 내용 | 크기 | 레인 | 선행 |
|---|---|---|---|---|
| M1 | `Modal.closeOnClickOutside`, `SqlCodeEditor` 큰 창 `false`, 스킬 `references/components/modal.md` | S | fe-shared | 없음 |
| M2 | 모달 순서표·`closeOnEscape={isTop}`·Tab 가두기 맨 위만 | M | fe-shared | 없음 |
| M3 | `DateRangePicker` 등록 + 스킬 문서·색인 | S | fe-shared | 없음 |
| M4 | `AgDataGrid.pinnedBottomRows` + 스킬 문서 | S | fe-shared | **사용자 승인**(§10) |
| B1 | `QueryParam`·`QueryParams` 2판(형 2개, 이름 집합, 상대 날짜, 한도, 값 배열) | L | be | 이 문서 |
| B2 | `SqlGuard` IN 자리 제한, 목록 바인드, 캐시 키 정규화 | M | be | B1 |
| B3 | `QueryCodeLookup`·`SecCodeItemService` 구현, 저장·실행 확인 | M | be | B1 |
| B4 | `validateColumns` 2판, `paramsView` 새 키 | S | be | B1 |
| B5 | V14 `MODULE_CD`, 엔티티·DTO·`search`·`myList`·`getDef` | M | be | 없음 |
| B6 | `USRQ_CTG` 항목 9개 시드 | S | be | 없음 |
| B7 | V15 견본 8개, `UserQuerySampleSeeder`, 견본 시험 | M | be | B1~B6 머지, F1~F7 머지 |
| F1 | `format.ts` 2판(형·파서·검사·값 모양·`resolveDateDefault`·`formatMask`·`columnSums`) | L | fe-mcm | 이 문서 |
| F2 | `ConditionField` 기간·다중·코드 select, `use-code-options.ts`. `ConditionBar` Enter 조회에서 콤보 입력 칸(다중 선택)은 뺀다 | M | fe-mcm | F1, M3 |
| F3 | `ParamsEditor` 칸 추가(코드 그룹, 끝 이름, 끝 기본값, 개수 이름, 최대 일수) | M | fe-mcm | F1 |
| F4 | `ColumnsEditor` 칸 추가(서식, 합계(`allowSum`), 코드 그룹, 배지) | S | fe-mcm | F1 |
| F5 | `toColumnDefs` 서식·코드 표시, `RunPane` 합계 줄(M4 또는 대안 글줄), 위젯 표 코드 이름 | M | fe-mcm | F1, F4 |
| F6 | 위젯 `useQueryData`·`api.ts` 배열 값, 캐시·확정 값 | M | fe-mcm | F1 |
| F7 | 모듈 UI(관리 조회조건·목록·정의, 사용자 왼쪽), `_userq/types.ts`·`api.ts` | M | fe-mcm | 계약 §4 |

## 8. 레인

| 레인 | 항목 | 소유 경로 | 금지 경로 |
|---|---|---|---|
| fe-shared | M1~M4 | `src/frontend/shared/src/components/{modal.tsx,modal.css,modal-stack.ts}`, `…/code-editor/SqlCodeEditor.tsx`, `…/form/{DateRangePicker.tsx,index.ts}`, `…/grid/{AgDataGrid.tsx,grid-types.ts}`(M4 만), `shared/tests/unit/**`(새 시험), shared `tsup.config.ts`·`package.json`(필요 시), `.claude/skills/mantine-aggrid-ui/**` | `src/frontend/m-*/**`, `src/backend/**` |
| be | B1~B7 | `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/{widget/query,userq}/**`, 같은 경로 `src/test/**`, `…/db/migration/oracle/mcmapuser/V14__*`·`V15__*`, `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/{UserQueryCategoryCodeSeeder,UserQuerySampleSeeder}.java`, `DataInitializer.java`(시더 호출 한 줄), `mcm/api/src/main/resources/services/cmq/*.bpmn`, `mcm/api/src/test/**`(UserQuery·골든) | `src/frontend/**`, `…/job/**`, V1~V13 |
| fe-mcm | F1~F7 | `src/frontend/m-mcm/widget-types/_query/**`, `…/widget-types/query-table/**`, `src/frontend/m-mcm/page-components/{_userq,cmq/userQuery,cmq/userQueryMng}/**` | `src/frontend/shared/**`, `src/backend/**`, `…/csa/jobSchedMng/**` |

- 계약이 먼저다. 이 문서의 §2·§4 가 계약이다. 세 레인은 함께 시작한다. FE 는 BE 머지 전에는 §2·§4 모양의 가짜 응답으로 시험한다.
- 머지 순서: fe-shared → be(B1~B6) → fe-mcm → be(B7). F2 의 기간 칸은 fe-shared 머지 뒤에 붙인다. M4 승인이 없으면 F5 는 대안 글줄로 머지한다.
- B7 은 be 레인의 두 번째 커밋이다. 견본이 새 형을 쓰므로 FE 머지 뒤 브라우저로 8개를 모두 연다.
- `SqlCodeEditor.tsx` 는 fe-shared 만 고친다. `format.ts` 는 fe-mcm 만 고친다.

### 8.1 보안 검토(opus · xhigh)

- B1: 배열 값 받기(이름·형 일치, 원소 한도, NUL), 상대 날짜 해석(자릿수 상한, 넘침 없음), 기간 검사, `countName` 을 요청에서 읽지 않음
- B2: IN 자리 확인이 가린 SQL 로만 판정하는지, 빈 목록을 바인드하지 않는지, 펼친 SQL 에 사후 자리표시자 검사(`requireNoLeftoverPlaceholders`)가 그대로 도는지, 캐시 키 정규화
- B3: 조회가 정적 SQL·바인드인지, 보관 크기 상한, 존재 여부를 오류 문구로 흘리지 않는지
- B7: 견본 SQL 이 모두 `SqlGuard` 를 지나는지, `SQL_TEXT` 를 고르는 견본이 없는지

## 9. 시험(바뀐 범위만)

| 레인 | 시험 |
|---|---|
| fe-shared | shared vitest: 겹친 모달 Esc 두 번(위 → 아래 순서), 한글 조합 중 Esc 무시, `data-mantine-stop-propagation` 존중, 모달 하나는 동작 같음, `closeOnClickOutside={false}` 바깥 누름 무시·기본값 닫힘, 큰 SQL 창 바깥 누름 유지, `DateRangePicker` 값·오류 모양, (M4) 고정 행 전달. 기존 `modal-a11y`·`mantine-modal`·`hover-tip-modal-escape`·`message-provider` 시험 무수정 통과. shared build. 브라우저: 위젯 관리 SQL 큰 창 위에 확인 창 → Esc 두 번 |
| be | `./gradlew :mcm-core:test --tests '*QueryParams*' --tests '*SqlGuard*' --tests '*WidgetQuery*' --tests '*UserQuery*'`, `:mcm:api:test --tests '*UserQuery*' --tests '*DataInitializer*'`(골든 2종 재생성), oasis-contract-check, 레인 PDB `L_<레인>` 에 V14·V15 적용. 사례: 기간 해석·순서·최대 일수, 상대 날짜 표(§2.2), multi 0·1·100·101개, 배열 → 비 multi 거절, `IN` 밖 multi 거절, `[null]` 바인드, `countName` 값 무시, 코드 그룹 없는 값 거절, `mask`·`sum` 형식 제약, `moduleCd` 검사·조건, 기존 위젯 시험 무수정 통과. B7: 견본 8개마다 저장 검사(`validateSql`·`QueryParams.parse`·`validateColumns`·`queryId` 형식) + 기본값 `run` 성공(Oracle PDB) |
| fe-mcm | m-mcm vitest(`_query` 전부, `_userq`, `cmq/*`): 상대 날짜 표(§2.2), `formatMask`, `columnSums`, `paramsOf`·`tableConfigOf` 왕복에서 새 키 보존, `cleanValues` 배열, `paramUsageNotes` 가 `toName`·`countName` 을 선언으로 봄, 모듈 거르기. `pnpm build`. 브라우저: 기간·다중·코드 칸, 합계 줄, 배지, 모듈 거르기, 위젯 하나에 기간 조건을 달아 실행 |

브라우저 확인은 ego-browser 로 하고, 끝나면 연 작업 공간을 닫는다.

## 10. 미결

1. **M4 승인(대안 있음, 레인을 막지 않음)**: shared `AgDataGrid` 에 선택형 prop `pinnedBottomRows` 를 더해도 되는지. 승인이 없으면 합계는 그리드 아래 글줄로 보인다(§1.4).
2. 모듈 이름표(공통·기준정보·생산·물류·품질·APS)가 맞는지. 확인 전에는 이 이름표로 진행한다.
