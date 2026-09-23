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
| DMES 화면(`m-*`) 구현·수정 | §3 → shared 래퍼 소스가 근거. 라이브러리 문서는 래퍼 동작이 불분명할 때만 |
| shared 래퍼·테마·`grid.css` 수정 | §2 조회 → 구현 → §4 검증 |
| 쓸 Mantine 컴포넌트를 모름 | `M search <단어>` → `M get <이름>` |
| ag-grid 기능·옵션 구현 | [references/aggrid.md](references/aggrid.md) 먼저, `A search` → `A get <slug>` → `A types <옵션>` |
| 옛 코드 이관 · 타입 오류 · "설정했는데 동작 안 함" | [mantine-v9-changes.md](references/mantine-v9-changes.md) · [aggrid.md](references/aggrid.md) §2 → `audit` → 해당 문서 |
| Combobox 원시 컴포넌트 · 커스텀 컴포넌트(factory) | 공식 스킬: `M official combobox` · `M official custom-components` (+ `api`/`patterns`) |
| `@mantine/form` 폼 | 공식 스킬 `M official form`. **DMES 에는 `@mantine/form` 이 없다.** 의존성 추가는 사용자 확인 후에만 |

## 2. 문서 조회

아래와 본문의 `M <명령>` 은 `python3 $D/mantine_docs.py <명령>`, `A <명령>` 은 `python3 $D/aggrid_docs.py <명령>` 을 줄여 쓴 것이다. 두 라이브러리 모두 `llms.txt` 색인 + 페이지별 Markdown 을 제공한다(PrimeReact 와 같은 방식). 조회는 스크립트로 하고, 결과는 `~/.cache/` 에 7일간 캐시한다. **WebFetch 는 쓰지 않는다.** 요약 모델이 Props 표와 예제를 뭉개고, ag-grid.com 은 요청 자체를 403 으로 막는다.

```bash
D=.claude/skills/mantine-aggrid-ui/scripts          # 저장소 루트 기준
python3 $D/mantine_docs.py version ; python3 $D/aggrid_docs.py version
python3 $D/mantine_docs.py search date input        # mantine.dev/llms.txt 색인
python3 $D/mantine_docs.py get DatePickerInput --section Props
python3 $D/mantine_docs.py grep 'rowGap' -C 2       # llms-full.txt(4.5MB) 전문 검색 — 통째로 읽지 않는다
python3 $D/aggrid_docs.py search row selection      # ag-dev 공식 슬러그 색인
python3 $D/aggrid_docs.py get row-selection-multi-row   # 설치 버전(archive/33.3.2) 문서를 텍스트로
python3 $D/aggrid_docs.py get formula --latest      # 최신 문서(도입 버전 확인용)
python3 $D/aggrid_docs.py types rowSelection        # 설치본 .d.ts 정의와 JSDoc(@agModule)
python3 $D/aggrid_docs.py recommendations           # 공식 ag-dev 의 LLM 흔한 실수
```

- 알려진 컴포넌트·옵션은 `search` 없이 바로 `get` 한다. 한 컴포넌트에 조회 1~2회면 충분하다.
- Mantine 문서가 설치 버전보다 앞선 API 를 보이면 `.d.ts` 로 확인한다: `grep -n "expanded" src/frontend/node_modules/.pnpm/@mantine+core@*/node_modules/@mantine/core/lib/components/Collapse/Collapse.d.ts`.
- ag-grid 는 `A get` 이 404 를 내면 설치 버전에 없는 기능이다. 최신 문서 예제를 그대로 옮기지 않는다.

## 3. DMES 계층 (src/frontend 작업)

**구현 전에 읽는다:** `docs/guide/FrontEnd/README.md` 의 읽기 순서, 특히 `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md`(허용 export·금지 사항)와 `docs/guide/FrontEnd/UI-Visual-Standard.md`(토큰·크기·그리드·토스트). 값은 이 스킬에 복사하지 않았으므로 정본 문서를 본다. 아래 표와 목록은 정본을 찾아가는 **길 안내**다. 가이드와 다르면 가이드를 따르고, 차이를 사용자에게 알린다. audit 가 강제하는 규칙 목록은 `docs/guide/FrontEnd/README.md` §자동 점검에 있다.

- **화면 모듈은 `@mantine/*`, `ag-grid-react`, `ag-grid-community` 를 import 하지 않는다**(Part B §4-2·§6·§17). `Group`·`Stack`·`Collapse` 같은 배치 요소도 예외가 아니다. Mantine 은 호스트 root layout 과 `shared` 안에서만 쓴다.
- 화면은 `@dk-oasis/shared/*` 만 쓴다:

