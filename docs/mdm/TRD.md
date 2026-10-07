# TRD — 마루 MDM (dmes-standard 개발분)

> version: 1.3 · 작성: 2026-09-23 · 개정: 2026-09-23(결재·배포·수신 보류), 2026-09-24(전사 아키텍처 확정 — TSK-02-01), 2026-09-24(엔진 계약·임베딩 방식 — TSK-02-02)
> 근거: 현재 dmes-standard 저장소 환경(RULE.md, `docs/guide/**`, `src/backend/**`, `src/frontend/**`).
> 기능 범위는 `docs/mdm/PRD.md`, 상세 규칙은 원천 설계 `docs/mdm/design/basic/02~06`.
> 이 문서에 적은 명령은 저장소 문서·스크립트에서 옮긴 것이며 이 문서 작성 시점에 실행해 확인하지 않았다.

## 1. 모듈 배치 (사용자 결정 2026-09-23: 새 `mdm` 모듈)

| 구성 | 위치 | 형태 | 참고 모델 |
|---|---|---|---|
| 백엔드 사이트 모듈 | `src/backend/mdm/` (`lib` + `api`) | Gradle composite build 참여, Boot 런처·WAR | `src/backend/mqc/` |
| 평가 엔진 | `src/backend/maru-mdm-engine/` | 독립 `java-library` jar. 의존은 EvalEx 3.7.0 하나 | 01 §8, 06 「엔진 모듈」 |
| 프론트엔드 화면 라이브러리 | `src/frontend/m-mdm/` (`@dk-oasis/m-mdm`) | tsup 빌드 라이브러리, `pages/{group}/{screenId}/page.tsx` | `src/frontend/m-mqc/` |
| 호스트 앱 | `src/frontend/m-mcm/` | m-mdm 화면을 포털 탭으로 적재(`page-registry` 코드젠) | `m-mcm/README.md` |

- 패키지: `com.dongkuk.dmes.mdm.{group}.{screenId}.{dto,service}`, 공용 `entity/`, `repository/` (Workspace-Structure §2~§5).
- 엔진 패키지: `kr.dongkuk.maru.mdm.engine.{expr,rule,domain,code,spi,flow}` (06 「엔진 모듈」, 스캐폴드 실물 — TSK-01-01 D7). 계약: [engine-contract.md](engine-contract.md)
- `src/backend/settings.gradle` 에 `includeBuild('mdm')`, `includeBuild('maru-mdm-engine')` 를 추가하고, 루트 `build.gradle` 의 `includedProjectNames` 에 넣어 `testAll` 대상이 되게 한다.
- 로컬 포트: 8096 (기존 8092~8095·8100 과 겹치지 않는 값. `be-run.sh` 에 `--mdm` 추가). 확정은 스캐폴드 Task.

## 2. 기술 스택

| 구분 | 스택 | 근거 |
|---|---|---|
| 언어·런타임 | Java 21, Spring Boot 4.0.6, Gradle 9.3.1 wrapper(`src/backend/gradlew`) | `src/backend/mcm/build.gradle`, wrapper properties |
| 프레임워크 | cactus-core 1.0.22-SNAPSHOT(보안·JWT·다중 DS/TX), OASIS 5.1.1(BPMN 서비스) | 각 `build.gradle` |
| 영속성 | JPA(엔티티·Repository) + JPA native 쿼리(방언별 SQL). MyBatis 는 쓰지 않는다 | backend-standard 04 MES 모듈 규칙, [명명·방언 규칙](naming-dialect-rules.md) §4 |
| DB | 로컬·테스트 SQLite. 운영 DB 는 Oracle 또는 PostgreSQL 로 좁혀졌고(2026-10-03) 방언은 아직 더하지 않았다(WildFly JNDI 프로파일만 둔다, [ADR-0004](adr/0004-drop-mssql-production-assumption.md)) | `application-*.yml` |
| 식 엔진 | EvalEx 3.7.0 (precision 68, HALF_EVEN, allowOverwriteConstants=false, 시간대 Asia/Seoul·로캘 ROOT 고정) | 06, evalex-guide, [engine-contract.md](engine-contract.md) |
| 임베딩(용어 유사어 2차) | KURE-v1 ONNX INT8 + ONNX Runtime Java 1.30.0(CPU) + DJL tokenizers 0.38.0, CLS 풀링·L2. mdm 서버 모듈에만 둔다(엔진 jar 금지). 저장은 원장 칼럼 + 서버 메모리 전수 비교 | 02 「유사어 추천 방식」, [term-embedding.md](term-embedding.md) |
| 프론트 | Next.js 16.1.6(App Router, m-mcm), React 19, TypeScript 5.9, Mantine 9, AG Grid 33, decimal.js | `m-mcm/package.json`, `shared/package.json` |
| 패키지 관리 | pnpm 10 workspace | `src/frontend/pnpm-workspace.yaml` |
| 테스트 | JUnit 5 + Spring Boot Test, Vitest 3, Playwright 1.58 | 각 package.json·build.gradle |

