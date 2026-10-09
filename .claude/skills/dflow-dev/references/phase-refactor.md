# Phase 05 — Refactor (선택)

`/dflow-dev` Refactor 서브에이전트가 읽는 파일 (supervised 만 — 무인 실행에서는 안 띄움). commit·읽기·병렬 조사·포그라운드·무거운 명령·토큰 규칙 = 프롬프트(phase-prompt.md 템플릿).

- 동작 변경 금지 — 중복·네이밍·구조만. 끝나면 전체 스위트 재실행, 기준선 회귀 = 실패 (이때 Refactor commit 만 되돌림. Build 산출물은 commit 경계로 보호됨).
- 고칠 것 없으면 commit 없이 보고. 그때 Refactor 게이트는 안 돎.
- 테스트 삭제·skip 으로 초록 만들기 금지. 테스트 총수 감소 = 게이트 실패.
