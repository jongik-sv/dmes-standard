# FrontEnd Guide Index

Frontend, portal, shared package, private npm registry 관련 가이드는 이 폴더에서 시작한다. 전체 작업 분기는 먼저 [`../../../RULE.md`](../../../RULE.md) 와 [`../README.md`](../README.md) 를 따른다.

## 읽기 순서

| 작업 | 먼저 읽을 문서 | 보조 문서 |
|---|---|---|
| Frontend 로컬 운영 규칙·UI 검증·중요 액션 UX | [`Local-Rules.md`](Local-Rules.md) | 본 인덱스 |
| Frontend 화면 구현 (APS/MES 공통) | [`FrontEnd_표준_통합_개발가이드_v2.md`](FrontEnd_표준_통합_개발가이드_v2.md) | 화면 모양은 [화면 표준 골격](../../../.claude/skills/mantine-aggrid-ui/references/screen-patterns.md)(유형별 예제·고정값), 화면별 기능/디자인설계서 |
| Portal 화면/메뉴/BFF 개발 | [`Portal-Development-Guide.md`](Portal-Development-Guide.md) | [`Portal-Menu-Role-Policy.md`](Portal-Menu-Role-Policy.md) |
| Portal 메뉴 역할 정책 | [`Portal-Menu-Role-Policy.md`](Portal-Menu-Role-Policy.md) | [`../Security/Security-Guide.md`](../Security/Security-Guide.md) |
| private npm / Verdaccio | [`Verdaccio-Guide.md`](Verdaccio-Guide.md) | [`../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md`](../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md) |
| MES 화면을 누가 만들어도 같은 모습이 나오게 하는 화면 유형별 골격·고정값·예제, shared 컴포넌트별 사용법 | [화면 표준 골격](../../../.claude/skills/mantine-aggrid-ui/references/screen-patterns.md) | [컴포넌트 색인 `llms.txt`](../../../.claude/skills/mantine-aggrid-ui/references/components/llms.txt), [Mantine 대응표](../../../.claude/skills/mantine-aggrid-ui/references/mantine-catalog.md) |
| Mantine 9 · ag-grid-community 사용법 확인, 옛 API 이관, UI 규칙 자동 점검 | [`mantine-aggrid-ui` 스킬](../../../.claude/skills/mantine-aggrid-ui/SKILL.md) | 본 인덱스 §자동 점검 |
| 새 화면·shared 공통 컴포넌트의 성능 설계 규칙·확인 절차·예산·측정 함정 | [`Screen-Performance-Guide.md`](Screen-Performance-Guide.md) | [측정 하네스](../../../scripts/perf/render/README.md), [MDM 렌더링 독립 검증](../../perf-render/mdm-findings-verification.md) |
| 화면 색·글꼴·크기·셸·토스트 등 시각 표준 | [`UI-Visual-Standard.md`](UI-Visual-Standard.md) | [`standard-v2/part-b-shared-policy.md`](standard-v2/part-b-shared-policy.md) §4, [`Local-Rules.md`](Local-Rules.md) §8 |
| 공통 UI 기반(전 모듈 횡단) 결정 근거 확인 | [전 모듈 ADR-0001: 공통 UI 기반 Mantine 9 채택과 그리드 ag-grid-community 유지](../adr/0001-ui-library-mantine9-aggrid.md) | [`standard-v2/part-b-shared-policy.md`](standard-v2/part-b-shared-policy.md) |

## 배치 기준

- Next.js, React, portal, shared, BFF route, frontend package, npm registry 문서는 이 폴더에 둔다.
- Backend Gradle/Nexus 발행까지 함께 다루는 문서는 [모듈 패키지 발행·소비 가이드](../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md), Backend+Frontend 서버 배포는 [DMES 통합 배포 가이드](../Operations/DMES-Deployment-Guide.md)처럼 Operations에 둔다.
- 인증/인가 정책처럼 BE/FE 양쪽에 걸친 문서는 루트 보안 문서에 둔다.

## 자동 점검

규칙의 정본은 이 폴더의 문서다. 그중 기계로 잡을 수 있는 규칙은 [`mantine-aggrid-ui` 스킬](../../../.claude/skills/mantine-aggrid-ui/SKILL.md)의 스크립트가 점검한다. 바꾼 파일만 넘겨서 커밋 전에 실행한다.

```bash
D=.claude/skills/mantine-aggrid-ui/scripts
python3 $D/mantine_docs.py audit <바꾼 파일·폴더>
python3 $D/aggrid_docs.py audit <바꾼 파일·폴더>
```

| 점검 항목 | 근거 규칙 |
|---|---|
| 화면(`m-*`)에서 `@mantine/*` 직접 import | [Part B §4-2·§17](standard-v2/part-b-shared-policy.md) |
| 화면에서 `ag-grid-react`·`ag-grid-community` 직접 import | [Part B §6](standard-v2/part-b-shared-policy.md) |
| 화면에서 원시 `<table>` 데이터 목록(`<thead>`) 사용 → `AgDataGrid` | [Part B §6](standard-v2/part-b-shared-policy.md) |
| `ag-grid-enterprise` 사용 | [전 모듈 ADR-0001](../adr/0001-ui-library-mantine9-aggrid.md) D2 |
| 화면 CSS 의 16진수·`rgb()` 색 | [UI-Visual-Standard §3](UI-Visual-Standard.md) |
| Mantine 8 이하 API, ag-grid 설치본 기준 deprecated 옵션 | 라이브러리 설치 버전(`.d.ts`) |

점검 규칙을 바꿀 때는 이 표와 스크립트를 함께 고친다.
