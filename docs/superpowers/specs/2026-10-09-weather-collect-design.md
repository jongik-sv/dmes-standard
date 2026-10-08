# 날씨 데이터 수집 전환 설계 (2026-10-09, 레인 weather-collect)

사용자 지시: 「날씨는 데이터 수집으로 만들어줘.」 날씨 위젯이 요청 때마다(10분 캐시) Open-Meteo 를 직접 부르던 방식을, 예약 작업의 수집(COLLECT) 유형이 주기적으로 모아 둔 값을 읽는 방식으로 바꾼다.

## 1. 현재 구조 (조사 결과)

| 부분 | 현재 |
|---|---|
| 위젯 | `m-mcm/widget-types/weather` 렌더러가 지점(이름·위도·경도, 지점별 탭)마다 `widgetExt/weather` 를 호출한다. 편집기는 지점 목록을 편집하고 빠른 추가(서울·인천·포항·당진·부산)를 둔다. |
| 서버 | `WidgetExtService.weather` → `WeatherService`(좌표 소수 둘째 자리 반올림, 10분 캐시, 실패 시 stale) → `OpenMeteoProvider`(요청 1건, 응답을 `WeatherReport` 로 변환). |
| 수집기 | `jobCollect`(내장 서비스) + `HttpCollectSource`: 응답 JSON 에서 항목마다 경로(`a.b[0].c`)의 값을 뽑는다. 항목 최대 20개, 숫자는 소수 8자리, 글자는 200자. 주소에 `{{변수}}` 자리(경로·쿼리만, `HttpUrlTemplate`). 호스트는 `dmes.job.http.allowed-hosts` 정확 일치. |
| 저장 | `TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT yyyyMMddHHmm, ITEM_KEY, VALUE_NUM, VALUE_TXT)`. 90일 지나면 `mcm.collectPurge` 가 지운다. |

## 2. 결정

### D1. 지점마다 수집 작업 하나 (지점별 작업)
- 한 작업의 항목은 20개까지이고 지점 하나의 값이 19개(현재 4 + 3일 × 5)라서 한 작업에 여러 지점을 담을 수 없다. 작업 변수 `lat`·`lon` 으로 주소를 채우는 같은 모양의 작업을 지점마다 둔다. 지점을 늘리는 일은 예약 작업 관리 화면에서 작업 복사로 끝난다.
- 작업 ID 규칙: `mcm.weather.<지점영문>` (모듈 MCM, 유형 COLLECT, OWNER_TP=USER). 날씨 위젯 API 는 모듈 MCM·이 접두·사용 중인 COLLECT 작업을 지점으로 본다. `mcm.weather.*` 는 사용자 작업 전용으로 정한다(코드 처리기 `mcm.*` ID 와 겹치면 등록 MERGE 가 조용히 건너뛰므로 코드 쪽에서 이 접두를 쓰지 않는다).
- 샘플 시드: 위젯 편집기의 빠른 추가 5곳(서울·인천·포항·당진·부산)을 그대로 이관해 위젯이 기본 설정에서 바로 동작한다.

### D2. 작업 정의
- 주소: `https://api.open-meteo.com/v1/forecast?latitude={{lat}}&longitude={{lon}}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=3` (기존 `OpenMeteoProvider` 와 같은 요청).
- 항목 19개: `cur_temp·cur_code·cur_wind·cur_humidity`(경로 `current.*`), `d0_date·d0_min·d0_max·d0_code·d0_pop` … `d2_*`(경로 `daily.time[0]`, `daily.temperature_2m_min[0]` …). 날짜는 글자, 나머지는 숫자로 저장된다. 응답에서 빠진 값(예: 강수확률 null)은 수집기가 건너뛴다.
- 주기: 30분마다. 근거: Open-Meteo 는 예보 모델을 시간 단위로 갱신하고 현재값은 15분 단위이다. 기존 위젯 캐시 10분보다 거칠지만 날씨 표시에는 충분하고, 호출은 지점당 하루 48회로 무료 한도(하루 1만 회)에 한참 못 미친다. 지점마다 분을 어긋나게 둔다(0,30 / 2,32 / 4,34 / 6,36 / 8,38).
- 제한 시간 60초, 저장 `save:true`. 변수 `lat`·`lon` 은 STRING 형 고정값(소수 둘째 자리).
- 첫 실행 예정(`NEXT_RUN_AT`)은 적용 시각 +1~5분으로 지점마다 어긋나게 둔다(검토 지적: 실행 풀이 4개·대기열 0 이라 한 분에 5건이 몰리면 1건이 `JOB_POOL_FULL` 로 SKIP).
- 호스트 허용: `application.yml` 의 `dmes.job.http.allowed-hosts` 에 `api.open-meteo.com` 을 추가한다(현재 빈 목록이면 모든 HTTP 수집이 거절된다).

