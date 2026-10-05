# MDM 화면 메타 (MdmMetaProvider · useMdmColumn · MdmMetaCard · MdmFieldLabel · useMdmValidation)

그리드 머리글·폼 라벨·상세 표(th) 라벨의 캡션과 툴팁을 MDM 컬럼 사전에서 가져오고, 입력값을 MDM 정의(필수·형식·길이·허용 코드·표준식)로 즉시 검사할 때 쓴다. 포털 탭이 공급자를 자동으로 씌우므로 캡션·툴팁은 화면이 아무것도 하지 않아도 붙는다. 값 검사는 화면이 켠다.

- import: `import { MdmMetaProvider, useMdmColumn, useMdmColumns, MdmMetaCard, MdmFieldLabel, mdmCardHasHtml, resolveCaption, toPhysName, useMdmValidation, validateMdmValue, codePointLength } from "@dk-oasis/shared/mdm-meta";` (CSS import 없음. 툴팁 모양은 호스트가 싣는 `@dk-oasis/shared/form.css` 의 `.form-tip-text` 를 쓴다)
- 서버 오류 → 칸 오류: `import { toFieldErrors } from "@dk-oasis/shared/http";`
- 소스: `src/frontend/shared/src/mdm-meta/`(`context.tsx`·`store.ts`·`caption.ts`·`names.ts`·`MdmMetaCard.tsx`·`MdmFieldLabel.tsx`·`validate.ts`), `src/frontend/shared/src/components/form/useHoverTip.tsx`(FormGroup·MdmFieldLabel·그리드 머리글 라벨 MdmHeaderLabel 이 함께 쓰는 내부 포털 툴팁 — 화면은 직접 쓰지 않는다), `src/frontend/shared/src/components/grid/MdmHeaderLabel.tsx`(HTML 설명 열의 그리드 머리글 라벨, 내부용), `src/frontend/shared/src/components/hover-tip-escape-guard.ts`(모달 안 Escape 보호 가드, 내부용 — useHoverTip·modal.tsx 가 설치), `src/frontend/shared/src/http/index.ts`(`toFieldErrors`)
- 설계: `docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md` §2 B1~B8·C1·C2·C5·C9, §4, §5
- 받는 곳: 업무 BE `POST /api/{module}/mdmMeta/columns`(본문 `{"names":[…]}`)·`/domains`(본문 `{"domainIds":[…]}`). 한 화면에서 등록한 이름을 16ms 동안 모아 모듈마다 한 번 부르고, 받은 것은 5분 둔다. 404·401·403·연결 실패면 그 모듈은 세션 동안 메타 없이 두고 다시 부르지 않는다(401 에도 로그인 화면으로 보내지 않는다). 포털 탭 모듈 표 `MDM_META_TAB_MODULES`(`mdm-meta/context.tsx`, portal-shell 이 `mdmMetaTabProps(pageId)` 로 공급자에 넘긴다)가 두 모듈을 다룬다. `mdmMeta` 엔드포인트가 없는 `analog` 탭은 공급자를 미리 꺼(`disabled`) 요청 자체를 보내지 않는다(2026-10-05 F7). `mdm` 탭은 끄지 않는다 — MDM 서버는 `/api/mdm/mdmMeta` 가 404 라서 `mdm`→`mcm` 으로 `/api/mcm/mdmMeta`(같은 사전)에서 받는다(2026-10-05). 캡션 우선순위는 그대로 explicit 이다. 새 업무 모듈이 cactus `mdmMeta` 를 켜지 않으면 그 표에 `null`(끔)로 넣는다. 끈 탭 안에서 `MdmMetaProvider module="mls"` 처럼 다른 모듈로 덮어쓰려면 `disabled={false}` 를 함께 준다(`disabled` 는 바깥 값을 물려받는다).

## 언제 쓰나

