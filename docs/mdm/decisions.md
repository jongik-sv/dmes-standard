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

## D-032 (2026-09-24T00:00:00Z)
- **Phase**: design (TSK-02-03)
- **Decision needed**: 03 `TB_MDM_EAI.header_layout_id` 단일 헤더(md) vs html 목업이 그리는 순서 있는 N개 헤더 적층(EAI 구간 + 시스템 구간) 중 스키마에 반영할 모델
- **Decision made**: 덧셈적(additive) N-헤더 모델을 채택하고 junction 테이블 `TB_MDM_LAYOUT_HEADER(LAYOUT_ID, SEQ, HEADER_LAYOUT_ID)`를 신설한다. N=1 이면 md 의 "전문당 헤더 하나" 동작과 완전히 같다. 전문별 헤더 상수 재정의 값을 저장할 `TB_MDM_LAYOUT_CONST(LAYOUT_ID, HEADER_LAYOUT_ID, HEADER_SEQ, CONST_VALUE)`도 함께 신설한다
- **Rationale**: spec 의 데이터 모델 절이 "TB_MDM_EAI, TB_MDM_LAYOUT, TB_MDM_LAYOUT_ITEM (+ 헤더 적층·상수 재정의 테이블)"이라 적어 적층 테이블 신설을 이미 전제한다(근거 1순위). 실제 AS-IS 전문(M201)이 GLUE 공통헤더 + L2 구간헤더 두 겹을 쓰는 구조를 md 단일모델로는 표현할 수 없다. N=1 이 md 동작을 정확히 재현하므로 되돌리기 비용이 낮다
- **Reversible**: no(스키마 신설 — 되돌리려면 두 테이블과 관련 FK 를 제거하고 `TB_MDM_LAYOUT_ITEM.default_value` 재정의 방식으로 축소 재설계해야 함, TSK-02-03/design.md D1 "반려 시 재작업" 참조)
- **Source**: docs/mdm/tasks/TSK-02-03/design.md D1·D2, `docs/mdm/erd/03-interface-layout.{mmd,sqlite.sql,mssql.sql}`

## D-033 (2026-09-24T00:00:00Z)
- **Phase**: design (TSK-02-03)
- **Decision needed**: naming-dialect-rules.md §2 끝 항목이 "02 원문대로 정하라"고 위임한 관리 속성 5종(버전·유효기간·소유 부서·담당자·등록 출처) 중 TERM·DOMAIN 에 실제로 물리 칼럼을 추가할 항목
- **Decision made**: `TB_MDM_TERM` 에 `OWNER_DEPT`(소유 부서)·`OWNER_ID`(담당자)·`SRC_ORIGIN`(등록 출처) 3칼럼만 추가한다. 버전·유효기간은 두 표 모두 생략한다. `TB_MDM_DOMAIN` 에는 5종 모두 추가하지 않는다(02 원문이 DOMAIN 은 "소유자는 두지 않는다"고 명시)
- **Rationale**: 02 원문 테이블 설계 절 서두는 "관리 속성(버전·유효기간)은 공통 모듈에서 일괄 정의하므로 생략"이라 적어 이 두 개만 생략 대상으로 예시했다. "버전"은 감사 `VER`(변경 카운터)과 저장-즉시-배포 정책으로 실질적으로 커버되고, "유효기간"은 화면 요구사항에 입력 필드로 등장하지 않는다. 반면 소유 부서·담당자·등록 출처는 02 TERM 속성표에 생략 언급 없이 남아 있고, 감사 칼럼(시스템 사용자)과 의미가 다른 업무 속성(조직·문서 정보)이다
- **Reversible**: no(스키마 신설 — 되돌리려면 `TB_MDM_TERM` 의 3칼럼을 제거해야 함, FK·UX 영향 없어 제거 자체는 안전. TSK-02-03/design.md D3 "반려 시 재작업" 참조)
- **Source**: docs/mdm/tasks/TSK-02-03/design.md D3, `docs/mdm/erd/02-term-domain-column.{mmd,sqlite.sql,mssql.sql}`