## 3. API 규약

- 업무 API 는 OASIS BPMN 표준: `mdm/api/src/main/resources/services/{group}/{screenId}.bpmn` → `camunda:class` 서비스 빈. 임의 `@RestController` 우회 금지(Mes-Guide §7).
- 경로: `/api/mdm/oasis/{serviceId}/{action}` (RBAC-PATH-CONVENTION §8). REST 가 필요한 경우 `POST /api/mdm/{objId}/{action}`.
- 수신 API(EXTERNAL 원천 04·05·06)는 결재·배포와 함께 보류한다(PRD §2 규칙 7). 구현할 때 인증 방식을 정한다(caravan-hub 연계 후보).
- OASIS/BPMN 을 고친 뒤에는 `oasis-contract-check` 로 ERROR 0 을 확인한다.

## 4. 데이터베이스

### 4.1 테이블 (원천 설계 기준 33개 + 수신 로그)

배포 대상(`*_SYSTEM`, `TB_MDM_COLUMN_SYSTEM` 제외)·배포 순번(`TB_MDM_DICT_SEQ`, `chg_seq`)·수신 로그(`*_RECV*`) 테이블은 설계대로 만들되 이번 범위의 코드는 쓰지 않는다(T4, PRD §2 규칙 7).

- 공통: `TB_MDM_SYSTEM`
- 02: `TB_MDM_UNIT`, `TB_MDM_TERM`, `TB_MDM_DOMAIN`, `TB_MDM_COLUMN`, `TB_MDM_COLUMN_SYSTEM`, `TB_MDM_DICT_SEQ`, `TB_MDM_DICT_SYSTEM`
- 03: `TB_MDM_EAI`, `TB_MDM_LAYOUT`, `TB_MDM_LAYOUT_ITEM` (+ 헤더 적층·상수 재정의 테이블은 설계 Task 에서 결정)
- 04: `TB_MDM_CODE`, `TB_MDM_CODE_SYSTEM`, `TB_MDM_CODE_VER`, `TB_MDM_CODE_ITEM`, `TB_MDM_CODE_CATE`, `TB_MDM_CODE_CATE_ITEM`, `TB_MDM_CODE_RECV`
- 05: `TB_MDM_DATA`, `TB_MDM_DATA_SYSTEM`, `TB_MDM_DATA_ITEM`, `TB_MDM_DATA_CATE`, `TB_MDM_DATA_CATE_ITEM`, `TB_MDM_DATA_RECV`, `TB_MDM_DATA_RECV_ITEM`
- 06: `TB_MDM_RULE`, `TB_MDM_RULE_SYSTEM`, `TB_MDM_RULE_VER`, `TB_MDM_RULE_VAR`, `TB_MDM_RULE_ROW`, `TB_MDM_RULE_TEST_CASE`, `TB_MDM_RULE_SET`, `TB_MDM_RULE_RECV`

### 4.2 방언 매핑 (설계는 PostgreSQL 문법 전제)

확정 규칙표(2026-09-24, TSK-02-01): [naming-dialect-rules.md](naming-dialect-rules.md) §3. 아래 표는 요약이며 충돌하면 규칙표가 우선한다.

