#!/usr/bin/env python3
"""ADR 채번·스캐폴딩·린트 (전 모듈 공용).

규약 정본: docs/aps/design/adr/README.md

번호는 **모듈별 독립 시퀀스**다. 접두어를 붙이지 않는다 — 모듈마다 문서를 따로
관리하므로 디렉터리가 모듈을 구분한다. 따라서 `ADR-0001` 은 모듈 안에서만
일의적이다. 모듈 밖에서 인용할 때는 반드시 경로 링크를 함께 쓴다.

린트는 **신규 ADR 만** 규율한다 (사용자 결정 2026-07-20). 기존 문서는 손대지 않는다 —
APS 59 건 중 35 건이 Status 칸에 산문을 담고 있으나 소급 정리하지 않는다.
"""

import argparse
import re
import sys
from pathlib import Path

ADR_REL = "docs/{module}/design/adr"

# 규약 순서대로. (헤딩, 필수여부)
REQUIRED_SECTIONS = [
    ("## 쉬운 설명 (현업용 요약)", True),
    ("## Context (배경)", True),
    ("## Decision (결정)", True),
    ("## Consequences (결과)", True),
    ("## Alternatives Considered (대안)", True),
    ("## Trigger (PROPOSED 인 경우만)", False),  # PROPOSED 일 때만 필수
    ("## References", True),
]

STATUS_ENUM = ["PROPOSED", "ACCEPTED", "REJECTED", "DEPRECATED"]
STATUS_SUPERSEDED = re.compile(r"^SUPERSEDED by ADR-\d{4}$")

FILENAME_RE = re.compile(r"^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$")
TITLE_RE = re.compile(r"^# ADR-(\d{4}): (.+)$", re.M)
STATUS_LINE_RE = re.compile(r"^-\s+\*\*Status\*\*:\s*(.+?)\s*$", re.M)


def find_repo_root(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / ".git").exists():
            return p
    return start


def adr_dir(root: Path, module: str) -> Path:
    return root / ADR_REL.format(module=module)


def scan(root: Path, module: str):
    """{번호: [Path, ...]} — 같은 번호에 부속 문서가 붙는 관행이 있어 리스트다."""
    d = adr_dir(root, module)
    out = {}
    if not d.exists():
        return out
    for f in sorted(d.glob("*.md")):
        if f.name == "README.md":
            continue
        m = FILENAME_RE.match(f.name)
        if m:
            out.setdefault(int(m.group(1)), []).append(f)
    return out


def cmd_status(root: Path, module: str) -> int:
    d = adr_dir(root, module)
    adrs = scan(root, module)
    print(f"모듈: {module}")
    print(f"경로: {d.relative_to(root) if d.exists() else str(d.relative_to(root)) + '  (아직 없음)'}")
    if not adrs:
        print("ADR 없음. 다음 번호: 0001")
        return 0
    nums = sorted(adrs)
    print(f"ADR {sum(len(v) for v in adrs.values())} 개 (번호 {len(nums)} 종), 최대 {nums[-1]:04d}")

    dup = {n: v for n, v in adrs.items() if len(v) > 1}
    if dup:
        print("\n같은 번호를 공유하는 파일 (본 ADR + 부속 문서 관행):")
        for n, v in sorted(dup.items()):
            print(f"  {n:04d}: {', '.join(f.name for f in v)}")

    gaps = [n for n in range(1, nums[-1]) if n not in adrs]
    if gaps:
        print(f"\n번호 공백: {['%04d' % g for g in gaps]}")

    print(f"\n다음 번호: {nums[-1] + 1:04d}")
    return 0


TEMPLATE = """# ADR-{num}: {title}

- **Status**: {status}
- **Date**: {date}
- **Decision Date**: —
- **Context Tags**: {tags}

## 쉬운 설명 (현업용 요약)

(현업 담당자가 기술 배경 없이 읽고 "무엇이 문제였고 무엇을 결정했는지" 를 이해할 수
있게 쓴다. 구현 용어·클래스명·코드 인용 금지. 구체적 예시 권장.)

## Context (배경)

## Decision (결정)

## Consequences (결과)

## Alternatives Considered (대안)

## Trigger (PROPOSED 인 경우만)

(어떤 데이터/조건이 모이면 ACCEPTED 로 전환할지 **검증 가능한 형태**로 쓴다.
"필요 시" 같은 모호한 표현 금지. ACCEPTED 로 발행하면 이 절을 지운다.)

## References
"""


