-- ============================================================
-- V11: 서비스 실행(BPMN) 샘플 예약 작업 시드
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (사용자 요청, 2026-10-09):
--   예약 작업 관리에 서비스 실행(BPMN) 유형 샘플 작업이 없다. 하나를 시드로 넣는다. 작업은 매일 07:05 에 MCM 의 기존
--   OASIS 서비스 screenUsageStat 의 unused 액션(미사용 화면 조회)을 부른다. 읽기 전용 조회라 데이터를 바꾸거나 지우는
--   일이 없고, 로그인 사용자나 화면 세션 없이도 동작한다. 쿼리 실행 샘플(V10, 07:01)과 겹치지 않게 07:05 로 잡았다.
--   OWNER_TP='USER' 라 예약 작업 관리 화면에서 고치고 지울 수 있다.
--
-- 입력: 작업 변수 unusedDays(NUMBER, 90)가 서비스 입력 unusedDays 로 그대로 넘어간다. screenUsageStat 의 날짜 입력
--   (fromDt·toDt)은 yyyyMMdd 형식이라 ':bizYesterday'(yyyy-MM-dd)를 넘길 수 없어 전기일 변수는 쓰지 않았다.
--
-- 멱등: 같은 JOB_ID 가 이미 있으면 건드리지 않는다(V5 방식). 첫 실행 예정(NEXT_RUN_AT)은 적용 시각(KST) 기준 오늘 07:05 가
--   아직 안 지났으면 오늘 07:05, 지났으면 내일 07:05.
-- ============================================================

insert into TB_MCM_JOB_DEF
       (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, OPTS_JSON, TIMEOUT_SEC, NEXT_RUN_AT,
        JOB_DESC, OWNER_TP, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select 'mcm.sample.screen-unused'
     , 'MCM'
     , '미사용 화면 조회(샘플)'
     , 'BPMN'
     , 'screenUsageStat'
     , 'unused'
     , '5 7 * * *'
     , 'Y'
     , null
     , '[{"name":"unusedDays","type":"NUMBER","value":"90","desc":"미사용 기준 일수(오늘 포함 최근 N일 동안 이용 기록이 없는 화면)"}]'
     , null
     , 600
     , case
         when N.TS < trunc(N.TS) + interval '7' hour + interval '5' minute then trunc(N.TS) + interval '7' hour + interval '5' minute
         else trunc(N.TS) + 1 + interval '7' hour + interval '5' minute
       end
     , 'MCM 의 screenUsageStat 서비스 unused 액션을 불러 최근 unusedDays(90)일 동안 이용 기록이 없는 화면을 조회한다(읽기 전용, 매일 07:05). 넘기는 변수는 unusedDays 하나다. 결과는 예약 작업 관리의 실행 이력에서 본다.'
     , 'USER'
     , cast(systimestamp at time zone 'Asia/Seoul' as timestamp), 'flyway', 'V11__job_bpmn_sample', 'V11'
     , cast(systimestamp at time zone 'Asia/Seoul' as timestamp), 'flyway', 'V11__job_bpmn_sample', 'V11'
     , 0
from  (select cast(systimestamp at time zone 'Asia/Seoul' as date) TS from dual) N
where not exists (select 1 from TB_MCM_JOB_DEF D where D.JOB_ID = 'mcm.sample.screen-unused');
