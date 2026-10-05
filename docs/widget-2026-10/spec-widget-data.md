# 정시 수집 유형(collect) 설계 계약 (widget-data 레인, 항목 4)

2026-10-05. 사용자 결정(README §0-4): mcm-core 1분 `@Scheduled`, 수집 시각 PK 로 중복 방지, 90일 보관, 첫 판 원천은 SQL(기존 읽기 전용 실행기)·HTTP JSON(허용 호스트만)·내장 환율. 주식은 HTTP 원천, 기계 상태는 SQL 로 다룬다.
이 문서는 백엔드·프런트·시험이 함께 따르는 계약이다. 바꿀 일이 생기면 먼저 이 문서를 고치고 알린다.

## 1. 구성 한눈에 보기

- 위젯 정의(TB_MCM_WIDGET_DEF, TYPE_ID=`collect`)의 CONFIG_JSON 이 수집 정의를 담는다. 정의 저장·사용 여부 관리는 기존 위젯관리 화면을 그대로 쓴다(def/ 패키지는 건드리지 않는다).
- 수집기(`widget/collect`)가 매분 0초에 사용 중인 `collect` 정의를 읽어 이번 분이 수집 시각인 정의만 수집한다.
- 수집 결과는 새 테이블 두 개에 쌓는다. 읽기는 기존 `widgetData/run` 을 `collect` 정의에도 열어 재사용한다(새 OASIS 경로·proxy·BPMN 변경 없음).
- 결과를 보여 주는 위젯 유형 `collect`(프런트 `widget-types/collect/`)가 최신 값 타일과 추이 선을 그린다.

## 2. CONFIG_JSON (TYPE_ID=collect)

```json
{
  "schedule": { "mode": "interval", "everyMin": 10 },
  "source": { "kind": "sql", "sql": "SELECT ...", "keyField": "LINE", "valueField": "CNT" },
  "show": { "days": 7, "unit": "건" }
}
```

- `schedule.mode`
  - `interval`: 자정 기준으로 `everyMin` 분마다. `everyMin` 은 1440 의 약수 중 `5,10,15,20,30,60,120,180,240,360,480,720,1440` 만 허용(자정에 맞춰 정렬되고 외부 호출이 잦지 않게). 분 수 = 자정부터 지난 분, `분 % everyMin == 0` 이면 수집 시각.
  - `daily`: `at` 배열 1~24개의 `"HH:mm"`(중복 없음, 24시간제 실제 시각). 이번 분 `HH:mm` 이 목록에 있으면 수집 시각.
  - 시간대는 Asia/Seoul. 서버가 꺼져 있던 동안 지나간 시각은 따라잡지 않고 건너뛴다(정시 수집).
- `source.kind` 별 설정
  - `sql`: `sql`(필수, 기존 SqlGuard 검사를 그대로 거침, `:userId`·`:deptCd` 는 수집에 사용자가 없으므로 거절, `:today`·`:yesterday`·`:monthStart`·`:now` 허용, 사용자 입력 조건(`:name`) 없음), `valueField`(필수, 결과 컬럼 이름), `keyField`(선택). `keyField` 가 있으면 결과 행마다 항목 하나(키=그 컬럼 값), 없으면 첫 행의 `valueField` 값 하나를 항목 키 `VALUE` 로 저장. 항목은 한 회차 최대 50개를 넘으면 앞 50개만 저장.
  - `http`: `url`(필수, `http`·`https` 절대 주소, 사용자 정보 `user:pw@` 금지, 호스트가 허용 목록 `dmes.widget.collect.allowed-hosts` 에 있어야 함 — 비어 있으면 http 원천은 모두 거절), `items`(필수, 1~20개 `{key, path}`; `key` 는 항목 이름 1~100자, `path` 는 응답 JSON 안 위치 `data.items[0].price` 형식의 점·대괄호 경로. 이름 조각은 유니코드 글자·숫자와 `_`·`$`·`-` 만(한글 키 허용), 첨자는 0~9999 정수, 전체 200자·20조각 이하). 값이 숫자(또는 숫자 글자)면 숫자, 그 밖의 글자는 글자(200자까지)로 저장. 경로에 값이 없으면 그 항목은 건너뛴다(전부 없으면 실패).
  - `exchange`: `currencies`(필수, 영문 3자리 대문자 1~10개, KRW 제외, 중복 없음). 기준 통화 KRW 에 대한 각 통화의 값(내장 환율 제공자 사용)을 항목 키=통화 코드로 저장. 값은 수집 시각 기준 7일 안에서 가장 최근 날짜의 것(주말·휴일·고시 전에는 직전 영업일 값). 7일 안에 값이 없는 통화는 건너뛰고, 전부 없으면 실패. 외부 호출 폭주를 막으려고 환율 원천은 `schedule.mode=interval` 이면 `everyMin` 이 60 이상이어야 한다(`daily` 는 제한 없음). 같은 (제공자, 통화) 값은 30분 캐시하고 실패한 것은 10분 동안 다시 묻지 않는다. `dmes.widget.ext.enabled=false` 면 수집하지 않고 실패로 기록.