- 쓴다: 그리드 `header`·폼 `label` 을 표준 용어(MDM)로 맞추고 싶을 때 — 새 화면은 그냥 비운다. 기존 화면을 표준 캡션으로 바꿀 때는 header 를 지우지 말고 `captionPriority="mdm"` 을 쓴다(대체 캡션 유지). 화면이 직접 메타를 읽어 표시할 때 `useMdmColumn`. 화면 고유 위치에 MDM 정보 카드를 띄울 때 `MdmMetaCard`. **상세 표(th/td)의 라벨은 `MdmFieldLabel`** — 캡션과 hover·focus 툴팁이 함께 붙는다.
- 쓴다(값 검사): 폼은 `useMdmValidation()` 결과를 `FormGroup error` 로, 그리드는 `mdmValidate`, 저장 전 전체 검사는 `validateRows`, 저장 실패는 `toFieldErrors` → 그리드 `fieldErrors`·폼 `error`.
- 쓰지 않는다: 값 검사에 `useMdmColumn` 으로 메타를 읽어 길이·필수를 손으로 비교하지 않는다 — `useMdmValidation` 이나 `validateMdmValue(column, value)`(같은 판정)가 서버와 같은 판정·문구를 낸다. 비즈니스식(업무 규칙)은 화면에서 검사하지 않는다(서버 `MdmValidator` 몫).
- [ag-data-grid](ag-data-grid.md)·[form-group](form-group.md) 은 이 공급자를 스스로 읽는다. 조회 영역 [SearchField](search-area.md) 도 `name`(필요하면 `meta`)을 주면 같은 `MdmFieldLabel` 규칙으로 라벨 카드 툴팁을 띄운다(`name` 이 없으면 메타를 부르지 않는다). 메타 라벨 요청은 store 가 같은 틱 요청을 묶는다. 머리글·라벨에는 이 문서의 훅을 따로 쓰지 않는다. `FormGroup` 을 쓰지 않는 상세 표(th/td) 라벨만 `MdmFieldLabel` 로 잇는다.

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
- 라벨 글자가 툴팁 트리거지만 Tab 순서에는 들지 않는다(`tabIndex` -1). 입력 화면에서 Tab 이 라벨마다 멈추지 않게 하려는 것이다. 툴팁은 마우스 hover 로 연다.

### HTML 설명·상호작용 툴팁(2026-10-03)

MDM 이 컬럼 설명을 HTML 로 저장하면 화면 메타(`MdmScreenColumn`)에 `descriptionHtml` 이 실린다. 값은 MDM 서버가 소독한 HTML 이고, 그때 `description` 은 거기서 뽑은 글자다. 일반 글 설명이거나 옛 모듈 응답이면 `null`(또는 칸 없음)이다. `usageNote` 는 늘 글자다. 화면은 할 일이 없다 — 카드와 툴팁이 알아서 바뀐다.