운영 DB 는 Oracle 또는 PostgreSQL 로 좁혀졌지만(2026-10-03) 방언을 아직 더하지 않아 방언 열은 SQLite(로컬·테스트) 하나다. 운영 방언을 더할 때 그 열을 더한다.

| 설계 문법 | SQLite(로컬·테스트) |
|---|---|
| `UPDATE … RETURNING` (배포 순번·식별자 발급) | `RETURNING` 지원(3.35+) |
| JSONB (`TB_MDM_RULE_ROW.cells`, `TB_MDM_RULE_SET.rule_ids` 등) | TEXT + `json_valid` CHECK, `json_each` |
| REPEATABLE READ 한 스냅샷 읽기 | WAL 읽기 트랜잭션 |
| `vector` (용어 임베딩) | `BLOB`(float32 LE 4,096바이트). DB 벡터 타입·확장은 쓰지 않는다 — [term-embedding.md](term-embedding.md) |
| 재귀 CTE(영향도·상속 트리) | 지원(공통 문안은 `RECURSIVE` 없이 WITH + UNION ALL) |

### 4.3 스키마 관리
- 새 모듈이므로 Flyway 를 쓴다. 위치 `mdm/api/src/main/resources/db/migration/mdm/sqlite` (mqc 관례). 운영 DB 는 Oracle 또는 PostgreSQL 로 좁혀졌고(2026-10-03) 방언은 아직 더하지 않았으므로, 운영 방언을 더할 때 방언 폴더를 더한다.
- 번호는 기존 최대 버전 다음으로 채번한다.
- 테이블 명명(사용자 결정 2026-09-23): 원천 설계의 `MD_*` 를 저장소 규칙 `TB_{모듈}_*` 에 맞춰 **`TB_MDM_*`** 로 바꾼다. 예: `MD_UNIT` → `TB_MDM_UNIT`, `MD_CODE_ITEM` → `TB_MDM_CODE_ITEM`.
  - 원천 설계 문서·HTML 시안·sql 도 2026-09-23 에 `TB_MDM_*` 로 바꿨다(백업: `/Users/jji/project/mdm/old/basic-before-tb-mdm-rename-2026-09-23.tar.gz`).
  - 확정(2026-09-24, TSK-02-01): 식별자 사전에 mdm 모듈을 등재하고 §A.12.7 에 mdm 대문자 예외(`TB_MDM_{역할}`, 칼럼 UPPER_SNAKE)를 둔다. 감사 칼럼 자동 주입(`McmAuditStatementInspector`)은 `TB_MDM_*` 에 적용하지 않는다 — 감사 9칼럼은 `CactusAuditEntity` 리스너가 채운다. [ADR-0001](adr/0001-physical-naming-audit-dialect.md)

## 5. 프론트엔드

- 화면은 `m-mdm/pages/{group}/{screenId}/page.tsx`(포털 codegen 이 스캔하는 경로, `src/` 없음), 팝업은 `{group}/{screenId}/{screenId}.tsx` + `index.ts` 배럴(page.tsx 금지).
- 메뉴·OBJECT·RBAC 는 백엔드 `DataInitializer` 에 시드한다. `componentPath = {group}/{screenId}`. 메뉴 등록은 화면 Task 안에서 끝낸다(orphan page 금지).
- 공통 컴포넌트: `shared/src/components/{grid,form,tree,tabs,lookup}`, `PageLayout`, 엑셀 업로드 팝업 패턴.
- 화면 그룹 코드(확정 2026-09-24, 식별자 사전 §A.2.1 영역 코드 — 목록·screenId 는 [screens/README.md](screens/README.md)):

| 그룹 | 영역 |
|---|---|
| `dma` | 용어·도메인·컬럼·단위(02) |
| `dmb` | 인터페이스 레이아웃(03) |
| `dmc` | 마스터코드(04) |
| `dmd` | 마스터데이터(05) |
| `dme` | 업무기준·룰 세트(06) |

