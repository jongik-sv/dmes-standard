# Agent 화면 설계서 생성 지시서 V2 — 분석 강화본

이 문서는 MES 화면 설계 실행 지시서의 허브다. 긴 본문은 실행 단계별 문서로 분리했다.

## 읽기 순서

| 순서 | 문서 | 역할 |
|---:|---|---|
| 1 | [최우선 원칙, 게이트, Auto Manifest](agent-directive/01-principles-gates-manifest.md) | 산출물 게이트, 템플릿 잠금, R-14 Auto Manifest |
| 2 | [역할, 적용 범위, 입력값, 산출물](agent-directive/02-role-scope-input-output.md) | Agent 역할, MES/APS 범위, 입력 확인, 생성 순서 |
| 3 | [분석 프로토콜 개요](agent-directive/03-analysis-overview.md) | 자료 수집과 분석리포트 기본 구조 |
| 4 | [As-Is 화면 요소 전수 분석](agent-directive/04-analysis-ui-counting.md) | S/G/GE/B/GB/P/ST/LV 카운트 결정 규칙 |
| 5 | [결정성 가드와 SOP 30 Step](agent-directive/05-analysis-determinism-sop.md) | 반복 결정성, R11/R13, SOP 검증 |
| 6 | [소스, DB, 매핑, API 분석](agent-directive/06-analysis-source-db-api.md) | 소스 로직, DB/SQL, To-Be, API, 업무 규칙 |
| 7 | [템플릿, 작성 지시, 최종 응답](agent-directive/07-templates-writing-response.md) | 템플릿 사용, 설계서 작성 지시, 완료 기준 |
| 8 | [실행 프롬프트와 운영 패턴](agent-directive/08-prompt-operations-dispatch.md) | 실행 프롬프트, 운영 권장, 메인-워커 디스패치 |

## 최우선 원칙

- 분석리포트 없이 기능/디자인/BPMN 설계서를 작성하지 않는다.
- 기능/디자인/BPMN/정합체크는 분석리포트의 항목을 인용해야 하며 임의 추가를 금지한다.
- 정합체크서가 불일치 항목을 남기면 설계 완료로 판정하지 않는다.
