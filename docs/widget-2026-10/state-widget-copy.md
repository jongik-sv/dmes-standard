# widget-copy 레인 정본 (2026-10-05)

- 지시: widget-copy-1 / 브랜치 `feat/widget-copy` / 워크트리 `/Users/jji/project/dmes-standard-wt/widget-copy`
- 요청: 위젯 관리 오른쪽 상세에 [복사] 를 넣어 새 위젯을 쉽게 만든다.

## 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 복사 원본 | 마지막으로 저장한 값(baseline) | 바뀐 내용이 있으면 기존 미저장 확인(guard)을 거치고, 그 변경은 사본에 넣지 않는다 |
| 사용 여부 | 원본과 상관없이 늘 「사용」 | 중지한 원본의 사본이 말없이 서랍에서 사라지는 혼선을 막는다 |
| 이름 | 「원래 이름 (사본)」, 50자 상한이면 원래 이름을 잘라 접미사를 남김 | 이름 검사(1~50자)를 그대로 통과 |
| 화면 전용 키 | config 의 최상위 `__*` 키(쿼리 시험 결과)는 복사하지 않음 | 저장 때 지우는 키와 같은 규칙 |
| 코드 위젯 | [복사] 비활성 + 이유 툴팁 | 관리자가 코드 위젯을 새로 만들 수 없음 |
| 사용자 데이터가 따로 있는 유형 | 개인 메모·정시 수집은 복사 직후 안내 문구 | 사용자 메모·수집한 값은 정의 설정과 따로 저장됨 |
| 미디어 파일 | 사본이 같은 `media:{fileId}` 를 참조 | 서버는 위젯 삭제 때 파일을 지우지 않는다(`WidgetMediaStorage` 는 업로드 실패 때만 지움). 원본을 지워도 사본이 깨지지 않는다 |
| 저장 API | 기존 `commWidgetMng/save`(widgetId 빈 값 = 새 위젯) | 백엔드 변경 없음 |

## 산출물

- `commWidgetMng/form-model.ts`: `copyDefForm`·`copyTitle`·`copyBlockReason`·`copyDataNotice`
- `commWidgetMng/WidgetListTab.tsx`: [복사] 버튼·`handleCopy`·안내 줄
- `docs/guide/FrontEnd/Widget-Authoring-Guide.md` 2.5 「복사해서 만들기」, `help/widget-guide-content.ts` 재생성
- 시험: `form-model.test.ts` 「복사해서 만들기」 8건

## 남은 일

1. 실서버 화면 확인(조정 세션 요청): 정의 위젯 선택 → [복사] → 저장 → 새 ID 발급.
2. 머지는 조정 세션 허가 뒤.

## widget-copy-2: 새로 고침 최소 600초 (사용자 요청)

| 위치 | 변경 |
|---|---|
| 관리 화면 검사 | `form-model.ts` `REFRESH_MIN_SEC=600`(30 → 600), 입력 칸 `min`·안내 문구 |
| 서버 저장 검사 | `CommWidgetMngService.REFRESH_MIN` 30 → 600 (이 항목에 한해 백엔드 수정 허가) |
| 실행 주기 | shared `MIN_REFRESH_SEC` 30 → 600(`WidgetFrame` 의 `max(MIN_REFRESH_SEC, refreshSec)`) — 저장된 600 미만 값도 실행 때 600 으로 올려 쓴다. 빈 값·0 은 새로 고침 없음 유지 |
| 코드 위젯 meta | `refreshSec` 를 둔 코드 위젯 0건 → 올릴 목록 없음 |
| 이미 저장된 600 미만 정의 | 실행은 600 으로 동작, 관리 화면에서 그 위젯을 저장하려면 600 이상으로 고쳐야 한다(복사도 같음) |
| 문서 | 가이드 2.2·예시·오류 문구, 스킬 `widget.md`·`llms-full.txt` WidgetMeta 한 줄, `gen:widget-guide` 재생성 |
| 미갱신(소유 밖) | `docs/superpowers/specs/2026-10-02-widget-admin-generic-design.md:300` 「30~86400」 — 조정 세션이 마감에 정리 |
