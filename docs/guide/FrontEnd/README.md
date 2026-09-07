# FrontEnd Guide Index

Frontend, portal, shared package, private npm registry 관련 가이드는 이 폴더에서 시작한다. 전체 작업 분기는 먼저 [`../../../RULE.md`](../../../RULE.md) 와 [`../README.md`](../README.md) 를 따른다.

## 읽기 순서

| 작업 | 먼저 읽을 문서 | 보조 문서 |
|---|---|---|
| Frontend 로컬 운영 규칙·UI 검증·중요 액션 UX | [`Local-Rules.md`](Local-Rules.md) | 본 인덱스 |
| Frontend 화면 구현 (APS/MES 공통) | [`FrontEnd_표준_통합_개발가이드_v2.md`](FrontEnd_표준_통합_개발가이드_v2.md) | 화면별 기능/디자인설계서 |
| Portal 화면/메뉴/BFF 개발 | [`Portal-Development-Guide.md`](Portal-Development-Guide.md) | [`Portal-Menu-Role-Policy.md`](Portal-Menu-Role-Policy.md) |
| Portal 메뉴 역할 정책 | [`Portal-Menu-Role-Policy.md`](Portal-Menu-Role-Policy.md) | [`../Security/Security-Guide.md`](../Security/Security-Guide.md) |
| private npm / Verdaccio | [`Verdaccio-Guide.md`](Verdaccio-Guide.md) | [`../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md`](../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md) |
| 공통 UI 기반(전 모듈 횡단) 결정 근거 확인 | [전 모듈 ADR-0001: 공통 UI 기반 Mantine 9 채택과 그리드 ag-grid-community 유지](../adr/0001-ui-library-mantine9-aggrid.md) | [`standard-v2/part-b-shared-policy.md`](standard-v2/part-b-shared-policy.md) |

## 배치 기준

- Next.js, React, portal, shared, BFF route, frontend package, npm registry 문서는 이 폴더에 둔다.
- Backend Gradle/Nexus 발행까지 함께 다루는 문서는 [모듈 패키지 발행·소비 가이드](../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md), Backend+Frontend 서버 배포는 [DMES 통합 배포 가이드](../Operations/DMES-Deployment-Guide.md)처럼 Operations에 둔다.
- 인증/인가 정책처럼 BE/FE 양쪽에 걸친 문서는 루트 보안 문서에 둔다.
