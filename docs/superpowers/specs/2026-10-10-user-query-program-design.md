# 공용 쿼리 조회 — 쿼리 정의 관리 · 사용자 조회 화면 · 공용 SQL 편집기

- 날짜: 2026-10-10
- 출처: 2026-10-10 사용자 문답(D1~D5), 조정자 추가 요구 4건(관리 조회조건, Monaco 편집기, 로그 뷰어 테마 통합, DB 뷰어 편집기 기반)
- 시안: [userq-mockup.html](assets/2026-10-10-userq-mockups/userq-mockup.html). 시안의 역할·부서 할당은 D4 로 뺀다(사용자 단위만).
- **설계 게이트 면제(D1)**: RULE.md 분기 3 과 [Mes-Guide §4](../../guide/MES/Mes-Guide.md#4-개발-진입-가드)는 5종 설계 산출물을 요구한다. 레거시 As-Is 가 없는 신규 공통 화면이라, 사용자가 이 스펙 하나로 개발을 시작하도록 승인했다(2026-10-10). 5종 산출물(`docs/mcm/design/userQueryMng/`·`docs/mcm/design/userQuery/`)은 구현이 끝난 뒤 작성한다.

## 0. 범위와 결정

| ID | 결정 |
|---|---|
| D1 | 이 스펙이 설계 정본이다. 5종 산출물은 구현 뒤 작성한다 |
| D2 | 새 표 `TB_MCM_USRQ_DEF`·`TB_MCM_USRQ_ASSIGN`. 입력 정의는 위젯 `QueryParam` 모양, 출력 정의는 위젯 `TableColumnConfig` 모양. 실행은 `WidgetQueryExecutor` 에서 정의 없는 저수준 `run` 을 뽑아 쓴다(위젯 동작 변화 없음) |
| D3 | 관리 화면 `csa/userQueryMng`(정의 탭 + 할당 탭)도 이번 범위다 |
| D4 | 할당은 사용자 단위만. 키 (QUERY_ID, USER_ID) |
| D5 | 두 화면 모두 OASIS BPMN + `@Service`. 실행 요청은 queryId 와 값만 받는다(SQL 안 받음). 서버가 할당을 DB 에서 다시 확인한다. `AUTH_ONLY`·`EndpointPermissionFilter`·`proxy.ts` 는 고치지 않는다 |
| D6 | SQL 편집 칸은 공용 Monaco 편집기 `SqlCodeEditor`(shared)로 통일한다. 기반은 DB 뷰어 편집기다. 위젯 관리·예약 작업 관리·로그 뷰어·DB 뷰어도 옮긴다(§9) |

제외: 기존 사용자별 개별 프로그램 이관, 역할·부서 단위 할당, 다른 모듈 DB 연결(§6.4), 시안의 기간·다중 선택·코드 LoV 조건, 상대 날짜 기본값, 합계 줄(§11 미결 6).

## 1. 개념

- **쿼리 정의**는 관리자가 등록한다. 정의는 SQL(Oracle SELECT·WITH 한 문장), 입력 정의(→ 조회조건), 출력 정의(→ 그리드 열), 최대 행, 사용 여부로 이루어진다.
- **할당**은 정의와 사용자를 잇는다. 사용자는 자기에게 할당되고 사용 중인 정의만 보고 실행한다.
- 사용자 화면은 하나다. 왼쪽 목록(기본 20%, 끌어서 조절)에서 쿼리를 고르면 오른쪽이 정의대로 조회조건과 그리드를 그린다.
- 입력 정의·출력 정의·SQL 검사·실행 엔진은 쿼리 위젯과 같은 것을 쓴다. 정의 저장 위치와 권한 판정만 다르다.

## 2. 데이터

### 2.1 DDL — `V13__user_query.sql`

위치: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/`. 2026-10-10 기준 V13 은 비어 있다. 병렬 레인이 먼저 쓸 수 있으므로 머지 직전에 번호를 다시 확인한다(스킬 `flyway-migration-add`). DDL 은 V3 의 표기(소문자, 감사 칸 한 줄 묶음)를 따르고, 조회문은 [oracle-sql-rules 4장](../../guide/Database/oracle-sql-rules.md#4-쿼리-서식)을 따른다.

```sql
create table TB_MCM_USRQ_DEF (
    QUERY_ID varchar2(40 char) not null,
    QUERY_NM varchar2(100 char) not null,
    CATEGORY_CD varchar2(20 char),
    QUERY_DESC varchar2(500 char),
    OWNER_DEPT_CD varchar2(10 char),
    SQL_TEXT clob not null,
    PARAMS_JSON clob,
    COLUMNS_JSON clob,
    MAX_ROW_CNT number(6,0) default 1000 not null,
    USE_YN char(1 char) default 'Y' not null,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_USRQ_DEF primary key (QUERY_ID),
    constraint CK_TB_MCM_USRQ_DEF_USE check (USE_YN in ('Y','N')),
    constraint CK_TB_MCM_USRQ_DEF_MAX check (MAX_ROW_CNT between 1 and 5000)
);

create table TB_MCM_USRQ_ASSIGN (
    QUERY_ID varchar2(40 char) not null,
    USER_ID varchar2(30 char) not null,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_USRQ_ASSIGN primary key (QUERY_ID, USER_ID)
);
create index IX_TB_MCM_USRQ_ASSIGN_USER on TB_MCM_USRQ_ASSIGN (USER_ID, QUERY_ID);
```

- 같은 파일 끝에 `COMMENT ON TABLE`·`COMMENT ON COLUMN` 을 모든 칸에 넣는다(V12 와 같은 이유: DB 뷰어 칸 이름). 감사 칸 주석은 V12 문구(`생성일시` 등)를 그대로 쓴다.
  - 표: `공용 쿼리 정의`, `공용 쿼리 할당`
  - 칸: QUERY_ID `쿼리 ID`, QUERY_NM `쿼리 이름`, CATEGORY_CD `분류`, QUERY_DESC `설명`, OWNER_DEPT_CD `담당 부서 코드`, SQL_TEXT `조회 SQL`, PARAMS_JSON `입력 정의(JSON)`, COLUMNS_JSON `출력 정의(JSON)`, MAX_ROW_CNT `최대 행 수`, USE_YN `사용 여부`, USER_ID `사용자 ID`
- `USER_ID varchar2(30 char)` 는 `TB_MCM_SEC_USER.USER_ID` 와 같은 길이다. `OWNER_DEPT_CD varchar2(10 char)` 는 `TB_MCM_DEPT_INFO.DEPT_CD` 와 같다.
- 외래 키는 두지 않는다. 기준선과 V2~V12 에 외래 키가 하나도 없다. 정의 삭제는 서비스가 할당을 먼저 지운다. 사용자 표에 키를 걸면 사용자 삭제·재등록 흐름이 막히므로, 없는 사용자의 할당은 할당 탭이 「없는 사용자」로 보인다.
- 색인: 할당 PK(QUERY_ID 앞)는 관리 목록의 할당 수·할당 사용자 조건(정의 행마다 EXISTS)에 쓴다. `IX_TB_MCM_USRQ_ASSIGN_USER` 는 사용자 목록(`myList`)에 쓴다. 정의 표는 수백 행 규모라 조건 칸 색인을 두지 않는다.
- 엔티티는 `McmAuditEntity` 를 상속한다(`@Table(schema = "MCMAPUSER")`). 표준단어사전은 「할당」을 `ALLOC` 으로 정했지만 표 이름은 D2 대로 `ASSIGN` 을 쓴다.

### 2.2 JSON 칸

| 칸 | 모양 | 검사(저장·실행 때마다) |
|---|---|---|
| `PARAMS_JSON` | 위젯 입력 조건 배열 `[{name, label?, type: text\|number\|date\|select, default?, required?, options?: [{value, label?}]}]` | `QueryParams.parse` 그대로(최대 10개, 이름 `^[A-Za-z][A-Za-z0-9_]{0,29}$`, 시스템 변수 이름 금지) |
| `COLUMNS_JSON` | 위젯 표 열 배열 `[{field, header?, width?, align?: left\|center\|right, format?: text\|number\|date}]` | 서버: 배열·최대 100개·field 글자(1~128)·열거값. 화면은 `tableConfigOf`·`toColumnDefs` 규칙으로 그린다(설정이 없으면 결과 열 전부) |

## 3. 화면·메뉴·권한

| 화면 | OBJECT_ID = serviceId | componentPath | 메뉴 폴더 | FULL_SEQ(기록용) | 기본 권한 |
|---|---|---|---|---|---|
| 쿼리 정의 관리 | `userQueryMng` | `csa/userQueryMng` | `csa` 시스템관리 | 1020230 (jobSchedMng 1020220 다음) | SYSADMIN × PERM_ALL |
| 공용 쿼리 조회 | `userQuery` | `cmq/userQuery` | **`cmq` 공용 조회(신규, 사용자 확인 필요)** | 1070100 (폴더 1070000, MENU_SEQ `00000700`, lsh 600 다음) | SYSADMIN × PERM_ALL. 일반 역할은 운영자가 `PERM_USRQ_USE` 로 매핑 |

- 권한키는 `{objId}/{action}` 이고 OASIS 경로의 serviceId 가 objId 가 된다. 그래서 serviceId 와 OBJECT_ID 를 같게 둔다.
- 시드: `ModuleMenuSeeder` 에 `seedUserQueryMenus()` 하나를 더하고 `DataInitializer` 의 `seedJobSchedMngMenu()` 다음에 부른다. 폴더 `cmq` 는 `insertMpnFld("cmq", "00000700", "공용 조회", "mcm", 1070000L)` 로 만든다. FULL_SEQ 는 부팅 끝 `recomputeMenuFullSeq()` 가 다시 매긴다.
- 권한 세트: `CoreRbacSeeder` 에 `PERM_USRQ_USE`(이름 `공용 쿼리 사용`, PERMISSION_ACTION `myList,getDef,run`)를 insert-if-absent 로 더한다. 지금 일반 역할이 쓸 mcm 권한 세트가 없어서(PERM_ALL·PERM_MDM_* 뿐) 새로 둔다.
- `allActions` 에 새 토큰 5개를 덧붙인다: `searchAssign`, `saveAssign`, `myList`, `getDef`, `run`. 선언 모양(`String.join` 한 덩어리)은 바꾸지 않는다. `ScreenUsageOasisContractTest`·`MdmOasisActionVocabularyTest` 가 이 선언을 글자로 읽는다. 나머지 action(`search`, `get`, `save`, `delete`, `previewQuery`, `validate`, `searchUserList`)은 이미 있다.
- 분류 코드: 새 공통코드 그룹 `USRQ_CTG`(공용 쿼리 분류)를 `WidgetCategoryCodeSeeder` 와 같은 방식으로 시드한다. 처음 값은 `ETC 기타` 하나다(미결 3). 화면은 위젯 관리의 `use-widget-categories.ts` 와 같은 LoV 호출로 이름을 얻는다.

## 4. OASIS 계약

공통 규칙:

- 경로 `POST /api/mcm/oasis/{serviceId}/{action}`, 본문 `{ meta: { menuId: "<OBJECT_ID>" }, params: { … } }`. `params` 는 평평한 글자 값만 담는다. 배열·객체는 JSON 글자(`…Json`)로 싣는다(oasis-contract-check 6-E-2).
- serviceTask 는 모두 `output="result"` 이고 Map 을 돌려준다. 응답은 `data.result.{키}` 에 실린다. 화면은 `widget-types/_query/api.ts` 의 `unwrapResult` 규칙(meta.success=false 거절, data·data.result 펼침)으로 푼다. 위젯 관리와 같은 모양이다(6-D-2 INFO, 짝 unwrap 있음).
- `@Service` 에 `@Transactional` 을 붙이지 않는다(6-B-1). 쓰기 action(save·delete·saveAssign)만 BPMN process 에 `tx=txBiz` 를 둔다. 게이트웨이는 sequenceFlow `name` 으로만 가른다(6-C-3).
- BPMN: `mcm/api/src/main/resources/services/csa/userQueryMng.bpmn`, `…/services/cmq/userQuery.bpmn`. 서비스 빈: `userQueryMngService`, `userQueryService`(패키지 `com.dongkuk.dmes.mcm.userq`, mcm-core).
- 응답 키는 camelCase 다. 날짜시각은 ISO 글자다.

### 4.1 `userQueryMng`(관리, SYSADMIN)

| action | params | result |
|---|---|---|
| `search` | `categoryCd?`, `keyword?`(ID·이름 부분 일치), `useYn?`(Y·N), `ownerDept?`(부서 코드 같음 또는 부서 이름 부분 일치), `assignUser?`(할당 사용자 ID·이름 앞 일치) | `{ rows: [{ queryId, queryNm, categoryCd, ownerDeptCd, ownerDeptNm, useYn, maxRowCnt, assignCnt, uAt, uUsrId }] }` |
| `get` | `queryId` | `{ def: { queryId, queryNm, categoryCd, queryDesc, ownerDeptCd, ownerDeptNm, sqlText, paramsJson, columnsJson, maxRowCnt, useYn, ver, cAt, cUsrId, uAt, uUsrId } }` |
| `save` | `queryId`, `queryNm`, `categoryCd?`, `queryDesc?`, `ownerDeptCd?`, `sqlText`, `paramsJson?`, `columnsJson?`, `maxRowCnt`, `useYn`, `ver?`(없으면 신규) | `{ queryId, ver }` |
| `delete` | `queryId`, `ver` | `{ deleted: 1, assignDeleted: n }` |
| `previewQuery` | `sqlText`, `paramsJson?` | `{ columns: string[], rows: [{…}], truncated }`. 50행. DB 오류 문구를 그대로 보인다(관리자 SQL 작성 도움) |
| `validate` | `sqlText`, `paramsJson?` | `{ binds: string[] }`. SQL 이 쓰는 사용자 바인드 이름(처음 나온 순서) |
| `searchAssign` | `queryId` | `{ rows: [{ userId, userNm, deptCd, deptNm, missingYn }] }` |
| `saveAssign` | `queryId`, `userIdsJson`(JSON 글자 배열, 전체 교체, 최대 2000) | `{ added, removed }` |
| `searchUserList` | (없음) | `{ rows: [{ userId, userNm, deptCd, deptNm }], truncated }`. 사용 중 사용자, 최대 5000 |
| `searchDepts` | `keyword?` | `{ depts: [{ deptCd, deptNm, upperDeptCd }] }`. 최대 50. 담당 부서 선택 팝업용. `commWidgetMng/searchDepts` 와 같은 서비스 메서드·같은 모양이며, 관리 화면이 위젯 관리 권한에 기대지 않게 따로 둔다(2026-10-10 추가). `searchDepts` 토큰은 `allActions` 에 이미 있다 |

- `save` 검사: `queryId` 는 `^[A-Z][A-Z0-9_]{2,39}$`, 저장 뒤 바꿀 수 없다. 신규인데 같은 ID 가 있으면 거절한다. 갱신은 `ver` 가 DB 와 다르면 거절한다(「다른 사람이 먼저 고쳤습니다. 다시 조회하세요」). SQL 은 `validateSql(sql, 선언 이름)`, 입력 정의는 `QueryParams.parse`, 출력 정의는 §2.2 로 검사한다.
- `saveAssign` 은 없는 사용자 ID 를 거절한다. 새 집합과 DB 집합의 차이만 INSERT·DELETE 한다.
- `search` SQL(정적 SQL). 서비스가 `%`·`_`·`\` 앞에 `\` 를 붙인 값을 `:keyword`·`:ownerDept`·`:assignUser` 에 바인드하고, 담당 부서 원래 값을 `:ownerDeptCd` 에 바인드한다. 빈 값은 null 로 바인드한다.

```sql
SELECT A.QUERY_ID
     , A.QUERY_NM
     , A.CATEGORY_CD
     , A.OWNER_DEPT_CD
     , B.DEPT_NM OWNER_DEPT_NM
     , A.USE_YN
     , A.MAX_ROW_CNT
     , (
           SELECT COUNT(*)
           FROM   MCMAPUSER.TB_MCM_USRQ_ASSIGN C
           WHERE  C.QUERY_ID = A.QUERY_ID
       ) ASSIGN_CNT
     , A.U_AT
     , A.U_USR_ID
FROM   MCMAPUSER.TB_MCM_USRQ_DEF A
     , MCMAPUSER.TB_MCM_DEPT_INFO B
WHERE  B.DEPT_CD(+) = A.OWNER_DEPT_CD
AND    (:categoryCd IS NULL OR A.CATEGORY_CD = :categoryCd)
AND    (:useYn IS NULL OR A.USE_YN = :useYn)
AND    (:keyword IS NULL
        OR UPPER(A.QUERY_ID) LIKE '%' || UPPER(:keyword) || '%' ESCAPE '\'
        OR UPPER(A.QUERY_NM) LIKE '%' || UPPER(:keyword) || '%' ESCAPE '\')
-- 담당 부서 이름 조건은 외부 조인 뒤에 일부러 거른다((+) 없음)
AND    (:ownerDept IS NULL
        OR A.OWNER_DEPT_CD = UPPER(:ownerDeptCd)
        OR B.DEPT_NM LIKE '%' || :ownerDept || '%' ESCAPE '\')
AND    (:assignUser IS NULL OR EXISTS
       (
           SELECT 1
           FROM   MCMAPUSER.TB_MCM_USRQ_ASSIGN C
                , MCMAPUSER.TB_MCM_SEC_USER D
           WHERE  D.USER_ID(+) = C.USER_ID
           AND    C.QUERY_ID = A.QUERY_ID
           -- 사용자 이름 조건은 외부 조인 뒤에 일부러 거른다((+) 없음)
           AND    (UPPER(C.USER_ID) LIKE UPPER(:assignUser) || '%' ESCAPE '\'
                   OR UPPER(D.USER_NM) LIKE UPPER(:assignUser) || '%' ESCAPE '\')
       ))
ORDER BY A.CATEGORY_CD, A.QUERY_NM, A.QUERY_ID
```

### 4.2 `userQuery`(사용자, 역할 매핑)

| action | params | result |
|---|---|---|
| `myList` | (없음) | `{ rows: [{ queryId, queryNm, categoryCd, queryDesc }] }` |
| `getDef` | `queryId` | `{ queryId, queryNm, categoryCd, queryDesc, params: QueryParam[], columns: TableColumnConfig[], maxRowCnt }`. **SQL 은 싣지 않는다** |
| `run` | `queryId`, `paramsJson?`(`{"이름":"값"}` JSON 글자, 4000자 이하) | `{ columns: string[], rows: [{…}], truncated, maxRowCnt }` |

- 사용자 ID 는 늘 인증 컨텍스트(`WidgetUserContextResolver`)에서 얻는다. 요청에 사용자 칸이 있어도 읽지 않는다.
- `getDef`·`run` 은 DB 에서 (정의 있음, `USE_YN='Y'`, 할당 행 있음)을 매번 확인한다. 하나라도 아니면 같은 문구 「쿼리를 찾을 수 없습니다」로 거절한다(있는지 없는지를 알리지 않는다).
- `run` 은 요청의 `sql`·`sqlText` 같은 칸을 읽지 않는다. SQL 은 DB 의 `SQL_TEXT` 만 쓴다.
- `myList` SQL:

```sql
SELECT B.QUERY_ID
     , B.QUERY_NM
     , B.CATEGORY_CD
     , B.QUERY_DESC
FROM   MCMAPUSER.TB_MCM_USRQ_ASSIGN A
     , MCMAPUSER.TB_MCM_USRQ_DEF B
WHERE  B.QUERY_ID = A.QUERY_ID
AND    A.USER_ID = :userId
AND    B.USE_YN = 'Y'
ORDER BY B.CATEGORY_CD, B.QUERY_NM, B.QUERY_ID
```

## 5. 실행 엔진 — `WidgetQueryRunner.run`

`WidgetQueryRunner` 에 정의 없는 저수준 실행을 더한다.

```java
/** 저장된 정의 없이 SQL·입력 정의·값으로 실행한다. 캐시를 쓰지 않는다. 검사·바인드·읽기 전용 실행은 runDefinition 과 같다. */
WidgetQueryResult run(String sql, String paramDefsJson, Map<String, String> values, int maxRows);
```

- `runDefinition` 의 공통 단계(SqlGuard 검사 → 입력 값 해석 → 시스템 변수 → `WidgetReadOnlyJdbc` 실행)를 private 단계로 뽑아 두 메서드가 함께 쓴다. `runDefinition` 은 정의 읽기·캐시·오류 문구를 지금처럼 그대로 둔다. 기존 위젯 시험은 고치지 않고 통과해야 한다.
- `run` 이 던지는 것: 입력 값 오류는 `BusinessException(INVALID_VALUE)` 그대로(사용자에게 보여도 되는 문구). SQL·입력 정의 오류와 DB 실행 오류는 원인을 담은 별도 예외로 던진다. 호출자가 자기 문구로 바꾸고 로그에 남긴다.
- 시스템 변수(`:userId`·`:deptCd`·`:today`·`:bizDate` 등)는 위젯과 같다. 데이터소스는 위젯과 같은 `WidgetQueryDataSource` 다.

## 6. 실행 정책

| 항목 | 값 |
|---|---|
| 행 상한 | 정의의 `MAX_ROW_CNT`(기본 1000, 1~5000). 상한+1 행까지 읽고 넘으면 버린 뒤 `truncated=true` |
| 시간 상한 | 10초(`WidgetQueryExecutor.QUERY_TIMEOUT_SEC` 그대로, 미결 5) |
| 캐시 | 쓰지 않는다. 결과가 사용자·값마다 다르고, 보고용 조회는 늘 최신 값을 기대한다 |
| 호출 빈도 | 사용자마다 1분에 20회(`WidgetUserQuota`, 사용자 5000명까지). 넘으면 「잠시 후 다시 조회하세요」 |
| 잘림 안내 | 그리드 아래 줄에 `truncatedNote(rowCount)`(「상위 N행만 표시합니다」) |
| 엑셀 | `AgDataGrid` 의 `excelExport`. 받은 행만, 보이는 열 그대로, 파일 이름 `{쿼리 이름}_{yyyyMMdd}.xlsx`, 잘렸으면 같은 안내를 note 로. 서버 전체 내려받기는 없다 |
| 사용자 오류 문구 | 정의 없음·미할당·사용 중지: 「쿼리를 찾을 수 없습니다」. SQL·정의 오류: 「쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요」. DB 오류·시간 초과: 「조회하지 못했습니다. 관리자에게 문의하세요」. 서버 로그에는 queryId·userId·원인을 남긴다 |

### 6.1 데이터 범위

- 이번에는 mcm 연결(위젯 쿼리와 같은 계정) 하나로만 실행한다. 정의에 `DATA_SRC` 칸을 두지 않는다.
- 시안처럼 다른 모듈 표(`TB_MPP_*`·`TB_MLS_*`·`TB_MQC_*`)를 읽으려면 스키마 접두를 쓰고, 실행 계정에 그 표의 SELECT 권한이 있어야 한다. 권한이 없으면 사용자는 「조회하지 못했습니다」만 본다(미결 4).

## 7. 보안

| 위협 | 대책 |
|---|---|
| 정의를 통한 SQL 주입·쓰기 | SQL 은 SYSADMIN 만 등록한다(`userQueryMng` 권한). 저장과 실행 때마다 `SqlGuard`(SELECT·WITH 한 문장, 금지 낱말)를 거친다. 실행은 `WidgetReadOnlyJdbc`(읽기 전용 트랜잭션, 늘 롤백) |
| 값 주입 | 사용자 값은 선언된 입력 정의로 서버가 형별로 해석한 스칼라만 바인드한다. SQL 글자를 잇지 않는다 |
| IDOR(남의 쿼리 실행·정의 열람) | 사용자 ID 는 인증 컨텍스트에서만 얻는다. `getDef`·`run` 마다 할당을 DB 에서 확인한다(Mes-Guide §7). 실패 문구를 하나로 둔다 |
| SQL·스키마 노출 | 사용자 응답(`myList`·`getDef`·`run`)에 SQL 을 싣지 않는다. DB 오류 문구는 사용자에게 보내지 않는다(관리 미리보기만 예외) |
| 결과 데이터 과다 노출 | 할당된 사용자만 실행한다. 행 상한 5000. 정의 작성자가 `:userId`·`:deptCd` 로 행을 거를 수 있다 |
| 무거운 쿼리(DoS) | 10초 시간 상한, 행 상한, 사용자별 호출 빈도 상한, 캐시 없음으로 결과 메모리가 쌓이지 않는다 |
| 운영 쓰기 우회 | Oracle 은 자율 트랜잭션 함수·DDL 이 읽기 전용 트랜잭션을 벗어날 수 있다. 운영에서는 **읽기 권한만 가진 계정의 전용 DataSource**(`dmes.widget.query.datasource.*`)를 붙여야 한다. 운영 반영 전 점검 항목이다 |
| 권한 우회 | 사용자 화면은 일반 메뉴 OBJECT 라 `EndpointPermissionFilter` 가 `userQuery/{action}` 권한키로 판정한다. AUTH_ONLY 에 넣지 않는다 |

## 8. 화면

### 8.1 사용자 화면 `cmq/userQuery`

- 뼈대: `PageLayout`(버튼: 조회 F8, action `run`. 엑셀은 상단 버튼 없이 그리드 설정 메뉴 「엑셀 출력」) → `ContentBody root resizable storageKey="mcm.cmq.userQuery"` → 왼쪽 `ContentPanel width="20%"`(목록), 오른쪽 `ContentPanel`(조회조건 + 그리드). 경계를 끌어 폭을 바꾸고 `split-sizing` 이 사용자별로 기억한다(위젯 관리 `WidgetListTab.tsx` 와 같은 방식).
- 왼쪽: `myList` 결과를 분류 이름으로 묶어 보인다. 위에 이름 거르기 칸을 둔다(화면 안에서만 거른다). 비었으면 「할당된 쿼리가 없습니다. 관리자에게 요청하세요」.
- 쿼리를 고르면 `getDef` 를 부르고 조회조건을 기본값(`initialValues`)으로 되돌린다. 결과는 비운다. 자동 조회하지 않는다.
- 조회조건: `SearchArea`(`onSearch` = 조회, `defaults={false}`) 안에 입력 정의마다 칸 하나를 그린다. 칸 그리기는 `ConditionBar.tsx` 의 `ConditionField` 를 export 해서 쓴다(text·number·date·select). 필수 값이 비면 `missingRequired` 로 막고 「조건을 입력하고 조회하세요」를 보인다. 칸이 쿼리마다 바뀌므로 조회 기본값 저장은 끈다. 한 화면 단위 저장 키로는 다른 쿼리의 값이 엉뚱한 칸에 들어가기 때문이다.
- 그리드: `AgDataGrid`, 열은 `toColumnDefs(result.columns, { columns }, rows)`, 행은 `toGridRows`, 행 키 `TABLE_ROW_KEY`, `columnSizing="fit"`. 빈 결과는 `QUERY_EMPTY`.
- `query-table/renderer.tsx`·`useQueryData` 는 그대로 쓸 수 없다. 위젯 틀 상태(`useWidgetStatus`)와 `widgetData/run` 에 묶여 있기 때문이다. 순수 함수와 부품만 가져다 쓴다.
- 마지막으로 고른 queryId 는 `localStorage` 에 보관해 다시 열 때 고른다(try/catch, 실패해도 동작한다).

### 8.2 관리 화면 `csa/userQueryMng`

- 뼈대: `PageLayout`(버튼: 조회 F8, 신규, 저장, 삭제) → `SearchArea`(분류 select, 쿼리 이름·ID text, 사용 여부 select 전체·사용·미사용, 담당 부서 text, 할당 사용자 text) → `ContentBody root resizable storageKey="mcm.csa.userQueryMng"` → 왼쪽 목록 그리드(`ContentPanel width="40%"`), 오른쪽 탭 [정의] [할당].
- 목록 열: 쿼리 ID, 이름, 분류, 담당 부서, 사용, 최대 행, 할당 수, 수정일시.
- [정의] 탭
  - 기본 정보: 쿼리 ID(신규 때만 입력), 이름, 분류, 담당 부서(이 화면의 `DeptPicker` 가 `userQueryMng/searchDepts` 를 부른다), 설명, 최대 행, 사용 여부.
  - SQL: `widget-types/_query/SqlEditor`(S2 이후 `SqlCodeEditor` 기반). 미리보기 함수는 새 prop `runPreview` 로 넘겨 `userQueryMng/previewQuery` 를 부른다. 기본값은 지금처럼 `commWidgetMng/previewQuery` 다.
  - 입력 정의: `ParamsEditor` 그대로. [SQL 검증]은 화면에서 `appendUndeclaredParams` 로 선언 안 된 `:이름` 을 글자 형으로 더한 뒤 서버 `validate` 로 확인한다.
  - 출력 정의: 미리보기가 성공하면 결과 열 중 없는 것만 `appendMissingFields` 로 덧붙인다. 있는 열은 지우지 않는다. 관리자가 머리글·폭·정렬·형식을 고친다. 열 편집 부품은 `query-table/editor.tsx` 의 열 표를 뽑아 함께 쓴다.
  - 미리보기 그리드: 결과 50행을 출력 정의대로 그린다.
- [할당] 탭: shared `TransferList`. 후보는 `searchUserList`(코드 userId, 이름 userNm, 분류 deptNm), 값은 `searchAssign` 의 userId 집합. [할당 저장]이 `saveAssign` 을 부른다. `missingYn='Y'` 행은 배지 「없는 사용자」를 단다.
- 저장하지 않은 고침이 있을 때 다른 행을 고르면 확인 창을 띄운다.
- 구현에서 정한 동작(2026-10-10): 진입 때 `SearchArea autoSearch` 로 한 번 조회한다. [신규] 는 첫 조회가 끝나기 전에는 비활성이다. 저장 직후 `get` 을 다시 불러 기준값과 ver 를 갱신하되 편집기와 [쿼리 시험] 결과는 유지한다(재조회가 실패하면 저장 응답의 ver 로 계속한다). 할당 후보가 5000명에서 잘리면 안내를 띄우고, 저장 때 「없는 사용자」 는 자동으로 빼고 그 수를 알린다. 조회는 마지막 요청의 응답만 반영한다.

### 8.3 FE 파일·타입

```
m-mcm/page-components/_userq/types.ts   공용 타입(아래)
m-mcm/page-components/_userq/api.ts     userQueryMng·userQuery 호출 + unwrapResult
m-mcm/page-components/_userq/use-usrq-categories.ts   분류 코드(USRQ_CTG) 목록 훅, 두 화면 공용
m-mcm/page-components/csa/userQueryMng/{page.tsx, QueryListPanel.tsx, DefTab.tsx, AssignTab.tsx, PreviewGrid.tsx, DeptPicker.tsx, form-model.ts, *.test.ts}
m-mcm/page-components/cmq/userQuery/{page.tsx, QueryListPane.tsx, RunPane.tsx, run-model.ts, *.test.ts}
m-mcm/widget-types/_query/ColumnsEditor.tsx   출력 열 편집 표. query-table/editor.tsx 에서 뽑아 위젯과 관리 화면이 함께 쓴다
```

`widget-types/_query/ConditionBar.tsx` 의 `ConditionField` 는 사용자 화면이 쓰도록 export 한다(동작 변화 없음).

`_userq` 에는 `page.tsx` 를 두지 않는다(페이지 등록부 생성기가 `page.tsx` 만 화면으로 올린다).

```ts
import type { QueryParam, QueryResult, TableColumnConfig } from "../../widget-types/_query/format";

export type UserQueryParam = QueryParam;          // 위젯 입력 조건 그대로
export type UserQueryColumn = TableColumnConfig;  // 위젯 표 열 그대로

export interface UserQuerySummary { queryId: string; queryNm: string; categoryCd: string | null; queryDesc: string | null }
export interface UserQueryRunDef extends UserQuerySummary { params: UserQueryParam[]; columns: UserQueryColumn[]; maxRowCnt: number }
export interface UserQueryRunResult extends QueryResult { maxRowCnt: number }   // { columns, rows, truncated, maxRowCnt }

export interface UserQueryListRow {
  queryId: string; queryNm: string; categoryCd: string | null; ownerDeptCd: string | null; ownerDeptNm: string | null;
  useYn: "Y" | "N"; maxRowCnt: number; assignCnt: number; uAt: string | null; uUsrId: string | null;
}
export interface UserQueryDef {
  queryId: string; queryNm: string; categoryCd: string | null; queryDesc: string | null;
  ownerDeptCd: string | null; ownerDeptNm: string | null; sqlText: string;
  params: UserQueryParam[]; columns: UserQueryColumn[];   // api.ts 가 paramsJson·columnsJson 을 풀고 묶는다
  maxRowCnt: number; useYn: "Y" | "N"; ver: number | null;
}
export interface UserQuerySearchCond { categoryCd?: string; keyword?: string; useYn?: "Y" | "N"; ownerDept?: string; assignUser?: string }
export interface UserQueryAssignRow { userId: string; userNm: string | null; deptCd: string | null; deptNm: string | null; missing: boolean }
export interface UserQueryCandidate { userId: string; userNm: string; deptCd: string | null; deptNm: string | null }
```

## 9. 공용 SQL 편집기 `SqlCodeEditor`(shared)

DB 뷰어 편집기(`m-analog/src/anl/db-viewer/db-sql-editor.tsx`·`sql-completion.ts`·`sql-assist.ts`)를 기반으로 삼는다. 데이터와 무관한 부분을 shared 로 올리고, 데이터 출처별 자동 완성은 prop 으로 끼운다.

### 9.1 위치·의존

- `src/frontend/shared/src/components/code-editor/` 에 `SqlCodeEditor.tsx`, `monaco-loader.ts`, `code-theme.ts`, `sql-completion.ts`(전역 제공자 + 모델별 분배), `sql-keywords.ts`(DB 뷰어 `SQL_KEYWORDS` 이동), `bind-ranges.ts`(`:이름` 위치 찾기, 순수 함수), `index.ts`. export 경로 `@dk-oasis/shared/code-editor`.
- `monaco-editor` 는 지금 m-analog 만 의존한다(`^0.55.1`, `.pnpm/monaco-editor@0.55.1` 하나). shared `package.json` dependencies 에 **같은 버전** `"monaco-editor": "^0.55.1"` 을 더한다. 버전이 갈리면 Monaco 가 두 벌 실리고 전역 테마가 따로 놀기 때문이다. m-mcm 에는 더하지 않는다(shared 실제 경로에서 해석된다).
- shared `tsup.config.ts` 의 `external` 에 `"monaco-editor"` 를 명시한다(m-analog `tsup.config.ts:12-14` 와 같은 규칙). 로더는 `import("monaco-editor")` 동적 호출만 쓴다. 최상위 정적 import 는 타입(`import type`)만 허용한다.
- 워크트리에서 `pnpm install` 을 할 때는 `node_modules` 심링크 여부를 먼저 확인하고 워크트리 안에서만 한다.

### 9.2 API

```ts
export interface InsertPoint { start: number; end: number; version: number }
export interface SqlCodeEditorHandle {
  getValue(): string;
  setValue(sql: string): void;
  focus(): void;
  captureInsertPoint(): InsertPoint | null;
  /** kind: "column" 칸 이름(목록 안이면 쉼표), "value" SQL 리터럴, "raw" 그대로. 편집기가 아직 없으면 false. */
  insertAtCursor(text: string, kind?: "column" | "value" | "raw", at?: InsertPoint | null): boolean;
}
export interface SqlCompletionItem { label: string; kind: "keyword" | "table" | "column" | "bind" | "other"; insertText?: string; detail?: string }
export interface SqlCompletionProvider {
  /** 키워드 후보에 더할 후보. ctx 는 커서 앞 글, 커서가 든 문장, 커서의 단어다. */
  provide(ctx: { textBefore: string; statement: string; word: string }): Promise<SqlCompletionItem[]> | SqlCompletionItem[];
}
export interface SqlCodeEditorProps {
  value?: string;                  // 제어형(onChange 와 함께)
  defaultValue?: string;           // 비제어형(ref.getValue 로 읽기, DB 뷰어 방식)
  revision?: number;               // 비제어형에서 같은 값으로 되돌릴 때 올리는 번호
  onChange?: (sql: string) => void;
  onRun?: () => void;              // Ctrl/Cmd+Enter, F8
  readOnly?: boolean;
  height?: number | string;        // 기본 160
  expandable?: boolean;            // 기본 true. [크게 보기] 버튼
  expandTitle?: string;            // 큰 창 제목(기본 "SQL")
  completionProvider?: SqlCompletionProvider;
  highlightBinds?: boolean;        // 기본 true
  placeholder?: string;
  ariaLabel?: string;
  testId?: string;                 // 뿌리 data-testid. 큰 창은 `${testId}-expand`·`${testId}-modal`·`${testId}-apply`
}
```

- 편집기 설정은 DB 뷰어 값을 그대로 쓴다(`language: "sql"`, 미니맵 끔, 단어 기반 제안 끔, `acceptSuggestionOnEnter: "smart"` 등).
- `:이름` 강조는 언어를 새로 만들지 않고 모델 장식(decoration, CSS 의미 토큰 색)으로 한다. 전역 `sql` 언어와 DB 뷰어 동작을 바꾸지 않기 위해서다.
- 자동 완성: shared 가 `sql` 언어 제공자를 전역에 한 번 등록한다. 제공자는 shared 편집기 모델(WeakMap)에만 키워드 + `completionProvider` 후보를 돌려준다. 다른 모델에는 빈 목록을 준다.
- [크게 보기]: shared `Modal`(화면의 약 90% 크기)에 같은 내용의 두 번째 편집기를 띄운다. [적용]이 값을 돌려주고(`onChange` 또는 `setValue`), [취소]·Esc 는 버린다. 큰 창 안 Ctrl/Cmd+Enter 는 적용한 뒤 `onRun` 을 부른다. `readOnly` 면 [닫기]만 있다.
- Monaco 를 불러오는 동안과 불러오기에 실패했을 때는 shared `Textarea`(같은 testId, 같은 aria-label, 같은 값)를 보인다.
- 시험: shared·m-mcm 의 vitest 설정에 `resolve.alias` 로 `monaco-editor` 를 불러오기가 실패하는 대역 모듈로 바꾼다. 그러면 jsdom 시험은 대체 칸으로 돌고, 지금 `_query/sql-editor.test.ts` 처럼 글 칸을 다루는 시험이 그대로 산다. Monaco 실제 동작은 브라우저 확인으로 본다.
- 등록 절차는 [Part B §18-3](../../guide/FrontEnd/standard-v2/part-b-shared-policy.md#18-새-공통-컴포넌트-등록)을 따른다: 색·간격은 공통 토큰, 스타일은 컴포넌트가 넣는 `<style>`, `tsup` entry·`package.json` exports·Part B §1 허용 목록 표, 단위 시험은 `shared/tests/unit/`, `pnpm why monaco-editor` 로 한 벌 확인.

### 9.3 테마 규칙(전역)

- Monaco 테마는 페이지 전체에 하나만 걸린다. 그래서 DMES 의 모든 Monaco 편집기는 **테마 `dmes-code` 하나**를 쓴다.
- `dmes-code` = `base: "vs"` + 로그 토큰 규칙(지금 `log-language.ts` 의 `LOG_THEME_RULES` 를 shared `code-theme.ts` 로 옮긴 것) + SQL 은 `vs` 기본 색. 토큰 이름이 겹치지 않으므로 로그와 SQL 이 함께 산다.
- `defineTheme`·`setTheme` 는 shared 로더만 부른다. 다른 코드는 `editor.create({ theme: DMES_CODE_THEME_ID })` 만 쓴다.
- S3 전에는 m-analog 가 아직 `logview` 를 쓴다. `dmes-code` 가 `logview` 규칙을 모두 담으므로 어느 쪽이 나중에 걸려도 로그 강조는 유지된다. 바인드 강조는 CSS 장식이라 테마와 무관하다.

## 10. 작업 항목·레인

| 항목 | 내용 | 레인 | 선행 |
|---|---|---|---|
| S1 | shared `SqlCodeEditor`·로더·테마·자동 완성 분배 + `mantine-aggrid-ui` 스킬 `references/components/code-editor.md`·`llms.txt` 색인 | fe-shared | 없음. **먼저 머지** |
| S2 | 옮기기: 위젯 `_query/SqlEditor.tsx`(Textarea → `SqlCodeEditor`, `runPreview` prop 추가), 예약 작업 `KindEditors.tsx` QUERY `sql`·COLLECT 원천 SQL. testId(`job-query-sql` 등)·aria-label 유지, 원천 SQL 칸에 `job-collect-sql` 추가 | fe-shared | S1 |
| S3 | m-analog 로그 뷰어(로그 편집기 + SQL 바인드 편집창)·DB 뷰어가 shared 로더·테마·편집기를 쓰게 한다. DB 뷰어 표·칸 후보는 `completionProvider` 로 넘긴다. m-analog 의 전역 `sql` 제공자 등록과 `monaco-editor` 직접 의존(Part B §18-3, 화면 패키지 중복 금지)을 없앤다. 로그 언어(Monarch) 등록은 m-analog 에 남기고 shared 로더가 준 monaco 로 한다. 동작 변화 없음 | fe-shared | S1 |
| B1 | V13, 엔티티·저장소, `WidgetQueryRunner.run` 뽑기, 두 서비스·BPMN, 메뉴·권한·코드 시드, 시험 | be | 없음 |
| A1 | 관리 화면 뼈대·조회조건·목록·[할당] 탭, `_userq/types.ts`·`api.ts` | fe-admin | 계약(§4) |
| A2 | 관리 [정의] 탭(SQL·입력·출력·미리보기) | fe-admin | S2, A1 |
| U1 | 사용자 화면 | fe-user | `_userq/types.ts`(A1 이 먼저 올리거나 U1 이 같은 내용으로 만든 뒤 머지 때 하나로 합친다) |

- fe-shared 는 작은 네 번째 레인이다. `SqlEditor.tsx` 는 S2 만 고친다(A2 와 충돌 방지). A2 는 §8.2 의 `runPreview` 계약으로 먼저 개발한다.
- FE 레인은 BE 머지 전에는 §4 응답 모양의 가짜 응답으로 시험한다.

## 11. 시험 계획(바뀐 모듈만)

| 레인 | 시험 |
|---|---|
| be | `./gradlew :mcm-core:test --tests '*UserQuery*' --tests '*WidgetQuery*' --tests '*ScreenUsageOasisContract*'`, `:mcm:api:test --tests '*UserQuery*'`, oasis-contract-check. 레인 PDB(`L_<레인>`)에 V13 적용. 사례: 미할당 사용자 `getDef`·`run` 거절(문구 동일), 사용 중지 거절, 응답에 SQL 없음, 요청의 `sql` 무시, `maxRowCnt` 잘림, DML·다문장 저장 거절, VER 충돌, 없는 사용자 할당 거절, `search` 조건 5개 각각과 조합, 호출 빈도 상한, 기존 위젯 시험 무수정 통과 |
| fe-shared | shared vitest(`bind-ranges`, 자동 완성 분배, 대체 칸, 큰 창 적용·취소), shared build. m-mcm vitest(`_query`·`jobSchedMng` 기존 시험), m-analog build. 브라우저: 로그 뷰어와 SQL 편집기를 한 화면(MDI)에 열고 로그 강조 유지 확인 |
| fe-admin | m-mcm vitest(`_userq/api`, `form-model`), `pnpm build`, 브라우저: 조회조건 5개, 저장·삭제, 미리보기 → 출력 정의 채움, 할당 저장 |
| fe-user | m-mcm vitest(`run-model`: 필수 값, 잘림 안내, 열 규칙), `pnpm build`, 브라우저: 목록 20%·폭 조절·조회·엑셀, 미할당 사용자 계정으로 빈 목록 |

브라우저 확인은 ego-browser 로 하고, 끝나면 연 작업 공간을 닫는다.

## 12. 미결(사용자 확인 필요)

1. 사용자 화면 메뉴 폴더: 새 폴더 `cmq` 「공용 조회」(공통관리 아래 7번째)로 둘지.
2. 일반 역할 권한: 새 권한 세트 `PERM_USRQ_USE` 를 어느 역할에 기본 매핑할지(이번 시드는 SYSADMIN 만).
3. 분류 코드: 새 그룹 `USRQ_CTG` 와 처음 값(생산·품질·출하·기타 등). 위젯 `WIDGET_CTG` 를 같이 쓸지.
4. 다른 모듈 표 조회: 실행 계정에 MPP·MLS·MQC 표 SELECT 권한을 줄지, 운영 읽기 전용 계정을 어떻게 둘지.
5. 시간 상한 10초·행 상한(기본 1000, 최대 5000)이 업무 조회에 맞는지.
6. 시안 기능 중 이번에 뺀 것: 기간(daterange) 칸, 다중 선택(`IN`), 공통코드 LoV 선택, 상대 날짜 기본값(`-7d`), 합계 줄·숫자 서식 마스크.