결재 공통 그룹은 보류(PRD §2 규칙 7)다. 결재를 구현할 때 다음 순번(`dmf`)으로 등재한다.

## 6. 인증·권한

- cactus JWT + NextAuth + BFF(`m-mcm/proxy.ts`) RBAC 검증을 그대로 쓴다.
- 역할은 `MDM_STD_ADMIN`(표준 관리자)·`MDM_STEWARD`(담당자) 2종을 `TB_MCM_SEC_ROLE` 에 시드하고, 권한 세트 `PERM_MDM_READ`·`PERM_MDM_EDIT`·`PERM_MDM_CONFIRM` 을 그룹별로 매핑한다(매트릭스: [ADR-0003](adr/0003-module-boundary-screens-roles.md)). 버전 확정(`confirm`)은 담당자 권한이다. 결재자 역할과 `approve/reject/cancel` 액션은 결재 보류와 함께 미룬다.
- DRAFT 소유권(선점·해제·넘기기)은 역할이 아니라 `owner_id` 로 판정한다(04 「버전 상태와 적용시점」, 06 「테이블 설계」).

## 7. 테스트·품질 명령 (문서 기준, 미실행)

| 구분 | 명령 |
|---|---|
| BE 단위(mdm) | `cd src/backend/mdm && ../gradlew :lib:test :api:test` |
| BE 단위(엔진) | `cd src/backend/maru-mdm-engine && ../gradlew test` |
| BE 전체 | `cd src/backend && ./gradlew testAll` (mdm·엔진을 `includedProjectNames` 에 넣은 뒤) |
| FE 단위 | `cd src/frontend && pnpm --filter @dk-oasis/m-mdm test` (Vitest — 스캐폴드에서 추가) |
| Lint / Typecheck | `cd src/frontend && pnpm lint` (m-mdm 은 `tsc --noEmit`) |
| E2E | `cd src/frontend && pnpm exec playwright test e2e/mdm-*.spec.ts` |
| E2E 서버 | `./be-run.sh --mcm --mdm` (8100·8096, `--mdm` 은 스캐폴드에서 추가) + `./fe-run.sh --all -q` (5100). `be-run.sh` 는 포그라운드에서 대기하므로 `&&` 로 잇지 않는다. 로그인 `SMOKE_LOGIN_USER=admin` / `SMOKE_LOGIN_PASSWORD=admin123` |
| 계약 검사 | `node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .` |

주의: `playwright.config.ts` 는 서버를 띄우지 않는다. 테스트 전에 위 서버를 직접 띄운다.

## 8. 개발 절차 (RULE.md)

- MDM 은 MES 개발 분기(`docs/guide/MES/Mes-Guide.md`)를 탄다. 화면마다 설계 산출물 5종(분석 리포트·기능·디자인·BPMN·정합 체크)을 개발 전에 만든다.
- 산출물 위치(확정 2026-09-24): `docs/mdm/screens/{screenId}/`. `docs/mdm/design` 은 외부 mdm 프로젝트로 가는 링크(gitignore)라 커밋되지 않는다. [screens/README.md](screens/README.md)
- 스키마 변경은 `flyway-migration-add`, 되돌리기 어려운 결정은 `adr-write` 로 ADR 을 남긴다.

## 9. 가정 (Assumptions, 2026-09-23)

