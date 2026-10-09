---
name: mantine-aggrid-ui
description: Mantine 9(@mantine/core · dates · hooks · modals · notifications) 또는 ag-grid-community 33(ag-grid-react, AgGridReact, ColDef, rowSelection, 그리드 테마)으로 React/Next.js 화면·컴포넌트를 만들거나 고칠 때, prop·옵션이 설치 버전에서 유효한지 확인해야 할 때, 옛 API(Collapse in, Grid gutter, Text color, createStyles, leftIcon, rowSelection="multiple", checkboxSelection, ag-grid.css)를 옮기거나 타입 오류·동작 안 함을 고칠 때 사용한다. DMES src/frontend(shared, m-*) 의 화면·그리드 작업에는 shared 래퍼 규칙 확인용으로 항상 함께 적용한다.
---

# Mantine 9 · ag-grid-community UI 개발

## 원칙

- **확인된 API 만 쓴다.** 기억 속 Mantine 은 v6~v8, ag-grid 는 v25~v36 이 섞여 있다. 확인하지 못한 prop·옵션·import 는 만들어 내지 말고 "미확인"으로 보고한다.
- 근거의 우선순위는 **설치본 `.d.ts` → 설치 버전 문서 → 최신 문서 → 기억** 순이다. mantine.dev 와 ag-grid.com 은 최신 릴리스를 따르므로 설치 버전과 다를 수 있다.
- **프로젝트 규칙이 라이브러리 문서보다 우선한다.** DMES 에서는 §3 을 먼저 본다.

## 1. 작업 분기 — 하나만 고른다

| 작업 | 진행 |
|---|---|
| DMES 화면(`m-*`) 새로 만들기·고치기 | [screen-patterns.md](references/screen-patterns.md) 에서 화면 유형을 고르고 `references/examples/` 예제를 복사한다 → 요소별 세부는 [components/llms.txt](references/components/llms.txt) 색인 → §3 |
| 새 화면·상세 폼·목록 조회를 만들거나 고침 | 성능 규칙을 먼저 읽는다: [화면 성능 가이드](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) 의 「새 화면 만들 때 하지 말 것」 표 → [screen-patterns.md](references/screen-patterns.md) §성능 기본 구조(첫 조회 상한·상세 폼 분리·안정 참조 열 정의) → §4 검증의 성능 점검 |
| 홈 위젯(`WidgetWorkspace`)·위젯 본체(`m-mcm/widgets/`)·위젯 유형(`widget-types/`)을 만들거나 고침 | [components/widget.md](references/components/widget.md)(§성능 규칙 포함) → 행 단위 현황판이면 [dashboard.md](references/components/dashboard.md). 위젯 본체도 화면과 같은 성능 규칙을 따른다: [가이드 R13~R16·R7](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md). 포털 머리 「도구」 로 띄우는 업무 화면 도구 창은 [widget-dock.md](references/components/widget-dock.md)(위젯 메타 `floatable`), 범용 떠 있는 창은 [floating-window.md](references/components/floating-window.md). 포털 탭을 단독 창으로 분리해 띄우는 `/popup` 라우트는 [portal-page-window.md](references/components/portal-page-window.md). 업무 화면 값(그리드 선택 행)을 도구 창 위젯이 받거나 위젯 값을 화면에 넣는 통로(`screenContext`·`screenApply`·그리드 `publishScreenContext`·`acceptScreenApply`)는 [screen-context.md](references/components/screen-context.md) |
| 조회 화면이 포털 탭 「새 창으로 분리」 때 조회 조건·결과·선택 키를 재조회 없이 이어받게 함 | [components/use-carry-state.md](references/components/use-carry-state.md)(`useCarryState`·`useCarryRefetch`·`useCarryRestored`, 화면 치환 규칙 포함). 가이드: [Local-Rules §40](../../../docs/guide/FrontEnd/Local-Rules.md) |
| 특정 shared 컴포넌트 사용법 | `U get <이름>` (예: `U get AgDataGrid`) |
| Mantine 컴포넌트를 화면에 쓰고 싶음 | [mantine-catalog.md](references/mantine-catalog.md) 에서 대응 래퍼를 찾는다. 래퍼가 없으면 shared 에 새 래퍼를 등록한다(아래 행) |
| 화면에 쓸 새 UI 부품(입력 칸·편집기·표시 부품·도구 막대)을 만들어야 함 | 화면 폴더에 만들지 않는다. Part B §18 절차로 shared 에 등록하고 이 스킬에 컴포넌트 문서를 더한다 → §4 검증(0번 포함) |
| shared 래퍼·테마·`grid.css` 수정 | §2 조회 → 구현 → §4 검증 |
| 쓸 Mantine 컴포넌트를 모름 | `M search <단어>` → `M get <이름>` |
| ag-grid 기능·옵션 구현 | [references/aggrid.md](references/aggrid.md) 먼저, `A search` → `A get <slug>` → `A types <옵션>` |
| 옛 코드 이관 · 타입 오류 · "설정했는데 동작 안 함" | [mantine-v9-changes.md](references/mantine-v9-changes.md) · [aggrid.md](references/aggrid.md) §2 → `audit` → 해당 문서 |
| Combobox 원시 컴포넌트 · 커스텀 컴포넌트(factory) | 공식 스킬: `M official combobox` · `M official custom-components` (+ `api`/`patterns`) |
| `@mantine/form` 폼 | 공식 스킬 `M official form`. **DMES 에는 `@mantine/form` 이 없다.** 의존성 추가는 사용자 확인 후에만 |