def cmd_new(root: Path, module: str, slug: str, title: str, status: str, date: str, tags: str) -> int:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        print(f"slug 는 kebab-case 여야 한다: {slug!r}", file=sys.stderr)
        return 2
    if status not in ("PROPOSED", "ACCEPTED"):
        print("신규 발행 Status 는 PROPOSED 또는 ACCEPTED 만 쓴다.", file=sys.stderr)
        return 2

    d = adr_dir(root, module)
    adrs = scan(root, module)
    num = (max(adrs) + 1) if adrs else 1

    if not d.exists():
        d.mkdir(parents=True)
        print(f"디렉터리 생성: {d.relative_to(root)}")

    path = d / f"{num:04d}-{slug}.md"
    if path.exists():
        print(f"이미 존재한다: {path}", file=sys.stderr)
        return 2

    body = TEMPLATE.format(
        num=f"{num:04d}",
        title=title or slug.replace("-", " "),
        status=status,
        date=date or "YYYY-MM-DD",
        tags=tags or module.upper(),
    )
    if status == "ACCEPTED":
        # Trigger 절은 PROPOSED 전용이다.
        body = re.sub(r"## Trigger \(PROPOSED 인 경우만\)\n\n.*?\n\n(?=## References)", "", body, flags=re.S)

    path.write_text(body, encoding="utf-8")
    print(f"생성: {path.relative_to(root)}")
    print()
    print("다음 할 일:")
    print(f"  1. 본문 작성 — 쉬운 설명 절부터. 기술 상세는 그 뒤에 둔다")
    print(f"  2. {d.relative_to(root)}/README.md 인덱스 표에 행 추가")
    print(f"  3. 확정(PROPOSED→ACCEPTED) 전 팀 에이전트 적대적 검토")
    print(f"  4. 린트: adr_tool.py lint {path.relative_to(root)}")
    return 0


def lint_file(path: Path, root: Path):
    """(errors, warnings) 를 준다."""
    errors, warnings = [], []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")

    m = FILENAME_RE.match(path.name)
    if not m:
        errors.append(f"파일명이 NNNN-{{kebab-case-slug}}.md 형식이 아니다")
        num = None
    else:
        num = m.group(1)

    tm = TITLE_RE.search(text)
    if not tm:
        errors.append("제목 줄이 `# ADR-NNNN: {제목}` 형식이 아니다")
    elif num and tm.group(1) != num:
        errors.append(f"제목의 번호(ADR-{tm.group(1)})가 파일명 번호({num})와 다르다")

    sm = STATUS_LINE_RE.search(text)
    if not sm:
        errors.append("`- **Status**: ...` 헤더가 없다")
        status_val = None
    else:
        status_val = sm.group(1).strip()
        ok = status_val in STATUS_ENUM or STATUS_SUPERSEDED.match(status_val)
        if not ok:
            errors.append(
                f"Status 가 enum 이 아니다: {status_val!r}. "
                f"허용: {' | '.join(STATUS_ENUM)} | 'SUPERSEDED by ADR-XXXX'. "
                "구현 상태·개정 이력은 Status 가 아니라 본문에 쓴다"
            )

    for heading, required in REQUIRED_SECTIONS:
        present = heading in text
        if heading.startswith("## Trigger"):
            if status_val == "PROPOSED" and not present:
                errors.append("PROPOSED 인데 Trigger 절이 없다 (ACCEPTED 전환 조건 필수)")
            if status_val and status_val != "PROPOSED" and present:
                warnings.append("Trigger 절은 PROPOSED 전용이다. 확정됐으면 지운다")
            continue
        if required and not present:
            errors.append(f"필수 절 누락: {heading}")

    # 절 순서
    positions = [(h, text.find(h)) for h, _ in REQUIRED_SECTIONS if h in text]
    ordered = [h for h, _ in sorted(positions, key=lambda x: x[1])]
    expected = [h for h, _ in REQUIRED_SECTIONS if h in text]
    if ordered != expected:
        warnings.append(f"절 순서가 규약과 다르다. 규약 순서: {' → '.join(x.split('(')[0].strip() for x in expected)}")

    # 쉬운 설명 절에 구현 용어가 섞였는지 (약한 신호)
    em = re.search(r"## 쉬운 설명 \(현업용 요약\)(.*?)(?=\n## )", text, re.S)
    if em:
        seg = em.group(1)
        if re.search(r"`[A-Za-z_][A-Za-z0-9_]*\(\)|`[A-Z][a-zA-Z0-9]*(Service|Repository|Entity|Test)`", seg):
            warnings.append("쉬운 설명 절에 클래스명·메서드명으로 보이는 표기가 있다 (구현 용어 금지)")
        if len(seg.strip()) < 50:
            warnings.append("쉬운 설명 절이 비어 있거나 너무 짧다")

    return rel, errors, warnings


