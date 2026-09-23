# DMES-MES 개발 가이드

이 문서는 `RULE.md` 라우터의 **분기 3: MES 개발** 전용 진입점이다. APS 작업은 `docs/aps/Aps-Guide.md`, MES 화면 설계 작업은 `docs/guide/design/README.md` 로 간다.

## 0. Agent 빠른 실행 경로

1. `RULE.md` 에서 작업이 MES 개발 분기인지 확인한다.
2. 대상 화면의 `docs/{moduleId}/design/{screenId}/` 폴더와 5종 설계 산출물을 확인한다.
3. 산출물 누락, G1~G7 미통과, 정합체크 불일치, `[확인필요]` 잔존이 있으면 구현을 멈추고 설계 보완으로 환송한다.
4. 산출물이 통과 상태이면 분석리포트 → 기능설계서 → 디자인설계서 → BPMN설계서 → 정합체크서 순서로 읽는다.
5. Backend 는 `BackEnd/BackEnd_표준_통합_개발가이드_v2.md`, Frontend 는 `FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md` 와 `FrontEnd/Local-Rules.md` 를 따른다.
6. 신규 화면(팝업 포함)은 **메뉴·권한 등재**(OBJECT · 메뉴 leaf · 역할 매핑 · action 시드)까지 한다. 절차 정본은 [Backend 표준 04 §13-3](../BackEnd/standard-v2/backend-standard/04-cases-checklist-menu.md#13-3-신규-메뉴권한-등재-절차-must) 이다. 등재가 빠지면 코드가 통과해도 화면에 들어갈 수 없거나 모든 호출이 403 이므로 개발 완료로 보지 않는다.
7. 변경 후 관련 Backend test, Frontend build, 설계-구현 정합 대조, 메뉴·권한 실측을 수행한다.

## 1. 적용 범위

| 구분 | 적용 |
|---|---|
| 대상 | APS 를 제외한 {CLIENT} MES 업무 모듈: `mpp`, `mqc`, `mls`, `mas`, `mcm` 등 |
| Backend 경로 | `src/backend/{moduleId}` |
| Frontend 경로 | `src/frontend/m-{moduleId}` |
| 설계 산출물 경로 | `docs/{moduleId}/design/{screenId}/` (mdm 은 `docs/mdm/screens/{screenId}/`) |
| 패키지 | `com.dongkuk.dmes.{moduleId}.*` |

`src/backend/{moduleId}` 또는 `src/frontend/m-{moduleId}` 가 없으면 임의 생성하지 말고 사용자 확인 후 진행한다.

## 2. 분기 판정

| 상태 | 진입점 |
|---|---|
| APS 화면/엔진/`mpn`/`aps-core` 작업 | `docs/aps/Aps-Guide.md` |
| MES 화면 설계 산출물 작성 | `docs/guide/design/README.md` |
| MES 5종 설계 산출물 기반 구현 | 이 문서 |

MES 개발 요청이어도 5종 설계 산출물이 없거나 분석리포트가 없으면 개발 분기로 진입하지 않는다.

## 3. 필수 입력 산출물

한 화면당 아래 5종 산출물이 있어야 한다.

| 순서 | 산출물 | 확인할 내용 |
|---:|---|---|
| 1 | `{screenId}_분석리포트.md` | As-Is 전수 분석, 자료 인벤토리, G1~G7 분석완료 게이트 |
| 2 | `{screenId}_기능설계서.md` | 필드, 조회조건, 그리드, 버튼, 상태, 검증, 부수효과 |
| 3 | `{screenId}_디자인설계서.md` | 레이아웃, 컴포넌트, 팝업, 반응형, 화면 상태 |
| 4 | `{screenId}_BPMN설계서.md` | `serviceId`, `action`, API 패턴, 서버 처리 흐름 |
| 5 | `{screenId}_정합체크.md` | 4종 산출물 간 정합, 개발 착수 가능 여부 |

컬럼 매핑이 별도 파일로 분리된 화면은 `docs/{moduleId}/reference/mapping/{screenId}_mapping.md` 도 함께 확인한다.

## 4. 개발 진입 가드

| 상태 | Agent 행동 |
|---|---|
| 설계 폴더 없음 | 구현 금지. 화면 설계 분기(`docs/guide/design/README.md`)로 환송할지 사용자에게 확인한다. |
| 5종 중 일부 누락 | 구현 금지. 누락 산출물명을 보고하고 보완을 요청한다. 분석리포트 누락은 예외 없이 차단한다. |
| G1~G7 미통과 또는 조건부 통과 | 구현 보류. 미통과 사유를 정리하고 설계 보완 또는 사용자 결정을 요청한다. |
| 정합체크서에 불일치 잔존 | 해당 범위 구현 보류. 불일치 항목을 먼저 해소한다. |
| `[확인필요]` 또는 open Q-NNN 잔존 | 임의 추정 금지. 사용자 결정을 받은 뒤 산출물 갱신 여부를 판단한다. |
| 5종 존재 + 게이트 통과 + 정합 OK | 개발 진행 가능. |

사용자가 설계 없이 진행을 명시 승인해도 그 사실을 작업 결과에 기록하고, 사후 설계 산출물 보완을 권고한다.

## 5. 구현 시 읽기 순서

1. 분석리포트: As-Is 항목 수, 근거, G1~G7, Q-NNN 을 확인한다.
2. 기능설계서: 구현해야 할 WHAT 을 확정한다.
3. 디자인설계서: 화면 구조와 사용자 상호작용을 확정한다.
4. BPMN설계서: 서버 흐름, API, `serviceId`, `action` 을 확정한다.
5. 정합체크서: 구현 진입 가능 여부와 불일치 항목을 최종 확인한다.

설계서와 코드의 화면 식별자, 필드 ID, 버튼 ID, 팝업 ID, DB 컬럼, 상태코드, `serviceId`, `action` 은 같은 값으로 유지한다. 변경이 필요하면 설계 산출물을 먼저 갱신하고 정합체크를 다시 통과시킨다.

## 6. 구현 정본 가이드

| 영역 | 정본 |
|---|---|
| MES Backend / OASIS / BPMN | [`../BackEnd/BackEnd_표준_통합_개발가이드_v2.md`](../BackEnd/BackEnd_표준_통합_개발가이드_v2.md) |
| Frontend 표준 | [`../FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md`](../FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md) |
| Frontend 로컬 운영 규칙·UI 검증·중요 액션 UX | [`../FrontEnd/Local-Rules.md`](../FrontEnd/Local-Rules.md) |
| Backend 공통 패턴 | [`../BackEnd/Backend-Implementation-Guide.md`](../BackEnd/Backend-Implementation-Guide.md) |
| 비즈니스 로직 공통 패턴 | [`../BackEnd/Business-Logic-Guide.md`](../BackEnd/Business-Logic-Guide.md) |
| 식별자 용어 | [`../Common/Identifier-Glossary.md`](../Common/Identifier-Glossary.md) |
| workspace/package 명칭 | [`../Common/Workspace-Structure.md`](../Common/Workspace-Structure.md) |
| Oracle → MSSQL 참고 | [`../Database/README.md`](../Database/README.md) |

MES OASIS/BPMN 구현에서는 `BackEnd_표준_통합_개발가이드_v2.md` 가 `BackEnd/Backend-Implementation-Guide.md` 보다 우선한다.

## 7. 공통 구현 규칙

- 설계와 구현이 다르면 구현을 수정한다. 설계 자체가 틀렸다면 설계 산출물을 먼저 개정한다.
- Backend 업무 API 진입은 BPMN/OASIS 표준을 따른다. 일반 업무 API 를 임의 `@RestController` 로 우회하지 않는다.
- Frontend 는 `src/frontend/m-{moduleId}` 에 구현하고 portal 은 필요한 재내보내기만 둔다.
- 일반 MES 업무 모듈은 cactus-core 기본 `SecurityFilterChain` 을 사용한다. 모듈별 보안 예외가 필요하면 근거를 남긴다.
- BFF 공유키 환경변수는 `BACKEND_CLIENT_KEY` 를 사용한다.
- DB 스키마 변경 시 SQLite/MSSQL migration 을 함께 작성하고, 테스트/local schema 설정과 sample data 를 갱신한다.
- 사용자 입력값 중 처리에 영향을 주는 값은 backend 에서 DB 권위 값을 재조회해 검증한다.

## 8. 검증 기준

| 변경 | 최소 검증 |
|---|---|
| Backend | `cd src/backend && ./gradlew :{moduleId}:test --rerun` |
| Frontend | `cd src/frontend/m-{moduleId} && pnpm build` |
| DB schema | migration 적용 테스트 + 관련 API 테스트 |
| 화면별 개발 | 설계 산출물의 필드/버튼/API/action/상태/검증 1:1 대조 |
| 신규 화면 메뉴·권한 | admin 로그인 → 사이드바 진입 → 설계서의 모든 action 403 없음 (Backend 표준 04 §13-3) |

대상 모듈의 관례가 더 좁은 targeted test 를 제공하면 먼저 실행하고, 변경 범위가 넓으면 모듈 기본 test/build 까지 확인한다.
