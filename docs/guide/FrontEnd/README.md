# FrontEnd Guide Index

Frontend, portal, shared package, private npm registry 관련 가이드는 이 폴더에서 시작한다. 전체 작업 분기는 먼저 [`../../../RULE.md`](../../../RULE.md) 와 [`../README.md`](../README.md) 를 따른다.

## 읽기 순서

| 작업 | 먼저 읽을 문서 | 보조 문서 |
|---|---|---|
| Frontend 로컬 운영 규칙·UI 검증·중요 액션 UX | [`Local-Rules.md`](Local-Rules.md) | 본 인덱스 |
| Frontend 화면 구현 (APS/MES 공통) | [`FrontEnd_표준_통합_개발가이드_v2.md`](FrontEnd_표준_통합_개발가이드_v2.md) | 화면 모양은 [화면 표준 골격](../../../.claude/skills/mantine-aggrid-ui/references/screen-patterns.md)(유형별 예제·고정값), 화면별 기능/디자인설계서 |
| Portal 화면/메뉴/BFF 개발 | [`Portal-Development-Guide.md`](Portal-Development-Guide.md) | [`Portal-Menu-Role-Policy.md`](Portal-Menu-Role-Policy.md) |
| Portal 메뉴 역할 정책 | [`Portal-Menu-Role-Policy.md`](Portal-Menu-Role-Policy.md) | [`../Security/Security-Guide.md`](../Security/Security-Guide.md) |
| private npm / Verdaccio | [`Verdaccio-Guide.md`](Verdaccio-Guide.md) | [`../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md`](../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md) |
| MES 화면을 누가 만들어도 같은 모습이 나오게 하는 화면 유형별 골격·고정값·예제, shared 컴포넌트별 사용법 | [화면 표준 골격](../../../.claude/skills/mantine-aggrid-ui/references/screen-patterns.md) | [컴포넌트 색인 `llms.txt`](../../../.claude/skills/mantine-aggrid-ui/references/components/llms.txt), [Mantine 대응표](../../../.claude/skills/mantine-aggrid-ui/references/mantine-catalog.md) |
| Mantine 9 · ag-grid-community 사용법 확인, 옛 API 이관, UI 규칙 자동 점검 | [`mantine-aggrid-ui` 스킬](../../../.claude/skills/mantine-aggrid-ui/SKILL.md) | 본 인덱스 §자동 점검 |
| 새 화면·shared 공통 컴포넌트의 성능 설계 규칙·확인 절차·예산·측정 함정 | [`Screen-Performance-Guide.md`](Screen-Performance-Guide.md) | [측정 하네스](../../../scripts/perf/render/README.md), [MDM 렌더링 독립 검증](../../perf-render/mdm-findings-verification.md) |
| 화면 색·글꼴·크기·셸·토스트 등 시각 표준 | [`UI-Visual-Standard.md`](UI-Visual-Standard.md) | [`standard-v2/part-b-shared-policy.md`](standard-v2/part-b-shared-policy.md) §4, [`Local-Rules.md`](Local-Rules.md) §8 |
| 공통 UI 기반(전 모듈 횡단) 결정 근거 확인 | [전 모듈 ADR-0001: 공통 UI 기반 Mantine 9 채택과 그리드 ag-grid-community 유지](../adr/0001-ui-library-mantine9-aggrid.md) | [`standard-v2/part-b-shared-policy.md`](standard-v2/part-b-shared-policy.md) |

## 배치 기준

- Next.js, React, portal, shared, BFF route, frontend package, npm registry 문서는 이 폴더에 둔다.
- Backend Gradle/Nexus 발행까지 함께 다루는 문서는 [모듈 패키지 발행·소비 가이드](../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md), Backend+Frontend 서버 배포는 [DMES 통합 배포 가이드](../Operations/DMES-Deployment-Guide.md)처럼 Operations에 둔다.
- 인증/인가 정책처럼 BE/FE 양쪽에 걸친 문서는 루트 보안 문서에 둔다.

## 자동 점검

규칙의 정본은 이 폴더의 문서다. 그중 기계로 잡을 수 있는 규칙은 [`mantine-aggrid-ui` 스킬](../../../.claude/skills/mantine-aggrid-ui/SKILL.md)의 스크립트가 점검한다. 바꾼 파일만 넘겨서 커밋 전에 실행한다.

```bash
D=.claude/skills/mantine-aggrid-ui/scripts
node $D/mantine_docs.mjs audit <바꾼 파일·폴더>
node $D/aggrid_docs.mjs audit <바꾼 파일·폴더>
```

