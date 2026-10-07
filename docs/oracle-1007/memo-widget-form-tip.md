# widget-form-tip 레인 정본 메모 (oracle-1007, 지시 widget-form-tip-1)

- 브랜치 `fix/widget-form-tooltip`, 워크트리 `/Users/jji/project/dmes-wt/widget-form-tip`, 조정 세션 dmes-standard-d8, 기준 dev ec40b8a37.
- push 하지 않는다. 머지는 조정자 허가 뒤에만.

## 지금 상태 (2026-10-07 23:58)

| 항목 | 상태 | 커밋 |
|---|---|---|
| t1 재현·원인 | 완료 | - |
| t2 수정 | 완료 | 993edd87d, 03a4b4eb9 |
| t3 브라우저 전·후 확인 | 완료(메인 5100 전 / 워크트리 5110 후) | - |
| t4 가이드 한 줄 | 완료 | 207188c72 |
| t5 조건줄 안 보임 | 재현 안 됨(사용자 재현 위치 대기) | - |
| t6 저장 버튼 비활성 | 완료(원인: 옛 새로 고침 값, 칸 옆 오류로 보이게 함) | ff37f4ed0 |

## 원인과 수정

1. **Form 형식 툴팁 안 됨**: 룰 계산기(`widget-types/rule-calc/renderer.tsx`) 입력·결과 라벨이 `title` 속성만 썼다. 입력·출력 이름이 MDM 물리명이라 `MdmFieldLabel` 로 교체. 도크(업무 화면 도구 창)는 포털 탭 공급자 밖이라 렌더러가 `MdmMetaProvider` 를 스스로 둔다(바깥 범위가 있으면 따르고, 꺼진 공급자는 상속). 쿼리 위젯 조건줄(`_query/ConditionBar.tsx`) 라벨도 같게.
2. **그리드 메뉴가 엑셀뿐**: 위젯 그리드 4곳(query-table·exchange·홈 shipments·workOrders)이 10-06(b3418d2d3)부터 `personalize={false}`. `widgets/widget-grid.ts` 의 `widgetGridPersonalize(widgetId, instanceId)` 로 인스턴스별 `gridId=widget-{instanceId}`(미리보기·인스턴스 없음은 끔). 도크 안 그리드는 shared 설계(겹친 모달 Esc·Tab)라 엑셀만 남는다 — 건드리지 않음.
3. **저장 비활성(t6)**: 저장된 새로 고침 120초가 `REFRESH_MIN_SEC`(600) 검사에 걸려 어떤 칸을 바꿔도 `canSaveForm` 이 막힌다. 오류 문구는 폼 맨 아래 줄(뷰포트 1339px 에서 top 1569px)이라 화면 밖이었다. `refreshSecFieldError` 로 새로 고침 칸 옆에 「…(지금 120초)」 를 보인다. 값은 고치지 않았다.

## 개인화 키 정리

- 키 `dmes:grid:v1:{userId}:{화면}:{widget-{instId}}`. 새로 고침·재기동·이동·크기 조절에는 유지, 위젯 삭제 후 재배치·탭 가져오기·복제(새 instId)에서는 처음부터. 지운 위젯의 키는 localStorage 에 남는다(정리 로직 없음).

## 남은 결정·후속

- 옛 새로 고침 값(600 미만) 읽기 전용 집계(10-07 23:5x, 관리 `commWidgetMng/search`): def.fpkt65d4=120, def.ldj2hpgw=120, def.lo41tduo=300. def.qcondsmp 는 처음 120 이었다가 작업 중 600 으로 바뀌어 있었다(이 레인은 저장하지 않았다, 사용자 수정으로 보임). 보정(600 으로 올림·적재기 후처리)은 조정자가 사용자에게 올린다.
- 도크 안 위젯 그리드에도 컬럼 설정 메뉴를 열지는 사용자 결정(shared 변경 필요).
- 지운 위젯의 개인화 키 정리는 후속 후보.
- t5: 메인 5100·워크트리 5110 모두 홈 보드·위젯 관리 미리보기에서 조건줄(범위·화면명·시작일·최소 사용(초)·[검색])이 보인다. 좁은 폭(727px)도 보임. 서버 위젯 목록의 configJson 도 params 4개 그대로.

## 검증 기록

- vitest: m-mcm `widget-types`·`widgets`·`page-components/csa/commWidgetMng` 통과, `tsc --noEmit` 오류 0. 새 시험: `widgets/widget-grid.test.ts`, `widget-types/rule-calc/rule-calc-label-tip.test.ts`, `form-model.test.ts` 옛 새로 고침 값 경우.
- 레인 서버: `next dev --turbopack --port 5110`(워크트리 m-mcm, `.env` 는 메인 것 복사에 포트만 5110, gitignore 대상). 확인 뒤 내렸다.
