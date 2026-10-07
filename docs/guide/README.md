# DMES Guide Index

이 디렉터리는 `RULE.md` 뒤에서 읽는 세부 가이드 모음이다. Agent 는 모든 문서를 훑지 말고, 먼저 `RULE.md` 의 작업 분기에서 단일 진입점을 고른 뒤 아래 표에서 필요한 문서만 읽는다.

## 1. 읽기 원칙

1. `RULE.md` 에서 작업 분기를 먼저 확정한다.
2. 분기별 진입점 문서를 먼저 읽고, 그 문서가 요구하는 하위 가이드만 추가로 읽는다.
3. APS 와 MES 가이드가 충돌하면 `RULE.md` 라우팅 결과가 우선한다.
4. MES 설계와 MES 개발은 다른 분기다. 5종 설계 산출물이 없거나 미완료이면 개발 가이드로 우회하지 않는다.
5. 보조 가이드는 필요한 영역이 생겼을 때만 읽는다.

## 2. 작업별 진입점

| 작업 | 먼저 읽을 문서 | 다음 문서 |
|---|---|---|
| 전체 라우팅 | [`../../RULE.md`](../../RULE.md) | 이 문서 |
| APS 설계/개발 | [`../aps/Aps-Guide.md`](../aps/Aps-Guide.md) | [`../aps/Aps-Design-Index.md`](../aps/Aps-Design-Index.md) |
| MES 화면 설계 | [`design/README.md`](design/README.md) | `design/00_Agent지시_가이드.md` 부터 순서대로 |
| MES 개발 | [`MES/README.md`](MES/README.md) | [`MES/Mes-Guide.md`](MES/Mes-Guide.md), BE/FE 구현 가이드 + 화면별 5종 설계 산출물 |
| 식별자/명명 판단 | [`Common/README.md`](Common/README.md) | [`Common/Identifier-Glossary.md`](Common/Identifier-Glossary.md), [`Common/Workspace-Structure.md`](Common/Workspace-Structure.md) |
| BP 협의·분석·설계 문서 사용 | [`Common/BP-Workspace-Sync.md`](Common/BP-Workspace-Sync.md) | `./tools/bp-sync --if-stale` 실행 후 `docs/external/BP/{CLIENT}/` 확인 |
| Backend 공통 구현 | [`BackEnd/README.md`](BackEnd/README.md) | [`BackEnd/Backend-Implementation-Guide.md`](BackEnd/Backend-Implementation-Guide.md), [`BackEnd/Business-Logic-Guide.md`](BackEnd/Business-Logic-Guide.md) |
| MES OASIS/BPMN Backend | [`BackEnd/BackEnd_표준_통합_개발가이드_v2.md`](BackEnd/BackEnd_표준_통합_개발가이드_v2.md) | [`BackEnd/README.md`](BackEnd/README.md), 화면별 BPMN설계서 |
| Frontend | [`FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md`](FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md) | [`FrontEnd/README.md`](FrontEnd/README.md), 화면별 기능/디자인설계서 |
| 보안/인증 | [`Security/README.md`](Security/README.md) | [`Security/Security-Guide.md`](Security/Security-Guide.md), [`Security/RBAC-PATH-CONVENTION.md`](Security/RBAC-PATH-CONVENTION.md), [`FrontEnd/Portal-Menu-Role-Policy.md`](FrontEnd/Portal-Menu-Role-Policy.md) |
| 전체 DMES 배포 | [`Operations/README.md`](Operations/README.md) | Backend+Frontend 통합 배포 가이드 |
| Frontend 모듈 패키지 발행·소비 | [`FrontEnd/README.md`](FrontEnd/README.md) | [`FrontEnd/Portal-Development-Guide.md`](FrontEnd/Portal-Development-Guide.md), [`Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md`](Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md), [`FrontEnd/Verdaccio-Guide.md`](FrontEnd/Verdaccio-Guide.md) |
| Oracle SQL 작성·로컬 Oracle DB 환경(로컬·시험·운영 모두 Oracle) | [`Database/README.md`](Database/README.md) | [`Database/oracle-sql-rules.md`](Database/oracle-sql-rules.md), [`Database/oracle-26ai-test-guide.md`](Database/oracle-26ai-test-guide.md) |
| 모듈별 참조 | [`reference/README.md`](reference/README.md) | 작업 대상 모듈 reference |
| 산출물 runner | [`runners/README.md`](runners/README.md) | runner 실행이 필요한 경우만 |

## 3. 문서 계층

| 계층 | 역할 | 대표 문서 |
|---|---|---|
| 라우터 | 작업 분기와 전역 금지/필수 규칙 | `RULE.md` |
| 분기 진입점 | APS/MES 설계/MES 개발 중 하나로 진입 | `Aps-Guide.md`, `design/README.md`, `MES/Mes-Guide.md` |
| 표준 구현 | BE/FE/비즈니스 로직 구현 패턴 | `BackEnd/*`, `FrontEnd/*` |
| 사전/참조 | 식별자, 워크스페이스, DB, 배포, 보안, 모듈 reference | `Common/*`, `Database/*`, `Security/*`, `Operations/*`, `reference/*` |
| 화면별 산출물 | 특정 화면의 구현 정본 | `docs/{moduleId}/design/{screenId}/` |

## 4. 유지보수 규칙

- 파일명을 바꾸면 `RULE.md`, 이 문서, 하위 README 의 링크를 함께 갱신한다.
- 새 가이드를 추가하면 "작업별 진입점" 표에 읽는 조건을 명시한다.
- 큰 통합본에는 본문을 더 붙이기보다 상단에 "읽기 순서"와 "정본 범위"를 먼저 둔다.
- 서로 다른 문서에 같은 규칙을 중복 작성하지 않는다. 중복이 필요하면 한 문서만 정본으로 지정하고 나머지는 링크만 둔다.