- 카드(`MdmMetaCard`)는 HTML 을 우선한다. 브라우저에서 `sanitizeNoticeHtml`(notice-body-view 의 DOMPurify 소독)로 **한 번 더** 소독한 결과만 넣는다. script·style·on* 속성·인라인 style·http/https 가 아닌 링크는 빠지고, 링크는 새 탭(`target="_blank" rel="noopener noreferrer"`)이다.
- 설명 칸은 `data-mdm-section="description"` 그대로이고, HTML 을 그리면 `data-mdm-html="true"` 가 붙는다. 사용 메모는 HTML 아래 글자로 둔다.
- HTML 카드인지는 **소독 결과에 보이는 내용(글자·그림)이 있는가**로 정한다(`mdmCardHasHtml`·`mdmCardSafeHtml`, 문자열별 캐시). 소독할 수 없거나(서버 렌더 — 하이드레이션 뒤 HTML 로 바뀐다) 소독 뒤 보이는 게 없으면(`<script>` 만, `<p><br></p>`) 모양·동작까지 글자 카드이고 `description` 글자를 그린다. 이 대체 글자는 서버가 블록 경계에 넣은 줄바꿈을 살린다(`white-space: pre-line`).
- 모양: HTML 카드만 최대 폭 640px(`MDM_META_CARD_HTML_MAX_WIDTH`), 설명 칸은 최대 높이 60vh(`MDM_META_CARD_HTML_MAX_HEIGHT`)에 세로 스크롤. 문단·목록·표·그림 서식은 카드가 `<style href precedence>` 로 문서 머리에 한 번 싣는다(색은 툴팁 글자색을 따른다). **일반 글 카드는 모양·크기·동작이 예전 그대로다.**
- 상호작용 툴팁: HTML 카드를 띄울 때만 마우스가 툴팁 안으로 들어갈 수 있다(링크 누르기·스크롤).
  - `FormGroup`·`MdmFieldLabel`(내부 `useHoverTip` interactive): 상자 `data-tip-interactive="true"`·최대 폭 640px. **hover 로 열었을 때만** `pointer-events:auto` 이고, 키보드 focus 로만 열면 none(가려진 이웃 입력을 그대로 누를 수 있다 — 이어 마우스가 트리거에 들어오면 auto). 트리거를 떠나도 150ms(`HOVER_TIP_GRACE_MS`) 유예하고 그 사이 상자에 들어가면 유지, 상자를 나가면 유예 뒤 닫힌다(카드 안 링크에 focus 가 있어도 같다). blur 때: hover 로 연 카드는 마우스가 상자 안이면 유지하고 밖이면 유예 뒤 닫힌다. focus 로만 연 카드(마우스를 받지 않는다)는 blur 즉시 닫힌다. Escape 로 닫힌다 — 모달(Mantine Modal·shared `Modal`) 안에서는 카드가 열려 있을 때 누른 Escape 가 카드만 닫고 모달은 닫지 않는다. focus 가 어디 있든(입력·카드 안 링크·body·드롭다운을 닫은 ComboBox) 같고, 카드가 여럿이면 마지막 카드가 닫힐 때까지 같다. 다음 Escape 는 모달을 닫는다. 방식: 내부 가드 모듈(`components/hover-tip-escape-guard.ts`)이 window 캡처 keydown 리스너를 페이지에 하나 단다. shared `Modal` 모듈과 `useHoverTip` 모듈이 읽힐 때 설치하므로 modal·ui-provider·message-provider·portal-shell 묶음에도 들어가, 루트 레이아웃의 모달(ModalsProvider·MessageModal)을 포함한 Mantine 모달 리스너보다 먼저 등록된다(같은 단계 리스너는 등록 순서대로 돈다 — shared 를 거치지 않고 Mantine Modal 을 직접 띄우는 곳이 가드 묶음보다 먼저 마운트되면 예외). 열린 카드가 있을 때 누른 Escape 의 대상에만 그 순간 Mantine 의 `data-mantine-stop-propagation` 표지를 달고 이벤트가 끝나면 자기가 단 것만 걷는다 — Mantine Combobox 가 관리하는 표지는 건드리지 않는다. 카드가 닫혀 있거나 글자 카드면 Escape 는 예전처럼 모달을 닫는다(열린 드롭다운은 드롭다운만 닫힌다). 화면 안에 들도록 상자 높이를 줄이고 넘치면 상자 안에서 스크롤한다. 위쪽 공간 판정은 큰 카드(60vh+120px)로 한다. 화면이 `FormGroup tip` 을 주면 HTML 메타가 있어도 예전 툴팁이다.
  - 스크린리더 사본(`.form-sr-only`, `aria-describedby`)은 HTML 이 아니라 `description` 글자다(`MdmMetaCard textOnly`) — 보이지 않는 링크가 Tab 순서에 들지 않게.
  - 카드 안 키 입력(링크에 focus 가 있을 때의 Enter 등)은 React 트리를 따라 카드를 띄운 부품의 조상(화면의 onKeyDown 핸들러)까지 올라간다. 그리드는 ↑↓ 행 이동을 건너뛰고, Escape 는 위 규칙대로다. 그 밖의 화면 키 처리는 막지 않는다.
  - `AgDataGrid`: HTML 카드 열은 ag-grid 머리글 툴팁 대신 **기본 머리글의 안쪽 라벨**(`innerHeaderComponent` = 내부 `MdmHeaderLabel`)이 캡션을 그리고, 그 라벨에 마우스를 올리면 폼과 같은 포털 상호작용 카드(위 규칙 그대로 — 화면 안 위치·높이 상한·150ms 유예·Escape)가 뜬다. 카드는 ag-grid 머리글 툴팁과 같은 지연(그리드 `tooltipShowDelay`, 정하지 않았으면 500ms — `GRID_TOOLTIP_SHOW_DELAY_MS`) 뒤에 뜨고, 그 전에 떠나면 뜨지 않는다. 라벨을 누르면(정렬·끌기 시작) 대기를 취소하고 열린 카드를 닫는다. 버튼을 누른 채 지나가면(열 끌기 중)·터치로 탭한 뒤 브라우저가 흉내 내는 mouseenter 로는(태블릿에서 캡션을 탭해 정렬) 열지 않는다(폼 라벨은 예전 그대로). 정렬·필터 아이콘·누름 정렬·열 끌기는 ag-grid 기본 머리글 그대로다. 말줄임을 위한 감싸개 규칙(display:contents)은 라벨이 스스로 싣는다. **그리드 `tooltipInteraction` 은 쓰지 않는다** — 같은 그리드의 셀 툴팁·검증 오류 툴팁·글자 머리글 카드는 HTML 설명 열이 없는 그리드와 같은 비상호작용 툴팁이다. 표시 이름이 빈 열(`header: ""`)은 라벨을 달지 않고 글자 머리글 카드(칸 전체)로 둔다. 카드가 뜨는 영역은 머리글 칸 전체가 아니라 **캡션 글자(라벨)** 로 좁다(글자 MDM 카드는 예전처럼 칸 전체, 같은 `tooltipShowDelay` 지연). 화면이 `headerComponentParams` 를 주면 `innerHeaderComponent` 만 더하고, 화면이 `innerHeaderComponent` 를 이미 줬으면 손대지 않고 글자 머리글 툴팁(`MdmGridTooltip`, 늘 `textOnly`)으로 둔다. 메타가 그리드를 만든 뒤 와서 라벨이 생기거나 빠지면 머리글을 한 번 다시 만든다(`refreshHeader` — HTML 열이 생기는 그리드에서만, 그때 화면의 상태 있는 머리글 컴포넌트도 한 번 다시 마운트된다). 카드 안 ↑↓ 는 그리드 행 커서를 옮기지 않는다. 라벨의 `aria-describedby`(글자 사본)는 마우스·보조기기 탐색 모드용이다 — 키보드 focus 는 ag-grid 머리글 칸으로 가므로 이 설명이 읽히지 않을 수 있다. 머리글 칸의 키보드 지원(focus 로 카드 띄우기 포함)은 범위 밖이다.
