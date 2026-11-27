# perm-bench-be 레인 메모

- 세션 win144-memoized-river · 브랜치 perm/perm-bench-be · 워크트리 win144 `../dmes-perm-w2`
- 기준: origin/claude/perm-bench 998f1fec7 위로 rebase(머지 요청 직전)

## 할 일·진행

| id | 상태 | 비고 |
|---|---|---|
| b0 | 끝 | 5종 설계 산출물 + 리뷰(M8·S17·N11) 반영, 16 grid·79 칸 정합 |
| b1 | 끝 | 1단계 4 action. searchMenuTree·explain = PermExplainService(r4), 비활성 사용자 NO_ROLE 단락, OBJ_USE_TP |
| b2 | 끝 | 초안 3 action, 범위 지문(D22), PermChangeValidator(SAVE·APPLY), 초안 행 잠금 |
| b3 | 끝 | impact. loadAll, 후보 before∪after, 유효 역할 집합(activeRolesOf) 단위 묶기, 앞 500줄 |
| b4 | 끝 | apply. 한 트랜잭션, 잠금(반대쪽 끝 키 포함·WAIT 5), 지문, 재계산, 확인, 이력, afterCommit 이벤트 |
| b5 | 끝 | 이력 2 action, 기간 양 끝 포함 366일 |
| b6 | 끝 | CommPermBenchOasisServiceTest(Oracle clone, 11 action), contract-check ERROR 0 |
| 추가 | 끝 | searchBench `me`(ME_SYSADMIN) |
| b9 | 진행 | 바뀐 모듈 전체 시험 → squash → push → 머지 요청 |

## 결정(조정자 답)

- D36: 목록 입력 = 요청 grids(saveDraft = grids.changes.rows). 그리드 1개 action = List + output="<grid>", 여럿(searchBench·explain·impact) = Map + output="result"
- Q-010 readPreset +explain(perm-core) · Q-011 사람 상한 200 · Q-022 비활성 사용자 NO_ROLE(런타임은 로그인에서만 막음 — 의도된 차이) · Q-023 AFTER_COMMIT
- 칩 편집 = 허용 값 안만(밖 옛 값은 고치는 순간 빠짐) · 있는 ADD·없는 DEL = no-op(ROLE_OBJ ADD 는 upsert) · saveDraft 에서도 중복·⊆·빈 BTN 검사 · SYSADMIN 이 걸린 변경 = SYSADMIN 사용자만(PERM_FORBIDDEN), ROLE_OBJ 의 SYSADMIN ADD·UPD 는 늘 거절
- loadForUsers = 사람·그룹·역할·퍼미션만 좁힘(objects·menus 전체). impact = loadAll. 역할 기준 CUR = loadForRoles
- 오류 = mcm BusinessException "CODE: 상세"(mcm-core 는 oasis 의존 금지). 새 코드 PERM_NO_USER·PERM_DRAFT_BUSY·PERM_DRAFT_CORRUPT·PERM_BUSY·NOT_FOUND(400)
- APPLY_ID = PA + KST yyyyMMddHHmmssSSS + 일련 3자리(JVM, 시작 무작위), 겹치면 PERM_BUSY
- tx=txBiz = process 수준(serviceTask 가 tx 속성을 받지 않음)

## 측정(impact compute, 실제 구현, 1,000명·오브젝트 1,004)

일반 16ms · 그룹 조합 다름·역할 같음 21ms · SYSADMIN 을 1,000명 그룹에(약 100만 줄) 50ms · 역할 집합까지 모두 다름 366~532ms → 최악도 2초 안(loadAll·이름 조회 제외)

## 남은 일·다음 회차 후보

- activeRolesOf 를 PermResolver 계약에 올리고 `instanceof DefaultPermResolver` 분기 지우기
- 여러 노드용 APPLY_ID 시퀀스, 옛 화면 저장과의 lost update(S10-1), 범위가 달라도 영향이 겹치는 적용의 직렬화
- 런타임에서 로그인 중 비활성으로 바뀐 사용자 권한
- 마감 z1: searchMenuTree == getMyMenus 한 번 더 대조(r5 는 userMenuTree 로 대조함)
- 시더 START_ACTIVE_DATE = SYSTIMESTAMP(DB 시계) vs 계산기 JVM 시계 → 막 시드한 오브젝트가 잠깐 「시작 전」 (perm-core 참고)
