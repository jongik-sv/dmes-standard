# widget-data 레인 구조 변경 기록

## S1. 쿼리 위젯 입력 조건(사용자 바인드) 도입
- 커밋: 2beb4608, 52dc3e1a (백엔드) / d6a70a0a, 123ac990 (프런트)
- 바뀌기 전: 쿼리 위젯 SQL 은 시스템 변수(:userId·:deptCd·:today·:yesterday·:monthStart·:now)만 쓸 수 있었고, `widgetData/run` 은 defId 하나만 받았다. 캐시 키는 (defId, SQL, 행 상한, 시스템 변수 값).
- 바뀐 뒤:
  - CONFIG_JSON `params`(이름·라벨·형 text|number|date|select·기본값·필수·선택지)를 선언하면 SQL 의 `:name` 을 사용자 입력 조건으로 받는다. `widget/query/QueryParam`·`QueryParams`(파싱·값 해석), `SqlGuard.checkDeclared`(선언 이름 대조)가 새로 생겼고, 실행기는 형별 SQL 형(number→NUMERIC, 그 밖 VARCHAR)으로 바인드한다.
  - `widgetData/run` 요청에 `paramsJson`(값 객체 JSON), `commWidgetMng/previewQuery` 요청에 `paramsJson`(정의 배열 JSON)이 더해졌다.
  - 캐시 키에 해석을 마친 사용자 값(숫자는 정규화)이 들어가고, 정의별 캐시 상한(50)이 모든 정의에 적용된다.
  - SqlGuard 가 DB 고유 자리표시자(`\:이름`·`@이름`·`$이름`·`$숫자`)를 거절하고 Spring 치환 뒤 사후 검사를 한다.
  - 프런트는 `_query/ConditionBar`(본문 맨 위 조회 조건 줄+[검색])·`ParamsEditor`(조건 편집)·`useQueryData`(입력 중인 값과 [검색]으로 확정한 값 분리)를 둔다.
- 바꾼 이유: 위젯 하나가 날짜·설비 같은 조건을 사용자마다 달리 조회할 수 있게 한다(사용자 결정 2026-10-05 §0-5).
- 동작 보존 근거: 조건 선언이 없는 기존 정의는 이전과 같다. `runDefinition(defId, maxRows)` 2인자는 default 메서드로 유지(챗봇 호출 경로). mcm-core 전체 1001 통과(실패 0), m-mcm widget-types 950 통과.
- 영향 범위: 쿼리 위젯 3종 renderer·편집기, 챗봇 도구 경로(2인자, 필수 조건이 기본값 없이 있는 정의는 거절), `CommWidgetMngRequest`·`CommWidgetMngService.previewQuery`(paramsJson 전달 최소 변경, 조정 세션 허가).
- 되돌리는 방법: 위 4개 커밋을 역순으로 revert. 조건을 선언한 정의가 이미 저장됐다면 그 정의는 SQL 의 `:name` 을 알 수 없는 변수로 거절한다.

## S2. 정시 수집 유형(collect) 도입
- 커밋: 3e8ea5be (백엔드·문서) / 5c44c22f (프런트)
- 바뀌기 전: 외부·주기 데이터는 환율 위젯의 요청 시 조회뿐이었고, 쿼리 위젯은 열 때마다 실행했다.
- 바뀐 뒤:
  - `widget/collect` 패키지가 새로 생겼다. `WidgetCollector` 가 매분 0초(Asia/Seoul) 사용 중인 `collect` 정의 중 이번 분이 수집 시각인 정의를 수집하고, 매일 03:30 에 90일 지난 행을 지운다.
  - 원천 3종: SQL(기존 읽기 전용 실행기, `runCollect` 로 사용자 없이), HTTP JSON(허용 호스트만), 내장 환율(widget/ext 제공자). 수집 정의는 collect 위젯 정의의 CONFIG_JSON 에 둔다.
  - 새 테이블 `TB_MCM_WIDGET_COLLECT_RUN`(회차, PK 위젯 ID+수집 시각)·`TB_MCM_WIDGET_COLLECT_DATA`(값, PK 위젯 ID+수집 시각+항목 키). RUN 행을 먼저 insert 해 중복 수집을 막는다.
  - `WidgetDataService.run` 이 collect 정의를 읽기 서비스(`WidgetCollectReader`)로 보내 `widgetData/run` 으로 읽는다(새 OASIS 경로·BPMN·proxy 변경 없음).
  - 프런트 `widget-types/collect`(편집기·타일+추이 선 렌더러)와 유형 레지스트리 생성물 한 줄이 추가됐다.
- 바꾼 이유: 사용자 결정 §0-4 — 주식·기계 상태 같은 정시 값을 쌓아 추이를 보여 준다.
- 동작 보존 근거: 기존 query-*·exchange 경로는 코드 변경이 없다(WidgetDataService 분기 추가만). mcm-core 전체 1071 통과(실패 0), m-mcm 전체 1390 통과.
- 영향 범위: `dmes.widget.collect.enabled`·`allowed-hosts` 설정 키 신설, DataInitializerSeedFingerprintTest golden(스키마 해시) 재생성 필요, `CommWidgetMngService` 생성자 주입 1개와 `WidgetDefConfigRules.check` 5인자 호출(조정 세션 허가).
- 되돌리는 방법: 두 커밋 revert. 만들어진 두 테이블은 남지만 쓰이지 않는다(개발·운영 DDL 은 erd-widget-data.md).