- 화면이 카드를 직접 쓸 때 HTML 카드 여부는 `mdmCardHasHtml(column)`.

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
| textOnly | `boolean` | `false` | 설명을 HTML 대신 `description` 글자로 그린다 — 스크린리더용 숨은 사본에 쓴다. 일반 글 카드에는 영향 없음 |

순서: 제목(`labelLong`)+물리명 → 설명·사용 메모 → 형식(`STRING(20)`·`NUMBER(3,1)`)·필수·기본값 → 도메인(ID·종류)·단위 → 표준식 → 허용 코드 앞 10개("외 N개") → 서버 업무 규칙 안내. 글자색·배경은 감싸는 툴팁을 따른다. 컬럼이 시스템 별칭으로 맞았으면(`MdmScreenColumn.matchedSystem`·`systemPhysName` 이 둘 다 있으면) 제목 바로 아래에 "MES 이름 {별칭} · 표준 {physName}" 한 줄(`data-mdm-section="alias"`)이 더해진다 — 표준 이름으로 맞았거나 옛 모듈 응답(두 칸 없음)이면 그 줄이 없다. 설명이 HTML(`descriptionHtml`)이면 위 §HTML 설명·상호작용 툴팁.

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

툴팁(메타가 있을 때): 글자 `span.form-tip-trigger` 에 마우스를 올리거나 포커스가 들어오면 `document.body` 에 `.form-tip-text.form-tip-text--portal`(position: fixed, 최상단)로 `MdmMetaCard` 가 뜬다. 위치·위/아래 판정·가장자리 보정은 `FormGroup` 과 같고, 앵커는 라벨 글자다. 스크린리더 설명(`aria-describedby`)은 body 로 포털한 `.form-sr-only` 에 두어 th 글자와 접근 이름을 늘리지 않는다. 상자 폭은 form.css 의 `.form-tip-text`(최소 220px·최대 320px, 위치는 오른쪽 가장자리에서 안쪽으로 당겨 최대 폭을 확보)가 정한다. HTML 설명 카드만 예외로 최대 폭 640px 의 상호작용 툴팁이다(§HTML 설명·상호작용 툴팁).