## 2. 문서 조회

아래와 본문의 `M <명령>` 은 `node $D/mantine_docs.mjs <명령>`, `A <명령>` 은 `node $D/aggrid_docs.mjs <명령>`, `U <명령>` 은 `node $D/ui_docs.mjs <명령>`(DMES shared 컴포넌트 문서: `index`·`get`·`full`·`coverage`·`check-examples`)을 줄여 쓴 것이다. 두 라이브러리 모두 `llms.txt` 색인 + 페이지별 Markdown 을 제공한다(PrimeReact 와 같은 방식). 조회는 스크립트로 하고, 결과는 `~/.cache/` 에 7일간 캐시한다. **WebFetch 는 쓰지 않는다.** 요약 모델이 Props 표와 예제를 뭉개고, ag-grid.com 은 요청 자체를 403 으로 막는다.

```bash
D=.claude/skills/mantine-aggrid-ui/scripts          # 저장소 루트 기준
node $D/mantine_docs.mjs version ; node $D/aggrid_docs.mjs version
node $D/mantine_docs.mjs search date input        # mantine.dev/llms.txt 색인
node $D/mantine_docs.mjs get DatePickerInput --section Props
node $D/mantine_docs.mjs grep 'rowGap' -C 2       # llms-full.txt(4.5MB) 전문 검색 — 통째로 읽지 않는다
node $D/aggrid_docs.mjs search row selection      # ag-dev 공식 슬러그 색인
node $D/aggrid_docs.mjs get row-selection-multi-row   # 설치 버전(archive/33.3.2) 문서를 텍스트로
node $D/aggrid_docs.mjs get formula --latest      # 최신 문서(도입 버전 확인용)
node $D/aggrid_docs.mjs types rowSelection        # 설치본 .d.ts 정의와 JSDoc(@agModule)
node $D/aggrid_docs.mjs recommendations           # 공식 ag-dev 의 LLM 흔한 실수
```

- 알려진 컴포넌트·옵션은 `search` 없이 바로 `get` 한다. 한 컴포넌트에 조회 1~2회면 충분하다.
- Mantine 문서가 설치 버전보다 앞선 API 를 보이면 `.d.ts` 로 확인한다: `grep -n "expanded" src/frontend/node_modules/.pnpm/@mantine+core@*/node_modules/@mantine/core/lib/components/Collapse/Collapse.d.ts`.
- ag-grid 는 `A get` 이 404 를 내면 설치 버전에 없는 기능이다. 최신 문서 예제를 그대로 옮기지 않는다.

## 3. DMES 계층 (src/frontend 작업)

**구현 전에 읽는다:** `docs/guide/FrontEnd/README.md` 의 읽기 순서, 특히 `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md`(허용 export·금지 사항)와 `docs/guide/FrontEnd/UI-Visual-Standard.md`(토큰·크기·그리드·토스트). **허용·금지 같은 정책**은 가이드가 정본이고, **props 이름·모양 같은 API**는 shared 래퍼 소스가 정본이다(가이드의 예제 코드가 소스와 다르면 소스를 따르고 차이를 보고한다). 화면의 **모습을 통일하는 고정값**(버튼 순서·문구, 패널 폭, 열 폭, 메시지 문구 등)은 [screen-patterns.md](references/screen-patterns.md) 가 정한다. audit 가 강제하는 규칙 목록은 `docs/guide/FrontEnd/README.md` §자동 점검에 있다.