| 점검 항목 | 근거 규칙 | 수준 |
|---|---|---|
| 화면(`m-*`)에서 `@mantine/*` 직접 import | [Part B §4-2·§17](standard-v2/part-b-shared-policy.md) | 오류 |
| 화면에서 `ag-grid-react`·`ag-grid-community` 직접 import | [Part B §6](standard-v2/part-b-shared-policy.md) | 오류 |
| 화면에서 원시 `<table>` 데이터 목록(`<thead>`) 사용 → `AgDataGrid` | [Part B §6](standard-v2/part-b-shared-policy.md) | 오류 |
| `ag-grid-enterprise` 사용 | [전 모듈 ADR-0001](../adr/0001-ui-library-mantine9-aggrid.md) D2 | 오류 |
| 화면 CSS 의 16진수·`rgb()` 색 | [UI-Visual-Standard §3](UI-Visual-Standard.md) | 오류 |
| Mantine 8 이하 API, ag-grid 설치본 기준 deprecated 옵션 | 라이브러리 설치 버전(`.d.ts`) | 오류 |
| `[P-K]` 화면·위젯·shared 에서 `fetch("/api/auth/me")` 직접 호출(공용 캐시 `portal-shell/current-user.ts` 제외) → `getCurrentUser()`·`useCurrentUserId()` | [성능 가이드 R9·K3](Screen-Performance-Guide.md) | 오류 |
| `[P-R12]` 그리드 열·행 `useMemo`(이름 `*Columns`·`*Rows`·`columnDefs` 또는 `GridColumn[]`)의 deps 에 폼 상태(`form`·`xxxForm`·`*Form` 타입) 객체 전체 | [성능 가이드 R12](Screen-Performance-Guide.md) | 오류 |
| `[P-R12b]` 화면 루트(`export default`)의 폼 상태를 `<Input>`·`<Textarea>` onChange 가 직접 또는 핸들러 한 단계로 바꿈 → 상세 폼 컴포넌트 분리 | [성능 가이드 R12](Screen-Performance-Guide.md) | 경고 |
| `[P-R1]` 목록 파일(page.tsx·`AgDataGrid`/`GridPanel` 사용)에서 import 한 `search*()` 호출 인자에 상한·페이징(`limit`·`size`·`max`·`page`)이나 상위 키(`…Id`·`…Code`)가 없고 `GridLimitNotice` 도 없음 | [성능 가이드 R1](Screen-Performance-Guide.md) | 경고 |
| `[P-R1b]` 목록 파일이 `search*()` 를 부르는데 같은 폴더 `types.ts` 에 본문·긴 글 열(`*content*`·`*body*`·`*cntn*`·`*clob*` 이름의 `string`)이 있음 → 목록 응답에 본문을 싣지 않고 행 선택 때 상세 조회 | [성능 가이드 R1](Screen-Performance-Guide.md) | 경고 |
| `[P-R6]` `rows.length === 0 ? (…) : (<AgDataGrid…/>)` 처럼 0건이면 그리드를 내림, 또는 `{rows.length > 0 && (<AgDataGrid…/>)}` 와 `{rows.length === 0 && <p>}` 를 짝으로 둠 → `emptyMessage` | [성능 가이드 R6](Screen-Performance-Guide.md) | 경고 |
| `[P-R10]` `portal-tab-activated` 를 받으면서 파일에 `tabId` 비교가 없음 | [성능 가이드 R10·K5](Screen-Performance-Guide.md) | 경고 |
| `[P-R14]` 위젯 파일(경로에 `widgets/`·`widget-types/`, 파일명에 `widget`·`renderer`)에 `setInterval(` 또는 자기 자신을 다시 거는 `setTimeout(` 이 있는데 `visibilityState`·`visibilitychange`·`IntersectionObserver`·`useTabPage`·`isActive` 가 없음 | [성능 가이드 R14](Screen-Performance-Guide.md) | 경고 |
| `[P-R8]` 행 클릭·선택 처리 함수(이름 `[handle|on]RowClick*`·`[handle|on]RowSelect*`·`choose*`·`selectRow*`·`selectItem*` 또는 `onRowClicked`·`onRowSelected`·`onSelectionChanged` props)가 `onSnapshotChange` 를 부름(그 함수가 부르는 헬퍼를 거쳐도 잡는다) | [성능 가이드 R8](Screen-Performance-Guide.md) | 오류 |
| `[P-R16]` `useSyncExternalStore` 의 getSnapshot 이 상태 객체 전체(`() => state`)뿐이고 같은 파일에 필드 단위 getSnapshot(`() => state.field`) 훅이 없음 | [성능 가이드 R16](Screen-Performance-Guide.md) | 경고 |

성능 항목(`[P-…]`)은 `aggrid_docs.mjs audit` 가 함께 낸다. 오류는 종료 코드 1, 경고는 종료 코드에 영향이 없다(설계상 정상일 수 있으므로 해당 규칙을 읽고 판단한다). 테스트 파일(`tests/`·`*.test.*`)은 성능 점검에서 뺀다.

