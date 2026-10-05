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

## 남은 일
- 없음. 워크트리·브랜치 정리는 tts-4 지시로 처리한다.