- **화면 모듈은 `@mantine/*`, `ag-grid-react`, `ag-grid-community` 를 import 하지 않는다**(Part B §4-2·§6·§17). `Group`·`Stack`·`Collapse` 같은 배치 요소도 예외가 아니다. Mantine 은 호스트 root layout 과 `shared` 안에서만 쓴다.
- 화면은 `@dk-oasis/shared/*` 만 쓴다:

| 필요 | 쓸 것 |
|---|---|
| 화면 골격·상단 버튼 바(조회·저장·초기화) | `layout`: `PageLayout` (`buttons`), `ContentBody`, `ContentPanel`, `LayoutContextBoundary`(독립 영역이 바깥 ContentBody 규격을 받지 않게 끊는 경계. WidgetFrame 이 위젯 본문에 이미 적용). 좌우·상하 분할(`ContentPanel`/중첩 `ContentBody` 2개 이상)은 `resizable`+`storageKey` — Part B §4-3 |
| 조회조건 | `layout`: `SearchArea`, `SearchField` (`label="~"` 은 앞 필드와 기간 쌍). 날짜는 `type="date"`, 진입 자동 조회는 `autoSearch`(마운트 effect 금지), 조건을 비우는 칸은 `dependsOn` 선언. 사용자 기본값은 화면이 선언만 한다([search-area](references/components/search-area.md) §사용자 기본값) |
| 입력·선택·날짜·버튼 | `form`: `Button`, `Input`, `Select`, `ComboBox`, `DatePicker`, `Textarea`, `Checkbox`, `Radio` … |
| 상세 폼 입력을 화면 루트 재렌더 없이 받기(초안은 폼 안, 저장 전 `getDraft()`·`isDirty()`)·조회/저장 busy 를 키별로 분리 | `form`: `useDetailDraft`([문서](references/components/use-detail-draft.md)), `useBusy`([문서](references/components/use-busy.md)) — Screen-Performance-Guide R12·R5 |
| 데이터 그리드(모든 데이터 목록) | `grid`: **`AgDataGrid` 하나만**. 제목·건수·버튼 툴바가 필요하면 `<GridPanel>` 안에 넣는다. GridPanel 밖 그리드도 늘 머리줄(그리드명)을 가지므로 `title` 을 준다(위에 이름만 있는 구역 제목을 따로 두지 않는다). 저장형은 `useGridDataManager`. 열은 `GridColumn`, ag-grid `ColDef` 아님 |
| 엑셀 내보내기 | `utils`: `exportToExcel` (xlsx 기반 — ag-grid Excel Export(Enterprise)가 필요 없다). `AgDataGrid` 는 「그리드 설정」 메뉴(`GridPanel` 안·밖 모두 그리드 머리줄 — GridPanel 밖 그리드도 `title`·건수·설정 메뉴 머리줄을 스스로 그린다. 대화 상자 안은 메뉴에 엑셀 항목만. `header={false}` 면 머리글 줄 오른쪽 끝의 작은 아이콘)에 「엑셀 출력」 이 기본으로 있어(끄려면 `excelExport={false}`, 메뉴 전체는 `settingsMenu={false}`) 보이는 목록을 그대로 내려받는 단추는 따로 만들지 않는다 |
| 화면 한 영역을 잘림 없는 PDF 한 장으로(iframe 포함) | `utils`: `printElementAsPage`(브라우저 인쇄 — 인쇄 창에서 「PDF로 저장」, [문서](references/components/print-element-as-page.md)). 홈 위젯 화면은 `WidgetWorkspace` 의 `pdfTarget` |
| 메시지·토스트 | `message-provider` (Part B §9, UI-Visual-Standard §8) |
| 모달·트리·탭·룩업 | `modal`, `tree`, `tabs`, `lookup` |
| 여러 문서를 열어 두고 오가는 닫을 수 있는 탭(숨은 탭 상태·효과 유지) | `closable-tabs`: `ClosableTabs`(탭 머리 제목·● 변경 점·닫기 단추, 모든 패널 마운트 유지, ←/→·Delete, 닫기 확인은 화면이 `onClose` 에서). 닫지 않는 고정 보기 전환이면 `tabs` |
| 모양이 정해지지 않은 JSON 값 보기(캐시 값·설정·응답 본문) | `json-view`: `JsonView`(읽기 전용 접는 트리, `fill` 로 패널 남은 높이 채움) |
| crontab 5칸 식 입력(쉬운 설정·직접 입력·설명·다음 예정) | `cron-input`: `CronInput`(`preview`·`onRequestPreview` 로 서버 cronPreview 결과를 보인다), 순수 함수 `describeCron`·`validateCron`·`buildCron`·`toEasy` |
| 이름·형식·값 변수 표(실행 변수 안내 포함) | `variable-table`: `VariableTable`(`mode="valueOnly"` 는 값만 편집) |
| 24열 격자 단위 크기(위젯 가로×세로)를 미리 보면서 마우스로 끌어 정하기 | `grid-resize-box`: `GridResizeBox`(제어형 `size`·`areaWidth`·`onResizeEnd`, 오른쪽·아래·모서리 손잡이, 끄는 중 「12×8」 표시), 순수 함수 `gridBoxPx`·`snapGridSize` |
| 편집 화면에 카드 여러 장 쌓기(제목 줄 카드·함께 접는 묶음·흐린 보조 글) | `card`: `CardFrame`(제목 줄 + 본문), `CardGroup`(접어도 본문을 내리지 않음, `columns` 격자·`testIdPrefix`), `MutedText`. 그리드 툴바면 `GridPanel`, 대시보드면 `dashboard` |
| 그리드 밖에서 항목의 표시 여부·순서를 고르는 창(그리드 컬럼 설정은 AgDataGrid 가 스스로 연다) | `column-settings-modal`: `ColumnSettingsModal`(제어형 `opened`·`columns`·`onApply`·`onReset`·`onClose`, 잠금·내부 컬럼·고정 구역 규칙, 적용은 `{colId, hide}` 만). AgDataGrid 컬럼 개인화는 화면이 연결할 것이 없다(「그리드 설정」 메뉴의 「컬럼 설정…」(GridPanel 머리줄 또는 GridPanel 밖 그리드 머리글 줄 아이콘, 대화 상자 안에는 없음)·헤더 우클릭) |
| 후보에서 골라 묶음에 넣고 빼기(좌 가능·우 소속 전송 목록) | `transfer-list`: `TransferList`(제어형 `value`·`onChange`, 검색·분류 필터·Shift 범위·`>`/`>>`/`<`/`<<`, 배지·숨김·문구·testId 접두어는 props), 순수 함수 `visibleList`·`diffSets` 등. 한 건 고르기면 `lookup`·`ComboBox` |
| 서식 있는 설명(HTML) 편집 | `html-editor`: `HtmlEditor`(서식 모드 ↔ [HTML] 원문 모드, 스키마 밖 태그가 있으면 원문으로 열고 서식 손실은 확인, `maxLength` 는 경고만). 글 ↔ HTML 변환 `textToHtml`·`htmlToText`. 한 칸에 글·HTML 을 함께 받으면 `HtmlFormatField`(형식 선택 `글 \| HTML` + 글 Textarea·HTML 편집기, 판별 `detectFormat` 은 화면이 준다). 읽기만 하면 `notice-body-view` |
| 서식 있는 메모·설명(마크다운) 편집·표시 | `markdown-editor`: `MarkdownEditor`(편집기 — `editable` 로 읽기·편집 전환, 여닫기는 화면이 정함), `MarkdownField`(폼·패널 칸 — 고칠 수 있으면 처음부터 편집기, `fill` 로 남은 높이 채움), `MarkdownView`(읽기 전용), `MarkdownDocViewer`(목차 있는 긴 문서 — 도움말·가이드). 서식 없는 여러 줄 입력은 `form` 의 `Textarea` |
| 머리글·라벨 캡션과 툴팁을 MDM 컬럼 사전에서 | `mdm-meta`: 포털 탭이 `MdmMetaProvider` 를 자동으로 씌운다 — 그리드 `header`·폼 `label` 을 **생략**하면 MDM 캡션, 메타 툴팁(`MdmMetaCard`)은 자동. 다른 물리명은 `meta`, 끄기는 `meta: false`. `FormGroup` 을 쓰지 않는 th/td 상세 표 라벨은 `MdmFieldLabel`([mdm-meta](references/components/mdm-meta.md)) |
| 입력값을 MDM 정의(필수·형식·길이·허용 코드·표준식)로 검사·서버 저장 오류를 칸에 표시 | 그리드 `mdmValidate` + `fieldErrors={toFieldErrors(e, grid)}`, 폼 `useMdmValidation()` 결과를 `FormGroup error` 로, 저장 전 `validateRows`. 오류 칸 클래스 `cell-mdm-invalid`([mdm-meta](references/components/mdm-meta.md) §화면 값 검증) |