- `show.days`: 위젯이 읽을 기간(1~90, 기본 7). `show.unit`: 값 단위 글자(0~10자, 선택).
- 저장 검사(WidgetDefConfigRules)는 위 규칙을 모두 서버에서 판정한다. 알 수 없는 키는 무시한다.

## 3. 테이블(ddl-auto 로 로컬 생성, 개발·운영 DDL 은 erd-widget-data.md)

- `TB_MCM_WIDGET_COLLECT_RUN`(수집 회차): PK (`WIDGET_ID` varchar(40), `SLOT` char(12) `yyyyMMddHHmm`), `STATUS` varchar(4) `OK`/`FAIL`/`RUN`, `ITEM_CNT` int, `MSG` varchar(200) null, `STARTED_AT`·`ENDED_AT` timestamp null, 감사 칸(McmAuditEntity).
- `TB_MCM_WIDGET_COLLECT_DATA`(수집 값): PK (`WIDGET_ID`, `SLOT`, `ITEM_KEY` varchar(100)), `VALUE_NUM` numeric(24,8) null, `VALUE_TXT` varchar(200) null, 감사 칸.
- 중복 방지: 수집 시작 때 RUN 행을 `RUN` 으로 먼저 insert 한다. PK 위반이면 다른 인스턴스·이전 시도가 이미 잡은 시각이므로 건너뛴다(같은 정의·같은 분은 한 번만 수집). 수집이 끝나면 DATA 를 넣고 RUN 을 `OK`/`FAIL` 로 바꾼다. DATA insert 의 PK 위반도 무시한다.
- 시스템이 죽어 `RUN` 으로 남은 회차는 다음 회차를 막지 않는다(다음 SLOT 은 다른 PK). 90일 보관 삭제에서 함께 사라진다.
- 보관: 매일 03:30 Asia/Seoul 에 SLOT 이 오늘-90일 0시 이전인 DATA·RUN 행을 삭제한다(`@Scheduled(cron)`).
- 정의가 사용 중지·삭제되면 수집은 멈추고 이미 쌓인 값은 보관 기간 뒤에 지워진다. 정의 삭제 뒤 남은 행도 같은 삭제로 정리된다.

## 4. 수집기 동작

