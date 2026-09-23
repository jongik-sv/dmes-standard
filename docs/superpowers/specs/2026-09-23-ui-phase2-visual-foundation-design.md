# UI 2단계-1: 시각 기반 개편 (C 고밀도 산업용 톤)

- **Date**: 2026-09-23
- **상위 결정**: [ADR-0001](../../guide/adr/0001-ui-library-mantine9-aggrid.md) D4 의 2단계 후속 과제 중 "시각 기반" 부분
- **상태**: 구현 완료, 사용자 검토 대기

## 1. 배경

1단계(Mantine 9 전환)는 "화면 체감 변화 없음" 규칙에 따라 Bootstrap 3 시절 외관(#337ab7, 시스템 글꼴,
#ccc 회색 테두리)을 그대로 재현했다. 그 결과 화면이 밋밋하고 대비·정렬 체계가 없었다.
변경 전 화면은 [`assets/2026-09-23-ui-phase2-before/`](assets/2026-09-23-ui-phase2-before/) 14장에 보존한다.

## 2. 결정 (사용자 확정)


| 항목  | 결정                                                                                |
| --- | --------------------------------------------------------------------------------- |
| 범위  | shared 시각 기반 전체: 토큰·Mantine 테마·shared CSS 전 파일·그리드·포털 셸·로그인. 모든 모듈이 shared 로 상속한다 |
| 제외  | 개별 화면 코드 수정, e2e 셀렉터 변경, 다크 모드 토글(다음 스펙)                                          |
| 톤   | **C 고밀도 산업용** ([톤 샘플](assets/2026-09-23-ui-phase2-mockups/tone-samples.html))     |
| 강조색 | 로고 빨강 유지 + 동작색 파랑 `#0b62d6` 단일. 주황 강조 없음                                          |
| 로고  | 기존 `/images/dmes_logo_w.png` 를 그대로 사용. 다시 그리지 않는다                                 |
| 로그인 | C 톤으로 재디자인하되 기존 로고·일러스트 이미지 유지, 제목 겹침 결함 수정                                       |
| 토스트 | 우측 상단 → **우측 하단, 상태줄 위(36px)**. 조회·저장 버튼을 가리지 않게 한다. 최대 3개, 3초                    |


## 3. 디자인 값

- **글꼴**: Pretendard Variable (m-mcm 이 `pretendard` npm 패키지로 번들), 숫자 tnum.
- **크기**: 본문 12.5px, 보조 12px, 캡션 11px, 화면 제목 16px.
- **컨트롤·행 높이**: 입력·버튼 26px, 그리드 행 26px·헤더 28px. 반경 3px.
- **표면**: 앱 바탕 `#e9ecf0`, 카드 `#fff`, 패널 머리 `#f1f3f6`, 그리드 헤더 `#e3e8ee`, 줄무늬 `#f6f8fa`.
- **선**: 기본 `#c9d0d9`, 강조 `#9aa5b3`, 옅은 `#e3e7ec`. 그리드는 열 구분선을 둔다.
- **셸**: 헤더 44px `#1c2530`, 사이드바 `#26313e`(선택 항목 파랑 채움), MDI 탭 바 `#d5dbe2`·활성 탭 흰색.
- **상태색**: 위험 `#d42a2a`, 성공 `#13663a`/`#d8f0e0`, 경고 `#a15c07`/`#fef3c7`, 선택 행 `#dbe8fb`.

## 4. 구조

1. `shared/src/styles/variables.css`: 원시 팔레트(`--c-*`)와 의미 토큰(`--color-*`, `--shell-*`) 두 층.
 기존 토큰 이름은 모두 유지하고 값만 바꾼다. Mantine xs 높이를 26px 로 재정의한다.
2. `shared/src/ui-provider/theme.ts`: `dmes`·`danger` 팔레트를 새 값으로 재구성(이름 유지),
 `loginBrand` 는 `dmes` 별칭, Pretendard·반경 3px·글자 크기 반영.
3. shared CSS 전 파일(grid·form·modal·tree·layout·portal-shell·login)과 `m-mcm/app/page-layout.css`,
 `m-analog` log-viewer.css 의 하드코딩 색상을 의미 토큰으로 치환하고 C 톤 값으로 조정한다.
 클래스명·DOM 구조는 바꾸지 않는다(e2e 계약 유지).
4. 그리드: ag-grid 33 의 `--ag-*` 변수를 토큰으로 구동한다. `ag-theme-alpine` 클래스명은 유지한다.

## 5. 검증

- before 와 같은 14개 화면을 [`assets/2026-09-23-ui-phase2-after/`](assets/2026-09-23-ui-phase2-after/) 에 다시 캡처해 비교한다.
- DOM 에서 입력·버튼 26px, 그리드 행 26px, 글꼴 Pretendard 적용을 계측한다.
- `pnpm test:unit:shared`, 로그인 스모크 e2e, shared 빌드가 통과해야 한다.