- **데이터테이블(머리행 + 데이터 행이 반복되는 목록)은 반드시 공용 `AgDataGrid` 로 그린다.** 크기·테두리·선택·편집 모양이 모든 화면에서 같아야 하기 때문이다. 원시 `<table>` 이나 다른 그리드 라이브러리로 목록을 그리지 않는다(두 번째 그리드였던 `CustomDataGrid` 는 2026-09-29 삭제). 카드·패널·모달 안의 몇 행짜리 작은 목록도 예외가 아니며, `height="auto"`(행 수만큼 높이가 늘어남)로 그린다. 행 선택은 `onRowClick`·`highlightedRowKey`, 셀 안 배지·버튼은 `GridColumn.render`, 셀 편집은 `editable`·`cellEditor` 로 한다. 예외는 라벨-값 짝으로 된 폼 배치 표(`<thead>` 없음)와 `matrix-table` 뿐이다. `A audit` 가 화면의 `<thead>` 를 잡는다.
- **래퍼가 요구를 못 채우면 화면에서 우회하지 않는다.** 화면 CSS 로 공통 모습을 덮지도 않는다. 어느 경우든 고친 뒤 shared 를 build 한다.
  - **새 컴포넌트가 필요하면** 묻지 않고 shared 에 등록한다. 업무 도메인에 묶이지 않는 부품(입력 칸·편집기·표시 부품 등)은 화면 폴더에 만들지 않는다. 판정 기준·절차는 `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` §18 이 정본이다: 화면 전용 키·클래스·import 를 떼어 props 로 받고, 스타일은 토큰과 컴포넌트 자체 `<style>` 로 넣고, 새 라이브러리는 shared `dependencies` 에 한 벌만 둔다. tsup `entry`·`exports`·Part B §1 표에도 넣는다.
  - **기존 래퍼의 props·동작·모습을 바꿔야 하면** 사용자에게 알리고 승인 뒤에 고친다. 그 래퍼를 쓰는 다른 화면도 함께 바뀌기 때문이다.
