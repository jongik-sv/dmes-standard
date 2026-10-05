# tts 레인 정본 메모 (tooltip-style, 2026-10-05)

- 상태: **완료** (2026-10-05) — 조정 세션 tooltip-styling-form-labels(옛 이름 dmes-standard-d2), dev 머지 최종 관리 dmes-standard-90
- 브랜치 feat/tooltip-style(기준 dev a4848de8)은 dev 에 모두 머지됐다.
- 지시 원문: /Users/jji/.coord/tooltip-style-2026-10-05/lanes/tts/brief.md

## 한 일
| 지시 | 내용 | dev 머지 |
|---|---|---|
| tts-start | 그리드 툴팁 어두운 바탕(grid.css 변수), 사전에 없는 폼 라벨 글자 툴팁(MdmFieldLabel·SearchField·FormGroup, 내부 LabelNameTip), 시험·mantine-aggrid-ui 문서 | 25eb3cd6 |
| tts-2 | 좁은 그리드에서 툴팁 오른쪽이 잘림 → 훅 useGridTooltipOutside(grid-tooltip-parent.ts)가 머리글·셀 위에서만 popupParent 를 body 로 바꿈 | 68719e3c |
| tts-3 | body 쪽 .ag-popup 에 ag-theme-alpine 이 없어 흰 바탕 → 선택자 `body > .ag-popup`, 호출자 popupParent 가 있으면 훅이 건드리지 않음 | de6c77ee |
| tts-5 | 「셋째 칸부터 툴팁이 안 뜸」 회귀 신고 → 훅 호출을 되돌림(0750638e). 조정 세션이 측정 오류로 철회(안 뜬 칸은 상세 패널에 가려진 칸) | 0750638e |
| tts-6 | 되돌림을 다시 되돌려 훅 재활성(git revert -m 1 0750638e). HTML 설명 머리글 카드(MdmHeaderLabel)를 라벨 글자가 아니라 머리글 칸 전체(ag-grid 머리글 인자 eGridHeader)에서 띄움 — 글자 머리글 툴팁은 ag-grid 가 이미 칸 전체에 걸어 둔 것과 맞춤 | ded09e61 |
| tts-7 | 훅이 첫 툴팁에만 먹는 경합(이전 칸의 tooltipHide 가 새 칸 mouseover 뒤에 늦게 와 되돌림) → tooltipHide 구독 제거, 눌림·키 입력·그리드 이탈에서만 되돌림 | 3d867a21 |
| tts-8 | 위젯 편집기(MdmMetaProvider disabled)에서 m-mcm editors-mdm-meta 4건 실패 → disabled 공급자는 공급자 밖과 같게(useMdmMetaActive), 사전 없는 라벨 글자 툴팁을 띄우지 않음 | 87f929a9 |

브라우저 확인(조정 세션): 어두운 바탕 rgb(28,37,48)·글자 rgb(232,237,243)·테두리, 글꼴 Pretendard 12px, 좁은 용어 목록 그리드 영문명 카드 안 잘림, 셀 툴팁 정상, 사전 없는 폼 라벨 툴팁 정상.

## 결정
- 사전에 없는 폼 라벨 툴팁: 첫 줄 라벨 글자, 둘째 줄 흐린 글자 화면 키(name). name 이 없거나 라벨과 같으면 라벨만.
- 공급자(포털 탭) 안에서만 띄운다. 받는 중(loading)에는 띄우지 않는다(카드로 바뀔 때 깜박임 방지). hover 만(필드 focus 로 열지 않음), 스크린리더 사본 없음.
- SearchField 는 name 이 없으면 MdmFieldLabel(name=label, meta=false)로 공용 경로를 쓴다.
- 그리드 툴팁은 popupParent 를 항상 body 로 두지 않는다(필터·열 메뉴·편집기 팝업이 모달 뒤로 가려지거나 테마 변수가 끊길 수 있음). 툴팁이 뜰 수 있는 동안에만 body.
- 금지 경로였던 m-mls/tests/lsh/noticeMgmt/notice-mdm-render.test.ts 한 건은 조정 세션 수용으로 고쳤다(머지 뒤 메인에서 16/16 통과).

## 교훈
- ag-grid 33 Theming API 에서 body 쪽 .ag-popup 감싸개에는 `ag-theme-params-N` 클래스만 붙고 `ag-theme-alpine` 은 없다. 팝업 변수는 테마 클래스가 아니라 위치(`body > .ag-popup`)로 고른다. jsdom 에서는 CSS 계산이 안 되므로 브라우저 확인이 필요하다.
- `body > .ag-popup` 변수는 body 의 다른 ag 팝업(필터·셀 편집기 메뉴)에도 걸린다. 조정 세션이 필터 메뉴 모양 변화 없음을 확인하도록 전달했다.

- 훅(useGridTooltipOutside)은 마우스가 그리드의 머리글·셀 위에 있는 동안 popupParent 를 body 로 두므로, 마우스를 가만히 둔 채 화면 코드가 api.startEditingCell 로 편집을 시작하면 편집기 팝업이 body 에 붙을 수 있다. AgDataGrid 의 화살표 키 편집 시작은 keydown 에서 먼저 되돌아가 문제없다.
- 사전에 없는 라벨의 글자 툴팁은 켜진 공급자 안에서만(useMdmMetaActive). 꺼진(disabled) 하위 트리는 공급자 밖과 같다.
- 사용자 관찰 「같은 표기 툴팁이 그리드와 폼에서 다르다」(그리드는 글자, 폼은 카드)는 dev 에서 재현되지 않았다(조정 세션 측정: 메인 그리드·유사어 추천 그리드 모두 첫 hover 부터 카드). 사전 응답 전 첫 hover 는 글자 이름 툴팁이고 응답 뒤 카드로 바뀌는 것이 설계다(columnDefs 가 mdm 변화에 다시 계산되고 ag-grid 는 툴팁을 열 때 colDef 를 읽는다).

## 남은 확인
- 필터·열 메뉴 팝업은 버튼이 있는 실제 화면에서 브라우저로 보지 못했다(용어 관리 화면에는 없음). 셀 편집기 드롭다운은 keydown·mousedown 에서 되돌아가 그리드 안에 붙는다고 판단했다.