성능 점검의 한계(정규식 수준이라 확인 절차를 대신하지 않는다):
- `[P-K]` 는 `fetch(` 에 경로 문자열이 바로 들어간 호출만 잡는다. `apiRequest`·상수 URL 을 거친 호출은 놓친다.
- `[P-R12]`·`[P-R12b]` 는 이름이 `form`·`*Form` 인 상태만 본다. `draft` 같은 다른 이름의 폼 상태는 놓친다. 그래서 화면 시험(루트 렌더 수)과 `count-renders` ⑤ 로도 확인한다.
- `[P-R1]` 은 서버 규모를 모르는 정규식 점검이라 경고만 낸다(2026-10-05 분류표 28건 중 오탐 15건, 개선 뒤 오탐 0건·위반 7건·애매 5건 남김). 다음은 자동으로 뺀다: 피커 검색 래퍼(`Promise<…Pick…[]>` 반환 함수)·`makeXxxSearch(...)` 콜백, 첫 인자가 비면 일찍 반환하는 조건 검색, 결과를 담는 setter 가 모두 옵션·LoV·역할 이름이고(오류·로딩 표시 setter 는 제외) 그 상태가 그리드 `data` 로 가지 않는 조회, 키(`…Id`·`…Code`·`…Key`)·`token` 인자 호출. 클라이언트에서만 자르는 피커는 `[P-R1 정보]` 로 낮춘다(서버 응답 한도 확인). 서버 규모·상태 필터는 정적 분석으로 알 수 없어 `.claude/skills/mantine-aggrid-ui/scripts/audit-exceptions.json` 에 사람이 파일·호출 단위로 사유와 함께 올린다(`level`: `exempt` 숨김, `info` 정보성 출력, `P-R1`·`P-R1b`·`P-R14` 에 적용). 파일 경로는 실행 위치와 무관하게 `/` 경계 접미사로 맞춘다. 항목은 분류표 판정이 끝난 것만 추가하고, 운영 행 수 확인이 필요한 애매 건은 넣지 않는다.
- `[P-R1b]` 는 같은 폴더 `types.ts` 의 필드 이름만 본다. 목록 행 타입이 다른 파일에 있거나 이름이 다르면 놓친다. 서버가 실제로 목록에 본문을 싣는지는 응답 크기(`searchEncodedBytes`)로 확인한다.
- `[P-R6]` 의 `&&` 형태는 빈 상태 `<p>`(`.length === 0 && <p>`) 가 형제로 있는 쌍만 잡는다. 빈 안내 없이 `{rows.length > 0 && <AgDataGrid/>}` 만 두는 것은 놓친다. 짝 판정은 같은 파일의 `.length === 0 && <p>` 존재만 보므로 빈 안내와 그리드가 서로 다른 배열을 보는 경우(`ruleConfirm`)도 걸린다. `.length > 0 && 단순식 && (…)` 까지는 따라가지만 함수 호출이 낀 조건은 놓친다.
- `[P-R14]` 는 같은 파일에 표시 확인 흔적이 한 군데라도 있으면 통과시킨다(타이머별로 연결을 따지지 않는다). 효과 재실행으로 도는 타이머(deps 가 바뀔 때마다 `setTimeout` 을 다시 거는 슬라이드쇼 등)와 틀 밖 파일에서 만든 타이머는 놓친다. 일회성·디바운스 `setTimeout` 은 대상이 아니다.
- `[P-R8]` 은 같은 파일 안에서 `onSnapshotChange` 를 부르는 함수를 호출 사슬(최대 4단)로 따라가 이름이 행 처리 규칙에 맞는 함수를 찾는다. 다른 이름의 핸들러나 다른 파일에서 부르는 경우는 놓치므로 점검표 4 와 `count-renders` ③ 으로 확인한다. 함수 선언·화살표 함수·`useCallback`(타입 인자·`React.` 접두 포함)을 본문으로 읽지만 함수를 참조로만 넘기는 경우(`onRowClicked={onPick}`)는 호출 사슬로 따라간 뒤에만 잡는다. 조회 조건을 고르는 함수는 `choose*` 를 피한다(`selectMaruData` 처럼 `select*` 나 `pick*` 로 짓는다). `chooseTab` 처럼 이름만 걸리면 오탐이므로 이름을 바꾼다.
- `[P-R16]` 은 스토어 정의 파일만 본다. 다른 파일에서 `const { a } = useXxxStore()` 로 일부 필드만 쓰는 호출은 파일 간 추적이 어려워 잡지 않는다(그런 사용은 필드 훅을 내보내라는 신호로 직접 확인한다).
- 경고도 오류와 같은 `경로:줄:` 형식으로 찍힌다. 줄 수로 세지 말고 `[P-…]` 코드와 수준으로 나눈다.

점검 규칙을 바꿀 때는 이 표와 스크립트를 함께 고친다.
