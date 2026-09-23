# Decisions Log — project

> Append-only audit trail of autonomous decisions made during DDTR/feat/wbs cycles.
> Edit prior entries forbidden — record reversals as new entries instead.

## D-001 (2026-09-23T06:50:50Z)
- **Phase**: prd-resolve
- **Decision needed**: TRD 에 PRD 형식 필수 절(인수 조건·비기능·제약)이 없음
- **Decision made**: TRD §10~§12 를 기술 관점으로 보강
- **Rationale**: prd-validate 기본 필수 절 충족, 내용은 환경 조사 결과에서 도출
- **Reversible**: yes
- **Source**: docs/mdm/TRD.md

## D-002 (2026-09-23T06:50:50Z)
- **Phase**: wbs
- **Decision needed**: 원천 문서 간 충돌 해소 순서
- **Decision made**: 02~06 > 08 > 01 > HTML 목업. 목업 전용 화면은 개발 Task 없이 배포·수신 설계 Task 에서 결정
- **Rationale**: 01 머리말(2026-09-09) 우선 규칙, 08 은 모음 문서
- **Reversible**: yes
- **Source**: docs/mdm/PRD.md §2

## D-003 (2026-09-23T06:50:50Z)
- **Phase**: wbs
- **Decision needed**: 배포 방식(04 전체 vs 변경분)
- **Decision made**: 04 는 전체 방식, 02·05 는 변경분
- **Rationale**: 사용자가 04-master-code-deploy-full.md 를 입력으로 지정
- **Reversible**: yes
- **Source**: docs/mdm/PRD.md §2-5

## D-004 (2026-09-23T06:50:50Z)
- **Phase**: wbs
- **Decision needed**: 규모 판정(3단계/4단계)
- **Decision made**: 4단계(ACT 사용)
- **Rationale**: 기능 영역 5개 이상(02·03·04·05·06 + 엔진), Task 50개 이상, 다모듈 시스템
- **Reversible**: yes
- **Source**: docs/mdm/wbs.md

## D-005 (2026-09-23T06:57:04Z)
- **Phase**: wbs-resolve
- **Decision needed**: wbs-validate vague_action 65건(배포 45·검증 11·구현 9)
- **Decision made**: 수정하지 않음(허위 양성)
- **Rationale**: 배포·검증은 MDM 업무 용어(배포 순번, 도메인 검증기)이고 구현 9건은 특정 인터페이스 구현을 가리킴. 구조 이슈 0건, task_count 95
- **Reversible**: yes
- **Source**: docs/mdm/wbs.md

## D-006 (2026-09-23T07:00:00Z)
- **Phase**: wbs
- **Decision needed**: 테이블 명명(MD_* vs TB_*)
- **Decision made**: TB_MDM_* 로 전체 변경. 원천 설계 절 이름 인용(「MD_…」)은 원문 유지
- **Rationale**: 사용자 지시 2026-09-23. 저장소 규칙 TB_{모듈}_* 정합
- **Reversible**: yes
- **Source**: docs/mdm/TRD.md §4.3

## D-007 (2026-09-23T07:00:00Z)
- **Phase**: wbs-resolve
- **Decision needed**: max_chain_depth 9 (05 계약이 04 계약·결재 계약 경유)
- **Decision made**: 카테고리 모델·ID 이름 공간을 전사 계약(TSK-01-02-01)으로 올리고 04·05·06 계약의 불필요 의존 제거 → 깊이 8
- **Rationale**: 남은 경로는 02→03 계약 참조 + 직렬화기 실구현 의존으로 유지
- **Reversible**: yes
- **Source**: docs/mdm/wbs.md ## 의존 그래프

## D-008 (2026-09-23T07:10:34Z)
- **Phase**: wbs
- **Decision needed**: WBS 가 너무 세밀함(4단계 Task 95개) — 사용자 요청
- **Decision made**: 3단계 Task 37개로 통합(ACT 제거, ID 재부여 TSK-XX-YY). 합친 Task 는 세부 작업을 note 에 남기고 기간은 세부 기간 합계(DB 설계 10일·통합테스트 8/8/5일은 덮어씀)
- **Rationale**: 사용자 선택 '3단계 · Task 약 30개'. D'Flow import 전이라 ID 재부여 영향 없음. 이전 결정 기록(D-001~D-007)의 4단계 ID 는 이 재구성으로 대체됨
- **Reversible**: yes
- **Source**: docs/mdm/wbs.md

