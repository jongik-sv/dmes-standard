# mcm ADR 인덱스

본 폴더는 **mcm 모듈 안에서만 유효한 설계 결정**을 담는다. 번호는 mcm 모듈 독립 시퀀스로 `0001` 부터 매긴다.
다른 모듈에서 인용할 때는 번호만 쓰지 말고 경로 링크를 함께 쓴다
(예: `[mcm ADR-0001](../mcm/adr/0001-perm-model-v2.md)`).

번호 채번·필수 절·Status 표기·린트 규약은 [`adr-write` 스킬](../../../.claude/skills/adr-write/SKILL.md)이 정본이다.

- **위치**: 스킬 기본 위치는 `docs/{module}/design/adr/` 이지만, mcm 은 `docs/mdm/adr/` 와 같이 `docs/mcm/adr/` 에 둔다.
  `docs/mcm/design` 은 외부 링크 자리일 수 있어 그 안의 파일이 커밋되지 않을 수 있다.
- 도구 `index` 는 이 경로를 보지 못한다. 파일을 추가할 때 아래 표를 손으로 맞춘다. 검사는 파일 경로를 지정한 lint 로 한다.

  ```bash
  node .claude/skills/adr-write/scripts/adr_tool.mjs lint docs/mcm/adr/NNNN-{slug}.md
  ```

| 번호 | 제목 | Status | Date | 요약 |
|---|---|---|---|---|
| [0001](0001-perm-model-v2.md) | 퍼미션 모델 v2 — 역할×오브젝트 퍼미션 한 건 | PROPOSED | 2026-11-27 | 역할×오브젝트 퍼미션 한 건(BTN·POPUP·DATA 토큰)과 오브젝트 허용 값 교집합, SYSADMIN 행 없는 계산, 사용 안 함·유효 기간 제외(D35), 옛 표 공존과 `mcm.security.perm-model` 되돌리기, 작업대 초안·지문 충돌·적용 이력. |
