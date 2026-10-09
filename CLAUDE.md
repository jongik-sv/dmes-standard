# DMES 개발 지침 (APS · MES 라우터)

본 저장소의 모든 에이전트 작업 규칙은 [RULE.md](./RULE.md) 가 정본이다.
작업 착수 전 RULE.md 의 §"작업 분기 — 가이드 라우팅" 에서 단일 진입점을 선택해 따른다.

### 주요 동작 원칙
- RULE.md 에 정의된 모든 개발 규칙(분기 라우팅, 화면 설계시 규칙, 패키지 명명, URL 컨벤션) 을 준수한다.
- RULE.md 와 본 파일이 충돌하면 RULE.md 가 우선한다.

### 공통 컴포넌트 행동강령 (Frontend)
- 화면 작업 중 업무 도메인에 묶이지 않는 UI 부품(입력 칸·편집기·표시 부품·도구 막대 등)을 새로 만들면, 화면 폴더에 두지 않고 `@dk-oasis/shared` 공통 컴포넌트로 등록한다.
- 새 컴포넌트 등록은 사용자에게 묻지 않고 진행한다. 기존 shared 컴포넌트의 props·동작·모습을 바꾸는 일은 사용자 승인 뒤에 한다.
- 등록할 때는 같은 작업 안에서 `mantine-aggrid-ui` 스킬의 컴포넌트 문서와 색인까지 갱신한다.
- 판정 기준과 절차는 [Part B §18](docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md#18-새-공통-컴포넌트-등록) 이 정본이다.

### 문체
- 사용자 답변은 출력 스타일과 [사람용 작성 규칙](docs/guide/Common/Korean-STE-Writing-Guide.md)을 따른다.
- 스킬 문서, 레인 보고, 작업 메모는 [LLM 대화 문체](docs/guide/Common/Korean-STE-LLM-Guide.md)를 따른다. 레인 지시(조정자 → 레인)와 서브에이전트 지시·결과는 영어로 쓸 수 있다.
