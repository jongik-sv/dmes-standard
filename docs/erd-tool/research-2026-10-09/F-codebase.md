# F-codebase: ERD 구상이 기대는 기존 자산 조사 (2026-10-09, 읽기 전용)

경로 약어: MDM_V1 = src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle/V1__baseline.sql

## 1. MDM 표준 사전 표
- MDM_V1 은 SQLite 원천에서 생성한 Oracle baseline(MDM_V1:1-8, 생성기 src/backend/mdm/tools/oracle-baseline/). 표 39개(CREATE TABLE 39), FK 53개(MDM_V1:1043~, 별도 ALTER), COMMENT ON 0건.
- TB_MDM_TERM (MDM_V1:945-975): TERM_ID PK(identity), TERM_NAME, SENSE_NO(동음이의, UNIQUE(TERM_NAME,SENSE_NO) :1009), DEFINITION, CONTEXT, ENG_NAME, ENG_ABBR(약어, VARCHAR2(50), IX :1000), SYNONYMS/ALIASES/SYSTEMS(JSON CHECK), STD_BASIS, OWNER_DEPT/OWNER_ID, SRC_ORIGIN, EMBEDDING BLOB(KURE), 감사 9칼럼. = 구상 문서의 "단어 사전" 역할.
- TB_MDM_DOMAIN (:457-493): DOMAIN_ID, DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID(상속 계층), DOMAIN_KIND(CODE/FLAG 등), DATA_TYPE, LENGTH, SCALE, UNIT_CODE, MARU_CODE_ID(허용코드), STD_RULE/STD_AST, BIZ_RULE/BIZ_AST, TEST_CASES 등.
- TB_MDM_COLUMN (:203-233): COLUMN_ID, COLUMN_NAME(논리명, UNIQUE UX_..._NAME :1008), LABEL_LONG/MID/SHORT, PHYS_NAME(UNIQUE, 50 CHAR), DESCRIPTION, DOMAIN_ID, REQUIRED, DEFAULT_VALUE, REF_KIND/REF_TARGET/REF_CATE_ID, TERM_IDS(JSON: 구성 용어 ID 배열), USAGE_NOTE. 논리명->물리명이 용어 조합으로 만들어진다.
- TB_MDM_COLUMN_SYSTEM (:235-251): (COLUMN_ID, SYSTEM_CODE, PHYS_NAME) PK = 시스템별 물리명 별칭, TRANSFORM, NOTE.
- !! TB_MDM_DICT_SYSTEM (:440-455) 은 "단어 사전"이 아니다. (DICT_CODE='DOMAIN' 만 허용 CHECK, SYSTEM_CODE, NOTE) = 도메인 사전의 시스템 적용 표시. 구상 문서 2절 표에서 DICT_SYSTEM 을 "논리명->물리명 변환 근거"로 적은 것은 부정확. 단어 사전은 TERM 하나뿐.
- 실제 행 수(L_MAIN, MDMAPUSER): TB_MDM_TERM 8,158(ENG_ABBR 있는 것 5,811) / TB_MDM_COLUMN 7,951(DOMAIN_ID 있는 것 7,926) / TB_MDM_DOMAIN 171 / TB_MDM_COLUMN_SYSTEM 11,250 / TB_MDM_DICT_SYSTEM 3.
- 논리명->물리명 자동 변환은 이미 있음 (예상보다 좋은 자산):
  - src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/naming/ColumnNameComposer.java:26-47 `forward(String)`: 덩어리별 왼쪽부터 최장 일치(I2), 미등록 토큰은 `***` 자리표시(I1/I3). `reverse(String)` :50-: 물리명->논리명 최장 일치(I8). 사전은 TermDictionaryLoader.load(termRepository)(support/TermDictionaryLoader.java) -> TermDictionary(198줄, byAbbr/maxAbbrParts).
  - naming/ 패키지 780줄: NamingRules(STD_PHYS_NAME 정규식 ^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$ , 길이 상수), DomainSuggester(물리명->도메인 추천), AbbrSuggester, LabelSuggester, SimilarTermFinder.
  - 서비스: ColumnMngService.compare(...) :290 (FORWARD/REVERSE + 도메인 추천 + 중복 검사), save :350-370 (자리표시자 남으면 NAME_PLACEHOLDER_REMAINS 로 거부).
  - 호출 경로: OASIS `POST /api/mdm/oasis/columnMng/compare` (src/frontend/m-mdm/pages/dma/columnMng/api.ts:94, services/dma/columnMng.bpmn). READ 등급. 요청마다 사전을 전량 새로 읽음(I26) - 입력 중 실시간 호출은 부담 가능(확인 안 됨: 응답 시간 미측정).
