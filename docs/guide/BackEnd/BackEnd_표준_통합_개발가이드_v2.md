# {CLIENT} MES BackEnd 표준 개발 가이드 V2

- 작성일: 2026-04-14
- 적용 대상: Agent, 개발자
- 적용 범위: cactus-core 1.0.14+ / OASIS 5.0 / Spring Boot 4.x / Java 21
- 목적: 사람이 읽어도 바로 개발 흐름을 이해하고, Agent가 그대로 따라도 일관된 산출물을 만들 수 있는 BackEnd 표준을 제공한다.

이 문서는 BackEnd 표준 개발 가이드의 허브다. 본문은 아래 문서로 분리했다.

## 읽기 순서

| 상황 | 읽을 문서 |
|---|---|
| 문서 사용 규칙, 작업 순서, 시작 전 결정 항목 | [01. 규칙과 결정 항목](standard-v2/backend-standard/01-rules-and-decisions.md) |
| **코드를 어느 모듈에 둘지** (`mcm-core` / `lib` / `api` / `mdm`) | [02 §3-3 코드 배치 기준](standard-v2/backend-standard/02-structure-naming-constraints.md#3-3-코드-배치-기준) |
| 표준 구조, 선택 기준, 명명 규칙, 금지 사항 | [02. 구조, 명명, 금지 사항](standard-v2/backend-standard/02-structure-naming-constraints.md) |
| Entity/Repository/DTO/Service/MyBatis 템플릿, 작성 규칙, BPMN 연계 | [03. 템플릿, 작성 규칙, BPMN 연계](standard-v2/backend-standard/03-templates-writing-bpmn.md) |
| 케이스 선택, 범위 외 시나리오, 완료 체크리스트, 동적 메뉴 인프라 | [04. 케이스, 체크리스트, 메뉴 인프라](standard-v2/backend-standard/04-cases-checklist-menu.md) |
| BPMN 작성 표준 | [Part B. BPMN 표준 개발 가이드](standard-v2/part-b-bpmn-standard.md) |
| cactus-core 공통 클래스, ErrorCode, import 경로 | [Part C. cactus-core 레퍼런스](standard-v2/part-c-cactus-core-reference.md) |
| 처음 구현하거나 E2E 예시가 필요할 때 | [Part D. Product 도메인 Quick Sample](standard-v2/part-d-product-sample.md) |

## 필수 규칙

- cactus-core 클래스 사용 시 Part C 의 import 경로를 따른다.
- ErrorCode 사용 시 Part C 의 카탈로그 외 임의 사용을 금지한다.
- 처음 적용하는 경우 Part D 를 참조 패턴으로 활용한다.
- MES OASIS/BPMN Backend 구현에서는 본 가이드가 [Backend-Implementation-Guide.md](Backend-Implementation-Guide.md) 보다 우선한다.
