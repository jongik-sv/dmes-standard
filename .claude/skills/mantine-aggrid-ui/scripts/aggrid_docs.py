#!/usr/bin/env python3
"""ag-grid-community 버전 맞춤 문서 조회 + 사용법 점검 도구.

ag-grid.com 의 llms.txt · `.md` 는 **최신 메이저**만 제공한다. 설치 버전 문서는
`/archive/{x.y.z}/{framework}-data-grid/{slug}/` HTML 로만 열리므로 텍스트로 바꿔 캐시한다.
슬러그 색인과 권장사항은 공식 스킬 ag-grid/skills(ag-dev) 의 references 를 쓴다.

  python3 aggrid_docs.py version                    # 설치된 ag-grid-community / react 버전
  python3 aggrid_docs.py search <단어...>            # 공식 슬러그 색인 검색
  python3 aggrid_docs.py get <slug> [--section 제목] [--version x.y.z] [--latest]
  python3 aggrid_docs.py types <이름>                # 설치 .d.ts 에서 옵션·인터페이스 정의 찾기
  python3 aggrid_docs.py recommendations            # 공식 ag-dev 권장사항(LLM 흔한 실수)
  python3 aggrid_docs.py audit <경로...>             # deprecated 옵션·금지 import 점검
  python3 aggrid_docs.py refresh                    # 캐시 비우기
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SITE = "https://www.ag-grid.com"
AGDEV_RAW = "https://raw.githubusercontent.com/ag-grid/skills/HEAD/skills/ag-dev/references/grid"
CACHE = Path(os.environ.get("AGGRID_DOCS_CACHE", Path.home() / ".cache" / "aggrid-docs"))
TTL_SECONDS = 7 * 24 * 3600
# ag-grid.com 은 기본 urllib UA 를 403 으로 막는다
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36"


def fetch(url: str, dest: Path, ttl: int = TTL_SECONDS) -> str | None:
    """성공하면 본문, 404 면 None. 네트워크 오류는 오래된 캐시로 대체한다."""
    if dest.exists() and time.time() - dest.stat().st_mtime < ttl:
        return dest.read_text(encoding="utf-8")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        if dest.exists():
            return dest.read_text(encoding="utf-8")
        sys.exit(f"[error] {url} 조회 실패: HTTP {exc.code}")
    except Exception as exc:
        if dest.exists():
            print(f"[warn] {url} 조회 실패({exc}) — 오래된 캐시 사용", file=sys.stderr)
            return dest.read_text(encoding="utf-8")
        sys.exit(f"[error] {url} 조회 실패: {exc}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(body, encoding="utf-8")
    return body


def find_package(name: str) -> Path | None:
    """cwd 에서 위로 올라가며 node_modules/<name> 을 찾고, 없으면 pnpm 저장소(.pnpm)를 본다."""
    here = Path.cwd().resolve()
    bases = [b for a in [here, *here.parents] for b in (a, a / "src" / "frontend")]
    for base in bases:
        direct = base / "node_modules" / name / "package.json"
        if direct.exists():
            return direct.parent
        pnpm = base / "node_modules" / ".pnpm"
        if pnpm.is_dir():
            hits = sorted(pnpm.glob(f"{name}@*/node_modules/{name}/package.json"))
            if hits:
                return hits[-1].parent
    return None


def installed_version() -> str:
    pkg = find_package("ag-grid-community")
    if not pkg:
        sys.exit("[error] ag-grid-community 설치본을 찾지 못했다. src/frontend 안에서 실행하거나 --version 을 준다.")
    return json.loads((pkg / "package.json").read_text())["version"]


def cmd_version(_: argparse.Namespace) -> None:
    for name in ("ag-grid-community", "ag-grid-react", "ag-grid-enterprise"):
        pkg = find_package(name)
        print(f"{name}: {json.loads((pkg / 'package.json').read_text())['version'] if pkg else '(없음)'}"
              + (f"  [{pkg}]" if pkg else ""))


def load_index() -> list[tuple[str, str]]:
    """ag-dev documentation-index.md 의 `- 설명 `slug`` 줄을 (slug, 설명) 으로 읽는다."""
    text = fetch(f"{AGDEV_RAW}/documentation-index.md", CACHE / "agdev" / "documentation-index.md") or ""
    rows = []
    for line in text.splitlines():
        m = re.match(r"^\s*-\s*(.*?)`([a-z0-9-]+)`\s*$", line)
        if m:
            rows.append((m[2], m[1].strip()))
    return rows


def cmd_search(args: argparse.Namespace) -> None:
    terms = [t.lower() for t in args.terms]
    scored = []
    for slug, desc in load_index():
        hay = f"{slug} {desc}".lower()
        score = sum(t in hay for t in terms)
        if score:
            scored.append((-score, slug, desc))
    for neg, slug, desc in sorted(scored)[: args.limit]:
        mark = "" if -neg == len(terms) else f"  ({-neg}/{len(terms)} 단어)"
        print(f"{slug:<40} {desc}{mark}")
    if not scored:
        print("일치 없음. 단어를 바꾸거나 `types` 로 설치 타입에서 찾는다.")


def enterprise_flag(slug: str, fw: str) -> str:
    """최신 .md 머리말의 enterprise 표시. 기능의 Enterprise 여부는 버전이 바뀌어도 거의 유지된다."""
    md = fetch(f"{SITE}/{fw}-data-grid/{slug}.md", CACHE / "latest" / fw / f"{slug}.md")
    if md is None:
        return "Enterprise: 판별 불가(최신 문서에 없음)"
    head = md.split("\n---", 1)[0] if md.startswith("---") else ""
    return "Enterprise: **예** — DMES 사용 불가(ADR-0001)" if re.search(r"^enterprise:\s*true", head, re.M) \
        else "Enterprise: 아니오(community)"


def html_to_text(page: str) -> str:
    m = re.search(r"<main.*?</main>", page, re.S)
    s = m.group(0) if m else page
    s = re.sub(r"<(script|style|svg|nav|button)[^>]*>.*?</\1>", "", s, flags=re.S)
    s = re.sub(r"<pre[^>]*>", "\n```\n", s).replace("</pre>", "\n```\n")
    s = re.sub(r"<h([1-6])[^>]*>", lambda h: "\n" + "#" * int(h[1]) + " ", s)
    s = re.sub(r"<code[^>]*>", "`", s).replace("</code>", "`")
    s = re.sub(r"<br\s*/?>|</p>|</li>|</h[1-6]>|</tr>|</div>", "\n", s)
    s = re.sub(r"<li[^>]*>", "- ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("Copy Link", "")
    # <pre> 안의 `code` 표시는 되돌린다
    s = re.sub(r"```\n`(.*?)`\n```", lambda c: f"```\n{c[1]}\n```", s, flags=re.S)
    s = re.sub(r"\n\s*\n+", "\n\n", s).strip()
    h1 = re.search(r"^# ", s, re.M)
    return s[h1.start():] if h1 else s


def cmd_get(args: argparse.Namespace) -> None:
    fw = args.framework
    if args.latest:
        text = fetch(f"{SITE}/{fw}-data-grid/{args.slug}.md", CACHE / "latest" / fw / f"{args.slug}.md")
        if text is None:
            sys.exit(f"[error] 최신 문서에도 '{args.slug}' 가 없다. `search` 로 slug 를 확인한다.")
        label = "최신(llms .md)"
    else:
        ver = args.version or installed_version()
        cache = CACHE / "archive" / ver / fw / f"{args.slug}.txt"
        if cache.exists():
            text = cache.read_text(encoding="utf-8")
        else:
            page = fetch(f"{SITE}/archive/{ver}/{fw}-data-grid/{args.slug}/", CACHE / "raw.html", ttl=0)
            if page is None:
                sys.exit(f"[error] {ver} 문서에 '{args.slug}' 가 없다. 이 버전에 없는 기능일 가능성이 크다.\n"
                         f"        `get {args.slug} --latest` 로 도입 버전을 확인하되, 설치 버전 API 로만 구현한다.")
            text = html_to_text(page)
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(text, encoding="utf-8")
        label = f"archive {ver}"
    print(f"<!-- source: {label} / {fw} / {args.slug} | {enterprise_flag(args.slug, fw)} -->")
    if not args.section:
        print(text)
        return
    out, depth = [], None
    for line in text.splitlines():
        h = re.match(r"^(#{1,6})\s+(.*)", line)
        if h and depth is not None and len(h[1]) <= depth:
            depth = None
        if h and depth is None and args.section.lower() in h[2].lower():
            depth = len(h[1])
        if depth is not None:
            out.append(line)
    print("\n".join(out) if out else f"'{args.section}' 제목 없음. 제목 목록:\n"
          + "\n".join(l for l in text.splitlines() if l.startswith("#")))


def types_dir() -> Path:
    pkg = find_package("ag-grid-community")
    if not pkg:
        sys.exit("[error] ag-grid-community 설치본을 찾지 못했다.")
    return pkg / "dist" / "types" / "src"


def cmd_types(args: argparse.Namespace) -> None:
    """옵션·인터페이스 이름으로 .d.ts 정의와 바로 위 JSDoc 을 보여 준다."""
    pat = re.compile(rf"^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|class|const|function|abstract\s+class)?\s*{re.escape(args.name)}\b\??\s*[:<={{(]")
    shown = 0
    for f in sorted(types_dir().rglob("*.d.ts")):
        lines = f.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if pat.match(line):
                start = i
                while start > 0 and re.match(r"^\s*(\*|/\*\*)", lines[start - 1]):
                    start -= 1
                print(f"--- {f.relative_to(types_dir())}:{i + 1}")
                print("\n".join(lines[start: i + args.after + 1]))
                shown += 1
                if shown >= args.limit:
                    return
    if not shown:
        print(f"'{args.name}' 정의 없음 — 이 버전에 없는 API 일 수 있다.")


def cmd_recommendations(_: argparse.Namespace) -> None:
    print(fetch(f"{AGDEV_RAW}/recommendations.md", CACHE / "agdev" / "recommendations.md"))


def deprecated_props() -> dict[str, str]:
    """설치 버전 GridOptions·ColDef 의 @deprecated 속성 → 안내문."""
    out: dict[str, str] = {}
    for name in ("entities/gridOptions.d.ts", "entities/colDef.d.ts"):
        f = types_dir() / name
        if not f.exists():
            continue
        note = None  # 직전 JSDoc 블록의 @deprecated 문구
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("/**"):
                note = None
            d = re.search(r"@deprecated\s+(.*)", line)
            if d:
                note = d[1].replace("*/", "").strip()
                continue
            p = re.match(r"^\s*([a-zA-Z]+)\??\s*:", line)
            if p:
                if note:
                    out[p[1]] = note
                note = None
    return out


FIXED_RULES: list[tuple[str, str]] = [
    (r"from ['\"]ag-grid-enterprise['\"]|['\"]ag-grid-enterprise['\"]\s*:", "ag-grid-enterprise 금지 (DMES ADR-0001: community/MIT 만)"),
    (r"from ['\"]@ag-grid-(?:community|enterprise)/", "@ag-grid-community/* 스코프 패키지는 v32 에서 끊김 → ag-grid-community 단일 패키지"),
    (r"ag-grid-community/styles/ag-grid\.css|ag-theme-\w+\.css['\"]", "레거시 CSS 테마 import → v33 Theming API(DMES 는 grid.css 의 --ag-* 변수)"),
    (r"\bcolumnApi\b|\bgridOptions\.api\b|new Grid\(", "v31 이전 API(columnApi/new Grid) → GridApi · createGrid"),
    (r"rowSelection=\{?['\"](?:single|multiple)['\"]", "rowSelection 문자열은 v32.2 deprecated → { mode: 'singleRow'|'multiRow' }"),
]
SCREEN_IMPORT = re.compile(r"from ['\"](?:ag-grid-react|ag-grid-community)['\"]")
# 데이터 목록은 공용 AgDataGrid 하나로 그린다(Part B §6). 머리행(<thead>)이 있는 원시 표는 데이터 목록이다.
# 라벨-값 폼 배치 표는 <thead> 가 없어 걸리지 않는다.
SCREEN_TABLE_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"<thead\b"), "화면에서 원시 <table> 데이터 목록 금지 → AgDataGrid (작은 목록은 height=\"auto\", Part B §6)"),
]


def cmd_audit(args: argparse.Namespace) -> None:
    files: list[Path] = []
    for p in map(Path, args.paths):
        if p.is_dir():
            files += [f for f in p.rglob("*") if f.suffix in (".tsx", ".ts", ".jsx")
                      and not {"node_modules", ".next", "dist", "build"} & set(f.parts)]
        elif p.exists():
            files.append(p)
    deprecated = deprecated_props()
    dep_rx = re.compile(r"\b(" + "|".join(sorted(deprecated, key=len, reverse=True)) + r")\b\s*[:=]") if deprecated else None
    fixed = [(re.compile(rx), msg) for rx, msg in FIXED_RULES]
    issues = 0

    def report(f: Path, text: str, pos: int, msg: str) -> None:
        nonlocal issues
        print(f"{f}:{text.count(chr(10), 0, pos) + 1}: {msg}")
        issues += 1

    for f in files:
        text = f.read_text(encoding="utf-8", errors="ignore")
        uses_grid = "ag-grid" in text or "AgGridReact" in text or "ColDef" in text
        in_shared = "shared" in f.parts and "src" in f.parts
        for rx, msg in fixed:
            for m in rx.finditer(text):
                report(f, text, m.start(), msg)
        if not in_shared:
            for m in SCREEN_IMPORT.finditer(text):
                report(f, text, m.start(), "화면에서 ag-grid 직접 import 금지 → @dk-oasis/shared/grid (Part B §6)")
            if f.suffix in (".tsx", ".jsx"):
                for rx, msg in SCREEN_TABLE_RULES:
                    for m in rx.finditer(text):
                        report(f, text, m.start(), msg)
        if dep_rx and uses_grid:
            for m in dep_rx.finditer(text):
                name, note = m[1], deprecated[m[1]]
                # `rowSelection.isRowSelectable` 처럼 같은 이름으로 옮겨 간 속성은 객체 키(`name:`)로 쓰면 정상이다
                moved_same_name = re.search(rf"`\w+\.{name}\b", note)
                if moved_same_name and m.group(0).rstrip().endswith(":"):
                    continue
                report(f, text, m.start(), f"`{name}` deprecated: {note}")
    print(f"\n{len(files)}개 파일 점검, 의심 {issues}건 (deprecated 기준: 설치본 {len(deprecated)}개 속성)"
          + ("" if issues else " — 통과"))
    sys.exit(1 if issues else 0)


def cmd_refresh(_: argparse.Namespace) -> None:
    shutil.rmtree(CACHE, ignore_errors=True)
    print(f"캐시 삭제: {CACHE}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("version").set_defaults(fn=cmd_version)
    s = sub.add_parser("search"); s.add_argument("terms", nargs="+"); s.add_argument("--limit", type=int, default=30)
    s.set_defaults(fn=cmd_search)
    g = sub.add_parser("get"); g.add_argument("slug"); g.add_argument("--section"); g.add_argument("--version")
    g.add_argument("--framework", default="react", choices=["react", "javascript", "angular", "vue"])
    g.add_argument("--latest", action="store_true"); g.set_defaults(fn=cmd_get)
    t = sub.add_parser("types"); t.add_argument("name"); t.add_argument("--after", type=int, default=3)
    t.add_argument("--limit", type=int, default=5); t.set_defaults(fn=cmd_types)
    sub.add_parser("recommendations").set_defaults(fn=cmd_recommendations)
    a = sub.add_parser("audit"); a.add_argument("paths", nargs="+"); a.set_defaults(fn=cmd_audit)
    sub.add_parser("refresh").set_defaults(fn=cmd_refresh)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