## D-009 (2026-09-23T07:25:34Z)
- **Phase**: wbs
- **Decision needed**: 원천 설계(mdm 프로젝트)의 MD_* 테이블 이름
- **Decision made**: docs/design/basic 의 md·html·sql·py 18개 파일 713곳을 TB_MDM_*/tb_mdm_* 로 변경(bak/·png·xls 제외). WBS 절 인용도 새 제목으로 갱신
- **Rationale**: 사용자 지시 '1번 처리해'. 백업 old/basic-before-tb-mdm-rename-2026-09-23.tar.gz, 시뮬레이터 출력(PYTHONHASHSEED=0) 변경 전후 동일
- **Reversible**: yes
- **Source**: /Users/jji/project/mdm/docs/design/basic

## D-010 (2026-09-23T11:04:16Z)
- **Phase**: wbs
- **Decision needed**: 07(배포 방법)·08(결재) 문서 적용 여부
- **Decision made**: 이번 범위에서 적용하지 않는다(D-002 의 08 순위 대체). 결재는 04·06 원문만 따르고, 배포는 02~06 기전까지만 구현한다. 전달 수단 선택·전달 어댑터·전달 로그·배포 화면·목업 전용 배포 화면은 범위 밖. 1차 전달 경로는 05 「안전망」의 주기 pull
- **Rationale**: 사용자 지시 '07, 08 문서는 아직 적용하고 싶지 않다'. 07 은 결정 전 문서, 08 은 04·06 모음 문서
- **Reversible**: yes
- **Source**: docs/mdm/PRD.md §2·§5, TRD.md T4, wbs.md TSK-01-02·01-03·01-04·02-01·04-05·06-05·08-05·09-03 등

## D-011 (2026-09-23T11:40:00Z)
- **Phase**: wbs
- **Decision needed**: 결재·배포·수신 구현 여부와 결재 없는 버전 처리, 이미 D'Flow 에 올라간 Task 처리
- **Decision made**: 결재·배포·수신은 이번에 구현하지 않는다(D-010 의 "1차 전달 경로는 주기 pull" 을 대체). 04·06 버전은 담당자가 직접 확정(DRAFT→RELEASED, 검사 8항 중 3항은 apply_from 순서 검사로 대체). 수신 API·EXTERNAL 원천 등록도 제외. DDL 은 설계대로 두고 동작·화면만 뺀다. 전부 빠지는 TSK-01-04 는 [보류] 표시로 남기고 agent 위임을 끈다. 나머지 Task 는 같은 ID 로 범위를 줄여 재업로드
- **Rationale**: 사용자 지시 '지금은 승인, 배포를 구현하지 않을거야'와 질문 응답(담당자 직접 확정 / 수신도 제외 / 보류로 남기기). D'Flow import 는 삭제하지 않으므로 ID 를 유지한다
- **Reversible**: yes
- **Source**: docs/mdm/PRD.md §2 규칙 7·§5, TRD.md T4, wbs.md

## D-012 (2026-09-23T16:20:04Z)
- **Phase**: design (TSK-02-01)
- **Decision needed**: 테이블·칼럼 물리 명명과 식별자 사전 정합
- **Decision made**: `TB_MDM_{ROLE}` 대문자, 칼럼 UPPER_SNAKE(원천 snake_case 를 글자 그대로 대문자로), 제약 `PK_/FK_/UX_/IX_/CK_{테이블}_…`, 스키마 접두 없음. 식별자 사전 A.1.1 에 mdm 등재, A.12.6 정규식에 둘째 가지(`TB_MDM_[A-Z][A-Z0-9_]*`) 추가 + §A.12.7 mdm 예외 절. 다른 모듈의 소문자 규칙은 그대로(design D1)
- **Rationale**: spec 이 식별자 사전 정규식에 mdm 추가를 요구하고, 리포 모듈 테이블 28종이 전부 대문자다. 전 모듈 대문자 전환은 모듈 횡단 결정이라 이 Task 가 단독으로 내리지 않는다
- **Reversible**: yes
- **Source**: docs/mdm/naming-dialect-rules.md §1, docs/mdm/adr/0001-physical-naming-audit-dialect.md, docs/guide/design/identifier-dictionary/04-decision-table-dispatch.md §A.12.7

