# 강제 진행 스텁 — 승격 관문 훅 예시

- 운영 branch(`.dflow` 의 `release_branch`)로 push 할 때만 스텁 표식 검사
- 위치: 대상 리포 `.githooks/pre-push` (또는 쓰는 훅 관리자)

```sh
#!/bin/sh
# pre-push: 운영 브랜치로 가는 push 에 FORCE-STUB 표식이 있으면 거부한다.
DFLOW=.claude/skills/dflow-work/scripts/dflow.mjs
REL=$(node "$DFLOW" branch release 2>/dev/null) || exit 0   # 설정이 없으면 관여하지 않는다
while read -r _local_ref _local_sha _remote_ref _remote_sha; do
  [ "$_remote_ref" = "refs/heads/${REL#origin/}" ] || continue
  node "$DFLOW" stub-check "$_local_sha" || { echo "운영 브랜치에 강제 진행 스텁이 남아 있다 — 스텁 제거 작업을 먼저 끝내라" >&2; exit 1; }
done
exit 0
```

- 개발 branch = 운영 branch 인 리포(종전 운영)는 이 훅으로 못 막음. `/dflow-merge` 가 merge 전에 같은 검사
