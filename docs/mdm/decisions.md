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

## D-106 (2026-09-30T00:00:00Z)
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

## D-107 (2026-09-30T00:00:00Z)
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

## D-108 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 1단계)
- **Decision needed**: 목록·한 줄 입력도 흐름 파서를 거치게 하면서(D-106 D12) 생기는 행동 변화를 어떻게 다룰지
- **Decision made**: 아래 세 가지 변화를 받아들이고 기록한다.
  1. 목록·한 줄 입력에 null·공백 룰 ID 가 있으면 예전 `RULE_NOT_FOUND` 대신 `FLOW_STRUCTURE`(분석기)·`FLOW_INVALID`(엔진)가 된다.
  2. `ORDER` 문구의 later 목록에서 중복을 뺀다.
  3. 목록 화면의 `FLOW_STRUCTURE` 문구에 합성 노드 ID(`r1`…)가 남는다.
  운영 저장 경로는 `RuleIdRules` 가 null·공백·중복을 먼저 막으므로 위 1~3 에 실제로 닿기 어렵다
- **Rationale**: 목록 세트를 한 줄 흐름으로 바꿔 한 경로로 검사·실행하면 코드가 한 벌이다. 바뀌는 곳은 저장 경로가 이미 막는 입력뿐이라 운영 영향이 없다
- **Reversible**: yes(코드 변경만으로 되돌릴 수 있다)
- **Source**: D-106 D12, `RuleSetAnalyzer`, `RuleIdRules`, 엔진 `FlowParser`

## D-109 (2026-09-30T00:00:00Z)
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