## 표준값: 모든 화면 동일

- 화면은 공급자를 직접 두지 않는다(포털 탭이 둔다). 우선순위를 바꿀 때만 `MdmMetaProvider captionPriority="mdm"` 를 둔다.
- 연결 키는 그리드 `key`·폼 `name`·`MdmFieldLabel name`·`SearchField name` 을 물리명으로 바꾼 값이다. SearchField 는 필터 키(`edt_`·`cbo_`)에서 이름을 추론하지 않으니 업무 키를 적는다. 맞지 않으면 `meta="물리명"`, 엉뚱하게 맞으면 `meta={false}`.

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
| `column.descriptionHtml` 을 화면에서 `dangerouslySetInnerHTML` 로 직접 그린다 | `MdmMetaCard` 를 쓴다 — 브라우저 소독·폭·스크롤·글자 대체가 들어 있다. HTML 이 따로 필요하면 `sanitizeNoticeHtml` 을 거친다 |
| HTML 설명 툴팁이 안 닫힌다고 상자를 `pointer-events: none` 으로 덮는다 | 마우스가 들어가는 게 의도다. 나가면 150ms 뒤, 또는 Escape 로 닫힌다(그리드도 같은 포털 카드) |

## 실제 사용 예

- `src/frontend/shared/src/portal-shell/portal-shell.tsx` `TabPageSlot`: 탭 본문을 `MdmMetaProvider` 로 감싼다.
- 화면 파일럿: `src/frontend/m-mls/pages/lsh/noticeMgmt/`(2026-10-03)
  - `notice-columns.tsx`: `TITLE` 열은 대체 `header`("제목")를 두고, 화면(`page.tsx` 의 default export)이 `MdmMetaProvider captionPriority="mdm"` 으로 감싸 MDM 이 있으면 MDM 캡션·머리글 툴팁이 이긴다. 파생 열(`CATEGORY_LABEL` 등)은 header 를 적고 `meta: false` 로 연결을 끈다.
  - `NoticeTitleRow.tsx`: 상세 표(th/td) 제목 줄 — 라벨은 `MdmFieldLabel`(캡션 + 올리면 MDM 카드 툴팁), 입력 중 검사는 같은 `column` 으로 `validateMdmValue` → `Input error`(MDM 장애 중에도 요청은 등록 한 번).
  - `page.tsx`: 저장 전 `validateRow` 로 막고, 저장 실패는 `toFieldErrors(e, "master")` → 칸별 `error`(고치면 지운다). 그리드에 `mdmValidate`(목록이 읽기 전용이라 지금은 검사할 칸이 없다).
  - `api.ts`: `NoticeApiError.errors` 에 OASIS 봉투의 `errors` 를 실어 `toFieldErrors` 가 읽게 한다.
  - 시험: `m-mls/tests/lsh/noticeMgmt/notice-page-mdm.test.ts`(화면 전체), `notice-mdm-render.test.ts`(제목 줄·그리드 캡션·라벨 툴팁).
