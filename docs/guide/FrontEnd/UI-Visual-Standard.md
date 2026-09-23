# UI 시각 표준 (C 고밀도 산업용 톤)

> 상위 문서: [FrontEnd Guide Index](README.md)
> 결정 근거: [UI 2단계-1 시각 기반 설계 스펙](../../superpowers/specs/2026-09-23-ui-phase2-visual-foundation-design.md) (2026-09-23 확정),
> [전 모듈 ADR-0001](../adr/0001-ui-library-mantine9-aggrid.md) D4·D5
> 톤 샘플: [`tone-samples.html`](../../superpowers/specs/assets/2026-09-23-ui-phase2-mockups/tone-samples.html) ·
> 변경 전·후 화면: [`before/`](../../superpowers/specs/assets/2026-09-23-ui-phase2-before/) · [`after/`](../../superpowers/specs/assets/2026-09-23-ui-phase2-after/)

DMES 전 모듈 화면의 색·글꼴·크기·밀도·셸 배치를 정한다. 값의 정본은 코드이며, 이 문서는 규칙과 의도를 적는다.

| 항목 | 정본 파일 |
|---|---|
| 디자인 토큰 | `src/frontend/shared/src/styles/variables.css` |
| Mantine 테마 | `src/frontend/shared/src/ui-provider/theme.ts` |
| 토스트·Provider 구성 | `src/frontend/shared/src/ui-provider/index.tsx` |
| 글꼴 번들 | `src/frontend/m-mcm/app/globals.css` (`pretendard` 패키지) |

## 1. 톤

- MUST: 전 모듈이 **C 고밀도 산업용** 톤 하나를 쓴다. 어두운 셸(헤더·사이드바) + 밝은 작업 영역 + 높은 정보 밀도가 기본이다.
- MUST NOT: 모듈·화면별로 다른 톤(밝은 SaaS 풍, 넓은 여백 등)을 따로 만들지 않는다.

## 2. 브랜드와 강조색

- MUST: 로고는 기존 이미지 `/images/dmes_logo_w.png`(헤더), 로그인 배경 이미지 `bg_login.png` 를 **그대로** 쓴다. 텍스트나 CSS 로 로고를 다시 그리거나 새 로고 파일을 만들지 않는다.
- MUST: 빨강은 로고에만 있다. 화면의 동작색(주 버튼·링크·선택·포커스)은 **파랑 `#0b62d6` 하나**다(`--color-primary`, Mantine `dmes-6`).
- MUST NOT: 주황 등 별도의 강조색을 추가하지 않는다. 상태 표현은 §5 상태색만 쓴다.

## 3. 디자인 토큰

`variables.css` 는 두 층으로 나뉜다.

| 층 | 접두어 | 용도 |
|---|---|---|
| 원시 팔레트 | `--c-*` (예: `--c-slate-900`, `--c-blue-600`) | 값 보관용. 직접 참조 지양 |
| 의미 토큰 | `--color-*`, `--shell-*`, `--font-*`, `--radius-*`, `--shadow-*`, `--form-*` | shared CSS·화면이 참조하는 이름 |

- MUST: shared CSS 와 화면 CSS 는 **의미 토큰만** 참조한다. 맞는 의미 토큰이 없을 때만 `--c-*` 를 쓰고, 반복되면 의미 토큰을 새로 추가한다.
- MUST NOT: CSS·인라인 스타일에 16진수·`rgb()` 색을 직접 쓰지 않는다. `var(--x, #fallback)` 의 폴백 값도 새로 넣지 않는다.
- MUST: 토큰을 추가·변경하면 `theme.ts` 의 Mantine 팔레트(`dmes`, `danger`)와 값을 맞춘다. `loginBrand` 는 `dmes` 의 별칭이므로 이름을 유지한다.
- MUST NOT: 앱 전역 CSS 에 `:root` 토큰을 복사하지 않는다([Part B §4-1](standard-v2/part-b-shared-policy.md)).

## 4. 타이포그래피·크기·밀도

