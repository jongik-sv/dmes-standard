# BE 리팩토링 2026-10 (2회차) — 작업 관리

작성일 2026-10-16. 대상은 `src/backend` 만이다(UI 는 다음 회차). 이 문서는 할 일 목록과 진행 상태의 정본이고, 항목별 근거는 [findings.md](./findings.md) 에 있다.

- 1회차(2026-10-04, 5레인)의 기록은 [../refactor-2026-10/](../refactor-2026-10/README.md) 에 있다. 1회차에서 이미 한 일·결정한 일은 아래 표의 「1회차」 칸에 번호로 적었다.
- 감사 방법: 2026-10-16 읽기 전용 감사 6개(mdm 3영역, mcm-core, mcm·빌드, 프레임워크) 결과를 조정 세션이 모으고, 상위 지적은 코드를 다시 열어 확인했다. 확인하지 않은 항목은 「검증」 칸에 `미확인` 으로 둔다.
- 기준 커밋: 이 문서를 커밋한 `dev` 커밋에 태그 `refactor-be-2026-10-base` 를 단다.
- 이번 회차 범위(2026-10-16 사용자 결정): **1단계(결함)와 2단계(공통화·정리)**. 3·4단계는 결정만 기록하고 다음 회차에 한다.

## 1. 진행 규칙

1회차 [README §2~§5](../refactor-2026-10/README.md) 를 그대로 따르고, 다른 점만 적는다.

- **삭제하지 않는다.** 쓰지 않는 코드는 `git mv` 로 archive 에 옮기고 빌드·시험 대상에서 뺀다(1회차 사용자 결정).
- **동작 보존이 원칙이다.** 바꾸기 전에 특성 시험을 먼저 깐다. 동작이 바뀌는 수정은 `fix(...)` 커밋으로 따로 둔다.
- 「결정 필요」 항목은 사용자 결정 전에 착수하지 않는다.
- `build.gradle`·`settings.gradle`·`gradle.properties`·`libs.versions.toml` 은 빌드 담당 레인 하나만 고친다.
- `src/backend/oasis` 는 고치지 않는다. 머지된 Flyway V 파일은 고치지 않는다(`flyway-migration-add` 스킬).
- OASIS 서비스·BPMN 을 바꾸면 커밋 전 `check_oasis_contract.mjs` ERROR 0 을 확인한다.
- 룰 엔진 로직(흐름 순회·값 변환·세트 모양)은 TS 사본과 공유 코퍼스(`rule-set-corpus.json` 등)로 맞춰져 있다. 이쪽을 바꾸면 TS·코퍼스를 함께 바꾼다.
- 메인 체크아웃의 작업 트리에는 이번 일과 무관한 변경(docs·poc·scripts 이동)이 있다. 레인은 워크트리에서만 일하고, 그 변경을 스테이징하지 않는다.
- 실행 수단: 레인(Orca 탭 세션), 서브에이전트, Workflow, opencode 워커 모두 쓸 수 있다. 기계적인 이동·치환은 sonnet 이나 opencode, 설계 판단·리뷰는 opus 를 쓴다.

## 2. 상태 값

| 상태 | 뜻 |
|---|---|
| 대기 | 착수 가능, 아직 시작 안 함 |
| 결정 필요 | 사용자 결정 뒤 착수 |
| 설계 필요 | 영향이 커서 설계 문서를 먼저 쓴다 |
| 진행 | 레인이 작업 중 |
| 리뷰 | 구현 끝, 리뷰·시험 중 |
| 완료 | dev 에 머지됨(커밋 칸에 머지 커밋) |
| 보류 / 제외 | 이번 회차에서 하지 않음(이유를 비고에) |

작업량 S·M·L, 위험 L·M·H. 검증은 `확인`(조정 세션이 코드로 확인) 또는 `미확인`(감사 보고만).

## 3. 단계와 항목

### 1단계 — 결함 (fix 커밋)

