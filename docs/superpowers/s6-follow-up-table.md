# s6 중간 일치 · 조인 SUBSTR 위치 표

기준: src/backend (build·archive·test 제외)와 scripts/db-snapshot/widget_sql_oracle.json. 경로 접두 `mcmc` = `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm`, `mdml` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`.

## 건수 합계
- 부류 1 (UPPER(칼럼) LIKE 중간 일치): 표 행 기준 **54건** (A 절 12 + B 절 42). 칼럼 단위로 세면 B-21 한 행이 쿼리 5개·칼럼 11개이므로 그보다 많다.
- 부류 2 (조인 ON 절 칼럼 쪽 SUBSTR): **4건** (Oracle 위젯 SQL 4개. 같은 SQL 의 sqlite 사본 4개는 합계에서 뺐다).
- 앞 일치 전용(SecUserRepository 79~81, RuleQueries:112 searchPrefix)과 IN 비교(DomainImpactQueries, MdmColumnSystemRepository)는 제외했다.
- 표 한 행은 한 칼럼이 원칙이고, B-21 만 한 줄이 여러 표·칼럼을 만든다.

## 전체 읽기 위험 「큼」 판단
- mdml/common/mastercode/MasterCodeRemoval.java:82 한 곳 (아래 B 절 B-21). 나머지는 상한이 있거나 마스터성 표이거나 다른 조건이 걸려 「큼」 이 아니다.

## A. 사용자가 지정한 위치 (mcm)

| # | 파일:줄 | 칼럼(표) | 패턴 | 행 수 상한 | 함께 걸리는 다른 조건 | 전체 읽기 위험 |
|---|---|---|---|---|---|---|
| A1 | mcmc/cma/masterCodeSelPop/service/MasterCodeSelPopService.java:105 | CODE_VAL (VI_MCM_CODE_ACCESS = 코드 마스터·카테고리·상세 3표 조인 뷰) | `UPPER(CODE_VAL) LIKE UPPER(:pValueLike)`, 바인드 `"%"+v+"%"` (:128) | 없음 (ORDER BY CODE_VAL 만) | `UPPER(CODE_ID)=UPPER(:pCodeId)` 선택(:100, 함수 기반 인덱스 IX_TB_MCM_CODE_MASTER_UP_ID 있음), 뷰의 MASTER.USE_TP='Y' | 중간 (pCodeId 없으면 코드 상세 전체, 행 수 모름) |
| A2 | 같은 파일:109 | CODE_VAL_MEAN | 위와 같음 | 없음 | 위와 같음 | 중간 |
| A3 | src/backend/mcm/api/src/main/resources/persistence/query/cma/masterCodeSelPop.xml:30 | CODE_VAL | `UPPER(CODE_VAL) LIKE UPPER(#{pValueLike})`, bind `'%'+값+'%'` (:29) | 없음 | `UPPER(CODE_ID)=UPPER(#{pCodeId})` 선택(:26), USE_TP='Y'(뷰) | 중간 |
| A4 | 같은 파일:34 | CODE_VAL_MEAN | 위와 같음 | 없음 | 위와 같음 | 중간 |
| A5 | mcmc/cme/masterCodeMngList/service/MasterCodeMngListService.java:97 | CODE_NM (TB_MCM_CODE_MASTER) | `UPPER(CODE_NM) LIKE UPPER(:pCodeNmLike)`, 바인드 `"%"+v+"%"` (:107), `:pCodeNmEmpty=1 OR` 형태 | 없음 | CODE_ID·MASTER_CODE LIKE `%v%` 선택(:95~96, 이것도 중간 일치지만 UPPER 없음) | 작음 (코드 마스터) |
| A6 | mcmc/repository/DeptInfoRepository.java:46 | deptNm (부서 마스터) | `UPPER(d.deptNm) LIKE UPPER(CONCAT('%', :pDeptKey, '%'))` (JPQL), deptCd 앞 일치와 OR 이라 인덱스 합류 불가 | 없음 | `d.useTp='Y'` 고정 | 작음 |
| A7 | mcmc/repository/RuleMasterRepository.java:47 (searchRuleMasterList) | ruleId (룰 마스터) | `UPPER(e.ruleId) LIKE UPPER(CONCAT('%', :pRuleId, '%'))` | 없음 | `e.useTp <> 'N'`, `ruleId <> COALESCE(oldRuleId,'ZZZZ0000')` | 작음 |
| A8 | 같은 파일:48 | ruleNm | 위와 같음(:pRuleNm) | 없음 | 위와 같음 | 작음 |
| A9 | 같은 파일:78 (searchRuleMasterListPop) | ruleId | 위와 같음 | 없음 | `ruleId <> COALESCE(oldRuleId,' ')` 만 (USE_TP 조건 없음) | 작음 (룰 마스터) |
| A10 | 같은 파일:79 | ruleNm | 위와 같음 | 없음 | 위와 같음 | 작음 |
| A11 | mcmc/cmb/masterRuleData/service/MasterRuleDataService.java:170 | 동적 칼럼 `col` (화이트리스트 칼럼, 표 TB_MCA_<ruleId>) | `UPPER(col) op UPPER(:vN)`, op=LIKE 면 값은 사용자가 입력한 그대로 바인드(:193, `%`는 사용자 입력 몫) | ROW_NUMBER+BETWEEN 페이징(기본 30행, :197~201) 이지만 CTE 전체 계산·COUNT(*) 전체(:200) | 조건 최대 5개(AND), RULE_VER·RULE_SEQ 등 | 모름 (룰 데이터 표 크기 규칙별) |
| A12 | mcmc/cmb/masterRuleDataList/service/MasterRuleDataListService.java:153 | 동적 칼럼 `col` | 위와 같음 | 같은 방식 페이징(:184) | 위와 같음 | 모름 |

## B. 그 밖에 발견한 중간 일치

| # | 파일:줄 | 칼럼(표) | 패턴 | 행 수 상한 | 함께 걸리는 다른 조건 | 전체 읽기 위험 |
|---|---|---|---|---|---|---|
| B-1 | mcmc/repository/MasterCodeRepository.java:35 | codeNm (코드 마스터) | `UPPER(m.codeNm) LIKE UPPER(CONCAT('%', :pCodeNm, '%'))` | 없음 | codeId·masterCode LIKE `%v%` 선택 | 작음 |
| B-2 | mcmc/repository/SecMenuNativeRepository.java:133 | A.MENU_ID (TB_MCM_SEC_MENU) | `UPPER(A.MENU_ID) LIKE UPPER('%' \|\| :edtMenuId \|\| '%')` | 없음 | MENU_NM LIKE, USE_TP=:cboUseTp 선택, 폴더 트리 조건 | 작음 (메뉴 마스터) |
| B-3 | mcmc/repository/SecMenuNativeRepository.java:287 | O.OBJECT_ID | `UPPER(O.OBJECT_ID) LIKE UPPER('%' \|\| :edtObjectId \|\| '%')` | 없음 (ORDER BY OBJECT_ID) | `O.USE_TP='Y'` 고정 | 작음 (화면 객체 표) |
| B-4 | 같은 파일:287 | O.OBJECT_NM | 위와 같음, OR | 없음 | 위와 같음 | 작음 |
| B-5 | mcmc/repository/SecObjRepository.java:50 | o.objectId | `UPPER(o.objectId) LIKE UPPER(CONCAT('%', :pObjectId, '%'))` | 없음 | useTp 선택 | 작음 |
| B-6 | 같은 파일:51 | o.objectNm | 위와 같음, OR | 없음 | 위와 같음 | 작음 |
| B-7 | mcmc/repository/SecPermRepository.java:51 | p.permissionId | `UPPER(...) LIKE UPPER(CONCAT('%', :v, '%'))` | 없음 | useTp 선택 | 작음 |
| B-8 | 같은 파일:53 | p.permissionNm | 위와 같음 | 없음 | 위와 같음 | 작음 |
| B-9 | mcmc/repository/SecRoleGroupRepository.java:54 | g.roleGroupId | 위와 같음 | 없음 | useTp 선택 | 작음 |
| B-10 | 같은 파일:56 | g.roleGroupNm | 위와 같음 | 없음 | 위와 같음 | 작음 |
| B-11 | mcmc/repository/SecRoleRepository.java:54 | r.roleId | 위와 같음 | 없음 | useTp 선택 | 작음 |
| B-12 | 같은 파일:56 | r.roleNm | 위와 같음 | 없음 | 위와 같음 | 작음 |
| B-13 | mcmc/repository/SecRoleMappingNativeRepository.java:203 (searchObjectLov) | OBJECT_ID (TB_MCM_SEC_OBJ) | `UPPER(OBJECT_ID) LIKE UPPER('%' \|\| :edtObjectId \|\| '%')` | 없음 | `USE_TP='Y'` 고정 | 작음 |
| B-14 | 같은 파일:203 | OBJECT_NM | 위와 같음, OR | 없음 | 위와 같음 | 작음 |
| B-15 | mcmc/widget/repository/WidgetUserLookupRepository.java:49 | u.userId (McmSecUser) | `upper(u.userId) like :pattern escape '!'`, 패턴 `%키워드%` (:41) | `setMaxResults(limit)` (:55) | useTp='Y', endActiveDate, userId<>:me | 작음 (사용자 마스터, 상한 있음) |
| B-16 | 같은 파일:49 | u.userNm | 위와 같음, OR | 상한 있음 | 위와 같음 | 작음 |
| B-17 | src/backend/mcm/lib/src/main/java/com/dongkuk/dmes/mcm/notice/repository/NoticeRepository.java:43 (searchByFilter) | n.title (공지) | `UPPER(n.title) LIKE UPPER(CONCAT('%', :pTitle, '%'))` | Limit 인자(:57), 전체 조회 경로는 `Limit.unlimited()`(:62) | 상태·분류·형식 일치, 게시기간 교차(NULL 허용 OR) 선택 | 작음 (공지 표) |
| B-18 | 같은 파일:76 (searchSummaryByFilter) | n.title | 위와 같음 | Limit 인자(:90) | 위와 같음 | 작음 |
| B-19 | mdml/common/mastercode/MasterCodeLedgerQueries.java:59 | MARU_CODE_ID (TB_MDM_CODE) | `UPPER(MARU_CODE_ID) LIKE :kw ESCAPE '\'`, kw `%이스케이프값%` (:64) | 없음 | 없음 (키워드 없으면 WHERE 자체 생략) | 작음 (마루 코드 헤더 마스터) |
| B-20 | 같은 파일:59 | MARU_CODE_NAME | 위와 같음, OR | 없음 | 없음 | 작음 |
| B-21 | mdml/common/mastercode/MasterCodeRemoval.java:82 | 표마다 식·AST 칼럼 전부: TB_MDM_DOMAIN(STD_RULE·STD_AST·BIZ_RULE·BIZ_AST), TB_MDM_RULE_VAR(VAR_AST·GRP_COND·GRP_COND_AST), TB_MDM_RULE_ROW(CELLS), TB_MDM_CODE_CATE(DEF_EXPR), TB_MDM_DATA_CATE(DEF_EXPR) — 코드 한 줄이 쿼리 5개를 만든다, 칼럼은 11개 | `UPPER(칼럼) LIKE '%MASTER%'` 리터럴(칼럼들을 OR) | 없음 | TB_MDM_CODE_CATE 만 `MARU_CODE_ID <> :self`, 나머지 조건 없음 | **큼** (룰 행·변수 표 전체를 CLOB 포함해 읽는다. 코드 삭제 확인 때만 호출되는 드문 경로이고 표 크기는 소스에 없어 추정) |
| B-22 | mdml/common/rule/RuleQueries.java:129 (searchCallable) | r.maruRuleId (룰) | `UPPER(r.maruRuleId) LIKE :kw ESCAPE '\'`, kw `%…%` (:139) | `setMaxResults(limit)` (:144) | status<>'DEPRECATED', 현재 RELEASED 또는 DRAFT 소유자 EXISTS | 작음 |
| B-23 | 같은 파일:129 | r.maruRuleName | 위와 같음, OR | 상한 있음 | 위와 같음 | 작음 |
| B-24 | 같은 파일:248 (where(RuleFilter)) | r.maruRuleId | `… LIKE :kw ESCAPE '\'`, kw `%…%` (:266) | 페이징 setFirstResult/setMaxResults (:59), COUNT 쿼리는 전체 | ruleKind·status 선택 | 중간 (룰 목록, 수천 행 추정) |
| B-25 | 같은 파일:248 | r.maruRuleName | 위와 같음, OR | 위와 같음 | 위와 같음 | 중간 |
| B-26 | mdml/common/rule/RuleSetVersionQueries.java:72 (mayBeCalled) | CALL_SET_IDS (CLOB, TB_MDM_RULE_SET_VER) | `UPPER(CALL_SET_IDS) LIKE :p ESCAPE '\'`, p `%"세트ID"%` (:75) | `setMaxResults(1)` | `STATUS='RELEASED'` | 중간 (CLOB 칼럼, 하나라도 찾으면 멈추나 없으면 RELEASED 행 전체 스캔) |
| B-27 | 같은 파일:83 (searchCallable) | s.maruRuleSetId | `… LIKE :kw ESCAPE '\'`, kw `%…%` (:88) | `setMaxResults(limit)` (:101) | status<>'DEPRECATED', RELEASED·DRAFT EXISTS | 작음 |
| B-28 | 같은 파일:83 | s.maruRuleSetName | 위와 같음, OR | 상한 있음 | 위와 같음 | 작음 |
| B-29 | mdml/common/rule/confirm/RuleConfirmQueries.java:100 | r.maruRuleId | `… LIKE :kw ESCAPE '\'`, kw `%…%` (likePattern :108) | drafts(keyword, limit) 는 limit>0 일 때만 상한 (:68~70), countDrafts 는 없음 | v.status='DRAFT', r.sourceKind='MDM' 고정 | 작음 |
| B-30 | 같은 파일:100 | r.maruRuleName | 위와 같음, OR | 위와 같음 | 위와 같음 | 작음 |
| B-31 | mdml/dma/termMng/service/TermSearchPrefilter.java:56 (TermMngService:110, :111 에서 사용) | termName (용어 사전 TB_MDM_TERM) | `cb.like(cb.upper(col), '%…%', '!')` | 없음 (`findAll(spec, ORDER)`; 상한 limit 은 키워드·상황·시스템 조건이 모두 없을 때만 적용 :104~108) | 키워드는 termName·engAbbr·synonyms·aliases OR, context 와 AND | 중간 (용어 사전 8천 행대) |
| B-32 | 같은 파일:57 | engAbbr | 위와 같음 | 없음 | 위와 같음 | 중간 |
| B-33 | 같은 파일:62 | context | 위와 같음 (contextPattern) | 없음 | 키워드와 AND | 중간 |
| B-34 | 같은 파일:71 (jsonListMayContain, 호출 :58~59) | synonyms (JSON 문자열) | `upper(col) LIKE '%…%'` OR `col LIKE '%\%'` | 없음 | 키워드 OR 그룹 | 중간 |
| B-35 | 같은 파일:71 | aliases (JSON 문자열) | 위와 같음 | 없음 | 위와 같음 | 중간 |
| B-36 | mdml/dmb/layout/LayoutQueries.java:44 (실행 :244) | c.PHYS_NAME (TB_MDM_COLUMN) | `UPPER(c.PHYS_NAME) LIKE :kw`, kw `%KW%` 또는 키워드 없으면 `%` (:243) | `setMaxResults(100)` (COLUMN_SEARCH_LIMIT) | 없음 (OR 세 칸) | 중간 (컬럼 사전 7천 행대, 정렬 때문에 일치 행 전체 정렬) |
| B-37 | 같은 파일:44 | c.COLUMN_NAME | 위와 같음, OR | 상한 100 | 없음 | 중간 |
| B-38 | 같은 파일:44 | COALESCE(c.LABEL_LONG,'') | `UPPER(COALESCE(c.LABEL_LONG,'')) LIKE :kw`, OR | 상한 100 | 없음 | 중간 |
| B-39 | mdml/dmd/dataItemMng/service/DataItemListQuery.java:115 | i.CODE (TB_MDM_DATA_ITEM) | `UPPER(i.CODE) LIKE :code ESCAPE '\'`, `%…%` (:178) | 페이징 setFirstResult/setMaxResults (:149~150), REGEX 분기는 후보 전체 읽어 메모리 페이징(:137) | `i.MARU_DATA_ID=:md` 필수, 최신 행 NOT EXISTS, VALID_TO | 작음 (데이터 하나의 항목만) |
| B-40 | 같은 파일:119 | i.NAME | `UPPER(i.NAME) LIKE :name ESCAPE '\'`, `%…%` (:181) | 위와 같음 | 위와 같음 | 작음 |
| B-41 | mdml/dmd/dataMng/service/DataMngService.java:82 | d.maruDataId (TB_MDM_DATA) | `UPPER(d.maruDataId) LIKE :id ESCAPE '\'`, `%…%` (:83) | 없음 | status 선택 | 작음 (데이터 정의 마스터) |
| B-42 | 같은 파일:87 | d.maruDataName | 위와 같음 (:88) | 없음 | 위와 같음 | 작음 |

## C. 부류 2 — 조인 ON 절 칼럼 쪽 SUBSTR (scripts/db-snapshot/widget_sql_oracle.json)
src/backend 아래 SQL·자바·XML 에는 이 패턴이 없다(CommObjMngService:313,318 · CommRoleMngService:436 은 주석 속 As-Is 설명이며 코드는 Java 로 처리). 같은 SQL 의 sqlite 사본이 줄 9·13·17·21 에 있다.

| # | 파일:줄 | 칼럼(표) | 패턴 | 행 수 상한 | 함께 걸리는 다른 조건 | 전체 읽기 위험 |
|---|---|---|---|---|---|---|
| C1 | scripts/db-snapshot/widget_sql_oracle.json:10 (def.ldj2hpgw, 내 최근 사용 화면) | l.PAGE_ID (TB_SEC_SCREEN_USAGE_LOG, 사용 로그) | `LEFT JOIN TB_MCM_SEC_OBJ o ON o.OBJECT_ID = SUBSTR(l.PAGE_ID, INSTR(l.PAGE_ID, '/') + 1)` | `FETCH FIRST 20 ROWS ONLY` | `l.USER_ID = :userId`, ORDER BY STARTED_AT DESC | 작음 |
| C2 | 같은 파일:14 (def.lo41tduo, 주간 화면 TOP10) | l.PAGE_ID | 위와 같음 | `FETCH FIRST 10 ROWS ONLY` (GROUP BY 뒤라 집계는 기간 전체) | `l.STARTED_AT >= TRUNC(SYSDATE) - 6` | 중간 (로그 표, 6일 구간) |
| C3 | 같은 파일:18 (def.qcondsmp, 화면 사용 이력 검색) | l.PAGE_ID | 위와 같음 | `FETCH FIRST 100 ROWS ONLY` | 모두 선택 조건: `(:scope='ALL' OR l.USER_ID=:userId)`, screenNm LIKE(COALESCE 식, UPPER 없음), `:fromDt`, `:minSec` | 중간 (조건이 다 비면 상한 100 이 유일한 제한, 로그 표) |
| C4 | 같은 파일:22 (def.spzufhgo, 영역별 사용 시간) | l.PAGE_ID | 위와 같음 | 없음 (GROUP BY 집계, 결과는 소수) | `l.STARTED_AT >= TRUNC(SYSDATE) - 29` | 중간 (로그 표, 29일 구간 집계) |
