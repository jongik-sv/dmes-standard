#!/usr/bin/env python3
"""Mantine 9 LLM 문서 조회 + v9 사용법 점검 도구.

mantine.dev 가 배포하는 llms.txt(인덱스) · 페이지별 .md · llms-full.txt 를
~/.cache/mantine-llms/ 에 캐시해 두고 필요한 부분만 꺼내 본다.

  python3 mantine_docs.py version                  # 설치된 @mantine/* 버전
  python3 mantine_docs.py search <단어...>          # 인덱스에서 페이지 찾기
  python3 mantine_docs.py get <이름|slug> [--section Props]
  python3 mantine_docs.py grep <정규식> [-C 3]      # llms-full.txt 전문 검색
  python3 mantine_docs.py official <combobox|form|custom-components> [skill|api|patterns]
  python3 mantine_docs.py audit <경로...>           # v8 이하 API·금지 패턴 점검
  python3 mantine_docs.py refresh                  # 캐시 비우기
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://mantine.dev"
INDEX_URL = f"{BASE}/llms.txt"
FULL_URL = f"{BASE}/llms-full.txt"
OFFICIAL_RAW = "https://raw.githubusercontent.com/mantinedev/skills/HEAD/skills"
CACHE = Path(os.environ.get("MANTINE_LLMS_CACHE", Path.home() / ".cache" / "mantine-llms"))
TTL_SECONDS = 7 * 24 * 3600
INDEX_LINE = re.compile(r"^- \[(?P<title>[^\]]+)\]\((?P<url>[^)]+)\)(?::\s*(?P<desc>.*))?$")


def fetch(url: str, dest: Path, ttl: int = TTL_SECONDS) -> str:
    if dest.exists() and time.time() - dest.stat().st_mtime < ttl:
        return dest.read_text(encoding="utf-8")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mantine-ui-skill"})
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read().decode("utf-8")
    except Exception as exc:  # 네트워크가 막혀도 오래된 캐시는 쓴다
        if dest.exists():
            print(f"[warn] {url} 조회 실패({exc}) — 오래된 캐시 사용", file=sys.stderr)
            return dest.read_text(encoding="utf-8")
        sys.exit(f"[error] {url} 조회 실패: {exc}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(body, encoding="utf-8")
    return body


def load_index() -> list[dict]:
    text = fetch(INDEX_URL, CACHE / "llms.txt")
    section, rows = "", []
    for line in text.splitlines():
        if line.startswith("## "):
            section = line[3:].strip()
            continue
        m = INDEX_LINE.match(line.strip())
        if m and "/llms/" in m["url"]:
            slug = m["url"].rsplit("/", 1)[-1].removesuffix(".md")
            rows.append({"section": section, "title": m["title"], "slug": slug,
                         "url": m["url"], "desc": (m["desc"] or "").strip()})
    return rows


def cmd_version(_: argparse.Namespace) -> None:
    here = Path.cwd().resolve()
    bases = [b for a in [here, *here.parents] for b in (a, a / "src" / "frontend")]
    for base in bases:
        nm = base / "node_modules"
        pkgs = sorted((nm / "@mantine").glob("*/package.json")) if (nm / "@mantine").is_dir() else []
        if not pkgs and (nm / ".pnpm").is_dir():
            pkgs = sorted((nm / ".pnpm").glob("@mantine+*@*/node_modules/@mantine/*/package.json"))
        if pkgs:
            seen = {}
            for pj in pkgs:
                meta = json.loads(pj.read_text())
                seen.setdefault(meta["name"], set()).add(meta["version"])
            for name, vers in sorted(seen.items()):
                print(f"{name} {', '.join(sorted(vers))}")
            print(f"[{nm}]")
            return
    print("node_modules 에서 @mantine/* 를 찾지 못했다. 저장소 안에서 실행하거나 package.json 을 확인한다.")


def cmd_search(args: argparse.Namespace) -> None:
    terms = [t.lower() for t in args.terms]
    hits = [r for r in load_index()
            if all(t in f"{r['title']} {r['slug']} {r['desc']}".lower() for t in terms)]
    if args.section:
        hits = [r for r in hits if r["section"].lower() == args.section.lower()]
    for r in hits[: args.limit]:
        print(f"[{r['section']}] {r['title']:<28} {r['slug']:<40} {r['desc']}")
    if not hits:
        print("일치 없음. 단어를 줄이거나 `grep` 으로 전문 검색한다.")


def resolve(name: str) -> dict:
    rows = load_index()
    key = name.lower().removesuffix(".md")
    for pred in (lambda r: r["slug"] == key,
                 lambda r: r["title"].lower() == key,
                 lambda r: r["slug"] in (f"core-{key}", f"hooks-{key}", f"dates-{key}", f"x-{key}")):
        match = [r for r in rows if pred(r)]
        if match:
            return match[0]
    sys.exit(f"[error] '{name}' 페이지를 인덱스에서 찾지 못했다. `search {name}` 로 slug 를 확인한다.")


def cmd_get(args: argparse.Namespace) -> None:
    row = resolve(args.name)
    text = fetch(row["url"], CACHE / "pages" / f"{row['slug']}.md")
    if not args.section:
        print(text)
        return
    # 지정한 제목(## / ###)부터 같은 수준 이상의 다음 제목 전까지만 출력
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


def cmd_grep(args: argparse.Namespace) -> None:
    lines = fetch(FULL_URL, CACHE / "llms-full.txt").splitlines()
    pat = re.compile(args.pattern, re.I)
    shown = 0
    for i, line in enumerate(lines):
        if pat.search(line):
            lo, hi = max(0, i - args.C), min(len(lines), i + args.C + 1)
            print(f"--- L{i + 1}")
            print("\n".join(lines[lo:hi]))
            shown += 1
            if shown >= args.limit:
                print(f"... {args.limit}건에서 중단 (--limit 로 조정)")
                break


def cmd_official(args: argparse.Namespace) -> None:
    rel = "SKILL.md" if args.part == "skill" else f"references/{args.part}.md"
    name = f"mantine-{args.name}"
    print(fetch(f"{OFFICIAL_RAW}/{name}/{rel}", CACHE / "official" / name / rel))


# (정규식, 설명). JSX 태그는 여러 줄에 걸칠 수 있으므로 파일 전체에 DOTALL 로 건다.
TAG = r"<{name}\b(?:[^<>]|=>)*?"
V9_RULES: list[tuple[str, str]] = [
    (TAG.format(name="(?:Text|Anchor)") + r"\scolor=", "Text/Anchor `color` 제거 → `c`"),
    (TAG.format(name="Collapse") + r"\sin=", "Collapse `in` → `expanded`"),
    (TAG.format(name="Spoiler") + r"\sinitialState=", "Spoiler `initialState` → `defaultExpanded`"),
    (TAG.format(name="Grid") + r"\sgutter=", "Grid `gutter` → `gap` (rowGap/columnGap 도 있음)"),
    (TAG.format(name="Grid") + r"\soverflow=", "Grid `overflow=\"hidden\"` 불필요(네이티브 gap)"),
    (r"\bTypographyStylesProvider\b", "TypographyStylesProvider → Typography"),
    (r"\bpositionDependencies\b", "Popover/Tooltip `positionDependencies` 제거(자동 계산)"),
    (r"\b(?:zod|yup|joi|superstruct)Resolver\b", "@mantine/form 은 `schemaResolver`(Standard Schema) 사용"),
    (r"(?:const|let)\s+\w+\s*=\s*useHeadroom\(", "useHeadroom 은 `{ pinned, scrollProgress }` 객체 반환"),
    (r"\b(?:UseScrollSpyReturnType|StateHistory)\b", "hooks 타입명 변경(…ReturnValue / UseStateHistoryValue)"),
    # v7 이전 API — 학습 데이터에 흔히 섞여 나온다
    (r"\bcreateStyles\b|\bsx=\{", "v6 `createStyles`/`sx` 없음 → CSS modules · style props · Styles API"),
    (TAG.format(name="(?:Group|Stack|SimpleGrid)") + r"\sspacing=", "`spacing` → `gap`(Group/Stack) · SimpleGrid 는 `spacing`/`verticalSpacing` 확인"),
    (TAG.format(name="Group") + r"\sposition=", "Group `position` → `justify`"),
    (TAG.format(name="Group") + r"\snoWrap\b", "Group `noWrap` → `wrap=\"nowrap\"`"),
    (TAG.format(name="\\w+") + r"\s(?:leftIcon|rightIcon)=", "`leftIcon/rightIcon` → `leftSection/rightSection`"),
    (TAG.format(name="(?:TextInput|Select|MultiSelect|NumberInput|PasswordInput|Autocomplete|DateInput)") + r"\sicon=", "input `icon` → `leftSection`"),
    (r"<MediaQuery\b", "MediaQuery 컴포넌트 없음 → hiddenFrom/visibleFrom 또는 CSS"),
    (r"from ['\"]@emotion/", "Mantine 7+ 는 emotion 을 쓰지 않는다"),
]
SIMPLEGRID_OK = re.compile(r"<SimpleGrid\b")


def cmd_audit(args: argparse.Namespace) -> None:
    files: list[Path] = []
    for p in map(Path, args.paths):
        if p.is_dir():
            files += [f for f in p.rglob("*") if f.suffix in (".tsx", ".ts", ".jsx", ".css")
                      and not {"node_modules", ".next", "dist", "build"} & set(f.parts)]
        elif p.exists():
            files.append(p)
    compiled = [(re.compile(rx, re.S), msg) for rx, msg in V9_RULES]
    issues = 0
    for f in files:
        text = f.read_text(encoding="utf-8", errors="ignore")
        in_screen = any(part.startswith("m-") for part in f.parts)
        if f.suffix == ".css":
            # DMES: 화면 CSS 는 의미 토큰만 쓴다(UI-Visual-Standard §3). var(--x, #fallback) 폴백도 금지.
            if in_screen:
                for m in re.finditer(r"#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(", text):
                    line = text.count("\n", 0, m.start()) + 1
                    print(f"{f}:{line}: 화면 CSS 에 색 값 직접 사용 → 의미 토큰 var(--color-*) (UI-Visual-Standard §3)")
                    issues += 1
            continue
        # DMES: 화면 모듈(m-*)은 @mantine/* 를 직접 import 하지 않는다(Part B §4-2·§17). 호스트 root layout 은 예외.
        if in_screen and f.name != "layout.tsx":
            for m in re.finditer(r"from ['\"]@mantine/", text):
                print(f"{f}:{text.count(chr(10), 0, m.start()) + 1}: 화면에서 @mantine/* 직접 import 금지 → @dk-oasis/shared/* (Part B §17)")
                issues += 1
        for rx, msg in compiled:
            for m in rx.finditer(text):
                if msg.startswith("`spacing`") and SIMPLEGRID_OK.match(m.group(0)):
                    continue  # SimpleGrid 는 v9 에도 spacing 이 있다
                line = text.count("\n", 0, m.end()) + 1
                print(f"{f}:{line}: {msg}")
                issues += 1
    print(f"\n{len(files)}개 파일 점검, 의심 {issues}건" + ("" if issues else " — 통과"))
    sys.exit(1 if issues else 0)


def cmd_refresh(_: argparse.Namespace) -> None:
    shutil.rmtree(CACHE, ignore_errors=True)
    print(f"캐시 삭제: {CACHE}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("version").set_defaults(fn=cmd_version)
    s = sub.add_parser("search"); s.add_argument("terms", nargs="+"); s.add_argument("--section")
    s.add_argument("--limit", type=int, default=30); s.set_defaults(fn=cmd_search)
    g = sub.add_parser("get"); g.add_argument("name"); g.add_argument("--section"); g.set_defaults(fn=cmd_get)
    r = sub.add_parser("grep"); r.add_argument("pattern"); r.add_argument("-C", type=int, default=3)
    r.add_argument("--limit", type=int, default=20); r.set_defaults(fn=cmd_grep)
    o = sub.add_parser("official"); o.add_argument("name", choices=["combobox", "form", "custom-components"])
    o.add_argument("part", nargs="?", default="skill", choices=["skill", "api", "patterns"]); o.set_defaults(fn=cmd_official)
    a = sub.add_parser("audit"); a.add_argument("paths", nargs="+"); a.set_defaults(fn=cmd_audit)
    sub.add_parser("refresh").set_defaults(fn=cmd_refresh)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