| ID | 항목 | 모듈 | 작업량 | 위험 | 검증 | 1회차 | 상태 | 레인 | 커밋 |
|---|---|---|---|---|---|---|---|---|---|
| F1 | ERD 가 도메인 상속(길이·소수·타입)을 무시 | mdm | S | M | 확인 | | 대기 | erd-term | |
| F2 | mcm-core `BusinessException` 사본이라 OASIS 응답에서 행 오류(errors[])·코드가 빠짐 | mcm-core, cactus-core | M | M | 확인(코드), 실행 미확인 | a8 S9 | 대기 | mcm | 현재 출력 특성 시험 먼저 |
| F3 | 용어 저장 경로 두 개의 규칙 불일치(중복 약어·임베딩·캐시) | mdm | M | M | 미확인 | | 대기 | erd-term | |
| F4 | 엔진 `ValueConverter` 두 벌의 지수 표기 처리 불일치 | maru-mdm-engine, mdm | M | H | 확인 | | 대기 | rule | TS 사본·코퍼스 확인 뒤 착수 |
| F5 | analog `ClientKeyFilter` 에 상수 시간 비교 누락 | analog | S | L | 미확인 | | 대기 | mcm | |
| F6 | DML 가드(`QueryStatementGuard`) 의 주석·문자열 마스킹이 `SqlGuard` 보다 약함 | mcm-core | S | M | 미확인 | | 대기 | mcm | |
| F7 | `SecUserService` search·save·resetPassword 가 동작하지 않는 죽은 경로 | mcm-core, mcm | S | L | 확인 | a6-1 미룸 | 대기 | mcm | 보관, 메뉴·권한 읽기 유지 |

### 2단계 — 공통화·정리 (위험 낮음)

| ID | 항목 | 모듈 | 작업량 | 위험 | 검증 | 1회차 | 상태 | 레인 | 커밋 |
|---|---|---|---|---|---|---|---|---|---|
| C1 | `parseApplyFrom`·`applyFromError`·`issueMap` 을 `common/version` 으로(화면 → 화면 의존 제거) | mdm | S | L | 미확인 | b9-4 | 대기 | version | |
| C2 | 「미적용 버전」 판정 5곳 이상을 `VersionRules.isUnapplied` 하나로(넓은 뜻) | mdm | S | M | 미확인 | | 대기 | version | |
| C3 | 「새 버전 만들기」 4벌을 `VersionStateService.newVersion` 훅으로, `CodeVersionService` 추출, `MasterCodeVersionNumbers` 보관 | mdm | M | M | 미확인 | | 대기 | version | 오류 코드 변경은 fix 커밋 분리, FE 사용처 확인 |
| C4 | `common/version` → `dmb.layout` 역의존을 SPI 로 끊기 | mdm | S | L | 미확인 | | 대기 | version | |
| C5 | 패키지 재배치: `dma.naming`·`DomainTestCaseRunner` → common, `common/rule` 단일 사용 클래스 6개 → 화면, `RuleExprParser` 추출, layout 코어의 화면 DTO 의존 제거. ArchUnit 으로 고정 | mdm | M | L | 미확인 | | 대기 | rule | layout 코어 부분은 version 레인(C4 와 같은 영역) |
| C6 | dmc `CodeCateEdit`·`CodeItemEdit` 의 같은 private 헬퍼 약 14개 → `MasterCodeScreenSupport` | mdm | S | L | 확인(일부) | b9-4 | 대기 | version | |
| C7 | 코드·데이터 헤더 규칙 사본 → `MaruHeaderRules`, `TB_MDM_DATA` 헤더 SQL 3-4곳 통합 | mdm | M | L | 미확인 | | 대기 | version | |
| C8 | ERD 정리: `ErdEventHub` 분해, `stream`↔`service` 순환 제거, `ErdEditService` 인라인 SQL → Store, 다이어그램 매퍼·편집자 쿼리 사본 통합 | mdm | M | M | 미확인 | | 대기 | erd-term | |
| C9 | 용어 저장 `TermWriter` 하나로(F3 와 함께) | mdm | M | M | 미확인 | | 대기 | erd-term | |
| D1 | 참조 0건 mdm Repository 5개 보관 | mdm | S | L | 확인 | | 대기 | erd-term | |
| D2 | mcm-core `Mom*` 엔티티 7개·`KeyStore` 등 약 1,360줄 보관 | mcm-core | S | L | 미확인 | | 대기 | mcm | |
| D3 | `McmSecurityDefaults` 의 없는 BPMN matcher 7개 정리 | mcm-core | S | L | 미확인 | | 대기 | mcm | |
| D4 | `RuleSetRunner` OASIS 진입(약 200줄, 시험 BPMN 만 사용) | mdm | S | L | 미확인 | | 대기 | rule | 보관. OASIS 계약 검사 ERROR 0 |
| D5 | mls·mpp·mqc·mpn 의 쓰지 않는 jsoup 의존 | 빌드 | S | L | 미확인 | | 대기 | build | |
| D6 | 모듈 5개의 `Sample*` 슬라이스(템플릿 예시) | 빌드, 여러 모듈 | M | M | 미확인 | | 제외 | | 유지(템플릿 저장소의 예시) |