## D-034 (2026-09-24T00:00:00Z)
- **Phase**: build (TSK-02-03)
- **Decision needed**: design.md §6.0 감사 9칼럼의 `VER BIGI`가 원천 업무 칼럼 `VER`(버전 번호, PK 구성요소)과 6개 테이블(`TB_MDM_CODE_VER`·`TB_MDM_CODE_RECV`·`TB_MDM_RULE_VER`·`TB_MDM_RULE_VAR`·`TB_MDM_RULE_ROW`·`TB_MDM_RULE_RECV`)에서 칼럼명이 그대로 충돌해(같은 테이블에 `VER` 두 개, `CREATE TABLE` 자체가 불가) design.md 를 문자 그대로 구현할 수 없음
- **Decision made**: 이 6개 테이블에 한해 감사 카운터 칼럼만 `AUD_VER`(타입은 `VER` 과 동일한 `BIGI`)로 개명하고, 원천 업무 `VER` 칼럼은 개명하지 않는다(불변 규칙 2 의 "원천 칼럼은 대소문자만 바꾼다"를 지킨다). 두 방언 DDL·`expected-columns.json`·검증 스크립트(체크 c·e) 모두 이 예외를 명시한다
- **Rationale**: `CactusAuditEntity`(src/backend/cactus-core, 읽기 전용 확인)는 `@Column(name="VER")` 로 고정돼 있으나 `@MappedSuperclass` 이므로 하위 엔티티가 표준 JPA `@AttributeOverride(name="version", column=@Column(name="AUD_VER"))` 로 재매핑할 수 있어 cactus-core 코드 변경이 필요 없다. 감사 카운터 쪽을 개명하는 편이 업무 버전 칼럼(PK·다른 테이블의 FK 대상)을 건드리는 것보다 영향 범위가 작다
- **Reversible**: yes(엔티티 매핑을 다시 바꾸면 원복 가능. 다만 그 전까지 이 6개 테이블에 엔티티를 붙이는 모든 후속 Task 는 `@AttributeOverride` 를 적용해야 함 — naming-dialect-rules.md §6.1 인계 표에 명시)
- **Source**: `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/audit/CactusAuditEntity.java`(읽기 전용 확인), `docs/mdm/erd/04-master-code.sqlite.sql`·`06-business-rule.sqlite.sql` 머리말, `docs/mdm/erd/verify/expected-columns.json`

## D-035 (2026-09-24T00:00:00Z)
- **Phase**: build (TSK-04-01)
- **Decision needed**: `TB_MDM_DOMAIN.MARU_CODE_ID → TB_MDM_CODE` 교차 영역 FK 를 V3(02)에 지금 거는가
- **Decision made**: 걸지 않는다. SQLite·MSSQL 두 방언 모두 이번 V3 에 `FK_TB_MDM_DOMAIN_CODE` 를 넣지 않고, `TB_MDM_CODE`(04 영역, TSK-06-01)가 생긴 뒤 후행으로 추가한다. SQLite 는 `ALTER TABLE ADD CONSTRAINT` 가 없어 그때 가서 `TB_MDM_DOMAIN` 테이블 재생성(12단계 패턴)이 필요하다
- **Rationale**: 이 Design Phase 가 직접 실측(F1, `FkProbe.java`, sqlite-jdbc 3.45.3.0) — SQLite 는 `foreign_keys=ON` 상태에서 부모 테이블이 없는 채로 인라인 FK 를 걸면 그 칼럼을 향한 FK 가 걸린 테이블에 대한 **모든** INSERT/DELETE(NULL 값이어도)가 `no such table` 로 거부된다(prepare 단계 검사). wbs 의존 그래프(F9)상 `TSK-04-02`·`04-03`·`04-04` 가 `TSK-06-01` 에 의존하지 않으므로 이 세 후속 Task 작업 시점에 `TB_MDM_CODE` 가 없을 개연성이 실제로 있다 — 이때 FK 를 걸면 도메인 종류와 무관하게 `TB_MDM_DOMAIN`·자식 `TB_MDM_COLUMN` 에 대한 모든 쓰기가 막힌다. 실제로 Build 가 이 FK 를 다시 넣는 변이를 넣어 확인한 결과 SQLite 쪽 관련 테스트 6개가 즉시 빨강이 났다(변이 검증)
- **Reversible**: no(FK 신설 자체는 가능하지만 SQLite 는 되돌리려면 테이블 재생성이 필요 — TSK-06-01 이 §8 인계 사항대로 처리)
- **Source**: docs/mdm/tasks/TSK-04-01/design.md D1(판단 지점 1), F1·F9

