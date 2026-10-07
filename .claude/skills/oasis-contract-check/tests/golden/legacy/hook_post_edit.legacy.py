#!/usr/bin/env python3
"""PostToolUse 훅 — OASIS 관련 파일을 편집한 직후 계약 검사를 돌린다.

Claude Code 의 PostToolUse(Edit|Write) 에 물린다. stdin 으로 훅 입력 JSON 을 받아
편집 대상이 OASIS 관련 파일일 때만 검사기를 실행한다. 무관한 파일이면 아무것도
출력하지 않고 즉시 끝난다(무음).

ERROR 가 있으면 stdout 에 JSON 을 내어 모델 컨텍스트에 위반 내용을 주입한다.
차단(block)은 하지 않는다 — 편집 중간 상태에서 일시적으로 위반이 잡히는 것은
정상이고, 여기서 막으면 작업이 진행되지 않는다. 최종 게이트는 커밋 전 수동 실행이다.

Codex 에는 이에 대응하는 차단형 훅이 없다. Codex 로 작업할 때는 RULE.md
"무조건 적용하는 스킬" 표에 따라 커밋 전에 검사기를 직접 실행해야 한다.
"""

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHECKER = HERE / "check_oasis_contract.py"
REPO = HERE.parents[3]  # .claude/skills/oasis-contract-check/scripts -> repo root

MES_MODULES = ["mcm", "mls", "mqc", "mpp", "mas", "mcm-core"]
FE_MODULES = ["mcm", "mls", "mqc", "mpp", "mas"]


def is_relevant(path: str) -> bool:
    """편집 파일이 OASIS 계약 대상인지만 판정한다.

    모듈로 좁혀 검사하지 않는다 — Java 클래스와 짝 BPMN 이 다른 디렉터리에
    있기 때문이다(예: MasterCategoryMngService 는 `mcm-core`, 그 BPMN 은 `mcm`).
    `--module mcm-core` 로 좁히면 BPMN 0 건이 되어 검사가 조용히 무력화된다.
    전체 검사는 1.3 초 수준이라 그냥 전부 돈다.
    """
    p = path.replace("\\", "/")
    if "/build/" in p or "/node_modules/" in p or "/.next/" in p or "/dist/" in p:
        return False

    for m in MES_MODULES:
        if f"/src/backend/{m}/" in p and (p.endswith(".bpmn") or p.endswith(".java")):
            return True
    for m in FE_MODULES:
        if f"/src/frontend/m-{m}/" in p and (p.endswith(".ts") or p.endswith(".tsx")):
            return True
    return False


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool_input = payload.get("tool_input") or {}
    tool_response = payload.get("tool_response") or {}
    path = tool_response.get("filePath") or tool_input.get("file_path") or ""
    if not path:
        return 0

    if not is_relevant(path):
        return 0  # 무관한 파일 — 무음

    args = [sys.executable, str(CHECKER), "--root", str(REPO), "--json"]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=60)
        result = json.loads(r.stdout)
    except Exception as e:
        # 검사기가 죽어도 편집은 막지 않는다. 다만 조용히 넘기지는 않는다 —
        # 무음이 "위반 없음" 으로 오독되면 훅이 있으나 마나가 된다.
        print(
            json.dumps(
                {
                    "systemMessage": (
                        f"OASIS 계약 검사기 실행 실패 ({type(e).__name__}). "
                        "검사가 수행되지 않았으므로 위반 여부는 확인되지 않았다."
                    )
                },
                ensure_ascii=False,
            )
        )
        return 0

    errors = [f for f in result.get("findings", []) if f["severity"] == "ERROR"]
    if not errors:
        return 0

    lines = [f"OASIS 계약 위반 {len(errors)} 건 (편집: {Path(path).name})", ""]
    for f in errors[:10]:
        lines.append(f"[{f['rule']}] {f['target']}")
        lines.append(f"  {f['detail']}")
    if len(errors) > 10:
        lines.append(f"... 외 {len(errors) - 10} 건")
    lines.append("")
    lines.append(
        "정본: docs/guide/BackEnd/standard-v2/backend-standard/"
        "02-structure-naming-constraints.md §6-B~6-E · "
        "조치는 oasis-contract-check 스킬 SKILL.md §2 참조."
    )
    detail = "\n".join(lines)

    print(
        json.dumps(
            {
                "systemMessage": f"OASIS 계약 위반 {len(errors)} 건 — 커밋 전 수정 필요",
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": detail,
                },
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
