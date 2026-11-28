#!/usr/bin/env python3
"""DMES 공통 UI 컴포넌트 문서(references/components) 조회·생성·점검 도구.

PrimeReact 의 llms.txt / llms-full.txt 방식을 따른다.
  - components/llms.txt      : 컴포넌트 1개 = 한 줄(링크 + 용도). `index --write` 가 생성한다.
  - components/llms-full.txt : 모든 컴포넌트 문서 합본. `full --write` 가 생성한다.
  - components/<name>.md     : 컴포넌트별 사용 문서(사람이 쓴다).

  python3 ui_docs.py index                 # 색인 출력 (--write 로 llms.txt 갱신)
  python3 ui_docs.py get <이름>            # 컴포넌트 문서 출력 (파일명·제목·export 이름 모두 가능)
  python3 ui_docs.py full [--write]        # 합본 출력 / llms-full.txt 갱신
  python3 ui_docs.py coverage              # shared export 중 문서·제외 목록 어디에도 없는 것 + 생성물 최신 여부
  python3 ui_docs.py check-examples        # references/examples 를 m-mqc 설정으로 tsc + audit
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
COMP = SKILL / "references" / "components"
EXAMPLES = SKILL / "references" / "examples"
REPO = SKILL.parent.parent.parent
FRONT = REPO / "src" / "frontend"
SHARED = FRONT / "shared" / "src"

# 데이터 표(GROUPS·EXCLUDED·EXPORT_FILES)는 들고 있지 않는다 — 정본은 node 판 ui_docs.mjs 하나다.
# 시험 하네스(_ui_golden.mjs)가 node 판 표(실제 트리) 또는 고정 합성 표(합성 트리)를 UI_DOCS_DATA(JSON 파일)로 넘긴다.
_DATA = json.loads(Path(os.environ["UI_DOCS_DATA"]).read_text(encoding="utf-8"))
GROUPS: list[tuple[str, list[str]]] = [(t, list(n)) for t, n in _DATA["groups"]]
EXCLUDED: dict[str, str] = dict(_DATA["excluded"])
EXPORT_FILES: list[str] = list(_DATA["exportFiles"])


def doc_files() -> list[str]:
    return [n for _, names in GROUPS for n in names]


def read_doc(name: str) -> str:
    return (COMP / f"{name}.md").read_text(encoding="utf-8")


def title_and_summary(name: str) -> tuple[str, str]:
    lines = read_doc(name).splitlines()
    title = next((l[2:].strip() for l in lines if l.startswith("# ")), name)
    summary = ""
    seen_title = False
    for l in lines:
        if l.startswith("# "):
            seen_title = True
            continue
        if seen_title and l.strip():
            summary = l.strip()
            break
    return title, summary


def build_index() -> str:
    out = [
        "# DMES 공통 UI 컴포넌트 (MES 화면용)",
        "",
        "> 화면(m-*)은 `@dk-oasis/shared/*` 래퍼만 쓴다. Mantine·ag-grid 를 직접 import 하지 않는다.",
        "> 화면 전체 모양은 먼저 [화면 표준 골격](../screen-patterns.md)에서 유형을 고르고 예제를 복사한다.",
        "> 이 파일은 `python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py index --write` 가 생성한다. 직접 고치지 않는다.",
        "",
        "## 시작",
        "",
        "- [화면 표준 골격](../screen-patterns.md): 화면 유형(조회·조회+상세·그리드 편집·마스터-디테일·등록 팝업)을 고르고 고정값과 예제를 확인할 때 쓴다.",
        "- [Mantine 대응표](../mantine-catalog.md): Mantine 컴포넌트가 어떤 shared 래퍼로 감싸져 있는지, 래퍼가 없으면 무엇을 할지 확인할 때 쓴다.",
        "",
    ]
    for group, names in GROUPS:
        out += [f"## {group}", ""]
        for n in names:
            title, summary = title_and_summary(n)
            out.append(f"- [{title}]({n}.md): {summary}")
        out.append("")
    out += ["## 화면 문서에 싣지 않는 shared export", ""]
    for k, v in EXCLUDED.items():
        out.append(f"- `{k}`: {v}")
    out.append("")
    return "\n".join(out)


def build_full() -> str:
    parts = [build_index()]
    for n in doc_files():
        parts.append(f"\n\n<!-- ===== {n}.md ===== -->\n\n" + read_doc(n).strip() + "\n")
    return "".join(parts)


def find_doc(query: str) -> str | None:
    q = query.lower().removesuffix(".md")
    names = doc_files()
    for n in names:
        if n == q or n.replace("-", "") == q.replace("-", ""):
            return n
    for n in names:
        title, _ = title_and_summary(n)
        if q in title.lower().replace(" ", ""):
            return n
    for n in names:  # export 이름이 본문 import 줄에 있는 문서
        if re.search(rf"\b{re.escape(query)}\b", read_doc(n).split("## 언제 쓰나")[0]):
            return n
    return None


def shared_value_exports() -> dict[str, str]:
    found: dict[str, str] = {}
    for rel in EXPORT_FILES:
        p = SHARED / rel
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8")
        for m in re.finditer(r"export\s*\{([^}]*)\}", text):
            for item in m.group(1).split(","):
                item = item.strip()
                if not item or item.startswith("type "):
                    continue
                name = item.split(" as ")[-1].strip()
                found.setdefault(name, rel)
        for m in re.finditer(r"export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)", text):
            found.setdefault(m.group(1), rel)
    return found


def cmd_coverage() -> int:
    corpus = "\n".join(read_doc(n) for n in doc_files() if (COMP / f"{n}.md").exists())
    missing_docs = [n for n in doc_files() if not (COMP / f"{n}.md").exists()]
    bad = 0
    for n in missing_docs:
        print(f"문서 없음: components/{n}.md")
        bad += 1
    for name, rel in sorted(shared_value_exports().items()):
        if name in EXCLUDED:
            continue
        if not re.search(rf"\b{re.escape(name)}\b", corpus):
            print(f"미등재 export: {name}  ({rel}) → 문서에 쓰거나 ui_docs.py EXCLUDED 에 이유와 함께 넣는다")
            bad += 1
    for fname, builder in (("llms.txt", build_index), ("llms-full.txt", build_full)):
        p = COMP / fname
        if not missing_docs and (not p.exists() or p.read_text(encoding="utf-8") != builder()):
            print(f"생성물 낡음: components/{fname} → ui_docs.py {'index' if fname == 'llms.txt' else 'full'} --write")
            bad += 1
    print("coverage 통과" if bad == 0 else f"coverage 문제 {bad}건")
    return 0 if bad == 0 else 1


def cmd_check_examples() -> int:
    host = FRONT / "m-mqc"
    tsc = host / "node_modules" / ".bin" / "tsc"
    if not tsc.exists():
        print(f"tsc 없음: {tsc} (pnpm install 필요)")
        return 1
    work = host / ".skillcheck"
    cfg = host / "tsconfig.skillcheck.json"
    try:
        if work.exists():
            shutil.rmtree(work)
        shutil.copytree(EXAMPLES, work)
        cfg.write_text(
            '{ "extends": "./tsconfig.json", "compilerOptions": { "incremental": false, "plugins": [] },'
            ' "include": [".skillcheck/**/*"] }\n',
            encoding="utf-8",
        )
        r = subprocess.run([str(tsc), "--noEmit", "-p", str(cfg)], cwd=host)
        rc = r.returncode
        print("tsc 통과" if rc == 0 else "tsc 실패")
    finally:
        shutil.rmtree(work, ignore_errors=True)
        cfg.unlink(missing_ok=True)
    scripts = Path(__file__).resolve().parent
    for s in ("mantine_docs.py", "aggrid_docs.py"):
        rc |= subprocess.run([sys.executable, str(scripts / s), "audit", str(EXAMPLES)]).returncode
    return rc


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("index")
    p.add_argument("--write", action="store_true")
    p = sub.add_parser("get")
    p.add_argument("name")
    p = sub.add_parser("full")
    p.add_argument("--write", action="store_true")
    sub.add_parser("coverage")
    sub.add_parser("check-examples")
    a = ap.parse_args()

    if a.cmd == "index":
        text = build_index()
        if a.write:
            (COMP / "llms.txt").write_text(text, encoding="utf-8")
            print(f"갱신: {COMP / 'llms.txt'}")
        else:
            print(text)
        return 0
    if a.cmd == "get":
        n = find_doc(a.name)
        if not n:
            print(f"문서 없음: {a.name}. `ui_docs.py index` 로 목록을 본다.")
            return 1
        print(read_doc(n))
        return 0
    if a.cmd == "full":
        text = build_full()
        if a.write:
            (COMP / "llms-full.txt").write_text(text, encoding="utf-8")
            print(f"갱신: {COMP / 'llms-full.txt'} ({len(text.splitlines())}줄)")
        else:
            print(text)
        return 0
    if a.cmd == "coverage":
        return cmd_coverage()
    if a.cmd == "check-examples":
        return cmd_check_examples()
    return 1


if __name__ == "__main__":
    sys.exit(main())
