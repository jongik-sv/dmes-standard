# 구조 변경 기록 — mdm-column-dict 레인

## S1. MDM 메타 피드 컬럼 별칭이 시스템 코드 목록을 받는다

- 커밋: ee705168(구현·시험), 90bb01d9(시험 보강)
- 바뀌기 전: `MetaFeedDictionary.columns(keys, systemCode)` 가 `systemCode` 를 코드 하나로 보고, 표준 물리명으로 못 찾은 키를 그 시스템의 별칭(`TB_MDM_COLUMN_SYSTEM`)으로 한 번 찾았다. mcm 은 `cactus.mdm.system-code: MES` 라 MDM 시스템 별칭만 있는 MDM 화면 키(67건)는 missing 이었다.
- 바뀐 뒤: `systemCode` 가 쉼표로 이은 목록(`"MES,MDM"`)이면 앞 코드부터 별칭을 찾는다. 앞 코드에서 맞거나 모호했던 키는 뒤 코드에서 다시 찾지 않는다(모호한 이름을 다른 시스템 뜻으로 바꿔 답하지 않는다). 공백·빈 항목·중복 코드는 뺀다. 코드가 하나·null·빈 값이면 예전과 결과·SQL 문 수가 같다. mcm 의 `cactus.mdm.system-code` 를 `MES,MDM` 으로 바꿨다. mls·mqc·mpp·mpn 은 `MES` 그대로다.
- 바꾼 이유: MDM 화면 키를 MES 별칭으로 겹쳐 넣으면 MES 에 없는 필드가 MES 이름으로 등록돼 사전 뜻이 틀어진다(조정자 결정 mdm-column-dict-2). 조회 쪽에서 MDM 별칭을 함께 보게 하면 등록 없이 MDM 화면 툴팁이 붙는다.
- 동작 보존 근거: `MetaFeedColumnAliasSqliteTest` 16/16(기존 8 + 목록 8: 앞 코드 우선·순서 바꾸면 결과 바뀜, 앞 코드에 없으면 뒤 코드, 앞 코드 모호면 뒤로 안 넘어감, 표준이 두 별칭을 이김, 뒤 코드 안에서만 모호, 키별 분리, 공백·중복 무시, SQL 문 수가 키 수와 무관). 피드 패키지 시험 72건 통과(`:mdm:api:test --tests 'com.dongkuk.dmes.mdm.feed.*'`, `:mdm:lib:test` 같은 패키지). 정합성 리뷰(opus/high): 코드 결함 없음, 배포 순서 위험만 지적.
- 영향 범위: MDM 피드 COLUMN 조회(`metaFeed/view`), mcm 메타 캐시(`MdmMetaClient` 가 문자열을 그대로 싣는다 — 캐시 키·무효화에는 `systemCode` 를 쓰지 않는다). 응답의 `matchedSystem` 이 `MDM` 일 수 있다(카드는 값을 그대로 보인다). SQL 문 수는 표준 1 + 코드마다 별칭 1·컬럼 1 이다.
- 배포 주의: MDM WAS 를 먼저 올리고 mcm 을 올린다. 반대로 하면 옛 MDM 이 `"MES,MDM"` 을 코드 하나로 보고 MES 별칭까지 없음으로 답하며, 그 없음이 mcm 캐시에 남는다(META_REV 가 안 생겨 저절로 안 지워진다). 어긋났으면 mcm 캐시 관리 화면에서 다시 읽기를 한다.
- 되돌리는 방법: ee705168·90bb01d9 를 revert 한다. 설정만 되돌리려면 mcm `application.yml` 의 `system-code` 를 `MES` 로 바꾸고 mcm 을 재기동한다(MDM 코드는 코드 하나일 때 예전과 같아 그대로 둬도 된다).

## S2. 화면 키 컬럼 사전 도구 추가 (scripts/mdm-meta, scripts/perf/mdm-meta)

- 커밋: ec4ff90a, 1d4720e5, c40c1cd9, ccefc1e8, c9596a7a, 3e61044d(리뷰 수정)
- 바뀌기 전: 화면 키가 사전에 있는지 확인하거나 컬럼을 일괄 등록하는 도구가 없었다.
- 바뀐 뒤: 키 수집(`collect-keys.mjs`), mcm 메타 hit 확인·전후 비교(`check-meta.sh`), OASIS 등록(`register-columns.mjs`, 기본 dry-run), BE 측정(`scripts/perf/mdm-meta/run-measure.sh`)을 둔다. 등록은 피드 기록이 남는 OASIS save 로만 한다.
- 바꾼 이유: 툴팁이 붙지 않는 키를 운영 DB 에도 같은 절차로 등록하기 위해서다(사용자 결정: 등록 JSON 과 스크립트를 리포에 남긴다).
- 동작 보존 근거: 제품 코드 변경 없음. dry-run 로컬 결과 PLAN 71·FAIL 0, check-meta 로컬 결과 hit 61(dev 합친 뒤. 합치기 전 62 는 조정자 실측과 같음).
- 영향 범위: 없음(스크립트만). `--apply` 는 조정 세션만 돌린다.
- 되돌리는 방법: 해당 커밋을 revert 한다.