## D-036 (2026-09-24T00:00:00Z)
- **Phase**: build (TSK-04-01)
- **Decision needed**: TSK-02-03 D4 가 "이번 범위 제외"로 미뤘던 `TB_MDM_TERM.EMBEDDING`/`EMBEDDING_MODEL` 을 V3 에 지금 포함하는가
- **Decision made**: 포함한다. SQLite `BLOB`, MSSQL `VARBINARY(4096)`, 양쪽 `EMBEDDING_MODEL VARCHAR(100)`. 엔티티에는 매핑하지 않고(불변 규칙 7) 네이티브 SQL 로만 다룬다 — 실제 왕복(4,096바이트, L2 정규화 float32 little-endian 1024개)을 SQLite·MSSQL 양쪽에서 실측해 바이트 단위로 일치함을 확인했다(`MdmTermDomainColumnMigrationTest`·`MdmTermDomainColumnMssqlMigrationTest`)
- **Rationale**: `decisions.md` D-024·D-025(TSK-02-02) 와 `naming-dialect-rules.md` §3 #23·§6.1 인계표가 "MSSQL 왕복 실측 → TSK-04-01" 을 이미 이 Task 소관으로 명시적으로 지정했다. TSK-02-03 D4 의 "이번 범위 제외" 는 그 조건(TSK-02-02 가 원장 DB 보관을 확정)이 이미 참이 됐을 때의 반려 시 재작업 경로였다. 타입은 D4 재작업 문구(`VARBINARY(MAX)`/`CD50`)가 아니라 더 나중·더 구체적인 규칙표·`term-embedding.md`(`VARBINARY(4096)`/`VARCHAR(100)`)를 따랐다
- **Reversible**: no(스키마 신설 — 되돌리려면 두 칼럼과 관련 테스트를 제거하고 TSK-04-02 로 이월해야 함)
- **Source**: docs/mdm/tasks/TSK-04-01/design.md D7, F10, decisions.md D-024·D-025, naming-dialect-rules.md §3 #23

## D-037 (2026-09-24T00:00:00Z)
- **Phase**: build (TSK-04-01)
- **Decision needed**: 영향도 조회(`MdmDomainImpactLookup`) 구현체가 03(`TB_MDM_LAYOUT_ITEM`)·06(`TB_MDM_RULE_VAR`)의 데이터를 어떻게 참조하는가 — 두 테이블이 아직 없거나 비어 있을 수 있는 상황에서
- **Decision made**: `contract.dictionary` 에 03·06 이 구현하는 SPI `MdmDomainReferenceSpi`(`referencesTo(Set<Long> domainIds, Set<String> columnPhysNames)`)를 신설한다. 영향도 조회 구현체(TSK-04-03)는 `List<MdmDomainReferenceSpi>`(스프링 빈 목록, 0개 가능)를 모아 집계한다 — 구현체가 없으면(그 영역 미착수) 그 영역 참조는 자연스럽게 0건이 된다
- **Rationale**: F9 와 완전히 같은 구조의 문제(02→03·02→06 로 향하는 직접 SQL 의존을 만들면 대상 테이블이 없을 때 F1 과 같은 종류의 오류가 나고, wbs 의 02→03·02→06 단방향 의존을 역행한다). TSK-01-02 가 이미 검증한 `VersionConfirmCheckSpi`/`List<...>` 패턴을 재사용해 새 리스크를 만들지 않는다. 03·06 이 SPI 구현체를 제공하는 쪽이지 02 가 03·06 타입을 아는 쪽이 아니다(계약 의존 방향이 올바르다) — 이 방향은 §3.4 스텁 컴파일 테스트(`DomainReferenceSpiStub`, refKind="LAYOUT_ITEM"/"RULE_VAR")와 §3.5 ArchUnit(계약 패키지가 entity../repository..에 의존하지 않음)으로 지금 증명했다
- **Reversible**: yes(구현이 없는 인터페이스 신설이라 TSK-04-03 이 실제 구현체를 만들기 전까지는 되돌리기 쉽다. 되돌리면 `MdmDomainImpactLookup` 구현체가 `TB_MDM_LAYOUT_ITEM`·`TB_MDM_RULE_VAR` 에 대한 네이티브 조인 SQL 을 직접 가져야 하고, 그 테이블들이 없는 동안 예외를 던지지 않도록 방어 코드를 추가해야 한다)
- **Source**: docs/mdm/tasks/TSK-04-01/design.md D9(판단 지점 3), F9

