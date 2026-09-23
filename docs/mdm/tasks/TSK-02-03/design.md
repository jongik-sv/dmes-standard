# TSK-02-03 설계 — 영역별 DB(ERD) 설계 (02·03·04·05·06)

> category design · domain database · 작성 2026-09-24 (Design Phase, 무인 모드)
> 입력: `spec.md` · PRD.md §2·§4 · TRD.md §4 · `naming-dialect-rules.md`(정본, TSK-02-01) · `decisions.md` D-001~D-019 · `adr/0001~0003` · `wbs.md` v1.3 · 원천 설계 `/Users/jji/project/mdm/docs/design/basic/02~06.md`(+html·sql) · `docs/mdm/tasks/TSK-02-01/design.md`(형식 참고)
> 근거 강약: spec 본문 > 승인된 선행 산출물(TSK-02-01 4건, dev 머지) > 리포 기존 관례 > 미승인 선행 산출물
> **운영 판단**: docs 특례. `src/` 변경 0. 테스트 전략 = 실행 가능한 검증 스크립트(§3) + 문서 체크리스트 + `testAll` 회귀. Refactor 생략.

---

## 0. 조사로 확인한 사실 (Build 가 원천 문서를 다시 읽지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | 02~06 원천 문서는 전부 "논리 설계 수준"이며 실제 `CREATE TABLE`/`PRIMARY KEY`/`REFERENCES`/`CHECK(...)` 구문이 없다(grep 0건). 표+산문으로만 PK·FK·제약을 서술한다. NOT NULL·기본값이 명시되지 않은 칼럼이 많다(표마다 "불명확" 표기 다수) | 02:762, 03 전체, 04:967, 05:601, 06:905 |
| F2 | `TB_MDM_SYSTEM` 은 TSK-01-02(공통 계약) 소유다(`system_code` PK, `system_name`, `self_yn` — wbs.md 105·126행). 이 Task 는 `TB_MDM_SYSTEM` 테이블 자체를 만들지 않지만, 원천이 FK 로 적은 자리(04:957·05:594·06:896, 02 ERD 실선, 03:70)는 **인라인 FK 를 건다.** 영역 계약 Task 는 전부 TSK-01-02 에 의존하므로(wbs 의존 순서) 마이그레이션 시점엔 `TB_MDM_SYSTEM` 이 이미 있고, SQLite 는 `ALTER TABLE`로 FK 를 나중에 추가할 수 없어(테이블 재생성 필요) 후행 ALTER 방식(§6.6)을 쓸 수도 없다 — 처음부터 인라인으로 거는 것이 유일한 방법이다. `system_code` 타입은 TSK-01-02 계약이 아직 없어 `CD20`(VARCHAR(20))을 가정으로 둔다 | wbs.md 105·126행, 04:957, 05:594, 06:896, 02:665·ERD, 03:70 |
| F3 | TRD §4.1 은 배포 대상 보류 목록에서 `TB_MDM_COLUMN_SYSTEM` 만 제외(활성)한다. `TB_MDM_CODE_SYSTEM`·`TB_MDM_DATA_SYSTEM`·`TB_MDM_RULE_SYSTEM` 은 보류(DDL만, 엔티티·리포지토리·서비스·BPMN·화면 없음, D-019) | TRD.md:47, decisions.md D-019 |
| F4 | 실측 DB 는 SQLite 뿐이다(2026-09-24 사용자 지시). MSSQL DDL 은 두 방언 요구대로 작성하되 실행·실측하지 않는다. `naming-dialect-rules.md` §3 의 `실측 필요 → TSK-02-03` 행(#2~#5·#19·#20)은 이 Task 가 SQLite 쪽만 확인하고 MSSQL 은 `실측 필요` 로 남겨 각 영역 마이그레이션 Task 로 이관한다 | 오케스트레이터 사실 #3, naming-dialect-rules.md §3·§6.1 |
| F5 | mdm 이 쓰는 SQLite 엔진은 `org.xerial:sqlite-jdbc:3.45.3.0`. 검증은 CLI `sqlite3`(3.50, 버전 다름)가 아니라 이 jar 를 JDK 21 단일 파일 실행으로 쓴다. jar 가 slf4j-api 를 요구하면 Gradle wrapper 배포판의 slf4j-api-1.7.36.jar 를 함께 classpath 에 둔다 | 오케스트레이터 사실 #4 |
| F6 | 02 도메인·컬럼·단위 3표만 배포 대상이고 `TB_MDM_TERM` 은 배포하지 않는다(회의 #144, `chg_seq` 칼럼 없음). `TB_MDM_DICT_SEQ`·`TB_MDM_DICT_SYSTEM` 자체도 배포 대상이 아니다(칼럼은 있지만 이 표들이 배포되는 것은 아니라는 뜻) | 02:670 |
| F7 | 02 "관리 속성"은 두 갈래다. TERM 속성표(02:36-39)는 버전·유효기간·소유부서·담당자·등록출처 5개 전부를 TERM 의 "관리" 구분 속성으로 적는다. DOMAIN 상속표(02:82)는 버전·유효기간만 적고 "**상태·승인·소유자는 두지 않는다**"고 명시한다. 테이블 설계 절 서두(02:762)는 "관리 속성(버전·유효기간)은 공통 모듈에서 일괄 정의하므로 생략"이라 적어 **버전·유효기간만** 생략 대상으로 예시했다. naming-dialect-rules §2 끝 문장은 이 다섯 속성 전부를 "02 원문대로" 이 Task 가 정하라고 위임한다(D3에서 결정) | 02:36-39·82·762, naming-dialect-rules.md:39 |
| F8 | `TB_MDM_TERM.embedding`(vector)·`embedding_model` 은 naming-dialect-rules §3 #23 이 "이 표 범위 밖(TSK-02-02)"으로 명시하고 TRD T6 은 "원장 DB 밖에 둘 수 있다"고 한다. 이 Task 의 DDL 대상이 아니다(D4) | 02:600-601·817-818, naming-dialect-rules.md:74, TRD.md:128 |
| F9 | 03 은 헤더 항목 전체가 아니라 **상수(CONST) 항목의 기본값만** 전문별로 재정의할 수 있다(03:12). 기본값은 EAI 헤더 기본값 → 전문별 재정의 → 송신 시점 AUTO 채움 3층이다(03:24). 재정의 값을 저장할 테이블은 md·html 어디에도 없다(html:303 "재정의 값을 저장할 테이블은 03에 아직 없다 [미결]") — 이 Task 가 신설한다(D2) | 03:12·20·24·84·98, html:280-303 |
| F10 | 03 md 본문은 "전문당 헤더 하나"(`TB_MDM_EAI.header_layout_id` 단일 FK) 모델이다(03:9-11·37·60·69·86). html 목업은 스스로 "이 시안은 기본설계 03이 아직 반영하지 않은 구조를 그린다. 헤더는 구간마다 하나씩 붙고 순서대로 쌓는다"고 명시한다(html:83). 실제 AS-IS 전문(M201)은 GLUE 공통헤더(L100, 100바이트) + L2 구간헤더(L110, 30바이트) 두 겹을 쓴다(html:97·231). spec 의 데이터 모델 절도 "TB_MDM_EAI, TB_MDM_LAYOUT, TB_MDM_LAYOUT_ITEM **(+ 헤더 적층·상수 재정의 테이블)**"이라 적어 적층 테이블 신설을 전제한다 — N=1 이 md 모델을 그대로 재현하는 덧셈적(additive) 모델을 채택한다(D1) | 03:9-11·37·60·69·86, html:83·87-97·231·276-289·549-561, spec.md 데이터 모델 절 |
| F11 | 04 는 두 안(이 문서=전체 방식 vs `04-master-code.md`=변경분 방식) 중 **전체 방식**이 PRD §2 규칙5 로 이미 확정됐다. 따라서 04 는 행 단위 `chg_seq` 를 두지 않고 `TB_MDM_CODE.last_chg_seq` 하나만 둔다(04:967, 「두지 않는 것」 04:1151-1185 "행마다 두는 배포 순번(`chg_seq`) → 대신 `TB_MDM_CODE.last_chg_seq` 하나"). 05 는 반대로 행마다 `chg_seq` NOT NULL 을 둔다(변경분 방식, 05:255). 04·05 가 다른 이유는 배포 방식이 다르기 때문이며 이 차이를 그대로 스키마에 반영한다 | PRD.md:57, 04:967·1151-1185, 05:255 |
| F12 | 04·06 의 `CATE_ITEM → CATE`·`CATE_ITEM → ITEM`(04), `CATE → ITEM` 선분 참조(05)는 **FK 를 걸지 않는다.** from_ver/valid_from 이 행마다 달라 PK 로 FK 를 만들 수 없기 때문이며, "같은 버전(선분)에 유효한가"는 저장 시·상신 시 검사로 앱이 확인한다(원천이 명시) | 04:958-959, 05:162·188 |
| F13 | 06 `TB_MDM_RULE_VER → VAR`, `RULE_VER → ROW` 두 FK 에만 `ON DELETE CASCADE` 가 걸린다(06:896·1154). VAR·ROW 는 서로 다른 자식 테이블로 향하므로 같은 테이블로 가는 cascade 경로가 두 개 이상 겹치는 지점은 없다(SQLite 제약과 충돌 없음). `TB_MDM_RULE_SET.rule_ids`·`TB_MDM_RULE_ROW.cells`·`TB_MDM_RULE_VAR.var_name` 은 모두 FK 가 아니고 저장 시 검사로 대체된다 | 06:896-897·1154 |
| F14 | 06:931 이 언급하는 "05의 `last_key_no`"는 실제 `05-master-data.md`(05:599-703) 어디에도 없다(grep 0건, `TB_MDM_DATA_ITEM` 의 키는 사용자가 입력하는 `code` 다). 06 문서 자체의 오기로 판단하고, 06 은 06 ERD 가 실제로 정의한 `TB_MDM_RULE.last_var_id`·`last_row_id`·`last_case_id` 카운터(06:797-799·931·957)를 그대로 채택한다(D5) | 06:931 vs 05:599-703 재확인 |
| F15 | `TB_MDM_COLUMN.phys_name` 의 DB UNIQUE 여부는 02 본문에 명시가 없다("불명확"). 그러나 03 `TB_MDM_LAYOUT_ITEM.column_phys` 가 "컬럼 사전의 **표준 물리명**"을 참조값으로 적는다(03:80)고 명시하고, PRD FR-A3 이 "물리명 자동 생성·도메인 추천·**중복 검사**"를 요구한다. `phys_name` 이 유일하지 않으면 LAYOUT_ITEM 이 어떤 컬럼을 가리키는지 특정할 수 없으므로 이 Task 가 `UX_TB_MDM_COLUMN_PHYS_NAME` 을 신설하고 이를 LAYOUT_ITEM.column_phys 의 FK 대상으로 쓴다(D6) | 02:637·871, 03:80, PRD.md FR-A3 |
| F16 | 감사 9칼럼(`C_USR_ID·C_AT·C_SVC_ID·C_PGM_ID·U_USR_ID·U_AT·U_SVC_ID·U_PGM_ID·VER`, 전부 NULL 허용)은 `TB_MDM_DICT_SEQ` 를 뺀 이 Task 의 모든 테이블(신설 2개 포함)에 둔다. 타입은 SQLite `TIMESTAMP`, MSSQL `DATETIME2`(C_AT/U_AT), 나머지 `VARCHAR(100)`/`BIGINT`다. 아래 §6 표에는 반복 기재하지 않는다 | naming-dialect-rules.md §2 |
| F17 | `row_version`(낙관적 잠금)이 있는 테이블은 원천 전체에서 `TB_MDM_CODE_VER`·`TB_MDM_RULE_VER`·`TB_MDM_RULE_TEST_CASE`·`TB_MDM_RULE_SET`·`TB_MDM_DATA_ITEM` 5개뿐이다. `chg_seq`/`last_chg_seq`(배포 순번)와는 역할이 다르므로(감사 `VER` 도 별개) 세 값을 모두 원천 그대로 유지한다 | naming-dialect-rules.md §2, 04:904·1008, 06:827·865·874, 05:647 |
| F18 | 02·03·04·05·06 의 물리 예약어 충돌 칼럼: 03 `LAYOUT.version`, `LAYOUT_ITEM.offset`·`length`, 05 `RECV_ITEM.action`, 04·05·06 `RECV.result`. SQLite 는 큰따옴표, MSSQL 은 대괄호로 식별자를 감싸 DDL 을 쓴다(칼럼명 자체는 원천 그대로 유지 — naming-dialect-rules §1 "칼럼 추가·삭제·개명은 이 규칙표의 결정이 아니다") | 원천 03·04·05 칼럼표, T-SQL/SQLite 예약어 일반 지식 |
| F19 | `TB_MDM_DOMAIN.maru_code_id → TB_MDM_CODE`(02→04)는 영역 번호상 02 가 04 보다 먼저 생성되므로 MSSQL 에서 전방 참조 오류가 난다(SQLite 는 인라인 전방 참조를 허용). 03 `TB_MDM_EAI.header_layout_id ↔ TB_MDM_LAYOUT.eai_code` 도 같은 문제가 영역 안에서 발생한다. 두 경우 모두 MSSQL DDL 은 해당 FK 를 CREATE TABLE 밖의 후행 `ALTER TABLE ADD CONSTRAINT` 로 뺀다(D7) | DDL 의존관계 분석, MSSQL CREATE TABLE FK 제약 일반 규칙 |

---

## 1. 접근 방식

이 Task 는 코드를 쓰지 않고 5개 영역(02·03·04·05·06)의 **DB 설계 결정을 표로 확정**해, Build 가 원천 문서를 다시 읽지 않고 `docs/mdm/erd/` 아래 ERD·SQLite/MSSQL DDL 초안과 검증 스크립트를 만들 수 있게 한다. 판단 순서는 다음과 같다. ① spec 이 요구하는 33개 테이블(+ 03 신설 2개)의 칼럼·타입·제약을 **원천 문서를 직접 읽어**(탐색 서브에이전트 보고 + 이 문서 작성자의 원문 재확인) 확정한다. ② 두 방언 표현은 `naming-dialect-rules.md` §1·§3 을 그대로 적용하되, 반복을 줄이기 위해 §6.0 에서 "타입 토큰" 표를 한 번 정의하고 각 테이블은 토큰만 인용한다. ③ 원천이 비워 둔 자리(03 헤더 적층·상수 재정의, 02 관리 속성 5종, TERM 임베딩)는 근거 강도(spec 데이터 모델 절 > 02·03 본문 서술 > PRD 기능요구 > html 목업)로 판단해 `## 담당자 확인 필요 결정`에 D1~D7 로 남긴다. ④ 교차 영역 FK(02→04)와 영역 내부 순환 FK(03 EAI↔LAYOUT)는 SQLite·MSSQL 이 다르게 반응하므로 파일 배치 규칙(§6.6)으로 명시한다. ⑤ 검증은 새 임시 SQLite DB 에 전체 DDL 을 적용하고 원천 칼럼 목록과 대조하는 스크립트로 하며, MSSQL 은 실행하지 않고 정적 대조로 대신한다(F4).

---

## 2. 변경 파일 목록

이 Design Phase 가 만드는 파일은 **이 `design.md` 하나뿐**이다(docs 특례, DDL·ERD 자체는 Build 몫). 아래는 이 설계를 바탕으로 Build 가 생성할 파일 목록이다(§6 이 각 파일의 내용 명세).

### 2.1 Build 생성 예정

| # | 파일 | 내용 | 근거 절 |
|---|---|---|---|
| B1 | `docs/mdm/erd/02-term-domain-column.mmd` | 02 ERD(Mermaid). `TB_MDM_CODE` 참조는 점선(교차영역, §6.6), `TB_MDM_SYSTEM` 참조는 실선 + `"TSK-01-02 소유"` 주석 | §6.1 |
| B2 | `docs/mdm/erd/02-term-domain-column.sqlite.sql` | 02 SQLite DDL 7 테이블 | §6.1 |
| B3 | `docs/mdm/erd/02-term-domain-column.mssql.sql` | 02 MSSQL DDL(`maru_code_id` FK 는 후행 ALTER, §6.6) | §6.1·§6.6 |
| B4 | `docs/mdm/erd/03-interface-layout.mmd` | 03 ERD(신설 2테이블 포함) | §6.2 |
| B5 | `docs/mdm/erd/03-interface-layout.sqlite.sql` | 03 SQLite DDL 5 테이블 | §6.2 |
| B6 | `docs/mdm/erd/03-interface-layout.mssql.sql` | 03 MSSQL DDL(EAI↔LAYOUT 순환은 후행 ALTER, §6.6) | §6.2·§6.6 |
| B7 | `docs/mdm/erd/04-master-code.mmd` / `.sqlite.sql` / `.mssql.sql` | 04 ERD·DDL 7 테이블 | §6.3 |
| B8 | `docs/mdm/erd/05-master-data.mmd` / `.sqlite.sql` / `.mssql.sql` | 05 ERD·DDL 7 테이블(CATE_EFF 제외) | §6.4 |
| B9 | `docs/mdm/erd/06-business-rule.mmd` / `.sqlite.sql` / `.mssql.sql` | 06 ERD·DDL 8 테이블 | §6.5 |
| B10 | `docs/mdm/erd/99-cross-area-fk.mssql.sql` | `FK_TB_MDM_DOMAIN_CODE` 등 교차 영역 후행 ALTER (§6.6) | §6.6 |
| B11 | `docs/mdm/erd/verify/Verify.java` | JDK21 단일파일 검증 프로그램(§3 a~j) | §3 |
| B12 | `docs/mdm/erd/verify/expected-columns.json` | 원천 칼럼 목록 기대값(§3 c 기준선) | §3 |
| B13 | `docs/mdm/erd/verify/fixtures/*.sql` | TB_MDM_SYSTEM 등 샘플 fixture, cells/rule_ids 참조검사용 샘플 | §3 |

### 2.2 Build 수정 예정

| # | 파일 | 내용 |
|---|---|---|
| M1 | `docs/mdm/naming-dialect-rules.md` §3 | `실측 필요 → TSK-02-03` 행(#2~#5·#19·#20)의 SQLite 열을 `확인(TSK-02-03 실측, SQLite 3.45.3 sqlite-jdbc)` 으로 갱신, MSSQL 열은 유지하고 이관 대상 Task 명시(§6.2 규칙) |
| M2 | `docs/mdm/decisions.md` | 이 설계의 D1~D7 판단 중 되돌리기 어려운 것(D1·D3)을 D-020 이후 번호로 append |

---

## 3. 테스트 전략 — 실행 가능한 검증 스크립트

문서 산출 특례: 새 애플리케이션 테스트 코드는 없다. 게이트는 아래 검증 스크립트(a~j, Build 가 `docs/mdm/erd/verify/`에 커밋) + 문서 체크리스트(V1~V14) + `testAll` 회귀다.

**실행 틀**
```bash
JDK=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
JAR=${SQLITE_JDBC_JAR:-/Users/jji/.gradle/caches/modules-2/files-2.1/org.xerial/sqlite-jdbc/3.45.3.0/6ae68e5fbf0d184c2f8191818fbe66e4dd70e14/sqlite-jdbc-3.45.3.0.jar}
SLF4J=${SLF4J_API_JAR:-/Users/jji/.gradle/wrapper/dists/gradle-8.14.3-bin/cv11ve7ro1n3o1j4so8xd9n66/gradle-8.14.3/lib/slf4j-api-1.7.36.jar}
"$JDK/bin/java" -cp "$JAR:$SLF4J" docs/mdm/erd/verify/Verify.java <check-id>
```
`Verify.java` 는 매 체크마다 `File.createTempFile("mdm-verify-", ".db")` 로 새 DB 를 만들고 끝나면 지운다. 리포의 실제 `data/mdm.db` 는 열지 않는다. `PRAGMA foreign_keys=ON` 을 연결 직후 매번 실행한다.

| 체크 | 절차 | 기대 결과 |
|---|---|---|
| **a** | 임시 SQLite DB 에 `fixtures/00-system.sql`(`CREATE TABLE TB_MDM_SYSTEM(system_code VARCHAR(20) PRIMARY KEY, system_name TEXT, self_yn VARCHAR(1))` + MDM/MES/ERP 3행 — TSK-01-02 계약 최소 모양(wbs 126행), F2 대로 이 Task 가 임시로 흉내만 낸다) 적용 → 02~06 전체 SQLite DDL(B2·B5·B7·B8·B9) 순서대로 적용(FK 가 인라인이므로 이 fixture 를 먼저 적용해야 한다) | 오류 0, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE 'TB_MDM_%'` = 35(02:7 + 03:5(신설 2 포함) + 04:7 + 05:7 + 06:8 + fixture 로 만든 TB_MDM_SYSTEM 1 = 35) |
| **b** | 두 방언 DDL 파일을 파싱해 비교: SQLite 는 적용 후 `pragma_table_info`로 테이블별 칼럼 집합·타입 계열을 읽고, MSSQL 은 정규식으로 `CREATE TABLE`/`ALTER TABLE ADD CONSTRAINT` 블록을 파싱한다. FK 는 (자식칼럼,부모테이블,부모칼럼) 3순組 집합으로 모아 **스키마 전체(파일 경계 무시)**에서 비교한다(F19) | 테이블 집합 일치, 칼럼명 집합 일치(대소문자만 다름 허용), FK 3순組 집합 일치. MSSQL 쪽 FK 자식칼럼의 길이·COLLATE 가 부모 PK 칼럼과 동일한지도 이 체크에서 정규식으로 대조(§6.0 타입 토큰 하나로 통일했으므로 자동 일치해야 함) |
| **c** | `expected-columns.json`(원천 표에서 옮긴 칼럼명 목록, 예외: 감사 9칼럼·03 신설 2테이블·02 TERM 관리속성 3칼럼(D3)·03 신설 칼럼 전부는 "추가 칼럼"으로 명시)과 적용된 SQLite 스키마의 칼럼 목록을 대조 | 대소문자 차이만 있고, "추가 칼럼" 목록 밖의 추가·삭제·개명 0건 |
| **d** | `PRAGMA foreign_key_list('<표>')` 를 35개 테이블 전부에 돌려 부모 테이블이 `TB_MDM_%` 또는 자기 자신인지 확인 | 100% `TB_MDM_%` 접두(TB_MDM_SYSTEM 포함), 하위 업무 테이블(mcm·mls 등) 0건 |
| **e** | 35개 테이블 중 `TB_MDM_DICT_SEQ` 를 제외한 34개에 감사 9칼럼(`C_USR_ID` 등)이 전부 있는지, 그리고 타입이 `naming-dialect-rules.md` §2 정본과 일치하는지(`C_USR_ID`·`C_SVC_ID`·`C_PGM_ID`·`U_USR_ID`·`U_SVC_ID`·`U_PGM_ID` 는 `pragma_table_info` 의 `type` 이 `VARCHAR(100)`, `C_AT`·`U_AT` 는 `TIMESTAMP`, `VER` 은 `INTEGER`(BIGINT 대응)) `pragma_table_info` 로 확인 | 34/34, 타입 전부 일치(§6.0 `AUD_STR`/`AUD_AT`/`BIGI` 토큰과 동일) |
| **f** | 활성 테이블의 배포 칸 두 그룹을 ADR-0002 문구 그대로 DEFAULT 0 여부로 확인한다. ① `chg_seq BIGINT NOT NULL DEFAULT 0` 그룹(ADR-0002 "TB_MDM_DOMAIN·COLUMN·UNIT, 05 네 테이블" = 7개): `TB_MDM_DOMAIN`·`TB_MDM_COLUMN`·`TB_MDM_UNIT`(02) + `TB_MDM_DATA`·`TB_MDM_DATA_ITEM`·`TB_MDM_DATA_CATE`·`TB_MDM_DATA_CATE_ITEM`(05, §6.4). ② `last_chg_seq BIGINT NOT NULL DEFAULT 0` 그룹(ADR-0002 "TB_MDM_CODE·TB_MDM_DATA, TB_MDM_DICT_SEQ" = 3개): `TB_MDM_CODE`(04)·`TB_MDM_DATA`(05, ①과 중복 — 이 테이블만 두 칼럼을 함께 가진다)·`TB_MDM_DICT_SEQ`(02). `TB_MDM_DICT_SEQ` 초기 행(`dict_code='DOMAIN', last_chg_seq=0`) INSERT 후 조회 | 7개 전부 `chg_seq DEFAULT 0`, 3개 전부 `last_chg_seq DEFAULT 0`(distinct 테이블 수 9), 초기 행 1건 조회됨 |
| **g** | 방언표 #2·#3·#4·#5·#19·#20 을 SQLite 에서 샘플로 실측: #2 `TB_MDM_CODE_RECV`·`TB_MDM_DATA_RECV`·`TB_MDM_RULE_RECV` 3곳의 `recv_id` 가 `INTEGER PRIMARY KEY AUTOINCREMENT` 로 실제 자동 증가하는지 연속 INSERT 로 확인. #3 `TB_MDM_RULE_ROW.cells` 에 부정형 JSON 문자열 INSERT 시 CHECK 로 거부되는지, NULL 허용 JSON 칼럼(`TB_MDM_DOMAIN.std_ast`)에 NULL INSERT 가 통과하는지. #4 샘플 `cells` 로 `json_each` 순번이 0부터인지. #5 `json_extract(cells, '$."1".op')` 로 값 추출. #19 코드 키 칼럼(`TB_MDM_CODE_ITEM.code`)에 대소문자만 다른 두 값이 서로 다른 행으로 INSERT 되는지(BINARY 비교 확인). #20 `TB_MDM_TERM.eng_abbr` 부분 인덱스에 NULL 여러 개가 통과하고 같은 비NULL 값 중복은 거부되는지 | 각 항목 기대값과 일치(0-based 순번, INSERT 성공/실패가 위 서술대로) |
| **h** | `fixtures/cells-ref-check.sql`(RULE_VAR·RULE_ROW 샘플 + 정상/댕글링 셀 각 1건)로 06:1133 룰 참조 검사와 동치인 `json_each` 기반 조회 실행 | 댕글링(존재하지 않는 var_id 키, 또는 코드 카테고리 미배포 대상 참조) 1건 잡힘, 정상 참조 1건 통과 |
| **i** | SQLite DDL 텍스트를 정규식으로 파싱해 `CONSTRAINT PK_/FK_/UX_/IX_/CK_` 접두, 128자 이하, 전부 대문자인지 확인(SQLite pragma 는 제약 이름을 노출하지 않으므로 텍스트 검사) | 위반 0건 |
| **j** | `cd src/backend && "$JDK/bin/java" ... ./gradlew testAll`(기존 실행 방식) | 기준선과 동일: 395 통과, 실패 0 |

**문서 검증 체크리스트**

- V1 `docs/mdm/erd/` 아래 02~06 각 3파일(mmd·sqlite.sql·mssql.sql) + `99-cross-area-fk.mssql.sql` 실재 — 기대 16개 파일
- V2 배포 대상 보류 3종(`TB_MDM_CODE_SYSTEM`·`TB_MDM_DATA_SYSTEM`·`TB_MDM_RULE_SYSTEM`)과 수신 로그 4종(`*_RECV*`)이 ERD 에 "보류" 주석으로 표시됨
- V3 03 신설 2테이블(`TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST`)이 D1·D2 대로 ERD·DDL 에 반영됨
- V4 `naming-dialect-rules.md` §3 의 `실측 필요 → TSK-02-03` 6행이 M1 대로 갱신됨
- V5 되돌리기 어려운 결정(D1 헤더 적층, D3 관리속성 물리화)이 `decisions.md` 에 D-020 이후로 추가됨(M2)
- V6 이 `design.md` §6 의 테이블별 칼럼표가 §3 a~c 검증을 그대로 통과할 만큼 `expected-columns.json`·DDL 과 정합함(내용 대조, 읽어서 확인)

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 충족 산출물 | 검증 |
|---|---|---|
| ERD(Mermaid/dbml)와 DDL 초안을 `docs/mdm/erd/` 에 커밋 | B1~B10(§2.1) | V1, 체크 a·b |
| 영역 계약 Task 가 그대로 마이그레이션으로 옮길 수 있는 수준 | §6 전체 표(칼럼·타입·NULL·기본값·PK/FK/UX/IX/CK), 타입 토큰(§6.0) | 체크 a~i, V6 |
| 원장 내부 FK·인덱스·CHECK, 하위 업무 테이블로의 FK 금지 확인(02·03·04·05·06 공통) | §6.1~§6.5 각 표 + F12·F13 | 체크 d |
| 03 헤더 다중 적층 vs 전문당 헤더 하나 확정, 상수 재정의 테이블 설계 | D1·D2, §6.2 `TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST` | V3 |
| JSON 칼럼 방언 표현과 json_each/OPENJSON 참조 검사 쿼리 | §6.0 JSONV 토큰, §6.5 `cells`·`rule_ids`, 체크 g·h | 체크 g·h |
| 배포 대상·배포 순번·수신 로그는 설계대로 두고 ERD 에 보류 표시 | F3, §6.3·§6.4·§6.5 각 보류 테이블 표기 | V2 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

1. **`src/` 는 한 줄도 바꾸지 않는다.** `data/mdm.db` 도 열지 않는다(검증은 임시 DB 만 쓴다).
2. **원천 칼럼 이름은 대소문자만 바꾼다.** 칼럼 추가·삭제·개명은 이 Task 의 결정이 아니다 — 유일한 예외는 D3(02 관리속성 3칼럼)·D1·D2(03 신설 2테이블과 그 칼럼)처럼 원천이 비워 둔 자리를 이 Task 가 채우는 경우뿐이며, 이 경우도 `expected-columns.json` 의 "추가 칼럼" 목록에 명시해 체크 c 가 구분하게 한다.
3. **보류 테이블(`*_SYSTEM`(COLUMN_SYSTEM 제외)·`TB_MDM_DICT_SEQ`·`TB_MDM_DICT_SYSTEM`·`*_RECV*`)은 DDL 에서 빼지 않는다.** "코드 없음"이지 "테이블 없음"이 아니다.
4. **`TB_MDM_SYSTEM` 테이블 자체는 이 Task 가 만들지 않는다.** 다만 원천이 FK 로 적은 자리(§6.0 F2)에는 인라인 FK 를 건다 — "FK 없음"으로 되돌리지 않는다.
5. **04·05·06 의 버전 상태 상수(DRAFT/REQUESTED/APPROVED/RELEASED/CANCELLED, CREATED/INUSE/DEPRECATED) 이름과 `apply_from`/`apply_to`·`row_version` 의미는 원천 그대로다.** TSK-02-01 D-017 의 버전 확정 규칙(결재 칸 처리 등)을 이 Task 가 다시 정의하지 않는다.
6. **04 는 전체 방식(행 `chg_seq` 없음), 02·05 는 변경분 방식(행 `chg_seq` 있음)** 을 그대로 유지한다(PRD §2 규칙5, F11). 04 문서 안의 미결 "배포 방식"(04-master-code.md 와의 양자택일)은 이미 PRD 로 닫혔으므로 재론하지 않는다.
7. **CATE_ITEM → CATE·ITEM(04), CATE → ITEM(05) 선분 참조에는 FK 를 걸지 않는다.** 저장 시·상신 시 검사로 앱이 대신한다(F12) — SQLite/MSSQL 모두 동일.
8. **MSSQL DDL 은 실행·실측하지 않는다.** 방언표 `실측 필요` 행 중 MSSQL 열은 이 Task 가 "확인됨"으로 바꾸지 않는다(F4).

---

## 6. 결정 상세

### 6.0 공통 타입 토큰 · 명명 · 감사 칼럼

모든 테이블에 `naming-dialect-rules.md` §1(명명)·§2(감사 9칼럼, `TB_MDM_DICT_SEQ` 제외)을 그대로 적용한다. 아래 6개 표는 반복을 줄이기 위한 **타입 토큰**이며, §6.1~§6.5 의 칼럼표는 이 토큰만 인용한다(직접 방언 타입을 다시 적지 않는다).

| 토큰 | SQLite | MSSQL | Java | 쓰임 |
|---|---|---|---|---|
| `ID_AI` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGINT IDENTITY(1,1)` | `Long` | 자동증가 대리키(TERM_ID·DOMAIN_ID·COLUMN_ID·RECV_ID 계열) |
| `CD20` | `VARCHAR(20)` | `VARCHAR(20) COLLATE Latin1_General_100_BIN2` | `String` | 짧은 코드(system_code 참조 칼럼·eai_code·unit_code 등) |
| `CD50` | `VARCHAR(50)` | `VARCHAR(50) COLLATE Latin1_General_100_BIN2` | `String` | 식별자(maru_*_id·cate_id·code·phys_name·owner_id 등) |
| `NM100` | `TEXT` | `NVARCHAR(100)` | `String` | 한글 명칭 |
| `NM200` | `TEXT` | `NVARCHAR(200)` | `String` | 긴 한글 명칭(등록 출처 등) |
| `LBL24`/`LBL12`/`LBL6` | `TEXT` | `NVARCHAR(24)`/`NVARCHAR(12)`/`NVARCHAR(6)` | `String` | 화면 표시명 3종 |
| `TXT` | `TEXT` | `NVARCHAR(MAX)` | `String` | 자유 한글 텍스트(설명 등) |
| `TXT_A` | `TEXT` | `VARCHAR(MAX)` | `String` | ASCII 전용(EvalEx 식·정규식 원문, 물리명 참조 텍스트) |
| `JSONV` | `TEXT` + `CHECK (json_valid(col) OR col IS NULL)` | `NVARCHAR(MAX)` + `CHECK (ISJSON(col)=1 OR col IS NULL)` | `String` | JSON, NULL 허용 |
| `JSONV_NN` | `TEXT NOT NULL` + `CHECK (json_valid(col))` | `NVARCHAR(MAX) NOT NULL` + `CHECK (ISJSON(col)=1)` | `String` | JSON, NOT NULL |
| `BOOLI` | `INTEGER` + `CHECK (col IN (0,1))` | `BIT` | `boolean` | 불리언 |
| `YN1` | `VARCHAR(1)` + `CHECK (col IN ('Y','N'))` | `VARCHAR(1) COLLATE Latin1_General_100_BIN2` + `CHECK (col IN ('Y','N'))` | `String` | 원천이 `*_yn varchar` 로 둔 칼럼 |
| `INT4` | `INTEGER` | `INT` | `Integer` | 일반 정수 |
| `BIGI` | `INTEGER` | `BIGINT` | `Long` | 큰 정수(chg_seq·last_chg_seq·recv_id 참조) |
| `DECF` | `NUMERIC(18,9)` | `DECIMAL(18,9)` | `BigDecimal` | 환산 계수(TB_MDM_UNIT.factor, 소수 6자리 이상 필요) |
| `DEC73` | `NUMERIC(7,3)` | `DECIMAL(7,3)` | `BigDecimal` | 04 버전 번호(ver, restored_from, from_ver, to_ver) 전용 |
| `ATTR500` | `TEXT` + 길이 앱 검사 | `NVARCHAR(500)` | `String` | 04·05 attr01-10 값 |
| `DTS` | `TEXT`(`'YYYY-MM-DD HH:MM:SS'`) | `DATETIME2(0)` | `LocalDateTime` | 업무 일시(KST, 초 단위) |
| `AUD_STR` | `VARCHAR(100)` | `VARCHAR(100)` | `String` | 감사 9칼럼의 문자 칼럼(C_USR_ID 등) — `naming-dialect-rules.md` §2 원문 그대로, COLLATE 없음 |
| `AUD_AT` | `TIMESTAMP` | `DATETIME2` | `LocalDateTime` | 감사 `C_AT`/`U_AT` — mls V2 관례(정밀도 미지정, `DTS` 의 `(0)`과 다름) |

**예약어 충돌 칼럼**(F18): `LAYOUT.version`, `LAYOUT_ITEM.offset`·`length`, `DATA_RECV_ITEM.action`, `*_RECV.result` 는 DDL 에서 SQLite `"..."`, MSSQL `[...]` 로 항상 감싼다. 칼럼명 자체는 바꾸지 않는다.

**감사 9칼럼**(모든 표, `TB_MDM_DICT_SEQ` 제외 — `naming-dialect-rules.md` §2 원문 그대로, 이하 `+AUDIT9` 로 표기): `C_USR_ID AUD_STR`, `C_AT AUD_AT`, `C_SVC_ID AUD_STR`, `C_PGM_ID AUD_STR`, `U_USR_ID AUD_STR`, `U_AT AUD_AT`, `U_SVC_ID AUD_STR`, `U_PGM_ID AUD_STR`, `VER BIGI`(= `BIGINT`, mls V2 관례) — 전부 NULL 허용. (이전 초안에서 `CD50`/`DTS` 를 잘못 인용했던 것을 정본대로 고쳤다.)

**`TB_MDM_SYSTEM` 참조 칼럼**(F2): `TB_MDM_SYSTEM` 은 이 Task 가 만들지 않지만, 영역 계약 Task 는 전부 TSK-01-02 에 의존하므로 마이그레이션 시점에는 이미 존재한다(wbs 의존 순서). 따라서 원천이 FK 로 적은 자리(`system_code`/`source_system`/`snd_system`/`rcv_system` 등, §6.1~§6.5 각 표)에는 **`CD20` 타입 그대로 인라인 FK 를 건다**(`FK_{테이블}_SYSTEM`, 같은 테이블에 둘 이상이면 `_컬럼` 접미). `system_code` 의 실제 길이·타입은 TSK-01-02 계약이 아직 없어 `CD20`(VARCHAR(20))을 **가정**으로 둔다 — 계약이 확정되면 그 타입에 맞춰 `CD20` 정의를 갱신한다. ERD 는 실선 + `"TSK-01-02 소유"` 주석으로 그린다. FK 이름은 패턴대로면 `TB_MDM_CODE_SYSTEM`처럼 **형제 테이블 이름과 그대로 겹치는 경우**(MSSQL 은 제약 이름도 스키마 오브젝트 이름공간을 공유해 실제 충돌이 난다)가 있어, 그 칼럼이 `source_system`/`snd_system`/`rcv_system` 처럼 칼럼명 자체가 있는 자리는 `_SRC`/`_SND`/`_RCV` 를 붙여 피한다(예 `FK_TB_MDM_CODE_SYSTEM_SRC`). `*_SYSTEM` 자식 테이블(예 `TB_MDM_CODE_SYSTEM.system_code`)처럼 칼럼명이 `system_code` 하나뿐인 자리는 그대로 `FK_{테이블}_SYSTEM`(예 `FK_TB_MDM_CODE_SYSTEM_SYSTEM`)을 쓴다.

---

### 6.1 영역 02 (dma) — `TB_MDM_UNIT`·`TERM`·`DOMAIN`·`COLUMN`·`COLUMN_SYSTEM`·`DICT_SEQ`·`DICT_SYSTEM`

**TB_MDM_UNIT** (원장, 배포 대상)
PK `PK_TB_MDM_UNIT`(UNIT_CODE) · FK 없음 · UX/IX 없음 · CK 없음(차원 일치는 앱 검사)

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| UNIT_CODE | CD20 | NOT NULL | - |
| DIMENSION | CD50 | NOT NULL | - |
| BASE_UNIT | CD20 | NOT NULL | - |
| FACTOR | DECF | NOT NULL | - |
| CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_TERM** (원장, 배포 안 함 — chg_seq 없음)
PK `PK_TB_MDM_TERM`(TERM_ID) · FK 없음 · UX `UX_TB_MDM_TERM_NAME_SENSE`(TERM_NAME,SENSE_NO), `UX_TB_MDM_TERM_ABBR`(ENG_ABBR) **부분 인덱스** `WHERE ENG_ABBR IS NOT NULL`(방언표 #20, FR-A1 "약어 유일")

| 칼럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|---|---|---|
| TERM_ID | ID_AI | NOT NULL | - | PK |
| TERM_NAME | NM100 | NOT NULL | - | |
| SENSE_NO | INT4 | NOT NULL | - | 앱이 항상 지정(동음이의어 순번) |
| DEFINITION | TXT | NOT NULL | - | |
| CONTEXT | NM100 | NULL | - | |
| ENG_NAME | NM100 | NULL | - | |
| ENG_ABBR | CD50 | NULL | - | |
| SYNONYMS | JSONV | NULL | - | |
| ALIASES | JSONV | NULL | - | |
| SYSTEMS | JSONV | NULL | - | |
| STD_BASIS | TXT | NULL | - | |
| OWNER_DEPT | NM100 | NULL | - | **D3 신설**: 소유 부서 |
| OWNER_ID | CD50 | NULL | - | **D3 신설**: 담당자 |
| SRC_ORIGIN | NM200 | NULL | - | **D3 신설**: 등록 출처 |

`+AUDIT9` — `embedding`·`embedding_model` 은 D4 로 이번 범위 제외.

**TB_MDM_DOMAIN** (원장, 배포 대상)
PK `PK_TB_MDM_DOMAIN`(DOMAIN_ID) · FK `FK_TB_MDM_DOMAIN_DOMAIN`(PARENT_DOMAIN_ID→자기), `FK_TB_MDM_DOMAIN_UNIT`(UNIT_CODE→TB_MDM_UNIT), `FK_TB_MDM_DOMAIN_CODE`(MARU_CODE_ID→TB_MDM_CODE, **교차영역, §6.6 후행 ALTER 대상**) · CATE_ID 는 FK 없음(앱 검사, 04 카테고리가 버전 축 선분이라 단순 FK 불가) · IX `IX_TB_MDM_DOMAIN_PARENT`(PARENT_DOMAIN_ID, 재귀 CTE 성능, 원천 미명시·설계 판단) · CK `CK_TB_MDM_DOMAIN_CODE` `CHECK (DOMAIN_KIND <> 'CODE' OR STD_RULE IS NULL)`, `CK_TB_MDM_DOMAIN_FLAG` `CHECK (DOMAIN_KIND <> 'FLAG' OR PARENT_DOMAIN_ID IS NOT NULL OR STD_RULE IS NOT NULL)`(02:62 `ck_md_domain_flag` 대응)

| 칼럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|---|---|---|
| DOMAIN_ID | ID_AI | NOT NULL | - | PK |
| DOMAIN_NAME | NM100 | NOT NULL | - | |
| STD_NAME | CD50 | NOT NULL | - | UNIQUE 불명확 — 걸지 않음 |
| PARENT_DOMAIN_ID | INT4/BIGINT(대응 서버 타입) | NULL | - | 자기 FK |
| DOMAIN_KIND | CD20 | NOT NULL | - | QTY/CODE/ID/TEXT/DATE/FLAG |
| DATA_TYPE | CD20 | NOT NULL | - | |
| LENGTH | INT4 | NULL | - | |
| SCALE | INT4 | NULL | - | |
| UNIT_CODE | CD20 | NULL | - | QTY 종류 필수(앱 검사) |
| MARU_CODE_ID | CD50 | NULL | - | CODE 종류(앱 검사), 04 참조 |
| CATE_ID | CD50 | NULL | - | FK 없음 |
| STD_RULE | TXT_A | NULL | - | CK 대상 |
| STD_AST | JSONV | NULL | - | |
| BIZ_RULE | TXT_A | NULL | - | |
| BIZ_AST | JSONV | NULL | - | |
| DESCRIPTION | TXT | NULL | - | |
| EXAMPLES | JSONV | NULL | - | |
| TEST_CASES | JSONV | NULL | - | |
| CHG_SEQ | BIGI | NOT NULL | 0 | |

`+AUDIT9`

**TB_MDM_COLUMN** (원장, 배포 대상 서브셋)
PK `PK_TB_MDM_COLUMN`(COLUMN_ID) · FK `FK_TB_MDM_COLUMN_DOMAIN`(DOMAIN_ID→TB_MDM_DOMAIN) · UX `UX_TB_MDM_COLUMN_NAME`(COLUMN_NAME), `UX_TB_MDM_COLUMN_PHYS_NAME`(PHYS_NAME) **D6 신설**

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| COLUMN_ID | ID_AI | NOT NULL | - |
| COLUMN_NAME | NM100 | NOT NULL | - |
| LABEL_LONG | LBL24 | NULL | - |
| LABEL_MID | LBL12 | NULL | - |
| LABEL_SHORT | LBL6 | NULL | - |
| PHYS_NAME | CD50 | NOT NULL | - |
| DESCRIPTION | TXT | NULL | - |
| DOMAIN_ID | BIGINT/INTEGER(FK) | NOT NULL | - |
| REQUIRED | BOOLI | NOT NULL | 0 |
| DEFAULT_VALUE | CD50 | NULL | - |
| REF_KIND | CD20 | NULL | - |
| REF_TARGET | CD50 | NULL | - (DDL FK 생성 안 함, 원천 명시) |
| REF_CATE_ID | CD50 | NULL | - |
| TERM_IDS | JSONV | NULL | - |
| USAGE_NOTE | TXT | NULL | - |
| CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_COLUMN_SYSTEM** (원장, chg_seq 없음 — 변경은 TB_MDM_COLUMN.chg_seq 에 찍힘)
PK `PK_TB_MDM_COLUMN_SYSTEM`(COLUMN_ID,SYSTEM_CODE,PHYS_NAME) · FK `FK_TB_MDM_COLUMN_SYSTEM_COLUMN`(COLUMN_ID→TB_MDM_COLUMN), `FK_TB_MDM_COLUMN_SYSTEM_SYSTEM`(SYSTEM_CODE→TB_MDM_SYSTEM, F2·TSK-01-02 소유) · IX `IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS`(SYSTEM_CODE,PHYS_NAME) — 02:677 역방향 조회 요구 명시

| 칼럼 | 타입 | NULL |
|---|---|---|
| COLUMN_ID | BIGINT/INTEGER(FK) | NOT NULL |
| SYSTEM_CODE | CD20(FK) | NOT NULL |
| PHYS_NAME | CD50 | NOT NULL |
| TRANSFORM | CD50 | NULL |
| NOTE | TXT | NULL |

`+AUDIT9`

**TB_MDM_DICT_SEQ** (보류, 배포 안 함, **감사 9칼럼 예외 — 두지 않음**)
PK `PK_TB_MDM_DICT_SEQ`(DICT_CODE) · CK `CK_TB_MDM_DICT_SEQ_CODE` `CHECK (DICT_CODE = 'DOMAIN')`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| DICT_CODE | CD20 | NOT NULL | - |
| LAST_CHG_SEQ | BIGI | NOT NULL | 0 |

초기 행 1건 필요: `('DOMAIN', 0)`.

**TB_MDM_DICT_SYSTEM** (보류, 배포 안 함)
PK `PK_TB_MDM_DICT_SYSTEM`(DICT_CODE,SYSTEM_CODE) · FK `FK_TB_MDM_DICT_SYSTEM_DICT_SEQ`(DICT_CODE→TB_MDM_DICT_SEQ), `FK_TB_MDM_DICT_SYSTEM_SYSTEM`(SYSTEM_CODE→TB_MDM_SYSTEM, F2) · CK `CK_TB_MDM_DICT_SYSTEM_CODE` `CHECK (DICT_CODE='DOMAIN')`

| 칼럼 | 타입 | NULL |
|---|---|---|
| DICT_CODE | CD20 | NOT NULL |
| SYSTEM_CODE | CD20(FK) | NOT NULL |
| NOTE | TXT | NULL |

`+AUDIT9`

---

### 6.2 영역 03 (dmb) — `TB_MDM_EAI`·`LAYOUT`·`LAYOUT_ITEM` + 신설 `LAYOUT_HEADER`·`LAYOUT_CONST`

**D1·D2 요지**(상세는 담당자 확인 필요 결정 참조): md 의 "전문당 헤더 하나"(`TB_MDM_EAI.header_layout_id`)를 **유지**하면서, 그 위에 순서 있는 적층 junction 테이블 `TB_MDM_LAYOUT_HEADER` 를 덧붙인다. N=1(EAI 기본 헤더만 자동 부착)이면 md 와 완전히 같은 동작이고, N≥2 면 html 이 보여준 EAI 구간 + 시스템 구간 적층을 표현한다. 메시지 레이아웃 등록 시 `eai_code` 가 있으면 앱이 `TB_MDM_EAI.header_layout_id` 를 `TB_MDM_LAYOUT_HEADER` 의 seq=1 로 자동 삽입하고(03:11 "자동으로 붙는다"), 담당자가 추가 헤더를 seq=2... 로 더 붙일 수 있다.

**TB_MDM_EAI**
PK `PK_TB_MDM_EAI`(EAI_CODE) · FK `FK_TB_MDM_EAI_LAYOUT`(HEADER_LAYOUT_ID→TB_MDM_LAYOUT, **순환, §6.6 후행 ALTER**)

| 칼럼 | 타입 | NULL |
|---|---|---|
| EAI_CODE | CD20 | NOT NULL |
| EAI_NAME | NM100 | NOT NULL |
| ENCODING | CD20 | NOT NULL |
| PAD_RULE | TXT | NULL |
| HEADER_LAYOUT_ID | BIGINT/INTEGER(FK) | NULL |

`+AUDIT9`

**TB_MDM_LAYOUT**
PK `PK_TB_MDM_LAYOUT`(LAYOUT_ID) · FK `FK_TB_MDM_LAYOUT_EAI`(EAI_CODE→TB_MDM_EAI, **순환, §6.6 후행 ALTER**), `FK_TB_MDM_LAYOUT_SYSTEM_SND`(SND_SYSTEM→TB_MDM_SYSTEM, F2, 03:70), `FK_TB_MDM_LAYOUT_SYSTEM_RCV`(RCV_SYSTEM→TB_MDM_SYSTEM, F2, 03:70) · CK `CK_TB_MDM_LAYOUT_KIND` `CHECK (LAYOUT_KIND IN ('HEADER','MESSAGE'))`

| 칼럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|---|---|---|
| LAYOUT_ID | ID_AI | NOT NULL | - | PK |
| LAYOUT_KIND | CD20 | NOT NULL | - | |
| LAYOUT_NAME | NM100 | NOT NULL | - | |
| EAI_CODE | CD20 | NULL | - | MESSAGE만(앱 검사) |
| SND_SYSTEM | CD20(FK) | NULL | - | |
| RCV_SYSTEM | CD20(FK) | NULL | - | |
| TOTAL_LENGTH | INT4 | NOT NULL | 0 | 계산값 |
| `"VERSION"`/`[VERSION]` | BIGI | NOT NULL | 0 | 배포 스냅샷 번호(예약어, F18) |

`+AUDIT9`

**TB_MDM_LAYOUT_ITEM**
PK `PK_TB_MDM_LAYOUT_ITEM`(LAYOUT_ID,SEQ) · FK `FK_TB_MDM_LAYOUT_ITEM_LAYOUT`(LAYOUT_ID→TB_MDM_LAYOUT), `FK_TB_MDM_LAYOUT_ITEM_COLUMN`(COLUMN_PHYS→TB_MDM_COLUMN.PHYS_NAME, D6 근거) · TRANS_UNIT FK `FK_TB_MDM_LAYOUT_ITEM_UNIT`(→TB_MDM_UNIT) · UNIT_ITEM 은 FK 없음(같은 레이아웃 안 column_phys 참조, 앱 검사) · CK `CK_TB_MDM_LAYOUT_ITEM_FILL_KIND` `CHECK (FILL_KIND IN ('DATA','CONST','AUTO','FILLER'))`, `CK_TB_MDM_LAYOUT_ITEM_UNIT` `CHECK (TRANS_UNIT IS NULL OR UNIT_ITEM IS NULL)`(03:82 동시 입력 금지)

| 칼럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|---|---|---|
| LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL | - | PK |
| SEQ | INT4 | NOT NULL | - | PK |
| FILL_KIND | CD20 | NOT NULL | - | |
| COLUMN_PHYS | CD50 | NULL | - | FILLER 없음(앱 검사) |
| TRANS_UNIT | CD20 | NULL | - | |
| UNIT_ITEM | CD50 | NULL | - | FK 없음 |
| NUM_FORMAT | CD50 | NULL | - | |
| DEFAULT_VALUE | CD50 | NULL | - | |
| FILLER_LENGTH | INT4 | NULL | - | |
| `"OFFSET"`/`[OFFSET]` | INT4 | NOT NULL | 0 | 계산값(예약어) |
| `"LENGTH"`/`[LENGTH]` | INT4 | NOT NULL | 0 | 계산값(예약어) |

`+AUDIT9`

**TB_MDM_LAYOUT_HEADER**(신설, D1 — 헤더 적층 구성)
PK `PK_TB_MDM_LAYOUT_HEADER`(LAYOUT_ID,SEQ) · FK `FK_TB_MDM_LAYOUT_HEADER_LAYOUT`(LAYOUT_ID→TB_MDM_LAYOUT, MESSAGE 측), `FK_TB_MDM_LAYOUT_HEADER_HEADER`(HEADER_LAYOUT_ID→TB_MDM_LAYOUT, HEADER 측, 앱이 LAYOUT_KIND='HEADER' 검사) · UX `UX_TB_MDM_LAYOUT_HEADER_HDR`(LAYOUT_ID,HEADER_LAYOUT_ID) — 중복 부착 방지, `TB_MDM_LAYOUT_CONST` 의 FK 대상

| 칼럼 | 타입 | NULL |
|---|---|---|
| LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL |
| SEQ | INT4 | NOT NULL |
| HEADER_LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL |

`+AUDIT9`

**TB_MDM_LAYOUT_CONST**(신설, D2 — 전문별 헤더 상수 재정의)
PK `PK_TB_MDM_LAYOUT_CONST`(LAYOUT_ID,HEADER_LAYOUT_ID,HEADER_SEQ) · FK `FK_TB_MDM_LAYOUT_CONST_LAYOUT`(LAYOUT_ID→TB_MDM_LAYOUT), `FK_TB_MDM_LAYOUT_CONST_ITEM`(HEADER_LAYOUT_ID,HEADER_SEQ→TB_MDM_LAYOUT_ITEM.LAYOUT_ID,SEQ), `FK_TB_MDM_LAYOUT_CONST_HEADER`(LAYOUT_ID,HEADER_LAYOUT_ID→TB_MDM_LAYOUT_HEADER.LAYOUT_ID,HEADER_LAYOUT_ID — 부착 여부 무결성)

| 칼럼 | 타입 | NULL |
|---|---|---|
| LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL |
| HEADER_LAYOUT_ID | BIGINT/INTEGER(FK) | NOT NULL |
| HEADER_SEQ | INT4 | NOT NULL |
| CONST_VALUE | CD50 | NOT NULL |

`+AUDIT9` — 대상 항목의 FILL_KIND=CONST 인지는 앱 검사(cross-table CHECK 불가).

---

### 6.3 영역 04 (dmc) — `TB_MDM_CODE`·`CODE_SYSTEM`·`CODE_VER`·`CODE_ITEM`·`CODE_CATE`·`CODE_CATE_ITEM`·`CODE_RECV`

전체 방식(F11) — 행 단위 `chg_seq` 없음, `TB_MDM_CODE.last_chg_seq` 하나.

**TB_MDM_CODE**
PK `PK_TB_MDM_CODE`(MARU_CODE_ID) · FK `FK_TB_MDM_CODE_SYSTEM_SRC`(SOURCE_SYSTEM→TB_MDM_SYSTEM, F2, 04:957) · CK `CK_TB_MDM_CODE_STATUS` IN('CREATED','INUSE','DEPRECATED'), `CK_TB_MDM_CODE_SRC_KIND` IN('MDM','EXTERNAL'), `CK_TB_MDM_CODE_SRC_SYS` `CHECK ((SOURCE_KIND='EXTERNAL' AND SOURCE_SYSTEM IS NOT NULL) OR (SOURCE_KIND='MDM' AND SOURCE_SYSTEM IS NULL))`, `CK_TB_MDM_CODE_LVL_CNT` `CHECK (LVL_CNT BETWEEN 0 AND 5)`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_CODE_ID | CD50 | NOT NULL | - |
| MARU_CODE_NAME | NM100 | NOT NULL | - |
| STATUS | CD20 | NOT NULL | 'CREATED' |
| SOURCE_KIND | CD20 | NOT NULL | - |
| SOURCE_SYSTEM | CD20(FK) | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| ATTR01_NAME..ATTR10_NAME | NM100 ×10 | NULL | - |
| LVL_CNT | INT4 | NOT NULL | 0 |
| LAST_CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_CODE_SYSTEM**(보류)
PK `PK_TB_MDM_CODE_SYSTEM`(MARU_CODE_ID,SYSTEM_CODE) · FK `FK_TB_MDM_CODE_SYSTEM_CODE`(MARU_CODE_ID→TB_MDM_CODE), `FK_TB_MDM_CODE_SYSTEM_SYSTEM`(SYSTEM_CODE→TB_MDM_SYSTEM, F2)

| 칼럼 | 타입 | NULL |
|---|---|---|
| MARU_CODE_ID | CD50(FK) | NOT NULL |
| SYSTEM_CODE | CD20(FK) | NOT NULL |
| DESCRIPTION | TXT | NULL |

`+AUDIT9`

**TB_MDM_CODE_VER**
PK `PK_TB_MDM_CODE_VER`(MARU_CODE_ID,VER) · FK `FK_TB_MDM_CODE_VER_CODE`(MARU_CODE_ID→TB_MDM_CODE) · CK `CK_TB_MDM_CODE_VER_KIND` IN('MAJOR','MINOR'), `CK_TB_MDM_CODE_VER_STATUS` IN('DRAFT','REQUESTED','APPROVED','RELEASED','CANCELLED'), `CK_TB_MDM_CODE_VER_APPLY` `CHECK (STATUS='DRAFT' OR (APPLY_FROM IS NOT NULL AND APPLY_TO IS NOT NULL))`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_CODE_ID | CD50(FK) | NOT NULL | - |
| VER | DEC73 | NOT NULL | - |
| VER_KIND | CD20 | NOT NULL | - |
| RESTORED_FROM | DEC73 | NULL | - |
| STATUS | CD20 | NOT NULL | 'DRAFT' |
| OWNER_ID | CD50 | NULL | - |
| APPLY_FROM | DTS | NULL | - |
| APPLY_TO | DTS | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| REQUESTED_BY | CD50 | NULL | - |
| REQUESTED_AT | DTS | NULL | - |
| EMERGENCY_YN | YN1 | NOT NULL | 'N' |
| EMERGENCY_REASON | TXT | NULL | - |
| APPROVED_BY | CD50 | NULL | - |
| APPROVED_AT | DTS | NULL | - |
| REJECT_REASON | TXT | NULL | - |
| RELEASED_AT | DTS | NULL | - |
| CANCELLED_AT | DTS | NULL | - |
| CANCEL_REASON | TXT | NULL | - |
| ROW_VERSION | INT4 | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_CODE_ITEM**
PK `PK_TB_MDM_CODE_ITEM`(MARU_CODE_ID,CODE,FROM_VER) · FK `FK_TB_MDM_CODE_ITEM_CODE`(MARU_CODE_ID→TB_MDM_CODE), `FK_TB_MDM_CODE_ITEM_VER`(MARU_CODE_ID,FROM_VER→TB_MDM_CODE_VER.MARU_CODE_ID,VER) · CK `CK_TB_MDM_CODE_ITEM_CODE` `CHECK (CODE NOT LIKE '% %' AND CODE NOT LIKE '%,%')`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_CODE_ID | CD50(FK) | NOT NULL | - |
| CODE | CD50 | NOT NULL | - |
| FROM_VER | DEC73(FK) | NOT NULL | - |
| TO_VER | DEC73 | NOT NULL | 9999 |
| NAME | NM100 | NULL | - |
| ALTER_NAME | NM100 | NULL | - |
| SEQ | INT4 | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| LVL1..LVL5 | CD50 ×5 | NULL | - |
| ATTR01..ATTR10 | ATTR500 ×10 | NULL | - |

`+AUDIT9`

**TB_MDM_CODE_CATE**
PK `PK_TB_MDM_CODE_CATE`(MARU_CODE_ID,CATE_ID,FROM_VER) · FK `FK_TB_MDM_CODE_CATE_CODE`(MARU_CODE_ID→TB_MDM_CODE), `FK_TB_MDM_CODE_CATE_VER`(MARU_CODE_ID,FROM_VER→TB_MDM_CODE_VER) · CK `CK_TB_MDM_CODE_CATE_KIND` IN('REGEX','TABLE'), `CK_TB_MDM_CODE_CATE_DEF` `CHECK ((DEF_KIND='REGEX' AND DEF_EXPR IS NOT NULL AND DEF_TARGET IS NOT NULL) OR (DEF_KIND='TABLE' AND DEF_EXPR IS NULL AND DEF_TARGET IS NULL))`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_CODE_ID | CD50(FK) | NOT NULL | - |
| CATE_ID | CD50 | NOT NULL | - |
| FROM_VER | DEC73(FK) | NOT NULL | - |
| TO_VER | DEC73 | NOT NULL | 9999 |
| CATE_NAME | NM100 | NULL | - |
| DEF_KIND | CD20 | NOT NULL | - |
| DEF_EXPR | TXT_A | NULL | - |
| DEF_TARGET | CD20 | NULL | - |
| DESCRIPTION | TXT | NULL | - |

`+AUDIT9`

**TB_MDM_CODE_CATE_ITEM**(FK 없음 — F12)
PK `PK_TB_MDM_CODE_CATE_ITEM`(MARU_CODE_ID,CATE_ID,CODE,FROM_VER) · FK `FK_TB_MDM_CODE_CATE_ITEM_CODE`(MARU_CODE_ID→TB_MDM_CODE), `FK_TB_MDM_CODE_CATE_ITEM_VER`(MARU_CODE_ID,FROM_VER→TB_MDM_CODE_VER) — CATE_ID·CODE 자체는 FK 없음(앱 검사)

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_CODE_ID | CD50(FK) | NOT NULL | - |
| CATE_ID | CD50 | NOT NULL | - |
| CODE | CD50 | NOT NULL | - |
| FROM_VER | DEC73(FK) | NOT NULL | - |
| TO_VER | DEC73 | NOT NULL | 9999 |

`+AUDIT9`

**TB_MDM_CODE_RECV**
PK `PK_TB_MDM_CODE_RECV`(RECV_ID) · FK `FK_TB_MDM_CODE_RECV_CODE`(MARU_CODE_ID→TB_MDM_CODE), `FK_TB_MDM_CODE_RECV_SYSTEM`(SOURCE_SYSTEM→TB_MDM_SYSTEM, F2) · CK `CK_TB_MDM_CODE_RECV_REQ` IN('VERSION','CANCEL','DEPRECATE'), `CK_TB_MDM_CODE_RECV_RESULT` `CHECK ("RESULT" IS NULL OR "RESULT" IN ('OK','REJECTED','FAILED'))`

| 칼럼 | 타입 | NULL |
|---|---|---|
| RECV_ID | ID_AI | NOT NULL |
| MARU_CODE_ID | CD50(FK) | NULL |
| SOURCE_SYSTEM | CD20(FK) | NOT NULL |
| SOURCE_REF | CD50 | NULL |
| REQ_KIND | CD20 | NOT NULL |
| RECEIVED_AT | DTS | NOT NULL |
| BODY | TXT | NOT NULL |
| `"RESULT"`/`[RESULT]` | CD20 | NULL |
| RESULT_DETAIL | TXT | NULL |
| VER | DEC73 | NULL |
| CHG_SEQ | BIGI | NULL |
| PROCESSED_AT | DTS | NULL |

`+AUDIT9`

---

### 6.4 영역 05 (dmd) — `TB_MDM_DATA`·`DATA_SYSTEM`·`DATA_ITEM`·`DATA_CATE`·`DATA_CATE_ITEM`·`DATA_RECV`·`DATA_RECV_ITEM`

변경분 방식(F11) — 행 단위 `chg_seq` NOT NULL. `TB_MDM_DATA_CATE_EFF`(사본 전용 REGEX 캐시)는 spec 대상 밖, 원장 DDL 에 포함하지 않는다.

**TB_MDM_DATA**
PK `PK_TB_MDM_DATA`(MARU_DATA_ID) · FK `FK_TB_MDM_DATA_SYSTEM_SRC`(SOURCE_SYSTEM→TB_MDM_SYSTEM, F2, 05:594) · CK `CK_TB_MDM_DATA_STATUS` IN('INUSE','DEPRECATED'), `CK_TB_MDM_DATA_SRC_KIND` IN('MDM','EXTERNAL'), `CK_TB_MDM_DATA_SRC_SYS` `CHECK ((SOURCE_KIND='EXTERNAL' AND SOURCE_SYSTEM IS NOT NULL) OR (SOURCE_KIND='MDM' AND SOURCE_SYSTEM IS NULL))`, `CK_TB_MDM_DATA_LVL_CNT` `CHECK (LVL_CNT BETWEEN 0 AND 5)`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_DATA_ID | CD50 | NOT NULL | - |
| MARU_DATA_NAME | NM100 | NOT NULL | - |
| STATUS | CD20 | NOT NULL | 'INUSE' |
| SOURCE_KIND | CD20 | NOT NULL | - |
| SOURCE_SYSTEM | CD20(FK) | NULL | - |
| CODE_PATTERN | TXT_A | NOT NULL | `'^[0-9A-Z]{1,20}$'` |
| DESCRIPTION | TXT | NULL | - |
| ATTR01_NAME..ATTR10_NAME | NM100 ×10 | NULL | - |
| LVL_CNT | INT4 | NOT NULL | 0 |
| CLOSED_AT | DTS | NULL | - |
| LAST_CHG_SEQ | BIGI | NOT NULL | 0 |
| CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_DATA_SYSTEM**(보류)
PK `PK_TB_MDM_DATA_SYSTEM`(MARU_DATA_ID,SYSTEM_CODE) · FK `FK_TB_MDM_DATA_SYSTEM_DATA`(MARU_DATA_ID→TB_MDM_DATA), `FK_TB_MDM_DATA_SYSTEM_SYSTEM`(SYSTEM_CODE→TB_MDM_SYSTEM, F2)

| 칼럼 | 타입 | NULL |
|---|---|---|
| MARU_DATA_ID | CD50(FK) | NOT NULL |
| SYSTEM_CODE | CD20(FK) | NOT NULL |
| DESCRIPTION | TXT | NULL |

`+AUDIT9`

**TB_MDM_DATA_ITEM**
PK `PK_TB_MDM_DATA_ITEM`(MARU_DATA_ID,CODE,VALID_FROM) · FK `FK_TB_MDM_DATA_ITEM_DATA`(MARU_DATA_ID→TB_MDM_DATA) · IX `IX_TB_MDM_DATA_ITEM_NAME`(MARU_DATA_ID,NAME) — 05:458 검색 API 근거

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_DATA_ID | CD50(FK) | NOT NULL | - |
| CODE | CD50 | NOT NULL | - |
| VALID_FROM | DTS | NOT NULL | - |
| NAME | NM100 | NOT NULL | - |
| ALTER_NAME | NM100 | NULL | - |
| SEQ | INT4 | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| VALID_TO | DTS | NOT NULL | `'9999-12-31 00:00:00'` |
| ROW_VERSION | INT4 | NOT NULL | 0 |
| CHG_SEQ | BIGI | NOT NULL | 0 |
| LVL1..LVL5 | CD50 ×5 | NULL | - |
| ATTR01..ATTR10 | ATTR500 ×10 | NULL | - |

`+AUDIT9`

**TB_MDM_DATA_CATE**
PK `PK_TB_MDM_DATA_CATE`(MARU_DATA_ID,CATE_ID,VALID_FROM) · FK `FK_TB_MDM_DATA_CATE_DATA`(MARU_DATA_ID→TB_MDM_DATA) · CK `CK_TB_MDM_DATA_CATE_KIND` IN('REGEX','TABLE'), `CK_TB_MDM_DATA_CATE_DEF` `CHECK ((DEF_KIND='REGEX' AND DEF_EXPR IS NOT NULL AND DEF_TARGET IS NOT NULL) OR (DEF_KIND='TABLE' AND DEF_EXPR IS NULL AND DEF_TARGET IS NULL))`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_DATA_ID | CD50(FK) | NOT NULL | - |
| CATE_ID | CD50 | NOT NULL | - |
| VALID_FROM | DTS | NOT NULL | - |
| CATE_NAME | NM100 | NULL | - |
| DEF_KIND | CD20 | NOT NULL | - |
| DEF_EXPR | TXT_A | NULL | - |
| DEF_TARGET | CD20 | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| VALID_TO | DTS | NOT NULL | `'9999-12-31 00:00:00'` |
| CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_DATA_CATE_ITEM**(FK 없음 대상 — F12)
PK `PK_TB_MDM_DATA_CATE_ITEM`(MARU_DATA_ID,CATE_ID,CODE,VALID_FROM) · FK `FK_TB_MDM_DATA_CATE_ITEM_DATA`(MARU_DATA_ID→TB_MDM_DATA)만 — CATE_ID·CODE 는 FK 없음

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_DATA_ID | CD50(FK) | NOT NULL | - |
| CATE_ID | CD50 | NOT NULL | - |
| CODE | CD50 | NOT NULL | - |
| VALID_FROM | DTS | NOT NULL | - |
| VALID_TO | DTS | NOT NULL | `'9999-12-31 00:00:00'` |
| CHG_SEQ | BIGI | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_DATA_RECV**
PK `PK_TB_MDM_DATA_RECV`(RECV_ID) · FK `FK_TB_MDM_DATA_RECV_DATA`(MARU_DATA_ID→TB_MDM_DATA), `FK_TB_MDM_DATA_RECV_SYSTEM`(SOURCE_SYSTEM→TB_MDM_SYSTEM, F2) · CK `CK_TB_MDM_DATA_RECV_RESULT` `CHECK ("RESULT" IS NULL OR "RESULT" IN ('OK','REJECTED','FAILED'))`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| RECV_ID | ID_AI | NOT NULL | - |
| MARU_DATA_ID | CD50(FK) | NULL | - |
| SOURCE_SYSTEM | CD20(FK) | NOT NULL | - |
| SOURCE_REF | CD50 | NULL | - |
| RECEIVED_AT | DTS | NOT NULL | - |
| BODY | TXT | NOT NULL | - |
| ROW_COUNT | INT4 | NOT NULL | 0 |
| `"RESULT"`/`[RESULT]` | CD20 | NULL | - |
| RESULT_DETAIL | TXT | NULL | - |
| CHG_SEQ | BIGI | NULL | - |
| PROCESSED_AT | DTS | NULL | - |

`+AUDIT9`

**TB_MDM_DATA_RECV_ITEM**
PK `PK_TB_MDM_DATA_RECV_ITEM`(RECV_ID,SEQ) · FK `FK_TB_MDM_DATA_RECV_ITEM_RECV`(RECV_ID→TB_MDM_DATA_RECV) · CK `CK_TB_MDM_DATA_RECV_ITEM_ACTION` `CHECK ("ACTION" IS NULL OR "ACTION" IN ('INSERT','UPDATE','CLOSE','REOPEN','NONE'))`

| 칼럼 | 타입 | NULL |
|---|---|---|
| RECV_ID | BIGINT(FK) | NOT NULL |
| SEQ | INT4 | NOT NULL |
| CODE | CD50 | NULL |
| `"ACTION"`/`[ACTION]` | CD20 | NULL |

`+AUDIT9`

---

### 6.5 영역 06 (dme) — `TB_MDM_RULE`·`RULE_SYSTEM`·`RULE_VER`·`RULE_VAR`·`RULE_ROW`·`RULE_TEST_CASE`·`RULE_SET`·`RULE_RECV`

배포 순번 `chg_seq` 없음(버전 스냅샷 배포, 06:905).

**TB_MDM_RULE**
PK `PK_TB_MDM_RULE`(MARU_RULE_ID) · FK `FK_TB_MDM_RULE_SYSTEM_SRC`(SOURCE_SYSTEM→TB_MDM_SYSTEM, F2, 06:896) · CK `CK_TB_MDM_RULE_KIND` IN('DECISION','DERIVE'), `CK_TB_MDM_RULE_STATUS` IN('CREATED','INUSE','DEPRECATED'), `CK_TB_MDM_RULE_SRC_KIND` IN('MDM','EXTERNAL'), `CK_TB_MDM_RULE_SRC_SYS` `CHECK ((SOURCE_KIND='EXTERNAL' AND SOURCE_SYSTEM IS NOT NULL) OR (SOURCE_KIND='MDM' AND SOURCE_SYSTEM IS NULL))`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_RULE_ID | CD50 | NOT NULL | - |
| MARU_RULE_NAME | NM100 | NOT NULL | - |
| RULE_KIND | CD20 | NOT NULL | - |
| STATUS | CD20 | NOT NULL | 'CREATED' |
| SOURCE_KIND | CD20 | NOT NULL | - |
| SOURCE_SYSTEM | CD20(FK) | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| USAGE_NOTE | TXT | NULL | - |
| LAST_VAR_ID | INT4 | NOT NULL | 0 |
| LAST_ROW_ID | INT4 | NOT NULL | 0 |
| LAST_CASE_ID | INT4 | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_RULE_SYSTEM**(보류)
PK `PK_TB_MDM_RULE_SYSTEM`(MARU_RULE_ID,SYSTEM_CODE) · FK `FK_TB_MDM_RULE_SYSTEM_RULE`(MARU_RULE_ID→TB_MDM_RULE), `FK_TB_MDM_RULE_SYSTEM_SYSTEM`(SYSTEM_CODE→TB_MDM_SYSTEM, F2) · CK `CK_TB_MDM_RULE_SYSTEM_KIND` IN('DEF','RESULT')

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_RULE_ID | CD50(FK) | NOT NULL | - |
| SYSTEM_CODE | CD20(FK) | NOT NULL | - |
| DEPLOY_KIND | CD20 | NOT NULL | 'DEF' |
| DESCRIPTION | TXT | NULL | - |

`+AUDIT9`

**TB_MDM_RULE_VER**
PK `PK_TB_MDM_RULE_VER`(MARU_RULE_ID,VER) · FK `FK_TB_MDM_RULE_VER_RULE`(MARU_RULE_ID→TB_MDM_RULE) · CK `CK_TB_MDM_RULE_VER_STATUS` IN('DRAFT','REQUESTED','APPROVED','RELEASED','CANCELLED'), `CK_TB_MDM_RULE_VER_HIT` `CHECK (HIT_POLICY IS NULL OR HIT_POLICY IN ('FIRST','UNIQUE','PRIORITY','COLLECT','ANY'))`, `CK_TB_MDM_RULE_VER_APPLY` `CHECK (STATUS='DRAFT' OR (APPLY_FROM IS NOT NULL AND APPLY_TO IS NOT NULL))`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_RULE_ID | CD50(FK) | NOT NULL | - |
| VER | INT4 | NOT NULL | - |
| STATUS | CD20 | NOT NULL | 'DRAFT' |
| BASE_VER | INT4 | NULL | - |
| OWNER_ID | CD50 | NULL | - |
| HIT_POLICY | CD20 | NULL | - |
| APPLY_FROM | DTS | NULL | - |
| APPLY_TO | DTS | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| REQUESTED_BY | CD50 | NULL | - |
| REQUESTED_AT | DTS | NULL | - |
| EMERGENCY_YN | YN1 | NOT NULL | 'N' |
| EMERGENCY_REASON | TXT | NULL | - |
| APPROVED_BY | CD50 | NULL | - |
| APPROVED_AT | DTS | NULL | - |
| REJECT_REASON | TXT | NULL | - |
| RELEASED_AT | DTS | NULL | - |
| CANCELLED_AT | DTS | NULL | - |
| CANCEL_REASON | TXT | NULL | - |
| ROW_VERSION | INT4 | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_RULE_VAR**
PK `PK_TB_MDM_RULE_VAR`(MARU_RULE_ID,VER,VAR_ID) · FK `FK_TB_MDM_RULE_VAR_VER`(MARU_RULE_ID,VER→TB_MDM_RULE_VER, **ON DELETE CASCADE**), `FK_TB_MDM_RULE_VAR_DOMAIN`(DOMAIN_ID→TB_MDM_DOMAIN, 02→06 정방향이라 인라인 가능) · UX `UX_TB_MDM_RULE_VAR_SEQ`(MARU_RULE_ID,VER,VAR_KIND,SEQ), `UX_TB_MDM_RULE_VAR_NAME`(MARU_RULE_ID,VER,VAR_NAME) **부분 인덱스** `WHERE VAR_KIND='RESULT'` · CK `CK_TB_MDM_RULE_VAR_KIND` IN('COND','RESULT'), `CK_TB_MDM_RULE_VAR_AXIS` `CHECK (AXIS IS NULL OR AXIS IN ('ROW','COL','NONE'))`, `CK_TB_MDM_RULE_VAR_DTYPE` `CHECK (DATA_TYPE IS NULL OR DATA_TYPE IN ('BOOLEAN','NUMBER','STRING','DATE'))`, `CK_TB_MDM_RULE_VAR_AGG` `CHECK (COLLECT_AGG IS NULL OR COLLECT_AGG IN ('LIST','SUM','MIN','MAX','COUNT'))`

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_RULE_ID | CD50(FK) | NOT NULL | - |
| VER | INT4(FK) | NOT NULL | - |
| VAR_ID | INT4 | NOT NULL | - |
| VAR_KIND | CD20 | NOT NULL | - |
| DISP_TYPE | CD20 | NULL | - |
| AXIS | CD20 | NULL | - |
| VAR_NAME | TXT_A | NULL | - |
| VAR_AST | JSONV | NULL | - |
| DOMAIN_ID | BIGINT/INTEGER(FK) | NULL | - |
| DATA_TYPE | CD20 | NULL | - |
| COLLECT_AGG | CD20 | NULL | 'LIST' |
| PRIO_LIST | JSONV | NULL | - |
| RES_GRP | CD50 | NULL | - |
| GRP_COND | TXT_A | NULL | - |
| GRP_COND_AST | JSONV | NULL | - |
| SEQ | INT4 | NOT NULL | - |
| LABEL | NM100 | NULL | - |
| DESCRIPTION | TXT | NULL | - |

`+AUDIT9`

**TB_MDM_RULE_ROW**
PK `PK_TB_MDM_RULE_ROW`(MARU_RULE_ID,VER,ROW_ID) · FK `FK_TB_MDM_RULE_ROW_VER`(MARU_RULE_ID,VER→TB_MDM_RULE_VER, **ON DELETE CASCADE**) · UX `UX_TB_MDM_RULE_ROW_SEQ`(MARU_RULE_ID,VER,SEQ) **부분 인덱스** `WHERE ROW_KIND='NORMAL'` · CK `CK_TB_MDM_RULE_ROW_KIND` IN('NORMAL','DEFAULT')

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_RULE_ID | CD50(FK) | NOT NULL | - |
| VER | INT4(FK) | NOT NULL | - |
| ROW_ID | INT4 | NOT NULL | - |
| SEQ | INT4 | NOT NULL | 0 |
| ROW_KIND | CD20 | NOT NULL | - |
| CELLS | JSONV_NN | NOT NULL | - |
| NOTE | TXT | NULL | - |
| TAG | CD50 | NULL | - |

`+AUDIT9`

**TB_MDM_RULE_TEST_CASE**
PK `PK_TB_MDM_RULE_TEST_CASE`(MARU_RULE_ID,CASE_ID) · FK `FK_TB_MDM_RULE_TEST_CASE_RULE`(MARU_RULE_ID→TB_MDM_RULE)

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_RULE_ID | CD50(FK) | NOT NULL | - |
| CASE_ID | INT4 | NOT NULL | - |
| CASE_NAME | NM100 | NULL | - |
| INPUT_JSON | JSONV_NN | NOT NULL | - |
| EXPECTED_JSON | JSONV | NULL | - |
| DESCRIPTION | TXT | NULL | - |
| ROW_VERSION | INT4 | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_RULE_SET**(버전 없음, 저장 즉시 배포)
PK `PK_TB_MDM_RULE_SET`(MARU_RULE_SET_ID) · RULE_IDS FK 없음(원천 명시) · CK `CK_TB_MDM_RULE_SET_STATUS` IN('INUSE','DEPRECATED')

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_RULE_SET_ID | CD50 | NOT NULL | - |
| MARU_RULE_SET_NAME | NM100 | NOT NULL | - |
| RULE_IDS | JSONV_NN | NOT NULL | - |
| DESCRIPTION | TXT | NULL | - |
| STATUS | CD20 | NOT NULL | 'INUSE' |
| ROW_VERSION | INT4 | NOT NULL | 0 |

`+AUDIT9`

**TB_MDM_RULE_RECV**
PK `PK_TB_MDM_RULE_RECV`(RECV_ID) · FK `FK_TB_MDM_RULE_RECV_RULE`(MARU_RULE_ID→TB_MDM_RULE), `FK_TB_MDM_RULE_RECV_SYSTEM`(SOURCE_SYSTEM→TB_MDM_SYSTEM, F2) · CK `CK_TB_MDM_RULE_RECV_REQ` IN('VERSION','CANCEL','DEPRECATE'), `CK_TB_MDM_RULE_RECV_RESULT` `CHECK ("RESULT" IS NULL OR "RESULT" IN ('OK','REJECTED','FAILED'))`

| 칼럼 | 타입 | NULL |
|---|---|---|
| RECV_ID | ID_AI | NOT NULL |
| MARU_RULE_ID | CD50(FK) | NULL |
| SOURCE_SYSTEM | CD20(FK) | NOT NULL |
| SOURCE_REF | CD50 | NULL |
| REQ_KIND | CD20 | NOT NULL |
| RECEIVED_AT | DTS | NOT NULL |
| BODY | TXT | NOT NULL |
| `"RESULT"`/`[RESULT]` | CD20 | NULL |
| RESULT_DETAIL | TXT | NULL |
| VER | INT4 | NULL |
| PROCESSED_AT | DTS | NULL |

`+AUDIT9`

**`cells`/`rule_ids` 참조 검사 쿼리**(방언 표현, 체크 h 의 기반):

SQLite:
```sql
-- RULE_ROW.cells 안 var_id 키가 그 버전의 RULE_VAR 에 실재하는지
SELECT r.maru_rule_id, r.ver, r.row_id, je.key AS cell_var_id
  FROM TB_MDM_RULE_ROW r, json_each(r.cells) je
 WHERE NOT EXISTS (
   SELECT 1 FROM TB_MDM_RULE_VAR v
    WHERE v.maru_rule_id = r.maru_rule_id AND v.ver = r.ver
      AND CAST(v.var_id AS TEXT) = je.key);

-- RULE_SET.rule_ids 배열 원소가 존재하는 룰인지(순번 0부터)
SELECT s.maru_rule_set_id, je.key AS ord, je.value AS rule_id
  FROM TB_MDM_RULE_SET s, json_each(s.rule_ids) je
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_RULE r WHERE r.maru_rule_id = je.value);
```

MSSQL:
```sql
SELECT r.maru_rule_id, r.ver, r.row_id, j.[key] AS cell_var_id
  FROM TB_MDM_RULE_ROW r
  CROSS APPLY OPENJSON(r.cells) j
 WHERE NOT EXISTS (
   SELECT 1 FROM TB_MDM_RULE_VAR v
    WHERE v.maru_rule_id = r.maru_rule_id AND v.ver = r.ver
      AND CAST(v.var_id AS NVARCHAR(20)) = j.[key]);

SELECT s.maru_rule_set_id, j.[key] AS ord, j.[value] AS rule_id
  FROM TB_MDM_RULE_SET s
  CROSS APPLY OPENJSON(s.rule_ids) j
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_RULE r WHERE r.maru_rule_id = j.[value]);
```
`OPENJSON`·`json_each` 모두 배열 순번은 0부터(방언표 #4). `key` 는 두 방언 모두 문자열이므로 `var_id`(정수) 비교 시 명시적 `CAST` 를 쓴다(advisor 지적 #9 반영).

---

### 6.6 교차 영역·순환 FK 처리 (MSSQL 전용)

SQLite 는 `PRAGMA foreign_keys` 강제가 DML 시점이라 CREATE TABLE 안에 전방 참조 FK 를 그대로 인라인해도 된다. MSSQL 은 `CREATE TABLE` 시점에 참조 테이블이 있어야 하므로 아래 2건은 **CREATE TABLE 밖의 후행 `ALTER TABLE ADD CONSTRAINT`** 로 뺀다.

| FK | 문제 | MSSQL 배치 |
|---|---|---|
| `TB_MDM_DOMAIN.MARU_CODE_ID → TB_MDM_CODE`(02→04) | 02 DDL 이 04 DDL 보다 먼저 실행됨 | `docs/mdm/erd/99-cross-area-fk.mssql.sql` 에 `ALTER TABLE TB_MDM_DOMAIN ADD CONSTRAINT FK_TB_MDM_DOMAIN_CODE FOREIGN KEY (MARU_CODE_ID) REFERENCES TB_MDM_CODE(MARU_CODE_ID);` — 02~06 DDL 전부 적용 뒤 마지막에 실행 |
| `TB_MDM_EAI.HEADER_LAYOUT_ID ↔ TB_MDM_LAYOUT.EAI_CODE`(03 내부 순환) | 두 테이블이 서로를 참조 | 03 MSSQL 파일 안에서: ① `TB_MDM_LAYOUT` 을 `EAI_CODE` 칼럼은 두되 FK 없이 생성 → ② `TB_MDM_EAI` 를 `HEADER_LAYOUT_ID` FK 포함해 생성(LAYOUT 이미 존재) → ③ 파일 끝에 `ALTER TABLE TB_MDM_LAYOUT ADD CONSTRAINT FK_TB_MDM_LAYOUT_EAI FOREIGN KEY (EAI_CODE) REFERENCES TB_MDM_EAI(EAI_CODE);` |

체크 b 는 파일 경계를 무시하고 스키마 전체에서 FK 3순組 집합을 비교하므로 이 배치 차이와 무관하게 통과해야 한다.

---

## 담당자 확인 필요 결정

### D1 — 03 헤더 적층 모델: md "전문당 헤더 하나" vs html "구간마다 적층"
- **질문**: `TB_MDM_EAI.header_layout_id` 단일 FK(md 03:9-11·60)로 고정할지, html 이 그리는 순서 있는 N개 헤더 적층(EAI 구간+시스템 구간, html:83·97·231)을 스키마에 반영할지.
- **선택지**: (1) md 그대로 단일 헤더만 구현. (2) 덧셈적 N-모델(`TB_MDM_LAYOUT_HEADER` 신설, N=1 이 md 와 동일하게 동작).
- **택한 것**: (2).
- **근거**: spec 의 데이터 모델 절이 이미 "TB_MDM_EAI, TB_MDM_LAYOUT, TB_MDM_LAYOUT_ITEM **(+ 헤더 적층·상수 재정의 테이블)**"이라 적어 적층 테이블 신설을 전제한다(spec 본문, 근거 1순위). html 자신이 "03이 아직 반영하지 않은 구조"라 명시한 것은 **화면 시안의 미완성**을 뜻할 뿐 데이터 모델의 오류를 뜻하지 않으며, 실제 AS-IS 전문(M201=GLUE+L2 두 헤더)이 md 단일모델로 표현 불가능함을 html 이 구체적으로 보여준다(html:97·231). N=1 이 md 동작을 정확히 재현하므로(포함 관계 성립) 되돌리기 비용이 없다.
- **반려 시 재작업**: `TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST` 2테이블과 관련 FK(§6.2)를 제거하고 `TB_MDM_EAI.header_layout_id` 만 남긴다. D2 는 `TB_MDM_LAYOUT_ITEM.default_value` 재정의 방식으로 축소 재설계한다.

### D2 — 상수 재정의 저장 테이블 설계
- **질문**: 전문별 CONST 항목 재정의 값을 어디에 저장할지(md·html 둘 다 "테이블이 아직 없다"고 명시, html:303).
- **선택지**: (1) `TB_MDM_LAYOUT_ITEM` 안에 재정의 칼럼 추가. (2) 별도 junction 테이블(메시지 레이아웃×헤더×헤더항목).
- **택한 것**: (2) `TB_MDM_LAYOUT_CONST(LAYOUT_ID, HEADER_LAYOUT_ID, HEADER_SEQ, CONST_VALUE)`.
- **근거**: (1)안은 헤더 자신의 기본값과 전문별 재정의값이 같은 칼럼(`default_value`)에 섞여 "3층 결정"(03:24, EAI 기본값→전문별 재정의→AUTO)을 표현할 수 없다. html 의 "상수 편집" 표(html:291-301)도 "항목/헤더 기본값/이 전문의 값" 3열로 그려 재정의가 헤더 원본과 분리된 값임을 보여준다. D1 의 N-헤더 모델과 자연스럽게 맞물린다(FK3 로 "부착된 헤더의 항목만 재정의 가능"을 DB 가 보장).
- **반려 시 재작업**: 테이블명·키 구성을 바꿔도 FK3(부착 무결성) 는 유지 권고. `default_value` 방식으로 바뀌면 `TB_MDM_LAYOUT_ITEM` 에 `override_layout_id` 성격의 칼럼을 추가해야 하며 PK 구조가 달라진다.

### D3 — 02 관리 속성(버전·유효기간·소유 부서·담당자·등록 출처) 물리 칼럼화
- **질문**: naming-dialect-rules §2 가 "02 원문대로 정하라"고 위임한 5개 속성을 TERM·DOMAIN 에 어떻게 물리화할지.
- **선택지**: (1) 5개 전부 생략(감사 칼럼으로 대체 가능하다고 보고). (2) TERM 에만 소유부서·담당자·등록출처 3칼럼 추가, 버전·유효기간은 생략. (3) TERM·DOMAIN 모두에 5개 전부 추가.
- **택한 것**: (2).
- **근거**: 02:762(테이블 설계 절 서두)는 "관리 속성(**버전·유효기간**)은 공통 모듈에서 일괄 정의하므로 생략"이라 적어 **이 두 개만** 생략 대상으로 예시했다 — "버전"은 이미 감사 `VER`(변경 카운터)과 승인 없는 저장-즉시-배포 정책(02:36 "표준 관리자가 저장하면 바로 배포")으로 실질적으로 커버되고, "유효기간"은 화면 요구사항(02:284-298 화면 변경표)에 입력 필드로 전혀 등장하지 않아 물리화 근거가 약하다. 반면 "소유 부서·담당자·등록 출처"는 02:36-39 TERM 속성표에 생략 언급 없이 그대로 남아 있고, 이 세 값을 대신할 감사 칼럼(작성자 `C_USR_ID`)은 "의미 결정 책임자"·"가져온 출처"라는 업무 의미와 다르다(감사 칼럼은 시스템 사용자, 이 세 속성은 업무상 조직/문서 정보). DOMAIN 은 02:82 가 "**소유자는 두지 않는다**"고 명시적으로 배제하므로 DOMAIN 에는 추가하지 않는다.
- **반려 시 재작업**: (1)안으로 되돌리려면 TERM 의 3칼럼(`OWNER_DEPT`·`OWNER_ID`·`SRC_ORIGIN`)을 제거한다(FK·UX 영향 없음, 안전). (3)안이면 DOMAIN 에 동일 3칼럼(소유자 제외 — 02:82 상 소유자는 불가)과 유효기간 칼럼(`VALID_FROM`/`VALID_TO` 후보) 추가를 재검토한다.

### D4 — `TB_MDM_TERM.embedding`/`embedding_model` 이번 범위 제외
- **질문**: 02 원문에 있는 벡터 칼럼을 이번 DDL 에 넣을지.
- **선택지**: (1) `vector` 대응 플레이스홀더 타입(예: `TEXT`/`VARBINARY`)으로 칼럼만 선점. (2) 이번 DDL 에서 완전히 제외.
- **택한 것**: (2).
- **근거**: naming-dialect-rules §3 #23 이 "이 표 범위 밖(TSK-02-02)"이라 명시하고, TRD T6 은 "원장 DB 밖(파일 인덱스 또는 별도 저장)에 둘 수 있다"고 하여 이 칼럼이 `TB_MDM_TERM` 에 남는다는 보장 자체가 없다. 플레이스홀더 타입을 먼저 정하면 TSK-02-02 결정과 충돌해 재작업이 생긴다.
- **반려 시 재작업**: TSK-02-02 조사 결과 원장 DB 안에 두기로 하면 `TB_MDM_TERM` 에 `EMBEDDING`(SQLite `BLOB`, MSSQL `VARBINARY(MAX)`)·`EMBEDDING_MODEL`(`CD50`) 2칼럼을 추가하는 Flyway 마이그레이션을 낸다. `expected-columns.json` 의 "추가 칼럼" 목록도 갱신한다.

### D5 — 06 문서의 "05의 `last_key_no`" 불일치
- **질문**: 06:931 이 언급하는 "05의 `last_key_no`"가 05 실제 설계에 없다(F14) — 06 의 `var_id`/`row_id`/`case_id` 채번 칼럼을 그대로 채택해도 되는지.
- **선택지**: (1) 06 ERD 가 실제로 정의한 `TB_MDM_RULE.last_var_id`·`last_row_id`·`last_case_id`(06:797-799) 채택. (2) 05 문서를 추가로 뒤져 대응 개념을 찾는다.
- **택한 것**: (1).
- **근거**: 06 ERD(06:788-800) 와 테이블 설계 절(06:957)이 이 3칼럼을 명시적으로 정의하며 실측(06:1297 샘플 데이터)까지 있어 그 자체로 자기충족적이다. 05 문서 재조사는 06 자신의 정의를 대체할 근거를 찾는 것이 아니라 06 문서의 교차참조 오탈자를 확인하는 것뿐이며, 이미 05:599-703 전체를 직접 재확인해 `last_key_no` 부재를 확인했다(F14).
- **반려 시 재작업**: 05 에 실제로 `last_key_no` 개념이 있는 것으로 판명되면(예: 05 의 다른 리비전 문서) 06 채번 방식을 그 패턴으로 재정렬한다. 현재 설계(§6.5)는 영향받지 않는다(06 자체 칼럼만 쓰므로).

### D6 — `TB_MDM_COLUMN.phys_name` 유일 제약 신설
- **질문**: 03 `TB_MDM_LAYOUT_ITEM.column_phys` 가 "표준 물리명"(03:80)을 참조값으로 적는데, 02 원문은 `phys_name` 의 DB UNIQUE 여부를 명시하지 않는다. FK 를 걸려면 유일해야 한다.
- **선택지**: (1) `UX_TB_MDM_COLUMN_PHYS_NAME` 신설 후 FK. (2) FK 없이 앱 검사로만 참조(02 의 다른 "FK 없음" 패턴처럼).
- **택한 것**: (1).
- **근거**: PRD FR-A3 이 "물리명 자동 생성·도메인 추천·**중복 검사**"를 명시해 phys_name 중복이 업무적으로 이미 금지 대상임을 보여준다. FK 로 걸면 이 중복 금지가 DB 레벨에서도 강제되어 03 레이아웃이 존재하지 않는 물리명을 가리키는 상태를 원천봉쇄한다(F15).
- **반려 시 재작업**: phys_name 중복이 실제로 허용되는 사례가 발견되면 UX 를 제거하고 `TB_MDM_LAYOUT_ITEM.column_phys` 를 FK 없는 앱 검사 칼럼으로 되돌린다.

### D7 — 교차 영역/순환 FK 의 MSSQL 배치(§6.6)
- **질문**: `DOMAIN→CODE`(02→04), `EAI↔LAYOUT`(03 내부) 두 FK 를 MSSQL DDL 어디에 넣을지.
- **선택지**: (1) 각 파일 CREATE TABLE 인라인(있는 그대로 두면 MSSQL 오류). (2) 후행 `ALTER TABLE ADD CONSTRAINT` 로 분리.
- **택한 것**: (2), §6.6 표대로.
- **근거**: MSSQL 은 `CREATE TABLE ... FOREIGN KEY` 시점에 참조 테이블이 이미 있어야 한다(일반 T-SQL 제약, 실측하지 않고 표준 동작으로 판단 — F4·불변규칙 7 에 따라 이 부분은 "확인"이 아니라 "규칙"으로 남긴다). SQLite 는 이 문제가 없어 인라인을 유지해 두 방언 파일 구조 차이를 최소화한다.
- **반려 시 재작업**: 실제 MSSQL 실행(영역 계약 Task, local-db 프로파일)에서 이 배치로도 오류가 나면 §6.6 파일 순서를 조정하고 `naming-dialect-rules.md` §3 에 실측 결과를 기록한다.

---

## Build 단계 이탈 기록 (design.md 대비)

1. **감사 `VER` 과 업무 `VER` 이름 충돌 → `AUD_VER` 개명**. §6.0 은 감사 9칼럼에 `VER BIGI`(변경 카운터)를 모든 테이블에 두라고 하지만, `TB_MDM_CODE_VER`·`TB_MDM_CODE_RECV`(§6.3)·`TB_MDM_RULE_VER`·`TB_MDM_RULE_VAR`·`TB_MDM_RULE_ROW`·`TB_MDM_RULE_RECV`(§6.5)는 원천 업무 칼럼으로도 `VER`(버전 번호, 일부는 PK 구성요소)을 갖는다 — 같은 테이블에 `VER` 을 두 번 선언하는 `CREATE TABLE` 은 SQL 문법상 불가능하다. Build 는 이 6개 테이블에 한해 **감사 카운터만 `AUD_VER` 로 개명**하고 원천 `VER` 은 그대로 두었다(불변 규칙 2 "원천 칼럼은 대소문자만 바꾼다"를 지킴 — 원천이 아닌 감사 칼럼 쪽을 조정). 근거·되돌리기 방법은 `decisions.md` D-022.
2. **02 MSSQL `TB_MDM_DOMAIN` JSON CHECK 4개 누락 보강**. §6.1 `TB_MDM_DOMAIN` 타입표는 `STD_AST`·`BIZ_AST`·`EXAMPLES`·`TEST_CASES` 를 `JSONV`(= CHECK 포함)로 지정하는데, Build 최초 초안의 MSSQL DDL 에서 이 4개의 `ISJSON` CHECK 를 빠뜨렸다(SQLite 쪽은 처음부터 정상). 체크 b(두 방언 CK 이름 집합 대조)로 발견해 `CK_TB_MDM_DOMAIN_{STD_AST,BIZ_AST,EXAMPLES,TEST_CASES}_JSON` 4개를 추가했다.
3. **§3 체크 e 산식 정정**: "35개 테이블 중 `TB_MDM_DICT_SEQ` 를 제외한 34개"는 검증용 `TB_MDM_SYSTEM` fixture(F2, 이 Task 비소유)를 포함한 계산이라 부정확하다. 실제 이 Task 소유 테이블은 34개이고, `TB_MDM_DICT_SEQ` 를 빼면 감사 칼럼 검사 대상은 **33개**다. `Verify.java` 체크 e 와 `docs/mdm/erd/README.md` 는 33/33 으로 바로잡았다.

세 항목 모두 `docs/mdm/erd/verify/` 의 검증(체크 a~i 전부 PASS, 변이 검증 8건 전부 FAIL 유도 성공)을 통과한 상태에서 반영됐다.