| 항목 | 값 | 토큰 |
|---|---|---|
| 글꼴 | Pretendard Variable, 숫자 고정폭(`tnum`) | `--font-family` |
| 고정폭(코드·ID) | JetBrains Mono / D2Coding | `--font-family-mono` |
| 본문 / 보조 / 캡션 | 12.5px / 12px / 11px | `--font-size-md` / `-sm` / `-xs` |
| 화면 제목 | 16px, 700 | `--font-size-title` |
| 입력·버튼 높이 | 26px (Mantine `xs` 를 26px 로 재정의) | `--form-height`, `--input-height-xs`, `--button-height-xs` |
| 그리드 행 / 헤더 | 26px / 28px | `AgDataGrid` `rowHeight` / `headerHeight` |
| 반경 | 3px (카드·모달 4px) | `--radius-sm` / `--radius-md` |
| 패널 머리 | 32px, 배경 `--color-bg-header`, 제목 13px 700 | — |
| 카드 간격 / 페이지 여백 | 8px / 10px | — |

- MUST: Pretendard 는 호스트 앱이 npm 패키지(`pretendard`)로 번들한다. CDN 링크로 불러오지 않는다(사내망·운영망 도달 보장 불가).
- MUST: shared 컴포넌트의 기본 크기는 `xs`(26px)다. 화면에서 `size` 를 키워 밀도를 바꾸지 않는다. 로그인 폼만 예외로 36px 입력을 쓴다.

## 5. 색 체계

| 용도 | 토큰 | 값 |
|---|---|---|
| 앱 바탕 / 카드 | `--color-bg-app` / `--color-bg` | `#e9ecf0` / `#fff` |
| 패널 머리 / 그리드 헤더 / 줄무늬 | `--color-bg-header` / `--color-bg-grid-header` / `--color-bg-zebra` | `#f1f3f6` / `#e3e8ee` / `#f6f8fa` |
| hover / 읽기전용·비활성 | `--color-bg-hover` / `--color-bg-readonly` | `#eef1f4` |
| 선 기본 / 강조 / 옅은 | `--color-border` / `--color-border-strong` / `--color-border-light` | `#c9d0d9` / `#9aa5b3` / `#e3e7ec` |
| 글자 / 보조 / 흐림 | `--color-text` / `--color-text-secondary` / `--color-text-muted` | `#0f1720` / `#2b3440` / `#5b6573` |
| 선택 | `--color-selection` | `#dbe8fb` |
| 위험 | `--color-danger` / `--color-danger-soft` | `#d42a2a` / `#fdeaea` |
| 성공 | `--color-success` / `--color-success-soft` | `#13663a` / `#d8f0e0` |
| 경고·수정됨 | `--color-warning` / `--color-edited` | `#a15c07` / `#fef3c7` |

## 6. 포털 셸

| 요소 | 규칙 | 토큰 |
|---|---|---|
| 헤더 | 높이 44px, 배경 `#1c2530`, 로고 높이 약 26px | `--shell-header-*` (`portal-shell.tsx` `PORTAL_HEADER_HEIGHT` 와 일치) |
| 사이드바 | 배경 `#26313e`, 항목 12.5px·행 28px, **선택 항목은 파랑 채움 + 흰 글자** | `--shell-sidebar-*` |
| MDI 탭 바 | 배경 `#d5dbe2`, 탭 28px, 활성 탭은 흰 배경 + 테두리 + 굵은 글자 | `--shell-tab*` |
| 탭 바 아이콘 버튼 | 26px 정사각, 반경 3px, 1px 테두리 | — |

- MUST: 사이드바 트리 규칙은 `.sidebar-container` 범위 안에서만 선언한다. `.tree-item` 클래스를 화면 안 트리(`Tree` 컴포넌트)와 공유하므로, 범위 없는 선언은 화면 트리 색을 덮는다.
- 화면 안 트리(`Tree`)는 흰 카드 위 진한 글자, 선택 항목은 `--color-primary-soft` 배경 + `--color-primary` 글자다(2026-09-23 사용자 확인).