## D-013 (2026-09-23T16:20:04Z)
- **Phase**: design (TSK-02-01)
- **Decision needed**: 공통 관리 속성과 감사 칼럼 자동 주입(McmAuditStatementInspector) 적용 범위
- **Decision made**: 감사 9칼럼(C_USR_ID·C_AT·C_SVC_ID·C_PGM_ID·U_USR_ID·U_AT·U_SVC_ID·U_PGM_ID·VER)을 모든 TB_MDM_*(TB_MDM_DICT_SEQ 제외, 보류 테이블 포함)에 두고 CactusAuditEntity 로 채운다. McmAuditStatementInspector 는 TB_MDM_* 에 적용하지 않는다(코드 변경 없음). row_version = 낙관적 잠금, VER = 감사 카운터
- **Rationale**: 인스펙터는 MCMAPUSER.TB_MCM_ 접두 SQL 만 잡고 svc 를 'mcm' 으로 하드코딩하며 mdm 앱에 등록돼 있지 않다. CactusAuditListener 가 요청 문맥에서 svc/pgm 을 채워 더 정확하다(mls Notice 선례)
- **Reversible**: yes
- **Source**: docs/mdm/naming-dialect-rules.md §2, docs/mdm/adr/0001-physical-naming-audit-dialect.md

## D-014 (2026-09-23T16:20:04Z)
- **Phase**: design (TSK-02-01)
- **Decision needed**: 방언 매핑과 영속성 수단
- **Decision made**: 방언 규칙표 24행(검증 상태 열 포함) 확정 — 실측 필요 행은 담당 Task 가 확인해 갱신. 영속성은 JPA + JPA native 쿼리, MyBatis 미사용. MSSQL 코드·키 칼럼은 Latin1_General_100_BIN2 로 대소문자 구분(design D7)
- **Rationale**: backend-standard 04 가 MES 모듈의 MyBatis 도입을 사용자 동의 없이 금지하고 mcm-reference 는 JPA 1순위다. 엔진 jar·화면 JS 평가기가 대소문자를 구분해 비교한다
- **Reversible**: yes
- **Source**: docs/mdm/naming-dialect-rules.md §3·§4, docs/mdm/TRD.md §2·§4.2

## D-015 (2026-09-23T16:20:04Z)
- **Phase**: design (TSK-02-01)
- **Decision needed**: 화면 그룹 코드·screenId·산출물 위치
- **Decision made**: 그룹 dma/dmb/dmc/dmd/dme(TRD 가정 T2 의 mdt/mdl/mdc/mdd/mdr/mda 대체, 결재 그룹은 보류 — 구현 시 dmf, design D2), screenId 24종(보류 dictSystemMng 포함), 산출물 docs/mdm/screens/{screenId}/, FE 경로 m-mdm/pages. wbs 그룹 토큰·FE 경로를 치환했다 — **승인 뒤 D'Flow 재업로드 필요(agent 태그 유지)**
- **Rationale**: 식별자 사전 §A.2.1 은 사용자 결정(2026-05-28) MUST 규칙이고 §A.5.3 은 잠정 채택을 금지한다. docs/mdm/design 은 gitignore 된 외부 링크라 산출물이 커밋되지 않는다. 포털 codegen 은 m-mdm/pages 를 스캔한다
- **Reversible**: yes
- **Source**: docs/mdm/screens/README.md, docs/mdm/adr/0003-module-boundary-screens-roles.md, docs/mdm/wbs.md, docs/mdm/TRD.md §5·§8·T2

## D-016 (2026-09-23T16:20:04Z)
- **Phase**: design (TSK-02-01)
- **Decision needed**: 기존 mcm cma/cmb As-Is 와 신규 MDM 의 관계
- **Decision made**: 병존 6원칙 — 테이블 상호 비의존, mcm-core As-Is 마스터 코드 import 금지, 기존 메뉴 유지·MDM 메뉴 신규 등록, 데이터 이관 범위 밖, 하위 모듈은 당분간 mcm 코드 사용, 식별자 충돌 없음. TRD 가정 T1 확정
- **Rationale**: PRD §5 와 원천 06:390 이 이관을 범위 밖으로 두었다. 기존 메뉴를 고치지 않고 새 메뉴를 등록하는 것이 사용자 방침이다
- **Reversible**: yes
- **Source**: docs/mdm/adr/0003-module-boundary-screens-roles.md, docs/mdm/TRD.md T1

