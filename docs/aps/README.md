# docs/aps — 생산계획(APS) 모듈 문서

실 프로젝트에서 이 디렉터리는 APS(Advanced Planning & Scheduling) 모듈의 정본 문서를 담는다.
모듈 진입점(`README.md`)과 작업 목록(`TASKS.md`)·현재 진행 상황(`NOW.md`),
설계 결정 기록을 모으는 `design/adr/`, 개념·상세 설계 문서를 두는 `design/`,
데모 시나리오(`demo/`), 사용자 매뉴얼(`user-guide/`), 에이전트 작업 지침(`agent-guide/`),
현업 요구사항 원천(`user-requirements/`) 으로 구성된다.

본 템플릿에서는 실제 고객사 설계·요구사항 내용을 모두 제거하고
형식을 보여 주는 샘플 ADR 1건만 남겼다. 신규 프로젝트에서는
`adr-write` 스킬로 ADR 을 채번·발행하면서 이 디렉터리를 채워 나간다.

## 샘플

- [`design/adr/0000-sample-decision.md`](./design/adr/0000-sample-decision.md) — ADR 형식 예시

> ADR 표준 경로는 `docs/{module}/design/adr/NNNN-{kebab-slug}.md` 이며,
> 번호는 모듈별로 `0001` 부터 독립 채번한다. 정본 규약은
> `.claude/skills/adr-write/SKILL.md` 를 따른다.
