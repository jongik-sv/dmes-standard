# erdEdit 기능설계서 — ERD 설계

- 정본: [ERD 도구 설계](../../../superpowers/specs/2026-10-10-erd-tool-design.md). 이 문서는 MDM 화면 규약(screens/README.md §5)에 맞춘 색인이다.
- 그룹 `dma`, screenId·serviceId `erdEdit`, componentPath `dma/erdEdit`.
- 버전 대상 `ERD_MODEL`(모듈 하나 = 객체 하나, 스펙 D2). 확정은 소유자가 직접 한다(ADR-0002).

## 1. 액션

| 액션 | 뜻 | 권한 세트 |
|---|---|---|
| search | 모델 목록 | READ |
| view | 모델 하나(JSON·다이어그램·rev·편집자·접속자) 또는 `sinceRev` 이후 델타 | READ |
| compare | 논리명·물리명 미리보기(표준 판정) | READ |
| validate | 확정 검사 미리보기 | EDIT |
| reg | 빈 모델 만들기 | EDIT |
| save | 명령 묶음 적용(`apply`) | EDIT |
| restore | 명령 되돌리기 | EDIT |
| execute | 세션 명령(선택 상태·작업 중 표시)과 공동 편집자 등록·해제. `kind` 값은 ADD_EDITOR·REMOVE_EDITOR·SET_VIEW·CLAIM·RELEASE | EDIT |
| copy | 새 버전(DRAFT) | EDIT |
| delete | DRAFT 삭제 | EDIT |
| lock / unlock / handover | DRAFT 선점·해제·넘기기 | EDIT |
| confirm | 확정 | CONFIRM |
| import | DB 가져오기. 단계 1 에서 추가한다(단계 0 의 BPMN 에는 아직 없다) | EDIT |

## 2. 데이터

스펙 3절. 표는 `TB_MDM_ERD_MODEL`, `_MODEL_VER`, `_EDITOR`, `_CMD_LOG`, `_DIAGRAM`, `_DIAGRAM_NODE`, `_CLAIM`.

## 3. 판정과 오류

스펙 4.2~4.5절. 거절 코드 `INVALID`·`CONFLICT`·`NOT_FOUND`·`NOT_EDITOR`·`NEEDS_CHOICE`.

## 4. 실시간 채널

`GET /api/mdm/erd/stream/{modelId}?session=&sinceRev=&source=` (`session` 은 필수, `sinceRev` 기본값은 -1, `source` 기본값은 `UI`. 포털 경유 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}`). 이벤트 `change`·`presence`·`claim`·`reload`·`ping`.
