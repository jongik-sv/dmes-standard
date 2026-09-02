# 부속서 A. 식별자 사전 (Identifier Dictionary)

본 부속서는 화면 설계 시 사용하는 식별자(moduleId / moduleGroup / 화면식별자 / pageName / pageId / serviceId / 팝업 ID 체계 등)의 단일 정본이다. 긴 본문은 아래 장별 문서로 분리했다.

## 읽기 순서

| 상황 | 읽을 문서 |
|---|---|
| moduleId, moduleGroup, 화면 ↔ As-Is 매핑 | [A.1~A.3 모듈과 화면 식별자](identifier-dictionary/01-modules-and-screens.md) |
| screenId, pageName, pageId, serviceId, 필드/버튼/컬럼 명명 | [A.4~A.6 명명 컨벤션](identifier-dictionary/02-naming-conventions.md) |
| grep enum, Auto Manifest JSON, 인용 형식 | [A.7~A.10 자동화와 인용 정본](identifier-dictionary/03-grep-manifest-citation.md) |
| 가이드 선택 결정도, 테이블 명명, 디스패치 운영 | [A.11~A.13 결정도와 테이블 명명](identifier-dictionary/04-decision-table-dispatch.md) |

## 필수 규칙

- 본 부속서에 등재되지 않은 식별자를 임의 확정하지 않는다.
- 미등재 식별자는 `[확인필요]` 마커, 분석리포트 §13 등재, 본 부속서 PR 절차로 처리한다.
- 부속서 행 추가/수정/삭제 시 `등재일`, `등재 PR`, `사용 화면`을 명시한다.
- **한 모듈 내 같은 이름의 화면(`screenId`)은 두 개 이상 존재할 수 없다.** 설계·개발 중 동일한 Object(식별자·BPMN 파일명·FE 파일명 등)가 이미 존재함을 발견하면 **즉시 중단하고 사용자에게 질문**한다 ([§A.4.4.2 식별자 유일성](identifier-dictionary/02-naming-conventions.md)).