| 필요 | 쓸 것 |
|---|---|
| 화면 골격·상단 버튼 바(조회·저장·초기화) | `layout`: `PageLayout` (`buttons`), `ContentBody`, `ContentPanel` |
| 조회조건 | `layout`: `SearchArea`, `SearchField` (`label="~"` 은 앞 필드와 기간 쌍) |
| 입력·선택·날짜·버튼 | `form`: `Button`, `Input`, `Select`, `ComboBox`, `DatePicker`, `Textarea`, `Checkbox`, `Radio` … |
| 데이터 그리드 | `grid`: `AgDataGrid`(기본), `GridPanel`, `useGridDataManager` — 열은 `GridColumn`, ag-grid `ColDef` 아님 |
| 엑셀 내보내기 | `utils`: `exportToExcel` (xlsx 기반 — ag-grid Excel Export(Enterprise)가 필요 없다) |
| 메시지·토스트 | `message-provider` (Part B §9, UI-Visual-Standard §8) |
| 모달·트리·탭·룩업 | `modal`, `tree`, `tabs`, `lookup` |

- **래퍼가 요구를 못 채우면 화면에서 우회하지 않는다.** 화면 CSS 로 공통 모습을 덮지도 않는다. 사용자에게 알리고, 승인되면 shared 에 추가한 뒤 shared 를 build 한다(Part B §17).
- 화면에서는 근거가 곧 **래퍼 소스**(`src/frontend/shared/src/**`)다. props·기본 크기는 래퍼가 정하므로 `size`·`radius` 를 지정하지 않는다.
- 색은 의미 토큰(`var(--color-danger)`)이나 제공 CSS 클래스(`form-error-message` 등)만 쓴다. `red.7`·16진수·`rgb()` 는 쓰지 않는다.
- ag-grid 는 **community 만** 쓴다(ADR-0001). `A get <slug>` 첫 줄의 `Enterprise: 예` 로 판별한다. 공식 `ag-dev` 스킬의 "Enterprise 추가" 권고는 DMES 에 적용하지 않는다.
- Enterprise 기능(행 그룹·소계·피벗 등) 요구는 **대체 구현도 먼저 하지 않는다.** 화면에서 소계 행을 직접 계산해 끼워 넣는 방식, shared 래퍼 확장, 라이선스 도입 중 무엇을 할지 선택지로 정리해 사용자에게 올린다. 나머지 요구는 그대로 구현한다.
- 업무 상태별 행 색(예: NG 행)은 `AgDataGrid` 의 `getRowClassExtra` 로 클래스를 주고, 그 클래스는 의미 토큰(`--color-danger-soft` 등)으로만 칠한다.
- 한 변 컬러 바(`border-left: 3px` 등)로 상태를 표시하지 않는다. 아이콘은 `@tabler/icons-react` 를 쓴다.

## 4. 검증과 보고

1. `M audit <바꾼 파일·폴더>` 와 `A audit <…>` — 옛 API, deprecated 옵션(설치본 `.d.ts` 에서 자동 추출), 금지 import, 화면(`m-*`) CSS 의 색 값 직접 사용을 잡는다. **바꾼 파일만** 넘긴다(기존 CSS 에는 이미 색 값이 남아 있다). 의심 건은 문서로 확인하고, 오탐이면 이유를 보고에 적는다.
2. 대상 패키지 lint·build (`pnpm -C src/frontend/<앱> lint`, `build`). shared 를 고쳤다면 shared 를 먼저 build 한다.
3. 브라우저 확인은 사용자 승인 후에만 한다(`docs/guide/FrontEnd/Local-Rules.md` §4). ag-grid 기능이 조용히 동작하지 않으면 콘솔의 `AG Grid: error #…`(모듈 미등록)을 먼저 본다.

보고에는 다음을 적는다: 사용한 컴포넌트·옵션과 근거(래퍼 파일, 문서 slug, `.d.ts`), 확인하지 못한 API, 사용자에게 올린 결정 사항, audit·lint·build 결과, 확인하지 않은 런타임·시각 동작.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면에서 `import { Button, Group } from "@mantine/core"` | `@dk-oasis/shared/form` · `layout` 래퍼 |
| 화면에서 `AgGridReact` 와 `ColDef[]` 로 그리드 조립 | `AgDataGrid` + `GridColumn[]` |
| "SearchArea 가 레이아웃에 안 맞아서" 직접 조립 | 사용자에게 알리고, 필요하면 shared 를 확장 |
| `<Collapse in>`, `<Grid gutter>`, `<Text color>`, `leftIcon` | [mantine-v9-changes.md](references/mantine-v9-changes.md) |
| `rowSelection="multiple"`, `checkboxSelection`, `ag-grid.css` import | [aggrid.md](references/aggrid.md) §2 |
| ag-grid.com 최신(v36) 예제·옵션을 그대로 사용 | `A get <slug>`(archive 33.3.2) · `A types` |
| 행 그룹·Excel 내보내기·Set Filter 를 위해 `ag-grid-enterprise` 추가 | 금지(ADR-0001). 사용자에게 알린다 |
| llms-full.txt 를 Read 로 통째로 읽음 | `M grep` |
