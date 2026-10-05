# widget-data 레인 정본 메모 (widget-data-1)

2026-10-05. 레인 widget-data / 브랜치 feat/widget-data / 워크트리 dmes-standard-wt/widget-data / 기준 dev a4848de8.
설계 계약은 [spec-widget-data.md](./spec-widget-data.md), ERD 조각은 [erd-widget-data.md](./erd-widget-data.md), 구조 변경은 [structure-widget-data.md](./structure-widget-data.md).

## 진행 상태

| 항목 | 내용 | 상태 | 커밋 |
|---|---|---|---|
| 5 | 입력 조건 위젯(쿼리 `:name` 바인드·편집기·조회 조건 줄·캐시 키) | 구현·리뷰·수정 완료 | 2beb4608 · 52dc3e1a · d6a70a0a · 123ac990 |
| 4 | 정시 수집 유형 `collect`(1분 틱·SQL/HTTP JSON/환율·90일 보관·결과 위젯) | 구현·리뷰·수정 완료 | 3e8ea5be · 7f51df01 · a7ae7860 · 5c44c22f · b5f65afe |

머지 요청 직전 dev 최신(e3832abb 시점)을 합쳤고 충돌은 없었다. 머지 요청·허가·완료는 조정 세션 기록을 따른다.

## 결정(사용자 결정 §0 외 이 레인에서 정한 것)

- 입력 조건은 CONFIG_JSON `params` 선언과 SQL 의 `:name` 을 서버가 실행 때마다 대조한다. 기본값은 키가 없을 때만, 빈 값은 형 붙은 null(전체 조회), number 는 NUMERIC·date 는 yyyyMMdd 글자로 바인드한다.
- 조회 조건 줄은 shared 틀의 머리줄이 아니라 위젯 본문 맨 위 줄이다(조정 세션 허가, shared 변경 없음).
- 수집 정의는 `collect` 위젯 정의의 CONFIG_JSON 에 두고, 읽기는 `widgetData/run` 이 collect 정의도 받아 재사용한다(새 OASIS 경로·BPMN·proxy 변경 없음).
- 환율 원천은 interval 이면 60분 이상, 7일 안의 가장 최근 값(주말은 직전 영업일), (제공자·통화) 30분 캐시·실패 10분 대기.
- 소유 밖 파일 최소 변경 허가: `CommWidgetMngRequest`(paramsJson), `CommWidgetMngService`(previewQuery 전달·수집 호스트 판정 주입).

## 시험 결과(머지 직전 기록 갱신)

dev(e3832abb) 합친 뒤 기준:
- mcm-core `gradlew test`: 1083 통과·실패 0.
- mcm/api `gradlew :api:test`: 48 통과·실패 0(스키마 golden 재생성 포함, `__SCHEMA__` 56→60: 테이블 2·인덱스 2).
- m-mcm `vitest run`: 70파일 1412 통과·실패 0.
- 브라우저 확인은 아직 하지 못했다(아래 남은 일).

## 남은 일(후속·결정 대기)

1. 브라우저 확인 요청: 조건 줄과 표 `height=100%`, 날짜 칸 직접 입력 Enter, 조회 실패 시 조건 줄 유지, 정시 수집 위젯의 타일 묶음·선택 줄·추이 선(수집 값 50개·500행 스크롤), 관리 화면의 collect 편집기.
2. 후속(소유 밖, 조정 세션 판단): ① `widget/ext` 환율 제공자(FrankfurterProvider·KoreaEximProvider)의 나눗셈이 응답의 큰 지수 숫자에서 수 GB·수 분을 쓴다(기존 환율 위젯에도 해당, 보안 재확인 A) ② 스케줄러 풀이 1스레드라 수집 틱·롤업·보관 삭제가 서로 밀릴 수 있다(`spring.task.scheduling.pool.size`) ③ 환율 원천 저장 검사가 `[A-Z]{3}` 만 본다(보안 재확인 B).
3. 사용자 결정 대기: ① 조건 줄을 shared 부품(InlineSearchBar 등)으로 올릴지, 지금처럼 위젯 본문 전용으로 둘지 ② KpiTile 증감 방향 색(상승·하락)과 선택 기능을 shared 에 추가할지(지금은 기본 색·별도 선택 줄) ③ 저장 때 관리자에게 허용 호스트 목록을 미리 보여 줄 조회를 둘지.

## 머지 때 할 일(이 레인 기준)

- 머지 직전 dev 를 합친 뒤 `FINGERPRINT_UPDATE=true ../gradlew :api:test --tests '*DataInitializerSeedFingerprintTest'` 로 스키마 golden 을 다시 만들어 함께 커밋한다(새 테이블 2개·인덱스 때문, 조정 세션 합의).
- `m-mcm/lib/generated/widget-type-registry.ts` 충돌은 `node scripts/generate-widget-registry.mjs` 로 다시 만들어 해소한다.
- 개발·운영 DDL 은 erd-widget-data.md 를 조정 세션이 `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 에 합친다.