- 화면에서는 근거가 곧 **래퍼 소스**(`src/frontend/shared/src/**`)다. props·기본 크기는 래퍼가 정하므로 `size`·`radius` 를 지정하지 않는다.
- 색은 의미 토큰(`var(--color-danger)`)이나 제공 CSS 클래스(`form-error-message` 등)만 쓴다. `red.7`·16진수·`rgb()` 는 쓰지 않는다.
- ag-grid 는 **community 만** 쓴다(ADR-0001). `A get <slug>` 첫 줄의 `Enterprise: 예` 로 판별한다. 공식 `ag-dev` 스킬의 "Enterprise 추가" 권고는 DMES 에 적용하지 않는다.
- Enterprise 기능(행 그룹·소계·피벗 등) 요구는 **대체 구현도 먼저 하지 않는다.** 화면에서 소계 행을 직접 계산해 끼워 넣는 방식, shared 래퍼 확장, 라이선스 도입 중 무엇을 할지 선택지로 정리해 사용자에게 올린다. 나머지 요구는 그대로 구현한다.
- 업무 상태별 행 색(예: NG 행)은 `AgDataGrid` 의 `getRowClassExtra` 로 클래스를 주고, 그 클래스는 의미 토큰(`--color-danger-soft` 등)으로만 칠한다.
- 한 변 컬러 바(`border-left: 3px` 등)로 상태를 표시하지 않는다. 아이콘은 `@tabler/icons-react` 를 쓴다.

## 4. 검증과 보고