## D-038 (2026-09-24T00:00:00Z)
- **Phase**: build (TSK-04-01)
- **Decision needed**: D-030 이 "SQLite Instant 형식 미실측"을 근거로 `TB_MDM_SYSTEM` 시드 감사 시각을 NULL 로 둔 전제가, 이번 Build 의 실측으로 바뀌었다 — 이 사실을 어떻게 반영하는가
- **Decision made**: `CactusAuditEntity.C_AT`(Instant)의 SQLite 실제 저장 형식을 `typeof(C_AT)` 로 직접 관찰한 결과 **`integer`(epoch millis)**임을 확인했다(TSK-04-01 design.md D10). D-030 이 전제로 삼았던 "미실측" 상태는 해소됐지만, D-030 자신의 결정(시드 감사 시각 NULL)은 이 사실과 무관하게 그대로 유지한다 — D-030 은 "DB 시각 함수 금지" 원칙과 "원시 SQL INSERT 는 `CactusAuditListener` 를 거치지 않는다"는 별개 근거로 성립하는 결정이라 이번 실측이 그 결론을 바꾸지 않는다. 다만 **mcm `SqliteTemporalConverterContributor` 가 이 형식을 이미 정규화해 줄 것이라는 가정은 틀렸다** — 그 컨트리뷰터는 `LocalDate`/`LocalDateTime` 전용이고 `Instant` 는 우회 대상이 아니다(코드 확인). 이 Task 는 고치지 않고 사실만 기록·인계한다(D10)
- **Rationale**: naming-dialect-rules.md §6.2 "실측 결과가 규칙과 다르면 decisions.md 에 기록"을 따른다. D-030 을 개정(수정)하지 않고 새 번호로 append 하는 이유는 D-030 자체가 틀린 결정이 아니라 그 결정이 기대고 있던 "미실측" 전제 하나가 달라졌을 뿐이기 때문이다(D-030 의 결론은 유지)
- **Reversible**: yes(사실 기록일 뿐 스키마·코드 변경이 없다)
- **Source**: docs/mdm/tasks/TSK-04-01/design.md D10, decisions.md D-030, `src/backend/mcm-core/.../SqliteTemporalConverterContributor.java`(읽기 전용 확인)

## D-039 (2026-09-23T19:34:55Z)
- **Phase**: design (TSK-01-03)
- **Decision needed**: 공통 버전 상태 서비스가 아직 없는 버전 테이블(04·06)의 행을 어떻게 읽고 쓰는가
- **Decision made**: 테이블·키 칼럼 이름을 주입받는 명세(`VersionTableSpec`)로 JPA native 쿼리 한 경로를 둔다. 테스트는 실제 이름과 다른 픽스처 테이블(`TB_MDM_TC_*`)로 SQLite·MSSQL 에서 돌리고, 시나리오 키트 `AbstractVersionStateScenarioTest` 를 TSK-06-01·08-01 에 인계한다
- **Rationale**: 두 테이블의 상태·소유자·적용 구간·row_version 칼럼이 같아 한 경로로 다룰 수 있고, 확정 트랜잭션 규칙(조건부 UPDATE·원자성)을 한 곳에서 증명할 수 있다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-03/design.md D1

## D-040 (2026-09-23T19:34:55Z)
- **Phase**: design (TSK-01-03)
- **Decision needed**: 미적용 버전 가드·DRAFT 삭제 정리 훅·담당자 역할 거부·경고 미확인을 부를 자리가 TSK-01-02 계약에 없다
- **Decision made**: 계약에 `VersionWriteGuard`·`VersionDraftDeletionSpi` 인터페이스와 `MdmErrorCode` 2개(MDM013 `STEWARD_ROLE_REQUIRED` 403, MDM014 `CONFIRM_WARNINGS_NOT_ACKNOWLEDGED` 409)를 더한다. 기존 12개 코드·인터페이스 시그니처는 바꾸지 않는다
- **Rationale**: spec 이 미적용 버전 하나 규칙을 이 Task 에 둔다. 역할 거부·경고 미확인을 기존 코드로 재사용하면 화면이 원인을 구별하지 못하고 '확인 뒤 다시 보내기' 흐름을 만들 수 없다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-03/design.md D3

## D-041 (2026-09-23T19:34:55Z)
- **Phase**: design (TSK-01-03)
- **Decision needed**: mdm API 403·메뉴 비노출과 '담당자만 확정' 을 어느 층이 보장하는가
- **Decision made**: 메뉴·API 액션 RBAC 는 mcm 시드 + BFF(`proxy.ts`)가 맡고, mdm 은 mls 선례대로 `cactus.jwt.secret`·client key 신뢰 채널을 켜서 요청 역할을 받으며, 버전 전이 서비스가 역할(담당자)과 소유자를 직접 검사한다. SYSADMIN 은 담당자로 보지 않는다
- **Rationale**: 권한 테이블이 mcm DB 에 있어 mdm 서버 필터가 볼 수 없다. SYSADMIN 은 PERM_ALL 로 BFF 를 통과하므로 서비스가 역할을 따로 봐야 spec '담당자 역할만' 이 참이다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-03/design.md D6

