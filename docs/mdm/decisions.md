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

## D-055 (2026-09-24T08:20:00Z)
- **Phase**: build (TSK-04-03)
- **Decision needed**: 도메인 영향도의 03 레이아웃·06 룰 결과 변수 참조와 배포 시스템을 어떻게 얻는가
- **Decision made**: 02 는 자신의 테이블(`TB_MDM_DOMAIN`·`TB_MDM_COLUMN`)만 재귀 CTE 로 읽고, 03·06 참조는 `MdmDomainReferenceSpi` 빈 목록(0개 가능)을 모아 합친다. 03·06 SPI 구현은 각 영역 작업(TSK-05-02·05-03·08-01) 몫이다. 배포 시스템은 빈 목록 + "배포 보류" 표시
- **Rationale**: TSK-04-01 D9 계약과 wbs 의존 방향(02→03·06 단방향)을 따른다. 03·06 테이블이 없든 비어 있든 같은 코드로 참조 0건이 된다. 배포는 TRD T4·D-019 로 보류다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-04-03/design.md D1

## D-056 (2026-09-24T08:20:00Z)
- **Phase**: build (TSK-04-03)
- **Decision needed**: 마스터코드 원장(서버 `CodeLookup`)이 없을 때 R10(카테고리 유효성)과 `MASTER` 판정을 어떻게 다루는가
- **Decision made**: R10 은 `CodeLookup` 빈이 있을 때만 거부하고, 없으면 경고 W02 로 저장을 허용한다. `MASTER`·`MASTER_AT` 가 들었거나 CODE 종류인 테스트 케이스·미리보기는 UNDECIDED(기대값과 비교하지 않음)로 둔다. TSK-06-01 이 `CodeLookup` 빈을 등록하면 자동으로 켜진다(그 구현은 요청 트랜잭션에 기대면 안 된다 — 평가는 가상 스레드)
- **Rationale**: 수용 기준 2(CODE 도메인은 체인에 참조가 있으면 저장)를 04 원장 없이도 만족해야 한다. TSK-04-01 §8 인계가 "구현체가 없으면 건너뛰거나 확인 불가로 표시"를 정했다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-04-03/design.md D2

## D-057 (2026-09-24T08:20:00Z)
- **Phase**: build (TSK-04-03)
- **Decision needed**: 도메인 변경 분류(호환/좁히기·넓히기/구조 변경)의 효과와 "새 버전"·배포 순번
- **Decision made**: 분류는 계산·표시만 하고 효과는 "값 정의 칼럼(LENGTH·SCALE·STD_RULE·BIZ_RULE·MARU_CODE_ID·CATE_ID) 변경이면 같은 트랜잭션에서 하위 도메인 재검사"로 한정한다. 구조 칼럼(DOMAIN_KIND·DATA_TYPE·UNIT_CODE·PARENT_DOMAIN_ID) 변경은 거부(S01). 버전은 감사 `VER` 이 대신하고 `CHG_SEQ` 는 쓰지 않는다
- **Rationale**: TSK-02-03 D3(버전은 감사 VER 과 즉시 반영 정책으로 갈음)과 TRD T4·D-019(배포 순번 코드 금지). spec 이 요구한 것은 분류 표시와 구조 변경 금지다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-04-03/design.md D6

## D-058 (2026-09-24T00:00:00Z)
- **Temp ID**: D-TSK-06-01-1
- **Phase**: build (TSK-06-01)
- **Decision needed**: TSK-04-01 D1 이 넘긴 02→04 교차 FK `FK_TB_MDM_DOMAIN_CODE` 를 어떻게 거는가(SQLite 는 `ALTER TABLE ADD CONSTRAINT` 가 없다)
- **Decision made**: V9 에서 두 방언 모두 건다(당초 팀장 배정 V6, 2026-09-24 팀장 정정으로 origin/dev 머지 뒤 최대 버전+1 인 V9 로 재채번 — design.md D1). MSSQL 은 파일 끝 `ALTER TABLE TB_MDM_DOMAIN ADD CONSTRAINT`, SQLite 는 Flyway 기본 트랜잭션 안에서 `TB_MDM_DOMAIN` 을 재생성한다(V3 정의 글자 그대로 + FK 한 줄, 행 복사, `sqlite_sequence` 상한 보존, DROP·RENAME, 인덱스 재생성). `PRAGMA defer_foreign_keys`·`.sql.conf` 는 쓰지 않는다
- **Rationale**: 선행 인계(TSK-04-01 D1·V3 주석)가 "TSK-06-01 이 두 방언 모두 후행 추가, SQLite 는 재생성"이다. Build 실측: 참조 없는 도메인 행이 있는 DB 는 행·칼럼 정의·인덱스·CHECK·AUTOINCREMENT 상한이 보존되고 FK 하나만 는다(`MdmDomainCodeFkRebuildTest` A). 도메인을 참조하는 행(자식 도메인·컬럼, V8 `TB_MDM_RULE_VAR`)이 있는 DB 는 DROP 의 암묵 DELETE 가 FK 위반으로 실패하고 V9 전체가 롤백돼 부분 적용이 남지 않는다(같은 테스트 B·B_업무기준). V8 의 `FK_TB_MDM_RULE_VAR_DOMAIN` 은 재생성 뒤에도 새 `TB_MDM_DOMAIN` 을 가리키고 `foreign_key_check` 가 깨끗하다(A). 대가: 참조 행이 든 로컬 `src/backend/data/mdm.db` 는 V9 적용이 실패한다 — 파일을 지우고 다시 띄운다. V9 앞에 `TB_MDM_DOMAIN` 을 바꾸는 마이그레이션이 들어오면 재생성 DDL 을 맞춘다(A 가 잡는다)
- **Reversible**: no(교차 FK 추가 — 되돌리려면 SQLite 재생성을 한 번 더 하는 후속 마이그레이션이 필요하다)
- **Source**: docs/mdm/tasks/TSK-06-01/design.md D3·§6.0.8·F6·F7

## D-059 (2026-09-24T00:00:00Z)
- **Temp ID**: D-TSK-06-01-2
- **Phase**: build (TSK-06-01)
- **Decision needed**: ERD `CK_TB_MDM_CODE_VER_APPLY`(DRAFT 가 아니면 APPLY_FROM·APPLY_TO 둘 다 필수)가 원천 04 의 REQUESTED 행(희망 apply_from 만 있고 apply_to 는 승인 때 채움)을 거부한다. 그대로 옮기는가
- **Decision made**: 두 방언 V9 CHECK 를 `STATUS = 'DRAFT' OR (APPLY_FROM IS NOT NULL AND (STATUS = 'REQUESTED' OR APPLY_TO IS NOT NULL))` 로 넓힌다
- **Rationale**: 원천 04:999-1000(요구사항 층)이 ERD(미승인 선행)보다 위이고, D-019 "결재를 붙일 때 표를 다시 만들지 않는다" 원칙상 지금 표가 원천 상태 전이를 받아야 한다. 공통 서비스의 확정 경로(DRAFT→RELEASED, 두 칸을 함께 씀)는 실제 V9 표(Build 당시 파일명 V6)로 돈 시나리오 키트 22건(`MasterCodeVersionStateSqliteTest`)이 그대로 통과해 영향이 없음을 확인했다
- **Reversible**: yes(CHECK 만 바꾸는 후속 마이그레이션으로 ERD 원문으로 되돌릴 수 있다)
- **Source**: docs/mdm/tasks/TSK-06-01/design.md D4·F15

## D-060 (2026-09-24T00:00:00Z)
- **Temp ID**: D-TSK-06-01-3
- **Phase**: build (TSK-06-01)
- **Decision needed**: MSSQL `TB_MDM_CODE_CATE.DEF_EXPR` 를 ERD 대로 `VARCHAR(MAX)`(ASCII 전용)로 두는가
- **Decision made**: `NVARCHAR(MAX)` 로 둔다(SQLite 는 `TEXT` 그대로)
- **Rationale**: 원천 04:171·180 이 REGEX 대상 칸으로 ATTR01~ATTR10(한글 값 가능, `NVARCHAR(500)`)을 허용하므로 그 값에 맞추는 정규식에 한글이 들어간다. `VARCHAR` 는 한글을 `?` 로 손실한다(TSK-05-01 F28 과 같은 현상). 사용자 결정(도커 금지)으로 MSSQL 한글 왕복 실측은 생략하고 두 방언 DDL 대조 테스트(`MdmMasterCodeDialectDdlParityTest`)가 타입 텍스트만 고정한다
- **Reversible**: yes(칼럼 타입 변경 마이그레이션. 되돌리면 06-04 에 비 ASCII 정규식 저장 거부 검사를 인계한다)
- **Source**: docs/mdm/tasks/TSK-06-01/design.md D6·F16