0. shared 에 새 컴포넌트를 등록했다면 `references/components/<이름>.md` 를 [tabs.md](references/components/tabs.md) 형식(import·소스·언제 쓰나·표준 사용·Props·흔한 실수)으로 쓰고, `scripts/ui_docs.mjs` 의 분류에도 넣는다. 「언제 쓰나」 에는 비슷한 기존 래퍼와 나눠 쓰는 기준을 적는다. 이 스킬의 문서·예제를 고쳤다면 `U check-examples`(예제 타입 검사 + audit)와 `U coverage`(shared export 누락, `llms.txt`·`llms-full.txt` 최신 여부)를 돌린다. 생성물은 `U index --write`·`U full --write` 로 갱신한다.
1. `M audit <바꾼 파일·폴더>` 와 `A audit <…>` — 옛 API, deprecated 옵션(설치본 `.d.ts` 에서 자동 추출), 금지 import, 화면(`m-*`) CSS 의 색 값 직접 사용을 잡는다. **바꾼 파일만** 넘긴다(기존 CSS 에는 이미 색 값이 남아 있다). 의심 건은 문서로 확인하고, 오탐이면 이유를 보고에 적는다.
2. 대상 패키지 lint·build (`pnpm -C src/frontend/<앱> lint`, `build`). shared 를 고쳤다면 shared 를 먼저 build 한다.
2a. 화면을 새로 만들거나 상세 폼·목록 조회를 바꿨다면 [화면 성능 가이드](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) §7 점검표를 훑고 결과를 보고에 적는다(해당 없는 항목은 생략 가능). 점검표 항목 중 audit 가 잡는 것은 1번의 `A audit` 결과로 확인한다.
3. 브라우저 확인은 사용자 승인 후에만 한다(`docs/guide/FrontEnd/Local-Rules.md` §4). ag-grid 기능이 조용히 동작하지 않으면 콘솔의 `AG Grid: error #…`(모듈 미등록)을 먼저 본다.