- 프론트 단어 분할: 별도 구현 없음(서버 compare 호출). 프론트는 tokens.ts(pages/dma/columnMng/tokens.ts) 표시용.
- 카멜->UPPER_SNAKE 변환(다른 목적): cactus-core .../cactus/mdm/MdmNames.java:12 toPhysName(codeNm->CODE_NM).
- 표준 위반 검사: "값 검증"(필수·타입·길이·소수·허용코드·도메인식·룰세트)만 있음. docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md C1~C9(§2), 서버 cactus-core MdmValidator.check(...)(C4), 화면 shared/mdm-meta. 컬럼 사전은 "테이블 구분 없이 물리명 하나로 전역"(C2 이유, 같은 문서 §2). 즉 "DB 스키마의 컬럼명이 사전 표준에 맞는가"를 검사하는 로직은 없음. ColumnNameComposer.reverse + 사전 조회로 만들 수는 있음.
- 물리 명명 정본: docs/mdm/adr/0001-physical-naming-audit-dialect.md (D1 TB_MDM_{ROLE} 대문자, 제약 PK_/FK_/UX_/IX_/CK_ 이름 규칙, D2 감사 9칼럼 C_USR_ID.. VER). Status PROPOSED 로 남아 있음(방언 부분은 oracle-1007 로 사실상 대체).

## 2. MDM 객체 버전 관리와 잠금
- 설계: docs/superpowers/specs/2026-10-02-mdm-object-versioning-design.md (216줄). ADR docs/mdm/adr/0002-version-confirm-without-approval.md, 0006-object-versioning-major-minor.md.
- 버전 대상 enum 4종: src/backend/mdm/lib/.../mdm/contract/version/VersionTarget.java:10-13 = MASTER_CODE(TB_MDM_CODE_VER), BUSINESS_RULE(TB_MDM_RULE_VER), RULE_SET(TB_MDM_RULE_SET_VER), LAYOUT(TB_MDM_LAYOUT_VER; 헤더 레이아웃 포함). 모두 VER scale 3(1.000 형식), major/minor.
- 상태: DRAFT/REQUESTED/APPROVED/RELEASED/CANCELLED 중 실사용 DRAFT, RELEASED (설계 §4.1). 부모는 CREATED/INUSE/DEPRECATED. 적용 구간 APPLY_FROM/APPLY_TO, 참조는 판정 시각의 RELEASED 해석(K1).
- 표준 칼럼 규약(설계 §4.1; TB_MDM_CODE_VER MDM_V1:166-): <객체ID>+VER 키, VER_KIND, STATUS, BASE_VER, OWNER_ID, APPLY_FROM/TO, REQUESTED_*, RELEASED_AT, ROW_VERSION. 버전 행에 JSON 정의를 두는 방식(RULE_SET_VER, K6) 또는 자식 표 키에 VER 를 넣는 방식(레이아웃) 중 선택.
- 잠금: 별도 잠금 표 없음. "DRAFT 소유자 선점(OWNER_ID)" + 낙관적 ROW_VERSION. DraftOwnershipService(contract/version/DraftOwnershipService.java): acquire/release/handover(expectedRowVersion 인자). 구현 common/version/DefaultDraftOwnershipService.java, VersionRowStore.java(칼럼명 고정), VersionWriteGuard(미적용 버전 하나만 MDM006), ApplyFromOrderCheck, VersionConfirmCheckSpi/VersionDraftDeletionSpi(대상별 SPI, 없으면 fail-closed). 화면 공통: m-mdm/src/shell/VersionActionBar, VersionStatusBadge, DraftLockBadge. 권한 action: copy/delete/lock/unlock/handover/confirm.
- 즉 "비관적 소유권 + 낙관적 버전 번호" 혼합. 같은 DRAFT 를 한 사람만 편집하고 다른 사람은 읽기 전용.
- ERD 모델을 얹는다면 추가할 것(판단): (a) VersionTarget 에 ERD_MODEL 하나 추가 + DefaultVersionTableRegistry 에 행 + VersionConfirmCheckSpi/DraftDeletionSpi 구현(없으면 fail-closed). (b) TB_MDM_ERD_MODEL(부모)/TB_MDM_ERD_MODEL_VER(표준 칼럼 규약 + 모델 JSON 또는 자식 표 VER 키) 새 V 파일. (c) 권한 시드(copy/lock/confirm 등)와 화면 VersionActionBar 재사용. 주의: 버전 단위가 "모델 전체"이면 DRAFT 한 명만 편집 가능(동시 편집 제약, 룰세트와 같음), "표 단위"로 쪼개면 엔진이 단일 객체ID 키라 맞지 않음. 확정(RELEASED)=Flyway 초안 생성 시점으로 대응시키는 것이 자연스러움. 객체 ID 가 레이아웃은 INTEGER 라 숫자 바인딩 플래그 이슈가 있었음(설계 §4.2).
- 전제 정정: 구상 문서 3절의 "잠금 방식을 다시 쓴다"는 가능하지만 엔진이 MDM 모듈(lib) 안에 있고 계약 패키지 contract/version 이므로 ERD 도 mdm 모듈 안에 두는 것이 가장 쉽다.