### D3. 수집 코드 보강은 필요 없다
`HttpCollectSource` 의 경로(점·대괄호), 항목 20개, 숫자·글자 구분으로 19개 값이 그대로 저장된다. 수집기·`HttpUrlTemplate` 은 고치지 않는다.

### D4. 조회 API — 기존 `widgetExt/weather` 를 그대로 쓰고 원천만 바꾼다
- 요청 모양(lat·lon)과 응답 모양(`current`·`daily`)을 유지해 프런트 변경을 최소로 한다.
- `WeatherService` 는 외부 호출을 하지 않고 `WeatherCollectReader` 로 MCM 의 `TB_MCM_JOB_DEF`·`TB_MCM_JOB_COLLECT_DATA` 를 읽는다.
  1. 좌표를 소수 둘째 자리로 반올림해, 모듈 MCM 의 사용 중 `mcm.weather.%` COLLECT 작업 중 변수 `lat`·`lon` 이 위·경도 모두 0.1° 이내인 작업을 찾는다. 가장 가까운 작업을 고르고, 거리가 같은 작업이 여럿이면(복사 뒤 좌표를 안 고친 경우) 최신 회차가 있는 쪽을 고른다. 0.1°(약 11km)는 Open-Meteo 격자 간격과 비슷해 값 차이가 작다. 이미 저장된 위젯이 빠른 추가 5곳이 아닌 좌표(공장 좌표 직접 입력 등)를 쓰고 있어도 근처 지점의 값을 보게 하려는 장치이다.
  2. 그 작업의 최신 SLOT 한 회차의 항목을 읽어 `WeatherReport` 로 만든다(조회 한 번에 최대 19행). 변수를 읽지 못하는 작업 하나는 건너뛰어 다른 지점의 조회를 막지 않는다.
- 크기·권한: 반환 값은 고정 19개 이내, 사용자 입력은 숫자 좌표 두 개뿐이고 SQL 은 바인드 변수만 쓴다. 권한은 기존 widgetExt(AUTH_ONLY) 그대로. 작업 후보는 `mcm.weather.%` 접두 + COLLECT + 사용 중으로 제한한다.
- 임의 좌표(수집 대상이 아닌 지점)는 외부를 부르지 않는다. 응답에 `uncollected: true` 를 담고 위젯이 「이 지점은 날씨 수집 대상이 아닙니다. 예약 작업에 mcm.weather.* 수집 작업을 추가하세요」를 보인다.
- 수집값이 아직 없으면 `current: null`, `daily: []` 와 `empty: true` → 「수집된 날씨가 아직 없습니다」.
- 알려진 한계(수용): ① 「지금 실행」에서 변수 `lat`·`lon` 을 덮어쓰면 그 지점의 최신 회차로 다른 좌표 값이 저장된다. ② 같은 분에 예약 회차와 수동 실행이 겹치면 같은 SLOT 에 합쳐진다. ③ 항목 일부만 받은 정상 회차가 직전의 완전한 회차를 가릴 수 있다(응답에서 값이 빠진 칸은 위젯이 「-」로 표시). ④ 작업을 「사용 안 함」으로 돌리면 남은 값이 아니라 「수집 대상이 아닙니다」 안내가 뜬다.

### D5. 오래된 데이터 표시
- 응답에 `collectedAt`(ISO, 최신 SLOT 시각)을 담는다.
- 90분(수집 주기 30분의 3배, 고정)보다 오래되면 `stale: true`: 기존 「갱신 실패」 배지(툴팁 「날씨를 새로 받지 못해 저장된 값을 보여 줍니다」)를 그대로 쓴다. 일일 예보 날짜가 오늘보다 앞선 칸은 렌더러가 기존처럼 보인다(요일은 날짜에서 계산).
- 정상일 때도 위젯 하단에 작은 글씨로 「기준 HH:mm」를 보여 수집 시각을 알린다.
- 모두 새 글자·시각 표기만 더하고 기존 설정·레이아웃은 유지한다.

