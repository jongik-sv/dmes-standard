# {CLIENT} Frontend 표준 개발 가이드 V2

- 작성일: 2026-04-14
- 적용 대상: Agent, 개발자
- 적용 범위: Next.js 16 / React 19 / TypeScript 5 / pnpm monorepo (portal, shared, m-{moduleCode}...)
- 목적: 새 페이지·컴포넌트·API 호출을 만들 때 규칙과 템플릿을 한 곳에서 확인하고 이탈 없이 구현한다.
- RULE.md 라우팅 위치: 본 가이드는 APS/MES 공통 FE 정본이다. 상위 작업 분기와 업무 설계 정본은 각각 [Aps-Guide.md](../../aps/Aps-Guide.md), [Mes-Guide.md](../MES/Mes-Guide.md)를 따르되, Frontend 구현 규칙은 이 문서와 [Local-Rules.md](Local-Rules.md)를 우선한다.

이 문서는 Frontend 표준 개발 가이드의 허브다. 본문은 아래 문서로 분리했다.

## 읽기 순서

| 상황 | 읽을 문서 |
|---|---|
| 문서 사용 규칙, 작업 순서, 대상 패키지, 페이지 유형, 명명, import | [01. 규칙, 결정 항목, 파일 구조](standard-v2/frontend-standard/01-rules-decisions-files.md) |
| 금지 사항, 상태관리, 응답 매핑, 에러 처리, Grid/API body 규칙 | [02. 상태, 에러, API body](standard-v2/frontend-standard/02-state-error-api-body.md) |
| 케이스 선택, 범위 외 시나리오, 완료 체크리스트, 동적 메뉴 인프라 | [03. 케이스, 체크리스트, 메뉴 인프라](standard-v2/frontend-standard/03-cases-checklist-menu.md) |
| API 서비스, 페이지 본체, 재내보내기, 엔트리, tsup 템플릿 | [04. 표준 템플릿](standard-v2/frontend-standard/04-templates.md) |
| `@dk-oasis/shared` 허용 목록, import 경로, 금지 사항 | [Part B. shared 사용 정책](standard-v2/part-b-shared-policy.md) |
| **화면 모양(배치·버튼·그리드·상세 폼·메시지)을 정할 때** — 누가 만들어도 같은 모습이 나오게 하는 유형별 골격·고정값·타입 검사 통과 예제 | [화면 표준 골격](../../../.claude/skills/mantine-aggrid-ui/references/screen-patterns.md), 컴포넌트별 사용법 [`llms.txt`](../../../.claude/skills/mantine-aggrid-ui/references/components/llms.txt) |
| 처음 구현하거나 E2E 예시가 필요할 때 | [Part C. Master 페이지 Quick Sample](standard-v2/part-c-master-sample.md) |
| **m-mpn(APS) 개발 시** 로컬 공통 모듈(`src/_shared`·도메인 공통) 목록과 사용 규칙 | [Part D. m-mpn 공통 모듈 카탈로그](standard-v2/part-d-mpn-shared-catalog.md) |

## 필수 규칙

- shared 사용 시 Part B 의 경로와 상태를 따른다.
- Part B 에 없는 경로를 임의 추측하여 import 하지 않는다.
- 처음 적용 시 Part C 를 패턴 참고로 활용한다.
- m-mpn 화면·API 를 만들 때는 Part D 카탈로그를 먼저 검색하고, 카탈로그의 재구현 금지 목록(§4)을 지킨다. 공통 모듈을 신설하면 Part D 를 같은 커밋에서 갱신한다.
