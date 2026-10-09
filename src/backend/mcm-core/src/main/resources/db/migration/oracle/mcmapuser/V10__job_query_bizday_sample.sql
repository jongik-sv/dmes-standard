-- ============================================================
-- V10: 전기일 07시 기준 쿼리 실행(QUERY) 샘플 예약 작업 시드
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (사용자 요청, 2026-10-09):
--   예약 작업 관리에 쿼리 실행(QUERY) 유형 샘플 작업이 없다. 하나를 시드로 넣는다. 회사는 아침 07시를 기준으로 전기일을
--   나눈다(07:00 ~ 다음 날 07:00 이 하루). 작업은 매일 07:01 에 방금 끝난 전기일 하루 동안의 예약 작업 실행 이력
--   (TB_MCM_JOB_RUN)을 상태별로 세어 수집 값 표(TB_MCM_JOB_COLLECT_DATA)에 남긴다. MERGE 한 문장이라 지우는 일이 없다.
--   OWNER_TP='USER' 라 예약 작업 관리 화면에서 고치고 지울 수 있다.
--
-- 멱등: 같은 JOB_ID 가 이미 있으면 건드리지 않는다(V5 방식). 첫 실행 예정(NEXT_RUN_AT)은 적용 시각(KST) 기준 오늘 07:01 이
--   아직 안 지났으면 오늘 07:01, 지났으면 내일 07:01.
--   집계할 전기일은 변수 bizDay(값 ':bizYesterday' — SCHED_AT − baseHour 시간의 날짜로, 07:01 회차면 방금 끝난 전기일)와
--   baseHour(전기일이 바뀌는 시각)로 만든다: [bizDay + baseHour, bizDay + 1 + baseHour). 수동으로 돌려도 SCHED_AT 기준
--   직전 전기일을 센다. 변수 jobId 의 값은 실행 변수 ':jobId' 라 실행 때 이 작업 자신의 JOB_ID 로 바뀐다(작업을 복사해
--   쓰면 따로 고칠 필요가 없다).
--   ':bizYesterday' 실행 변수는 widget-bizday-vars 레인의 JobVars 변경과 함께 들어간다 — 이 시드의 저장 검사는 그 변경이
--   dev 에 들어간 뒤에 맞는다.
-- ============================================================

insert into TB_MCM_JOB_DEF
       (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, OPTS_JSON, TIMEOUT_SEC, NEXT_RUN_AT,
        JOB_DESC, OWNER_TP, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'mcm.sample.bizday-run-summary'
     , 'MCM'
     , '전기일 실행 이력 집계(샘플)'
     , 'QUERY'
     , 'jobQuery'
     , 'run'
     , '1 7 * * *'
     , 'Y'
     , '{"sql":"MERGE INTO TB_MCM_JOB_COLLECT_DATA T\n'
       || 'USING (SELECT TO_CHAR(:bizDay + :baseHour / 24, ''YYYYMMDDHH24MI'') AS SLOT\n'
       || '            , R.STATUS AS ITEM_KEY\n'
       || '            , COUNT(*) AS CNT\n'
       || '       FROM   TB_MCM_JOB_RUN R\n'
       || '       WHERE  R.SCHED_AT >= :bizDay + :baseHour / 24\n'
       || '       AND    R.SCHED_AT < :bizDay + 1 + :baseHour / 24\n'
       || '       GROUP BY R.STATUS) S\n'
       || 'ON (T.JOB_ID = :jobId AND T.SLOT = S.SLOT AND T.ITEM_KEY = S.ITEM_KEY)\n'
       || 'WHEN MATCHED THEN UPDATE SET T.VALUE_NUM = S.CNT\n'
       || '     , T.U_AT = CAST(SYSTIMESTAMP AT TIME ZONE ''Asia/Seoul'' AS TIMESTAMP)\n'
       || '     , T.U_USR_ID = ''SCHEDULER''\n'
       || '     , T.U_PGM_ID = ''jobQuery''\n'
       || '     , T.VER = T.VER + 1\n'
       || 'WHEN NOT MATCHED THEN INSERT (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, C_AT, C_USR_ID, C_PGM_ID, U_AT, U_USR_ID, U_PGM_ID, VER)\n'
       || '     VALUES (:jobId, S.SLOT, S.ITEM_KEY, S.CNT\n'
       || '          , CAST(SYSTIMESTAMP AT TIME ZONE ''Asia/Seoul'' AS TIMESTAMP), ''SCHEDULER'', ''jobQuery''\n'
       || '          , CAST(SYSTIMESTAMP AT TIME ZONE ''Asia/Seoul'' AS TIMESTAMP), ''SCHEDULER'', ''jobQuery''\n'
       || '          , 0)}'
     , '[{"name":"bizDay","type":"DATE","value":":bizYesterday","desc":"집계할 전기일(07시 기준, 실행 때 예정 시각의 전날 전기일로 바뀐다)"},'
       || '{"name":"baseHour","type":"NUMBER","value":"7","desc":"전기일이 바뀌는 시각(시) — 회사 기준 아침 7시"},'
       || '{"name":"jobId","type":"STRING","value":":jobId","desc":"결과를 남길 작업 ID(실행 때 이 작업 ID 로 바뀐다)"}]'
     , null
     , 600
     , case
         when N.TS < trunc(N.TS) + interval '7' hour + interval '1' minute then trunc(N.TS) + interval '7' hour + interval '1' minute
         else trunc(N.TS) + 1 + interval '7' hour + interval '1' minute
       end
     , '전기일(07시 기준, 07:00 ~ 다음 날 07:00) 하루 동안의 예약 작업 실행 이력을 상태별로 세어 수집 값 표에 남긴다(MERGE 한 문장, 지우는 일 없음). 매일 07:01 에 방금 끝난 전기일 하루의 실행 이력을 상태(RUN·OK·FAIL·SKIP·TIMEOUT)별로 세어 TB_MCM_JOB_COLLECT_DATA 에 남긴다. SLOT=전기일 시작 시각(YYYYMMDDHH24MI), ITEM_KEY=상태, VALUE_NUM=건수.'
     , 'USER'
     , cast(systimestamp at time zone 'Asia/Seoul' as timestamp), 'flyway', 'V10__job_query_bizday_sample', 'V10'
     , cast(systimestamp at time zone 'Asia/Seoul' as timestamp), 'flyway', 'V10__job_query_bizday_sample', 'V10'
     , 0
from  (select cast(systimestamp at time zone 'Asia/Seoul' as date) TS from dual) N
where not exists (select 1 from TB_MCM_JOB_DEF D where D.JOB_ID = 'mcm.sample.bizday-run-summary');
