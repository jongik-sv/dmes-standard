-- ============================================================
-- V5: 날씨 수집 작업 5건 시드 (예약 작업, 유형 COLLECT)
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-09-weather-collect-design.md):
--   날씨 위젯이 요청마다 Open-Meteo 를 직접 부르던 방식을 없애고, 예약 작업의 수집(jobCollect)이 30분마다 모은 값
--   (TB_MCM_JOB_COLLECT_DATA)을 읽는다. 지점 하나의 값이 19개(현재 4 + 3일 x 5)라 한 작업(항목 20개 한도)에 지점 하나를 담는다.
--   위젯 편집기의 빠른 추가 5곳(서울·인천·포항·당진·부산)을 같은 좌표(소수 둘째 자리)로 옮긴다. 위젯은 작업 ID 접두 mcm.weather.
--   의 사용 중 COLLECT 작업을 지점 목록으로 보고, 작업 변수 lat·lon 이 요청 좌표(소수 둘째 자리)와 같은 작업의 최신 회차를 읽는다.
--   OWNER_TP='USER' 라 예약 작업 관리 화면에서 고치고 지울 수 있다.
--
-- 멱등: 같은 JOB_ID 가 이미 있으면 건드리지 않는다. 첫 실행 예정(NEXT_RUN_AT)은 적용 시각 +1~5분(지점마다 어긋나게 — 실행 풀이 4개라 한 분에 5건이
-- 몰리면 1건이 SKIP 된다). 앱이 그때 떠 있지 않으면 2분 넘게 늦은 회차로 SKIP 되고 다음 cron 시각(최대 30분 뒤)에 처음 값이 쌓인다.
-- 이후는 CRON_EXPR(지점마다 분을 어긋나게)을 따른다.
-- HTTP 수집은 dmes.job.http.allowed-hosts 에 api.open-meteo.com 이 있어야 돈다(mcm application.yml).
-- ============================================================

insert into TB_MCM_JOB_DEF
       (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, OPTS_JSON, TIMEOUT_SEC, NEXT_RUN_AT,
        JOB_DESC, OWNER_TP, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
select S.JOB_ID
     , 'MCM'
     , S.JOB_NM
     , 'COLLECT'
     , 'jobCollect'
     , 'run'
     , S.CRON_EXPR
     , 'Y'
     , '{"source":{"kind":"http","url":"https://api.open-meteo.com/v1/forecast?latitude={{lat}}' || chr(38) || 'longitude={{lon}}'
       || chr(38) || 'current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m'
       || chr(38) || 'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' || chr(38) || 'timezone=Asia/Seoul' || chr(38) || 'forecast_days=3",'
       || '"items":['
       || '{"key":"cur_temp","path":"current.temperature_2m"},{"key":"cur_code","path":"current.weather_code"},'
       || '{"key":"cur_wind","path":"current.wind_speed_10m"},{"key":"cur_humidity","path":"current.relative_humidity_2m"},'
       || '{"key":"d0_date","path":"daily.time[0]"},{"key":"d0_min","path":"daily.temperature_2m_min[0]"},{"key":"d0_max","path":"daily.temperature_2m_max[0]"},'
       || '{"key":"d0_code","path":"daily.weather_code[0]"},{"key":"d0_pop","path":"daily.precipitation_probability_max[0]"},'
       || '{"key":"d1_date","path":"daily.time[1]"},{"key":"d1_min","path":"daily.temperature_2m_min[1]"},{"key":"d1_max","path":"daily.temperature_2m_max[1]"},'
       || '{"key":"d1_code","path":"daily.weather_code[1]"},{"key":"d1_pop","path":"daily.precipitation_probability_max[1]"},'
       || '{"key":"d2_date","path":"daily.time[2]"},{"key":"d2_min","path":"daily.temperature_2m_min[2]"},{"key":"d2_max","path":"daily.temperature_2m_max[2]"},'
       || '{"key":"d2_code","path":"daily.weather_code[2]"},{"key":"d2_pop","path":"daily.precipitation_probability_max[2]"}'
       || ']},"save":true}'
     , '[{"name":"lat","type":"STRING","value":"' || S.LAT || '","desc":"위도(소수 둘째 자리 — 날씨 위젯 지점과 맞춘다)"},'
       || '{"name":"lon","type":"STRING","value":"' || S.LON || '","desc":"경도(소수 둘째 자리 — 날씨 위젯 지점과 맞춘다)"}]'
     , null
     , 60
     , trunc(cast(systimestamp at time zone 'Asia/Seoul' as timestamp), 'MI') + S.FIRST_MIN * interval '1' minute
     , S.JOB_NM || ' 날씨(현재·3일 예보)를 Open-Meteo 에서 30분마다 모은다. 날씨 위젯이 이 값을 읽는다(작업 ID 접두 mcm.weather. 와 변수 lat·lon 으로 지점을 찾는다).'
     , 'USER'
     , cast(systimestamp at time zone 'Asia/Seoul' as timestamp), 'flyway', 'V5__weather_collect_seed', 'V5'
     , cast(systimestamp at time zone 'Asia/Seoul' as timestamp), 'flyway', 'V5__weather_collect_seed', 'V5'
     , 0
from  (select 'mcm.weather.seoul' JOB_ID, '날씨 수집 서울' JOB_NM, '0,30 * * * *' CRON_EXPR, '37.57' LAT, '126.98' LON, 1 FIRST_MIN from dual
       union all
       select 'mcm.weather.incheon', '날씨 수집 인천', '2,32 * * * *', '37.46', '126.71', 2 from dual
       union all
       select 'mcm.weather.pohang', '날씨 수집 포항', '4,34 * * * *', '36.02', '129.34', 3 from dual
       union all
       select 'mcm.weather.dangjin', '날씨 수집 당진', '6,36 * * * *', '36.89', '126.65', 4 from dual
       union all
       select 'mcm.weather.busan', '날씨 수집 부산', '8,38 * * * *', '35.18', '129.08', 5 from dual) S
where not exists (select 1 from TB_MCM_JOB_DEF D where D.JOB_ID = S.JOB_ID);
