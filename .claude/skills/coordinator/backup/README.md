# 퇴역한 bash 판 (참고용, 쓰지 않음)

2026-10-09 사용자 결정으로 조정자 스크립트는 node 판(`scripts/*.mjs`, `scripts/lib/*.mjs`)만 쓴다. 이 폴더는 그 전에 쓰던 bash 판을 원래 상대 경로 그대로 보관한 것이다.

- **실행 경로가 아니다.** SKILL.md·references·templates 와 node 스크립트는 이 폴더를 부르지 않는다.
- `backup/scripts/` : 옛 `scripts/*.sh`, `scripts/lib/*.sh`(스위치 다리 `js-bridge.sh` 포함)
- `backup/tests/` : 옛 bash 시험 `tests/*.sh` 와 bash 판·node 판 대조 하니스 `tests/js-parity/`
- 정본은 `scripts/*.mjs` 다. 동작을 확인할 때는 `node --test tests/` 를 쓴다.
- 되돌리려면 이 폴더로 옮긴 커밋을 git 이력에서 찾아 되돌린다(`git log --follow -- .claude/skills/coordinator/backup/scripts/coord-state.sh`).
- 윈도우 실기 확인은 2026-10 둘째 주에 한다. 경위는 `docs/superpowers/specs/2026-10-07-skills-windows-compat.md` §10.6.