## D-042 (2026-09-23T19:34:55Z)
- **Phase**: design (TSK-01-03)
- **Decision needed**: DRAFT 넘기기 대상이 담당자인지 mdm 이 어떻게 검사하는가(다른 사용자 역할 조회 수단 없음)
- **Decision made**: 포트 `MdmStewardDirectory` 를 두고 기본 구현 `UnresolvedStewardDirectory` 는 항상 거부한다(fail-closed, MDM005). 실제 조회 어댑터는 첫 소유권 화면 Task 가 만든다
- **Rationale**: 관리자 강제 해제가 없어 담당자 아닌 소유자가 생기면 DRAFT 를 풀 수 없게 된다. mcm 에 역할 조회 경로를 새로 두는 일은 보안 검토 대상이다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-03/design.md D7

## D-043 (2026-09-23T19:34:55Z)
- **Phase**: design (TSK-01-03)
- **Decision needed**: CREATED→INUSE 즉시 전이와 결재 칸 채움을 공통 확정에 넣는가
- **Decision made**: 확정 UPDATE 가 `REQUESTED_BY/AT`·`RELEASED_AT` 을 함께 쓰고(APPROVED_*·OWNER_ID 는 쓰지 않음), 같은 트랜잭션에서 `APPLY_FROM <= now` 이면 부모 CREATED→INUSE 까지 한다. 그 밖의 경로는 영역 몫
- **Rationale**: 결재 칸은 확정 UPDATE 와 같은 행이라 영역이 따로 쓰면 row_version 규칙이 흐려진다. ADR-0002 가 INUSE 즉시 전이를 확정 트랜잭션 단계로 정의했다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-03/design.md D8

