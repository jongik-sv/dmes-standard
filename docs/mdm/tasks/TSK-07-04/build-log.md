# mdm/TSK-07-04 build-log.md

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I5 | `DataItemListQuery.page()` 의 nodeFilter WHERE 절에서 `i.LVL1..LVL5 = :node` 를 모두 빼고 `i.CODE = :node` 만 남김 | `DataItemMngServiceSqliteTest.I5_노드_필터는_코드_자신_또는_lvl1_5_어딘가의_값이_같은_행만_열림_닫힘_무관` | 잡힘 |
| I6 | `DataItemListQuery.treeRows()` 에서 `AND i.VALID_TO = :openEnd` 를 빼 닫힌 행도 트리에 포함되게 함 | `DataItemMngServiceSqliteTest.I6_withTree_는_열린_행만_기존_ORDER_로_돌려준다` | 잡힘 |
| I6 | `DataItemMngService.search()` 의 `treeTruncated` 계산을 `treeRows.size() == TREE_MAX` 에서 상수 `false` 로 고정 | `DataItemMngServiceSqliteTest.I6_withTree_는_상한_TREE_MAX_에_걸리면_treeTruncated` | 잡힘 |

세 변이 모두 대상 테스트에서 fail-fast 로 빨강을 확인한 뒤 `/usr/bin/git checkout --`(이미 커밋된 B1 상태로)
되돌렸다. 변이는 작업 트리에서만 넣었고 커밋하지 않았다.

## 구현 단위 진행

- B1 완료(design.md 「구현 단위」 표): `DataItemSearchRequest`·`DataItemSearchResult`·`DataItemListQuery`·
  `DataItemMngService` + `DataItemMngServiceSqliteTest`(I5·I6 케이스). 커밋 a894a74.
- 대상 테스트: `com.dongkuk.dmes.mdm.dmd.dataItemMng.DataItemMngServiceSqliteTest` — 전체 초록(신규 3건 포함).
- design.md 이탈 없음.