## D-017 (2026-09-23T16:20:04Z)
- **Phase**: design (TSK-02-01)
- **Decision needed**: 04·06 버전 확정 규칙 세부(결재 없는 담당자 확정)
- **Decision made**: 담당자 확정 트랜잭션(소유자·confirm 권한·row_version 검사 → 대상별 확정 검사 → RELEASED 전이·직전 버전 apply_to 닫기·CREATED→INUSE). 04 는 5항(배포 대상) 생략, 3항은 apply_from 순서 대체(엄격한 >, 최초 면제). 결재 칸은 requested_by/at·released_at 만 확정자·확정 일시로 채우고 approved_* 는 비운다(design D3). 미적용 버전 = DRAFT + apply_from 이 미래인 RELEASED(design D4). CREATED→INUSE 는 확정·쓰기 경로에서 전이하고 조회는 계산 값(design D5). 소급 적용 허용, 철회 부재로 미래 확정 오류는 그 시각까지 못 고침(확정 화면 경고)
- **Rationale**: PRD §2 규칙 7 의 글자에 가장 가깝고 되돌리기 쉬운 쪽. approved_by IS NULL 로 결재 없는 확정을 구별할 수 있다
- **Reversible**: yes
- **Source**: docs/mdm/adr/0002-version-confirm-without-approval.md

## D-018 (2026-09-23T16:20:04Z)
- **Phase**: design (TSK-02-01)
- **Decision needed**: 권한 역할(표준 관리자·담당자) 배치
- **Decision made**: 전역 역할 MDM_STD_ADMIN·MDM_STEWARD, 권한 세트 PERM_MDM_READ/EDIT/CONFIRM, 그룹 매트릭스(dma·dmb = 관리자 EDIT, dmc·dme = 담당자 CONFIRM, dmd = 담당자 EDIT, 나머지 READ), 조회는 두 역할 모두 공개(design D6). DRAFT 잠금은 owner_id. DRAFT 소유권 action(lock/unlock/handover 권장)은 화면 Task 가 확정해 allActions 에 추가. 시드는 TSK-01-03. issue-brief 는 발행하지 않는다(결론을 냄)
- **Rationale**: PRD §3 이 역할 2종과 각자의 일을, TRD §6 이 역할 시드·확정 = 담당자·소유권 = owner_id 를 정했다. 원천 06:1001 은 권한과 작업 잠금을 섞지 말라고 한다
- **Reversible**: yes
- **Source**: docs/mdm/adr/0003-module-boundary-screens-roles.md, docs/mdm/TRD.md §6

## D-019 (2026-09-23T16:20:04Z)
- **Phase**: design (TSK-02-01)
- **Decision needed**: 보류 테이블 원칙과 ADR 위치
- **Decision made**: 배포 대상·배포 순번·수신 로그 테이블은 DDL-only(엔티티·리포지토리·서비스·BPMN·화면 없음), 활성 테이블 배포 칸(CHG_SEQ·LAST_CHG_SEQ)은 DEFAULT 0·엔티티 미매핑. TRD 가정 T4 확정. ADR 은 docs/mdm/adr/ 에 손으로 발행(adr-write 기본 위치 docs/mdm/design/adr 가 gitignore 된 외부 링크라 이탈, lint 는 파일 경로 지정)
- **Rationale**: 결재·배포를 붙일 때 마이그레이션으로 표를 다시 만들지 않기 위함(PRD §2 규칙 7 스키마 원칙). 외부 링크 안의 ADR 은 커밋되지 않는다
- **Reversible**: yes
- **Source**: docs/mdm/adr/0002-version-confirm-without-approval.md, docs/mdm/adr/README.md

