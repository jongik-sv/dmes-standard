-- ============================================================
-- V15: 맞춤 레포트 견본 정의 8개
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
-- 이미 적용된 DB 의 체크섬이 바뀌므로 이 파일은 고치지 않는다. 바꿀 때는 V16 이후로 더한다.
--
-- 배경 (docs/superpowers/specs/2026-10-10-custom-report-v2-design.md §6):
--   기능마다 견본 정의를 영구히 둔다(QUERY_ID 가 SAMPLE_ 로 시작, 이름 앞 「[견본]」). 분류 SAMPLE·모듈 MCM.
--   할당은 UserQuerySampleSeeder 가 admin 에 넣는다(admin 은 시더가 도는 DB 에만 있다).
--   표 이름에 MCMAPUSER. 접두를 붙인다(운영 실행 계정이 전용 계정일 수 있다).
--   SQL_TEXT·PARAMS_JSON·COLUMNS_JSON 은 4000바이트 리터럴 한도 때문에 to_clob(...) 조각을 이어 만든다.
--
-- 멱등: 같은 QUERY_ID 가 이미 있으면 건드리지 않는다(V10·V11 방식).
-- ============================================================

insert into TB_MCM_USRQ_DEF
       (QUERY_ID, QUERY_NM, CATEGORY_CD, MODULE_CD, QUERY_DESC, SQL_TEXT, PARAMS_JSON, COLUMNS_JSON, MAX_ROW_CNT, USE_YN,
        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'SAMPLE_USER_FIND'
     , '[견본] 사용자 찾기'
     , 'SAMPLE'
     , 'MCM'
     , '글자 부분 일치 조건과 고정 선택 조건. 출력 정의가 없어 결과 열을 모두 보인다.'
     , to_clob('SELECT A.USER_ID
     , A.USER_NM
     , A.DEPT_CD
     , B.DEPT_NM
     , A.USE_TP
FROM   MCMAPUSER.TB_MCM_SEC_USER A
     , MCMAPUSER.TB_MCM_DEPT_INFO B
WHERE  B.DEPT_CD(+) = A.DEPT_CD
AND    (:userNm IS NULL OR UPPER(A.USER_NM) LIKE ''%'' || UPPER(:userNm) || ''%'')
AND    (:useTp IS NULL OR A.USE_TP = :useTp)
ORDER BY A.USER_ID')
     , to_clob('[{"name":"userNm","label":"사용자 이름","type":"text"},{"name":"useTp","label":"사용 여부","type":"select","default":"Y","options":[{"value":"Y","label":"사용"},{"value":"N","label":"미사용"}]}]')
     , null
     , 1000
     , 'Y'
     , systimestamp, 'FLYWAY', 'V15', 'V15', systimestamp, 'FLYWAY', 'V15', 'V15', 0
from   dual
where  not exists (select 1 from TB_MCM_USRQ_DEF where QUERY_ID = 'SAMPLE_USER_FIND');

insert into TB_MCM_USRQ_DEF
       (QUERY_ID, QUERY_NM, CATEGORY_CD, MODULE_CD, QUERY_DESC, SQL_TEXT, PARAMS_JSON, COLUMNS_JSON, MAX_ROW_CNT, USE_YN,
        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'SAMPLE_JOB_RUN_HIST'
     , '[견본] 예약 작업 실행 이력'
     , 'SAMPLE'
     , 'MCM'
     , '기간(상대 날짜 기본값)과 다중 선택, 숫자 서식과 합계 줄.'
     , to_clob('SELECT A.JOB_ID
     , A.SCHED_AT
     , A.STATUS
     , A.STARTED_AT
     , A.ITEM_CNT
     , ROUND((CAST(A.ENDED_AT AS DATE) - CAST(A.STARTED_AT AS DATE)) * 86400, 1) ELAPSED_SEC
     , A.MSG
FROM   MCMAPUSER.TB_MCM_JOB_RUN A
WHERE  A.SCHED_AT >= TO_DATE(:fromDt, ''YYYYMMDD'')
AND    A.SCHED_AT < TO_DATE(:toDt, ''YYYYMMDD'') + 1
AND    (:statusCnt = 0 OR A.STATUS IN (:status))
AND    (:jobId IS NULL OR A.JOB_ID LIKE ''%'' || :jobId || ''%'')
ORDER BY A.SCHED_AT DESC, A.JOB_ID')
     , to_clob('[{"name":"fromDt","label":"실행 기간","type":"daterange","toName":"toDt","required":true,"default":"-7d","toDefault":"0d","maxSpanDays":31},{"name":"status","label":"상태","type":"multi","countName":"statusCnt","options":[{"value":"RUN"},{"value":"OK"},{"value":"FAIL"},{"value":"SKIP"},{"value":"TIMEOUT"}]},{"name":"jobId","label":"작업 ID","type":"text"}]')
     , to_clob('[{"field":"JOB_ID","header":"작업 ID"},{"field":"SCHED_AT","header":"예정 시각"},{"field":"STATUS","header":"상태","align":"center"},{"field":"STARTED_AT","header":"시작 시각"},{"field":"ITEM_CNT","header":"처리 건수","format":"number","mask":"#,##0","sum":true,"align":"right"},{"field":"ELAPSED_SEC","header":"소요(초)","format":"number","mask":"#,##0.0","sum":true,"align":"right"},{"field":"MSG","header":"메시지"}]')
     , 1000
     , 'Y'
     , systimestamp, 'FLYWAY', 'V15', 'V15', systimestamp, 'FLYWAY', 'V15', 'V15', 0
from   dual
where  not exists (select 1 from TB_MCM_USRQ_DEF where QUERY_ID = 'SAMPLE_JOB_RUN_HIST');

insert into TB_MCM_USRQ_DEF
       (QUERY_ID, QUERY_NM, CATEGORY_CD, MODULE_CD, QUERY_DESC, SQL_TEXT, PARAMS_JSON, COLUMNS_JSON, MAX_ROW_CNT, USE_YN,
        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'SAMPLE_WIDGET_BY_CTG'
     , '[견본] 분류별 위젯 정의'
     , 'SAMPLE'
     , 'MCM'
     , '공통코드 그룹을 선택지로 쓰는 다중 선택과 코드 이름 배지 열.'
     , to_clob('SELECT A.WIDGET_ID
     , A.TITLE
     , A.CATEGORY_CD
     , A.REFRESH_SEC
     , A.USE_YN
FROM   MCMAPUSER.TB_MCM_WIDGET_DEF A
WHERE  (:ctgCnt = 0 OR A.CATEGORY_CD IN (:ctgCds))
AND    (:useYn IS NULL OR A.USE_YN = :useYn)
ORDER BY A.CATEGORY_CD, A.WIDGET_ID')
     , to_clob('[{"name":"ctgCds","label":"분류","type":"multi","codeGroup":"WIDGET_CTG","countName":"ctgCnt"},{"name":"useYn","label":"사용 여부","type":"select","options":[{"value":"Y","label":"사용"},{"value":"N","label":"미사용"}]}]')
     , to_clob('[{"field":"WIDGET_ID","header":"위젯 ID"},{"field":"TITLE","header":"제목"},{"field":"CATEGORY_CD","header":"분류","format":"code","codeGroup":"WIDGET_CTG","badge":true,"align":"center"},{"field":"REFRESH_SEC","header":"갱신 주기(초)","format":"number","mask":"#,##0","align":"right"},{"field":"USE_YN","header":"사용","align":"center"}]')
     , 500
     , 'Y'
     , systimestamp, 'FLYWAY', 'V15', 'V15', systimestamp, 'FLYWAY', 'V15', 'V15', 0
from   dual
where  not exists (select 1 from TB_MCM_USRQ_DEF where QUERY_ID = 'SAMPLE_WIDGET_BY_CTG');

insert into TB_MCM_USRQ_DEF
       (QUERY_ID, QUERY_NM, CATEGORY_CD, MODULE_CD, QUERY_DESC, SQL_TEXT, PARAMS_JSON, COLUMNS_JSON, MAX_ROW_CNT, USE_YN,
        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'SAMPLE_SCREEN_USAGE'
     , '[견본] 화면 사용 통계'
     , 'SAMPLE'
     , 'MCM'
     , '이번 달 1일부터 오늘까지 기본 기간, 숫자 조건, 집계 열 합계.'
     , to_clob('SELECT A.PAGE_ID
     , COUNT(DISTINCT A.USER_ID) USER_CNT
     , SUM(A.OPEN_CNT) OPEN_CNT
     , ROUND(SUM(A.DURATION_MS) / 60000, 1) USE_MIN
FROM   MCMAPUSER.TB_SEC_SCREEN_USAGE_DAY A
WHERE  A.USAGE_DT BETWEEN :fromDt AND :toDt
AND    (:pageId IS NULL OR A.PAGE_ID LIKE ''%'' || :pageId || ''%'')
GROUP BY A.PAGE_ID
HAVING (:minOpen IS NULL OR SUM(A.OPEN_CNT) >= :minOpen)
ORDER BY SUM(A.OPEN_CNT) DESC, A.PAGE_ID')
     , to_clob('[{"name":"fromDt","label":"사용 기간","type":"daterange","toName":"toDt","required":true,"default":"monthStart","toDefault":"0d","maxSpanDays":366},{"name":"pageId","label":"화면 ID","type":"text"},{"name":"minOpen","label":"최소 열람 수","type":"number","default":"1"}]')
     , to_clob('[{"field":"PAGE_ID","header":"화면 ID"},{"field":"USER_CNT","header":"사용자 수","format":"number","mask":"#,##0","align":"right"},{"field":"OPEN_CNT","header":"열람 수","format":"number","mask":"#,##0","sum":true,"align":"right"},{"field":"USE_MIN","header":"사용 시간(분)","format":"number","mask":"#,##0.0","sum":true,"align":"right"}]')
     , 1000
     , 'Y'
     , systimestamp, 'FLYWAY', 'V15', 'V15', systimestamp, 'FLYWAY', 'V15', 'V15', 0
from   dual
where  not exists (select 1 from TB_MCM_USRQ_DEF where QUERY_ID = 'SAMPLE_SCREEN_USAGE');

insert into TB_MCM_USRQ_DEF
       (QUERY_ID, QUERY_NM, CATEGORY_CD, MODULE_CD, QUERY_DESC, SQL_TEXT, PARAMS_JSON, COLUMNS_JSON, MAX_ROW_CNT, USE_YN,
        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'SAMPLE_MENU_ACTIVE'
     , '[견본] 기준일 유효 메뉴'
     , 'SAMPLE'
     , 'MCM'
     , '필수 날짜 조건과 오늘 기본값, 머리글만 한글로 고친 출력 정의.'
     , to_clob('SELECT A.MENU_ID
     , A.MENU_NM
     , A.PARENT_MENU_ID
     , A.START_ACTIVE_DATE
     , A.END_ACTIVE_DATE
FROM   MCMAPUSER.TB_MCM_SEC_MENU A
WHERE  TO_DATE(:baseDt, ''YYYYMMDD'') BETWEEN NVL(A.START_ACTIVE_DATE, DATE ''1900-01-01'')
                                        AND NVL(A.END_ACTIVE_DATE, DATE ''9999-12-31'')
AND    (:menuNm IS NULL OR A.MENU_NM LIKE ''%'' || :menuNm || ''%'')
ORDER BY A.FULL_SEQ, A.MENU_ID')
     , to_clob('[{"name":"baseDt","label":"기준일","type":"date","required":true,"default":"0d"},{"name":"menuNm","label":"메뉴 이름","type":"text"}]')
     , to_clob('[{"field":"MENU_ID","header":"메뉴 ID"},{"field":"MENU_NM","header":"메뉴 이름"},{"field":"PARENT_MENU_ID","header":"상위 메뉴 ID"},{"field":"START_ACTIVE_DATE","header":"시작일"},{"field":"END_ACTIVE_DATE","header":"종료일"}]')
     , 2000
     , 'Y'
     , systimestamp, 'FLYWAY', 'V15', 'V15', systimestamp, 'FLYWAY', 'V15', 'V15', 0
from   dual
where  not exists (select 1 from TB_MCM_USRQ_DEF where QUERY_ID = 'SAMPLE_MENU_ACTIVE');

insert into TB_MCM_USRQ_DEF
       (QUERY_ID, QUERY_NM, CATEGORY_CD, MODULE_CD, QUERY_DESC, SQL_TEXT, PARAMS_JSON, COLUMNS_JSON, MAX_ROW_CNT, USE_YN,
        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'SAMPLE_USRQ_LIST'
     , '[견본] 맞춤 레포트 목록'
     , 'SAMPLE'
     , 'MCM'
     , '공통코드 선택 조건, 모듈 고정 선택 조건, 코드 이름 열. SQL 본문은 고르지 않는다.'
     , to_clob('SELECT A.QUERY_ID
     , A.QUERY_NM
     , A.CATEGORY_CD
     , A.MODULE_CD
     , A.USE_YN
     , A.MAX_ROW_CNT
FROM   MCMAPUSER.TB_MCM_USRQ_DEF A
WHERE  (:ctgCd IS NULL OR A.CATEGORY_CD = :ctgCd)
AND    (:moduleCd IS NULL OR A.MODULE_CD = :moduleCd)
ORDER BY A.CATEGORY_CD, A.QUERY_ID')
     , to_clob('[{"name":"ctgCd","label":"분류","type":"select","codeGroup":"USRQ_CTG"},{"name":"moduleCd","label":"모듈","type":"select","options":[{"value":"MCM","label":"공통"},{"value":"MDM","label":"기준정보"},{"value":"MPP","label":"생산"},{"value":"MLS","label":"물류"},{"value":"MQC","label":"품질"},{"value":"MPN","label":"APS"}]}]')
     , to_clob('[{"field":"QUERY_ID","header":"쿼리 ID"},{"field":"QUERY_NM","header":"쿼리 이름"},{"field":"CATEGORY_CD","header":"분류","format":"code","codeGroup":"USRQ_CTG"},{"field":"MODULE_CD","header":"모듈","align":"center"},{"field":"USE_YN","header":"사용","align":"center"},{"field":"MAX_ROW_CNT","header":"최대 행","format":"number","mask":"#,##0","align":"right"}]')
     , 500
     , 'Y'
     , systimestamp, 'FLYWAY', 'V15', 'V15', systimestamp, 'FLYWAY', 'V15', 'V15', 0
from   dual
where  not exists (select 1 from TB_MCM_USRQ_DEF where QUERY_ID = 'SAMPLE_USRQ_LIST');

insert into TB_MCM_USRQ_DEF
       (QUERY_ID, QUERY_NM, CATEGORY_CD, MODULE_CD, QUERY_DESC, SQL_TEXT, PARAMS_JSON, COLUMNS_JSON, MAX_ROW_CNT, USE_YN,
        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'SAMPLE_ROW_LIMIT'
     , '[견본] 행 잘림·숫자 서식'
     , 'SAMPLE'
     , 'MCM'
     , '최대 행 20 에서 잘림 안내, 소수 서식, 시스템 변수(:today). 행 수를 조건으로 준다.'
     , to_clob('SELECT LEVEL ROW_NO
     , LEVEL * 1234.5678 AMT
     , MOD(LEVEL * 37, 101) / 7 RATIO
     , :today BASE_DT
FROM   DUAL
CONNECT BY LEVEL <= LEAST(:rowCnt, 5000)')
     , to_clob('[{"name":"rowCnt","label":"만들 행 수","type":"number","required":true,"default":"100"}]')
     , to_clob('[{"field":"ROW_NO","header":"번호","format":"number","mask":"#,##0","align":"right"},{"field":"AMT","header":"금액","format":"number","mask":"#,##0.00","sum":true,"align":"right"},{"field":"RATIO","header":"비율","format":"number","mask":"0.000","align":"right"},{"field":"BASE_DT","header":"기준일"}]')
     , 20
     , 'Y'
     , systimestamp, 'FLYWAY', 'V15', 'V15', systimestamp, 'FLYWAY', 'V15', 'V15', 0
from   dual
where  not exists (select 1 from TB_MCM_USRQ_DEF where QUERY_ID = 'SAMPLE_ROW_LIMIT');

insert into TB_MCM_USRQ_DEF
       (QUERY_ID, QUERY_NM, CATEGORY_CD, MODULE_CD, QUERY_DESC, SQL_TEXT, PARAMS_JSON, COLUMNS_JSON, MAX_ROW_CNT, USE_YN,
        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'SAMPLE_MY_INFO'
     , '[견본] 내 정보'
     , 'SAMPLE'
     , 'MCM'
     , '조건 없이 시스템 변수(:userId, :today, :bizDate)만 쓴다.'
     , to_clob('SELECT :userId USER_ID
     , :today TODAY_DT
     , :bizDate BIZ_DATE
FROM   DUAL')
     , null
     , null
     , 10
     , 'Y'
     , systimestamp, 'FLYWAY', 'V15', 'V15', systimestamp, 'FLYWAY', 'V15', 'V15', 0
from   dual
where  not exists (select 1 from TB_MCM_USRQ_DEF where QUERY_ID = 'SAMPLE_MY_INFO');
