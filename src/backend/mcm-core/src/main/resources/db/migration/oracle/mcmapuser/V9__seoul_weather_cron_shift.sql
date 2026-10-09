-- ============================================================
-- V9: 날씨 수집 서울 작업 cron 을 정각에서 10·40분으로 옮긴다
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (V6 참고 — Open-Meteo 정각 몰림, 2026-10-09):
--   mcm.weather.seoul 만 CRON '0,30 * * * *' 이라 Open-Meteo 정각 몰림에 HTTP 503 이 연달아 났다. 다른 지점은
--   incheon 2,32 · pohang 4,34 · dangjin 6,36 · busan 8,38 로 어긋나 있다. 몰림을 피하려 서울을 10,40 으로 옮긴다.
--
-- 조건부·멱등: JOB_ID='mcm.weather.seoul' 이고 CRON_EXPR 이 아직 시드 값 '0,30 * * * *' 일 때만 바꾼다(사용자가 화면에서
-- 고친 값은 건드리지 않는다). 이미 '10,40 * * * *' 면 조건이 안 맞아 0행 — 다시 실행해도 같은 결과.
-- NEXT_RUN_AT 는 새 cron 의 다음 시각(적용 시각 뒤 첫 :10 또는 :40)으로 함께 맞춘다(V5 첫 실행 예정 방식과 같은 시각 계산) —
-- 바꾸지 않으면 옛 시각으로 늦은 회차 SKIP 1건이 남는다. VER 을 올려 열어 둔 화면의 저장이 낡은 값으로 덮지 못하게 한다.
-- 이미 적용된 V5 는 수정하지 않는다.
-- ============================================================

update TB_MCM_JOB_DEF D
   set D.CRON_EXPR = '10,40 * * * *'
     , D.NEXT_RUN_AT = (select case
                           when to_number(to_char(N.TS, 'MI')) < 10 then trunc(N.TS, 'HH') + interval '10' minute
                           when to_number(to_char(N.TS, 'MI')) < 40 then trunc(N.TS, 'HH') + interval '40' minute
                           else trunc(N.TS, 'HH') + interval '70' minute   -- 다음 시간 :10
                         end
                          from (select cast(systimestamp at time zone 'Asia/Seoul' as timestamp) TS from dual) N)
     , D.U_AT = cast(systimestamp at time zone 'Asia/Seoul' as timestamp)
     , D.U_USR_ID = 'flyway'
     , D.U_PGM_ID = 'V9__seoul_weather_cron_shift'
     , D.U_SVC_ID = 'V9'
     , D.VER = D.VER + 1
 where D.JOB_ID = 'mcm.weather.seoul'
   and D.CRON_EXPR = '0,30 * * * *';