### 3단계 — 구조 (위험 중간)

| ID | 항목 | 모듈 | 작업량 | 위험 | 검증 | 1회차 | 상태 | 레인 | 커밋 |
|---|---|---|---|---|---|---|---|---|---|
| S1 | 모듈 간 소스 읽기 제거: mdm 시험의 `MdmMenuSeeder.java` 정규식 파싱 → 모듈별 선언 파일, `ScreenUsageOasisContractTest` → mcm/api, `DmdScreenMessageParityTest` → 메시지 코드 | mcm, mdm, mcm-core | M-L | M | 확인(빌드 입력) | 1b S7·S8·S21 | 대기 | | 다음 회차. 1차는 상수 클래스 |
| S2 | 환율: provider 를 mdm 으로, `FxMasterReader` 의 mdm 테이블 직접 읽기 제거, `ExchangeRateSyncService` 원시 SQL → `DataSegmentRowStore` | mcm-core, mdm | M | M | 미확인 | | 대기 | | |
| S3 | 읽기 전용 SQL 커널 통합(`JobCollectSql`·`WidgetQueryExecutor` 사본, 마스커 두 벌) | mcm-core | M | M | 미확인 | | 대기 | | F6 과 함께 |
| S4 | 큰 클래스 분해: `RuleSetEditService`·`RuleCalcService`·`LayoutMngService`·`CodeEditService`·`SecWidgetService`·`NoticeMgmtService`·`QueryParams`·`WidgetQueryExecutor`·`RuleColumnsService` | mdm, mcm-core, mcm | L | M | 미확인 | | 대기 | | 클래스마다 하위 항목으로 나눈다 |
| S5 | mcm-core 규칙 위반: 컨트롤러 2개 이동(ADR-0003 D4), 화면 전용 repository 이동, `JobServerConfig` 역의존, mcm-core·mcm/lib 구분 규칙 문서화 | mcm-core, mcm | M | L | 미확인 | | 대기 | | |
| S6 | 트랜잭션 규약 통일(dmd 는 직접 경계, dmc·dmb 는 OASIS 위임) — ADR 과 ArchUnit | mdm | M | M | 미확인 | | 대기 | | 다음 회차. OASIS 위임으로 통일 |
| S7 | 빌드: mdm 에 `dmes.business-module` 적용, 단일 모듈 9개용 `dmes.java-library`, 카탈로그 별칭 쌍 정리, MES 4모듈 공통 시험·yml, `includedProjectNames` 자동화 | 빌드 | M | M | 미확인 | 1b S18·S19 | 대기 | | 빌드 레인 전담 |
| S8 | 응답 봉투 두 종(`ApiResponse`·`CactusResponse`) 통일 | cactus-core, mcm | M | M | 미확인 | | 보류 | | FE 계약 변경. UI 회차와 함께 |
| S9 | analog 패키지 루트 두 개(`analog`·`analogexpress`) 통일, DB viewer 분리 | analog | M | L | 미확인 | | 대기 | | |

### 4단계 — 설계 먼저 (영향 큼)

| ID | 항목 | 모듈 | 작업량 | 위험 | 검증 | 1회차 | 상태 | 레인 | 커밋 |
|---|---|---|---|---|---|---|---|---|---|
| X1 | cactus-core 가 mcm 테이블(`TB_MCM_JOB_RUN`·`TB_MCM_MOM_*`)에 직접 SQL — 포트로 바꾸고 구현은 mcm-core 로 | cactus-core, mcm-core, MES 모듈 | L | M-H | 미확인 | | 설계 필요 | | |
| X2 | cactus-core 안 MDM 클라이언트 SDK(38파일) → `cactus-mdm` 모듈 분리 | cactus-core, 빌드 | M | L-M | 확인(의존) | | 설계 필요 | | |
| X3 | 룰 흐름 순회 4벌·세트 모양 2벌·버전 선택 규칙 2벌·`usedVariables` 를 엔진 하나로 | maru-mdm-engine, mdm, cactus-core, TS | L | H | 확인(일부) | | 설계 필요 | | TS·코퍼스 동반 |
| X4 | mcm-core 의 job agent 를 별도 라이브러리로(재사용 면적이 job·widget.ext 뿐) | mcm-core, MES 모듈 | M | M | 미확인 | | 설계 필요 | | |
| X5 | `be-run.sh`·`be-run.ps1` 공통 로직 통합 | 스크립트 | L | H | 미확인 | 1b S5 | 보류 | | Windows 검증 수단 없음(1b-1) |
| X6 | `TB_SEC_CODE_ITEM` 을 cactus-core·mcm-core 가 이중 매핑 | cactus-core, mcm-core | M | M | 미확인 | | 설계 필요 | | |
| X7 | `/query/{queryId}` 권한 판정이 다른 모듈 BFF 에 기댐 — `QueryAccessPolicy` SPI | cactus-core | S-M | M | 미확인 | | 설계 필요 | | |

