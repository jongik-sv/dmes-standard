# widget-tabs 레인 상태 (정본 메모)

- 레인: widget-tabs / 브랜치 `feat/widget-tabs` / 워크트리 `/Users/jji/project/dmes-standard-wt/widget-tabs` (기준 dev a4848de8)
- 지시: widget-tabs-1(항목 1·2·8), widget-tabs-2(항목 9)
- 설계: `design-widget-tabs.md`, ERD 조각: `erd-widget-tabs.md`, 구조 변경 기록: `structure-widget-tabs.md`

## 진행

| 항목 | 상태 | 비고 |
|---|---|---|
| 1 기본 탭 여러 개 | 구현·리뷰 수정 중 | 백엔드 커밋 8e546ffb…6c85d225, 프런트 4843a13d…4efca2ef. 브라우저 확인은 조정 세션 몫 |
| 2 공유·내보내기·가져오기 | 구현·리뷰 수정 중 | 공유 shareTab·searchUsers(서버), 내보내기·가져오기는 클라이언트만 |
| 9 메모 위젯 이름 바꾸기 | 대기 | 1·2 리뷰 clean 뒤 착수 |
| 8 미리 배치 | 대기 | widget-meta 의 onPreview 가 dev 에 들어간 뒤 |

## 결정·이탈 (설계 문서 대비)

- 기본 탭은 별도 테이블 2개(TB_MCM_WIDGET_DEFAULT_TAB·_ITEM), 탭 ID `def-N` 전역 유일. 홈 기본 배치와 widgetDef/list 의 homeDefault 는 불변.
- saveTab 에 `newYn` 추가: 새로 만든 탭의 첫 저장에만 보내며, 서버에 같은 tab-N 이 이미 있으면 다음 번호로 옮기고 `result.tabId` 로 돌려준다(공유 사본 덮어쓰기 방지).
- shareTab 은 받는 사람 한 트랜잭션, 사본은 persist(insert) 로 넣는다.

## 남은 일 (후속·머지 전 할 일)

1. 머지 직전 dev 를 합친 뒤 mcm/api `DataInitializerSeedFingerprintTest` golden 을 `FINGERPRINT_UPDATE=true` 로 재생성해 함께 커밋, `m-mcm/lib/generated/**` 충돌은 생성 스크립트로 재생성.
2. 운영 반영 노트: 기존 위젯관리 권한 역할에 action 4개(loadDefaultTabs·saveDefaultTab·deleteDefaultTab·reorderDefaultTabs) 추가 필요(PERM_ALL 만 시드됨). 개발·운영 DDL 은 erd-widget-tabs.md.
3. 낮은 위험 후속: 공유 남용 상한(설계 판단), searchUsers 호출 빈도 제한, secWidget resolve 쿼리 수 줄이기, 관리자 화면 재조회 응답이 버려질 때 tab-N→def-N 매핑 소실.
4. 브라우저 확인(조정 세션): 기본 탭 관리·사용자 개인화·되돌리기·공유·내보내기·가져오기. mcm(8100) 재기동 필요(새 테이블·PERM_ALL).
5. shared `widget.md` 의 「Mantine import 금지」 규칙에 공유 창 예외가 들어갔다 — 조정 세션 확인 필요.
