# /dflow-merge push 실패

SKILL.md 「절차」 4번 5단계(전문 `references/merge-exec.md`)의 `git push` 가 실패했을 때만 읽음. 먼저 `git reset --keep <기록한 HEAD>` 로 되돌린 뒤
(임시 머지 워크트리면 `references/merge-worktree.md` 의 `reset --hard`) 출력 모양으로 가름. 승인 반영 commit
(`references/unapproved.md`)의 push 실패도 같음. 해소 머지(`--resolve`)는 `references/resolve.md` 8번 따름.

## push 실패

- 출력에 `non-fast-forward` 나 `fetch first` 있으면 경합. "push 실패(경합)" 보고, 스윕 멈춤. 다음 실행은 fetch 부터 다시.
- 그런 문구 없이 1 로 끝나면 훅 거부 (로컬 pre-push 훅은 고정 문구 없이 훅 출력과
  `failed to push some refs` 만 남김). "push 실패(훅)" 보고, 그 작업과 그 후손(3번의 스택 관계)만
  빼고 다음 후보로. 훅 거부 우회 금지.
- 그 밖의 실패(128 등 연결·권한 오류)는 "push 실패" 보고, 스윕 멈춤 (원인 모르는 실패에서 merge 계속 시도 금지).

`origin` 으로 리셋 금지.

스윕을 멈추는 경우에도 SKILL.md 「절차」 6번 보고(「방언 검증」 포함)와 임시 머지 워크트리 지우기는 함.
