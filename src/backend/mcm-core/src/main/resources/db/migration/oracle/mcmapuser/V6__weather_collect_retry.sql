-- ============================================================
-- V6: 날씨 수집 작업 5건에 「일시 오류 재시도」 옵션 켜기
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (수집 HTTP 일시 오류 1회 재시도, 2026-10-09):
--   mcm.weather.seoul 이 정각·30분에 HTTP 503 으로 연달아 실패했다(같은 Open-Meteo 주소를 다른 지점이 :02~:08 에 부르면 정상).
--   수집 원천 설정 source.retryTransient=true 면 503·502·504·429·연결/읽기 시간 초과일 때 몇 초 뒤 한 번 더 부른다
--   (키가 없으면 꺼짐 — 기존 작업 동작은 그대로다).
--
-- 멱등·보존: V5 가 만든 날씨 5건 중 source.retryTransient 키가 아직 없는 행에만 넣는다. 화면에서 이미 true/false 로 바꾼 값은 덮어쓰지 않는다.
-- 이미 적용된 V5 는 수정하지 않는다. 대상은 JOB_ID 고정 5건이고 VER 을 올려 열어 둔 화면의 저장이 낡은 값으로 덮지 못하게 한다.
-- ============================================================

update TB_MCM_JOB_DEF D
   set D.CONFIG_JSON = json_mergepatch(D.CONFIG_JSON, '{"source":{"retryTransient":true}}' returning clob)
     , D.U_AT = cast(systimestamp at time zone 'Asia/Seoul' as timestamp)
     , D.U_USR_ID = 'flyway'
     , D.U_PGM_ID = 'V6__weather_collect_retry'
     , D.U_SVC_ID = 'V6'
     , D.VER = D.VER + 1
 where D.JOB_ID in ('mcm.weather.seoul', 'mcm.weather.incheon', 'mcm.weather.pohang', 'mcm.weather.dangjin', 'mcm.weather.busan')
   and D.CONFIG_JSON is json
   and not json_exists(D.CONFIG_JSON, '$.source.retryTransient');