- `@Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")` 한 곳(본보기 ScreenUsageRollup). 한 틱에 수집할 정의는 최대 50개, 정의마다 순서대로, 한 정의 실패가 다른 정의를 막지 않는다. 예외는 삼키고 로그만 남긴다(주소·인증값 로그 금지).
- 시계는 `Clock` 을 주입해 시험한다. 수집 시각 `slot` = 틱이 시작한 분을 `yyyyMMddHHmm` 으로(틱이 늦게 돌아도 그 분 기준).
- `dmes.widget.collect.enabled`(기본 true)=false 면 수집·보관 삭제 모두 하지 않는다.
- HTTP 원천 보안: 허용 호스트 정확 일치(대소문자 무시, 포트는 허용), 리다이렉트 따라가지 않음, 사용자 정보 금지, 링크 로컬·멀티캐스트·와일드카드 주소(169.254.x.x 등)로 해석되면 거절, 연결 3초·읽기 5초, 응답 1MB 상한, JSON 아니면 실패. 실패 메시지에 주소(질의 문자열의 키)를 넣지 않는다.
- SQL 원천: 읽기 전용 실행기를 재사용한다(행 상한 50, 10초). `WidgetQueryRunner` 에 사용자 없는 수집용 실행 메서드를 더한다.

## 5. 읽기 — `widgetData/run` 을 collect 정의에도 연다

- `WidgetDataService.run` 이 정의의 유형이 `collect` 이면 수집 읽기 서비스로 보낸다(사용 중일 때만, 아니면 기존 오류와 같은 문구).
- 응답: `{ columns: ["COLLECTED_AT","ITEM_KEY","VALUE"], rows: [{COLLECTED_AT: "2026-10-05T09:10:00", ITEM_KEY: "...", VALUE: 숫자 또는 글자}], truncated, lastRun: {at: "2026-10-05T09:10:00", status: "OK"|"FAIL"|"RUN", message?: 글자} | null }`.
- 행은 `show.days` 일 안의 값만, SLOT 오름차순 → ITEM_KEY 오름차순, 최대 500행(넘으면 가장 오래된 행부터 버리고 `truncated=true`). `lastRun` 은 가장 최근 SLOT 의 RUN 행. 수집된 값이 없으면 rows 는 빈 배열.
- 캐시는 쓰지 않는다(수집 값이 정시에 바뀌므로 위젯 새로 고침이 곧바로 반영).

## 6. 프런트(`widget-types/collect/`)

- 유형: `id: "collect"`, 제목 「정시 수집」, 기본 크기 8×8, 최소 5×5. `initialConfig` 는 interval 10분·sql 원천·show.days 7.
- 편집기: 일정(주기 선택 또는 시각 목록), 원천 종류 선택(SQL·HTTP JSON·환율)과 종류별 칸, 표시(기간·단위). SQL 칸은 기존 SqlEditor([쿼리 시험])를 재사용한다. HTTP·환율은 시험 버튼 없이 안내 문구만(첫 판).
- 렌더러: `widgetData/run` 결과를 항목별 최신 값 타일(값·단위·전 회차 대비 증감·수집 시각)과, 항목을 고르면 그 항목의 추이 선 차트로 보인다. 수집된 값이 없으면 「아직 수집된 값이 없습니다」, `lastRun.status=FAIL` 이면 타일 위에 「최근 수집 실패」 한 줄을 보인다. 서버 오류 메시지는 보이지 않는다(기존 쿼리 위젯과 같은 고정 문구).
- 값 서식은 `_query/format.ts` 의 `formatNumber`·`toNumber` 를 쓴다.

## 7. 소유·변경 범위

- 백엔드: `widget/collect/**`(새 패키지), `widget/query/**`(수집용 실행 메서드), `widget/data/**`(collect 정의 읽기 분기), `WidgetDefConfigRules`(collect 검사), 시험.
- 프런트: `widget-types/collect/**`, `widget-types/_query/**`(필요한 만큼). 유형 목록 생성물이 있으면 기존 `exchange` 유형이 등록되는 방식을 그대로 따른다.
- `widget/ext/**` 는 읽기만 한다(환율 제공자 빈을 주입해 쓴다). 소유 밖 파일을 고쳐야 하면 멈추고 알린다.
- DataInitializerSeedFingerprintTest 의 golden(스키마 해시)은 다른 레인 테이블 변경과 겹치므로 머지 직전에 한 번 다시 만든다(지금은 건드리지 않는다).