## D-061 (2026-09-24T00:00:00Z)
- **Temp ID**: D-TSK-06-01-4
- **Phase**: build (TSK-06-01)
- **Decision needed**: SQLite 에서 엔티티의 업무 `LocalDateTime`(04 `TB_MDM_CODE_VER` 일시 6칼럼 등)을 어떤 형식으로 쓰는가(규칙표 #16 이 이 Task 에 배정)
- **Decision made**: mdm 전용 `MdmSqliteLocalDateTimeConverter`(TSK-08-01 D-053 과 같은 클래스 — dev 머지 때 한 벌로 합쳤다)(쓰기 = `MdmTemporalBinder.SQLITE_TEXT_PATTERN` 19자, 읽기 = `fromDb` 문자열 규칙)를 `MdmSqliteTemporalContributor` 로 auto-apply 하고, `application-local.yml` 의 `spring.jpa.properties.hibernate.metadata_builder_contributor` 로만 켠다. `MdmCodeVer` 세터는 초 단위로 자른다
- **Rationale**: 공통 버전 서비스가 네이티브로 쓰는 19자 TEXT 와 엔티티가 쓰는 값이 글자 단위로 같아야 한다(TSK-01-03 §7 ④). Build 실측: 컨트리뷰터가 없으면 Hibernate 가 epoch millis 정수를 바인딩하고 TEXT 친화도 칼럼이 `'1782831600000'` 문자열로 저장해 `fromDb` 가 읽지 못한다. 등록 뒤에는 네이티브와 같은 값이 저장되고 양방향 읽기가 성립한다. mcm-core 컨버터는 `.SSS` 23자라 쓰지 않는다. MSSQL(`application-local-db.yml`)에는 두지 않는다. 대가: 앞으로 mdm 의 모든 `LocalDateTime` 엔티티 필드에 SQLite 에서 같은 형식이 적용된다(의도한 일관성, `Instant` 감사 칼럼은 제외 — D-038 그대로)
- **Reversible**: yes(yml 한 줄과 두 클래스를 지우면 원복. 이미 저장된 SQLite 로컬 데이터는 형식이 섞일 수 있다)
- **Source**: docs/mdm/tasks/TSK-06-01/design.md D7·F10·F11, naming-dialect-rules.md §3 #16

## D-062 (2026-09-24T00:00:00Z)
- **Temp ID**: D-TSK-06-01-5
- **Phase**: build (TSK-06-01)
- **Decision needed**: `FK_TB_MDM_DOMAIN_CODE`(D-058) 때문에 깨지는 기존·병렬 Task 테스트 픽스처를 누가 어떻게 고치는가
- **Decision made**: 이 Task 가 자기 브랜치에서만 고친다(코드 참조가 필요하면 `TB_MDM_CODE` 행을 먼저 seed, 아니면 `MARU_CODE_ID` 를 NULL 로). Build 시점 전체 스위트 결과 dev 에 있는 기존 픽스처(`MdmDictionaryExpectations`·`VersionFixtureTables`·`VersionStateServiceSqliteTest`·`MdmTermDomainColumnMigrationTest`)는 FK 로 깨지지 않아 고친 파일이 없다. `MdmTermDomainColumnMigrationTest`·`MdmTermDomainColumnMssqlMigrationTest` 의 "FK 부재" 이름만 사실에 맞게 "FK 추가 뒤에도 NULL 통과" 로 고쳤다(본문·기대값 불변). TSK-04-03(`dflow-2ca988a4`) 브랜치는 직접 고치지 않는다. Phase 06 전 dev 머지로 들어온 TSK-04-03 테스트 5건이 FK 로 깨져 세 파일 모두 **seed** 로 고쳤다(검증 대상이 코드 참조라 NULL 로 바꾸면 검증이 사라진다): `DefaultMdmEffectiveDomainResolverTest`(`tree()` 앞에 `TB_MDM_CODE` `PROC_CD` 헤더), `DomainMngRejectConditionTest`·`DomainMngWithoutCodeLedgerTest`(`setUp` 에서 `DomainMngApiSupport.seedCodeHeader("PROC_CD")`). 헤더 한 행만 넣는다 — FK 는 `MARU_CODE_ID` 만 보고 DB 행을 읽는 `CodeLookup` 빈이 없어 "코드 원장 없음" 전제가 바뀌지 않는다
- **Rationale**: 팀장 지시(D3 유지·04-03 브랜치 직접 수정 금지·깨지는 픽스처는 이 Task 가 고침). 기대값을 완화하지 않는다. TSK-04-03 이 Phase 06 전에 dev 에 머지되면 design.md §7 절차대로 다시 확인한다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-06-01/design.md D11·§7·F9

## D-063 (2026-09-24T10:20:00Z)
- **Temp ID**: D-TSK-07-01-1
- **Phase**: build (TSK-07-01)
- **Decision needed**: 일시 선분 저장 코어 인터페이스(`MdmTemporalSegmentStore`)의 확정 시그니처를 append 한다(design.md §6.1 확정분, Build 가 그대로 구현)
- **Decision made**: Design Phase D1 을 그대로 구현했다 — 제네릭 `<K,V>` 네 메서드(`register`/`modify`/`close`/`reopen`) 인터페이스 하나로 항목(`TB_MDM_DATA_ITEM`)·카테고리(`TB_MDM_DATA_CATE`)·소속(`TB_MDM_DATA_CATE_ITEM`) 세 테이블의 선분 생애주기를 공통 표현한다. `MdmTemporalSegmentRules.OPEN_END`(`LocalDateTime.of(9999,12,31,0,0,0)`)·`MdmTemporalSegmentAction`(INSERT/UPDATE/CLOSE/REOPEN/NONE)·`MdmTemporalSegmentResult<V>`(action,value)와 함께 `com.dongkuk.dmes.mdm.contract.data` 패키지에 둔다. `src/main` 구현체는 없다(TSK-07-03 몫) — `MdmTemporalSegmentStoreNoImplementationTest`(ArchUnit, `api/src/test`)가 이를 확인하고, `MdmTemporalSegmentStoreConsumerStub`(`lib/src/test`)이 컴파일 증명을 한다
- **Rationale**: design.md D1 근거(spec 요구사항 "저장 코어 인터페이스", 05 문서의 네 연산 명명, 기존 계약 인터페이스 선례) 그대로
- **Reversible**: yes(인터페이스 시그니처 변경은 스텁·ArchUnit 테스트만 함께 고치면 된다 — DDL 영향 없음)
- **Source**: docs/mdm/tasks/TSK-07-01/design.md D1·§6.1

## D-064 (2026-09-24T10:20:00Z)
- **Temp ID**: D-TSK-07-01-2
- **Phase**: build (TSK-07-01)
- **Decision needed**: `MdmDataItem.validFrom`·`MdmDataCate.validFrom`·`MdmDataCateItem.validFrom`(선분 PK 구성 요소, F6)은 LocalDateTime 이면서 `@Id` 다 — Hibernate 7 은 `@jakarta.persistence.Id` 속성에 `AttributeConverter`(JPA 계층, auto-apply 포함)를 거는 것을 하드 금지한다(실측: `org.hibernate.AnnotationException: 'AttributeConverter' not allowed for attribute ... annotated '@jakarta.persistence.Id'`, `@Convert(disableConversion=true)`로만 억제 가능). design.md F8 이 예상한 mcm 식 `AttributeConverter`+`MetadataBuilderContributor` auto-apply 방식은 PK 가 아닌 칼럼에서만 유효했다 — Id 인 `VALID_FROM` 을 어떻게 SQLite `TEXT`(naming-dialect-rules §3 #16 형식)로 저장할 것인가
- **Decision made**: `VALID_FROM`(Id) 은 Hibernate 네이티브 `UserType<LocalDateTime>`(`MdmLocalDateTimeIdUserType`, `org.hibernate.usertype.UserType` — JPA `AttributeConverter` 와 다른 코드 경로라 이 제약을 받지 않는다, 실측 확인)으로 매핑하고 필드에 `@Convert(disableConversion=true)`를 함께 붙여 auto-apply 컨버터 탐색 대상에서 명시적으로 뺀다. 이 `UserType` 은 `SharedSessionContractImplementor.getJdbcServices().getDialect()`로 런타임에 방언을 감지해 SQLite 면 `yyyy-MM-dd HH:mm:ss` 텍스트로, 그 밖(MSSQL 포함)이면 네이티브 `Timestamp` 로 바인딩한다 — `MdmSqliteTemporalContributor`가 SQLite 프로파일에만 컨버터를 등록하는 것과 같은 효과를 방언 감지로 낸다. 비-Id LocalDateTime 칼럼(`VALID_TO`·`CLOSED_AT`·`RECEIVED_AT`·`PROCESSED_AT`)은 auto-apply SQLite 컨버터를 쓴다. 당초 이 Task 가 `LocalDateTimeAttributeConverter`+`MdmSqliteTemporalConverterContributor` 를 따로 만들었으나, dev 머지(2026-09-24) 때 TSK-08-01·06-01 이 먼저 넣은 같은 목적의 `MdmSqliteLocalDateTimeConverter`+`MdmSqliteTemporalContributor`(`common.support`, 형식 동일)로 합치고 이 Task 의 두 파일은 지웠다(`metadata_builder_contributor` 는 하나만 등록된다)
- **Rationale**: `AttributeConverter` 자체가 Hibernate 7 에서 Id 속성에 물리적으로 걸리지 않으므로(대안 없음, 이 Task 의 설계 판단이 아니라 프레임워크 제약) `@Type`(Hibernate 네이티브 타입 계층)이 유일한 실행 가능 경로였다(실측으로 검증: `@Convert(disableConversion=true)` 없이 `@Type` 만 추가해도 auto-apply 검사가 먼저 걸려 실패, 두 애노테이션을 함께 써야 통과). 방언 감지를 `UserType` 안에 넣은 것은 정적 yml 스코프(SQLite 전용 프로파일 파일) 방식이 Id 필드에는 적용 불가능해서 택한 동등한 대안이다(스코프 목적은 같다 — MSSQL 프로파일에서 텍스트 컨버전이 걸리지 않게 한다). **근거 강도: 강**(대안이 사실상 없다 — 실측으로 다른 경로가 전부 막힘을 확인했다)
- **Reversible**: yes(향후 Hibernate 버전이 Id 컨버터를 허용하면 `MdmLocalDateTimeIdUserType` 을 걷어내고 mcm 과 같은 단일 `AttributeConverter` 경로로 통일할 수 있다 — 엔티티 3개의 `validFrom` 필드 애노테이션만 바꾸면 된다)
- **Source**: docs/mdm/tasks/TSK-07-01/design.md D3(신설), F7·F8, 실측(Hibernate 7.2.12.Final `BasicValueBinder.disallowConverter`)

## D-065 (2026-09-24T10:20:00Z)
- **Temp ID**: D-TSK-07-01-3
- **Phase**: build (TSK-07-01)
- **Decision needed**: F7·F8 단정(§3.2, §5 불변 규칙 8) — SQLite 전용 auto-apply 컨버터(비-Id 필드, dev 머지 뒤 `MdmSqliteLocalDateTimeConverter`)와 `MdmLocalDateTimeIdUserType`(Id 필드) 가 실제로 naming-dialect-rules §3 #16 형식(`yyyy-MM-dd HH:mm:ss`, 소수초 없음, 공백 구분자)으로 저장·조회되는지 실측
- **Decision made**: `MdmMasterDataEntityJpaRoundtripTest.VALID_FROM_과_VALID_TO_가_SQLite_에_naming_dialect_rules_형식_TEXT_로_저장된다()`로 실측 확인했다 — `typeof(VALID_FROM)`·`typeof(VALID_TO)` 모두 `'text'`, 값은 각각 `'2026-09-24 10:00:00'`·`'9999-12-31 00:00:00'`(요청한 형식과 정확히 일치). 컨트리뷰터 등록(`application-local.yml` 의 `metadata_builder_contributor`) 전에는 SQLite 가 epoch millis 정수를 텍스트로 새겨(`typeof`=`text` 이지만 값이 `'1790211600000'`류) `getTimestamp()` 왕복이 `ParseException` 으로 깨졌다(mcm 선례가 경고한 결함이 mdm 에서도 그대로 재현됨을 실측으로 확인) — 등록 후에는 재현되지 않는다
- **Rationale**: "실측 후 대응"이 아니라 "알려진 결함을 선제적으로 우회"한다는 design.md F8 원칙을 그대로 따르고, 그 우회가 실제로 유효한지 등록 전/후 두 상태를 모두 실행해 비교했다(mutation 증거 겸용)
- **Reversible**: yes(컨버터·UserType 구현을 교체해도 이 Task 의 다른 결정에 영향 없음)
- **Source**: docs/mdm/tasks/TSK-07-01/design.md F7·F8·§3.2, `MdmMasterDataEntityJpaRoundtripTest.java`

## D-066 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-1
- **Phase**: build (TSK-05-02)
- **Decision needed**: spec entry-point 의 `mdl/headerMng`·`mdl/layoutMng` 와 리포 정본 그룹 코드 `dmb` 중 무엇으로 메뉴·componentPath·패키지·BPMN 경로를 만드는가
- **Decision made**: `dmb` 로 만든다(componentPath `dmb/headerMng`·`dmb/layoutMng`, 패키지 `…mdm.dmb.*`, BPMN `services/dmb/*.bpmn`). spec 이 적은 메뉴 이름(마루 MDM > 레이아웃 > 전문 헤더 정의/전문 레이아웃)은 그대로 지킨다
- **Rationale**: D-015 가 옛 `mdt/mdl` 을 `dma~dme` 로 바꿨고 screens/README §3·wbs tech-spec·DataInitializer 의 `dmb "레이아웃"` 폴더·`MdmScreenGroup.DMB`·권한 매트릭스가 모두 `dmb` 다. TSK-04-03 의 `mdt→dma` 선례
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D1

## D-067 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-2
- **Phase**: build (TSK-05-02)
- **Decision needed**: 헤더별 인코딩·패딩을 어디에 담는가(확정 스키마는 `TB_MDM_EAI` 에만 칸이 있다)
- **Decision made**: 인코딩·패딩은 EAI 가 소유한다. 헤더 상세에서 EAI 를 고르거나 새 코드로 만들고 그 EAI 의 이름·인코딩·패딩을 함께 저장하며, `TB_MDM_EAI.HEADER_LAYOUT_ID` 를 그 헤더(EAI 표준 헤더)로 둔다. 스키마 변경 없음
- **Rationale**: 03 테이블 설계와 TSK-05-01 D5(encoding·padRule 은 EAI 소유, 스냅샷 최상위). V9 마이그레이션은 TSK-02-03 ERD·05-01 계약을 함께 바꿔야 해 권한 밖이다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D2

## D-068 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-3
- **Phase**: build (TSK-05-02)
- **Decision needed**: `TB_MDM_LAYOUT_ITEM.NUM_FORMAT VARCHAR(50)` 의 문자열 형식과 숫자 표현 자리수(M201 COIL_THK 4바이트)를 담을 곳
- **Decision made**: `SIGN=Y|N;ZERO=Y|N;SCALE=<0 또는 도메인 소수>;WIDTH=<1 이상>`(키 순서 고정, 네 키 필수, 최대 29자). WIDTH 가 항목 길이가 된다. Java `LayoutNumFormatCodec`·TS `num-format.ts` 가 같은 벡터를 통과한다
- **Rationale**: 시안 항목 상세가 부호 자리·0 채움·암묵 소수점·표현 자리수를 항목 칸으로 두고, 등록 거부 #4 가 표현 자리수와 도메인 길이가 다름을 전제한다. JSON 은 50자를 넘는다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D3

## D-069 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-4
- **Phase**: build (TSK-05-02)
- **Decision needed**: 레이아웃 저장 거부를 공유 enum `MdmErrorCode` 에 새 상수로 더하는가
- **Decision made**: 더하지 않는다. `LayoutRejections` 가 cactus `BusinessException(BUSINESS_ERROR, "… 저장 거부: Lnn[seq] …", details)` 를 직접 만들고(첫 detail 코드 `LAYOUT_SAVE_REJECTED`), 동시 수정만 기존 MDM001 을 쓴다. 거부 코드 L01~L11
- **Rationale**: 기점 이후 dev 가 MDM016~021 을 가져가 같은 줄·번호 충돌이 확정적이다. OASIS 서비스 예외는 `meta.message` 원문만 화면에 가므로 기능 차이가 없다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D4

## D-070 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-5
- **Phase**: build (TSK-05-02)
- **Decision needed**: "표준 관리자 역할만 등록·수정"을 서버 서비스가 직접 검사하는가
- **Decision made**: 기점 방식대로 메뉴·API 액션 RBAC 는 mcm 시드와 BFF 가 맡고(dmb: MDM_STD_ADMIN EDIT, MDM_STEWARD READ, SYSADMIN PERM_ALL) 서비스는 역할을 보지 않는다
- **Rationale**: D-041(TSK-01-03 D6). 서버 가드 클래스(dev 의 TSK-04-04 `MdmStdAdminGuard`)는 기점에 없고 서버 승인 전이다. 모듈 안 방식이 갈리므로 사람이 통일 여부를 정한다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D5

## D-071 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-6
- **Phase**: build (TSK-05-02)
- **Decision needed**: 본문·헤더 항목의 드래그 순서를 어떻게 구현하는가(shared `AgDataGrid` 에 행 드래그가 없다)
- **Decision made**: shared `AgDataGrid` 에 선택형 `GridColumn.rowDrag`·`AgDataGridProps.onRowOrderChange` 를 더한다. prop 이 있을 때만 community managed row drag 를 켜고 정렬을 끈다. 없으면 기존 그리드와 같은 prop 을 넘긴다
- **Rationale**: spec 본문이 드래그를 요구하고, mantine-aggrid-ui §3·FrontEnd Part B §17 이 "래퍼가 못 채우면 화면에서 우회하지 말고 shared 에 추가"라 한다. `AllCommunityModule` 이 이미 등록돼 있어 새 의존성·Enterprise 가 없다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D6

## D-072 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-7
- **Phase**: build (TSK-05-02)
- **Decision needed**: 형제 TSK-05-03 과의 경계, 헤더를 바꿀 때 그 헤더를 쓰는 전문의 저장값(오프셋·총 길이·재정의) 처리
- **Decision made**: 이 작업은 L01~L11 만 검사한다. 헤더 저장 트랜잭션에서 사용 전문의 본문 오프셋·총 길이를 다시 계산하고, 재정의는 헤더 항목의 COLUMN_PHYS 로 다시 짝지으며 짝이 없거나 CONST 가 아니게 되면 지운다. 업무 `VERSION` 은 올리지 않는다. 거부 #2·#3·#4·#7, 버전·스냅샷·직렬화, `MdmDomainReferenceSpi(LAYOUT_ITEM)` 는 TSK-05-03
- **Rationale**: 03 "오프셋과 전문 총 길이는 저장 시 계산 — 수작업으로 맞추는 값이 없다". 재정의는 SEQ 로만 걸려 있어 항목을 다시 넣으면 물리명으로 짝지어야 한다. wbs 가 거부 7종·버전·영향 목록을 05-03 요구사항으로 적었다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D7

## D-073 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-8
- **Phase**: build (TSK-05-02)
- **Decision needed**: 컬럼 사전 검색·헤더 선택 팝업이 부를 API 를 새 액션·새 팝업 서비스로 둘 것인가
- **Decision made**: 각 서비스 `search` 에 `target=COLUMN`(·`HEADER`)을 두고 공용 `LayoutDictionary.search` 를 부른다. 액션은 search·view·save 셋만 쓴다. `target=HEADER` 응답은 저장 전 상수 편집을 위해 헤더 항목을 함께 싣는다(Build 이탈 B1)
- **Rationale**: 액션은 `MdmActions` 13종 안에서만 고를 수 있고 밖의 이름은 SYSADMIN 도 403 이다. 새 팝업 OBJECT 는 screens/README §3·식별자 사전·RBAC 시드를 늘린다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D8

## D-074 (2026-09-24T04:25:00Z)
- **Temp ID**: D-TSK-05-02-9
- **Phase**: build (TSK-05-02)
- **Decision needed**: E2E 게이트에서 TSK-04-03 스펙 `mdm-domainMng.spec.ts` E2~E6 가 새 DB 첫 실행마다 실패했다 — 다른 Task 의 테스트를 고치는가
- **Decision made**: 그 스펙의 `selectRow` 도우미만 고쳐, 클릭이 부른 view 응답과 두 프레임 반영을 기다린 뒤 기존 단언을 둔다. 단언·기대값은 바꾸지 않는다
- **Rationale**: 실측 — ag-grid 가 `rowClicked` 를 비동기 큐로 약 19ms 늦게 보내는데 `selectRow` 의 대기 조건(도메인명 값)은 저장 직후 같은 행이 이미 열려 있어 처음부터 참이었다. 늦게 온 view 응답이 미리보기 입력값을 비웠다. 공허한 대기를 실제 왕복 대기로 바꾸는 강화다. 수정 뒤 새 DB 전체 실행 연속 2회 12 passed
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-02/design.md D9

## D-075 (2026-09-24T05:30:57Z)
- **Temp ID**: D-TSK-06-02-1
- **Phase**: design (TSK-06-02)
- **Decision needed**: TSK-01-03 §7 인계가 DRAFT 소유권 action(선점·해제·넘기기)의 이름 확정과 권한 등록을 「06-02·08-02 중 먼저 오는 쪽」에 넘겼다. 두 Task 가 같은 기점에서 동시에 돌아 같은 공유 파일(MdmActions·MdmPermissions·DataInitializer allActions/editActions·SecurityScreenContractTest·mdm-rbac-seed-check.expected.txt)을 고치게 된다
- **Decision made**: 팀장 확정 — action 이름 확정과 allActions·PERM_MDM_EDIT·MdmActions·mdm-rbac-seed-check.expected.txt(와 짝이 되는 MdmPermissions·SecurityScreenContractTest·기존 DB 보정)의 소유권 action 부분은 TSK-08-02 가 맡는다. TSK-06-02 는 이 파일들의 소유권 action 부분을 고치지 않고, BPMN·화면은 ADR-0003 D5 권장 이름 lock/unlock/handover 를 문자열로만 참조한다. BFF 권한이 필요한 동작(화면의 선점·해제·넘기기)은 「08-02 머지 뒤 연결」이며, 그 전에는 서비스·HTTP(mdm 직접)·vitest 테스트로 확인한다
- **Rationale**: 동시 진행 Task 두 개가 같은 공유 계약·시드를 고치면 머지 충돌과 이름 불일치가 생긴다. 룰 화면(08-02)이 소유권 action 을 가진 다른 한쪽이라 한 곳에 몰았다
- **Reversible**: yes(08-02 가 다른 이름을 확정하면 06-02 의 BPMN 3분기·DmcBpmnActionTest 로컬 상수·FE 문자열만 바꾼다)
- **Source**: docs/mdm/tasks/TSK-06-02/design.md §1·§2「수정하지 않는 것」·§6.1·§8, docs/mdm/tasks/TSK-01-03/design.md §7, docs/mdm/adr/0003-module-boundary-screens-roles.md D5

## D-076 (2026-09-24T05:30:57Z)
- **Temp ID**: D-TSK-06-02-2
- **Phase**: design (TSK-06-02)
- **Decision needed**: 담당자 쓰기 가드와, 운영 VersionDraftDeletionSpi·VersionConfirmCheckSpi 빈이 생길 때 시나리오 테스트(VersionScenarioTestConfig 의 가짜 SPI)와 대상이 겹쳐 기동이 실패하는 문제를 어느 Task 가 공용 부품으로 해결하는가
- **Decision made**: 팀장 확정((A)안) — TSK-06-02 가 공용 부품 두 개를 만든다. P1 `com.dongkuk.dmes.mdm.common.security.MdmStewardGuard#requireSteward()`(MDM_STEWARD 역할이 없으면 MDM013, MdmStdAdminGuard 와 같은 모양). P2 `VersionScenarioTestConfig` 의 static `@Bean BeanFactoryPostProcessor removeProductionVersionSpisShadowedByFakes()`(가짜가 아닌 VersionDraftDeletionSpi·VersionConfirmCheckSpi 빈 정의를 지우는 일반형). 08-02 등 다른 Task 는 06-02 머지 뒤 재사용한다
- **Rationale**: 공통 서비스의 requireSteward 는 package-private 이고 deleteDraft·release·handover 는 역할을 보지 않아 영역 서비스에 가드가 필요하다. VersionSpiRegistry 는 대상 중복이면 기동을 실패시키므로 운영 SPI 를 처음 등록하는 06-02 가 테스트 설정을 대상 이름 없이 일반형으로 고친다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-06-02/design.md §10, docs/mdm/tasks/TSK-01-03/design.md §7

## D-077 (2026-09-24T06:39:20Z)
- **Temp ID**: D-TSK-06-02-3
- **Phase**: build (TSK-06-02)
- **Decision needed**: 수용 기준 5(폐기 뒤 CODE_LIST 에서 숨고 MASTER 판정은 유지)를 보려면 판정 엔진이 04 원장을 읽어야 한다. 운영 `CodeLookup` 빈을 등록하면 decisions.md 의 TSK-04-03 기록대로 도메인 저장 R10 거부·MASTER 판정이 자동으로 켜져 TSK-04-03 동작·테스트가 바뀐다
- **Decision made**: 원장 구현체 `com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup`(04 표 다섯 개를 해석 없이 돌려주고 헤더 status 는 저장값)을 만들되 Spring 빈으로 등록하지 않는다. 시험(`MasterCodeDeprecateEngineSqliteTest`)이 실제 `DefaultCodeResolver` 에 직접 붙여 폐기 전·후를 본다. 운영 등록 여부는 TSK-06-05 이후 판단한다(그때 `@Component` 만 붙인다)
- **Rationale**: spec 수용 기준 5 는 엔진 판정 결과를 요구할 뿐 운영 빈 등록을 요구하지 않는다. 빈 등록의 부작용(도메인 저장 동작 변경)은 이 Task 범위 밖이다
- **Reversible**: yes(`@Component` 한 줄과 TSK-04-03 테스트 기대값 조정)
- **Source**: docs/mdm/tasks/TSK-06-02/design.md D5·§6.6

## D-078 (2026-09-24T06:39:20Z)
- **Temp ID**: D-TSK-06-02-4
- **Phase**: build (TSK-06-02)
- **Decision needed**: 계약 `MasterCodeSegmentService`(12개 메서드)를 06-02(`createBaseCategory`·`fillFrom`)·06-03·06-04 가 나눠 구현하게 돼 있고 06-03 이 동시에 돈다. 06-02 가 구현 클래스를 만들면 add/add 충돌과 미완성 빈이 생긴다
- **Decision made**: 06-02 는 `MasterCodeSegmentService` 구현 클래스를 만들지 않는다. 06-02 몫 두 메서드는 같은 이름·시그니처의 공개 메서드로 `com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSegments`(@Component, 인터페이스 미구현)에 두고, 구현 클래스를 만드는 Task(06-03)가 두 메서드를 여기에 위임한다
- **Rationale**: 형제 Task 범위 경계와 충돌 최소화(팀장 지시). 미승인 선행 산출물(TSK-06-01 계약의 구현 배정)의 메서드 의미를 그대로 지킨다
- **Reversible**: yes(구현 클래스를 만들어 두 메서드를 옮긴다)
- **Source**: docs/mdm/tasks/TSK-06-02/design.md D6·§6.5

## D-079 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-1
- **Phase**: build (TSK-05-03)
- **Decision needed**: 승인 전인 TSK-05-02 의 layoutMng 코드 위에 확장할 것인가, 독립 경로로 만들 것인가
- **Decision made**: 05-02 코드 위에 추가만 한다(서비스 메서드·BPMN 분기·탭·E2E 블록 추가, dmb.layout 재사용). 05-02 에서 바꾼 것은 05-02 가 "05-03 몫"이라 적은 VERSION 단언 3개뿐이다
- **Rationale**: wbs TSK-05-03 tech-spec 이 05-02 와 같은 패키지·BPMN·page.tsx·E2E 파일을 적었다. 별도 화면은 식별자 목록에 없고 메뉴·RBAC 시드를 늘린다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D1

## D-080 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-2
- **Phase**: build (TSK-05-03)
- **Decision needed**: 저장 즉시 스냅샷 버전·버전 이력·같은 스냅샷 버전으로 직렬화·파싱을 어디에 저장하는가
- **Decision made**: 새 테이블 TB_MDM_LAYOUT_VER(V12, LAYOUT_ID·LAYOUT_VERSION PK, TOTAL_LENGTH·SWITCH_MODE·CHANGE_KINDS·CHANGE_SUMMARY·SNAPSHOT_JSON)에 정규화 스냅샷 JSON 을 쌓고 TB_MDM_LAYOUT.VERSION 을 최신 번호로 맞춘다. 상태 칼럼은 두지 않는다
- **Rationale**: 버전 이력과 수용 기준 2 는 옛 버전 스냅샷을 다시 꺼낼 수 있어야 성립한다. 03:72 상태·승인·소유자 없음. ERD(TSK-02-03 소유) 반영은 인계
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D2

## D-081 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-3
- **Phase**: build (TSK-05-03)
- **Decision needed**: 전송 단위 환산·소수점 문자 형식에 필요한 도메인 기준 단위·소수 자리를 스냅샷 계약에 넣을 것인가
- **Decision made**: MdmLayoutItemSnapshot 끝에 unitCode·scale 두 칸을 더하고 스키마·샘플·ContractStubCompileTest 를 함께 고친다
- **Rationale**: 시안 스냅샷 예시가 항목에 unit 을 싣고 파생값이 풀려 들어간다고 적었다. 계약 밖에서 받으면 직렬화기·파서가 스냅샷만으로 동작한다는 보증(I11)이 깨진다. 계약 소비자가 아직 없다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D3

## D-082 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-4
- **Phase**: build (TSK-05-03)
- **Decision needed**: 언제 버전을 만들고 05-02 의 VERSION 0 단언 3개를 어떻게 다루는가
- **Decision made**: 스냅샷(버전 번호 제외)이 바뀔 때만 max(최신 이력, VERSION)+1, 최초 1. 헤더 저장은 그 헤더를 쌓은 전문마다 같은 규칙으로 기록한다. 05-02 테스트 3개는 새 기대값으로 바꾸고 1개는 이름을 바꾼다(개수 유지)
- **Rationale**: spec "저장 즉시 스냅샷 버전 생성". 내용이 같은 저장마다 버전을 만들면 이력이 노이즈가 된다. 05-02 I17 은 스스로 05-03 몫이라 적은 임시 규칙이다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D4

## D-083 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-5
- **Phase**: build (TSK-05-03)
- **Decision needed**: AUTO 채움 — MSG_LENGTH 범위, SEND_TIME 분할, LAYOUT_ID 값
- **Decision made**: MSG_LENGTH 는 어느 헤더에 있든 전문 총 길이, SEND_TIME 은 항목 길이 14·8·6 으로 형식을 가르고 그 밖은 오류, LAYOUT_ID 는 TB_MDM_LAYOUT.LAYOUT_ID 대리키. 수치 AUTO(MSG_LENGTH·SEQ)는 도메인과 무관하게 왼쪽 0
- **Rationale**: 03:37 "AUTO(MSG_LENGTH)가 전문 총 길이를 쓴다", 03:21 AUTO 종류 넷 고정, LAYOUT_ID ← TB_MDM_LAYOUT.layout_id. 시안의 00087 은 스스로 가정·미결이다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D5

## D-084 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-6
- **Phase**: build (TSK-05-03)
- **Decision needed**: CONST 유효 식 검증(#2)의 범위와 판정 불가 처리
- **Decision made**: 도메인 화면 판정기(DomainTestCaseRunner.preview 의 표준식)와 엔진 ValueConverter(타입), 인코딩 바이트 ≤ 항목 길이로 본다. 대상은 본문 CONST 기본값·헤더 CONST 기본값·전문 상수 재정의 값. 비즈니스식은 보지 않는다. 판정 불가(CODE·MASTER)는 경고로 저장을 허용한다
- **Rationale**: 비즈니스식은 레코드 변수가 필요해 CONST 에 적용할 수 없다. 판정 불가를 거부하면 코드 원장이 생길 때까지 CODE 도메인 상수를 저장할 수 없다(도메인 화면도 W02 경고)
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D6

## D-085 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-7
- **Phase**: build (TSK-05-03)
- **Decision needed**: 등록 거부 7종의 코드 체계
- **Decision made**: LayoutIssueCode 에 L12(#2)·L13(#3)·L14(#4)·L15(#7) 만 더하고 #1=L01, #5=L02(FILLER_LENGTH 칸만), #6=L05 를 재사용한다. 표 밖 L 이슈는 otherIssues
- **Rationale**: 팀장 지시 "겹치면 재사용, 새 체계를 만들지 않는다". 공유 enum MdmErrorCode 는 줄 충돌 때문에 쓰지 않는다(05-02 D4)
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D7

## D-086 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-8
- **Phase**: build (TSK-05-03)
- **Decision needed**: 숫자 표현 자리 용량(#4) 공식
- **Decision made**: 필요 자리수 = (p−s) + 전송 단위 증가 자리(⌈log10(기준 계수÷전송 계수)⌉, 1 이하면 0) + s + (소수점 문자면 1) + (부호 자리면 1). 폭 = WIDTH, 형식이 없으면 도메인 길이
- **Rationale**: 시안 거부 예시(표현 자리 2 < 3,1)와 메모(4자리 ≥ 3,1)를 만족하고, mm→μm 처럼 정수 자리가 늘어 송신 때 넘칠 항목을 등록에서 막는다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D8

## D-087 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-9
- **Phase**: build (TSK-05-03)
- **Decision needed**: 단위 경계 변환 식·unit_item 송신 방향·환산 계수 위치
- **Decision made**: value × from.factor ÷ to.factor(MathContext 34, HALF_UP), 수신은 도메인 소수 자리로 HALF_UP. unit_item 송신은 레코드의 단위 값으로 기준 → 그 단위(비면 기준 그대로). 계수는 스냅샷 밖 TB_MDM_UNIT
- **Rationale**: unitMng convertPreview 와 같은 식. 03:46 이 단위 마스터를 별도 배포 대상으로 둔다. 한계: 계수가 바뀌면 옛 스냅샷도 새 계수로 환산된다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D9

## D-088 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-10
- **Phase**: build (TSK-05-03)
- **Decision needed**: 넘침·담지 못하는 문자·빈 값·파싱 결과 범위
- **Decision made**: 넘침과 인코딩이 담지 못하는 문자는 LayoutCodecException(잘라내거나 ? 로 바꾸지 않음, 렌더는 # 로 보이고 항목 오류). 빈 값은 칸 전체 공백·공백은 null. 파싱 결과는 본문 DATA·CONST·AUTO 만 COLUMN_PHYS 키
- **Rationale**: 잘라내기는 데이터를 조용히 바꾸는데 받는 쪽은 값을 다시 검증하지 않는다(03:42). 빈 값을 0 으로 쓰면 0 과 값 없음을 가를 수 없다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D10

## D-089 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-11
- **Phase**: build (TSK-05-03)
- **Decision needed**: html 변경 분류 5행 밖의 변경을 어떻게 분류하는가
- **Decision made**: 상대 파서가 깨지는 변경(형식·삽입·삭제·총 길이·길이·순서·헤더 구성)은 동시, 바이트 모양이 그대로인 변경(여분 쪼개 쓰기·CONST 값·기본 속성)은 순차
- **Rationale**: 03:47 의 기준(총 길이와 기존 오프셋 불변이면 이전 버전 파서가 깨지지 않는다)을 같은 기준으로 넓혔다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D11

## D-090 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-12
- **Phase**: build (TSK-05-03)
- **Decision needed**: 컬럼·도메인 변경 영향 전문 목록을 어디에 보이는가
- **Decision made**: layoutMng search target=IMPACT(버전·영향도 탭)와 같은 조회로 MdmDomainReferenceSpi(LAYOUT_ITEM) 실구현 빈을 더해 domainMng 영향도의 레이아웃 행을 코드 수정 없이 채운다. 키워드는 컬럼 물리명·도메인 표준명·이름을 모두 보고 합친다(Build 이탈 B4)
- **Rationale**: 03:48 영향도 목록에 레이아웃과 상대 시스템이 포함된다. domainMng 에 이미 레이아웃 행이 있다. columnMng 에는 영향도 틀이 없다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D12

## D-091 (2026-09-24T07:32:23Z)
- **Temp ID**: D-TSK-05-03-13
- **Phase**: build (TSK-05-03)
- **Decision needed**: 검증·렌더·내려받기를 서버와 화면 중 어디서 하고 어떤 액션을 쓰는가
- **Decision made**: 서버 액션 validate(EDIT)·execute(EDIT)·export(READ 포함). 엑셀은 export 의 JSON 으로 화면이 shared exportToExcel 로 만든다
- **Rationale**: 브라우저 TextEncoder 는 UTF-8 만 인코딩해 EUC-KR 바이트 렌더를 화면이 할 수 없다. 세 액션은 MdmActions·권한 행에 이미 있어 새 시드가 없다. 백엔드에 POI 가 없다
- **Reversible**: yes
- **Source**: docs/mdm/tasks/TSK-05-03/design.md D13

## D-092 (2026-09-24T05:22:12Z)
- **Temp ID**: D-TSK-08-02-1
- **Phase**: design (TSK-08-02)
- **Decision needed**: TSK-03-04 가 겹침·빈틈·도달 불가 분석을 화면 TS(`m-mdm/src/evalex/rule-analysis.ts`·`value-set.ts`)에만 두어 서버 분석기가 없다. TSK-08-02 수용 기준 "JS 즉시 결과와 서버 저장 검사 결과가 코퍼스 범위에서 같다"를 채우려면 서버 분석기가 필요하고, wbs 상 TSK-08-04 저장 시 검사도 같은 분석을 쓴다. 누가 이식하고 코퍼스를 어디에 두나
- **Decision made**: TSK-08-02 가 TS 분석 알고리즘을 바꾸지 않고 `kr.dongkuk.maru.mdm.engine.rule`(`RuleAnalyzer.analyze(AnalysisRule)`·`AnalysisRule`·`AnalysisVar`·`RuleIssue`·`RuleIssueCode`)로 옮기고, 저장 형태 입력의 분석 코퍼스 한 벌 `src/backend/maru-mdm-engine/src/test/resources/kr/dongkuk/maru/mdm/engine/analysis/analysis-corpus.json` 을 JUnit(운영 `RuleAnalysisInputMapper` 경유)과 Vitest(운영 `ruleDefFromStored` 경유)가 함께 읽는다. TSK-08-03·08-04 는 TSK-08-02 가 dev 에 머지된 뒤 착수하고, 08-04 는 이 공개 API 를 다시 만들지 않고 쓴다(서명 고정, 추가만)
- **Rationale**: 팀장 지시 2026-09-24로 확정(기본안 A). spec 수용 기준이 서버 저장 검사 결과와의 동치를 요구하고, TSK-03-04 D1 의 반려 방향(`engine.rule` 이식 + `R/analysis/analysis-corpus.json`)과 06:458 의 `engine.rule` 배치를 따른다. 같은 기점에서 두 Task 가 따로 이식하는 중복을 막는다
- **Reversible**: yes(분석기·코퍼스를 빼고 수용 기준 해석을 셀 코퍼스 동치로 좁히면 된다 — DDL 영향 없음)
- **Source**: docs/mdm/tasks/TSK-08-02/design.md D2·§6.6.3, docs/mdm/tasks/TSK-03-04/design.md D1

## D-093 (2026-09-24T05:22:12Z)
- **Temp ID**: D-TSK-08-02-2
- **Phase**: design (TSK-08-02)
- **Decision needed**: DRAFT 소유권 action(선점·해제·넘기기)의 이름과, 그 이름을 권한 어휘·시드에 더하는 일을 어느 Task 가 맡나(TSK-01-03 §7 은 "06-02·08-02 중 먼저 오는 것"에 넘겼고 두 Task 가 같은 기점에서 병렬로 돈다)
- **Decision made**: ADR-0003 권장 이름 `lock`·`unlock`·`handover` 를 쓴다. `MdmActions`·`MdmPermissions.EDIT_ACTIONS/CONFIRM_ACTIONS`·mcm `DataInitializer` 의 `allActions`·`PERM_MDM_EDIT`(따라서 `PERM_MDM_CONFIRM`)·기존 DB 보정(`ensurePermActions`)·`src/frontend/e2e/fixtures/mdm-rbac-seed-check.expected.txt` 수정은 TSK-08-02 가 맡는다. TSK-06-02 는 이 파일들을 건드리지 않는다
- **Rationale**: 팀장 지시 2026-09-24로 확정(기본안 A). TSK-01-03 §7 인계와 `MdmActions` javadoc 이 이 이름을 첫 소유권 화면 Task 가 확정해 더하라고 적었다. 한 Task 만 같은 줄을 고쳐 병렬 머지 충돌을 없앤다
- **Reversible**: yes(action 을 빼고 `execute` 한 갈래에 op 파라미터로 가르면 된다 — 시드·어휘 변경만 되돌린다)
- **Source**: docs/mdm/tasks/TSK-08-02/design.md D4, docs/mdm/tasks/TSK-01-03/design.md §7, docs/mdm/adr/0003-module-boundary-screens-roles.md D5

## D-094 (2026-09-24T05:22:12Z)
- **Temp ID**: D-TSK-08-02-3
- **Phase**: design (TSK-08-02)
- **Decision needed**: `MdmStewardDirectory` 기본 구현(`UnresolvedStewardDirectory`)이 늘 false 라 운영에서 DRAFT 넘기기가 MDM005 로 막힌다. 넘기기 대상 담당자 조회 어댑터(mcm 역할 조회)를 이번에 만드나
- **Decision made**: 만들지 않는다. TSK-08-02 는 넘기기 UI·API 를 공통 `DraftOwnershipService.handover` 에 연결하고 대상 검사는 포트에 맡긴다(운영에서는 어댑터가 생길 때까지 MDM005). 담당자 역할 판단 가드(`MdmStewardGuard`)와 테스트 설정의 일반형 `BeanFactoryPostProcessor` 는 TSK-06-02 가 만들고, TSK-08-02 는 연결 지점 한 곳(`RuleStewardCheck`, `VersionScenarioTestConfig`)을 06-02 머지 뒤 바꿔 끼운다
- **Rationale**: 팀장 지시 2026-09-24로 확정. mcm 에 역할 조회 경로를 새로 두는 일은 보안 검토 대상이고(TSK-01-03 D7), spec 수용 기준에 넘기기 성공이 없다. 공용 부품은 한 Task 만 만들어 중복을 막는다
- **Reversible**: yes(mcm client-key 전용 역할 조회 API 와 mdm RestClient 어댑터를 더하면 된다 — 별도 설계·보안 검토 필요)
- **Source**: docs/mdm/tasks/TSK-08-02/design.md D5·§7, docs/mdm/tasks/TSK-01-03/design.md D7

## D-095 (2026-09-24T13:03:33Z)
- **Temp ID**: D-TSK-06-04-1
- **Phase**: design (TSK-06-04)
- **Decision needed**: 카테고리 추가·수정·닫기·TABLE 소속 이동(`addCategory`·`changeCategory`·`closeCategory`·`addCategoryMembers`·`removeCategoryMembers`)을 OASIS BPMN 세부 액션으로 새로 만드나, 아니면 기존 닫힌 액션 집합(`MdmActions` 16종)만 쓰나
- **Decision made**: 세부 액션을 신설하지 않는다. `codeCateEdit.bpmn` 은 `codeItemEdit.bpmn` 과 같은 6액션(search·view·compare·validate·save·restore)만 쓰고, 카테고리 추가/수정/닫기는 `save` 액션의 `categories` 그리드(rowStatus ADDED/CHANGED/DELETED)로, TABLE 소속 이동은 같은 `save` 액션의 `members` 그리드(rowStatus ADDED/DELETED)로 처리한다
- **Rationale**: `MdmActions` 는 여러 mdm 화면이 공유하는 닫힌 상수 집합이고 `DmcBpmnActionTest` 류가 BPMN 분기 이름이 그 상수 밖이면 실패하게 고정해 뒀다. 세부 액션을 추가하려면 이 공유 파일에 상수를 더해야 하는데, 같은 카테고리 계약(`CategoryDefinition`·`CategoryOwner`)을 쓸 예정인 형제 화면(dmd/dataCateEdit, TSK-07-02)과 병렬 머지 충돌 위험이 있다. `codeItemEdit.bpmn` 이 이미 코드 행 추가·수정·삭제를 `save` 하나로 처리하는 선례와도 일관된다
- **Reversible**: yes(세부 액션을 나중에 추가해도 `save` 그리드 처리 로직을 액션별로 쪼개기만 하면 된다 — DB·계약 영향 없음)
- **Source**: docs/mdm/tasks/TSK-06-04/design.md D2

## D-096 (2026-09-24T13:03:33Z)
- **Temp ID**: D-TSK-06-04-2
- **Phase**: design (TSK-06-04)
- **Decision needed**: 카테고리 저장 검사 거부(정규식 문법 오류·허용 안 된 def_target·없는 소속 코드 등)를 위해 `MdmErrorCode` 에 새 값(예 MDM024)을 추가하나
- **Decision made**: 추가하지 않는다. 기존 `MdmErrorCode.CODE_SAVE_REJECTED`(MDM022)를 우산으로 재사용하고, 세부는 새 이슈 코드 enum `MasterCodeCateIssueCode`(`common/mastercode/`)에만 담아 `MasterCodeRejections.saveRejected(List<MdmCheckIssue>)`(수정 없이) 로 싣는다. 예약 카테고리 BASE 위반은 계속 `RESERVED_CATEGORY`(MDM012)를 쓴다
- **Rationale**: `MdmErrorCode` 는 여러 Task 가 동시에 "다음 번호"를 채번하는 공유 파일이라 병렬 머지 충돌 위험이 크다(D-093 의 "한 Task 만 같은 줄을 고쳐 병렬 머지 충돌을 없앤다" 원칙과 동일 이유). `CODE_SAVE_REJECTED` 는 이미 "세부는 이슈 코드로 싣는다"는 계약으로 설계돼 있어 카테고리 이슈에도 그대로 맞는다
- **Reversible**: yes(전용 MdmErrorCode 를 나중에 추가하고 이슈 코드를 그쪽으로 옮기면 된다 — 응답 바디의 `meta.code` 값만 바뀐다)
- **Source**: docs/mdm/tasks/TSK-06-04/design.md D6

## D-097 (2026-09-25T14:36:00Z)
- **Temp ID**: D-TSK-07-04-1
- **Phase**: design (TSK-07-04)
- **Decision needed**: `dataCsvUploadPop` 을 독립 화면(page.tsx + 메뉴 leaf + 포털 진입)으로 만드나, 팝업(page.tsx·메뉴
  leaf 없이 `dataItemMng` 화면 안에서 여는 모달)으로 만드나. `docs/mdm/screens/README.md` §4 가 이 판단을 TSK-07-04 에
  인계해 뒀다(screenId 의 `Pop` 접미와 팝업 금지 규칙이 충돌하는데도 wbs 는 page.tsx·메뉴 leaf·독립 e2e 를 요구)
- **Decision made**: 팝업으로 확정한다. `dataItemMng` 화면의 "CSV 업로드" 버튼으로 열고, `page.tsx`·메뉴 leaf 를 두지
  않는다. 화면 폴더는 `{screenId}.tsx` + `index.ts` 배럴만 둔다(`termRegPop` 과 같은 모양). e2e 파일명(`mdm-dataCsvUploadPop.spec.ts`)
  은 spec.md 문구를 그대로 두되, 시나리오를 "`dataItemMng` 화면의 CSV 업로드 버튼으로 연다"로 바꾼다
- **Rationale**: `docs/mdm/screens/README.md` §4 가 이미 팝업을 권장안으로 명시했고, 근거로 든 mcm
  `masterRuleDataUploadFilePopup`(modal popup, 부모 `masterRuleData` 의 자식, `docs/mcm/design/masterRuleDataUploadFilePopup/`)
  이 실제로 이 저장소 As-Is 분석에 있다. 더 결정적으로, 같은 저장소 안에 이미 병합된 **같은 모양의 선례**
  `dma/termRegPop`(TSK-04-04) — `page.tsx`·메뉴 leaf 없이 `{screenId}.tsx` + `index.ts`, 부모(`columnMng`)가 props 로
  여는 모달, 자기 OBJECT_ID 로 RBAC 판정 — 가 있어 독립 결정이 아니라 기존 관례를 그대로 따른 것이다. CSV 업로드는
  스펙상으로도 "선택된 마루 데이터(항목 관리 화면 맥락)의 실데이터 일괄 등록"이라 부모 없이 단독 진입할 의미가 없다
- **Reversible**: yes(page.tsx + 메뉴 leaf 로 승격하고 screenId 에서 `Pop` 을 떼면 된다 — DB 영향은 OBJECT_ID·RBAC 행
  재시드뿐, DDL 없음)
- **Source**: docs/mdm/tasks/TSK-07-04/design.md D2, docs/mdm/screens/README.md §4

## D-098 (2026-09-28T07:20:00Z)
- **Phase**: feat(ruleEdit 열 설정)
- **Decision needed**: 열 설정에서 식을 적는 칸이 두 곳(조건 열 변수 칸의 "식 변수"·결과 그룹의 열 조건)이라 어느 칸에 식을
  적어야 하는지 모호하다. 또 06 명세(식 변수 = Equal·1·2 열)와 열 저장 서비스·화면(식 변수 = Expression 조건 열)이 서로 달랐다
- **Decision made**: 변수 칸에는 이름만 적는다(영문자로 시작하는 영문·숫자·`_`). 열 설정에서 식을 적는 칸은 열 조건 하나다.
  Expression 조건 열은 "행 칸마다 식을 적는 열"이라 변수 칸을 비우고(VAR_NAME NULL, 06:1011) 표시명만 필수로 둔다.
  식 변수(VAR_AST)는 새로 저장하지 않는다 — 계산한 값으로 행을 나누려면 룰 세트 앞 산출 룰이 그 값을 결과 변수로 내고, 판정 룰은
  그 이름을 보통 조건 열처럼 쓴다(데모: 룰 세트 `PACK_TYPE_SET` = `UNIT_WID_WGT_CALC` → `PACK_TYPE_LKP`)
- **Rationale**: 사용자 결정(2026-09-28, "식을 2군데 쓰는게 애매모호해서 수정하려는거야", "Expression은 각 row의 컬럼이
  Expression인 것을 의미하는거야"). 산출 룰 + 룰 세트로 같은 계산을 표현할 수 있고, 계산 값에 이름이 붙어 다른 룰도 읽을 수 있다
- **Reversible**: yes(RuleColumnsService 의 변수 칸 이름 검사와 VAR_AST 저장을 되돌리면 된다. DDL 변경 없음. 엔진의 식 변수
  평가 `RuleEvaluator.expressionVariables` 는 이미 저장된 정의를 위해 그대로 둔다)
- **Source**: RuleColumnsService, column-draft.ts, mdm-local-sample.sql 끝 블록. 06-business-rule.md 「식 변수」 절은 다른
  저장소(/Users/jji/project/mdm)라 아직 고치지 않았다 — 반영 필요

## D-099 (2026-09-28T07:40:00Z)
- **Phase**: feat(ruleEdit 의사결정표)
- **Decision needed**: D-098 로 Expression 조건 열이 "행 칸마다 식을 적는 열"로 정해졌는데, 의사결정표의 식 칸은 읽기 전용이라(TSK-08-02
  D7·I20) 화면에서 이 열을 채울 방법이 없다
- **Decision made**: TSK-08-02 D7 을 뒤집어 의사결정표의 식 칸(조건 식·결과 식)을 편집할 수 있게 한다. 화면은 `{expr}` 만 보내고(편집한
  칸의 ast 는 지운다), 서버 표 저장이 식을 파싱해 서버 AST 로 ast 를 채운다. 파싱 오류·허용되지 않는 함수는 저장 시 검사가 행·열 위치와
  함께 거부한다
- **Rationale**: 사용자 지시(2026-09-28 "구현해"). D7 이 읽기 전용으로 둔 이유("TABLE 저장이 셀 식의 AST 를 만들지 않는다")는
  TSK-08-04 저장 시 검사(`RuleSaveValidator` → `RuleExpressionChecks`, 서버 AST 로 덮어씀)로 이미 해소됐다
- **Reversible**: yes(`cellEditable`·`applyCellEdit` 의 Expression 잠금을 되살리면 된다. 서버·DDL 변경 없음)
- **Source**: decision-table/columns.ts, decision-table/grid-model.ts, RuleTableServiceTest

## D-100 (2026-09-28T08:30:00Z)
- **Phase**: feat(ruleEdit 의사결정표)
- **Decision needed**: Expression 조건 열을 새로 더하면 기존 행에 칸이 없어 표 저장이 INCOMPLETE_COND 로 막힌다. 또 Expression 결과 열에
  값 칸(`{"val":"1.00"}`)이 섞여도 저장되는데, 표는 그 열에 식 칸만 그려 보이지 않는 값이 된다
- **Decision made**: (1) Expression 조건 열이 새로 생기거나 표시 타입 변경으로 셀을 비울 때 열 설정 적용이 NORMAL 행을 무관(`{"op":"NA"}`)으로
  채운다. 식을 넣으면 무관이 꺼지고, 지우면 무관이 켜지며, 무관을 켜면 식이 지워진다. (2) Expression 결과 열의 값 칸은 저장 시 검사가
  OP_NOT_ALLOWED 로 거부한다 — 상수도 식이다(`1.0`). Value 열의 식 칸 거부(기존)와 대칭이다
- **Rationale**: 사용자 결정(2026-09-28 "기본 무관으로 하고 값을 넣으면 무관이 꺼지고 값을 지우면 무관이 켜지게", "1.0 도 expr 이잖아")
- **Reversible**: yes(RuleColumnsService.updateCells 의 무관 채움, RuleCellRules.result 의 Expression 값 칸 거부를 지우면 된다. DDL 없음)
- **Source**: RuleColumnsService, RuleCellRules, column-draft.ts(알림 naFill), RuleColumnsServiceTest·RuleTableServiceTest

## D-101 (2026-09-28T10:30:00Z)
- **Phase**: refactor(dmc 마루 코드 화면)
- **Decision needed**: 마루 코드 한 건을 다루는 데 화면이 4개(codeMng 조회·등록, codeEdit 수정, codeItemEdit 코드 편집,
  codeCateEdit 카테고리 편집)로 나뉘어 탭을 오가야 한다
- **Decision made**: 화면을 2개로 합친다. (1) codeMng = 목록 + 상세(헤더·추가 컬럼 라벨·버전 목록) + [신규] 등록 폼. 마루 코드
  삭제 버튼은 두지 않는다(D-102 예외). 버전 버튼의 [코드 편집]·[카테고리 편집]은 [코드 편집] 하나로 줄이고, 버전을 고르면 늘 켠다
  (편집 가능 여부는 코드 편집 화면이 판단해 읽기 전용으로 연다). (2) codeItemEdit = [코드]·[트리]·[카테고리] 탭. [저장] 하나가
  코드 행·카테고리·소속 변경을 codeItemEdit `save` 한 번(한 트랜잭션, rowVersion 1 증가)으로 보낸다. 카테고리 판정은 코드 행 변경을
  먼저 적용한 V 모습 위에서 한다. 서버 서비스·BPMN 4개는 그대로 두고, codeEdit·codeCateEdit 는 메뉴 leaf 만 없앤다(OBJECT·역할
  매핑 유지 — 합친 화면이 두 서비스를 계속 부르고, 권한 키는 메뉴를 보지 않는다)
- **Rationale**: 사용자 지시(2026-09-28 "마루 코드 / 마루 코드 수정 하나의 화면으로", "코드 편집 / 카테고리 편집은 하나의 화면으로",
  "4개의 화면을 2개의 화면으로 줄이는 작업", HTML 시안 확인 뒤 "진행해")
- **Reversible**: yes(메뉴 leaf 를 다시 시드하고 화면 폴더를 되살리면 된다. DDL 없음)
- **Source**: DataInitializer(removeMergedMdmCodeMenus), pages/dmc/codeMng·codeItemEdit, CodeItemEditService.save·validate,
  screens/codeMng·codeItemEdit 기능설계서

## D-102 (2026-09-28T10:30:00Z)
- **Phase**: feat(dmc 마루 코드)
- **Decision needed**: 원천 04 「코드 삭제와 마루 코드 폐기」는 마루 코드를 행을 지우지 않는 폐기(DEPRECATED)로만 정리하고 물리 삭제
  규정이 없다. 잘못 등록해 한 번도 쓰인 적 없는 마루 코드도 폐기로만 남는다
- **Decision made**: 한 번도 RELEASED 된 적 없는 마루 코드(TB_MDM_CODE_VER 에 RELEASED·CANCELLED 행이 없음, 버전 0개 포함)는
  [폐기] 자리에 [삭제] 를 보이고 코드를 통째로 지운다(CATE_ITEM·CATE·ITEM·VER·SYSTEM·CODE). 서버 flags `neverReleased`·
  `canDeleteCode`, 실행은 codeEdit `delete` 에 `target: "CODE"`(새 action 이름 없음). 원천 EXTERNAL·담당자 아님·다른 사용자 소유
  DRAFT·도메인 참조·수신 이력(RECV)·`MASTER('<id>'` 텍스트 참조가 있으면 거부한다. 한 번이라도 RELEASED 됐으면 지금처럼 폐기만 된다
- **Rationale**: 사용자 결정(2026-09-28 "폐기도 있어야 한다. 다만 릴리즈 된적이 없다면 폐기버튼이 삭제가 되도록 해줘"). 확정된 적 없는
  코드는 과거 기준일 판정·배포 사본에 흔적이 없어 행을 남길 이유가 없다
- **Reversible**: yes(flags·delete 분기를 지우면 된다. DDL 없음). 지운 코드는 되살릴 수 없다
- **Source**: CodeEditService(delete 분기), CodeEditFlags, codeMng 화면 헤더 버튼. 원천 04-master-code-deploy-full.md 「코드 삭제와
  마루 코드 폐기」 절은 다른 저장소(/Users/jji/project/mdm)라 아직 고치지 않았다 — 반영 필요

## D-103 (2026-09-28T19:50:00Z)
- **Phase**: feat(dme 룰 화면 — 피벗 보기·축 제거)
- **Decision needed**: 룰 화면 열 설정에 `축(axis)` 칸(ROW·COL·NONE)이 있고, 이 값이 있으면 표 카드의 "피벗 보기" 섹션이
  2차원 표(행 축 × 열 축 × 결과)로 그려진다. `BASE_SPD_LKP` 처럼 **결과 열 그룹(`res_grp`/`grp_cond`)이 이미 있는 룰에도**
  이 두 표현이 함께 들어갔다. 같은 정보를 두 벌로 유지한 것이 맞는지, 피벗과 축을 없애는 것이 맞는지
- **Decision made**: **피벗 보기 섹션과 조건 열 `axis` 를 모두 제거한다.** 결과 열 그룹(`res_grp`/`grp_cond`) 표현만 남긴다.
  제거 범위: 프론트 `sections/pivot/` 전체(PivotSection·pivot-model)와 열 설정의 축 칸, 백엔드 `AxisCoverage`·`AxisCoverageCheck`
  (축 조합 완전성 경고)와 축 검사 2종(`AXIS_COND_ONLY`·`AXIS_VALUE`), `MdmRuleVar.axis`·`RuleColumnsSaveRequest.axis`·
  `RuleEditViewResult.VarMeta.axis`, 샘플의 피벗 데모 룰 `PVT_SPD_LKP`. DB 는 Flyway `V13__drop_rule_var_axis` 로
  `TB_MDM_RULE_VAR` 를 재생성해 AXIS 컬럼과 `CK_TB_MDM_RULE_VAR_AXIS` 제약을 지운다
- **Rationale**: 피벗은 그룹이 조건식 안에서 하던 일을 표로 펼쳐 보여주는 것에 지나지 않았다(그룹의 `grpCond` 가 행 축 값이 되고
  그룹의 물리명이 결과 축이 된다). 그런데 (1) **엔진은 축을 읽지 않았다** — 06 문서의 "엔진은 축을 읽지 않는다" 가 코드에서도 그대로
  였고, `maru-mdm-engine` 에 `getAxis`/`setAxis` 호출이 한 건도 없었다. 저장된 값은 항상 평탄화 행(`TB_MDM_RULE_ROW`)이었다.
  (2) 두 표현이 어긋나면 어느 쪽이 진짜인지 알 수 없다 — 실제로 `BASE_SPD_LKP` 의 `COIL_THK` 에는 결과 열 8개라 피벗 게이트를
  못 통과하면서 `axis='ROW'` 값이 방치돼 있었다(누군가 한때 피벗으로 보려다 그만 둔 흔적).
  (3) 그룹이 있는 룰은 도메인 컬럼 매핑(`TB_MDM_COLUMN` 의 `phys_name`)을 지켜야 하므로, 피벗으로 값만 채우면 그 매핑이
  깨진다. 8개 결과 열이 `BASE_SPD` 한 물리명으로 묶인 것이 바로 그 설계다. 그룹 표현만 남기면 "어느 열이 이 물리명에 대응하는가"가
  `grp_cond` 로 유일하게 정해진다. 사용자 결정(2026-09-28 "피벗 기능을 제거하자. 그리고 축 컬럼도 삭제하자")
- **Reversible**: partly. UI·검사·모델은 되돌릴 수 있다(피벗은 저장 표현이 아니라 화면 표현이므로 데이터 변환 불필요). DB 는
  **되돌릴 수 있다** — 새 마이그레이션에서 AXIS 컬럼과 CHECK 제약을 되살리면 된다(값은 소실됐지만 축은 화면 전용이라
  재설정 대상이다). 데모 룰 `PVT_SPD_LKP` 은 샘플 시드에서 제거했으나 운영 DB 행은 이미 지웠다 — 이건 되돌릴 수 없다
- **Source**: `docs/mdm/design/basic/06-business-rule.md`(axis 컬럼 정의·축 조합 완전성 절 삭제), 06-business-rule sqlite
  스키마·컬럼표, `src/frontend/m-mdm/pages/dme/ruleEdit/sections/index.ts`·`column-draft.ts`·`column-grid.tsx`,
  `RuleColumnsService`·`MdmRuleVar`·`RuleEditViewResult`, Flyway `V13__drop_rule_var_axis.sql`.
  `docs/mdm/tasks/TSK-08-03/design.md` 와 `wbs.md` 는 그 Task 당시의 기록으로 **고치지 않았다**(역사 문서)

## D-104 (2026-09-29T00:00:00Z)
- **Phase**: refactor(dmd 마스터데이터 화면)
- **Decision needed**: 마스터데이터 한 건을 다루는 데 화면이 6개(dataMng 조회·등록, dataEdit 수정, dataCateEdit 카테고리 편집,
  dataItemMng 항목 관리, dataHistory 항목 이력, dataCsvUploadPop CSV 업로드 팝업)로 나뉘어 화면을 오가야 한다. D-101 이 마루 코드에
  적용한 통합 기준을 마스터데이터에도 적용할지, 그 저장 방식(상단 [저장] 하나)까지 옮길지 정해야 한다
- **Decision made**: 화면을 2개 + 팝업 1개로 줄인다. (1) dataMng(메뉴 이름 "마루 데이터") = 목록(왼쪽 약 42%) + 상세 + [신규] 등록
  폼. dataEdit 를 흡수한다. 상세는 위쪽 ① 헤더 | ② 추가 컬럼 라벨, 아래쪽 ③ 카테고리 요약과 항목 수(마루 코드에서 버전 목록이 있던
  자리)이다. 버튼은 [헤더 저장]·[폐기]·[항목 편집 →]이고, [항목 편집]은 `openMdmPage("dmd/dataItemMng", { maruDataId })` 로 연다.
  (2) dataItemMng(메뉴 이름 "항목 편집") = [항목]·[트리]·[카테고리] 탭. dataCateEdit 를 카테고리 탭으로, dataHistory 를 오른쪽
  열로 흡수한다. 오른쪽 열(약 34%)은 탭에 따라 바뀐다. 항목·트리 탭은 항목 추가 폼 + 선택 행 이력, 카테고리 탭은 미리보기 +
  카테고리·소속 이력이다. handoff `{ maruDataId }` 수신을 새로 넣는다. (3) dataCsvUploadPop 은 팝업 그대로 두고 항목 탭의
  [CSV 업로드]로 연다. (4) codeConfirm 에 대응하는 화면은 없다. 마스터데이터는 버전·승인이 없고 저장 즉시 반영이기 때문이다(FR-D,
  원천 05 "버전이 없다. 승인이 없다"). (5) **저장 방식은 즉시 반영을 유지한다.** D-101 의 "상단 [저장] 하나가 모든 탭 변경을 한
  트랜잭션으로" 는 옮기지 않는다. 그래서 상단 [저장] 은 없고 항목은 행마다, 카테고리는 카테고리마다 반영한다. (6) screenId 는
  dataMng·dataItemMng 를 그대로 쓴다. (7) dataEdit·dataCateEdit·dataHistory 는 메뉴 leaf 만 없애고 서버 서비스·BPMN·OBJECT·역할
  매핑은 남긴다(합친 화면이 옛 서비스를 계속 부르고 권한 키는 메뉴를 보지 않는다). 화면 폴더(page.tsx)는 없앤다
- **Rationale**: 사용자 승인(2026-09-29, HTML 시안 확인). D-101 과 같은 기준으로 화면을 줄인다. dataHistory 를 합친 것은 D-101
  범위를 넘는 추가 결정이다(사용자 선택 "항목 편집에 합치기"). 항목 이력은 이미 인라인 패널이 있었고, 카테고리·소속 이력은
  카테고리 탭 오른쪽 아래로 옮긴다. 즉시 반영을 유지한 근거는 세 가지다. (a) DRAFT·버전이 없어 모아 둘 대상이 없다. (b) 항목은
  서버 페이징 50건이고 조회하면 draft 를 비운다. (c) 잠금이 헤더 `auditVer`·항목 행 `rowVersion` CAS·카테고리 잠금 없음으로 서로
  달라서, 한 번에 저장하려면 새 저장 단위와 통합 잠금이 필요하다. screenId 를 바꾸지 않은 것은 이름을 바꾸면 BPMN·OBJECT·RBAC·e2e
  가 모두 바뀌기 때문이다
- **Reversible**: yes(메뉴 leaf 를 다시 시드하고 화면 폴더를 되살리면 된다. DDL 없음)
- **Source**: 시안 https://claude.ai/artifact/6dpdpynmCVtRTQPsbWSXir, DataInitializer(합친 화면 메뉴 leaf 제거), pages/dmd/dataMng·
  dataItemMng, screens/README.md §3. 원천 05 문서(`docs/mdm/design/basic/05-*`)의 화면 구성 절은 외부 저장소 심볼릭 링크라 아직
  고치지 않았다 — 반영 필요

## D-105 (2026-09-30T00:00:00Z)
- **Phase**: refactor(dme 룰 화면)
- **Decision needed**: D-101·D-104 로 마루 코드·마스터데이터는 "헤더·버전은 별도 화면, 내용은 또 다른 화면" 으로 정리했다. 그러나
  룰은 예외였다. `ruleEdit` 카드 ① 헤더·② 버전이 **내용 편집 화면 안**에 묶여 있었고(`cards.ts` 의
  `RULE_EDIT_GROUPS.headerVersions = "① 헤더 · ② 버전"`), 그 화면이 FE 51파일·11액션·BE 8서비스로 모듈 최대가 되어 "무엇을 하는
  화면"인지 읽히지 않았다. 마루 코드처럼 헤더·버전을 별도 화면으로 뺄지 정해야 한다
- **Decision made**: 헤더·버전을 `ruleMng` 으로 옮겨 D-101 결과를 따른다. (1) `ruleMng` = 목록 + 상세(① 헤더·② 버전). 헤더
  수정·폐기·새 버전·DRAFT 삭제·선점·해제·넘기기·확정 취소와 **HIT_POLICY 편집**을 전담한다. (2) `ruleEdit` = 내용 편집만
  (③ 의사결정표·열 설정, ④⑤⑥ 값 테스트·결과·케이스, ⑧ 활용처). 액션이 11개에서 5개(`search`·`view`·`save`·`validate`·
  `execute`)로 줄고 `save` 의 `part` 도 HEADER 가 빠진다. (3) **버전 선택(읽기 전용)은 남긴다** — 내용을 고르려면 어느
  DRAFT 를 고르는지 알아야 하므로 `ruleEdit` 은 버전 목록을 읽기만 하고 관리 버튼은 없다. (4) **HIT_POLICY(TB_MDM_RULE_VER
  속성)는 버전 쪽으로 옮긴다.** 지금은 575줄 `RuleColumnsService`(part=COLUMNS)가 네이티브 UPDATE 로 쓴다 — 버전마다
  복제되는 속성인데 내용 화면에서만 고칠 수 있는 비대칭이 생기기 때문이다. `RuleColumnsService` 의 그 쓰기를 빼고 버전 저장으로
  옮긴다. (5) **룰 헤더 동시성은 `auditVer` 낙관적 잠금으로 바꾼다.** `TB_MDM_RULE` 에 `ROW_VERSION` 이 없어 지금은
  "마지막 저장이 이긴다"(06:913)다. `MdmRule` 이 `CactusAuditEntity` 를 상속하므로 감사 카운터 `VER` 가 이미 있고, D-104 가
  dataMng 헤더에 적용한 바로 그 방식(`CodeEditService.requireAuditVer` I19)을 써서 **DDL 없이** MDM001 충돌 감지로 바꾼다.
  (6) 화면 수는 5개 그대로다. `ruleConfirm`·`ruleSetMng`·`ruleSetEdit` 는 손대지 않는다(룰 세트는 별개 문제로 남긴다 —
  사용자 선택). (7) **액션 이름은 늘리지 않는다.** 권한 어휘 16종(`MdmActions`) 밖의 이름은 RBAC 시드까지 바뀌므로, 헤더
  저장과 HIT_POLICY 저장은 `ruleMng` 의 `save` 한 개가 `target`(HEADER·VERSION)으로 가른다 — dme 가 이미 `search`
  (target=RULE·DOMAIN)·`delete`(target=VERSION·RULE·CONFIRM)로 쓰던 관용구다
- **Rationale**: 사용자 판단(2026-09-30 "룰 화면에서 헤더, 버전은 마스터코드에서 처럼 '마루 코드' 화면에 있어야 맞은것 같아.
  룰 화면은 지금 너무 복잡해서 헤더, 버전은 그쪽으로 빼는게 좋겠어"). 마루 코드가 이미 정한 분할을 룰에 적용하면 세 화면이 같은
  모양이 된다 — 헤더·버전, 내용, 확정. 버전 상태 기계는 `common/version/DefaultVersionStateService` 로 이미 공유 중이라
  백엔드 로직 재작업이 없다. 이 화면을 정리하지 않으면 모듈에서 가장 자주 쓰는 기능(의사결정표 편집)이 가장 복잡한 화면에
  갇혀 있다. auditVer 를 택한 것은 D-104 가 같은 문제(dataMng 헤더)를 이미 그렇게 풀었고, 컬럼을 새로 넣을 이유가 없다는
  것이다. **복잡도 감소가 부분적임은 미리 인정한다** — ①② 를 빼도 ③·④⑤⑥ 과 `RuleColumnsService`(575줄)·
  `RuleValueTestService`(315줄)·`RuleEditViewResult`(324줄, 18필드)는 남으므로 `ruleEdit` 은 여전히 큰 화면이다. 얻는 것은
  크기가 아니라 "무엇을 하는 화면"인지의 명확함이다
- **구현 메모(2026-09-30)**:
  - 백엔드 — `RuleHeaderService`·`RuleVersionService` 을 `dme.ruleMng.service` 로 옮기고 `RuleEditSupport` 은 공용
    `common/rule/RuleScreenSupport` 로 올렸다(두 화면이 같이 쓴다). `ruleMng` 액션은 2개에서 9개
    (search·reg·view·save·copy·delete·lock·unlock·handover), `ruleEdit` 는 11개에서 5개로 줄었다.
    적중 정책 정규화는 `common/rule/RuleHitPolicies` 로 뽑아 셋(버전 저장·표 저장·값 테스트)이 한 곳을 본다.
  - `TB_MDM_RULE_VER.HIT_POLICY` 는 저장 전에 저장된 정의를 새 정책으로 다시 검사한다(`RuleSaveTarget.STORED`) —
    표 저장과 한 트랜잭션이던 것을 둘로 갈라면서 "정책은 바뀌었는데 내용이 안 맞는데 저장돼 버리는" 틈을 막는다.
    확정 시점에도 같은 검사가 다시 돈다(`RuleConfirmChecks`).
  - 헤더 낙관적 잠금에서 **카운터가 값이 바뀔 때만 오른다**(Hibernate dirty checking). 같으면 UPDATE 가 없다.
    또 `TB_MDM_RULE.VER` 가 NULL 인 행은 첫 변경이 0 으로 머문다 — 그래서 `requireAuditVer` 는 null 을 0 으로 보고,
    테스트 픽스처도 `register` 경로(→ `@PrePersist` = 0)와 같은 모양으로 넣는다.
  - 프런트 — `ruleMng` = 목록 + 상세(`RuleDetailPanel`), `ruleEdit` = 내용 편집만. 버전 고르기는 `ruleEdit` 상단
    Select 에 남긴다(내용을 고르려면 어느 DRAFT 인지 알아야 한다). `dt-hit-policy` 는 읽기 전용 표시가 됐다.
  - 검증 — 백엔드 `:api:test` 1174건 전부 통과(이 작업 전 V13 마이그레이션 기인 실패 2건도 함께 고쳤다).
    프런트 `m-mdm` 1206건 통과(일반+성능), `tsc --noEmit` 0, ag-grid/Mantine audit 98파일 0건.
  - 남긴 것 — e2e 는 서버를 띄워야 돌 수 있어 이번엔 실행하지 않았다. `mdm-ruleMng.spec.ts` 에 옮긴 H1~H8 과
    `mdm-ruleEdit.spec.ts` 를 손댔으니 **다음에 e2e 를 한 번 돌려 확인**하는 것이 남은 일이다.
- **Reversible**: partially(헤더·버전 카드와 `ruleEdit` 액션 5개는 되살리면 된다. `TB_MDM_RULE` 헤더 잠금만 06:913 의
  "마지막 저장 승" 으로 되돌리는 것은 별도 결정이 필요하고 DDL 은 없다)
- **Source**: pages/dme/ruleEdit/cards.ts·RuleHeaderCard·RuleVersionCard, RuleHeaderService(38-40행), RuleVersionService,
  RuleColumnsService(146행), dmc/codeEdit/service/CodeEditService(requireAuditVer 621행)·CodeHeaderSaveRequest,
  dmd D-104 의 헤더 `auditVer`, screens/dme/ruleMng·ruleEdit 기능설계서, MdmActions(16종)

## D-106 (2026-09-30T00:00:00Z)
- **Phase**: design(룰 세트 흐름도 1단계)
- **Decision needed**: 분기형 룰 세트 흐름을 OASIS BPMN 으로 실행할지, 룰 엔진이 실행하고 OASIS 는 엔진을 부를지(스펙 A7)
- **Decision made**: 룰 엔진(`maru-mdm-engine`)이 흐름을 실행하고, OASIS 업무 서비스는 `mdm/lib` 의 `RuleSetRunner`
  (`@Service("ruleSetRunner")`, BPMN 용 `execute(RuleSetRunRequest)`)를 serviceTask 하나로 부른다. 운영 정의 조회기
  `StoredDefinitionLookup` 은 스프링 빈이 아니고 `RuleSetRunner` 가 호출마다 만든다. 1단계는 테스트 자원 BPMN 으로
  OASIS 경로만 검증하고 운영 action(`simulate`)은 2단계에 더한다. 상세는 mdm ADR-0005
- **Rationale**: 룰 세트는 저장 즉시 반영되는 데이터이고, IF 조건은 룰 식과 같은 EvalEx 문법·NULL 규칙이어야 하며,
  노드 단위 결과 보기·디버깅은 OASIS 에 없다(사용자 확인). 엔진은 EvalEx 만 의존하는 독립 jar 로 남는다(TRD:134).
  정의 조회 빈 0개 가드(`MdmBusinessRuleMigrationTest`)는 배포 보류 장치라 유지한다
- **Reversible**: no(엔진 계약·흐름 저장 형식·실행기 입구가 이 결정 위에 선다. 바꾸려면 새 ADR)
- **Source**: `docs/mdm/adr/0005-rule-set-runs-in-engine.md`, `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §2·§6

## D-107 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 1단계 구현 계획)
- **Decision needed**: 승인된 스펙과 저장소의 기존 규칙(계약 형태 테스트·스키마 대조·기존 검사 명명·정의 조회 빈 가드)이
  어긋나는 12곳을 어떻게 맞출지
- **Decision made**: 아래처럼 계획에서 스펙과 다르게 정한다(계획 `docs/superpowers/plans/2026-09-30-rule-set-flow-phase1.md`
  「편차 기록」이 정본)

  | # | 스펙 | 구현 |
  |---|---|---|
  | D1 | `RuleSetDefinition` 기존 3인자 생성자를 한 줄 흐름으로 위임 | 4인자 생성자 하나, 호출처를 모두 `flow=null` 로 고침(`ContractTypeShapeTest` 가 위임 생성자 금지) |
  | D2 | 선 필드 `"else": true`, 노드 필드 `"type"` | 선 `"otherwise": true`, 노드 `"kind"`(Java 예약어·record 컴포넌트·스키마 속성 이름 대조. 저장된 흐름이 없어 이관 없음) |
  | D3 | `SET_DUP_RESULT` 오류 | 같은 경로 중복 대입은 기존대로 경고, 병렬 형제가 같은 이름을 쓰면 오류(`PAR_SIBLING`) |
  | D4 | 코드 이름 `SET_*` 하나 | 세트 저장 검사는 접두어 없는 이름(`ORDER`·`IF_SIBLING`…), 룰 확정 검사는 `SET_` 접두어. `CYCLE` 유지 |
  | D5 | 오류 코드 목록 | `FLOW_INVALID`(단계 `SET_CHECK`) 추가 — 저장된 흐름·저장 전 흐름의 구조 오류 |
  | D6 | `RuleSetResult` 에 `path` 만 | `path` 와 `warnings` — `BRANCH_COND_NULL` 을 실을 자리 |
  | D7 | `RunTrace.error: EngineError` | `RunTrace.violations: Violation[] \| null`(스키마 전용 래퍼라 Java 타입 없음) |
  | D8 | 검사 결과에 위치 없음 | `RuleSetCheck` 에 `nodeId`·`edgeId`(같은 룰이 여러 갈래에 있을 수 있음) |
  | D9 | `FLOW_COND` 가 불린 아닌 식도 잡음 | 정적 검사는 파싱 실패·정의 안 된 변수만. 불린 아님은 실행 때 `BRANCH_EVAL_ERROR`(정적 타입 추론 없음) |
  | D10 | 입출력 표·의존 룰을 흐름 기준으로 | 흐름을 펼친 룰 목록으로 계산(1단계 화면은 분기 세트를 읽기 전용으로만 보임) |
  | D11 | OASIS serviceTask 로 부름 | `RuleSetRunner.execute(DTO)` 추가, 1단계는 테스트 자원 BPMN 으로 검증, 운영 BPMN 추가 없음 |
  | D12 | (기존 동작) 목록에 같은 룰 ID 가 두 번 있으면 존재 검사를 나올 때마다 보고 | 존재·상태 검사는 룰 ID 마다 한 번만 보고(같은 룰을 여러 IF 갈래에 둘 수 있어 중복 보고가 소음. 기존 코퍼스 18건에 중복 ID 사례 없음) |
- **Rationale**: 스펙 의도(흐름 실행·검사·기록)는 그대로 두고, 이미 영구 테스트로 굳은 저장소 규칙을 깨지 않는 쪽을
  골랐다. D3 은 오류로 올리면 지금 저장된 한 줄 세트가 다음 저장에서 거부되기 때문이다. D8 은 2단계 캔버스에서 검사
  항목을 누르면 노드로 이동해야 하는데, 2단계에서 더하면 코퍼스를 다시 열어야 해서 지금 넣었다
- **Reversible**: partial(D2·D8 은 저장 형식·코퍼스에 들어가므로 바꾸려면 이관이 필요하다. 나머지는 코드 변경으로 되돌릴 수 있다)
- **Source**: 계획 「편차 기록」, `ContractTypeShapeTest`, `EngineContractSchemaTest`, `RuleSetAnalyzer`, `RuleSetOrderCheck`,
  `MdmBusinessRuleMigrationTest.계약_전용_06_확정_검사와_정의_조회_빈이_없다`

## D-108 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 1단계)
- **Decision needed**: ruleSetEdit 기능설계서 N-1(설계 D2)이 남긴 후속 조건 "조회기가 생기면 `view` 옆 `execute`
  action 으로 세트 값 테스트 카드를 더한다"를 1단계에서 채울지
- **Decision made**: 1단계에서는 채우지 않는다. 1단계는 조회기(`StoredDefinitionLookup`)와 `RuleSetRunner` 까지만
  만들고, 화면 카드는 2단계의 디버거(시뮬레이션 탭)와 `ruleSetEdit.bpmn` 의 `simulate` action 으로 넣는다.
  action 이름은 `execute` 가 아니라 `simulate` 다(스펙 §6.2, 저장 전 흐름도 실행하는 기록 실행이라 뜻이 다르다)
- **Rationale**: 1단계 화면은 기존 목록 편집을 유지하고 분기 세트만 읽기 전용으로 보인다(스펙 §9). 값 테스트 카드를
  목록 화면에 먼저 만들면 2단계 디버거와 같은 기능이 두 벌이 된다
- **Reversible**: yes(2단계 착수 때 다시 정한다)
- **Source**: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` §11 N-1, 스펙 §6.2·§9, mdm ADR-0005 D4

## D-109 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 1단계)
- **Decision needed**: 목록·한 줄 입력도 흐름 파서를 거치게 하면서(D-107 D12) 생기는 행동 변화를 어떻게 다룰지
- **Decision made**: 아래 세 가지 변화를 받아들이고 기록한다.
  1. 목록·한 줄 입력에 null·공백 룰 ID 가 있으면 예전 `RULE_NOT_FOUND` 대신 `FLOW_STRUCTURE`(분석기)·`FLOW_INVALID`(엔진)가 된다.
  2. `ORDER` 문구의 later 목록에서 중복을 뺀다.
  3. 목록 화면의 `FLOW_STRUCTURE` 문구에 합성 노드 ID(`r1`…)가 남는다.
  운영 저장 경로는 `RuleIdRules` 가 null·공백·중복을 먼저 막으므로 위 1~3 에 실제로 닿기 어렵다
- **Rationale**: 목록 세트를 한 줄 흐름으로 바꿔 한 경로로 검사·실행하면 코드가 한 벌이다. 바뀌는 곳은 저장 경로가 이미 막는 입력뿐이라 운영 영향이 없다
- **Reversible**: yes(코드 변경만으로 되돌릴 수 있다)
- **Source**: D-107 D12, `RuleSetAnalyzer`, `RuleIdRules`, 엔진 `FlowParser`

## D-110 (2026-09-30T00:00:00Z)
- **Phase**: build(룰 세트 흐름도 1단계, 추가 Task 14)
- **Decision needed**: 폐기(DEPRECATED)된 룰이 든 INUSE 세트를 운영에서 판정할 때 막을지, 경고만 남길지.
  룰 폐기(`RuleHeaderService.deprecate`)는 `TB_MDM_RULE.STATUS` 만 바꾸고 참조 세트를 검사하지 않으며 RELEASED 버전의
  `APPLY_TO` 도 그대로 두므로, 운영 조회기(`StoredDefinitionLookup`)는 폐기 룰을 그대로 판정에 쓴다
- **Decision made**: 막지 않고 경고를 남긴다(사용자 결정). `RuleSetRunner.execute`(OASIS 입구)의 응답 `RuleSetRunResult.warnings`
  에 폐기 룰마다 `RULE_DEPRECATED` 한 건(흐름에서 처음 나온 순서, 탄 갈래 여부와 무관)을 싣고, 이어서 엔진 경고
  (`BRANCH_COND_NULL` 등 세트 경고, 그다음 `EXPR_CELL_NULL`·`GRP_COND_NULL` 룰 경고)를 싣는다. 서버 로그에 WARN 한 줄을 남긴다.
  Java API `run` 반환형과 엔진 계약(`RuleSetResult`·`RunTrace`·스키마·생성 TS)은 바꾸지 않는다. `trace`(디버거)의 경고는 2단계에서 다룬다
- **Rationale**: 폐기에는 효력 시각이 없어, 판정을 막으면 과거 시각으로 다시 판정하는 경우까지 깨지고 룰을 폐기하는 즉시
  그 룰을 쓰는 운영 세트가 멈춘다. 경고로 드러내면 판정은 이어지고 담당자가 세트를 고칠 신호를 받는다
- **Reversible**: yes(경고를 판정 오류로 바꾸는 것은 코드 변경만으로 된다)
- **Source**: 2026-09-30 사용자 답변("1. b"), `RuleSetRunner`, `RuleSetRunResult`, `RuleHeaderService.deprecate`, `StoredDefinitionLookup`

## D-111 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 2단계)
- **Decision needed**: 흐름 저장 요청을 OASIS params 로 어떻게 받을지(스펙 §9.1-1).
- **Decision made**: `flowJson` 문자열로 받는다(P-D1). `RuleSetSaveRequest.flow`(Map) 칸은 없앤다. 저장 JSON 은 서버가 파싱한 정의로 다시 쓴다(P2 정규 JSON, §9.1-3). 코덱은 문자열 order·불린 아닌 otherwise·숫자 id 를 형식 오류로 거부한다
- **Rationale**: 2026-09-30 실측에서 OASIS 가 params 의 Map 을 `S999 Generic type` 으로 거부했다. 문자열로 받으면 HTTP 바인딩 문제가 없고, 서버가 정규 JSON 으로 다시 쓰므로 클라이언트 표기 차이가 저장값에 남지 않는다
- **Reversible**: yes
- **Source**: 2026-09-30 실측 `S999 Generic type`, 계획 P1·P2

## D-112 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 2단계)
- **Decision needed**: 디버거·조건식 IO action 이름(D-108 의 `simulate` 조항).
- **Decision made**: 화면 action 은 `execute`, 서비스 메서드 이름은 `simulate`. 조건식 IO 는 `validate`→`condIo`. D-108 의 이름 조항을 대체한다. 결과로 `execute` 는 EDIT 권한이라 DME 에서 READ 인 표준 관리자(`MDM_STD_ADMIN`)는 디버거를 쓰지 못한다(P-D2·P-D3). 사용자 확인 사항으로 최종 보고에 올린다
- **Rationale**: 16개 어휘(ADR-0003 D5)와 mcm 시드 `allActions` 를 바꾸지 않는다. 룰 편집 값 테스트(`ruleEdit` 의 `execute`→`runTest`)가 같은 선례다
- **Reversible**: yes
- **Source**: ADR-0003 D5 16개 어휘, `ruleEdit.bpmn` `execute`→`runTest` 선례

## D-113 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 2단계)
- **Decision needed**: 캔버스 도입 뒤 목록 편집을 둘지, 저장 버튼 규칙(기능설계서 N-8)을 어떻게 할지.
- **Decision made**: 목록 편집(그리드·▲▼✕·드래그)을 없애고 캔버스 하나로 편집한다. 거부(REJECT) 검사가 있으면 저장 버튼을 끄고 서버도 같은 검사로 거부한다(스펙 §7, P-D4). 구성 지침의 "이 순서를 목록에 적용"은 한 줄 흐름이면 `linearFlow(순서)` 로 흐름을 바꾸고(배치 초기화), 분기 흐름이면 끈다(P-D5). 옛 목록 저장이 FLOW_JSON 이 있는 세트에 오면 거부한다(§9.1-7). 삭제 대상은 계획의 「삭제 대상」 표를 따른다
- **Rationale**: 스펙 §7 이 목록 그리드 자리를 캔버스로 바꾸고 오류가 있으면 저장을 막도록 정했으므로 1단계 N-8 의 "즉시 검사는 저장 버튼을 막지 않는다"와 다르게 정한다. 지침 버튼 처리는 1단계 Ruling 13 과 일관된다
- **Reversible**: partial(삭제한 화면 코드는 git 으로만 되살린다)
- **Source**: 스펙 §7, 2026-09-30 사용자 답변 "기존 화면 안"

## D-114 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 2단계)
- **Decision needed**: 흐름 크기·중첩 깊이 상한(§9.1-8).
- **Decision made**: 코덱 입구에서 노드 200·선 400·JSON 262,144자 상한만 둔다. 깊이 상한은 따로 두지 않는다(P-D6)
- **Rationale**: 중첩 한 단계마다 노드 2개(분기·합류)가 들므로 노드 200 이면 깊이가 99 를 넘지 못한다. 99단 중첩 IF 를 Java `FlowParser`·TS `parseFlow` 가 모두 통과함을 Task 1 테스트로 보인다
- **Reversible**: yes
- **Source**: 계획 P2, Task 1 깊은 중첩 테스트

## D-115 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 2단계)
- **Decision needed**: 선언 타입 없는 조건식 변수(§9.1-5)와 룰 확정 검사의 거친 형제 판정(§9.1-6).
- **Decision made**: 세트 저장 검사에 `COND_UNTYPED`(WARN)를 더한다. 대상은 DICT 출처 조건식 변수 가운데 세트 안 어느 룰의 입출력(`RuleIo.conds ∪ results`)에도 없는 이름(대소문자 무시)이며, RELEASED 가 없는 룰은 입출력을 모르므로 선언에 치지 않는다(P3·P-D7). 확정 검사의 SIBLING 판정은 분석기 경로 상태(`RuleSetPathState`)로 앞 경로에서 이미 정의된 이름을 뺀다(P4)
- **Rationale**: 엔진 `FlowKeys.condTypes` 가 보는 선언(계약 always·DERIVE 행 required·optional·RESULT 열)과 `RuleIoReader` 의 conds·results 가 같은 집합이다(N-4). Task 2 가 대조 테스트로 고정한다
- **Reversible**: yes
- **Source**: 1단계 최종 리뷰 Important 2건, 계획 P3·P4

## D-116 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 2단계)
- **Decision needed**: 저장값 손상 오류 코드, simulate 입력 검증(§9.1-9), 디버거 경고(D-110 이 2단계로 넘김).
- **Decision made**: `MDM026 STORED_DEFINITION_CORRUPT` 를 더한다. `StoredDefinitionLookup` 이 저장값을 읽다 난 `IllegalArgumentException`·`IllegalStateException` 을 `StoredDefinitionException` 으로 감싸고, `execute`·`simulate` 는 이 예외만 MDM026 으로 바꾼다. 그 밖의 IAE·ISE 는 감싸지 않는다. record 없음은 REQUIRED_VALUE 로 답한다. simulate 응답 warnings 는 RULE_DEPRECATED → BRANCH_COND_NULL → 룰 경고 순이다(P-D9, P5)
- **Rationale**: 저장값 손상만 좁혀 잡아야 엔진 버그를 입력 오류(MDM021)로 가리지 않는다. 디버거 경고 순서는 D-110 이 정한 운영 응답과 맞춰 같은 신호를 같은 순서로 보인다
- **Reversible**: yes
- **Source**: D-110, 스펙 §9.1-9, 계획 P5

## D-117 (2026-09-30T00:00:00Z)
- **Phase**: build(룰 세트 흐름도 2단계, Task 12 — D-115·D-116 정정)
- **Decision needed**: 2단계 Task 0 리뷰가 남긴 D-115·D-116 표현 정정과, 구현 중 진행 장부 Ruling 으로 계획과 다르게 정한 세 가지의 결정 기록.
- **Decision made**: (1) D-115 의 "앞 경로에서 이미 정의된 이름을 뺀다"는 반드시 정의됨(defined)만이 아니라 일부 갈래에서만 정의됨(maybe)까지 포함한다. 룰 확정 검사가 형제 판정에서 defined ∪ maybe 를 빼는 이유는 세트 저장 검사(`RuleSetAnalyzer`)와 같은 판정을 내기 위해서다(maybe 는 세트 저장 검사가 `FLOW_PARTIAL` 경고로 다룬다). (2) D-116 의 `execute` 는 `RuleSetRunner.execute`(OASIS 입구)를 가리키며, 화면 action `execute`(서비스 메서드 `simulate`)와 다르다. (3) Ruling 5: `view`·`restore` 가 저장된 흐름(FLOW_JSON)을 읽지 못하면 MDM026(`STORED_DEFINITION_CORRUPT`)으로 바꿔 화면이 문장으로 보게 한다. 계획 P1 의 "읽지 못하면 condIo 빈 맵"은 문구 오류다(조회는 condIo 를 만들기 전 저장 흐름 parse 에서 이미 실패한다). MDM026 문구에는 룰 ID 를 붙이지 않고 원인 그대로 둔다(Ruling 9). (4) Ruling 10: 디버거 값 표의 병렬 합류는 엔진 `FlowRun` 과 같이 각 갈래가 실제로 쓴 이름만 갈래 실행 순서대로 덮어쓴다(계획 P9 의 "merged 이름마다 갈래 범위에서 가져옴"을 정정). (5) Ruling 12: 디버거 표시는 실행에 영향을 주는 칸(노드 id·kind·ruleId·splitId, 선 id·from·to·order·cond·otherwise)이 바뀔 때만 지우고 `label` 만 바뀌면 유지한다. 세트가 바뀌면 지운다
- **Rationale**: (1)은 D-115 를 그대로 읽으면 maybe 가 빠진다고 오해해 확정 검사와 세트 저장 검사가 어긋나 보이기 때문이다. (2)는 `execute` 가 엔진 실행 입구와 화면 action 두 곳에 쓰여 혼동되기 때문이다. (3)은 손상된 저장 흐름의 조회가 `S999` 로 남으면 담당자가 원인을 문장으로 알 수 없기 때문이며, MDM026 을 만드는 태스크가 한 곳에서 처리한다. (4)는 문자 그대로 읽으면 분기 전 값을 되돌리는 오표시가 나기 때문이다. (5)는 label 은 화면 표시용(스펙 §3.3)이라 이름만 고쳐도 실행 결과가 지워지면 불편하기 때문이다
- **Reversible**: yes(정정·문구 결정이며 (5)는 `structKey` 한 줄, (4)는 값 표 합류 칸 한 규칙)
- **Source**: 2단계 Task 0 리뷰 deferred minor, 진행 장부 Ruling 5·9·10·12, D-115·D-116, 기능설계서 N-16·N-17

## D-118 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 3단계)
- **Decision needed**: 3단계 화면 모드와 시뮬레이션 자리(스펙 B4)
- **Decision made**: [보기][편집][디버그] 세 모드. 시뮬레이션 탭을 디버그 모드로 옮기고 탭·옛 컴포넌트를 지운다(삭제는 사용자 승인). 디버그 왼쪽은 입력 패널이라 룰 목록을 두지 않는다(P-D10). 디버그 모드에서 [변수 흐름]을 켠다(P-D16). 디버그 단추는 세트 툴바 아래 둘째 줄에 둔다(P-D22, 스펙 B4 위임). 보기·편집 오른쪽 "실행 결과" 탭도 함께 지운다(사용자 승인 범위 포함)
- **Rationale**: 3단계의 배치는 스펙 §4.1 그림에 정의되고, §4.1 배치 그림과 A4 가 같은 자리를 요구하므로 배치 그림을 따른다. 디버그 모드에서 [변수 흐름] 토글을 켜는 것은 칩이 없으면 툴팁을 올릴 자리가 없기 때문이다. `Controls` 잠금 단추를 제거하는 것은 모드가 노드 드래그·연결 제어를 맡고 React Flow 의 잠금 단추와 제어가 겹치기 때문이다. 디버그 단추를 세트 툴바 둘째 줄에 두는 것은 한 줄에 여섯 단추를 함께 두면 1280 폭에서 넘치고, 스펙 B4 가 세부 배치를 설계자에게 맡겼기 때문이다.
- **Reversible**: partial(지운 코드는 git 으로만)
- **Source**: 스펙 §4.1, 계획 「삭제 대상」

## D-119 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 3단계)
- **Decision needed**: 디버거 커서 의미·낡은 기록 표시(스펙 §4.1·§4.2)
- **Decision made**: 커서 k = 노드 k 실행 전(P-D13). 새 실행 직후 [계속]·[여기까지]는 커서 0 포함(P-D14). 낡은 기록은 캔버스 겹침 없이 패널만 "지난 흐름 기준"(P-D9). 입력이 기록 입력과 다르면 낡은 것과 같이 다음 동작에서 새로 실행(P-D9)
- **Rationale**: 스펙 툴바 문구 "3/7 r2 실행 전"·§4.4 "커서 이전에 실행됐으면" 과 맞추고, 다음 주 E4(멈춘 자리에서 값 고쳐 이어 실행)의 멈춤 위치와 같게 둔다. 옛 기록의 노드 ID 가 지금 캔버스에 없거나 다른 뜻일 수 있으므로(2단계 Review Focus 3) 낡은 것과 새 실행의 구별이 필요하다.
- **Reversible**: yes
- **Source**: 스펙 툴바 문구, 2단계 Review Focus 3

## D-120 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 3단계)
- **Decision needed**: 세트 테스트 케이스 저장·판정(스펙 §4.6)
- **Decision made**: V15 `TB_MDM_RULE_SET_TEST_CASE`(EVAL_TS VARCHAR(19), P-D6), 세트 안 최대+1 발급·PK 충돌은 MDM001 동시 저장 문구, 세트당·실행당 50(P-D5), 폐기 세트 쓰기 MDM009·조회는 됨(P-D8). 판정은 `RuleCaseJudge.sameValue`(P-D3), finalValues 만·대소문자 무시·오류=실패·기대 없으면 실행만(P-D4). 케이스 쓰기 뒤 cases 만 다시 읽는다(P-D11). 실행 요청에 setId(P-D12). 마지막 결과는 화면 메모리(P-D19)
- **Rationale**: 화면·`execute` 가 같은 KST 문자열을 주고받으므로 시각 바인더 변환이 필요 없다(P-D6). 저장 상한이 실행 상한보다 크면 [모두 실행]의 뜻이 정해지지 않으므로 둘 다 50으로 통일한다(P-D5). 룰 케이스와 같은 판정 규칙을 쓰고, 문자열 비교면 실행 결과로 채운 기대값이 표기 차이로 실패할 수 있으므로 타입 기반 비교를 한다(P-D3). 기대값 없는 케이스는 룰 케이스와 같이 "실행만"(P-D4). Review Focus 2 를 고려해 케이스 저장 뒤 세트는 다시 불러오지 않는다(P-D11). 옛 흐름의 통과·실패를 지금 흐름의 결과로 보이면 안 되므로 마지막 결과는 화면 메모리에만 둔다(P-D19).
- **Reversible**: yes
- **Source**: 스펙 §4.6

## D-121 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 3단계)
- **Decision needed**: 세트 테이블을 가리키는 첫 FK(V15)
- **Decision made**: V14 주석의 "FK 없음" 전제가 깨진다. 세트 테이블 재생성 마이그레이션은 자식 테이블을 먼저 다룬다(P-D7)
- **Rationale**: V14 가 DROP/RENAME 재생성을 썼지만, V15 에서 `TB_MDM_RULE_SET_TEST_CASE` 가 생기고 세트를 가리키는 첫 FK 가 추가되므로 앞으로의 마이그레이션 전략이 달라진다. 이 사실을 V15 주석·D 기록에 남긴다.
- **Reversible**: no(스키마 제약)
- **Source**: V14 머리 주석

## D-122 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 3단계)
- **Decision needed**: 식 즉석 평가의 파싱 자리(스펙 §4.5 "서버를 부르지 않는다")
- **Decision made**: `validate` 의 `exprText` 로 서버가 파싱만, 평가는 화면(P-D1). 평가 시각·LIST 는 폴백 문구(P-D15). READ 는 식 평가 칸이 꺼진다
- **Rationale**: 화면에는 식 파서가 없다(불변 9 — `ruleEdit/expr/parse-expr.ts` 머리 주석, `tests/dme/ruleEdit/expr-field.test.ts` 가 지킨다). 결과로 `validate` 는 EDIT 권한이라 READ 사용자(표준 관리자)는 식 평가 칸이 꺼진다(title 로 이유). 평가기 API 에 시각 인자가 없고 엔진 계약을 바꾸지 않으므로 평가 시각에 기대는 함수는 폴백 신호로 처리한다(P-D15).
- **Reversible**: yes
- **Source**: 불변 9(`parse-expr.ts`)

## D-123 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 3단계)
- **Decision needed**: 편집기 세부(스펙 B9·B10·§5, 권한 테스트)와 사용자 추가 요청 C14(선 경로 편집)
- **Decision made**: 즉석 편집은 선 라벨 두 번 누르기 → 조건식(P-D17). 붙여 넣은 노드는 자동 배치 좌표(P-D18). **2026-09-30 개정(브라우저 확인 5번, Ruling 19)**: P-D18 을 「저장 위치가 없는 노드는 그리는 흐름에서 고정 노드와 겹치지 않게 비킨다, 좌표는 저장하지 않는다」로 바꾼다 — 저장 위치가 있는 노드를 고정으로 보고, 그리는(접힌) 흐름의 배치에서 고정 안 된 노드만 가로로 민다. 끌기 대상 선은 캔버스 내부 상태(P-D20), [+] 는 FlowCanvas 선 그리기 안(P-D21, `EdgeInsert.tsx` 없음). `Controls` 의 잠금 단추는 모드 제어와 충돌해 뺀다(P-D22, 스펙 D14 편차). READ 403 은 e2e 몫, 백엔드는 MDM013·권한 계약으로 고정(P-D2). C14 선 경로 편집은 화면 전용 view.routes(선 ID → 흐름 좌표 점 목록)에 저장한다. 서버 RuleSetFlowJson 은 view 를 읽지 않고 받은 그대로 저장하므로 서버·DB·엔진은 바뀌지 않는다. 선이 없어지면 경로도 버리고, [자동 정렬]은 경로를 지운다.
- **Rationale**: 선 라벨은 이름을 보이지만 B10 이 고치려는 것은 조건식이므로 조건식을 입력하는 칸이 열린다. 위치를 추정하는 규칙을 두지 않으므로 붙여 넣은 노드는 자동 배치 좌표로 그려진다(YAGNI). 개정 이유: 저장 위치가 있는 흐름에서 자동 배치 좌표가 옮겨 둔 노드와 겹쳤다(브라우저 확인 5번). 새 노드 좌표를 저장하는 방식은 한 레이아웃(펼친 흐름·그 시점)에서 계산한 좌표를 다른 레이아웃(접힌 흐름·뒤이은 편집)에서 그려 다시 겹치므로, 좌표는 저장하지 않고 그릴 때마다 푼다. 부모는 끄는 동안의 포인터 좌표를 모르므로 끌기 대상 선은 캔버스 내부 상태로 하고 놓은 순간의 선 ID 만 올린다(Local-Rules §16). 선 컴포넌트를 두 파일로 나누면 Task 0·7·11 이 같은 선 그리기를 나눠 고쳐야 하므로 FlowCanvas 안에 [+] 단추를 넣는다. 잠금은 모드가 노드 드래그·연결 제어를 맡으므로 제어가 겹쳐 제거한다(P-D22). 백엔드 필터 체인에 RBAC 가 없으므로 403 테스트는 e2e 에 맡긴다(P-D2). C14 선 경로 편집은 3단계 범위이고 FLOW_JSON 의 화면 전용 view.routes 에 저장된다. 선 ID 가 없어지면 해당 경로도 버리고, [자동 정렬]은 모든 경로를 지운다.
- **Reversible**: yes
- **Source**: 스펙 §3.2·§3.3·§5·§6 C14

## D-124 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: 디버거에서 멈춘 지점의 값을 고쳐 이어 실행하는 방식(스펙 §2)
- **Decision made**: 룰 세트 디버거의 "값 고쳐 이어 실행" 은 엔진을 중간부터 재개하지 않고, 처음부터 다시 실행하며 k 번째 노드를 시작하기 직전에 고친 값을 그 범위 ctx 에 넣는다(`RunTrace.edits`, `execute.editsJson`). 같은 이름이 그 범위에서 이미 만든 결과면 결과도 바꾼다(대소문자 무시). 병렬 갈래 안에서 고친 입력은 그 갈래 안에서만 보이고, 갈래가 만든 결과의 고침은 합류까지, 최상위 결과의 고침은 `finalValues` 까지 간다. PARALLEL·MERGE 노드 직전의 고침은 바깥 범위에 넣는다. 자리 노드 ID 가 어긋나거나 정상 완료 때 안 쓰인 고침이 남으면 `EDIT_POINT_MISMATCH`. `editsJson` 의 값은 `recordJson` 과 같은 BigDecimal 매퍼로 풀고 [비우기]의 `null` 을 허용한다(null 을 허용하는 `LinkedHashMap`).
- **Rationale**: 실행이 결정적이라 앞 기록이 같게 나오고, 병렬 갈래 스택 복원·prepare 키 검사 범위 조정·기록 이어 붙이기가 필요 없다. 고친 값은 이번 디버그 실행에만 남긴다(사용자 결정). 화면의 고침 반영(Task 10)은 엔진과 같은 퍼짐 규칙·같은 기대값으로 맞췄다.
- **Reversible**: yes
- **Source**: 스펙 §2, idea.md E4. 영향: 엔진 계약(RunTrace·TraceEdit·위반 코드), `RuleEngine.traceSet` 겹정의, `RuleSetSimulateRequest.editsJson`, 화면 디버거. 병합 커밋: 722683e6(Task 1 계약), 2422f19c(Task 2 엔진), 383d03d3(Task 3 API), aecff616(Task 10 모델·훅), dd432214(Task 11 편집 화면)

## D-125 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: 입출력 없이 지나가는 노드와 룰을 나중에 채우는 방법(스펙 §1.1·§1.2)
- **Decision made**: 룰 ID 없이 제목만 가진 노드 종류 `TASK`(화면 이름 "빈 단계")를 둔다. 실행·기록 실행 모두 아무것도 읽거나 만들지 않고 지나가며, 저장은 막지 않고 검증 경고(`EMPTY_TASK`)만 낸다. 빈 단계만 있고 룰이 없는 흐름(START→TASK→END)은 `EMPTY` 없이 `EMPTY_TASK` 경고만 낸다 — `EMPTY` 는 RULE 도 TASK 도 없을 때만이다(Ruling 1). 팔레트 [룰] 은 룰 찾기 창 대신 빈 단계를 바로 놓고, 오른쪽 "룰 지정" 섹션에서 룰을 지정하면 같은 노드 ID 의 RULE 노드로 바뀐다. 룰 찾기 창(`RuleSearchModal`)은 지운다.
- **Rationale**: 흐름 그림을 먼저 그리고 룰을 나중에 채우는 작업 방식(사용자 요청). 그림부터 그려 놓고 채우는 흐름이라 룰이 아직 없어도 저장은 막지 않는다. 룰 없는 세트가 확정될 수 있는 위험은 `EMPTY_TASK` 경고가 보여 준다.
- **Reversible**: no(흐름 JSON 에 TASK 가 저장된다)
- **Source**: 스펙 §1, 사용자 요청. 영향: 엔진 계약 `NodeKind.TASK`, 흐름 JSON, 화면 팔레트·노드·오른쪽 패널. 병합 커밋: 722683e6(Task 1 계약), 2422f19c(Task 2 엔진), 383d03d3(Task 3 API), 2e381245(Task 9 화면)

## D-126 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: Camunda 식 선 편집(스펙 §3)
- **Decision made**: 편집 모드에서 선에 마우스를 올리거나 선을 고르면 꺾는 점(원)과 가로·세로 선분 가운데의 선분 손잡이(막대)를 보인다. 선분 손잡이는 선분을 수직으로만 옮기고, 끄는 동안 일직선(화면 6px)에 맞추며 놓을 때 한 직선 위의 가운데 점과 길이 0 선분을 지워 합친다. 자동 경로는 `@xyflow/system@0.0.83` `getPoints` 이식본으로 점을 구해 처음 끌 때 저장 경로로 바꾼다. 경로 없는 선을 두 번 누르면(고른 선의 끝 손잡이를 두 번 눌러도) 자동 경로의 꺾임을 이어받아 선 모양이 튀지 않는다(Ruling 3). 화면에서 96px 미만인 곧은 선에는 선분 막대를 그리지 않는다 — [+] 와 겹치기 때문이다(Ruling 4).
- **Rationale**: Camunda Modeler 와 같은 선 편집(사용자 요청). 그리기는 그대로 `getSmoothStepPath` 라 처음 끌 때 모양이 튀지 않는다.
- **Reversible**: yes
- **Source**: 스펙 §3, 사용자 요청. 영향: `route-path.ts`, 캔버스 선 보기. `@xyflow/system` 을 올리면 이식본과 시험을 다시 맞춘다. 병합 커밋: 0312683e(Task 4 순수 함수), 483525af(Task 5 캔버스)

## D-127 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: 그룹 크기 저장 방식(스펙 §4)
- **Decision made**: 그룹 크기는 소속 노드 경계 바깥 여백 `view.groups[].pad {l,t,r,b}`(0~2000)로 저장한다. 크기를 바꿔도 소속은 바뀌지 않는다.
- **Rationale**: 소속 노드를 옮기면 그룹이 따라가고, 소속 노드보다 작게 줄지 않는다.
- **Reversible**: yes(선택 필드)
- **Source**: 스펙 §4, 사용자 요청. 영향: view 저장 형식(선택 필드), 캔버스 그룹. 병합 커밋: a8d3be85(Task 6)

## D-128 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: 편집 화면 배치(스펙 §1.3)
- **Decision made**: 편집 화면 배치를 Camunda Modeler 식으로 바꾼다. 왼쪽 룰 패널 대신 캔버스 안 떠 있는 도구 상자([손]·[영역 선택]·[공간] + 요소 아이콘, 툴팁), 미니맵은 오른쪽 위, 오른쪽 패널은 머리글(종류 아이콘·종류·이름) + 접는 섹션이며 룰 목록은 그 섹션("룰 목록"/"룰 지정")이다. 3단계 P-D10(왼쪽 룰 패널 배치)을 대체한다(디버그 모드의 입력 패널은 그대로).
- **Rationale**: 사용자 요청(아이콘 사이드바·오른쪽 룰 선택, Camunda Modeler 화면과 비슷하게).
- **Reversible**: yes
- **Source**: 스펙 §1.3, 사용자 요청. 영향: 3단계 P-D10 대체, e2e 선택자. 병합 커밋: 5cfa2606(Task 7 도구 상자·미니맵), 99714742(Task 8 머리글·섹션 패널)

## D-129 (2026-10-01T00:00:00Z)
- **Phase**: implement(룰 세트 흐름도 — 그룹 통째로 옮기기, 사용자가 판단을 맡김)
- **Decision needed**: 그룹을 골라 통째로 옮기는 방법(사용자 요청 "그룹을 선택하고 그룹 전체를 이동하는 기능이 있으면 좋겠다. 지금은 그게 잘 안되는것 같아")
- **Decision made**: 편집 모드에서 그룹 제목이 끌기 손잡이다(틀 몸통은 지금처럼 누름을 받지 않아 그룹 안 빈 곳의 영역 선택·화면 이동이 그대로다). 제목을 끌면 소속 노드가 틀과 같은 만큼 움직이고 놓을 때 한 번 저장한다. 그룹을 고르고 화살표 키를 누르면 소속 노드를 옮긴다. 노드 여럿(그룹 포함)을 같은 만큼 옮기면 두 끝이 모두 옮겨진 선의 꺾는 점도 함께 옮긴다(`shiftRoutes`, 끌기·화살표 공통 — 기존 다중 끌기 동작도 바뀜). 그룹은 선에 끼우지 않는다. 고른 그룹 틀은 React Flow 의 고른 노드 올리기(+1000)만큼 내려 그려 소속 노드를 가리지 않는다. 소속 분기를 옮기면 블록(갈래·합류)이 함께 간다(기존 분기 끌기 규칙). 그룹은 흐름 노드만 담으므로 틀 안 메모는 따라오지 않는다.
- **Rationale**: 그룹 틀이 1단계부터 `draggable:false`·누름 통과라 제목 누르기 선택만 됐고, 고르면 틀이 노드를 가렸다. 그룹 자리는 소속 노드에서 계산하므로 소속 노드를 옮기는 것이 그룹 이동이다.
- **Reversible**: yes
- **Source**: 사용자 요청. 커밋 4623051f·149a6f4b, 병합 6558cb67·c43d0c99. 브라우저 확인 `gm-browser-check-report.md`.

## D-130 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 — 룰 노드 외관 옵션, 사용자가 세부 판단을 맡김)
- **Decision needed**: 룰·빈 단계 노드 외관 옵션의 저장·표시·편집 방식(사용자 요청 「각 룰에 대해 외관 옵션도 있으면 좋겠다」 — 색·크기·표시 항목·아이콘·모양 모두, 룰·빈 단계만, 크기는 모서리 끌기, 아이콘·모양은 정해진 목록)
- **Decision made**: S-D1 저장은 `view.styles[nodeId]`, 빈 값이면 키 생략(메모리에서도) · S-D2 색은 고정 팔레트 7가지(채움·테두리 한 쌍, shared 의미 토큰을 섞은 `:root` 토큰 + `[data-mantine-color-scheme="dark"]` 값) · S-D3 상태 표시(디버그·선택·검사)가 색보다 우선(색 규칙은 `.rsf-node:where([data-color])`) · S-D4 크기 232~640 × 68~320, 손잡이 e·s·se(잇기 손잡이를 비켜 75% 자리), 왼쪽 위 고정 · S-D5 모든 크기 계산을 `nodeSizeOf` 로 통일, 접힌 블록은 기본 크기(그룹 틀도 그린 접힌 상자로 잰다) · S-D6 크기를 바꾸면 그린 위치 전부를 저장 위치로 적고(크기가 그대로면 적지 않음) 커져서 겹치면 겹친 채 둔다 · S-D7 숨길 항목은 sub·id·open 3개, 제목·상태 표시는 늘 보임 · S-D8 아이콘 12개(Tabler), 모양 3가지 · S-D9 외관 편집 UI 는 오른쪽 패널 「외관」 섹션(편집 모드만, 누름 단추·체크·숫자 칸), 크기만 캔버스 손잡이도 · S-D10 빈 단계→룰 지정·붙여넣기·복제 때 외관 유지·복사 · S-D11 높이가 기본보다 크면 제목을 여러 줄(line-clamp)로 · S-D12 스타일 정리는 정규화 한 곳(`stylesFor` — toEditFlow·clone·done·dropNodes). 자동 배치는 폭이 다른 갈래가 겹치면 갈래를 벌린다(`spreadLanes`)
- **Rationale**: 백엔드가 view 를 그대로 통과시켜 계약 변경이 없고, 외관 없는 세트의 저장 글자·dirty 기준이 그대로다(G2 pad 와 같은 원칙). Camunda Modeler 의 요소 색·크기 조절 방식과 같고, 그린 크기와 배치·스냅·그룹·선 계산이 어긋나지 않는다
- **Reversible**: yes(선택 필드)
- **Source**: 스펙 `docs/superpowers/specs/2026-10-01-rule-set-flow-node-style-design.md` §6, 계획 `docs/superpowers/plans/2026-10-01-rule-set-flow-node-style.md` Rulings, 사용자 요청. 영향: view 저장 형식(선택 필드), 캔버스 노드·오른쪽 패널. 병합 커밋: 593547f9(모델·크기), 271a72f6(노드 그리기), 3dccb27e(외관 섹션), acaaf93e(크기 손잡이)

## D-131 (2026-10-01T00:00:00Z)
- **Phase**: implement(룰 세트 흐름도 — 룰 노드 외관 옵션 뒤 사용자 추가 요청·최종 리뷰 고침, 사용자가 세부 판단을 맡김)
- **Decision needed**: 브라우저 확인 뒤 사용자 지적("색상은 안보이네 색상은 컨텍스트 메뉴에서 넣도록 하자", "갈래 1 노드가 조금 더 왼쪽으로", "되돌리기, 다시 하기 버튼은 툴팁이 없어. 그리고 키보드 단축키도 동작하나?")과 최종 리뷰 지적(숨은 탭 ⌘Z, 조건 없는 IF 배치)을 어떻게 반영할지
- **Decision made**: C1 색 고르기는 오른쪽 「외관」 섹션에서 빼고 노드 우클릭 메뉴 「색상」(붓 아이콘) 안 3×2 견본 격자(`flow-menu-swatch-{색}`)로 옮긴다(D-130 S-D9 의 색 부분 대체 — 크기·표시 항목·아이콘·모양은 패널 그대로) · C2 팔레트는 Camunda 와 같은 6색 default·blue·orange·green·red·purple, 노랑을 뺀다(저장돼 있던 yellow 는 읽을 때 버려 기본색, D-130 S-D2 의 7색 대체) · C3 Camunda 처럼 진하게 — 채움은 색을 배경에 28% 섞고 테두리·제목 글자는 색을 글자색과 65% 로 섞은 진한 값 · C4 우클릭한 노드가 다중 선택 안에 있으면 고른 RULE·TASK 전부에 한 번에 적용(편집 한 번) · C5 색 칠한 노드는 고른 동안에도 테두리를 노드 색으로 두고 선택은 바깥 고리로만 보인다(D-130 S-D3 의 "선택" 부분 대체 — 디버그·검사·끌어 놓기 상태는 여전히 색보다 우선) · L1 자동 배치에서 빈 갈래도 룰 하나 너비(232) 자리를 두어 한쪽 갈래 노드 상자 전체가 분기 가운데 바깥에 놓인다(두 갈래 모두 노드면 배치 그대로) · I3 조건식이 빈 IF(막 넣은 IF)도 배치 계산에서만 자리표시 조건을 채운 사본으로 갈래 구조를 얻어 갈래 순서·L1 이 돈다(저장 흐름·검사는 그대로) · U1 툴바 아이콘 단추(되돌리기·다시 하기·도움말)는 title 대신 즉시 뜨는 CSS 툴팁(`data-tip`, 단추 아래), aria-label 유지 · U2 편집 모드에서 되돌리기·다시 하기만 캔버스 밖(패널·툴바·body)에서도 받는다 — 입력 칸·캔버스 안·대화 상자·메뉴 안·보기·디버그 모드 제외, 나머지 단축키는 캔버스만 · I1 화면이 보이지 않으면(포털이 고르지 않은 탭을 display:none 으로 숨김) U2 단축키를 받지 않는다. 계획 문서 Ruling 5·18 의 노랑·10% 채움·7색 이름은 C2·C3 로 대체됐다(계획은 역사 기록이라 고치지 않는다, M5)
- **Rationale**: 패널의 옅은 견본은 눈에 띄지 않았고 칠한 직후 선택 테두리가 색을 덮었다(진단 `color-diag-report.md`). Camunda Modeler 의 색 메뉴·팔레트·선택 표시와 같게 맞췄다. 빈 갈래를 dagre 가 너비 0 점으로 놓아 노드가 분기 아래에 걸쳤고, 막 넣은 IF 는 조건이 비어 갈래 정렬이 돌지 않았다. title 툴팁은 늦고 작아 보이지 않았고 단축키는 캔버스 초점에서만 동작했다(진단 `undo-diag-report.md`). document 단축키가 숨은 탭 흐름까지 몰래 되돌릴 수 있었다(최종 리뷰 I1)
- **Reversible**: yes(색 이름·배치·단축키 범위 모두 화면 동작, 저장 형식은 D-130 그대로)
- **Source**: 사용자 요청, 최종 리뷰 `final-review.md`(I1·I2·I3·M4·M5). 영향: 우클릭 메뉴·노드 색 CSS·자동 배치·툴바·단축키 범위, e2e 선택자(`flow-style-color-*` 없어짐 → `flow-menu-swatch-*`). 커밋: Task 6 1c3bc257·1f1f618e(병합 90b1f41b), L1 7fe36783(병합 219ee52f), Task 7 fa203d93(병합 a6a88f48), 최종 리뷰 고침 0e379ead

## D-132 (2026-10-01T00:00:00Z)
- **Phase**: implement(도메인 관리 — 부모 도메인 연결·연결 제거·교체, 사용자가 세부 판단을 맡김)
- **Decision needed**: 기능설계서 D-003·S01(§6.2)·§7.3 이 수정 중 부모 변경을 구조 변경으로 금지한다. 사용자 판단(2026-10-01)으로 최상위 도메인의 부모 연결, 부모 연결 제거, 다른 부모로 교체를 모두 허용하기로 했다 — 그 검사·저장 방식과 화면을 어떻게 할지
- **Decision made**: P1 D-003·S01 의 "수정 중 부모 변경 금지"를 번복한다. 부모 칸은 구조 칼럼에서 빼고 변경 분류 `PARENT_CHANGE`(diff 방향 LINK·RELINK·UNLINK)를 둔다. 종류·타입·단위의 S01 은 그대로 · P2 연결·교체는 S02(종류·타입이 새 부모와 같아야 함 + **유효 단위**가 바뀌면 거부)와 R07(순환)을 그대로 적용한다 · P3 연결 제거는 서버가 검사 전에 옛 부모 체인의 유효값을 자기 행에 복사한다(구체화) — 길이·소수·단위·코드 참조 쌍은 빈 칸만 채우고, 표준식(MASTER 를 뺀 체인 식)·비즈니스식은 옛 체인 식과 자기 식을 `&&` 로 잇는다. 제거 뒤 유효 정의가 같아 QTY 단위·S04·`CK_TB_MDM_DOMAIN_FLAG`·`CK_TB_MDM_DOMAIN_CODE` 를 지키고, 그래도 못 채우면 해당 규칙(R05 등)으로 거부한다 · P4 참조 컬럼이 있어도 막지 않고 경고 W04(옛→새 부모, 참조 컬럼 수, 하위 도메인 수)·W05(복사한 칸)를 보인 뒤 확인하면 바꾼다. 하위 도메인 길이·소수(R06)·테스트 케이스(R08)는 값 정의 변경과 같이 다시 검사하고 위반이면 저장 트랜잭션 전체를 되돌린다. 동시 수정은 기존 MDM001 · P5 새 액션을 두지 않고 `validate`(경고 미리보기) → `save`(확인 후 쓰기)를 재사용한다 · P6 화면은 상단 [부모 연결]·[연결 제거](B-007·B-008, action `save` 로 RBAC) 두 단추와 대화상자(`ParentLinkModal`). 대화상자는 편집 폼이 아니라 저장된 행 그대로에 부모만 바꾼 초안을 보내고, 후보는 기존 「부모 도메인」 Select·`parentCandidates` 를 전체 목록에 써서 고른다(지금 부모 제외). 부모가 있는 도메인의 [부모 연결] 은 교체다. 수정 폼의 부모 칸은 계속 잠근다
- **Rationale**: 계층을 다시 짜려고 도메인을 새로 만들고 컬럼을 이관하는 것은 비용이 크고, 유효값은 쓸 때 조립하므로(02:103-134) 부모를 바꿔도 행 하나만 쓰면 된다. 다만 상속이 끊기면 의미가 바뀌므로 제거는 구체화로 의미를 보존한다. 전용 액션(`linkParent` 등)을 두지 않은 것은 액션 이름이 RBAC 어휘 키라서(ADR-0003 D5, `MdmOasisActionVocabularyTest`·mcm `DataInitializer` allActions — 새 이름은 SYSADMIN 도 403) 계약·시드를 함께 바꿔야 하고, `validate`→`save` 가 이미 경고 후 확인 2단계·같은 검사 재실행·하위 재검사·동시 수정 검사·롤백을 갖고 있어서다(선례: unitMng 의 `compare` 액션이 다른 메서드를 부름)
- **Reversible**: yes — 스키마·계약 변경 없음(`PARENT_DOMAIN_ID`·FK·인덱스·CHECK 는 원래 있음). 되돌리려면 분류기·검사기의 부모 칸을 구조 칼럼으로 되돌리고 단추를 빼면 된다. 다만 이미 연결 제거로 구체화해 저장된 행의 식·단위 복사는 데이터라 자동으로 되돌아가지 않는다(유효 정의는 같으므로 그대로 둬도 의미는 같다)
- **Source**: 사용자 요청·판단 2026-10-01. 영향: 기능설계서 D-003·§5.1 B-007·B-008·§5.2·§6.2(S01·S02·W04·W05)·§6.3·§7.3·§7.4·§8·§9·LV-003, `DomainChangeClassifier`·`DomainRuleChecker`·`DomainUnlinkMaterializer`·`DomainMngService`, 화면 `ParentLinkModal`·`ParentDomainSelect`, e2e E8. BPMN·액션 어휘 변경 없음

## D-133 (2026-10-01T00:00:00Z)
- **Phase**: refactor(dme 룰 화면 — 적중 정책 편집 위치, D-105 (4) 번복)
- **Decision needed**: D-105 (4) 로 적중 정책(HIT_POLICY) 편집이 룰 화면(`ruleMng`) ② 버전 카드의 Select·[적중 정책 저장](`save target VERSION`)으로 갔다. 그러나 정책은 의사결정표를 어떻게 읽을지 정하는 규칙(겹침이 경고인지 오류인지, 집계·순위가 무엇에 붙는지)이라, 표를 고치는 화면과 정책을 고치는 화면이 갈라져 있으면 "정책을 바꿨더니 표가 어떻게 되는지"를 한 화면에서 볼 수 없다. 어디서 고치고 어떻게 저장할지 다시 정해야 한다
- **Decision made**: D-105 의 (4) 만 번복한다(나머지 (1)~(3)·(5)~(7) 은 그대로). (1) **완전 이동** — 적중 정책은 룰 편집 화면(`ruleEdit`) ③ 의사결정표 위 Select(`dt-hit-policy`)에서만 고친다. 룰 화면 ② 버전 카드의 편집 칸·저장 버튼을 없애고, 버전 목록에 「적중 정책」 읽기 전용 칸과 안내 한 줄만 둔다(목록 그리드의 「적중 정책」 칸도 표시용 그대로). (2) **표 저장에 묶는다** — 정책은 표의 다른 변경과 함께 [표 저장] 한 번, 같은 트랜잭션에 저장한다(`ruleEdit save part TABLE` 의 `hitPolicy`, 비우면 저장된 값). 화면에서는 되돌리기·저장 안 한 변경(dirty) 대상이고, 바꾸면 즉시 검사(Worker)가 새 정책으로 다시 돈다. 서버도 새 정책으로 표를 검사한다(TABLE 검사 지점 — 옛 STORED 재검사를 포함한다). (3) **편집 조건은 그대로** — DRAFT·내가 선점·save 권한·원천 MDM·DECISION 일 때만. 서버는 `beginDraftWrite`(DRAFT·소유자·row_version)로 같은 가드를 하고, DERIVE 에 값이 오면 거부한다. part COLUMNS·CASE 에 `hitPolicy` 가 오면 조용히 버리지 않고 거부한다. (4) **열 설정과의 의존** — 정책을 바꾸는 표 저장은 저장된 열 설정이 새 정책과 어긋나면 열 설정 검사와 같은 코드·문구(`AGG_COLLECT`·`PRIO_PRIORITY`·`GRP_POLICY`)로 MDM021 거부한다(화면도 같은 규칙으로 미리 막고 [열 설정 보기] 로 이끈다). 단 집계 `LIST` 는 어긋남으로 보지 않는다 — 열 설정이 COLLECT 결과 열에 채우는 기본값이자 DB 기본값이라 고른 값과 구별되지 않고, 이것까지 막으면 COLLECT 에서 다른 정책으로 영영 못 바꾼다. 대신 정책이 COLLECT 밖으로 바뀌면 그 버전의 `COLLECT_AGG='LIST'` 를 같은 트랜잭션에서 비운다(엔진은 빈 집계를 LIST 로 모으므로 뜻이 같다). 정책이 그대로면 이 검사를 하지 않는다(이미 저장된 상태를 새로 막지 않는다). (5) `ruleMng save target VERSION`·`RuleVersionService.saveHitPolicy`·`RuleMngSaveRequest` 의 `ver`·`rowVersion`·`hitPolicy` 칸을 없앤다. 옛 화면이 VERSION 을 보내면 거부한다. `RuleHitPolicies`·`RuleNativeWrites.updateHitPolicy` 는 공용으로 남긴다. 엔진·스냅샷·DB 스키마는 바꾸지 않는다(정책은 여전히 `TB_MDM_RULE_VER.HIT_POLICY` 버전 속성이고 새 버전은 직전 RELEASED 의 정책을 복사한다)
- **Rationale**: 사용자 판단(2026-10-01 "룰 화면의 적중 정책이 왜 룰에 있나? 룰 편집 화면에 있어야 한다"). D-105 (4) 의 근거는 "버전마다 복제되는 버전 속성인데 내용 화면에서만 고칠 수 있는 비대칭"이었지만, 정책은 저장 위치가 버전 행일 뿐 뜻은 표의 해석 규칙이다 — 행·열과 함께 검사돼야 하고(UNIQUE 겹침 등), 값 테스트(편집본)도 이미 편집 중인 정책을 입력으로 썼다. 표 저장에 묶으면 "정책만 바뀌고 표는 그 정책에 안 맞는" 상태가 저장될 틈이 없어 D-105 때 그 틈을 막으려고 둔 별도 재검사(STORED)가 필요 없고, 저장 버튼이 하나라 사용자가 둘을 따로 저장할 일이 없다. 다른 이름의 액션을 만들지 않으므로 RBAC 어휘도 그대로다
- **Reversible**: yes(화면·서비스 이동만, DDL·엔진·스냅샷 변경 없음. 되돌리려면 `RuleVersionService.saveHitPolicy`·`ruleMng save target VERSION` 과 ② 버전 카드의 Select 를 되살리고 표 저장의 `hitPolicy` 를 빼면 된다 — 이 결정의 커밋을 revert 하면 된다. 단 COLLECT 밖으로 바꾼 버전에서 비운 기본 집계 LIST 는 뜻이 같아 되돌릴 필요가 없다)
- **Source**: 사용자 판단 2026-10-01. 영향: `RuleTableService`(정책 저장·열 설정 어긋남 검사·기본 집계 비우기), `RuleEditSaveRequest`·`RuleEditService`, `RuleMngService`·`RuleVersionService`·`RuleMngSaveRequest`·`RuleMngSaveResult`, `RuleNativeWrites.clearDefaultCollectAgg`, `RuleSaveIssueCode`(AGG_COLLECT·PRIO_PRIORITY·GRP_POLICY), BPMN `ruleEdit`·`ruleMng` 문서, 화면 `DecisionTableCard`·`table-state`·`column-draft.hitPolicyColumnConflicts`·`RuleDetailPanel`, e2e `mdm-ruleMng.spec.ts` H3·`mdm-ruleEdit.spec.ts` S6·V6, 기능설계서 `screens/ruleMng`·`screens/ruleEdit`

## D-134 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 — 예외 받는 노드 CATCH)
- **Decision needed**: 룰이 실패하거나 결과가 없을 때 흐름 안에서 처리하는 방법(스펙 `2026-10-01-rule-set-flow-catch-design.md` §11, 사용자 요청 "룰에 대한 exception이 없어 exception 노드가 필요해", "처리 결과가 없으면 끝으로 가던지 아니면 다른 처리를 하게 하던지")
- **Decision made**: X-D1 받는 노드(CATCH)는 RULE 에 붙이고 세트 전체 처리기는 두지 않는다 · X-D2 받는 종류는 결과 없음(NO_RESULT)·입력 오류(INPUT_ERROR = MISSING_KEY·REQUIRED_NULL·TYPE_CONVERSION)·계산 오류(EVAL_ERROR = EVALUATION_ERROR)·판정 충돌(HIT_CONFLICT = UNIQUE_MULTIPLE_HITS·ANY_CONFLICT) 넷이고 정의·설정 오류(RULE_NOT_FOUND·SET_NOT_FOUND·SET_DEPRECATED·FLOW_INVALID·CONSTANT_KEY·RESERVED_KEY·EVAL_TS_KEY·BRANCH_EVAL_ERROR·EDIT_POINT_MISMATCH)는 받지 않는다 · X-D3 결과 없음은 그 종류를 받는 노드가 있을 때만 exception 이고 없으면 지금처럼 NULL 결과로 진행한다 · X-D4 RULE 과 CATCH 는 선이 아니라 `attachTo` 로 잇는다(BPMN attachedToRef) · X-D5 돌아오는 MERGE 의 `splitId` 는 그 RULE 노드 ID 다 · X-D6 처리 갈래는 맨 바깥 순차에서만 END 로 간다 · X-D7 FLOW_JSON `version` 은 1 그대로다 · X-D8 처리 갈래가 읽는 값은 예약 이름 `CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG`(레코드 키로 오면 RESERVED_KEY, 세트 실행과 룰 하나 실행 모두 `RecordKeys.check` 를 공유한다) · X-D9 INPUT_ERROR 를 받는 룰의 입력은 사전 검사에서 빼고 실행 직전에 본다 · X-D10 `RuleSetResult`·`RunTrace` 에 `endedBy`, `RuleSetResult` 에 `caught`, 노드 상태 `CAUGHT` · X-D11 병렬 갈래 안에서 끝내면 남은 형제 갈래는 실행하지 않는다 · X-D12 받는 노드는 팔레트에 두지 않고 룰의 "예외" 연결점·우클릭 「예외 받기 추가」로만 만든다. 구현 세부(계획 Rulings R1~R19): CATCH 기록에 실패한 룰 ID, CAUGHT 룰 기록에 result 없음, CATCH 노드는 고친 값 뒤 CATCH_* 넣기, 돌아오는 합류는 룰 직전 CATCH_* 로 되돌림(중첩이면 바깥 값), 받는 노드 위치는 저장하지 않고 룰 테두리에 계산, 받는 노드가 든 분기 블록 복사 거부, 받는 노드가 있는 흐름에는 구성 지침을 적용하지 않음(R19)
- **Rationale**: 세트 전체 처리기는 끝내기만 할 수 있어 "결과 없으면 기본값 채우고 계속"을 그릴 수 없다. RULE + 처리 갈래 + MERGE 는 IF 블록과 같은 모양이라 교집합 규칙·노드 관계를 그대로 쓴다. 정의 오류를 흐름에서 처리하면 설정 실수가 감춰진다. 받는 노드 없는 세트의 동작·기록·저장 글자는 그대로다(기존 골든·코퍼스·퍼즈 무변경으로 확인). ADR-0005 Consequences 의 "흐름 안에 DB 저장·외부 호출·메시지 발행 노드가 없다"는 그대로 유효하다 — CATCH 는 판정 흐름 안의 분기이고 저장·호출을 하지 않는다
- **Reversible**: no(FLOW_JSON 에 CATCH 노드가 저장되고 엔진 계약이 늘었다)
- **Source**: 스펙 `docs/superpowers/specs/2026-10-01-rule-set-flow-catch-design.md` §11, 계획 `docs/superpowers/plans/2026-10-01-rule-set-flow-catch.md`(편차 F1~F9·Rulings R1~R19), 사용자 요청. 영향: 엔진 계약(NodeKind·FlowNode·CatchKind·RuleSetResult·RunTrace·NodeStatus·ReservedNames), 서버 검사(FLOW_CATCH·CATCH_NEVER·RuleIo.hasDefault), execute 응답(endedBy·caught), 화면 편집기·디버거, e2e E16. 뒤 스펙 `2026-10-01-rule-set-flow-subset-call-design.md` 가 attachTo 를 SET 노드로 넓힌다. 병합 커밋: Task 1 3f7da066, Task 2 74528c3a, Task 3 6c433334, Task 4 8477b5a6, Task 5 55372ba9, Task 6 c9bc4832, Task 7 e34189eb, Task 8 40c40bf2, Task 9 36eecd60, Task 10 393f27f3, Task 11 b342950c

## D-135 (2026-10-06T00:00:00Z)
- **Phase**: plan·implement(룰 세트 흐름도 — 하위 세트 호출(SET 노드)·편집 화면 안 세트 탭, 사용자가 방향을 승인하고 세부 판단을 맡김. 2026-10-01 스펙 초판, 2026-10-06 판이 정본)
- **Decision needed**: 룰 세트에서 다른 룰 세트를 부르는 방법과, 여러 세트를 한 편집 화면 안에서 함께 여는 방법(사용자 요청 "룰 세트에서 또 다른 룰 세트를 호출하게 하려면", "룰세트 편집 안에 여러개의 탭"). 2026-10-06 착수 전에 구현을 몇 레인으로 나눌지, 하위 세트 수정이 부르는 세트를 깨는 것을 어느 자리에서 막을지, cactus 저장 검증의 미리 받기를 어떻게 할지도 정해야 했다
- **Decision made**: C-D1 하위 세트는 블랙박스 `SET` 노드(입력은 하위 입력, 출력은 최종 결과만, 이름은 그대로 주고받는다) · C-D2 하위 세트는 판정 시각에 유효한 RELEASED 버전, 폐기 아닌 세트만(하위 세트 버전을 부모에 박지 않고 ID 만 참조) · C-D3 `TB_MDM_RULE_SET_VER.CALL_SET_IDS`(버전 행, 서버가 흐름에서 계산, V23), `RULE_IDS` 는 자기 RULE 노드만 · C-D4 겉모양(`SetCallIo`)은 서버만 계산하고 화면은 받아서 검사에 넣는다 · C-D5 출력마다 `always`, 일부 경로 출력은 `maybe`(`FLOW_PARTIAL`) · C-D6 하위 세트의 처리되지 않은 위반은 SET 노드에서 같은 종류로 받고, 받지 않는 코드는 중단 · C-D7 예약 이름 `CATCH_SET`(`ReservedNames.CATCH_NAMES` 가 다섯) · C-D8 하위 세트의 처리 갈래 끝냄은 opt-in 종류 `SUBSET_ENDED`(받는 노드가 없으면 정상 완료) · C-D9 `caught` 는 `setPath` 를 붙여 최상위까지 이어 붙이고 `endedBy` 는 자기 세트만 · C-D10 순환·깊이 5 초과는 확정·되살리기 때 거부, DRAFT 저장 때 경고(`CALL_CYCLE`·`CALL_DEPTH`), 실행 때 `SET_CALL_CYCLE`·`SET_CALL_DEPTH`(최상위에서 5 단계까지 허용, 6 단계째 거부, 상수 `SetShape.MAX_CALL_DEPTH = 5`) · C-D11 겉모양이 바뀌는 확정(세트·룰, 기준 apply_from)은 부르는 세트를 연쇄 재검사해 새 거부는 막고(`CALLER_BROKEN`·`SET_CALLER_BROKEN`) DRAFT 저장은 같은 계산을 지금 기준으로 돌려 경고만 하며 새 경고는 알린다(`CALLER_WARN`) · C-D12 부르는 INUSE 세트가 있으면 폐기 거부 · C-D13 편집 화면 안 세트 탭(최대 8), SET 링크는 같은 화면의 새 탭 · C-D14 탭마다 세트 상태·되돌리기·디버거를 따로, 보는 사람 설정은 함께 · C-D15 디버거 "안으로 들어가기"는 같은 캔버스에서 경로 표시로 오가고 탭을 열지 않는다 · C-D16 흐름 `version` 1 유지 · C-D17 cactus 저장 검증 미리 받기가 하위 세트를 깊이 5 까지 재귀로 받는다 · C-D18 디버거 경고 "하위 세트 S 에 확정하지 않은 변경이 있다. 실행은 판정 시각의 RELEASED 로 한다." · C-D19 SET 은 D-136 모델의 단계(들어오는 선 1 이상, 처리 갈래는 돌아오는 자리로, `catchable` RULE·TASK·SET, 블록은 `SetStep` 을 `Guarded.step` 이 받는다, 하위 세트의 끝내는 IF 갈래 끝은 부모에 정상 완료). 사용자 결정(2026-10-06 착수 전, 조정 회차 rule-set-subset-call-2026-10-06): U1 구현을 레인 3개(엔진 eng·서버 srv·화면 ui)로 나눈다 · U2 연쇄 재검사는 확정 검사(`RuleSetConfirmCheck`·`RuleConfirmCheck`)에서 거부하고 DRAFT 저장 때는 경고만 한다(C-D10·C-D11 을 "저장 때 거부" 에서 바꿈) · U3 cactus 모듈 저장 검증의 미리 받기가 하위 세트를 재귀로 받는다(깊이 5, C-D17). 아래 네 가지는 이 결정의 변경점이라 따로 적는다. (1) **I14 변경** — 룰 세트 폐기 검사 I14 는 이제 "폐기는 경로 검사를 돌리지 않고, 지금 이후 유효한 RELEASED 버전이 이 세트를 부르는 폐기하지 않은 세트가 있으면 거부한다"(C-D12, 부르는 쪽은 `CALL_SET_IDS` 로 찾는다)이다. 되살리기는 그 세트 자신의 검사와 호출 그래프 검사(`CALL_MISSING`·`CALL_CYCLE`·`CALL_DEPTH`)를 지금 기준으로 돌리고 네 코드를 거부로 본다 (2) **확정 검사 변경** — `RuleSetConfirmChecks`·`RuleConfirmChecks` 와 되살리기 검사가 네 코드 `CALL_MISSING`·`CALL_CYCLE`·`CALL_DEPTH`·`CALLER_BROKEN`(룰 쪽은 `SET_CALLER_BROKEN`)을 수준과 상관없이 거부로 보고(`RuleSetCheck` 의 네 코드 모음 상수), 세트·룰 확정은 겉모양이 바뀌면 `CALL_SET_IDS` 에 이 세트를 담은 폐기하지 않은 부모의 RELEASED 버전(적용 시작 이후 유효한 것)을 연쇄로(룰 → 세트 → 부모 → …, 깊이 상한 5 안) 다시 검사해 새 거부가 생기면 확정을 막는다. 새 경고는 막지 않고 목록으로 알린다. 공용 계산은 `SetCallerRecheck` 한 곳이다. 분석기는 `CALL_MISSING` 을 WARN 으로 내고(두 벌 모두, 코퍼스 기대 WARN) 확정·되살리기가 거부로 본다. DRAFT 저장은 네 코드를 경고로 돌려주고 저장은 막지 않으며, 다른 흐름 거부(구조·`FLOW_CATCH` 등)는 지금처럼 막는다. 룰 DRAFT 저장도 `SET_CALLER_BROKEN` 경고만 낸다. 순환의 동시 수정(두 DRAFT 가 서로를 부름)은 각자 저장 경고로 통과하고 나중에 확정하는 쪽이 `CALL_CYCLE` 로 막히며, 실행 때 두 오류 코드가 남는 안전장치다 (3) **cactus 재귀** — 업무 모듈 저장 검증의 미리 받기(`MdmValidator.prefetchSubsets`)가 단계마다 아직 받지 않은 하위 세트 ID 를 묶어 받고 `SetShape.MAX_CALL_DEPTH`(5) 단계까지 되풀이한다(최상위 + 5 단계 = 세트 6개, 엔진 `chain.size() > 5` 거부와 같은 경계). 순환은 최상위 세트마다 `seen` 으로 막고 하위의 룰·코드·마스터 참조는 부른 최상위 항목에 모은다. 하위 세트 unavailable 이면 부른 최상위 항목만 검증 불가로 건너뛰고, 하위 세트가 없거나 적용 버전이 없으면 빼지 않는다(엔진이 `SET_NOT_FOUND` 행 오류를 낸다) (4) **D-136 위 SET 규칙(C-D19)** — 이 결정은 합류 노드가 없는 D-136 모델 위에 SET 을 단계로 더한다. 그래서 RULE·TASK 와 같이 들어오는 선은 1 이상(모이는 자리만 2 이상)이고, 받는 노드는 SET 에도 붙으며(SET 은 `SUBSET_ENDED` 를 받을 수 있고 `NO_RESULT` 는 없다, RULE·TASK 는 `SUBSET_ENDED` 가 없다), 옛 형식의 돌아오는 MERGE 의 `splitId` 가 SET 노드이면 구조 오류다. 하위 세트가 끝내는 IF 갈래로 끝나면 부모에게는 정상 완료이고(`endedBy` 없음), 하위 세트가 자기 처리 갈래로 끝나면 부모는 `SUBSET_ENDED` 받는 노드가 있을 때만 예외로 본다. 구현 편차(계획 `docs/superpowers/plans/2026-10-01-rule-set-flow-subset-call.md`, 진행 기록 `docs/rule-set-subset/progress-eng.md` 가 정본): 새 조회는 action 이 아니라 `search` 의 `target` `CALL_IO`·`CALLERS`(ADR-0003 권한 어휘), 룰 쪽 거부는 확정 검사(`RuleConfirmChecks`)가, V23 은 VER 표만 `_BAK` 방식으로 다시 만든다, 분석기는 `CALL_MISSING` 을 WARN 으로 내고 확정·되살리기가 네 코드를 거부로 본다, 하위 세트는 준비 단계에서 읽고 판정한다(룰 없음과 같은 시점), 엔진은 실행용 겉모양 `SetShape` 을 같은 알고리즘으로 스스로 계산하고 서버 `RuleSetInterface` 와 `SetCallIoEngineAgreementTest` 로 맞춘다, 하위 세트 입력에서 `CATCH_*` 다섯 이름을 뺀다, `SetCallIo` 에 `setName`·`endsEarly` 를 더한다, 세트 탭 틀은 shared 새 컴포넌트 `closable-tabs`(숨은 패널 `display:none`)이고 세트 고르기는 탭 틀의 위 바가 아니라 편집기 안에 둔다, eng 레인의 계획 조정 — `CallStep`·`callSteps()` 를 만들지 않고 `SetStep`·`FlowTree.setSteps()/setIds()` 로 대신하고(분석기가 steps 를 거른다), `IN_DEGREE.SET = AT_LEAST_ONE`(RULE·TASK 와 같음), 하위 세트 조회는 `ruleSet(id, ts)`, 엔진은 최상위 세트 ID 마다 `PreparedSet` 준비 캐시를 기억해 하위 세트·룰 정의 객체가 모두 같을 때만 쓴다(벤치: SET 없는 세트의 적중 경로 비용 변화 없음), `SetShape` 는 `public final class`(상수 `MAX_CALL_DEPTH` 를 cactus 가 같이 쓰게). 엔진 계약 문서 `docs/mdm/engine-contract.md` 는 §3·§6·§8 에 이 결정을 반영했다
- **Rationale**: 분석기가 SET 을 RULE 처럼 보면 기존 경로 검사가 그대로 돈다. 중간 결과를 숨기면 이름 충돌이 줄어든다. 실행은 판정 시각의 RELEASED 만 쓰므로(D-144) 하위 세트 수정이 부모 동작을 바꾸는 때는 확정이고, 그래서 거부는 확정 검사가 지킨다. DRAFT 저장은 아직 실행에 닿지 않는 편집 중간 상태라 막지 않고 경고로 알린다(U2). 같은 화면 안 탭이라 저장 알림으로 부모 탭 검사를 바로 갱신할 수 있다. 평가 중 캐시 부재가 검증 불가로 잡히지 않게 cactus 미리 받기가 하위 세트까지 받고, 깊이 상한은 엔진·서버와 같은 한 상수를 쓴다. ADR-0005 의 원칙(엔진이 흐름을 실행하고 DB 를 부르지 않음, 흐름 안에 저장·외부 호출 노드 없음)은 그대로 유효하다 — SET 노드는 판정 흐름을 부르는 것이고 하위 세트도 `DefinitionLookup.ruleSet` 으로 받는다
- **Reversible**: no(흐름 JSON 에 SET 노드, 버전 행에 CALL_SET_IDS 가 저장된다)
- **Source**: 스펙 `docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md` §13(2026-10-06 판), 계획 `docs/superpowers/plans/2026-10-01-rule-set-flow-subset-call.md` Task 10·편차, 진행 기록 `docs/rule-set-subset/progress-eng.md`, 사용자 요청과 착수 전 결정 U1~U3. 영향: 엔진 계약(`NodeKind.SET`·`FlowNode.setId`·`CatchKind.SUBSET_ENDED`·오류 코드 `SET_CALL_CYCLE`·`SET_CALL_DEPTH`(단계 `SET_CHECK`)·`Violation.setPath`·`RuleSetResult.calls`/`SetCall`·`PathStep.callIndex`·`CaughtException.setPath`·`NodeTrace.outputs`/`sub`·`ReservedNames.CATCH_SET`/`CATCH_NAMES` 다섯·`SetShape.MAX_CALL_DEPTH`), DB V23, cactus 미리 받기, `ruleSetEdit` search target 둘·view `calls`·execute `calledFlows`, 세트·룰 확정 검사와 DRAFT 저장 경고, 화면 탭(shared 새 컴포넌트)·SET 노드·디버거. 병합 커밋: eng 레인 `8192debe`(eng:1·eng:2 — 엔진 계약·흐름 구조), `3efb56fe`(eng:4 — 엔진 실행), `b55d4b2a`(eng:c — cactus 미리 받기 재귀), srv 레인 `2b638315`(srv:3 — V23 `CALL_SET_IDS`), `f6f744d7`(srv:5 + ui:5t — 분석기·TS 해석기의 SET 단계), `c55bb430`·`bd482996`(srv:6 — 그래프·읽기기·확정 검사·서비스·연쇄 재검사·샘플), ui 레인 `00a6b181`(ui:7 — 세트 탭과 shared `closable-tabs`), `537a1d52`(ui:8 SET 노드 화면 + ui:9 디버거 안으로 들어가기), `e98b3db6`(화면 문서 — 기능설계서·FE 가이드 §36·§37). **조정자 대조 끝(2026-10-06)**: 위 (1) I14 변경·(2) 확정 검사 변경의 서버 부분과 C-D13·C-D14·C-D15·C-D18·구현 편차의 편집 화면·SET 노드·디버거·기능설계서 항목을 srv:6·ui:8·ui:9 머지 뒤 dev 코드·레인 기록(`docs/rule-set-subset/progress-srv.md`·`progress-ui.md`)과 맞춰 보았다. 레인 진행 중 조정자가 정한 결정은 다음과 같다. (a) 확정 보고 항목 키 `CALLER_WARN`·`CALLER_BROKEN` 은 `SET:<setId>` 다(`RuleSetConfirmReport`). 화면 응답(view·save·restore·delete·search)에는 이 키가 없고 확정 화면(`ruleSetConfirm`) 몫이다. (b) 폐기 룰 경고는 하위 세트까지 넓혔다. 하위 세트는 실제로 실행한 `calls` 의 판정 시각 버전 룰만 보고, 최상위는 탄 갈래와 상관없이 보며, 디버거 simulate 는 최상위만 본다 — 이 비대칭을 알고 유지한다. (c) 연쇄 재검사 문구 머리는 부르는 쪽 유효 행이 하나면 "세트 P: …", 여럿(지금 + 미래 RELEASED)일 때만 "세트 P v1.001: …" 다. (d) `search` `CALLERS` 는 자기 자신을 부르는 행을 뺀다. (e) 포털 파라미터로 세트를 열면 빈 탭 하나뿐일 때만 그 탭에서, 아니면 새 탭에서 연다(스펙 §10.3, 기존 시험 기대를 바꿨다). (f) 편집 흐름의 `setId` 는 SET 노드에만 싣는다. (g) srv:5 의 RULE·SET 단계 모으기는 `FlowTree.callSteps()` 없이 분석기 안에서 거른다(위 eng 계획 조정의 `CallStep` 미작성과 같은 선택). (h) `RuleConfirmQueryCountTest` 의 validate 쿼리 상한이 36 에서 37 이 됐다(SET 호출자 검사 `RuleSetCallerCheck` 의 세트 목록 1쿼리, 변수 수와 무관). 그 밖에 srv:6 이 정한 것: 겉모양·부르는 쪽 읽기는 모두 기준 시각 `at` 을 받는 `SetCallIoReader` 한 곳이고 부르는 쪽은 폐기하지 않은 부모의 그 시각 이후 유효한 RELEASED 행뿐이며, 되살리기는 `asReject`·DRAFT 저장은 `asWarn` 으로 네 코드를 다룬다. 샘플 `SHIP_PLAN`(SET 노드 시연 세트)과 e2e 고정 데이터 `E2S_SUBA·SUBB·SUBP`(E19)를 더했고, 화면은 SET 을 RULE·TASK 와 같은 단계로 다루되 외관(색·아이콘)은 열지 않았으며 구성 지침은 SET 노드가 있는 흐름에 적용하지 않는다. **후속(미룬 것)**: ① 엔진·서버 겉모양 차이 4건 — `SetShape.inputs` 에 처리 갈래 `CATCH_*` 가 남음(`SetCallIoEngineAgreementTest` 가 빼고 견줌), `FlowKeys.needed` 에 DECISION Expression 결과 셀 이름이 빠짐, 식 이름 대소문자, DERIVE 이름 순서. 판정 결과는 같고 시험으로 현재 동작을 고정했다. ② `progress-srv.md` 의 낮은 지적 5건(`SetCallIoReader` memo 의 깊이 방어 경계, `SetCallerRecheck` 의 저장된 순환·마지막 단계 부르는 쪽 미수집, MDM010 시험의 쓸모없는 분기, 폐기 룰 경고 비대칭 기록, 시험의 `CATCH_*` 필터 제거) — 순환·깊이 초과 같은 그래프 검사가 막는 데이터에서만 나타난다. ③ 확정 취소 때 연쇄 재검사(스펙 §14). ④ m-mdm `tests/dma/domainMng/page-render.test.ts` 의 간헐 실패(타이밍, 이 결정과 무관, 단독 재실행에서 통과·실패가 갈림). ⑤ SET 노드 설명(`view.descs`)은 열지 않았다(`DESC_KINDS` 에 SET 없음, 스펙 §9 와 같은 판단). ⑥ 확정 화면(`ruleSetConfirm`) 쪽 `SET:<setId>` 항목 표시와 e2e E19 실행·브라우저 확인(SET 노드 굵은 테두리·세트 검색 팝업 잘림)은 조정 세션 확인 대기. 엔진 몫(`8192debe`·`3efb56fe`·`b55d4b2a` 이 반영한 엔진 계약·cactus 재귀·`CATCH_SET`·`SUBSET_ENDED`)은 실제 코드 대조를 마쳤다

## D-136 (2026-10-02T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 — IF·예외 합류 노드 없애기, 모이는 자리 계산)
- **Decision needed**: IF 와 받는 노드의 합류(MERGE) 노드를 계속 둘지, 갈래가 다음 노드로 바로 모이게 할지(스펙 `2026-10-02-rule-set-flow-implicit-join-design.md` §0, 사용자 승인 A1~A6·B1·B2)
- **Decision made**: J-D1 MERGE 는 병렬에만 두고 같은 크기의 속 빈 막대로 그린다(2026-10-02 사용자 요청으로 이중선에서 바꿈) · J-D2 IF 의 모이는 자리는 실행 순서 첫 이어지는 갈래 줄기 기준 첫 공통 노드이고 블록 트리를 만들다 그 IF 에 닿을 때 계산한다 · J-D3 처리 갈래는 정상 줄기 위 노드로 바로 돌아오고 한 노드의 돌아오는 갈래는 같은 노드로 간다, END 는 끝냄, CATCH_* 는 블록 끝에서 뺀다 · J-D4 받는 노드를 빈 단계(TASK)에도 붙이고 TASK 인 동안 받는 노드마다 CATCH_NEVER 경고 · J-D5 엔진·TS 해석기는 옛 형식을 받고 편집기는 열 때 바꾼다 · J-D6 "들어오는 선 2개 이상은 모이는 자리만" 을 따로 검사하지 않는다 · J-D7 새 형식 IF 는 같은 도착 갈래 선을 하나만 둔다(f4, 빈 갈래 하나) · J-D8 돌아오는 자리는 둘러싼 끝이어도 된다 · J-D9 IF 갈래 중간 끝내기(끝내는 갈래 = 다른 갈래와 노드를 함께 지나지 않고 END 로 가는 갈래)를 허용하고 받는 노드 X-D6 을 없앤다 · J-D10 정상 다음 노드가 END 인 노드에는 돌아올 자리가 없고 변환은 END 로 바로 나가는 옛 합류를 빈 단계로 바꾼다 · J-D11 블록 트리에 Step(RULE·TASK)·Guarded.step·Split/Guarded.joinId · J-D12 변환은 toEditFlow 안에서 하고 열기만 해서는 dirty 가 아니다 · J-D13 IF 지우기·접기·복사·옮기기는 끝내는 갈래 몸을 블록에 넣고, 끝내는 갈래만 남기기와 끝내는 갈래가 있는 IF 의 병렬 바꾸기는 거부 · J-D14 접힌 IF 의 대표 선은 그리기 전용 · J-D15 version 1 유지 · J-D16 문구 "모이는 자리 밖에서"·S7·S8·f4 · J-D17 끝내는 IF 갈래로 끝난 실행은 정상 완료(endedBy 없음, 계약 칸 없음) · J-D18 처리 갈래 안 IF 끝냄의 endedBy 는 가장 안쪽 처리 갈래의 받는 노드, 병렬 갈래 안 IF 끝냄은 남은 형제를 돌리지 않는다 · J-D19 모든 갈래가 따로 END 로 가면 실행 순서 마지막의 END 직행 아닌 갈래가 이어진다. 편집기는 END 앞에 IF 를 끼울 때 모이는 자리 빈 단계를 하나 더 둔다(IF→갈래 1 빈 단계→모이는 자리, IF→모이는 자리(그 외), 모이는 자리→END). 받는 노드 결정 D-134 의 X-D5(돌아오는 MERGE 의 splitId = 룰 노드 ID)·X-D6(처리 갈래 안 IF 갈래 END 금지)은 이 결정으로 바뀐다. 구현 세부(계획 Rulings R1~R21): 코퍼스 사례 26개(N25 S9 셋째 문구, N26 바깥 새 형식 IF 의 S6), 끝냄 신호 Ended(null), TASK 블록은 입력 키 검사 뒤 기록, 조각 꼬리·끝 선은 선 ID 목록, 열기 알림 문구, 끝낸 갈래 표시 문구, 받는 노드 패널의 「붙은 노드」·TASK 경고 줄, 접기 대표 선 fold:{분기}
- **Rationale**: IF 합류는 실행 의미가 없는 이음 노드라 그림만 복잡하게 했고, 병렬 합류만 "모두 기다려 합침" 의미가 있다. 모이는 자리·돌아오는 자리를 그래프에서 계산하면 Java·TS 가 같은 알고리즘으로 같은 블록 트리를 만들고(코퍼스·퍼즈가 고정), 옛 형식 세트도 같은 블록 트리로 돌아 결과가 바뀌지 않는다(변환 동치 시험). 끝내는 갈래는 "조건이면 끝내고 그 외는 계속" 을 합류 없이 그리게 한다
- **Reversible**: no(편집기가 새 형식으로 저장하므로 저장된 세트가 합류 없는 흐름이 된다. 엔진은 두 형식을 모두 받는다)
- **Source**: 스펙 `docs/superpowers/specs/2026-10-02-rule-set-flow-implicit-join-design.md`(J-D1~J-D19), 계획 `docs/superpowers/plans/2026-10-02-rule-set-flow-implicit-join.md`(편차 F1~F9·Rulings R1~R21), 사용자 승인(팀장 전달 2026-10-02). 영향: 엔진 흐름 해석·실행(FlowParser·FlowRun·FlowKeys), 서버 검사(RuleSetAnalyzer·RuleSetPathState·RuleSetOrderCheck), 코퍼스·퍼즈, 화면 편집기·배치·캔버스·디버거, e2e E3·E11·E13·E14·E15·E17·E18. 병합 커밋: Task 1 c65da803(ed4953c3 포함), Task 2 92cb2c95, Task 3 af5793c6, Task 4 b276b124, Task 5 e97f1ccd, Task 6 4d03fe67, Task 7 4f07545c, Task 8 906d975c, Task 9 5fbfb7de

## D-137 (2026-10-02T01:10:00Z)
- **Phase**: data(용어 사전 교체 — 표준용어.xls·용어집.xlsx 병합, KURE-v1 임베딩)
- **Decision needed**: 사용자 요청 "기존 용어를 바꾸자 — 표준용어.xls·용어집.xlsx 와 MDM 테이블·컬럼에서 추출한 용어를 넣고 KURE 로 임베딩" 을 지우고 다시 넣기로 할지, 기존 용어를 살린 병합으로 할지. 엑셀 칸을 어디에 둘지, 약어 충돌과 같은 이름 여러 뜻을 어떻게 처리할지
- **Decision made**: S-D1 지우지 않고 TERM_ID 를 유지한 병합이다. 컬럼 7,826개가 TERM_IDS 로 기존 용어 1,440개를 참조하므로, 이 용어들을 "MDM 컬럼에서 추출한 용어" 로 보고 그 위에 두 파일을 합친다 · S-D2 용어집이 정의의 정본이다. 이름이 같은 기존 용어의 정의·영문명을 용어집 값으로 덮고 옛 값은 `docs/mdm/dict-std/changes.json` 에 남긴다. 용어(변경전)은 SYNONYMS(신규·자기 자신 제외) · S-D3 표준용어는 정의가 없어 DEFINITION 이 '' 다. 영문명·약어는 비어 있을 때만 채우고 영문명 'Required' 1,428행은 자리표시라 넣지 않는다 · S-D4 약어 충돌은 그 용어를 참조하는 컬럼 물리명에 어느 약어가 더 많이 나오는지로 정한다(기존 유지 369, 표준용어로 교체 9: 계획·길이·비중·온도·품질·지시·출하·폭·표면) · S-D5 같은 이름 안에서 용어집은 정의가 다르면, 표준용어는 영문명이 다르면(유사도 0.85 미만) 다른 뜻(SENSE_NO)이다. 용어집 묶음이 여럿이면 기존 정의와 가장 비슷한 묶음을 기존 뜻에 합친다. 용어집과 이름이 같은 기존 용어 44건은 정의를 직접 보고 판정해 보급·분기·분류·클래스·확정·액티비티·차원·PI·조건·예약 10건을 새 뜻으로 넣었다. 대소문자만 다른 표기(Mo↔MO)는 영문명이 비슷할 때만 합친다 · S-D6 엑셀 칸은 하나도 버리지 않는다. 전용 칼럼이 없는 no.·용어구분·부문·등록일과 기존 값에 밀린 영문명·약어는 행마다 모든 칸을 적은 근거 줄(STD_BASIS)에 남기고, 적재 끝에 엑셀 칸 값 대조(누락 0)를 통과해야 커밋한다 · S-D7 임베딩 입력은 term-embedding.md §2(D-025) 형식이다(정의·영문명이 비면 그 부분을 뺀다). 서버 `TermMngService.buildEncodingInput` 이 빈 칸도 이어 붙여(`표기:  ()`) D-025 와 달랐으므로 서버를 문서대로 고쳤다(`TermEncodingInputTest` 4건, 관련 시험 36건 통과). 정의 없는 표준용어 6천여 건에 빈 괄호 잡음이 들어가지 않고, 표기만으로 하는 질의도 문서대로 표기만 쓴다 · S-D8 컬럼이 참조하지 않고 엑셀에도 없는 기존 용어 28개는 지우지 않고 사용자 확인을 기다린다(삭제는 확인 대상)
- **Rationale**: 지우고 다시 넣으면 컬럼 사전 7,826행의 용어 연결이 모두 끊긴다. 약어는 실제 물리명 근거가 393:9 로 기존 쪽이 압도적이라 표준용어 약어로 일괄 교체하면 컬럼 명명 검증이 깨진다. 근거 줄은 여러 엑셀 행이 용어 하나로 합쳐져도 원본 값을 되찾을 수 있게 한다
- **Reversible**: yes(적재 전 백업 `src/backend/data/mdm.db.bak-20261002-100959-dictstd`(첫 적재의 잘못 합침을 고치려고 용어 테이블을 이 백업으로 되돌린 뒤 다시 적재했다), 스크립트는 다시 돌려도 결과가 같다)
- **Source**: `docs/mdm/dict-std/`(apply_dict_std.py·embed_terms.py·changes.json·last-run.txt·README.md), 원천 `~/Downloads/표준용어.xls`(GlueMaster export 7,080행), `~/Downloads/NAVERWORKS/용어집.xlsx`(570행)

## D-138 (2026-10-02T10:30:00Z)
- **Phase**: refactor(룰 세트 흐름도 — 그룹 색상)
- **Decision needed**: 노드 외관 스펙(S-D9·제외 목록)이 그룹을 외관 대상에서 뺐는데, 사용자가 "그룹도 색상 지정되게 해줘" 를 요청했다. 색만 열지, 저장 형식과 다중 선택을 어떻게 할지
- **Decision made**: (1) 그룹은 **색만** 칠한다. 노드와 같은 색 목록·같은 우클릭 「색상」 격자를 쓰고 「기본」 은 색을 지운다. 아이콘·모양·크기 칸 같은 다른 외관은 그룹에 두지 않는다 (2) 저장은 `FlowView.groups[].color`(키 순서 id·title·nodeIds·pad·color). 색이 없으면 키를 두지 않아 예전 그룹의 저장 글자·dirty 비교가 그대로다. 불러올 때 목록 밖 값은 버린다 (3) 다중 선택은 노드 C4 와 같다. 우클릭한 그룹이 선택 안이고 선택된 그룹이 둘 이상이면 그 그룹 전부, 아니면 그 그룹 하나를 칠한다. 노드 색과 그룹 색은 서로를 칠하지 않는다 (4) 그리기는 노드와 같은 색 토큰(`--rsf-c-{색}-bg`·`-border`)으로 그룹 배경·테두리를 바꾸고, 고른 그룹의 선택 테두리가 우선한다 (5) 그룹 크기(pad)를 바꿀 때 색이 지워지던 결함을 함께 고친다. 보기·디버그 모드에서는 색만 보이고 바꿀 수 없다
- **Rationale**: 사용자 요청. 노드와 같은 조작·같은 색이라 새로 배울 것이 없고, 선택적 키라 기존 세트의 저장 글자가 바뀌지 않는다. 서버는 view 를 받은 그대로 저장하고(`RuleSetFlowJson.canonical`) `view.groups` 를 검사하지 않아 백엔드 변경이 없다
- **Reversible**: yes(view 의 선택적 키 하나. 되돌리면 색 키가 있는 세트를 열 때 정규화가 버린다)
- **Source**: 사용자 요청 2026-10-02. 스펙 `docs/superpowers/specs/2026-10-01-rule-set-flow-node-style-design.md` S-D13. 영향: `flow-edit.ts`(FlowGroup.color·setGroupsColor·setGroupPad), `node-style.ts`(paintedColor), `canvas/menus/edit-menu.ts`·`context-menu.ts`·`FlowCanvas.tsx`·`nodes.tsx`, `styles/base.ts`, `page.tsx`, 시험 `group-color.test.ts`

## D-139 (2026-10-02T02:40:00Z)
- **Phase**: fix(용어관리 유사어 1차 추천 — 부분 일치 점수)
- **Decision needed**: 1차(문자열) 추천의 양방향 부분 일치 점수가 고정 `0.9` 라, 한 글자 용어("명"·"량"·"시")가 그 글자를 담은 모든 질의에 0.90 으로 올라온다(사용자 지적, "명령" 질의에 "명" 0.90). 어떻게 고칠지
- **Decision made**: 부분 일치 가점은 짧은 쪽이 2자 이상일 때만 주고, 점수는 `0.7 + 0.2 × 짧은 쪽 길이 ÷ 긴 쪽 길이` 다. 질의어나 비교 대상 중 한 글자인 쪽은 정확 일치일 때만 후보다(편집 거리로는 "명령"↔"명" 이 1 − 1/2 = 0.5 라 컷오프에 걸리기 때문). 정확 일치 1.0·0.5 컷오프(I18)·상위 5건은 그대로 둔다
- **Rationale**: 0.5 컷오프는 I18 불변 규칙이라 건드리지 않고 문제를 만든 부분 일치 가점만 고친다. 길이 비율을 넣으면 "명령"→"명령문"(0.83)이 "전부명령"(0.80)보다 위에 오듯 질의와 길이가 비슷한 후보가 앞선다
- **Reversible**: yes(`TermMngService` 상수 3개)
- **Source**: `TermMngService.scoreText`, `TermMngServiceTest`(I18_한_글자_비교대상은_포함_가점을_받지_않는다·I18_한_글자_비교대상은_정확히_같을_때만_후보다·I18_포함_점수는_길이가_비슷할수록_높다), TSK-04-02 design.md I18 문구 갱신

## D-140 (2026-10-02T12:30:00Z)
- **Phase**: fix(룰 세트 흐름도 — 자동 정렬·그룹 고르기)
- **Decision needed**: DESIGN_KEY 에서 [자동 정렬]을 누르면 모양이 망가지고(사용자 지적), 그룹은 32×14px 제목 글자만 눌러야 골라진다("그룹 선택이 잘 안된다"). 어떻게 고칠지
- **Decision made**: (1) 끝내는 몸(끝내는 처리 갈래·끝내는 IF 갈래)의 끝 → END 선은 dagre 에 넣지 않는다. 그 선이 층마다 가상 점을 만들어 정상 줄기를 오른쪽으로 128px 밀었다. END 로 들어가는 다른 선이 없으면 그대로 넣고, 끝내는 몸이 더 길면 END 를 가장 낮은 노드 아래로 내린다. 몸은 END 위까지를 세로 범위로 보고 오른쪽으로 비킨다 (2) 정상 갈래가 빈 받는 룰 뒤 줄기를 룰 가운데 아래로 옮긴다(dagre 가 룰을 뒤 줄기와 처리 갈래 사이 가운데에 놓는다) (3) 분기 → 갈래 첫 노드 선에 무게 2 를 준다. 짧은 갈래가 합류 쪽으로 처지지 않고 분기 바로 아래에 붙는다. 받는 노드 없는 흐름의 자동 배치도 이 점만 바뀐다(저장 위치는 그대로) (4) 그룹 틀 네 변에 10px 테두리 띠를 두어 제목처럼 누르면 고르고 편집 모드에서 끌어 옮긴다 (5) 틀 안쪽 빈 곳을 누르면(끌기 없이) 그 그룹을 고른다(겹치면 가장 작은 틀, 사용자 요청). 틀 몸통은 여전히 누름을 받지 않아 안쪽에서 끌면 지금처럼 영역 선택·화면 이동이다 — 빈 곳 누르기를 캔버스가 받아 누른 자리가 든 틀을 찾는다 (6) [자동 정렬] 뒤 그룹 틀과 겹친 메모는 높이를 두고 그 높이의 틀·노드·다른 메모 오른쪽으로 비킨다(사용자 요청 "메모는 같이 안 들어가도록"). 겹치지 않는 메모는 그대로다
- **Rationale**: 줄기가 한 세로줄에 서야 흐름이 읽힌다. 테두리 띠는 안쪽 빈 곳의 영역 선택을 막지 않으면서 누를 자리를 넓힌다
- **Reversible**: yes(`flow-layout.ts` 배치 계산, 그룹 노드 표시. 저장 형식 변경 없음)
- **Source**: 사용자 지적 2026-10-02. 영향: `flow-layout.ts`(endingTails·alignAfterGuarded·BRANCH_HEAD_WEIGHT·END 내리기·groupBox·clearNotesFromGroups), `canvas/nodes.tsx`·`FlowCanvas.tsx`(dragHandle `.rsf-group-handle`·groupAt), `styles/base.ts`, 시험 `catch-layout.test.ts`·`group-move.test.ts`·`arrange-notes.test.ts`

## D-141 (2026-10-02T13:10:00Z)
- **Phase**: change(컬럼 사전 — 도메인 필수 조건 폐지)
- **Decision needed**: 사용자 요청 "컬럼 사전에 도메인 필수조건을 없애자". 컬럼마다 도메인을 꼭 붙여야 저장되던 규칙(`TB_MDM_COLUMN.DOMAIN_ID NOT NULL`, 서버·화면 선검사 "논리명·표준 물리명·도메인은 필수입니다")을 어디까지 풀지
- **Decision made**: (1) DB — `DOMAIN_ID` 를 NULL 허용으로 바꾸고 `FK_TB_MDM_COLUMN_DOMAIN` 은 남긴다(값이 있으면 있는 도메인이어야 한다). SQLite 마이그레이션 V16(`V16__column_domain_optional.sql`)이 표를 다시 만든다. 자식 표 둘(`TB_MDM_COLUMN_SYSTEM.COLUMN_ID`·`TB_MDM_LAYOUT_ITEM.COLUMN_PHYS`)에 행이 있어도 적용되도록 V9·V13 의 "새 표 → 옛 표 DROP → 개명" 대신 `PRAGMA defer_foreign_keys = ON` 아래에서 행·AUTOINCREMENT 상한을 임시 표에 옮기고 → 옛 표 DROP → 같은 이름으로 새 표(V3 정의에서 NOT NULL 한 곳만 뺌) → 유일 인덱스 2개 → 행 되돌리기 → 상한 복원 → 임시 표 삭제 순으로 한다(부모 행이 다시 생기며 미뤄 둔 FK 위반이 0 이 된다) (2) 서버 — `MdmColumn.domainId` 의 `nullable=false` 를 빼고, `ColumnMngService.save` 필수 검사에서 도메인을 뺀다(문구 "논리명·표준 물리명은 필수입니다"). 도메인 존재 검사는 값이 있을 때만 한다. 검색·상세·중복 목록은 도메인이 없으면 도메인 칸을 null 로 준다 (3) 인터페이스 레이아웃의 컬럼 조회(`LayoutQueries.COLUMN_SELECT`)를 `JOIN` 에서 `LEFT JOIN` 으로 바꾼다 — 도메인 없는 컬럼이 사전 밖(L01)으로 빠지지 않고, 타입·길이 파생값만 비어 저장 때 기존 L07 이 잡는다 (4) 화면 — 상세 폼 라벨 "도메인 *" 를 "도메인" 으로, 선검사·저장 파라미터를 `save-form.ts` 로 옮겨 빈 도메인이면 `domainId` 를 보내지 않는다(`Number("")` 가 0 이 되어 "도메인을 찾을 수 없습니다" 로 거부되던 자리)
- **Rationale**: 도메인이 아직 정해지지 않은 컬럼도 사전에 먼저 올려 두고 나중에 도메인을 붙일 수 있어야 한다(사용자 요청). FK 를 남기므로 잘못된 도메인 값은 여전히 막힌다. 룰 변수 타입 해석(`RuleVarTypeResolver`)·레이아웃 파생(`LayoutDictionary.derive`)·도메인 영향도(`DomainImpactQueries`, LEFT JOIN)는 이미 도메인 없는 컬럼을 견딘다
- **Reversible**: yes(되돌리려면 새 마이그레이션에서 같은 방식으로 NOT NULL 을 다시 걸어야 하고, 그 전에 DOMAIN_ID 가 NULL 인 컬럼에 도메인을 채워야 한다)
- **Source**: 사용자 요청 2026-10-02. 영향: `V16__column_domain_optional.sql`, `MdmColumn`, `ColumnMngService`(save 필수·존재 검사), `LayoutQueries`, 화면 `columnMng/page.tsx`·`save-form.ts`·`types.ts`, 문서 `erd/02-term-domain-column.*`·`screens/columnMng/columnMng_기능설계서.md`(D-006·V-001·V-006). 시험 `MdmColumnDomainOptionalMigrationTest`(자식 행이 있는 DB 에서 행·칼럼·인덱스·FK·자식 FK·상한 보존), `ColumnMngServiceSqliteTest.D141_…`, `LayoutMngServiceSqliteTest.D141_…`, `MdmSharedContractMigrationTest`(버전 집합에 16), 화면 `save-form.test.ts`. 로컬 DB 사본(컬럼 7,858·매핑 11,168·레이아웃 항목 32)에 V16 을 FK 켠 채 적용해 행·인덱스·FK·상한이 같고 `foreign_key_check` 위반 0 임을 확인했다(실제 `src/backend/data/mdm.db` 적용은 서버 재기동 때)

## D-142 (2026-10-02T13:20:00Z)
- **Phase**: change(룰 세트 흐름도 — 받는 노드 자리 옮기기)
- **Decision needed**: 사용자 요청 "룰 세트 편집에서 exception을 현재는 아래쪽에 4개를 붙일 수 있는데 사각형 여러 위치로 이동할 수 있게 해줘". 받는 노드(CATCH)는 룰 아래 변 왼쪽부터 36px 간격 고정 자리(R15)에만 그려졌다. 어디까지 옮기게 하고 무엇에 저장할지
- **Decision made**: (1) 편집 모드에서 받는 노드 원을 끌면 붙은 룰 테두리 네 변을 따라 미끄러진다. 끄는 점에서 가장 가까운 변에 대고(모서리 바깥이면 더 많이 벗어난 방향의 변), 원이 모서리를 넘지 않게 변 양 끝 14px 안으로 자르며, 변 가운데 ±6px 안이면 가운데에 붙인다(`catchSpotAt`). 화면 4px 미만 움직임은 누르기로 본다. 같은 룰의 다른 받는 노드와 겹치는 자리(가운데 거리 28px 미만)면 놓아도 올리지 않는다 (2) 저장은 `view.catchSpots[받는 노드 ID] = {side: top|right|bottom|left, at: 변 시작에서 원 가운데까지 정수}`. 옮기지 않은 받는 노드는 키가 없고 R15 기본 자리 그대로라 기존 세트의 저장 글자·dirty 비교가 바뀌지 않는다. 받는 노드를 지우면 자리도 지운다 (3) 받는 노드에서 나가는 선은 걸친 변 바깥쪽으로 나간다(`handlesOf` 의 catchSide). 아래 변이 아닌 자리의 빈 끝내는 갈래는 아래에서 출발하는 자동 우회 경로(`endingRoutes`)를 쓰지 않는다. 자리를 바꾸면 그 받는 노드에서 나가는 선의 저장 경로(꺾는 점)를 지운다(예전 출발 자리에 맞춘 점이라 첫 구간이 사선이 된다) (4) React Flow 끌기 대상으로 바꾸지 않고 따로 포인터 끌기를 둔다(여러 노드를 함께 끌 때 받는 노드가 `view.positions` 에 적히지 않게). 놓을 때 편집 한 번(`setCatchSpot`, 되돌리기 한 칸) (5) 자동 배치(dagre)는 그대로라 처리 갈래 몸은 여전히 룰 아래 층에 놓인다
- **Rationale**: 변·거리로 저장하면 룰을 옮기거나 크기를 바꿔도 받는 노드가 테두리를 따라간다. 서버는 view 를 받은 그대로 저장하고(`RuleSetFlowJson.canonical`) 검사하지 않아 백엔드 변경이 없다(D-138 그룹 색과 같다)
- **Reversible**: yes(view 의 선택적 키 하나. 되돌리면 정규화가 키를 버리고 모두 아래 변 기본 자리로 그린다)
- **Source**: 사용자 요청 2026-10-02. 영향: `flow-edit.ts`(CatchSpot·catchSpotsFor·setCatchSpot·sanitizeView·flowJsonOf), `flow-layout.ts`(catchSpot·catchSpotAt·catchSideOf·catchSlots.spot·endingRoutes), `canvas/catch-move.ts`(신규), `canvas/nodes.tsx`(catchSide·nopan·handlesOf), `canvas/FlowCanvas.tsx`(onCatchSpotChange·끌기), `page.tsx`, `styles/catch.ts`. 테스트 `tests/dme/ruleSetEdit/catch-spot.test.ts`(19건)

## D-143 (2026-10-02T13:30:00Z)
- **Phase**: change(룰 세트 흐름도 — 꺾는 점 끌기 맞춤)
- **Decision needed**: 사용자 요청 "선의 점을 옮기는데 그랩기능이 있으면 좋겠어. 그래야 직각을 맞추기 편할것 같아". 선분 끌기에는 이웃과 일직선 맞춤(`snapSegmentDelta`)이 있었지만 꺾는 점(저장 점·자동 경로 점) 끌기에는 맞춤이 없었다
- **Decision made**: 꺾는 점을 끄는 동안 x·y 를 따로, 앞 이웃(앞 꺾는 점, 맨 앞이면 선 시작 손잡이)·뒤 이웃(뒤 꺾는 점, 맨 뒤면 선 끝 손잡이) 가운데 화면 6px(`SEGMENT_SNAP_PX`) 안에서 가장 가까운 것의 좌표로 맞춘다(`snapRoutePoint`). 맞은 축마다 노드 끌기와 같은 안내선(`flow-snap-guide`)을 끄는 점과 이웃 사이에 양 끝 24 더 늘여 그리고, 놓거나 취소하면 지운다. Alt 를 누른 채 끌면 맞추지 않는다(노드 끌기 G1 과 같다). 저장 형식은 그대로다
- **Rationale**: 이웃과 x 나 y 가 같아지면 그 사이 구간이 세로·가로 일직선이 되어 직각 꺾임을 손으로 맞출 필요가 없다. 선분 끌기와 같은 6px 범위를 써서 두 조작의 느낌을 맞춘다
- **Reversible**: yes(`canvas/route-path.ts` 의 `snapRoutePoint`, `FlowCanvas` routeApi.startDrag. 저장 형식 변경 없음)
- **Source**: 사용자 요청 2026-10-02. 테스트 `tests/dme/ruleSetEdit/flow-route.test.ts`(snapRoutePoint 2건, 캔버스 끌기 맞춤·Alt 1건)

## D-144 (2026-10-02T10:38:06Z)
- **Phase**: design(MDM 버전 관리 확장 — 룰 세트·레이아웃·헤더 + major/minor 통일, 1단계 룰)
- **Decision needed**: 버전·확정 관리가 마스터코드·룰에만 있고, 룰 세트·레이아웃·헤더는 저장하면 바로 운영에 반영된다. 편집 중 운영 보호, 적용 시점 예약, 과거 판정 재현, 되돌리기를 위해 이 셋에도 버전 관리를 둘지, 번호 체계를 어떻게 맞출지
- **Decision made**: (1) 룰 세트·레이아웃·헤더도 DRAFT·소유자·확정·확정취소를 갖는다(06:905·03:72·06:988 번복, I15·I18 폐지). 참조(세트→룰·하위 세트, 전문·EAI→헤더)는 ID 만 두고 판정·직렬화 시각의 RELEASED 버전으로 해석한다 (2) 네 대상 모두 `VER NUMERIC(7,3)` + `VER_KIND NOT NULL CHECK IN ('MAJOR','MINOR')`. major `floor(최대)+1`, minor `최대+0.001`(상한 999). 새 버전 버튼은 "새 버전(major)"·"새 버전(minor)" 두 개 (3) 3단계로 나눈다. 1단계 공통 엔진+룰 major/minor(V17 `rule_version_decimal`, 구현 완료), 2단계 룰 세트, 3단계 레이아웃·헤더 (4) 1단계 구현 확정 사항: V17 은 RENAME 대신 `_BAK` 경유 재생성(`legacy_alter_table` 설정에 따라 FK 갱신이 달라서), 룰 버전 계약은 문자열 `"1.000"`(엔진 JSON 은 number), 새 버전 가능 여부 플래그는 ruleMng view 의 `flags` 안. 감사 카운터(`VER`·`AUD_VER`·`auditVer`)는 바꾸지 않는다
- **Rationale**: 상대 버전을 박으면 룰 하나 확정이 세트·전문 새 버전으로 연쇄되므로 판정 시각 해석이 낫다. 마스터코드가 이미 쓰는 소수 버전과 공통 확정 엔진(ADR-0002)을 재사용해 네 대상의 처리 경로를 같게 한다
- **Reversible**: no(번호 칼럼 타입·`VER_KIND`·번복된 기존 결정. 되돌리려면 새 ADR)
- **Source**: 사용자 결정 2026-10-02. [ADR-0006](adr/0006-object-versioning-major-minor.md), 스펙 [`2026-10-02-mdm-object-versioning-design.md`](../superpowers/specs/2026-10-02-mdm-object-versioning-design.md). 원천 설계 문서 갱신 대상: 06:905·06:927·06:971·06:988·03:72(다른 저장소)

## D-145 (2026-10-02T13:00:00Z)
- **Phase**: build(룰 화면 경계값 테스트 케이스 자동 생성)
- **Decision needed**: 외부 원천(EXTERNAL) 룰은 테스트 케이스도 쓸 수 없어(TSK-08-04 I29) 조회 전용 룰에서 경계값 생성·케이스 저장을 쓸 수 없다
- **Decision made**: 외부 원천 룰도 테스트 케이스(`TB_MDM_RULE_TEST_CASE`) 쓰기·삭제를 허용한다(`RuleTestCaseService` 의 `requireMdm` 제거, 화면 카드 ⑥ 쓰기 조건에서 원천 조건 제거). 표 정의·버전·헤더 저장은 여전히 MDM 원천만이다. 폐기(DEPRECATED) 룰과 담당자 검사는 그대로다
- **Rationale**: 케이스는 버전과 무관한 검증 자료라 원천 시스템의 정의를 바꾸지 않는다. 외부에서 들어온 룰일수록 판정을 케이스로 고정해 두는 가치가 크다
- **Reversible**: yes(검사 한 줄과 화면 조건)
- **Source**: 사용자 요청 2026-10-02 "경계값 생성은 EQP_CHK_JDG 룰로 해". TSK-08-04 I29 의 "케이스 쓰기도 MDM 원천만" 을 번복

## D-146 (2026-10-03T00:30:00Z)
- **Phase**: design(MDM 화면 메타 연동 — 하위 프로젝트 B)
- **Decision needed**: idea.md "UI 캡션/라벨을 MDM에서 자동으로 가져옴", "Form·Grid 헤더 툴팁". 캡션 우선순위, 툴팁 내용·순서, 받는 시점, 적용 범위
- **Decision made**: (1) 명시 우선 — 그리드 `header`·폼 `label` 을 적으면 그대로, 비우면 MDM(그리드 labelShort→Mid→Long, 폼 labelMid→Long→Short). `MdmMetaProvider captionPriority="mdm"` 로 화면 단위 전환 (2) 툴팁: 제목·물리명 → 설명 → 형식·필수·기본값 → 도메인·단위 → 표준식 → 허용 코드(10개) → "저장할 때 서버에서 확인"(비즈니스식 원문 없음) (3) 화면이 열릴 때 한 틱 모아 모듈당 1회 요청, 브라우저 메모리 5분 (4) 포털 탭마다 공급자를 자동으로 씌우고 모듈은 pageId 앞부분, mdmMeta 없는 모듈은 세션 동안 끔·401 에도 로그인 이동 없음
- **Rationale**: 기존 화면이 바뀌거나 깜빡이지 않고, 새 화면은 캡션을 적지 않으면 MDM 을 따른다. 툴팁은 덧붙는 기능이라 전 화면 자동 적용이 안전하다
- **Reversible**: yes(공급자 옵션·shared 내부 규칙)
- **Source**: 사용자 위임 2026-10-03. 스펙 [`2026-10-03-mdm-screen-meta-validation-design.md`](../superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md) §2 B1~B8

## D-147 (2026-10-03T00:30:00Z)
- **Phase**: design(MDM 값 검증 — 하위 프로젝트 C)
- **Decision needed**: idea.md "룰 엔진 실행 검증(화면 값 자동 검증, BE 에서 값 검증 및 체크)". 켜는 방식, 길이 단위, MDM 장애 정책, 룰 세트 위반 판정, 평가 중 MDM 호출
- **Decision made**: (1) 화면·서버 모두 화면/서비스가 명시해 켠다(그리드 `mdmValidate`, `useMdmValidation`, `MdmValidator.check(columns…)`) — 컬럼 사전이 테이블 구분 없는 전역 물리명이라 자동 적용하지 않는다 (2) 길이는 code point (3) 정의를 받을 수 없으면 기본 저장 거부(`MDM_UNAVAILABLE`), 모듈 설정 `cactus.mdm.validation.on-unavailable: PASS` 로 경고 후 통과 (4) 룰 세트는 받는 노드가 받지 않은 엔진 위반만 오류, caught·finalValues 는 호출자 판단 (5) 미리 받기 뒤 캐시 전용 조회기로 평가(평가 중 HTTP 금지) (6) 화면 평가기는 m-mdm 에서 shared 로 옮기고 m-mdm 은 다시 내보냄 (7) 사전에 없는 컬럼·룰 세트는 WARN 후 건너뜀(MDM 관리 변경이 업무 저장을 막지 않게) — 결과 `missing` 에 담고 `ok()` 판정에는 넣지 않으며 예외를 던지지 않는다
- **Rationale**: 잘못 맞은 사전 이름 하나가 전 화면 입력을 막지 않게 한다. 엔진 평가 1초 제한이 HTTP 5초보다 짧고 엔진 예외는 원인을 잃는다. D8 "서버가 기준"
- **Reversible**: yes(설정·호출부)
- **Source**: 사용자 위임 2026-10-03. 같은 스펙 §2 C1~C9. 마루 데이터 MASTER 는 범위 밖(엔진·MDM 모두 MasterLookup.NONE, 로컬 도메인 164건 중 직접 사용 0건)

## D-148 (2026-10-02T16:02:23Z)
- **Phase**: build(MDM 버전 관리 3단계 — 레이아웃·헤더, D-144 의 3단계 구현 결정)
- **Decision needed**: 전문 레이아웃·헤더에 버전 관리(D-144, 3단계)를 구현하면서 스펙이 열어 둔 구현 방식과 구현 중 생긴 판단을 한곳에 남긴다
- **Decision made**: (1) 직렬화기·파서는 시각을 모르는 순수 함수로 두고 시각 T 는 `MdmLayoutSnapshotResolver` 가 받는다(스펙 §7 "계약에 T" 의 구현 방식) (2) 버전 행 길이 칼럼 `OWN_LENGTH` = 그 버전 자신의 항목 길이 합이고 전문 총 길이는 시각 T 의 헤더 버전으로 합성한 값이다. 본문 항목 `OFFSET` 저장값은 본문 시작 기준 상대값이다 (3) 상수 재정의 키는 헤더 항목 물리명(`HEADER_COLUMN_PHYS`)이다 — 헤더 버전이 바뀌어도 짝이 유지되고 대상이 사라지면 헤더 확정 경고(`ORPHAN_OVERRIDE`) (4) 이행 전 이력은 `LEGACY_SNAPSHOT_YN='Y'` 버전의 합성 스냅샷을 그대로 쓴다(읽기 전용) (5) "전문 총 길이 규칙" = MSG_LENGTH(AUTO) 칸 자리수 용량(L16) + 상수 재정의 값 길이(L12) (6) DMB 담당자 권한은 READ → CONFIRM 이다. 새 버전·등록은 담당자 역할이 필요 없고 확정·선점은 담당자다. 확정은 소유자만 하는데 [넘기기] 는 아직 꺼져 있어(HANDOVER_AVAILABLE) 표준 관리자의 DRAFT 는 해제(unlock)한 뒤 담당자가 선점(lock)해 확정한다 (7) EAI 는 버전 대상이 아니다 — 쓰는 전문이 있으면 인코딩·패딩 변경을 거부한다. 헤더의 EAI 연결은 헤더 버전 행 `EAI_CODE` 에 두고, EAI 표준 헤더는 시각 T 에 RELEASED 인 헤더 버전 중 그 EAI 를 주장하는 가장 늦게 적용 시작한 버전(같은 시각이면 헤더 ID 가 큰 쪽)으로 해석한다. 헤더 확정은 `TB_MDM_EAI.HEADER_LAYOUT_ID` 를 옮기지 않으며(그 칼럼은 운영이 더 읽지 않는다), 표준 헤더가 바뀌는 헤더 확정은 `EAI_STANDARD_HEADER_SWITCH` 경고(넘겨받기·되찾기·내려놓기)로 알린다(Ruling P3-15·P3-17). 전문 저장의 표준 헤더 끼움(I14)은 그 헤더에 저장 시각 RELEASED 가 있을 때만 하고, 확정 검사는 저장된 구성 그대로 본다 (8) 레이아웃 4표의 감사 카운터를 `AUD_VER` 로 바꾸고 레이아웃 계열 DTO 의 `ver` 는 업무 버전 문자열(`"1.000"`)이다 (9) 레이아웃 이름·송신·수신 시스템은 부모 행(버전 없음)이라 DRAFT 저장 때 바로 반영되고 확정 기록에 남지 않는다 — 2단계 세트명·설명과 같다. 전문 바이트에는 영향이 없다(P3-8) (10) 레이아웃 부모 칸 변경은 메타 변경 기록에 남고(RELEASED 가 있을 때만), 메타 피드 LAYOUT 은 RELEASED 버전 목록과 쌓은 헤더의 버전 경계로 나눈 합성 구간을 주어 업무 모듈이 판정 시각으로 고른다(P3-14·P3-16, ADR-0007) (11) 헤더 확정을 취소하면 그 헤더를 쌓은 RELEASED(현재·미래) 전문 버전을 적용 구간에서 합성할 수 없게 되는 경우 거부한다(`MDM028`, `CONFIRM_CANCEL_BREAKS_LAYOUTS`, 사용 전문 목록을 오류에 담는다). 사용자는 걸린 전문의 미래 버전을 먼저 확정 취소한다. 메타 피드의 키 단위 failed(R4)를 정상 경로에서 막기 위함이다(P3-22, 버전 스펙 §7·ADR-0002 D8-16). 이미 취소와 무관하게 깨져 있던 전문까지 거부하는 드문 경우는 후속이다(P3-26) (12) 헤더 확정의 EAI 표준 헤더 전환 경고는 apply_from 한 시각만이 아니라 apply_from 이후 그 EAI 를 주장하는 헤더 RELEASED 경계(적용 시작·끝)마다 비교해, 조용한 '없음' 전환을 막는다 — 경고뿐이라 비용이 작다(P3-24) (13) 헤더 확정 검사의 L12·L16 은 '전' 합성에 이미 있던 문제면 오류가 아니라 WARNING 이고 새로 생긴 것만 오류다 — 무관한 헤더 확정이 옛 문제로 막히지 않게 한다. ORPHAN_OVERRIDE 반복 경고는 수용한다(P3-25) (14) 마이그레이션은 `V21__layout_version.sql` 이다(당초 V19 — 메타 캐시 V20 이 dev 에 먼저 들어가 Flyway outOfOrder=false 라 번호를 옮겼다). V19 로 만든 로컬·E2E DB 는 지우고 다시 만든다 (15) 컬럼·도메인 변경은 그 물리명을 쓰는 RELEASED 전문(헤더 항목이면 그 헤더를 쌓은 전문까지)을 메타 변경 기록의 LAYOUT 키로 펼친다 — 합성의 타입·단위·소수가 그때의 사전에서 오기 때문이다(최종 검토 I1, 판정 P3-28). 확정 때 그 값을 버전에 고정하는 장기 대책은 후속이다(전문 소비 연동 전, ADR-0007 Trigger)
- **Rationale**: 시각 T 를 순수 함수 밖에 두면 직렬화·파서가 시계 없이 시험되고, 헤더가 바뀌어도 전문 행을 건드리지 않고 판정 시각 해석만으로 반영된다(D-144 K1). 확정 시각에 EAI 연결을 옮기면 적용 전 확정이 미리 반영되고 확정 취소가 되돌리지 못하므로 시각 T 해석이 맞다. 원장 가드(11)는 룰 확정·확정 시 apply_from 합성 검사와 대칭이고 meta-cache 계약을 바꾸지 않는다
- **Reversible**: no(번호 칼럼·감사 카운터 개명·EAI 연결 해석 방식. 되돌리려면 새 마이그레이션과 새 ADR)
- **Source**: [ADR-0006](adr/0006-object-versioning-major-minor.md) 3단계 결과 절, 스펙 [`2026-10-02-mdm-object-versioning-design.md`](../superpowers/specs/2026-10-02-mdm-object-versioning-design.md) §7, 계획 [`2026-10-02-mdm-versioning-phase3-layout.md`](../superpowers/plans/2026-10-02-mdm-versioning-phase3-layout.md), 사용자 결정 2026-10-02(D-144 3단계 병렬 진행). 원천 설계 문서(`/Users/jji/project/mdm/docs/design` 03:72·06:988)는 이 저장소에서 고치지 않는다 — 다른 저장소에서 갱신

## D-149 (2026-10-03T04:00:00Z)
- **Phase**: design(MDM 컬럼 시스템 별칭 매칭 — B·C 후속)
- **Decision needed**: 화면 키·서버 검증 컬럼을 표준 물리명(`TB_MDM_COLUMN.PHYS_NAME`)으로만 찾아, 시스템별 실제 물리명(`TB_MDM_COLUMN_SYSTEM`, MES 5,938건이 표준과 다름)을 쓰는 화면은 MDM 메타를 받지 못한다
- **Decision made**: (1) 표준 물리명이 먼저, 없을 때만 모듈 시스템의 별칭으로 찾는다(겹치는 6개는 표준) (2) 시스템은 `cactus.mdm.system-code`(기본 없음=끔, 다섯 업무 모듈은 MES), metaFeed COLUMN 요청 `params.systemCode` (3) 별칭은 대소문자 무시, 여러 컬럼을 가리키면 "없음" (4) 응답에 `matchedSystem`·`systemPhysName`, `physName` 은 표준 (5) 변경 기록은 컬럼의 표준 이름+모든 별칭, 별칭 행 변경 시 전·후 별칭 (6) TRANSFORM·요구 변수 별칭 변환은 하지 않음
- **Rationale**: 지금 맞는 이름의 뜻이 바뀌지 않아 회귀가 없고, 별칭 키로 캐시된 항목도 변경 기록으로 지워진다
- **Reversible**: yes(설정·피드 선택 칸)
- **Source**: 사용자 지시 2026-10-03 "별칭 매칭부터 진행해". 스펙 [`2026-10-03-mdm-column-system-alias-design.md`](../superpowers/specs/2026-10-03-mdm-column-system-alias-design.md)

## D-150 (2026-10-03T01:59:37Z)
- **Phase**: build(MDM 컬럼 설명 HTML — 백엔드: 서버 소독·길이 상한·메타 피드 descriptionHtml)
- **Decision needed**: 컬럼 설명을 HTML 로 넣어 컬럼 정보 팝업·툴팁에 그리려면 저장 형식·판별·소독·피드 모양을 정해야 한다. 지금 `TB_MDM_COLUMN.DESCRIPTION`(TEXT)은 검사·소독 없이 저장되고, 메타 피드와 shared `MdmMetaCard` 가 글자로 그려 HTML 을 넣으면 태그가 그대로 보인다
- **Decision made**: (1) 같은 칸에 저장한다 — `DESCRIPTION`·`USAGE_NOTE`(둘 다 TEXT), 형식 칸·마이그레이션 없음 (2) 형식은 알려진 태그 판별이다 — m-mdm `descriptionFormat` 과 MDM `ColumnDescriptionFormat` 이 같은 태그 목록·대소문자 무시(ASCII)와 같은 꼴을 쓴다: `</?태그` 바로 뒤 글자가 `A-Za-z0-9_` 가 아니고 그 뒤 어딘가에 `>` 가 있으면 HTML 이다. 정규식 `\b` 는 쓰지 않는다(자바 `\b` 는 결합 문자를 단어의 일부로 봐 JS 와 어긋나 서버 소독을 우회할 수 있었다). `>` 는 첫 일치 뒤에 있는지만 봐 선형이다(`[^>]*>` 되추적은 O(n²)). 판별 사례 표를 자바·프런트 시험과 백엔드 가이드 §11 에 고정한다(`a < b`·`Map<String>` 은 일반 글) (3) 서버 소독: 컬럼 저장 때 HTML 이면 jsoup(mls 와 같은 1.23.2) `Safelist.relaxed()` + hr·s·del·ins·mark 로 소독한 값을 저장한다. 링크·이미지 주소는 http·https 만이다(mls 공지는 링크 mailto 허용 — 프런트 렌더러 `sanitizeNoticeHtml` 과 맞춰 뺀다). mls 클래스는 의존하지 않고 mdm `ColumnDescriptionSanitizer` 를 둔다. 일반 글은 소독하지 않는다. 소독은 결과가 바뀌지 않을 때까지(최대 3회) 돌려 멱등이다(`<pre>` 첫 줄바꿈은 jsoup 이 되살리지 않아 하나를 붙여 낸다). 소독 뒤 알려진 태그가 남지 않으면 소독본을 `<p>` 로 감싸 HTML 로 저장한다 — 엔티티를 풀지 않으므로 화면에는 글자로 보이고, 글자가 없으면 null 이다(엔티티를 풀면 `<td>&lt;img …&gt;</td>` 가 소독되지 않은 `<img …>` 로 저장된다). 그래서 저장값이 HTML 이면 늘 소독본이다. 소독으로 바뀌었는지는 응답에 따로 알리지 않는다(view 가 저장값을 같은 규칙으로 다시 정규화해 돌려준다 — 이 결정 전에 소독 없이 들어간 HTML 도 소독본으로 나간다). 활용처 메모도 같은 규칙이다 (4) 상한: 설명·활용처 메모 각 20,000자(메모 위젯 `CONTENT_MAX` 와 같은 값). 다른 칸처럼 소독 전 원문을 코드 포인트로 세고 `MDM021` "설명은(는) 20000자 이하여야 합니다" 꼴로 알린다 (5) 메타 피드 `ColumnMeta` 맨 끝에 `descriptionHtml` 을 둔다 — 설명이 HTML 이면 피드에서 한 번 더 소독한 값(옛 데이터 방어)이고 `description` 은 그 글자만(엔티티 해제·블록·br 경계 줄바꿈)이다. 일반 글이면 null 이고 `description` 은 그대로다. cactus 전달(`MdmColumnMeta`·`MdmScreenColumn`·`MdmMetaController`)과 화면 카드는 메타 캐시 세션 담당이다 — cactus 는 모르는 칸을 무시하므로 MDM 만 먼저 나가도 깨지지 않는다 (6) 피드 `usageNote` 도 HTML 이면 같은 방식으로 글자만 싣고, 그 HTML 칸(`usageNoteHtml`)은 두지 않는다 (7) 메타 변경 기록은 고치지 않는다 — 기록은 원장 저장 때 키를 남기는 방식이라 칸 추가로 "변경"이 잡히지 않는다. 업무 모듈의 메모리 캐시에 남은 옛 모양 항목은 수명(max-idle·max-age)이나 재기동으로 바뀐다(별칭 D-149 칸 추가와 같은 처리) (8) 글자 칸(`description`·`usageNote` — 피드, columnMng 목록·중복 행, 룰 변수 설명)은 늘 글자로 그리고 형식 판별에 넣지 않는다 — 글자만 뽑은 결과가 HTML 꼴일 수 있다(설명 `<p>&lt;img …&gt;</p>` 의 글자는 `<img …>`). HTML 은 `descriptionHtml` 이 있을 때만 그린다
- **Rationale**: 같은 칸·알려진 태그 판별이면 기존 일반 글 설명이 그대로 남고 마이그레이션이 없다. API 를 직접 부르는 경로까지 막는 최종 방어선은 서버 소독이다(Mes-Guide §7 서버 재검증). 피드에서 글자를 따로 주면 글자만 그리는 옛 카드가 태그 대신 글자를 본다. 새 칸을 끝에 두면 옛 cactus 는 모르는 칸을 무시하므로 MDM 이 먼저 배포돼도 깨지지 않는다
- **Reversible**: yes(마이그레이션 없음, 피드 끝 칸 하나. 저장된 소독본은 되돌릴 수 없으나 원문의 위험 요소만 빠진 값이다)
- **Source**: 사용자 요구 "컬럼 ID로 컬럼명과 컬럼 설명 등을 자세하게 보여주는 툴팁 … 나중에 각 컬럼 설명을 HTML로 넣어서 그것도 띄우게", 팀장 지시(백엔드 범위, 2026-10-03)와 범위 조정(사용자 지시 — cactus·툴팁은 메타 캐시 세션과 분담, usageNote 글자만은 팀장 결정). 판별 규칙 원본 `src/frontend/m-mdm/src/column-info/api.ts`, 소독 선례 mls `NoticeHtmlSanitizer`

## D-151 (2026-10-03T04:16:41Z)
- **Phase**: build(MDM 레이아웃 확정 때 컬럼 속성 고정 — 3단계 최종 검토 I1 의 장기 대책, 판정 P3-28)
- **Decision needed**: RELEASED 레이아웃(전문·헤더) 버전을 시각 T 로 합성할 때 항목의 타입(NUM/CHAR)·단위·소수 자릿수를 그때의 컬럼 사전(컬럼 → 유효 도메인)에서 읽어, 확정 뒤 사전을 고치면 확정 없이 RELEASED 합성·메타 피드 값·과거 재현이 바뀐다(D-144 (15) 는 메타 기록 펼침으로 캐시만 맞췄다). 전문 소비 연동 전에 RELEASED 합성을 사전과 무관하게 해야 한다
- **Decision made**: 레이아웃 확정 때 컬럼 속성 고정 — 항목 행 칸·확정 취소 비움·이행 채움. (1) V22 가 `TB_MDM_LAYOUT_ITEM` 을 다시 만들어 `DATA_TYPE VARCHAR(20)`·`UNIT_CODE VARCHAR(20)`(단위 원장 FK — 도메인 UNIT_CODE·항목 TRANS_UNIT 과 같다)·`SCALE INTEGER`(모두 NULL 허용)와 고정 표시 `PINNED_YN VARCHAR(1) NOT NULL DEFAULT 'N'`(CHECK: Y·N, 'N' 이면 세 칸 NULL)을 `LENGTH` 뒤에 둔다(칼럼 순서 불변식 때문에 ADD COLUMN 대신 재생성 — V14 선례) (2) 확정(`LayoutConfirmService.confirm`, 전문·헤더 공용)이 공통 엔진 확정 직후 같은 트랜잭션에서 그 버전 항목 행 전부를 고정 표시하고 확정 시점 유효값을 쓴다(`LayoutColumnPins.pin` — 합성기와 같은 `LayoutDictionary.byPhysNames`, 값이 없으면 NULL 로 고정). 변경 분류·본문 스냅샷보다 먼저 쓴다 (3) 확정 취소는 공통 엔진 취소 트랜잭션 안의 LAYOUT 취소 훅(`LayoutConfirmCancelGuard.afterConfirmCancel` 첫 줄, 전문 취소 포함)에서 표시와 세 칸을 비운다. 새 버전 복사(`LayoutWriter.copyVersionRows`)·DRAFT 저장은 옮기거나 쓰지 않는다 — DRAFT 는 늘 'N' 이다. 엔티티 네 칸은 insertable·updatable=false 로 네이티브 쓰기만 받는다 (4) 합성(`LayoutSnapshotAssembler.columnAttrs` 한 곳 — 합성과 화면 행 `LayoutRows.item` 이 같이 쓴다)은 고정 표시 행이면 NULL 까지 그 행의 값을, 아니면 지금 사전 값을 쓴다. 운영 경로에서 고정 표시는 확정 이후 버전(DRAFT·LEGACY 아님)의 행 전부에 있으므로 "확정 이후 버전은 항목 행 값, DRAFT(미리보기 포함)만 지금 사전" 과 같다. LEGACY 버전은 지금처럼 `SNAPSHOT_JSON` 그대로다. 샘플 실행(`layoutMng.execute`)도 같은 규칙이다(검토 I1) — 저장된 버전이 DRAFT 가 아니면 화면 행을 쓰지 않고 저장 행을 `LayoutComposer.compose` 로 시각 T 에 합성해 렌더하고(그리드·피드·내보내기와 같은 값, LEGACY 는 저장 스냅샷), 새 전문·DRAFT 만 화면 행을 지금 사전으로 검사해 렌더한다. 헤더 상수 재정의 값의 판정(L12)도 그 헤더 버전 항목이 직렬화에 쓰는 타입·소수·단위(`columnAttrs` — 확정 헤더 버전이면 고정값)로 본다. 표준식은 고정 대상이 아니므로 지금 사전의 것이다. **브리프 결정 4 변경**: 브리프의 "칸별로 NULL 이면 지금 사전 값" 은 팀장 결정(2026-10-03)으로 바꿨다 — 칸별 대체는 확정 때 값이 없던 칸(문자 도메인의 소수, 단위 없는 도메인의 단위 등)에 확정 뒤 생긴 사전 값이 확정 버전에 새어 들어가 I1 을 일부 남겼다 (5) 고정 표시 칸을 둔 판단: 세 값은 실제로 NULL 일 수 있어 값만으로는 "NULL 로 고정" 과 "고정한 적 없음" 을 가를 수 없다. 버전 상태로 가르면 확정 경로를 거치지 않고 RELEASED 항목을 넣는 곳(로컬 샘플 `mdm/sample/mdm-local-sample.sql`, e2e 픽스처 `src/frontend/e2e/fixtures/mdm-layout-m201.sql`, 시험 준비 `release()`)이 조용히 "값 없음 고정"(숫자가 문자로 직렬화)이 된다. 표시가 있으면 그런 행은 기본값 'N' 으로 지금 사전을 읽어 이전 동작 그대로다 — 그래서 샘플·e2e 픽스처는 고치지 않는다. 합성기·화면 행에 버전 상태를 넘길 필요도 없다 (6) 이행: V22 가 확정 이후 버전(`STATUS <> 'DRAFT' AND LEGACY_SNAPSHOT_YN = 'N'`)의 항목 전부를 'Y' 로 표시하고 이행 시점 사전 유효값을 채운다. 유효값은 SQL 재귀 CTE(저장소 기본형대로 `RECURSIVE` 없이, 처음 만나는 값은 `LIMIT` 대신 `MIN(DEPTH)` 조인)로 `DomainTreeSnapshot.chainRootFirst`+`DomainChainAssembler` 와 같게 계산한다 — 타입은 최상위 조상(부모가 없거나 부모 행이 없는 노드)의 DATA_TYPE, 소수·단위는 자신부터 위로 처음 만나는 NULL 아닌 값, 도메인 없음·도메인 행 없음·순환·노드 52개째(깊이 가드 50)는 세 칸 NULL. 기동 러너를 두지 않는다 (7) 변경 분류는 그대로 둔다 — 기준 버전이 자기 확정 때 고정한 값으로 합성되므로 확정 사이의 사전 변경(예: 소수 0 → 2, 단위 mm → kg)이 다음 확정에서 FORMAT·SIMULTANEOUS 로 잡힌다(의도된 동작) (8) 메타 기록의 컬럼·도메인 → LAYOUT 펼침(`LayoutColumnUsers`)은 그대로 둔다 — 확정한 버전에는 값이 바뀌지 않는 키까지 거는 무해한 캐시 무효화이고, 고정 표시가 없는 RELEASED(샘플·픽스처)는 지금 사전을 읽는다 (9) 범위 밖: EAI 인코딩·패딩은 합성 때 지금 EAI 값을 읽는다 — 이번엔 고정하지 않는다(EAI 는 쓰는 전문이 있으면 변경이 거부되므로 D-148 (7) 위험이 작다, 스펙 §7 후속) (10) 화면 조회의 항목 행(전문·헤더 조회, 헤더 고르기)도 `DATA_TYPE`·`SCALE`·`UNIT_CODE` 를 같은 선택으로 싣는다 — 확정 버전 화면은 직렬화가 쓰는 값을, DRAFT 화면은 지금 사전 값을 보인다. 이름·도메인명·도메인 길이는 늘 지금 사전 값이다. LEGACY 버전 화면은 저장 스냅샷이 아니라 지금 사전 값을 보인다(기존 동작 — 피드·샘플 실행은 저장 스냅샷) (11) 단위 삭제(`unitMng.delete`)는 레이아웃 항목의 `UNIT_CODE`(확정 고정값)·`TRANS_UNIT`(버전 상태 무관)이 가리키는 단위를 FK 위반(S999) 대신 도메인 참조와 같은 업무 오류(`BUSINESS_ERROR`, "다른 데이터(레이아웃 항목)가 이 단위를 참조하고 있어 삭제할 수 없습니다.")로 거부한다. 02 는 03 표를 직접 읽지 않고 `MdmUnitReferenceSpi`(구현 `LayoutUnitReferenceSpi`)로 묻는다 — `MdmDomainReferenceSpi` 와 같은 구조(TSK-04-01 D9). 확정 고정 표시(`LayoutColumnPins.pin`)는 표시한 행 수가 그 버전 항목 수와 다르면(RELEASED 가 아닌 버전) 실패한다
- **Rationale**: 항목 행에 칸을 두면 합성 코드가 고정값을 같은 행에서 읽어 조회가 늘지 않고, 룰 변수(`TB_MDM_RULE_VAR` 의 DATA_TYPE·DOMAIN_ID 버전 행 저장, V17)와 같은 결이다. 유효값 계산 규칙(최상위 타입·위로 첫 값·깊이 가드)이 단순해 SQL 로 그대로 재현되므로 이행을 마이그레이션 안에서 끝내 "V22 직후 고정 표시 없는 확정 버전" 구간이 없다 — 기동 러너는 기동마다 조회·기록이 필요하고 러너가 돌기 전 창이 생긴다. 이행 전후 합성 동일·누락 0 은 `LayoutPinMigrationEquivalenceSqliteTest`(V22 채움 블록을 잘라 다시 돌려 시각 T·피드 구간·헤더 한 벌 비교 + 항목마다 사전 값 대조, 상속 사슬·도메인 없음 포함)와 `MdmLayoutItemPinMigrationTest`(순환·깊이 경계·부모 행 없음·DRAFT·LEGACY·CHECK)로 고정했다. 취소 비움을 엔진 취소 훅에 둔 까닭은 상태 되돌림과 같은 트랜잭션이기 때문이다(서비스에서 엔진 호출 뒤에 두면 트랜잭션 밖 호출에서 DRAFT 에 고정 표시가 남을 수 있다)
- **Reversible**: yes(새 마이그레이션으로 네 칸을 뺀 표를 다시 만들면 합성은 다시 지금 사전을 읽는다. 고정값은 사라진다)
- **Source**: 사용자 결정(2026-10-03, 「항목 행에 칸 추가」 결정 1~8), 팀장 결정(2026-10-03 — 결정 4 를 "확정 이후 버전은 NULL 까지 고정값" 으로 변경, 고정 표시 칸 동의), 3단계 최종 검토 I1(판정 P3-28), D-151 검토(2026-10-03 — 샘플 실행 I1·단위 삭제·V22 CTE 형식·재정의 판정 타입·고정 행 수), [ADR-0007](adr/0007-mdm-meta-hybrid-cache-revision.md) Trigger 후속, [ADR-0006](adr/0006-object-versioning-major-minor.md) 3단계 결과 절, 스펙 [`2026-10-02-mdm-object-versioning-design.md`](../superpowers/specs/2026-10-02-mdm-object-versioning-design.md) §7 후속

## D-152 (2026-10-03T07:18:47Z)
- **Phase**: build(MDM 메타 피드 — 마스터코드 CODE 값의 RELEASED 투영)
- **Decision needed**: 메타 피드 `MetaFeedDefinitions.codes()` 가 `MdmCodeLookup` 으로 원장 다섯 표를 상태 구분 없이 실어, 업무 모듈 cactus 캐시(`CodeRows`)에 RELEASED 가 아닌 버전(DRAFT·REQUESTED·APPROVED·CANCELLED)과 그 버전에서만 유효한 행(초안 사본)이 들어간다(로컬 PROC_CD 는 DRAFT 2.001 하나로 items 36행 중 19행이 초안 사본). 룰·룰 세트·전문 피드는 이미 RELEASED 만 싣는데 코드만 예외였다. 또 엔진 `DefaultCodeResolver` 의 카테고리 최초 소급(`Segments.coveringOrEarliest`)이 DRAFT 에만 정의가 있는 카테고리(PROC_CD 의 CCL·공정그룹구분·도금·소둔)를 RELEASED 버전 판정에 소급해, 확정되지 않은 초안이 업무 모듈 MASTER·CODE_LIST·허용 코드 판정에 샜다(`CodeVersionRow` 계약은 "RELEASED 만 판정에 쓴다, 사본은 RELEASED 만 실어도 된다")
- **Decision made**: (1) CODE 피드는 RELEASED 투영만 싣는다 — 엔진 `kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection.releasedOnly(CodeRows)` 를 `MetaFeedDefinitions.codes()` 에서만 적용한다 (2) 투영 규칙: versions 는 RELEASED 만, items·categories 는 어떤 RELEASED 버전 V 에서 `fromVer <= V < toVer` 인 행만, cateItems 는 어떤 RELEASED 버전에서 유효하거나 같은 카테고리의 남은 TABLE 정의 fromVer 에서 유효한 행만(TABLE 소속은 `effVer = max(정의 fromVer, V)` 로 읽으므로 소급 경로의 행을 지킨다), header 는 그대로, RELEASED 가 없으면 나머지 넷은 빈 목록. 버전은 `BigDecimal.compareTo`(자리수 무시, 열린 끝 9999 도 일반 값), 입력 순서 유지, 정렬한 RELEASED 버전에서 `ceiling(fromVer) < toVer` 로 판정(O((V+I)·log V)) (3) 카테고리 소급은 남은(RELEASED 에서 유효한) 정의 가운데 가장 이른 것으로 간다 — 초안·취소 버전에만 있는 정의는 더는 소급되지 않는다. 카테고리마다 가장 이른 정의가 어떤 RELEASED 버전에서 유효하면 투영 전후 판정(selectVersion·codeList·isMember·attr, RELEASED 버전을 인자로 준 effectiveCodes)이 같고(동등성 시험), 아니면 판정이 바뀔 수 있다(다른 남은 정의가 모든 RELEASED 버전을 덮으면 같다) — 초안 전용 카테고리는 빈 결과가 되고(결함 수정), 가장 이른 정의가 취소 버전에만 있던 카테고리는 다음 남은 정의로 소급된다(그 결과 예전에 "가장 이른 정의보다 뒤인데 덮는 정의 없음 → 빈 값" 이던 시점이 소급 대상이 될 수 있다). **취소 버전은 없던 것으로 본다(사용자 결정)**: 이 경우는 확정 취소 → 1.000 기준 복원(취소 버전에서 열린 행을 닫는다) → 재추가라는 정상 흐름에서 생기며(확정 취소는 선분 행을 정리하지 않는다), 투영 뒤 결과는 취소 버전 행을 지운 원장(DRAFT 삭제와 같은 결과)과 같다. 이미 확정된 가운데 RELEASED 버전의 판정이 배포 한 번으로 바뀔 수 있고, 시험 `CodeRowsProjectionTest#취소_버전은_없던_것으로_본다_…` 가 그 변화를 못박는다 (4) 범위는 피드만이다 — `MdmCodeLookup` 은 원장 그대로 두고, 같은 조회를 쓰는 룰 저장 검사 `CodeReferenceCheck`(초안을 포함한 원장 기준 검사일 수 있다)는 바꾸지 않는다. 그래서 MDM 안의 원장 기준 판정에는 초안 카테고리 소급이 그대로 남는다
- **Rationale**: 업무 모듈 판정은 RELEASED 만 쓰므로 초안 행은 캐시 메모리와 조회(행 필터) 시간만 늘린다. 판정 의미를 엔진 한 곳(투영 함수)에 두면 피드·사본이 같은 규칙을 쓰고, 동등성 시험으로 RELEASED 판정이 바뀌지 않음을 고정할 수 있다. 원장 조회 자체를 고치면 초안을 봐야 하는 원장 검사의 의미까지 바뀐다
- **Reversible**: yes(피드 한 줄 — 투영 호출을 빼면 원본 전체로 돌아간다. 캐시는 메모리에만 있어 재기동·수명으로 바뀐다)
- **Source**: 조정 세션 작업 지시(2026-10-03, 로컬 `mdm.db` PROC_CD 실측), 엔진 `CodeLookup.CodeVersionRow` 계약 주석, 시험 `CodeRowsProjectionTest`(규칙별·동등성·결함 고정)·`MdmMetaFeedContractHttpTest#CODE_피드는_DRAFT_버전과_초안_사본_행을_싣지_않는다`, 스펙 [`2026-10-02-mdm-meta-cache-design.md`](../superpowers/specs/2026-10-02-mdm-meta-cache-design.md) §3.4·§4.1

## D-153 (2026-10-03T08:10:00Z)
- **Phase**: build(룰 세트 편집 캔버스 — 화면 길잡이)
- **Decision needed**: 룰 세트 편집 캔버스는 화면 이동에 한계가 없어(트랙패드 두 손가락 스크롤·[손] 끌기) 흐름도에서 멀리 떠나면 흐름도를 찾기 어렵다. 미니맵은 흐름도와 보이는 영역을 함께 담도록 줄어들어 멀리 갈수록 흐름도가 점이 되고, [화면 맞춤] 은 단축키가 없다
- **Decision made**: (1) 이동 한계 — 흐름도(노드·메모·그룹) 경계 상자를 사방으로 "캔버스 한 화면 − 80px" 만큼 넓힌 영역을 React Flow 저장소의 translateExtent 로 넣는다(`canvas/ViewportGuard.tsx`·`canvas/viewport-guard.ts`). 넓히는 양은 배율로 나눈 흐름 좌표라 배율·캔버스 크기·경계 상자가 바뀔 때마다 다시 넣는다. 가장 멀리 가도 경계 상자가 화면 가장자리에 80px 남는다. ReactFlow 에 translateExtent prop 은 주지 않는다(StoreUpdater 가 undefined 는 건너뛰어 덮어쓰지 않는다). 노드를 경계 밖으로 끌면 경계 상자가 커져 한계도 넓어진다. 한계는 휠·끌기·확대 단추·미니맵 끌기·끌기 자동 이동에 걸리고, 화면 맞춤·노드로 이동(d3 transform)은 거치지 않지만 목표가 흐름도 안이다. d3 는 한계를 바꿔도 지금 화면을 다시 맞추지 않으므로, 경계 상자·캔버스 크기가 바뀌고 400ms(화면 맞춤·노드로 이동 애니메이션보다 길게) 더 바뀌지 않으면 — 노드·화면 끌기·영역 선택 중이 아니면 — 화면이 한계 밖인지 보고 d3 constrain 으로 한 번 맞춘다(접기·지우기·되돌리기·자동 정렬 뒤 다음 휠에서 튀지 않게, 리뷰 I1) (2) 단축키 — Shift+1 화면 맞춤, Shift+2 고른 것으로 이동(Figma 와 같다, 세 모드 모두). Shift+숫자는 자판마다 e.key 가 달라 물리 키(`Digit1`·`Digit2`)로 본다. 고른 것으로 이동은 React Flow 로 고른 노드·메모·그룹, 없으면 단일 선택(노드, 선이면 양 끝 노드)에 맞추고, 접힌 블록 안 노드는 접힌 상자로 바꾼다. 배율은 지금 배율과 1 배 중 큰 쪽을 넘지 않는다. 고른 것이 없으면 키를 쓰지 않는다. 툴바 [화면 맞춤] 툴팁과 단축키 도움말 표에 적는다 (3) 화면 밖 안내 — 화면에 걸친 노드·메모가 하나도 없으면(그룹 틀은 세지 않는다) 캔버스 가운데에 「흐름도가 화면 밖에 있습니다.」와 [흐름도로 돌아가기 ⇧1] 을 띄운다. 이동 한계가 있어도 경계 상자 안의 빈 곳만 보이는 경우(ㄱ자 흐름 등)를 위한 안전장치다. 화면 밖 상태가 300ms 이어질 때만 띄운다(처음 그린 뒤 화면 맞춤 전 한 순간·빈 곳을 스치는 이동에 깜빡이지 않게). 안내 상자는 `nopan` 이고 단추는 mousedown 기본 동작을 막는다(Local-Rules §19)
- **Rationale**: 길을 잃은 뒤 돌아오는 수단보다 처음부터 멀리 가지 못하게 하는 쪽이 효과가 크다. 저장소 구독은 작은 자식 컴포넌트만 다시 그려 캔버스 본체는 화면 이동마다 다시 그리지 않는다. 화면 가장자리 방향 화살표·미니맵 축소 방식 변경은 한계·안내가 있으면 쓸 일이 거의 없어 넣지 않았다
- **Reversible**: yes(화면만, 저장 형식·서버 변경 없음)
- **Source**: 사용자 요청 2026-10-03 "룰 세트 편집에서 화면 뷰가 다른 곳으로 멀리 가면 다이어그램을 찾기가 너무 힘들다", 세 방법 제안에 사용자 승인("진행해")

## D-154 (2026-10-03T11:35:51Z)
- **Phase**: build(MDM 메타 캐시 — 정의@버전 본문 + 목차 + 코드 색인)
- **Decision needed**: 업무 모듈 캐시가 정의의 RELEASED 전 이력을 키 하나에 담아, 코드 1,000개·1,000버전에서 84.6 MB 를 쓰고 isMember 한 번에 2.8 ms 가 든다(스펙 부록 A). 현재 적용 중인 버전 하나만 필요한데 전 이력을 받고 해석한다
- **Decision made**: (1) 목차 키 `X` + 본문 키 `X@ver`(ver 는 scale 3 문자열, 예 `X@1.000`)로 나눈다. 대상은 코드·룰·룰 세트·전문 넷이다 (2) 피드 `metaFeed/view` 에 `part=TOC|BODY`·`at`·`current` 를 더한다. `part` 없는 요청의 응답은 글자 그대로다(JSON 정규화 뒤 비교 — BigDecimal 자리수·칸 순서까지, 골든 시험 `MetaFeedLegacyGoldenTest`) (3) 엔진에 `CodeVersions.select` 공개, `CodeLookup.codeAt` default, `CodeVersionSlicer`(TABLE 카테고리 소속을 합성 cateItems 로 싣는다)를 두어 판정 의미를 엔진 한 곳에 둔다 (4) 코드 본문은 카테고리 소속을 MDM 이 미리 계산해(`all`/`members`) 싣고, cactus 는 해시 색인과 `CodeEffLookup` 으로 판정한다. 목차가 있는 코드에는 `CodeEffLookup` 이 빈 값을 주지 않는다는 불변식을 지킨다 (5) 무효화는 기록기 그대로이고 정의 키 단위로 묶음(목차 + 본문들)을 지운다. 지움 기록(늦게 도착한 본문 적재 차단)은 정의 키 하나로 남긴다 (6) 수명: 목차와 지금 적용 중인 최종 본문은 `max-idle`, 지난·예약 본문은 `old-version-max-idle`(기본 10분). 최종 판정은 묶음에 기억한 다음 경계(적용 시작·끝)까지 다시 하지 않는다 (7) 옛 MDM 의 두 신호(모르는 `part` 를 무시 (가)·거부 (나))를 모두 처리해 cactus 가 전 이력 응답에서 목차·본문을 만들어 물러난다. 설정 `versioned-feed: auto|off`(기본 auto, 재기동해 반영)이고, 결정 P12 로 다음 릴리스에 지운다. 실측: 모르는 params = 무시(Task 1, 커밋 04c8b766) (8) `MASTER_AT` 의 base_dt 는 해석되는 값만 그 시각의 본문을 미리 받는다(결정 P8). MDM 장애 중 적용 경계를 지나면 새 최종 버전 본문이 캐시에 없어 받을 수 없음이 되고(`on-unavailable: REJECT` 면 저장 거부), 직전 버전으로 대신 판정하지 않는다 — 이 후퇴를 받아들인다(결정 P9, 스펙 §5.9)
- **Rationale**: 스펙 §1.2 벤치에서 현재 버전 본문은 0.83 MB 이고 색인 판정은 6 ns 였다. 판정 의미(버전 고르기·카테고리 소속)를 엔진 한 곳에 두면 MDM 과 업무 모듈이 같은 결과를 내고, 동치 시험으로 고정할 수 있다
- **Reversible**: yes(cactus `versioned-feed: off` + 재기동. MDM 은 `part` 없는 경로가 그대로라 되돌릴 것이 없다)
- **Source**: 스펙 [`2026-10-03-mdm-meta-cache-per-version-design.md`](../superpowers/specs/2026-10-03-mdm-meta-cache-per-version-design.md)(사용자 승인, 결정 P1~P13), 계획 [`2026-10-03-mdm-meta-cache-per-version.md`](../superpowers/plans/2026-10-03-mdm-meta-cache-per-version.md), 시험 `CodeVersionSlicerTest`·`MetaFeedLegacyGoldenTest`·`MetaFeedVersionedHttpTest`·`MdmMetaCacheVersionedTest`·`MdmMetaServiceVersionedTest`·`MdmVersionedEquivalenceTest`·`MdmMetaFeedContractHttpTest`