## D-044 (2026-09-23T19:34:55Z)
- **Phase**: design (TSK-01-03)
- **Decision needed**: SQLite 네이티브 쓰기의 일시 표현(규칙표 #16 의 mdm 적용 방식은 TSK-04-01 실측 대상)
- **Decision made**: `MdmTemporalBinder` 한 곳에서 업무 일시와 감사 `U_AT` 를 모두 KST 초 단위 `'yyyy-MM-dd HH:mm:ss'` 문자열로 쓰고(MSSQL 은 LocalDateTime/DATETIME2), TSK-04-01 결론에 따라 이 한 곳만 고친다
- **Rationale**: 규칙표 #16 문장을 글자대로 따른다. xerial 기본 Timestamp 바인딩은 숫자로 저장될 수 있어 문자열 비교와 어긋난다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-03/design.md D9

## D-045 (2026-09-23T19:34:55Z)
- **Phase**: design (TSK-01-03)
- **Decision needed**: MDM RBAC 시드의 모양(역할 그룹·매핑 대상·시험 사용자)
- **Decision made**: 역할 2(`MDM_STD_ADMIN`·`MDM_STEWARD`) + 역할 그룹 2(1:1) + 권한 세트 3(PERMISSION_COMMON·CUSTOM·POPUP_BTN 비움) + 기존 OBJECT `mdmSample` 에만 ADR-0003 D5 매트릭스 매핑 + 화면 Task 용 헬퍼 `seedMdmObjectRbac`. 시험 사용자는 운영 시드에 넣지 않고 E2E 가 격리 DB 픽스처로 만든다. 메뉴 폴더 dmb~dme 를 새로 등록한다
- **Rationale**: 사용자는 역할 그룹을 거쳐서만 역할을 받는다. UserPermCache 가 네 칸을 합치므로 COMMON 을 채우면 READ 가 save·delete 를 얻는다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-03/design.md D10

## D-046 (2026-09-23T19:34:55Z)
- **Phase**: design (TSK-01-03)
- **Decision needed**: m-mdm 공통 셸의 상태·잠금 배지를 어디에 어떻게 만드는가
- **Decision made**: m-mdm `src/shell/` 에 `MdmPageLayout`(shared PageLayout 래핑)·`VersionStatusBadge`·`DraftLockBadge` 를 두고 의미 토큰 인라인 스타일로 그린다(Mantine·16진수 색 없음). 샘플 화면에 셸을 입히고 배지 미리보기를 더해 E2E 스크린샷으로 보인다
- **Rationale**: 상태→라벨·톤 대응은 mdm 업무 규칙이고 shared 에 같은 컴포넌트가 없다. shared·m-mcm 을 바꾸지 않아 변경 패키지가 늘지 않는다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-01-03/design.md D11

## D-047 (2026-09-24T00:00:00Z)
- **Phase**: build (TSK-05-01)
- **Decision needed**: 예약어와 충돌하는 칼럼(`TB_MDM_LAYOUT.VERSION`·`TB_MDM_LAYOUT_ITEM.OFFSET`·`LENGTH`)을 JPA 엔티티에서 어떻게 인용할 것인가 — naming-dialect-rules.md 에 선례가 없었다
- **Decision made**: Hibernate 방언-중립 백틱 인용(`@Column(name="\`VERSION\`")` 등)을 쓴다. Hibernate 가 방언별로 자동 변환해 MSSQL `[VERSION]`, SQLite `"VERSION"` DDL 인용과 일치시킨다. `hibernate.globally_quoted_identifiers` 전역 설정은 쓰지 않는다(예약어 없는 다른 mdm 칼럼까지 전부 인용돼 영향 범위가 커진다)
- **Rationale**: naming-dialect-rules.md §1 에 이 정책이 없어(F7·F15) 이 Task 가 처음 정한다. Hibernate 표준 메커니즘이라 방언 분기 코드를 만들지 않는다. **실측 결과(은폐하지 않고 기록)**: Build 가 `MdmLayout.layoutVersion`·`MdmLayoutItem.offset`·`length` 세 필드에서 백틱을 실제로 지우는 변이를 넣고 SQLite(`MdmLayoutEntityJpaRoundtripTest`)·MSSQL(`MdmInterfaceLayoutMssqlMigrationTest` 의 예약어 왕복 테스트) 양쪽을 다시 돌린 결과, **두 방언 모두 그대로 초록으로 통과했다** — `VERSION`·`OFFSET`·`LENGTH` 는 SQLite Hibernate community dialect·MSSQL `SQLServerDialect` 어느 쪽에서도 자동 인용이 필요한 실제 예약어로 취급되지 않는다(둘 다 표준 SQL 예약어이지만 이 두 dialect 의 파서가 컬럼 위치의 식별자로는 그대로 받아들인다). 즉 **§5 불변 규칙 7 이 예견한 "알려진 커버리지 갭"이 실제로 발생했다** — 백틱 인용은 이식성·명시성을 위해 유지하지만(명명 정책으로는 유효), 인용을 빠뜨리는 회귀를 이 Task 의 테스트로는 잡지 못한다. 향후 이 칼럼을 실제로 건드리는 Task(TSK-05-02·05-03)가 이 갭을 메울 필요가 있으면 별도로 판단한다
- **Reversible**: yes(엔티티의 `@Column(name=...)` 값만 바꾸면 원복 가능. DDL 변경은 필요 없다)
- **Source**: docs/mdm/tasks/TSK-05-01/design.md D1·§5 불변 규칙 7, F7·F15, naming-dialect-rules.md §1(신규 행)

## D-048 (2026-09-24T00:00:00Z)
- **Phase**: build (TSK-05-01)
- **Decision needed**: 레이아웃 스냅샷 JSON 스키마(`layout-snapshot.schema.json`)를 샘플로 검증하는 테스트에 JSON-Schema validator 라이브러리를 새로 추가할 것인가
- **Decision made**: 추가하지 않는다. `mdm/lib` 에 이미 전이적으로 있는 Jackson(`spring-boot-starter-web` 경유, F18)만으로 스키마·샘플·record 세 곳의 필드 키 집합이 서로 같은지를 구조적으로 비교한다(`LayoutSnapshotSchemaStructureTest`)
- **Rationale**: 팀장 지시("새 의존성이 필요하면 조용히 추가하지 말고 D 항목으로 올린다")를 그대로 따른다. Jackson 은 추가 비용이 없고, 이 Task 의 계약이 요구하는 검증 범위(키 집합 일치·오프셋 산술 정합성)는 실제 JSON-Schema validator 없이도 충분히 구조적으로 증명된다
- **Reversible**: yes(`lib/build.gradle` 에 `testImplementation` 으로 JSON-Schema validator 를 추가하고 테스트를 실제 스키마 검증으로 다시 작성하면 된다)
- **Source**: docs/mdm/tasks/TSK-05-01/design.md D2, F18

## D-049 (2026-09-24T00:00:00Z)
- **Phase**: build (TSK-05-01)
- **Decision needed**: TSK-02-03 의 design.md 안에서 "담당자 확인 필요 결정"으로 남아 있고 사람의 최종 승인 기록이 없는 03 헤더 적층·상수 재정의 모델(`TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST`)을 이 Task 가 실제로 구현할 것인가
- **Decision made**: 구현한다. Design Phase 가 이미 D4 로 이 판단을 내렸고(spec 데이터 모델 절이 "+ 적층·재정의 테이블"을 직접 요구), Build 는 이 결정을 재확인하며 그대로 실행한다 — V4(두 방언)에 두 테이블·관련 FK(부착 무결성 FK3 포함)·CHECK·유일 인덱스를 실제로 만들고, N=1 이 md 단일-헤더 동작을 정확히 재현함을 마이그레이션 테스트(SQLite·MSSQL 양쪽)로 실측했다
- **Rationale**: spec 본문(데이터 모델 절)·`wbs.md`(TSK-05-01 요구사항 "적층 모델 확정분 포함")가 이미 적층 테이블 신설을 전제하고 있고, ERD(TSK-02-03)가 구체적 설계를 이미 갖추고 있어 새로 설계할 필요가 없다. 사람의 최종 승인은 이 Task 의 권한 밖이지만, 구현 방향 결정 자체는 spec 이 이미 지시한 범위 안이라고 판단한다(design.md D4 근거 재확인)
- **Reversible**: no(스키마 신설 — 되돌리려면 두 테이블과 관련 FK·CHECK·인덱스, 계약 record 의 `headers`·`overrideValue` 필드를 모두 제거해야 함, TSK-05-01/design.md D4 "반려 시 재작업" 참조)
- **Source**: docs/mdm/tasks/TSK-05-01/design.md D4, F4, spec.md 데이터 모델 절

## D-050 (2026-09-24T00:58:10Z)
- **Phase**: build (TSK-08-01)
- **Decision needed**: 06 의 `ROW_VERSION`(`TB_MDM_RULE_VER`·`RULE_TEST_CASE`·`RULE_SET`) 타입을 ERD 초안의 `INTEGER`/`INT` 로 둘 것인가
- **Decision made**: 세 테이블 모두 두 방언 `BIGINT NOT NULL DEFAULT 0` 으로 V8 에 만든다. 엔티티는 `long rowVersion`(`@Version` 아님, `updatable = false`)
- **Rationale**: TSK-01-03 인계 ②와 머지된 공통 버전 서비스가 `ROW_VERSION` 을 `long` 으로 읽고 쓴다. 같은 뜻의 낙관적 잠금 카운터를 테이블마다 다른 타입으로 두면 조건부 UPDATE 헬퍼가 갈라진다. ERD 초안은 미승인 선행 산출물이다
- **Reversible**: no(V8 이 적용된 뒤에는 새 V 번호의 `ALTER COLUMN` 이 필요하다)
- **Source**: docs/mdm/tasks/TSK-08-01/design.md D2, F16

## D-051 (2026-09-24T00:58:10Z)
- **Phase**: build (TSK-08-01)
- **Decision needed**: ERD 초안의 MSSQL `RULE_VAR.VAR_NAME VARCHAR(MAX)` 는 유일 인덱스 키가 될 수 없고, 결과 열 `VAR_NAME` 이 NULL 이면 두 방언의 유일성 판정이 갈린다. 어떻게 고치는가
- **Decision made**: MSSQL `VAR_NAME` 을 `VARCHAR(1000) COLLATE Latin1_General_100_BIN2` 로 두고(SQLite 는 `TEXT`), 두 방언에 `CK_TB_MDM_RULE_VAR_RESULT_NAME`(`VAR_KIND <> 'RESULT' OR VAR_NAME IS NOT NULL`)을 더한다. naming-dialect-rules §3 #18 에 "MSSQL 키 칼럼 MAX 금지"를 규칙으로 더했다
- **Rationale**: 06:1011 "결과 열은 필수이고 버전 안에서 유일". 키 크기 1,054바이트로 비클러스터 인덱스 한도(1,700바이트) 안이다. 길이 1,000 은 원문 근거가 없는 선택이고, 식 변수에 한글 문자열 리터럴이 들어가면 MSSQL 에서 손실될 수 있다(TSK-05-01 F28 과 같은 종류의 위험)
- **Reversible**: no(적용 뒤에는 새 V 번호로 인덱스를 지우고 `ALTER COLUMN` 해야 한다)
- **Source**: docs/mdm/tasks/TSK-08-01/design.md D3, F13·F14

## D-052 (2026-09-24T00:58:10Z)
- **Phase**: build (TSK-08-01)
- **Decision needed**: `RULE_VAR.DISP_TYPE` 에 06 표기(`Equal`·`1`·`2`·`Expression`·`Value`)와 엔진 enum 이름(`EQUAL`·`ONE`·`TWO`·`EXPRESSION`·`VALUE`) 가운데 무엇을 저장하고 DB 에서 제약할 것인가
- **Decision made**: 06 표기로 저장하고 두 방언에 `CK_TB_MDM_RULE_VAR_DISP` 를 신설한다. 엔진 enum 으로의 변환은 `DefinitionLookup` 구현(TSK-08-04)이 대응표(`Equal→EQUAL`, `1→ONE`, `2→TWO`, `Expression→EXPRESSION`, `Value→VALUE`)로 한다
- **Rationale**: 06 정본이 칼럼 값과 샘플을 그 표기로 적는다. 쓰는 쪽(08-02)과 읽는 쪽(08-04)이 서로 다른 코드를 쓰는 사고를 공유 계약 단계에서 DB 로 막는다
- **Reversible**: no(저장된 행이 생기면 값 변환 마이그레이션이 필요하다)
- **Source**: docs/mdm/tasks/TSK-08-01/design.md D4, F15

## D-053 (2026-09-24T00:58:10Z)
- **Phase**: build (TSK-08-01)
- **Decision needed**: SQLite 에서 JPA 기본 바인딩은 업무 일시(`LocalDateTime`)를 정수로 저장해 네이티브 쓰기(KST 텍스트)와 어긋난다. mdm 에 매핑 인프라를 둘 것인가, 감사 `U_AT` 형식 혼재도 고칠 것인가
- **Decision made**: mdm 전용 `MdmSqliteLocalDateTimeConverter`(`@Converter` 없음)를 `MdmSqliteTemporalContributor` 로 `application-local.yml` 의 `spring.jpa.properties.hibernate.metadata_builder_contributor` 에만 등록한다. 형식은 `MdmTemporalBinder` 와 같은 `'yyyy-MM-dd HH:mm:ss'`(초 절삭). 감사 `U_AT`(Instant) 형식 혼재는 고치지 않는다
- **Rationale**: 규칙표 #16·TSK-01-03 인계 ④. Hibernate 7.0.5 + Spring Boot 기본 EMF 에서 이 등록이 실제로 먹는다(`typeof = text` 실측, 등록 줄을 지우면 빨개진다). local-db·wildfly 는 local 을 포함하지 않아 MSSQL 에 새지 않는다. **실측**: 공통 서비스가 KST 텍스트로 쓴 `U_AT` 를 엔티티 `Instant` 로 읽으면 예외 없이 9시간 어긋난다(`BusinessRuleVersionScenarioSqliteTest` R1). 원인은 TSK-01-03 바인더(D-044)와 cactus `Instant` 매핑(D-038)의 형식 규약이라 이 Task 밖이다
- **Reversible**: yes(컨버터·contributor·yml 한 줄을 지우면 된다. 다만 그 사이 저장된 SQLite 행은 텍스트로 남는다)
- **Source**: docs/mdm/tasks/TSK-08-01/design.md D5·D6, F10·F12

## D-054 (2026-09-24T00:58:10Z)
- **Phase**: build (TSK-08-01)
- **Decision needed**: 06 식별자 발급(`last_var_id` 등)과 확정 검사 diff 의 06 관례를 어떤 모양으로 선언하는가
- **Decision made**: `contract.rule` 에 `MdmRuleIdIssuer.issue(String, MdmRuleIdKind, int) → MdmRuleIdRange`(한 문장으로 count 개 연속 발급), `MdmRuleDefinitionSource`(STORED_VERSION·REQUEST_BODY), `MdmRuleDiffConventions`(diff key = `row_id` 10진 문자열, 값 맵 키 `SEQ`·`CELLS`), `MdmRuleConfirmCheckItem`(SAVE_CHECKS·NOT_EMPTY·TEST_CASES·RESULT_VAR_RELEASED, 룰 참조 검사 없음)을 선언한다. 확정 검사 SPI 는 기존 `VersionConfirmCheckSpi` 를 쓰고 엔진 `DefinitionLookup` 서명은 바꾸지 않는다
- **Rationale**: 규칙표 #1(발급은 단일 문)과 그리드 다건 저장. 06 diff SQL(06:1255-1268)이 `cells`·`seq` 로 판정한다. 계약 패키지는 엔진 타입에 의존할 수 없어 `DefinitionLookup` 구현 대상은 enum·매핑표·테스트 스텁으로 선언한다
- **Reversible**: no(TSK-08-02·08-04·08-05 가 이 서명과 관례 위에 구현한다)
- **Source**: docs/mdm/tasks/TSK-08-01/design.md D8·D9·D10, F18·F21