## 3. Flyway 구조
- 정본 스킬: .claude/skills/flyway-migration-add/SKILL.md (+ scripts/migration_tool.mjs status/scaffold). 규칙: 위치(스키마 폴더)별 독립 번호 = 최대+1, 머지된 V 파일 불변(체크섬), 스키마마다 주인 앱 하나(docs/oracle-1007/schema-owners.md), Oracle 하나(방언 폴더 없음). 운영/개발계는 앱 Flyway 꺼짐, DBA 가 같은 V 파일 순서 적용.
- V 파일 위치(archive 제외, git 추적, find 결과): 13개 위치, V 파일 총 23개.
  - aps-core/db/migration/aps-core: V1 (1)
  - caravan-hub: caravanuser V1, ifuser V1 (각 1)
  - mcm-core/db/migration/oracle: mcmapuser V1~V9(9), mcaapuser V1, mcm_source V1, mcm_backup V1
  - mdm/api/.../db/migration/mdm/oracle: V1~V4 (4)
  - mls, mpn, mpp, mqc: 각 V1 (1)
  - (src/backend/mcm/archive/... 는 보관)
  => 대부분 V1 baseline 뿐. 증분 이력이 쌓인 곳은 mcmapuser(9), mdm(4) 뿐이라 "Flyway 를 정본으로 diff 생성"은 지금은 baseline 위주.
- 숫자 재계산 (정규식 `^\s*CREATE (GLOBAL TEMPORARY )?TABLE`):
  - git 추적 *.sql 전부(221개 파일): CREATE TABLE 389건(첫 grep -c 방식 377), 이름 중복 제거 159개.
  - archive/ 제외: 185건/117개. 실제 Flyway V 파일(archive 제외 23개): 114건/109개.
  - 구상 문서의 "350건/136개"는 재현 안 됨(작업 트리 기준 혹은 다른 패턴 추정, 확인 안 됨). 실제 로컬 DB 표 수는 123개(아래 4번)로 가장 신뢰할 숫자.
  - COMMENT ON COLUMN 54건 확인(grep). 단 전부 src/backend/caravan-core/docs/SQL/TB_MCM_MOM_TC_ERROR.sql(30)·TB_MCM_MOM_KAFKA_TOPICS.sql(26)에 있고 Flyway V 파일에는 0건. COMMENT ON TABLE 은 2건. 즉 실제 DB 에는 코멘트가 사실상 0(4번 SQL 확인).
  - V 파일 중 FK 정의가 있는 것은 MDM V1(53)뿐.
