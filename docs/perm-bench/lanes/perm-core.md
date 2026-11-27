# perm-core 레인 메모

- 세션: win144-frolicking-puzzle · 브랜치: perm/perm-core · 워크트리: win144 `../dmes-perm-w1`
- 기준: origin/claude/perm-bench 6dfcf8c3c

## 할 일

| id | 상태 | 비고 |
|---|---|---|
| c0 | 끝 | V20 DDL·column-order.json·엔티티 5개·SecObj 필드 3개·저장소 4개 |
| c1 | 끝 | `security/perm/*` 계약 17개 파일 + PermTokensTest(10건) |
| c2 | 남음 | V21 옮기기 + `scripts/perm/gen-obj-perm.mjs` |
| c4 | 남음 | 시더 전환 |
| c5 | 남음 | 옛 저장소 SQL 전환 |
| c6 | 남음 | 칼럼 주석·ERD·ADR |
| c3 | 남음 | PermModelParityOraTest(r2 머지 뒤) |

## 진행

- c0+c1 시험: `mcm-core compileJava`, `ColumnOrderOraTest`(clone, V1~V20 Flyway clean+migrate 포함) 1건 통과, `PermTokensTest` 10건 통과
- 이 PC 에는 TPL_EMPTY 가 없다. clone 시험은 `-Pdmes.ora.template=TPL_SCHEMA` 로 돌렸다(시험 틀이 네 스키마를 clean 뒤 migrate 하므로 결과 같음)

## 결정(레인 안)

- V20 FK 이름: `FK_TB_MCM_SEC_ROLE_PERM_ROLE`·`_OBJ`·`FK_TB_MCM_SEC_PERM_HIS_DTL_HIS`. 인덱스 `IX_TB_MCM_SEC_ROLE_PERM_OBJ (OBJECT_ID, ROLE_ID)`·`IX_TB_MCM_SEC_PERM_HIS_AT (APPLY_AT, APPLY_USER_ID)`
- HIS_DTL 에 CHECK 제약 2개(TARGET_TP·OP_TP)
- VER = `number(19,0) default 0`(기준선 표와 같이 null 허용, McmAuditListener 가 0 을 채움)
- `PermTokens.join(빈 목록)` = `""`. `readPreset` 접두 = 대소문자 구분 startsWith
- `PermResolver.SYSADMIN_ROLE = "SYSADMIN"`. 지금 런타임은 `ROLE_SYSADMIN` 별칭도 받음 → r1 이 둘 다 처리
- `PermGraph.applyChanges` ROLE_OBJ ADD·UPD 는 dataPerm 을 유지한다. 그래프 사본은 넣은 순서를 지킨다

## 받은 알림

- D35: v2 계산은 USE_TP=N·유효 기간 밖을 뺀다 → c3 는 이 차이를 「의도된 차이」로 따로 적고 나머지만 판정
- 결정 7: c2 생성기·V21·c4 allActions 에 `searchObjPerm`·`searchObjMenu`(commObjMng), `searchFolderObj`·`searchRoleGroups`(commRoleMng) 추가

## 남은 일

- c0+c1 머지 완료 뒤 c2·c4·c5·c6 병렬