## D-020 (2026-09-23T17:42:16Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: 평가 엔진 spi·입구 계약과 평가 시각 주입
- **Decision made**: spi 5종(DefinitionLookup·CodeLookup·CodeEffLookup·MasterLookup·FunctionProvider) + 묶음 EngineLookups, 입구 RuleEngine·DomainValidator·CodeResolver 를 계약 초안으로 고정(docs/mdm/engine-contract/). 엔진은 시계를 읽지 않고 Instant evalTs 를 필수로 받는다 — 원천의 "주지 않으면 현재 시각"은 서버 API 층이 채운다. spi 는 EvalEx 타입 없이 LocalDateTime(KST)·BigDecimal(버전)만 쓰고 FunctionProvider 는 중립 기술자(지연 인자 없음). 원천 이탈 X1~X7 은 engine-contract.md §12
- **Rationale**: 06:461·463·471 의 spi 정의·의존 방향과 02:326 결정성. 초안을 EvalEx 3.7.0 jar 로 javac -Werror 컴파일하고 ArchUnit 허용 목록 밖 import 0 을 확인했다
- **Reversible**: yes
- **Source**: docs/mdm/engine-contract.md, docs/mdm/engine-contract/java/**

## D-021 (2026-09-23T17:42:16Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: EvalEx 설정 고정값·문법 범위·칸별 허용 함수
- **Decision made**: precision 68 HALF_EVEN, zoneId Asia/Seoul, locale ROOT, allowOverwriteConstants=false, lenientMode=false, regexTimeoutMillis 100, maxRecursionDepth 2000, 배열·구조체·암묵 곱셈·작은따옴표·2진 끔(design D1). 사전 = STANDARD(EG 8.5 BASE 24종 + INSTR·MASTER·MASTER_AT) ∪ 비즈니스 함수. STR_FORMAT·STR_SPLIT·DT_*·RANDOM·LOG 등은 사전 밖이라 파싱 오류. 칸별 제한은 Slot 6종
- **Rationale**: 06:442-443. EvalEx 기본 zoneId·locale 이 JVM 기본값이라 호스트마다 달라짐을 실측했다. 사전 밖 함수가 파싱 단계에서 거부됨을 실측했다
- **Reversible**: yes(사전·문법 확장은 기존 식을 깨지 않는다)
- **Source**: docs/mdm/engine-contract.md §4·§5, MdmExpressionConfig.java, FunctionSets.java

## D-022 (2026-09-23T17:42:16Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: AST JSON·셀·코퍼스·판정 결과의 모양과 Java·TS 타입 출처
- **Decision made**: JSON Schema(docs/mdm/engine-contract/schema/engine-contract.schema.json)가 정본. TS 는 json-schema-to-typescript 로 생성, Java 는 엔진 의존 제약으로 손으로 쓴 record + 엔진 테스트 범위의 스키마 적합 검사(design D6). AST 노드 6종, 숫자는 문자열
- **Rationale**: wbs TSK-03-01 수용 기준 "Java·TS 타입이 같은 JSON 스키마에서 나온다", TRD §10(엔진 의존 EvalEx 하나). 실제 EvalEx 출력 AST 29건이 스키마를 통과했다
- **Reversible**: yes
- **Source**: docs/mdm/engine-contract.md §9

## D-023 (2026-09-23T17:42:16Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: 화면 JS 평가기 범위와 정합성 코퍼스 형식, MASTER_AT 기준일 문자열
- **Decision made**: op-code 셀은 구조 직접 비교, Expression·식 변수·열 조건은 AST 인터프리터, 결과 Expression 은 지원되면 미리보기 표시(원천 미결 06:389), MASTER 마루 데이터·MASTER_AT·attr 형태는 isSupported=false 로 서버 폴백, 화면도 예약 키(상수·EVAL_TS·_ 접두)를 서버와 같은 오류 코드로 거부. 코퍼스는 CorpusFile v1(ExprCase·CellCase, TypedValue 숫자 문자열, screenFallback). MASTER_AT base_dt 는 YYYYMMDD(00:00:00)·YYYYMMDDHHMMSS(KST), 그 밖은 평가 오류, NULL 은 false/NULL(design D5)
- **Rationale**: 06:271·716-731, EG 8.5. EvalEx 와 원천 JS 샘플의 NULL 동작 차이 6가지를 실측해 코퍼스 필수 사례에 더했다
- **Reversible**: yes
- **Source**: docs/mdm/engine-contract.md §7·§10·§11

## D-024 (2026-09-23T17:42:16Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: 용어 임베딩 저장·검색 방식(pgvector 전제를 SQLite·MSSQL 로) — TRD 가정 T6
- **Decision made**: TB_MDM_TERM 의 EMBEDDING(SQLite BLOB / MSSQL VARBINARY(4096), L2 정규화 float32 LE 1024) + EMBEDDING_MODEL VARCHAR(100) 칼럼, 비교는 서버 메모리 전수 내적. 엔티티는 두 칼럼을 매핑하지 않고 네이티브 SQL 로만 다룬다. 파일 인덱스·MSSQL VECTOR·sqlite-vec 는 쓰지 않는다. 재검토 임계: 현재 모델 벡터 10만 건 또는 추천 p95 250 ms. T6 확정(design D2)
- **Rationale**: KURE-v1 INT8 PoC(Apple M5) — 1만 건 질의 p95 22 ms(표기 인코딩 포함), 전수 비교 10만 건 p95 51 ms, SQLite BLOB 1만 행 읽기 23 ms. 500 ms 기준 대비 여유가 커서 선택은 방언 이식성(NFR-6)과 원천 DDL 불변(02:533)으로 갈랐다. MSSQL VECTOR 는 SQL Server 2025 이상 전용이고 운영 버전은 저장소에서 확인 불가
- **Reversible**: yes(칼럼을 그대로 두고 인덱스만 더할 수 있다)
- **Source**: docs/mdm/term-embedding.md, poc/mdm-embedding-bench/results/README.md, docs/mdm/TRD.md T6, docs/mdm/naming-dialect-rules.md §3 #23

## D-025 (2026-09-23T17:42:16Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: 임베딩 풀링·입력 형식·모델 식별 값
- **Decision made**: CLS 풀링 + L2(INT8 변환본 README 의 masked mean 이 아님), 입력 "{표기}: {정의} ({영문명})", EMBEDDING_MODEL = "KURE-v1/int8-{onnx sha256 앞 8자}/cls-l2/in{입력 형식 버전}". ORT 1.30.0 intra 4·세션 공유·직렬 호출, 배치 1. 운영 INT8 파일은 원본 FP32 에서 직접 변환하는 것을 권고하되 담당자 확인(design D3·D4)
- **Rationale**: 원본 1_Pooling/config.json pooling_mode_cls_token=true·modules.json Normalize, 02:536. 모델·양자화·풀링·입력 중 하나만 바뀌어도 벡터 공간이 달라지므로 재인코딩 판별 값에 모두 넣는다(02:540)
- **Reversible**: yes(값이 바뀌면 재인코딩 배치가 따라온다)
- **Source**: docs/mdm/term-embedding.md §2

## D-026 (2026-09-23T17:43:09Z)
- **Phase**: design (TSK-01-02)
- **Decision needed**: 스캐폴드 샘플 화면 mdmSample 을 옛 그룹에서 dma 로 옮기는 시점과 기존 개발 DB 처리
- **Decision made**: 팀장 지시에 따라 TSK-01-02 에서 `git mv` 로 `dma/mdmSample` 로 옮기고 계약 커밋과 별도 커밋으로 나눈다(삭제 아님). 기존 DB 는 DataInitializer 가 UPDATE 로 이행한다(leaf 부모·자식 폴더 부모·폴더 PK 와 이름 용어·도메인·즐겨찾기 경로, DELETE 없음). 선행 문서의 "TSK-01-03 이 옮긴다" 문구는 고치지 않는다
- **Rationale**: 위임자 지시가 이 Task 에서 처리하라고 한다. 삭제는 사용자 확인 대상이다. 메뉴 시드는 insert-if-absent 이고 componentPath 는 조회 때 계산되므로 리터럴만 바꾸면 기존 DB 에서 화면이 열리지 않는다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-02/design.md D1·D2

## D-027 (2026-09-23T17:43:09Z)
- **Phase**: design (TSK-01-02)
- **Decision needed**: 전사 공유 계약의 자리와 contract-only 와 TSK-02-01 인계(감사 헬퍼·방언 판정 빈)의 충돌
- **Decision made**: 계약 패키지 `com.dongkuk.dmes.mdm.contract.{common,screen,security,version,category}` 에 인터페이스·enum·record·상수 클래스만 두고 ArchUnit 으로 고정한다. 감사 칼럼 헬퍼(MdmNativeAuditSupport)·방언 판정 빈(MdmDialectResolver)은 인터페이스만 두고 구현은 TSK-01-03
- **Rationale**: spec 수용 기준 "실행 로직 없음" 이 1순위다. 계약과 구현의 경계가 패키지 이름에 드러나야 규칙이 앞으로도 참으로 남는다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-02/design.md D3·D9

## D-028 (2026-09-23T17:43:09Z)
- **Phase**: design (TSK-01-02)
- **Decision needed**: 규칙표 방언 실측(#14·#15·#16) 범위와 MSSQL 적용 검증 방식
- **Decision made**: #14 SQLite foreign_keys 는 local 프로파일 Hikari 드라이버 속성으로 켜고 TSK-01-02 에서 실측 확인. #15·#16 은 TSK-04-01 로 이관. MSSQL 적용은 Testcontainers(SQL Server 2022-CU27) 별도 태스크 `:api:mssqlMigrationTest` 로 검증하고 testAll 에 넣지 않는다(조건부 skip 없음, docker 없으면 실패)
- **Rationale**: #15·#16 은 결과가 열려 있어 계약 Task 범위를 넘는다. docker 없는 환경의 testAll 기준선을 깨지 않으면서 실제 MSSQL 적용을 증명한다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-02/design.md D4·D5

## D-029 (2026-09-23T17:43:09Z)
- **Phase**: design (TSK-01-02)
- **Decision needed**: mdm 공통 오류 코드 모양(cactus ErrorCode 에 409 없음, OASIS 는 meta.code 로 반환)
- **Decision made**: mdm 전용 `MdmErrorCode`(코드 MDMnnn, 의미 HTTP 상태, 운반용 cactus ErrorCode, 기본 메시지). 던질 때 cactus BusinessException 의 ErrorDetail.code 로 싣는다. cactus-core 는 바꾸지 않는다. 응답 DTO 는 새 봉투 없이 검사 결과 record(MdmCheckIssue·ConfirmCheckResult)
- **Rationale**: cactus-core 변경은 모듈 횡단이고, 새 응답 봉투는 BFF·화면 규약을 둘로 만든다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-02/design.md D7

## D-030 (2026-09-23T17:43:09Z)
- **Phase**: design (TSK-01-02)
- **Decision needed**: TB_MDM_SYSTEM 초기 행 이름·감사 값과 Y/N 플래그 칼럼 콜레이션
- **Decision made**: 코드 ERP·MES·APS·DKMS·L2·MDM, 이름 ERP·MES·APS·DKMS·레벨2·마루 MDM, 자기 행 MDM(SELF_YN='Y'). 시드 감사 값 SYSTEM/flyway/V2__create_mdm_system·VER=0·시각 NULL. MSSQL 에서 SYSTEM_CODE 와 SELF_YN 모두 Latin1_General_100_BIN2
- **Rationale**: 원천이 이름을 정하지 않았다. 감사 시각은 DB 시각 함수 금지(규칙표 #16)와 SQLite Instant 형식 미실측 때문에 NULL 이 안전하다. SELF_YN 에 콜레이션이 없으면 MSSQL CHECK 가 소문자 'y' 를 통과시켜 SQLite 와 판정이 갈린다(실측)
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-02/design.md D8·D10

## D-031 (2026-09-23T17:43:09Z)
- **Phase**: design (TSK-01-02)
- **Decision needed**: 보류 테이블(배포 대상·배포 순번·수신 로그) DDL 을 TSK-01-02 에 넣는가
- **Decision made**: 넣지 않는다. TSK-01-02 의 마이그레이션은 TB_MDM_SYSTEM 하나뿐이다. 보류 테이블 DDL 은 TSK-02-01 배정대로 TSK-02-03(DDL 초안)과 영역 계약 Task 가 맡는다. 결재 상태 값은 상수·전이 표(inScope=false)로만 둔다
- **Rationale**: spec 의 데이터 모델은 TB_MDM_SYSTEM 하나이고 선행 설계가 보류 테이블을 다른 Task 에 배정했다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-02/design.md D6
