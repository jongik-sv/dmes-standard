#!/usr/bin/env python3
"""Flyway 마이그레이션 번호 채번·스캐폴딩 도구.

정본 규칙: src/backend/aps-core/src/main/resources/db/migration/mssql/README.md

핵심 불변식: **동일한 버전 번호는 양 dialect 에서 동일한 논리 변경을 가리킨다.**
번호는 mssql/ 과 sqlite/ 를 함께 본 뒤 두 곳 모두 비어 있는 번호로 정한다.
디렉터리별로 "다음 빈 번호" 를 따로 고르는 것이 V61/V62 드리프트의 원인이었다.

본 도구는 **검사기가 아니다**. 검사는 이미 다음 테스트들이 한다:
  - MigrationVersionIntegrityTest  — 방언 내 중복 번호 + sqlite 체인 실제 실행
  - CrossDialectVersionSyncTest    — V22+ 양 방언 버전 집합 일치(결번 대장 제외)
  - CleanLineageIntegrityTest      — 결번 재유입·placeholder 회귀
이 도구는 그 앞단, 즉 "번호를 잘못 고르는 것" 자체를 막는다.
"""

import argparse
import re
import sys
from pathlib import Path

MIGRATION_ROOTS = {
    "aps-core": "src/backend/aps-core/src/main/resources/db/migration",
    "mcm-core": "src/backend/mcm-core/src/main/resources/db/migration",
}

VERSION_RE = re.compile(r"^V(\d+)__(.+)\.sql$")


def find_repo_root(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / ".git").exists():
            return p
    return start


def scan(root: Path, module: str):
    """{dialect: {version: filename}} 을 준다. build 산출물은 제외한다."""
    base = root / MIGRATION_ROOTS[module]
    if not base.exists():
        return {}
    out = {}
    for d in sorted(base.iterdir()):
        if not d.is_dir():
            continue
        versions = {}
        for f in sorted(d.glob("V*.sql")):
            m = VERSION_RE.match(f.name)
            if m:
                versions[int(m.group(1))] = f.name
        out[d.name] = versions
    return out


def next_version(dialects) -> int:
    """양 방언 합집합의 최대값 + 1.

    방언별 max+1 을 따로 계산하면 안 된다 — 한쪽에만 있는 번호(방언 보정)를
    다른 쪽이 재사용해 같은 번호가 서로 다른 논리 변경을 가리키게 된다.
    """
    used = set()
    for versions in dialects.values():
        used |= set(versions)
    return (max(used) + 1) if used else 1


def cmd_status(root: Path, module: str) -> int:
    dialects = scan(root, module)
    if not dialects:
        print(f"[{module}] 마이그레이션 디렉터리를 찾지 못했다.", file=sys.stderr)
        return 2

    print(f"모듈: {module}")
    for name, versions in dialects.items():
        mx = max(versions) if versions else 0
        print(f"  {name:8s} {len(versions):3d} 개, 최대 V{mx}")

    if len(dialects) > 1:
        names = list(dialects)
        a, b = names[0], names[1]
        only_a = sorted(set(dialects[a]) - set(dialects[b]))
        only_b = sorted(set(dialects[b]) - set(dialects[a]))
        print()
        print("한쪽에만 있는 번호 (정당한 방언 결번일 수 있다 — 결번 대장 대조 필요):")
        print(f"  {a} 에만: {['V%d' % v for v in only_a] or '없음'}")
        print(f"  {b} 에만: {['V%d' % v for v in only_b] or '없음'}")
        print()
        print("  ※ 이 목록이 비어있지 않은 것 자체는 결함이 아니다.")
        print("     정당성 판정은 CrossDialectVersionSyncTest 의 KNOWN_GAP_LEDGER 가 한다.")

    nxt = next_version(dialects)
    print()
    print(f"다음 안전 번호: V{nxt}")
    if len(dialects) > 1:
        per = {n: (max(v) + 1 if v else 1) for n, v in dialects.items()}
        naive = [f"{n}={per[n]}" for n in per]
        if len(set(per.values())) > 1:
            print(f"  ⚠ 방언별로 따로 고르면 {', '.join(naive)} 가 되어 충돌한다. 반드시 V{nxt} 를 쓸 것.")
    return 0


