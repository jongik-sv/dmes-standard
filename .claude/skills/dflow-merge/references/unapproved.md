# /dflow-merge 승인 전 머지분 판정

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때는 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙인다(`_shared/platform-support.md` 「문서 속 인라인 jq」).

SKILL.md 「절차」 1번 로컬 스캔(전문 `references/sweep-scan.md`)의 넷째 칸이 `merged` 인 후보 (`--on-report` 가 `unapproved: true` 를 남기고 merge 한 작업) 가 있을 때만 읽음. 아래 "4번" = `merge-exec.md` 「4번 머지」.

## 승인 전 머지분 판정

재merge 금지. SKILL.md 「절차」 1번의 같은 show 출력으로 가름.

- `status=approved`: "승인 반영(이미 머지됨)". state.json 에서 `unapproved` 를 지우는 commit 하나만 기본 branch 에 올림
  - 4번의 merge 자리·push 실패 처리 그대로, `git merge` 단계만 없음
  - commit 메시지 `chore(<TSK>): approved (승인 전 머지분)`
  - merge 자리 state.json 에 표식이 이미 없으면 (`jq -e '.unapproved == true'` 거짓) commit 없이 건너뜀
- 마지막 completion 리포트 `review_action=reject`: "반려(머지됨): 되돌리기 또는 재작업 필요 (<review_note>)"
  - state.json 수정 금지. 되돌리기(`git revert`)는 스윕이 안 함 — 사람이 고름
  - 보고에 그 위에 쌓였을 수 있는 작업 붙임 = 다른 승인 전 merge 분 중, 그 작업의 첫 산출 commit 이 반려된 작업의 첫 산출 commit 을 조상으로 갖는 것
  ```bash
  git log origin/<기본브랜치> --grep='DFlow-Order: <order>' --format=%H | tail -n 1   # 각 작업의 첫 산출 커밋
  git merge-base --is-ancestor <반려된 작업의 첫 커밋> <다른 작업의 첫 커밋>        # 참이면 그 위에 쌓였을 수 있다
  ```
- `status=reported`: "승인 대기(머지됨)". 보고만
- 그 밖의 status (`claimed` 인데 반려 리포트 아님 등): "건너뜀(머지됨, 서버 <status>)"
- show 실패: "건너뜀(조회 실패)"
