# BE 리팩토링 2회차 마감 보고 (refactor-be-2026-10)

- 기간: 2026-10-16 10:36 ~ 16:45 · 레인 5개(mdm-version·mdm-erd·mdm-rule·mcm·build) · 모드 token
- 결과: 전체 진도 100%(31/31). dev 8026cc32e 를 origin 에 push 함(33a1ca732..8026cc32e)
- 규칙 문서: docs/refactor-be-2026-10/README.md (항목 보드 완료 표시는 8026cc32e)

## 머지 목록

| 레인 | 항목 | dev 커밋 | 방식 |
|---|---|---|---|
| mdm-rule | C5M·C5 | 4f73c787e·50d490784 | --no-ff / ff-only |
| mdm-rule | F4(D4 제외) | 875c5bcd5 | ff-only |
| mcm | F2·F5·F6·F7·D3 | 2ab41bb40 | ff-only |
| build | D5 | 97f949943 | --no-ff |
| mdm-erd | F1·D1·C9·F3 | 9235cd59c | --no-ff |
| mdm-erd | C8 | cac4ab930 (트리 31cc1cc4) | ff-only |
| mdm-version | C1 | ae21c4d28 | --no-ff |
| mdm-version | C4·C5L·C2·C6 | 618e95768 (트리 c7eab4c5) | ff-only |
| mdm-version | C7 | d970ad0b9 (트리 1f43f784) | ff-only |
| mdm-version | C3 | 71eba05c2 (트리 e8ecbb67) | ff-only |

- 앞 4건은 회차 초 규칙(커밋 유지 + --no-ff), 12:06 사용자 지시 뒤로 스킬 규칙(squash + ff-only)
- ff-only 머지는 모두 트리 대조 일치

## 시험

- 마지막 mdm 전체 시험(71eba05c2 와 같은 트리): lib 2372/0, api 2184 중 실패 1·skip 13
  - 실패 1 = CodeCateEditPerformanceSqliteTest AC4(성능, 회차 시작 기준선부터)
- OASIS 계약 검사(mdm): BPMN 29·bean 29, ERROR 0·WARN 0
- 통합 확인: dev 로 서버 재기동, BFF 경유 읽기 API 7화면(codeMng·ruleMng·ruleSetMng·layoutMng·erdEdit·dataMng·termMng) 모두 HTTP 200·success. 쓰기 호출 안 함

## 바깥에서 보이는 변화

- C3 fix: 코드 버전 번호 상한 오류 MDM021 → MDM009, 문구 2개, INVALID_VALUE(400) → BUSINESS_ERROR(409). 화면은 문구만 보여 줘 동작 같음
- C3 fix: ERD 새 버전 번호 = 모든 버전 최대값
- C2: 미적용 판정 넓은 뜻(사용자 결정), ADR-0002 D2 개정 메모
- F1: ERD 도메인 상속 반영. 저장 JSON 보정 안 함(L_MAIN 영향 0)

## 사용자 결정·후속

- F8(권한 마스터 저장 SYSADMIN gate 없음, 보안) → 다음 회차 첫 항목(사용자 결정 10-16)
- 새 버전 부모 행 잠금 없음(룰 세트·룰·레이아웃 동시 복사 → 같은 번호, saveAndFlush merge 가 DRAFT 덮음) → fix 후보, structure-version.md 후보 표
- 원천 06 문서(저장소 밖) 미적용 문구 정리 = 사용자 몫
- dmb.headerMng → layoutMng DTO 의존(공용 layout DTO 분리), dmd.dataHistory → dataItemMng 의존 → 다음 회차 후보
- ERD: stream↔dto 순환, 허브 presence 분리, view 노드 ORDER BY 없음(fix 후보), 출처 검사 규칙 통일(동작 변경)
- dcdd9c131(주석만) opus 리뷰 없음
- layoutMng/view 의 ID 누락 오류 문구가 「전문 저장 거부」 — 읽기 동작에 저장 문구(작은 개선 후보)

## 지표(metrics.md)

- Claude 비용 $225.68(조정 $24.93 · 레인 $95.64 · 서브에이전트 $105.12), 조정 비중 11%(목표 10%)
- 1천 줄당 $165.6(목표 $7) — 변경 줄 1363 은 C8 하나(+1325 −347)보다 작아 집계가 낮게 잡힌 것으로 보임

## 조정 운영에서 본 것(스킬 개선 후보)

- compact 대기 중 「새 단계 착수 금지」 지시가 백그라운드 agent 때문에 길어져 레인 본작업이 약 25분 멈춤 → clear 대기는 agent 종료까지 본작업을 막지 않게
- run-metrics 의 변경 줄 집계(머지 8건)가 squash ff-only 머지를 빠뜨리는 것으로 보임
- 조정자 셸 JAVA_HOME 이 17 이라 메인 compile 이 처음 실패 → 머지 뒤 compile 명령에 .run.env 의 JDK 21 을 쓰게
- UNACKED 가 「정본 갱신 완료」 답을 ack 로 잡지 못함