### D6. 외부 호출 스위치
`dmes.widget.ext.enabled=false`(망 분리) 일 때 날씨는 더 이상 영향을 받지 않는다(위젯이 외부를 부르지 않는다). 수집 호출 가능 여부는 `allowed-hosts` 와 `dmes.job.collect.enabled` 가 정한다. 의미가 바뀌는 점: 기본 `application.yml` 의 허용 호스트에 `api.open-meteo.com` 을 넣었으므로 운영에서도 날씨 수집이 켜진다. 망 분리 환경은 시드 작업 5건을 「사용 안 함」으로 돌리거나 프로필 yml 에서 `dmes.job.http.allowed-hosts` 를 비운다(프로필에서 목록을 정의하면 추가가 아니라 통째로 교체된다). 안 그러면 30분마다 5건의 FAIL 기록이 쌓인다. `OpenMeteoProvider`·`WeatherProvider` 는 쓸 곳이 없어 제거한다. 공용 `WidgetExtProperties`(fx-master 와 공유)는 건드리지 않고 `weather.base-url` 속성은 남겨 둔다(후속 정리 대상, 조정에 통지).

### D7. 시드 방식 — Flyway `V5__weather_collect_seed.sql` (mcmapuser)
- 운영은 DBA 가 같은 V 파일을 적용하므로(Flyway 는 운영 앱에서 끔) 코드 시더보다 V 파일이 배포 절차와 맞다. 작업 정의 5행을 `OWNER_TP='USER'` 로 넣는다(화면에서 고치고 지울 수 있다).
- 멱등: `WHERE NOT EXISTS` 로 이미 있는 JOB_ID 는 건드리지 않는다(화면에서 고친 이름·주기가 되돌려지지 않고, 지운 작업만 되살아난다).
- 첫 실행 예정 시각은 적용 +1~5분이다. 이 시각에 MCM 앱이 떠 있어야 바로 돈다. 운영처럼 DBA 가 먼저 적용하고 앱을 나중에 올리면 2분 넘게 늦은 회차로 SKIP 되어 다음 cron 시각(최대 30분 뒤)에 처음 값이 쌓인다. 배포 직후 「지금 실행」으로 5건을 한 번씩 돌리면 바로 채워진다. `NEXT_RUN_AT` 이 null 이면 선점 대상이 아니므로 시드는 반드시 값을 넣는다.
- 데이터 초기화 지문 시험(`DataInitializerSeedFingerprintTest`)은 `TB_MCM_JOB_DEF` 5행이 들어가므로, 실행 시각이 섞이지 않게 `NEXT_RUN_AT` 을 해시에서 빼는 시각 칸(`TIME_COLUMNS`)에 더하고 골든을 재생성한다.

### D8. 예약 작업 관리 화면
코드 변경 없음(jsched-perf 소유). 화면 확인으로 목록·상세·실행 이력에 `mcm.weather.*` 5건이 보이고 「지금 실행」으로 값이 쌓이는지 본다.

## 3. 시험 계획
- 단위: `WeatherCollectReader`(지점 매칭·최신 회차·부분 값), `WeatherService`(없는 지점·빈 데이터·오래됨), 수집 설정 파싱 시험(시드 CONFIG_JSON 이 `CollectConfigs.parse` 를 통과하고 19개 항목), Oracle 시험(clone PDB, V5 적용 후 조회).
- 프런트: `_ext/api.test.ts` 에 새 필드(`collectedAt`·`uncollected`·`empty`) 정규화, 렌더러는 기존 vitest 범위에서.
- 화면: 백엔드 18101·프런트 5113, ego-browser 로 위젯 5개 지점 표시와 예약 작업 목록 확인.

## 4. 영향·위험
- 위젯이 외부에서 새 지점을 즉석 조회하던 기능이 없어진다(수집 작업을 추가해야 함) → 안내 문구로 대응.
- 첫 배포 직후 수집 전에는 비어 보인다 → 위 D7 의 「지금 실행」 절차를 L_MAIN 적용 절차에 넣는다.
- 윈도우: 영향 없음(SQL·Java·TS 뿐).
