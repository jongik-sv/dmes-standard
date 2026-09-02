# docs/external/BP — BP 워크스페이스 로컬 미러

BP(bpgoat) 워크스페이스의 협의·분석·설계·회의록·BPMN·ERD 문서를
로컬로 내려받아 캐싱하는 자리다. 에이전트는 라이브 bp CLI 를 직접 조회하지 않고,
여기에 동기화된 미러를 Read/Grep 으로 읽는다.

## 최초 설정

저장소 루트의 `.bp-sync.json` 이 대상 워크스페이스와 미러 경로를 결정한다.
템플릿에는 placeholder 값이 들어 있으므로 신규 프로젝트에서 먼저 실제 값으로 바꾼다.

```json
{
  "workspaceId": "TODO-fill-in-bp-workspace-id",
  "workspaceName": "{CLIENT}",
  "outputDir": "docs/external/BP/{CLIENT}"
}
```

- `workspaceId` — bp 워크스페이스 ID (`bp` CLI 로 확인)
- `workspaceName` / `outputDir` 의 `{CLIENT}` — 고객사 식별자로 치환.
  저장소 전체가 같은 `{CLIENT}` 표기를 쓰므로 `RULE.md`·`.claude/skills/bp-*` 와 함께 일괄 치환한다.

## 동기화 방법

```bash
./tools/bp-sync --if-stale
```

`bp-workspace-sync` 스킬이 진입 규칙(설치·최신화 → 미러 동기화 → 미러 조회)의 정본이다.
에이전트는 라이브 bp CLI 를 직접 조회하지 않고 이 미러를 Read/Grep 으로 읽는다.
새 회의록·협의 문서가 올라왔을 때 설계에 반영하는 절차는 `bp-update-intake` 스킬을 따른다.

> 본 템플릿에는 실제 미러 내용이 없다 — 워크스페이스 문서는 전적으로 고객사 고유 자료이므로 제외했다.
> `deleteRemoved: true` 이므로 미러 디렉터리에 수기 파일을 두지 않는다. 동기화 시 삭제된다.
