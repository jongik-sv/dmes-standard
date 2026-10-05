# tooltip-screens 구조 변경 기록

이 레인은 대부분 props 추가(`MdmFieldLabel`·`meta`·`SearchField name`)라 구조 변경이 적다. 구조에 해당하는 것만 적는다.

## S1. 공지 화면의 캡션 우선순위 범위를 제목으로 좁힌다
- 커밋: 016cf356
- 바뀌기 전: `noticeMgmt/page.tsx` 의 진입점이 페이지 전체를 `MdmMetaProvider captionPriority="mdm"` 으로 감싸는 `NoticeMgmtPage` 래퍼였다.
- 바뀐 뒤: 래퍼를 없애고 `NoticeMgmtScreen` 이 진입점이 된다. 목록 그리드와 `NoticeTitleRow` 만 각각 `MdmMetaProvider captionPriority="mdm"` 으로 감싼다.
- 바꾼 이유: B1·B2 로 상세 th·검색칸이 컬럼 사전에 이어졌다. 페이지 전체가 mdm 우선순위이면 NEW 컬럼(NOTICE_*·CONTENT_FORMAT 등)이 등록되는 즉시 라벨 글자가 사전 캡션으로 바뀐다. 사용자가 글자 변경을 요청하지 않았으므로 제목(TITLE)에만 적용한다(조정 지시 tooltip-screens-6).
- 동작 보존 근거: m-mls vitest 5 파일·61 통과(notice-page-mdm·notice-mdm-render 가 제목 캡션 우선순위를 확인한다).
- 영향 범위: m-mls 공지 화면 하나. 제목 외 라벨은 `explicit`(화면 글자 그대로).
- 되돌리는 방법: 016cf356 revert.

## S2. TermDetailPane `Row` 도우미가 라벨 메타를 받는다
- 커밋: B1 m-mdm 커밋(20e26693)
- 바뀌기 전: `Row` 가 `label` 문자열만 받아 th 에 맨 글자로 그렸다.
- 바뀐 뒤: `Row` 가 `name`·`meta?: false`·`required` 를 받아 `MdmFieldLabel` 로 그린다(호출 10곳이 모두 이 도우미를 거친다).
- 동작 보존 근거: m-mdm 전체 vitest 통과, 공급자 밖에서는 단순 텍스트와 같은 DOM.
- 되돌리는 방법: 20e26693 revert.