| # | 가정 | 확정 시점 |
|---|---|---|
| T1 | 기존 mcm `cma`/`cmb` As-Is 화면과 신규 MDM 은 병존한다. 데이터 이관은 범위 밖 | **확정** 2026-09-24 — [ADR-0003](adr/0003-module-boundary-screens-roles.md) |
| T2 | 화면 그룹 코드 `dma/dmb/dmc/dmd/dme`(가정했던 의미 기호형 코드를 식별자 사전 §A.2.1 영역 코드로 바꿈. 결재 그룹은 보류) | **확정** 2026-09-24 — [screens/README.md](screens/README.md), [ADR-0003](adr/0003-module-boundary-screens-roles.md) |
| T3 | 로컬 포트 8096 | 스캐폴드 |
| T4 | 결재·배포·수신은 이번에 구현하지 않는다(PRD §2 규칙 7). 배포 대상·순번·수신 로그 테이블은 설계대로 만들되 코드는 쓰지 않는다 | **확정** 2026-09-24 — [ADR-0002](adr/0002-version-confirm-without-approval.md) |
| T5 | 엔진 jar 는 사내 Maven 저장소 배포를 전제로 버전을 붙이되, 1차는 composite build 의존으로 쓴다 | **확정** 2026-09-24 — group `kr.dongkuk.maru.mdm`·`0.1.0-SNAPSHOT`·`maven-publish`, 1차 composite build. 스냅샷 헤더 엔진 버전 검사는 배포와 함께 보류 — [engine-contract.md](engine-contract.md) |
| T6 | 용어 임베딩은 원장 DB 밖(파일 인덱스 또는 별도 저장)에 둘 수 있다. 결정 전까지 1차 문자열 유사어로 기능한다 | **확정** 2026-09-24 — 원장 DB 안 `TB_MDM_TERM.EMBEDDING`(BLOB float32 LE) + 서버 메모리 전수 비교. 파일 인덱스·네이티브 vector 는 쓰지 않는다. 활성 벡터 10만 건 또는 추천 p95 250 ms 에서 재검토 — [term-embedding.md](term-embedding.md) |

## 10. 기술 제약 사항 (Constraints)

- 엔진 jar(`maru-mdm-engine`)는 EvalEx 외 라이브러리에 의존하지 않고 DB·네트워크를 직접 부르지 않는다. 정의·사본 조회는 `engine.spi` 인터페이스로만 받는다(01 §8).
- 업무 API 는 OASIS BPMN 으로만 노출한다.
- 원장 DDL 은 지금 SQLite 한 벌로 낸다. 운영 방언(Oracle 또는 PostgreSQL)을 더할 때 같은 Flyway 번호로 그 방언을 더한다.
- 화면은 m-mdm 라이브러리에 두고 m-mcm 포털로 적재한다. 팝업에 `page.tsx` 를 쓰지 않는다.
- 파생값(유효 식·유효 AST·요구 변수·입력 계약)은 저장하지 않고 조회 시 계산한다. 단 EvalEx 텍스트와 함께 AST JSON 은 저장한다(02 「검증식 계약」).
- 임베딩 런타임(ONNX Runtime·토크나이저)과 모델 파일은 mdm 서버 모듈 몫이다. 모델 파일(약 568 MB)은 WAR·저장소에 넣지 않고 서버 파일 경로로 준다. 모델이 없으면 2차 추천을 끄고 1차 문자열 추천만 한다.

## 11. 기술 비기능 요구사항 (Non-functional Requirements)

- 성능: 엔진 컴파일 캐시 적용 후 의사결정표 1건 판정 1 ms 이내(행 200개 기준), 화면 AST 평가 1만 행 100 ms 이내.
- 동시성: 식별자 발급은 단일 UPDATE … RETURNING 문으로 직렬화한다(배포 순번 발급은 보류). 편집 충돌은 `row_version` 으로 409 를 돌려준다.
- 호환성: 엔진 jar 는 Java 21 에서 동작한다. 배포 스냅샷 헤더의 엔진 모듈 버전(06)은 배포와 함께 보류한다.

## 12. 기술 인수 조건 (Acceptance Criteria)

- `./gradlew testAll` 이 mdm·엔진을 포함해 통과한다.
- SQLite 마이그레이션이 로컬 SQLite 기동에서 적용된다.
- `oasis-contract-check` ERROR 0.
- 서버 엔진과 화면 JS 평가기의 정합성 코퍼스 불일치 0건.
- 새 화면마다 메뉴·OBJECT·RBAC 시드가 있고 m-mcm 포털에서 열린다.

## Assumptions (auto-resolved 2026-09-23)

- prd-validate 가 TRD 에 PRD 형식 필수 절(인수 조건·비기능·제약)을 요구해 §10~§12 를 기술 관점으로 보강했다.
- 나머지 가정은 §9 표(T1~T6)를 따른다.