HEADER_PAIR = """-- ============================================================
-- V{v}: {title}
-- ============================================================
--
-- 배경:
--   (왜 이 변경이 필요한지)
--
-- 대응: {other}/V{v}__{slug}.sql (동일 논리 변경)
-- ============================================================

"""

HEADER_SINGLE = """-- ============================================================
-- V{v}: {title} ({dialect} 전용 — {other} 는 V{v} 결번)
-- ============================================================
--
-- 배경:
--   (왜 이 변경이 {dialect} 에만 필요한지)
--   (반대쪽이 이미 목표 상태인 근거 — 어느 버전에서 도달했는지)
--
-- 결번 등재 필요 (3 곳 모두):
--   1. {other}/ 의 다음 번호 파일 헤더 주석
--   2. mssql/README.md "결번 대장" 표
--   3. CrossDialectVersionSyncTest.KNOWN_GAP_LEDGER
-- ============================================================

"""


def cmd_scaffold(root: Path, module: str, slug: str, dialect: str, title: str) -> int:
    dialects = scan(root, module)
    if not dialects:
        print(f"[{module}] 마이그레이션 디렉터리를 찾지 못했다.", file=sys.stderr)
        return 2

    if not re.fullmatch(r"[a-z0-9_]+", slug):
        print(f"slug 는 소문자·숫자·밑줄만 쓴다: {slug!r}", file=sys.stderr)
        return 2

    v = next_version(dialects)
    base = root / MIGRATION_ROOTS[module]
    available = list(dialects)

    targets = available if dialect == "both" else [dialect]
    for t in targets:
        if t not in available:
            print(f"방언 {t!r} 이 {module} 에 없다. 있는 것: {available}", file=sys.stderr)
            return 2

    title = title or slug.replace("_", " ")
    created = []
    for t in targets:
        other = [x for x in available if x != t]
        other_name = other[0] if other else "(없음)"
        if dialect == "both" and len(targets) > 1:
            body = HEADER_PAIR.format(v=v, title=title, other=other_name, slug=slug)
        else:
            body = HEADER_SINGLE.format(v=v, title=title, dialect=t, other=other_name)
        path = base / t / f"V{v}__{slug}.sql"
        if path.exists():
            print(f"이미 존재한다: {path}", file=sys.stderr)
            return 2
        path.write_text(body, encoding="utf-8")
        created.append(path.relative_to(root))

    print(f"V{v} 생성:")
    for c in created:
        print(f"  {c}")

    if dialect != "both" and len(available) > 1:
        other = [x for x in available if x != dialect][0]
        print()
        print(f"⚠ 단일 방언 마이그레이션이다. {other} 의 V{v} 를 결번으로 등재해야 한다 — 3 곳 모두:")
        print(f"  1. {other}/ 의 다음 번호 파일 헤더 주석에 사유")
        print("  2. mssql/README.md 의 '결번 대장' 표에 행 추가")
        print("  3. CrossDialectVersionSyncTest.KNOWN_GAP_LEDGER 에 등재")
        print("  (2 와 3 이 어긋나면 CrossDialectVersionSyncTest 가 실패한다)")
        print()
        print("  no-op 파일로 번호를 채우지 말 것 — 결번으로 남기는 것이 정본 규칙이다.")

    print()
    print("검증: ../gradlew :aps-core:test --tests '*Migration*' --tests '*CrossDialect*'")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Flyway 마이그레이션 채번·스캐폴딩")
    ap.add_argument("command", choices=["status", "scaffold"])
    ap.add_argument("--root", default=None, help="저장소 루트 (기본: .git 탐색)")
    ap.add_argument("--module", default="aps-core", choices=sorted(MIGRATION_ROOTS))
    ap.add_argument("--slug", help="scaffold: 파일명 slug (snake_case)")
    ap.add_argument("--title", default="", help="scaffold: 헤더 제목")
    ap.add_argument(
        "--dialect",
        default="both",
        help="scaffold: both(기본) | mssql | sqlite. 단일 방언은 결번 등재가 따라온다.",
    )
    args = ap.parse_args()

    root = Path(args.root).resolve() if args.root else find_repo_root(Path.cwd())

    if args.command == "status":
        return cmd_status(root, args.module)

    if not args.slug:
        print("scaffold 에는 --slug 가 필요하다.", file=sys.stderr)
        return 2
    return cmd_scaffold(root, args.module, args.slug, args.dialect, args.title)


if __name__ == "__main__":
    sys.exit(main())