보고에는 다음을 적는다: 사용한 컴포넌트·옵션과 근거(래퍼 파일, 문서 slug, `.d.ts`), 확인하지 못한 API, 사용자에게 올린 결정 사항, audit·lint·build 결과, 확인하지 않은 런타임·시각 동작.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 조건 없는 전체 조회를 기본 조회로 둠(7천 건 이상 응답 3MB) | 첫 조회에 `limit`(`FIRST_SEARCH_LIMIT`)을 보내고 잘리면 `GridPanel titleExtra` 에 `GridLimitNotice` + [전체 보기] — [가이드 R1](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| 목록 조회 응답에 본문·긴 텍스트(CLOB) 열을 실음(공지사항 관리: 행마다 최대 20만 자) | 목록에는 그리드에 보이는 열만, 본문은 행 선택 때 상세 조회 — audit `P-R1b`, [가이드 R1](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| 고르기 팝업·콤보 목록에 하위 항목(헤더의 항목 등)까지 실음 | 목록은 하위 항목 없이(`withoutItems` 류 옵션) 받고, 행을 고를 때 그 한 건만 단건 조회. 응답이 늦을 때를 대비해 순번으로 낡은 응답을 버리고 중복으로 쌓지 않는다 — [가이드 R1](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| 결과 0건이면 그리드를 언마운트하고 `<p>` 로 바꿈(3항·`&&` 모두) | `AgDataGrid` 를 늘 두고 `emptyMessage` 로 안내 — audit `P-R6`, [가이드 R6](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| 상세 폼 state 를 화면 루트에 둠(한 글자마다 루트·그리드 전체 재렌더) | 상세 폼을 별도 컴포넌트로 분리하고 루트는 `ref` 핸들(`load`·`getForm`)로 대화 — screen-patterns.md §성능 기본 구조, 가이드 R12 |
| 상세 폼 안에서 shared `CardFrame`·`CronInput`·`VariableTable` 같은 비-memo 카드를 그대로 나열(한 글자마다 모든 카드·입력 칸 재렌더) | 카드마다 화면 안 `memo` 섹션으로 감싸고 props 를 원시값·`useCallback` 으로 좁힘, 상세 폼·목록 패널도 `memo` — 가이드 R12 「예약 작업 관리」 적용 사례 |
| 행 선택에서 상세 `get` 을 기다린 뒤 이력 등 다음 호출을 부름, 저장 뒤 쓰기 응답이 있는데 `get` 을 다시 부름 | 서로 필요 없는 호출은 바로 겹쳐 부르고(순번 가드 유지), 쓰기 응답으로 폼을 맞추면 재조회를 뺀다 — 가이드 R12 |
| 항목을 열로 펴는 피벗·동적 열 그리드에 순번 키(`c0`…)를 쓰면서 `personalize` 를 그대로 둠(열 숨김·너비가 다른 작업·다른 항목의 같은 순번 열에 붙음) | 동적 열 그리드는 `personalize={false}` 로 끄거나 항목 키 기반의 안정된 열 키를 쓴다. 열 키에 점·공백이 있으면 AG Grid 필드 경로로 읽히므로 순번 키 + 머리글=항목 키로 나눈다 — 예약 작업 관리 수집 값 탭(`CollectDataPanel`) |
| 그리드 `columns` 를 `useMemo(..., [form])` 처럼 폼 객체에 의존시킴 | 모듈 상수 또는 안정값(불리언·고정 콜백)만 deps 에 둔 `useMemo` |
| 행 클릭·선택 때 `onSnapshotChange` 로 선택 행 ID 를 snapshot 에 넣음(클릭마다 포털 셸 재렌더) | snapshot 에 선택 행을 넣지 않는다. 탭 복귀 때 되살릴 값(조회 조건)이 바뀔 때만 부른다 — audit `P-R8`, [가이드 R8](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| `fetch("/api/auth/me")` 직접 호출, 하위·팝업마다 `useUserButtonRbac()` | `getCurrentUser()`·`useCurrentUserId()`, 권한 훅은 화면 루트 한 곳 — 가이드 R9 |
| 화면에서 `import { Button, Group } from "@mantine/core"` | `@dk-oasis/shared/form` · `layout` 래퍼 |
| `PageLayout buttons` 에 `<Button>` JSX 를 넣음 | `PageButton` 객체 배열(`{ id, label, onClick, type, action }`) — [screen-patterns.md](references/screen-patterns.md) §상단 버튼 |
| 메시지를 `useGfnMessage`·`ErrorModal`·`alert` 로 제각각 띄움 | `useMessage().showMessage` + screen-patterns.md §메시지 문구 표 |
| 기간 조회조건을 `<div style={{display:"flex"}}>` 나 `span-2` 로 직접 묶음 | `type="date"` `SearchField` 두 개, 두 번째 `label="~"` |
| 목록 조회 조건을 `Input`·`Button` 으로 직접 그림(`SearchArea` 없이 [조회] 단추 포함) | `SearchArea`·`SearchField` 로 만들고 칸마다 `name`/`defaultKey` 를 단다 — audit `P-S1`. 대화 상자 안과 이미 받은 목록을 좁히는 빠른 찾기 칸은 예외 — [search-area](references/components/search-area.md) |
| 진입 자동 조회를 마운트 `useEffect` 로 함(사용자 기본값이 빠진 조건으로 조회) | `<SearchArea autoSearch>` — [search-area](references/components/search-area.md) |
| 기준 칸이 바뀔 때 화면이 다른 조회 칸을 직접 비움 / 조회 칸 `onChange` 를 `setFilters({ ...filters, k: v })` 로 씀 | 의존 칸에 `dependsOn="기준 칸 키"` 선언 / 함수형 갱신 `setFilters((p) => ({ ...p, k: v }))` |
| 화면 루트가 탭·열림 같은 보조 상태를 들고 있어, 상태가 바뀔 때마다 아래 그리드 패널이 새 `columns`·`data`·콜백을 받아 다시 그려짐 | 그리드 패널을 `memo` 로 감싸고 `columns`·rows 는 `useMemo`, 콜백은 `useCallback`(+ 최신 함수 ref)로 고정 — [가이드 R12](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| `FloatingPanel`·모달처럼 body 로 포털하는 창 안 내용에 화면 루트 범위 CSS(`.화면-루트 .클래스`)를 기대함(스타일이 통째로 빠짐) | 창 안 루트 클래스를 따로 두고 `:is(.화면-루트, .창-루트) .클래스` 로 선택자를 넓힌다 — [floating-panel](references/components/floating-panel.md) |
| 화면 루트를 직접 만든 `div` 로 두고 ContentBody·ContentPanel 을 씀(분할 CSS 가 안 먹어 본문이 좁게 쪼그라듦) | 화면 루트는 `PageLayout`. 분할·패널 CSS 는 `.page-layout`·모달 바디 아래에서만 적용된다 — [content-body](references/components/content-body.md) 흔한 실수 |
| 패널 안을 flex `div` 로 다시 감싸거나 안내 `<p style>` 추가 | 감싸지 않는다. ContentPanel·GridPanel 이 높이를 맡는다 |
| `GridPanel` 안(그리드 형제)에 안내 문구·배너·잘림 안내 `<p>` 를 둠(`.cm-data-grid` 가 `position:absolute` 로 `.grid-panel-content` 전체를 덮어 문구가 그리드 헤더에 가려짐) | 안내는 `GridPanel` 바깥(탭 아래·패널 위)에 둔다 — [Local-Rules §45](../../../docs/guide/FrontEnd/Local-Rules.md) |
| `GridPanel headerExtra` 안에서 absolute·fixed 배치를 쓰거나 `order` 로 그리드 설정 아이콘 앞에 서려 함 | 아이콘 칸은 머리줄 맨 끝(DOM 마지막·`order` 최대값)으로 고정이라 `order` 는 통하지 않고 absolute 요소는 아이콘을 가린다. 일반 흐름으로만 둔다 |
| 행추가·행삭제를 상단 버튼으로 만들고 임시 키를 직접 생성 | `GridPanel showAddButton` + `buttons` 의 확인창 행삭제 + `useGridDataManager` (screen-patterns.md §상단 버튼) |
| `today()` 값을 `DatePicker` 에 바로 넣음 | `formatDateStr(today())` (`today()` 는 `yyyyMMdd`) |
| 화면에서 `AgGridReact` 와 `ColDef[]` 로 그리드 조립 | `AgDataGrid` + `GridColumn[]` |
| 카드 안 작은 목록을 원시 `<table>` 로 그림 | `AgDataGrid height="auto"` |
| "SearchArea 가 레이아웃에 안 맞아서" 직접 조립 | 사용자에게 알리고, 필요하면 shared 를 확장 |
| 범용 부품(편집기·입력 칸)을 화면 폴더에 만들어 그 화면에서만 씀 | shared 에 등록한다(Part B §18) — 화면은 그 부품을 import 해 쓴다 |
| 위젯·홈이 진입 때 같은 목록·정의를 여러 번 조회하고 그린 보드를 스켈레톤으로 되돌림(준비 조건이 늦게 와서 다시 불러옴) | 준비 조건(등록부·기본 배치·사용자 확인)을 모아 한 번만 불러온다. 늦게 온 값은 다시 조회하지 않고 다시 정리한다. 화면이 `key` 로 `WidgetWorkspace` 를 다시 마운트하지 않는다 — [가이드 R13](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| 위젯 본체가 `setInterval`·재귀 `setTimeout` 으로 계속 조회함(숨은 탭에서도) | 탭 활성·`document.visibilityState`·표시 여부와 연동하거나 틀 `refreshSec` 에 맡긴다 — [가이드 R14](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| 같은 엔드포인트 목록을 호스트(사이드바 등)와 위젯 인스턴스가 따로 조회 | 호스트가 받은 것을 올려 두는 저장소를 두고 위젯이 읽는다(`m-mcm/lib/portal-favorites-store.ts`). 저장소가 비면 직접 조회 — [가이드 R15](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| 위젯이 외부 스토어(`useSyncExternalStore`)를 통째 구독해 한 필드 변경에 모두 다시 그림 | 필드별 훅을 내보낸다(getSnapshot 이 그 필드만 돌려줌) — `useNotices`·`useSelectedNoticeId`(`m-mcm/page-components/home/notice-store.ts`). [가이드 R16](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| `mergeWidgetRegistry` 를 `prev` 없이 부르거나 등록부 entry·배치를 같은 결과인데 새 객체로 만듦 | 같은 결과면 원래 객체를 돌려준다: `mergeWidgetRegistry(code, types, defs, prevRegistry)`, 지연 로딩 캐시는 `entry.load` 같은 안정 키 — [가이드 R7](../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) |
| `<Collapse in>`, `<Grid gutter>`, `<Text color>`, `leftIcon` | [mantine-v9-changes.md](references/mantine-v9-changes.md) |
| `rowSelection="multiple"`, `checkboxSelection`, `ag-grid.css` import | [aggrid.md](references/aggrid.md) §2 |
| ag-grid.com 최신(v36) 예제·옵션을 그대로 사용 | `A get <slug>`(archive 33.3.2) · `A types` |
| 행 그룹·Excel 내보내기·Set Filter 를 위해 `ag-grid-enterprise` 추가 | 금지(ADR-0001). 사용자에게 알린다 |
| llms-full.txt 를 Read 로 통째로 읽음 | `M grep` |
