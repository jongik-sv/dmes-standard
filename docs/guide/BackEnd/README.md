# BackEnd Guide Index

Backend 구현과 Spring/OASIS/MCM core 관련 가이드는 이 폴더에서 시작한다. 전체 작업 분기는 먼저 [`../../../RULE.md`](../../../RULE.md) 와 [`../README.md`](../README.md) 를 따른다.

## 읽기 순서

| 작업 | 먼저 읽을 문서 | 보조 문서 |
|---|---|---|
| MES OASIS/BPMN Backend 구현 | [`BackEnd_표준_통합_개발가이드_v2.md`](BackEnd_표준_통합_개발가이드_v2.md) | 화면별 BPMN설계서 |
| Backend 공통 구현 패턴·영속성·테스트·DB/Seed | [`Backend-Implementation-Guide.md`](Backend-Implementation-Guide.md) | [`Business-Logic-Guide.md`](Business-Logic-Guide.md) |
| 비즈니스 로직 구현 | [`Business-Logic-Guide.md`](Business-Logic-Guide.md) | 설계서/ADR |
| 새 코드를 둘 모듈 정하기 (`mcm-core` / `mcm/lib` / `mcm/api` / `mdm`) | [`02 §3-3 코드 배치 기준`](standard-v2/backend-standard/02-structure-naming-constraints.md#3-3-코드-배치-기준) | [ADR-0003](../adr/0003-mcm-core-library-split.md) |
| mcm-core 사이트 도입·확장 | [`Mcm-Core-Onboarding.md`](Mcm-Core-Onboarding.md) | mcm-core 모듈 소스 |

## 배치 기준

- Spring Boot, JPA/MyBatis, Entity/Repository/DTO/Service/Controller, BPMN/OASIS, backend security integration 문서는 이 폴더에 둔다.
- FE BFF/Next.js route 중심 문서는 `../FrontEnd/` 에 둔다.
- 보안 정책처럼 BE/FE 양쪽에 걸친 문서는 `../Security/Security-Guide.md` 처럼 Security에 둔다.