## 4. 결정 (2026-10-16 사용자: 권고안대로)

| ID | 결정할 것 | 결정 |
|---|---|---|
| F4 | 숫자 글자의 지수 표기(`1e3`)를 받을지 | 거부로 통일(도메인 검증과 같게). 착수 전 TS 사본·코퍼스가 지금 어떻게 처리하는지 확인한다. 받고 있으면 TS·코퍼스도 같은 fix 커밋에서 바꾼다 |
| F7 | 죽은 경로를 보관할지(1회차는 미룸) | 보관(archive). 메뉴·권한 읽기는 유지 |
| C2 | 「미적용」 뜻: DRAFT+미래 RELEASED 만인지, REQUESTED·APPROVED 포함인지 | 포함(넓은 뜻). 지금은 두 상태가 안 생기므로 동작 차이 없음 |
| C3 | 코드 화면 새 버전 오류 코드(INVALID → TRANSITION_NOT_ALLOWED) 변경 허용 | 허용. fix 커밋을 따로 두고, 바꾸기 전에 `src/frontend` 가 옛 코드 문자열을 쓰는지 확인한다 |
| D4 | `RuleSetRunner` OASIS 진입을 쓸 계획이 있는지 | 계획 없음으로 보고 보관. 커밋 전 `check_oasis_contract.mjs` ERROR 0 |
| D6 | `Sample*` 슬라이스 유지 여부 | 유지(제외) |
| S1 | 메뉴·권한 선언을 리소스 파일(JSON)로 옮길지, 상수 클래스로 둘지 | 1차는 상수 클래스, 선언 파일은 다음. 실행은 다음 회차 |
| S6 | 화면 서비스 트랜잭션 규약 | OASIS 위임으로 통일. 실행은 다음 회차 |
| S8 | 응답 봉투 통일과 FE 계약 변경 | 보류(UI 회차와 함께) |

## 5. 레인 배치

파일이 겹치지 않게 나눈다. 워크트리는 태그 `refactor-be-2026-10-base` 에서 만든다.

| 레인 | 브랜치 | 범위 |
|---|---|---|
| version | `refactor-be/mdm-version` | C1·C2·C3·C4·C6·C7, C5 중 layout 코어의 화면 DTO 의존 제거 |
| erd-term | `refactor-be/mdm-erd` | F1·F3·C8·C9·D1 |
| rule | `refactor-be/mdm-rule` | F4·C5(layout 코어 부분 제외)·D4 |
| mcm | `refactor-be/mcm` | F2·F5·F6·F7·D2·D3 |
| build | `refactor-be/build` | D5, 다른 레인의 의존성 요청 |

레인 공통 지시:

- `미확인` 항목은 먼저 코드로 다시 확인한다. 지적이 틀렸으면 고치지 않고 조정자에게 보고한다(감사에서 틀린 지적이 이미 1건 나왔다).
- 동작이 바뀌는 항목(F1~F7, C3 오류 코드)은 현재 동작을 특성 시험으로 잡은 뒤 `fix(...)` 커밋으로 바꾼다.
- 시작할 때 대상 모듈의 빌드·시험 기준선을 기록하고, 이미 실패하던 시험은 따로 적는다. 로컬 서버(bootRun·고정 포트)는 띄우지 않는다.

## 6. 진행 기록

| 날짜 | 내용 |
|---|---|
| 2026-10-16 | 감사 6개 완료, 이 문서와 findings.md 작성 |
| 2026-10-16 | 결정 9건 권고안대로 확정(D4 는 「쓸 계획 없음」으로 간주). 범위 1·2단계, 레인 5개 확정 |
