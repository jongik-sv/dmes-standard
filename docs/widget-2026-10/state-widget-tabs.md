# widget-tabs 레인 상태 (정본 메모)

- 레인: widget-tabs / 브랜치 `feat/widget-tabs` / 워크트리 `/Users/jji/project/dmes-standard-wt/widget-tabs`
- 지시: widget-tabs-1(항목 1·2·8), widget-tabs-2(항목 9)
- 설계: `design-widget-tabs.md`, ERD 조각: `erd-widget-tabs.md`, 구조 변경 기록: `structure-widget-tabs.md`

## 진행

| 항목 | 상태 | 비고 |
|---|---|---|
| 1 기본 탭 여러 개 | dev 머지 완료 | 머지 커밋 5f57d51f. 브라우저 확인은 조정 세션 몫 |
| 2 공유·내보내기·가져오기 | dev 머지 완료 | 공유 shareTab·searchUsers(서버), 내보내기·가져오기는 클라이언트만 |
| 9 메모 위젯 이름 바꾸기 | dev 머지 완료 | 저장 직전 fetchMemo 재조회. 서버 titleOnly 갱신은 후속 |
| 8 서랍 미리 배치 | 구현·리뷰 수정 끝, 머지 요청 중 | hover → 첫 빈 자리 스켈레톤, 클릭해야 배치. categoryTitles 배선 포함 |

## 결정·이탈 (설계 문서 대비)

- 기본 탭은 별도 테이블 2개(TB_MCM_WIDGET_DEFAULT_TAB·_ITEM), 탭 ID `def-N` 전역 유일. 홈 기본 배치와 widgetDef/list 의 homeDefault 는 불변.
- saveTab 에 `newYn` 추가: 새로 만든 탭의 첫 저장에만 보내며, 서버에 같은 tab-N 이 이미 있으면 다음 번호로 옮기고 `result.tabId` 로 돌려준다(공유 사본 덮어쓰기 방지).
- shareTab 은 받는 사람 한 트랜잭션, 사본은 persist(insert) 로 넣는다.
- 서랍 클릭 추가가 「맨 아래」에서 「첫 빈 자리」로 바뀌었다(미리 본 자리와 같아야 해서). WidgetPicker 안내 문구 두 줄도 맞췄다.

## 남은 일 (후속)

1. 운영 반영 노트: 기존 위젯관리 권한 역할에 action 4개(loadDefaultTabs·saveDefaultTab·deleteDefaultTab·reorderDefaultTabs) 추가 필요(PERM_ALL 만 시드됨). 개발·운영 DDL 은 erd-widget-tabs.md.
2. 낮은 위험 후속: 공유 남용 상한(설계 판단), searchUsers 호출 빈도 제한, secWidget resolve 쿼리 수 줄이기, 관리자 화면 재조회 응답이 버려질 때 tab-N→def-N 매핑 소실.
3. 항목 8 후속(낮음): firstFreeSpot 이 화면에 당겨진 배치가 아니라 상태 items 를 봐서, 잠금 해제 직후 같은 드문 경우 미리 보기가 다른 위젯을 밀어 보일 수 있음 / 클릭 뒤 미리 보기가 지워져 같은 위젯을 하나 더 놓을 자리는 항목에서 나갔다 다시 들어와야 보임 / hover 마다 보드 리렌더(WidgetFrame memo 검토) / 홈이 csa/commWidgetMng 의 useWidgetCategories 를 가져옴(lib 로 이동 권장).
4. 서버에 메모 제목만 바꾸는 경로(titleOnly) 신설(항목 9 덮어쓰기 위험 완전 제거).
5. shared `widget.md` 의 「Mantine import 금지」 규칙에 공유 창 예외가 들어갔다 — 조정 세션 확인 필요.
6. 브라우저 확인(조정 세션): 기본 탭 관리·개인화·되돌리기·공유·내보내기·가져오기·미리 배치. mcm(8100) 재기동 필요(새 테이블 2개 ddl-auto, PERM_ALL 갱신).