## 7. 그리드

- MUST: ag-grid 모습은 `grid.css` 의 `--ag-*` 변수를 의미 토큰으로 구동한다. `ag-theme-alpine`·`cm-data-grid` 클래스명은 e2e 가 의존하므로 유지한다.
- 헤더 `--color-bg-grid-header`·11px 600, **열 구분선 표시**, 줄무늬 `--color-bg-zebra`, hover `--color-bg-hover`, 숫자 `tnum`.
- 행 상태 배경(자동 적용, [Portal 가이드 §2-3](Portal-Development-Guide.md)):

| 행 상태 | CSS 클래스 | 배경 토큰 |
|---|---|---|
| `added` / `copied` | `ag-row-inserted` | `--color-success-soft` |
| `modified` | `ag-row-modified` | `--color-edited` |
| `deleted` | `ag-row-deleted` | `--color-danger-soft` (취소선) |
| 선택 행 | `ag-row-highlighted` | `--color-selection` |

- MUST: 선택 행은 **배경 톤으로만** 구분한다. 왼쪽 컬러 바를 붙이지 않는다(§9).

## 8. 토스트(알림)

- MUST: 토스트는 **우측 하단, 하단 상태줄 위(36px)** 에 띄운다. 조회·저장 등 화면 우측 상단 버튼을 가리지 않기 위해서다(2026-09-23 결정).
- 구성: `<Notifications position="bottom-right" containerWidth={360} limit={3} />`, 표시 3초(`toastDuration` 기본값).
- 모양: 1px 전체 테두리 + 문구 앞 7px 원형 점. 점 색은 상태를 따른다(info=`dmes` 파랑, error=`danger`, success=green, warning=orange — `message-provider.tsx` `TOAST_COLOR_MAP`). Mantine 기본 왼쪽 컬러 바는 쓰지 않는다(§9).
- MUST: 하단 여백은 `portal-shell.css` 의 `.mantine-Notifications-root[data-position="bottom-right"]` 에만 준다. Mantine 9 는 위치별 컨테이너 6개를 모두 렌더하므로 `styles.root` 로 주면 위쪽 컨테이너가 화면 세로로 늘어나 클릭을 가로막는다.
- MUST: 화면은 `useMessage`/`useGfnMessage` 의 `toast: true` 로만 토스트를 띄운다([Part B §9](standard-v2/part-b-shared-policy.md)).
- 참고: 개발 서버(`next dev`)에서는 React StrictMode 가 진입 시 자동조회 `useEffect` 를 두 번 실행해 "N건 조회" 토스트가 두 번 뜬다. 운영 빌드에서는 한 번이다. 버그로 보고하지 않는다.

## 9. 금지 패턴

- MUST NOT: 박스·행·카드·탭·토스트의 **한 변에 컬러 바**를 붙여 상태·선택·유형을 구분하지 않는다(`border-left: 3px`, `border-top: 3px`, `box-shadow: inset 3px 0 0` 같은 한 변 그림자, 2px 밑줄 포함). 정본은 [Local-Rules §8](Local-Rules.md).
- 대신: 배경 톤, 1px 전체 테두리, 배지, 아이콘, 작은 점, 글자 굵기로 구분한다.
- MUST NOT: 화면 코드에서 셸·그리드·폼의 공통 모습을 덮어쓰지 않는다. 바꿔야 하면 shared 토큰이나 컴포넌트를 고친다.

## 10. 검증

- 시각 변경 후 before/after 스크린샷을 같은 뷰포트로 찍어 비교한다(설계 스펙 §5 방식).
- 화면 CSS 의 색 값 직접 사용(§3)은 `mantine_docs.py audit` 가 잡는다([FrontEnd 인덱스 §자동 점검](README.md#자동-점검)).
- 브라우저 기반 e2e 는 사용자 승인 후에만 실행한다([Local-Rules §4](Local-Rules.md)). 작업 종료 시 `pnpm lint`·`pnpm build`·단위 테스트를 실행한다([Local-Rules §2](Local-Rules.md)).