def cmd_lint(root: Path, module: str, paths, show_all: bool) -> int:
    targets = []
    if paths:
        targets = [Path(p).resolve() for p in paths]
    elif show_all:
        targets = [f for v in scan(root, module).values() for f in v]
    else:
        print(
            "린트 대상을 지정한다: 파일 경로들, 또는 --all (모듈 전체 현황).\n"
            "규율 대상은 신규 ADR 이다 — 기존 문서는 소급 정리하지 않는다.",
            file=sys.stderr,
        )
        return 2

    total_e = total_w = 0
    clean = 0
    for t in targets:
        if not t.exists():
            print(f"[없음] {t}")
            total_e += 1
            continue
        rel, errors, warnings = lint_file(t, root)
        if not errors and not warnings:
            clean += 1
            if not show_all:
                print(f"[OK] {rel}")
            continue
        print(f"\n{rel}")
        for e in errors:
            print(f"  [ERROR] {e}")
        for w in warnings:
            print(f"  [WARN ] {w}")
        total_e += len(errors)
        total_w += len(warnings)

    print(f"\n대상 {len(targets)} / 통과 {clean} / ERROR {total_e} / WARN {total_w}")
    if show_all and total_e:
        print("\n※ --all 은 현황 보고다. 기존 ADR 의 ERROR 는 소급 정리 대상이 아니다")
        print("   (사용자 결정 2026-07-20: 신규부터 규율).")
        return 0
    return 1 if total_e else 0


def cmd_index(root: Path, module: str) -> int:
    """README 인덱스와 파일 목록의 어긋남을 보고한다. 표를 재생성하지 않는다 —
    Status 열에 손으로 쌓은 서술이 있어 재생성은 그 내용을 파괴한다."""
    d = adr_dir(root, module)
    readme = d / "README.md"
    adrs = scan(root, module)
    if not adrs:
        print(f"[{module}] ADR 이 없다.")
        return 0
    if not readme.exists():
        print(f"[{module}] README.md 가 없다 — 인덱스 미비.", file=sys.stderr)
        return 1

    text = readme.read_text(encoding="utf-8")
    listed = set(int(x) for x in re.findall(r"^\|\s*(\d{4})\s*\|", text, re.M))
    files = set(adrs)

    missing = sorted(files - listed)
    ghost = sorted(listed - files)

    print(f"모듈: {module}  파일 {len(files)} 종 / 인덱스 {len(listed)} 행")
    if missing:
        print("\n인덱스에 없는 파일 (등재 필요):")
        for n in missing:
            for f in adrs[n]:
                print(f"  {n:04d}  {f.name}")
    if ghost:
        print("\n파일이 없는 인덱스 행 (유령):")
        for n in ghost:
            print(f"  {n:04d}")

    # 같은 번호에 파일이 여러 개면 인덱스 행 1 개로는 1 개만 가리킨다.
    # 나머지 k-1 개는 README 에 파일명으로 따로 언급돼야 한다.
    # (본 ADR 은 표에 번호로 등재되므로 파일명 미언급이 정상 — 번호로만 찾으면 오탐이다)
    orphan = []
    for n, v in adrs.items():
        if len(v) <= 1:
            continue
        named = [f for f in v if f.name in text]
        if len(named) < len(v) - 1:
            orphan += [f for f in v if f.name not in text]
    if orphan:
        print("\n한 번호에 파일이 여러 개인데 인덱스는 1 행뿐이라 가리키지 못하는 파일:")
        for f in orphan:
            print(f"  {f.name}")
        print("  → 아래 중 하나. (a) 부속 문서를 README 에 파일명으로 링크한다")
        print("     (b) 별도 번호를 부여한다")

    if not (missing or ghost or orphan):
        print("\n인덱스 정합 OK")
        return 0
    return 1


def main():
    ap = argparse.ArgumentParser(description="ADR 채번·스캐폴딩·린트 (전 모듈 공용)")
    ap.add_argument("command", choices=["status", "new", "lint", "index"])
    ap.add_argument("--root", default=None)
    ap.add_argument("--module", default="aps", help="aps | mcm | mls | mqc | mpp | mas ...")
    ap.add_argument("--slug", help="new: kebab-case 파일명 slug")
    ap.add_argument("--title", default="", help="new: ADR 제목")
    ap.add_argument("--status", default="PROPOSED", help="new: PROPOSED(기본) | ACCEPTED")
    ap.add_argument("--date", default="", help="new: 생성일 YYYY-MM-DD")
    ap.add_argument("--tags", default="", help="new: Context Tags")
    ap.add_argument("--all", action="store_true", help="lint: 모듈 전체 현황")
    ap.add_argument("paths", nargs="*", help="lint: 검사할 파일들")
    args = ap.parse_args()

    root = Path(args.root).resolve() if args.root else find_repo_root(Path.cwd())

    if args.command == "status":
        return cmd_status(root, args.module)
    if args.command == "index":
        return cmd_index(root, args.module)
    if args.command == "lint":
        return cmd_lint(root, args.module, args.paths, args.all)

    if not args.slug:
        print("new 에는 --slug 가 필요하다.", file=sys.stderr)
        return 2
    return cmd_new(root, args.module, args.slug, args.title, args.status, args.date, args.tags)


if __name__ == "__main__":
    sys.exit(main())