- Oracle 서식 규칙: docs/guide/Database/oracle-sql-rules.md  §1 원칙(:7), §2 실수 모음(:16), §3 권장 구문(:33), **§4 쿼리 서식(:149)** (대문자, 절 키워드 맨 앞, 본문 7열, 앞 쉼표, 쉼표 조인 (+), 샘플 docs/guide/Database/samples/). 주의: §4 는 "쿼리" 서식이고 CREATE TABLE(DDL) 서식 규칙은 별도로 없음. 기존 V1 의 DDL 은 4칸 들여쓰기·칼럼 정렬 스타일(MDM_V1 참조). DDL 생성기를 만들 때 맞출 기준은 MDM_V1 의 모양 + flyway 스킬 §4(대문자 식별자, VARCHAR2(n CHAR), NUMBER(1)+CHECK, TIMESTAMP(6), 23ai 전용 구문 금지).

## 4. 로컬 Oracle (읽기 전용 SELECT)
- 접속: 컨테이너 oracle-26ai-free(podman ps: Up 47h, 1521). `podman exec -i oracle-26ai-free sqlplus -s MDMAPUSER/<로컬 비밀번호>@//localhost:1521/L_MAIN < 파일.sql`. (scripts/oracle/README.md 의 비밀번호 규약; pdb.mjs list 로 L_MAIN READ WRITE 확인, 다른 PDB 는 MOUNTED). MDMAPUSER 는 ALL_* 로 타 스키마 메타를 볼 수 있음. 컨테이너/PDB 상태는 건드리지 않음. SQL 은 SELECT 만 실행(스크립트: scratchpad/erd/q1.sql, q2.sql).
- 스키마별 USER_TABLES(=ALL_TABLES owner별): APSAPUSER 2, CARAVANUSER 5, IFUSER 2, MCAAPUSER 3, MCMAPUSER 56, MCM_BACKUP 3, MCM_SOURCE 4, MDMAPUSER 40, MLSAPUSER 2, MPNAPUSER 2, MPPAPUSER 2, MQCAPUSER 2 = 합계 123 (MDM 40 = V1 39 + flyway_schema_history).
- 칼럼 코멘트 채워진 비율: 모든 스키마 0/전체 (APS 0/15, CARAVAN 0/89, IF 0/29, MCA 0/49, MCM 0/870, MCM_BACKUP 0/48, MCM_SOURCE 0/70, MDM 0/756, MLS 0/15, MPN 0/16, MPP 0/15, MQC 0/15). 표 코멘트도 0. => 논리명은 DB 에서 전혀 못 얻음 (구상 문서의 "54건뿐"보다 더 나쁨: 실제 0).
- FK(CONSTRAINT_TYPE='R'): MDMAPUSER 53, 나머지 전 스키마 0. PK 는 전 스키마 있음(MDM 40, MCM 56 ...), UNIQUE: MCM 3, MDM 2. => MCM(56표)·SEC 등 MDM 밖은 FK 가 전혀 없어서 관계선을 DB 에서 얻을 수 없음. 관계선 출처 후보: (1) MDM 은 DB FK 사용, (2) 나머지는 컬럼명 규칙 추정(같은 PHYS_NAME 이 다른 표의 PK 일 때) 또는 JPA 엔티티 @ManyToOne/@JoinColumn(확인 안 됨: 사용 정도 미조사), MyBatis/JOIN SQL 의 조인 조건, 수동 입력. docs/mdm/erd/*.mmd 에 MDM 관계 mermaid 가 이미 있음(아래 8).
- 표준 사전 대 실제 컬럼명 일치 (L_MAIN):
  - 실제 DB 의 서로 다른 컬럼명 547개 중 TB_MDM_COLUMN.PHYS_NAME 과 일치 79개(14%), COLUMN_SYSTEM 별칭까지 포함하면 317개(58%).
  - MDM 외 스키마(MCMAPUSER·MCAAPUSER·MCM_SOURCE·CARAVANUSER·IFUSER): 서로 다른 컬럼명 346개 중 134개(39%) 일치(사전 PHYS_NAME 또는 COLUMN_SYSTEM). 칼럼 행 기준 1,122행 중 791행(70.5%) 일치.
  - 해석: 감사 9칼럼(C_USR_ID..)·흔한 칼럼이 많은 행을 차지해 행 기준은 높고, 종류 기준은 낮음. 사전은 7,951컬럼(위젯·화면 키 위주로 채워짐)이라 DB 컬럼 가져오기 때 상당수가 "표준 위반(사전에 없음)"으로 표시될 것. MDM 자체 테이블 대비 일치율은 따로 안 구함.

## 5. 룰 세트 편집기 재사용성 (src/frontend/m-mdm/pages/dme/ruleSetEdit/)
- 구상 문서와 다른 점: FindWidget/shortcuts/ContextMenu/ViewportGuard/align/route-path 는 모두 canvas/ 아래에 있음(flow-layout.ts 만 상위). canvas/ 파일 수 약 30개, FlowCanvas.tsx 2,705줄 / nodes.tsx 751줄 / flow-layout.ts 942줄(상위 폴더 flow-edit.ts 92KB, flow-model.ts 34KB 와 얽힘).
- 결합도 (import 기준):
  - canvas/react-flow.ts(4줄): `export * from "@xyflow/react"` + CSS. 순수 재수출 -> 그대로 이식.
  - canvas/route-path.ts(362줄): "React 의존 없음". 유일한 import 는 `type FlowPos` (../flow-edit) = {x,y} 타입 뿐 -> 거의 무수정 재사용(타입만 교체).
  - canvas/snap.ts(173), viewport-guard.ts(88): 외부 import 없음 -> 그대로 재사용.
  - canvas/shortcuts.ts(137): `type FlowMode`(../state/useRuleSetEdit)만 의존; ShortcutId 에 디버거 단축키(continue/stop/step/breakpoint) 포함 -> ID 일부 제거 필요, 작은 수정.
  - canvas/ContextMenu.tsx(200): `MenuItem`(./context-menu) 만 의존 -> 재사용 쉬움. context-menu.ts(126)는 EditFlow·RuleIoMap·NodeColor 등 룰세트 타입에 묶임 -> ERD 용으로 새로 작성.
  - canvas/ViewportGuard.tsx(124): FlowToolbar 의 keepFocusOffButtons, ./shortcuts 의 isShown 의존 -> 약한 결합.
  - canvas/FindWidget.tsx(152): state/useFind 타입, FlowToolbar·ToolButton, @dk-oasis/shared/form Input -> 약한~중간.
  - canvas/align.ts(149): ../flow-layout(foldOffsetX,nodeSizeOf,SpaceBlocks), ../flow-edit(blockMembers,setPositions,shiftRoutes,EditFlow) -> 룰세트 흐름 모델에 강결합. 정렬 수학만 추출해 새로 쓰는 편이 빠름.
  - flow-layout.ts(942): `import dagre from "@dagrejs/dagre"`(:6) 하지만 RuleSetFlow·FlowNodeKind(engine-contract.generated), flow-model 의 Seq/Split/Guarded 구조(분기·접기·catch) 위주 -> dagre 호출 부분은 :207-241 (graphlib.Graph, dagre.layout)이 전부라 ERD 용은 20줄 정도로 새로 짜는 게 낫다. 저장 좌표가 자동 배치를 덮는 구조(positionsOf :681, "view.positions" :3)는 개념만 재사용.
  - FlowCanvas.tsx(2,705줄)는 룰세트 업무와 강결합 -> 통째 재사용 불가, 참조용.
- 버전: m-mdm/package.json:109 `@dagrejs/dagre ^3.1.1`(설치 3.1.1), :112 `@xyflow/react ^12.12.0`(설치 12.12.0). 다른 패키지(shared·m-*)에는 xyflow/dagre 의존성 없음.
- @dk-oasis/shared 의 캔버스·다이어그램 부품: 없음. shared/src/components 에 card, charts, closable-tabs, grid, tree, transfer-list, variable-table, matrix-table, markdown-editor(MermaidDiagram.tsx·MermaidViewer.tsx·mermaid-blocks.ts 있음) 등 - mermaid 렌더(읽기용)만 있음. xyflow 캔버스 부품은 전부 m-mdm 화면 폴더 안.
- 판단: ERD 캔버스는 (1) react-flow.ts, route-path.ts(둥근 꺾은선), snap.ts, viewport-guard.ts, ContextMenu.tsx 는 shared 로 거의 복사 가능, (2) shortcuts 는 소수정, (3) align/flow-layout/FlowCanvas 는 새로 작성. shared 에 @xyflow/react·@dagrejs/dagre 의존성을 새로 추가해야 함(CLAUDE.md: 새 컴포넌트 등록은 묻지 않고 진행, mantine-aggrid-ui 스킬 문서·색인 갱신 필요).

## 6. 기존 DB 관련 화면
- analog DB 뷰어: ADR docs/guide/adr/0002-analog-readonly-db-viewer.md(ACCEPTED 2026-10-08). BE src/backend/analog/api/.../web/DbViewerController.java(@RequestMapping("/db"), :27): GET /db/tables?schema=, GET /db/columns?schema=&table=, POST /db/query(자유 SELECT 단문, 서버가 재조립), POST /db/lob. 서비스 db/DbViewerService.java(765줄): COLUMNS_SQL(:46-80) 이 ALL_TAB_COLUMNS + ALL_CONS_COLUMNS/ALL_CONSTRAINTS 로 **PK_YN·FK_YN·FK_REF(참조 스키마.표)** 를 칼럼 속성과 함께 돌려줌. FE m-analog/src/anl/db-viewer/ (db-viewer-api.ts:20 BASE="/api/analog/rest/dbViewer/query"; db-menu-tree.tsx, db-sql-editor.tsx, analog-db-viewer.tsx; 페이지 m-analog/pages/anl/dbViewer.tsx).
- 제약: 읽기 전용·200건·10초·민감 칼럼/표 차단(D3·D7). 허용 스키마는 설정 analog.db.allowed-schemas (application.yml:12 기본 MCMAPUSER,MCM_SOURCE,MCM_BACKUP,MCAAPUSER,MDMAPUSER; ADR D2 본문은 MCM 4개라 문서보다 설정이 MDMAPUSER 를 더 허용). 인증 X-Client-Key + X-Authenticated-User. 코멘트(ALL_COL_COMMENTS)·PK 순서·FK 칼럼 매핑(양쪽 칼럼 쌍)은 안 줌, FK_REF 는 칼럼당 하나만.
- 재사용 판단: ERD P1 의 "DB 읽어 가져오기"에 /db/tables, /db/columns 를 그대로 호출할 수 있고(표 목록·칼럼 타입·PK·FK 참조 표) 서버 쪽 딕셔너리 SQL(COLUMNS_SQL, DbViewerService.java:327 부근 제약 조회)을 모델 가져오기 서비스로 참고할 수 있음. 부족한 점: FK 의 구체 칼럼 쌍·복합 FK, 인덱스·UNIQUE·CHECK·DEFAULT·IDENTITY, 코멘트, 허용 스키마 외 접근. ERD 가져오기는 analog 앱(관리자 도구)이 아니라 MDM 쪽 서비스에 딕셔너리 읽기를 새로 두는 것이 권한·스키마 허용 면에서 현실적(스키마 소유표 docs/oracle-1007/schema-owners.md 상 MDM 앱은 타 스키마에 SELECT ANY TABLE 권한이 로컬 한정이고 운영은 DBA GRANT 필요 - 확인 안 됨: 운영 권한).
- 표·칼럼 메타 조회 API 별도: MDM 메타 캐시(/api/{module}/mdmMeta/columns·domains, cactus-core MdmMetaController)는 MDM 사전 쪽이고 DB 딕셔너리가 아님.

## 7. MCP·CLI 기반
- MCP 서버: 리포 안에 없음(modelcontextprotocol/McpServer/.mcp.json 검색 결과 없음; 매치는 스킬 테스트 fixture 등 무관 문서뿐).
- .mjs 로 백엔드를 부르는 선례 있음: scripts/mdm-meta/register-columns.mjs(15KB). MDM BE 직접 호출: `POST {base}/api/mdm/oasis/{service}/{action}`(:69), 기본 base http://localhost:8096, 헤더 X-Client-Key(env BACKEND_CLIENT_KEY, 로컬 기본값 <로컬 client key>), X-Authenticated-User(--user 사번), X-Authenticated-Role(기본 MDM_STD_ADMIN) (:74-76). dry-run 기본, --apply 에서만 save. 즉 CLI/MCP 가 쓸 인증 = 포털 JWT 가 아니라 BFF 를 우회한 client-key + 사용자/역할 헤더(cactus-core security/filter/ClientKeyFilter.java). 로컬 전용 편법에 가깝고 운영에서 CLI 가 쓸 사용자별 토큰 방식은 정해진 것 없음(확인 안 됨).
- 그 밖: scripts/perf/render/*.mjs(성능 측정), .claude/skills/coordinator(js 이식 진행 중, 메모리 skill-scripts-in-js).
- 관련 스킬 legacy-rule-import 는 레거시 룰엔진 수식 조회/이관(MDM 컬럼 사전·DRAFT 룰) - CLI 형태 선례.

## 8. 기타 문서/결정 기록
- docs/mdm/erd/ : 영역별 Mermaid ERD(02-term-domain-column.mmd, 03-interface-layout, 04-master-code, 05-master-data, 06-business-rule)와 *.sqlite.sql (SQLite 원천이라 Oracle 기준으로는 구식), README.md, verify/. MDM 한정.
- docs/mdm/naming-dialect-rules.md(26.7KB, 규칙표), docs/mdm/adr/0001..0007 (0004 MSSQL 운영 가정 폐기, 0006 객체 버전 major/minor, 0007 메타 캐시), docs/mdm/decisions.md(251KB 결정 로그).
- docs/oracle-1007/ : schema-owners.md(스키마 소유·Flyway 주인), SUMMARY.md, spike.md, memo-ora-*.md (Oracle 전환 기록). 스키마 관리 결정의 정본은 이 폴더 + flyway-migration-add 스킬. 별도 "Flyway 도입" ADR 은 docs/guide/adr 에 없음(0001 UI 라이브러리, 0002 analog DB 뷰어뿐).
- 테이블 정의서(전 모듈): 찾지 못함. docs/mdm-column-dict/ 는 사전 후보(dict-candidates·dict-std 등) 자료. docs/guide/Database/ 에 Oracle 가이드류. 
- docs/idea.md 가 있음(이번 조사 대상 아님).
- Flyway 도구: scripts/oracle/pdb.mjs template-schema(dev 의 모든 V 파일을 템플릿 PDB 에 적용) - ERD 가 생성한 V 파일 검증에 그대로 쓸 수 있음.

## 구상 문서와 다른 점 요약
1. TB_MDM_DICT_SYSTEM 은 단어 사전이 아님(도메인 사전의 시스템 적용 표, 3행). 단어 사전은 TB_MDM_TERM(8,158행).
2. 논리명->물리명 최장 일치 변환(ColumnNameComposer)과 도메인 추천이 이미 서버에 있음(OASIS columnMng/compare). 구상의 2절·P2 가 새로 만들 필요 없음.
3. 숫자: CREATE TABLE 350/136 재현 안 됨(추적 파일 389/159, archive 제외 185/117, V 파일만 114/109, 실제 DB 123표). COMMENT ON COLUMN 54건은 맞으나 Flyway 에 0건, 로컬 DB 코멘트 0%.
4. DB FK 는 MDM(53)에만 있고 MCM 56표 등 나머지 0 -> 관계선 출처가 문제.
5. 버전 엔진은 4종 한정, 잠금은 DRAFT 소유자 선점 + 낙관적 ROW_VERSION(잠금 표 없음), mdm 모듈 계약 패키지 안.
6. 룰 세트 캔버스 부품 경로는 canvas/ 하위. route-path·snap·viewport-guard 는 거의 순수 함수, align·flow-layout 은 룰 모델에 강결합, shared 에는 캔버스 부품이 없다. xyflow 12.12.0 / dagre 3.1.1 은 m-mdm 에만 의존성.
7. analog DB 뷰어가 PK/FK 참조까지 주는 딕셔너리 API 를 이미 가짐(코멘트·복합 FK 는 없음).
8. MCP 는 리포에 없고, CLI 선례는 register-columns.mjs(client-key + 사용자 헤더).
