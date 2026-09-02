# {CLIENT} MES BPMN 프로세스 설계 표준 가이드 V1

BPMN설계서 작성 규칙의 허브다. 긴 통합본 본문은 아래 장별 문서로 분리했다.

## 읽기 순서

| 상황 | 읽을 문서 |
|---|---|
| 문서 구성, 공통 원칙, 산출물 위치, 적용 범위, 선행 입력 | [01. 개요와 입력 자료](bpmn-design/01-overview-and-input.md) |
| BPMN 구조, 액션/API 패턴, 권한, 명명, 핵심 일치 규칙 | [02. API와 흐름 규칙](bpmn-design/02-api-flow-rules.md) |
| 금지사항, 템플릿 규칙, 작성 규칙, 개발가이드 연계, 체크리스트 | [03. 작성 규칙과 체크리스트](bpmn-design/03-writing-checklist.md) |
| BPMN설계서 템플릿 참조와 Quick Sample | [04. 템플릿과 샘플](bpmn-design/04-template-and-sample.md) |

## 필수 규칙

- 기능설계서와 디자인설계서의 action, 권한, 상태, API body와 BPMN설계서를 1:1로 맞춘다.
- OASIS 단일 BPMN과 Phase 7 분리 패턴은 자동 판정 기준을 따른다.
- BPMN 구현 단계에서는 BackEnd 표준 가이드 Part B와 정합해야 한다.
