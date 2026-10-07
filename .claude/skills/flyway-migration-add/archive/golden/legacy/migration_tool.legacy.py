#!/usr/bin/env python3
"""Flyway 마이그레이션 번호 채번·스캐폴딩 도구 (방언 수 무관).

정본 규칙: 이 스킬의 SKILL.md (모듈에 `db/migration/README.md` 결번 대장이 있으면 그것도 정본).

핵심 불변식: **동일한 버전 번호는 모든 방언 폴더에서 동일한 논리 변경을 가리킨다.**
번호는 그 모듈의 모든 위치(방언 폴더 + 공통 폴더)를 함께 본 뒤 어디에도 없는 번호로 정한다.
폴더별로 "다음 빈 번호" 를 따로 고르는 것이 V61/V62 드리프트의 원인이었다.

폴더 해석:
  - 방언 폴더: oracle / postgresql / sqlite / mssql(=sqlserver) / h2 등 DB 제품 이름의 하위 폴더.
    Spring Boot `{vendor}` 자리표시자를 쓰면 이름이 oracle·postgresql·sqlite·sqlserver 가 된다.
  - 공통 폴더: 모듈 이름 폴더(예: aps-core/) 또는 common/. 방언 구분 없이 쓰는 위치다.

본 도구는 **검사기가 아니다**. 방언 간 버전 집합 일치 검사는 프로젝트 테스트
(예: CrossDialectVersionSyncTest + KNOWN_GAP_LEDGER)가 맡는다.
이 도구는 그 앞단, 즉 "번호를 잘못 고르는 것" 자체를 막는다.
"""

import argparse
import re
import sys
from pathlib import Path

# 모듈 이름 → 마이그레이션 루트 후보 (앞에서부터 처음 존재하는 것)
ROOT_CANDIDATES = (
    "src/backend/{m}/src/main/resources/db/migration",
    "src/backend/{m}/api/src/main/resources/db/migration",
)

KNOWN_DIALECTS = ("oracle", "postgresql", "sqlite", "mssql", "sqlserver", "h2", "mysql", "mariadb")
COMMON_NAMES = ("common",)

VERSION_RE = re.compile(r"^V(\d+)__(.+)\.sql$")


def find_repo_root(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / ".git").exists():
            return p
    return start


def has_sql(d: Path) -> bool:
    return any(d.glob("V*.sql"))


def migration_base(root: Path, module: str):
    """모듈의 마이그레이션 기준 폴더. `db/migration/{module}/{방언}/` 처럼 한 단 더 들어간 모양도 푼다."""
    for tpl in ROOT_CANDIDATES:
        base = root / tpl.format(m=module)
        if base.is_dir():
            inner = base / module
            if inner.is_dir() and not has_sql(inner) and any(
                c.is_dir() and has_sql(c) for c in inner.iterdir()
            ):
                return inner
            return base
    return None


def is_common(name: str, module: str) -> bool:
    return name == module or name in COMMON_NAMES


def scan(base: Path):
    """{folder: {version: filename}} 을 준다."""
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


def next_version(folders) -> int:
    """모든 위치 합집합의 최대값 + 1.

    방언별 max+1 을 따로 계산하면 안 된다 — 한쪽에만 있는 번호(방언 보정)를
    다른 쪽이 재사용해 같은 번호가 서로 다른 논리 변경을 가리키게 된다.
    """
    used = set()
    for versions in folders.values():
        used |= set(versions)
    return (max(used) + 1) if used else 1


def split(folders, module):
    dialects = {n: v for n, v in folders.items() if not is_common(n, module)}
    commons = {n: v for n, v in folders.items() if is_common(n, module)}
    return dialects, commons


def label(name: str, module: str) -> str:
    if is_common(name, module):
        return "공통"
    return "방언" if name in KNOWN_DIALECTS else "방언?"


def cmd_status(root: Path, module: str) -> int:
    base = migration_base(root, module)
    folders = scan(base) if base else {}
    if not folders:
        print(f"[{module}] 마이그레이션 디렉터리를 찾지 못했다.", file=sys.stderr)
        return 2

    print(f"모듈: {module}  ({base.relative_to(root)})")
    for name, versions in folders.items():
        mx = max(versions) if versions else 0
        print(f"  {name:12s} [{label(name, module)}] {len(versions):3d} 개, 최대 V{mx}")
    unknown = [n for n in folders if label(n, module) == "방언?"]
    if unknown:
        print(f"  ※ 알 수 없는 폴더 이름: {unknown} — 방언 폴더로 취급한다. 이름 예: {', '.join(KNOWN_DIALECTS[:4])}")

    dialects, _ = split(folders, module)
    if len(dialects) > 1:
        union = set().union(*dialects.values())
        print()
        print("방언별로 빠진 번호 (정당한 방언 결번일 수 있다 — 결번 대장 대조 필요):")
        for name, versions in dialects.items():
            missing = sorted(union - set(versions))
            print(f"  {name:12s} 에 없음: {['V%d' % v for v in missing] or '없음'}")
        print()
        print("  ※ 이 목록이 비어있지 않은 것 자체는 결함이 아니다.")
        print("     정당성 판정은 결번 대장(README)과 방언 간 버전 일치 테스트(KNOWN_GAP_LEDGER)가 한다.")

    nxt = next_version(folders)
    print()
    print(f"다음 안전 번호: V{nxt}")
    if len(folders) > 1:
        per = {n: (max(v) + 1 if v else 1) for n, v in folders.items()}
        if len(set(per.values())) > 1:
            naive = ", ".join(f"{n}={per[n]}" for n in per)
            print(f"  ⚠ 폴더별로 따로 고르면 {naive} 가 되어 충돌한다. 반드시 V{nxt} 를 쓸 것.")
    return 0


HEADER_ALL = """-- ============================================================
-- V{v}: {title}
-- ============================================================
--
-- 배경:
--   (왜 이 변경이 필요한지)
--
-- 대응: {others} (동일 논리 변경)
-- ============================================================

"""

HEADER_PARTIAL = """-- ============================================================
-- V{v}: {title} ({targets} 전용 — {others} 는 V{v} 결번)
-- ============================================================
--
-- 배경:
--   (왜 이 변경이 {targets} 에만 필요한지)
--   (나머지 방언이 이미 목표 상태인 근거 — 어느 버전에서 도달했는지)
--
-- 결번 등재 필요 (3 곳 모두):
--   1. {others} 각 폴더의 다음 번호 파일 헤더 주석
--   2. db/migration/README.md "결번 대장" 표
--   3. 방언 간 버전 일치 테스트의 KNOWN_GAP_LEDGER (테스트를 둔 프로젝트)
-- ============================================================

"""


def cmd_scaffold(root: Path, module: str, slug: str, dialect: str, title: str) -> int:
    base = migration_base(root, module)
    folders = scan(base) if base else {}
    if not folders:
        print(f"[{module}] 마이그레이션 디렉터리를 찾지 못했다.", file=sys.stderr)
        return 2

    if not re.fullmatch(r"[a-z0-9_]+", slug):
        print(f"slug 는 소문자·숫자·밑줄만 쓴다: {slug!r}", file=sys.stderr)
        return 2

    dialects, commons = split(folders, module)
    v = next_version(folders)

    if dialect in ("all", "both"):
        if dialects and commons:
            # 공통 폴더는 다른 모듈 위치와 함께 로드되는 라이브러리 체인일 수도, 방언 폴더가 이력
            # 참고용일 수도 있다(예: mcm-core). 어느 쪽이 런타임 체인인지 도구가 알 수 없으므로 고르지 않는다.
            print(
                f"[{module}] 공통 폴더 {list(commons)} 와 방언 폴더 {list(dialects)} 가 함께 있다.\n"
                "  런타임에 로드되는 쪽(spring.flyway.locations·모듈 application.yml 주석)을 확인하고\n"
                f"  --dialect 로 대상 폴더를 명시한다. 예: --dialect {next(iter(commons))}",
                file=sys.stderr,
            )
            return 2
        # 방언 폴더가 있으면 그 전부, 없으면 공통 폴더
        targets = list(dialects) or list(commons)
    else:
        targets = [t.strip() for t in dialect.split(",") if t.strip()]
        for t in targets:
            if t not in folders:
                print(
                    f"폴더 {t!r} 이 {module} 에 없다. 있는 것: {list(folders)}"
                    f" (새 방언이면 먼저 {base.relative_to(root)}/{t}/ 를 만든다)",
                    file=sys.stderr,
                )
                return 2

    gaps = [d for d in dialects if d not in targets]
    title = title or slug.replace("_", " ")
    created = []
    for t in targets:
        if gaps:
            body = HEADER_PARTIAL.format(v=v, title=title, targets=", ".join(targets), others=", ".join(gaps))
        else:
            others = [f"{x}/V{v}__{slug}.sql" for x in targets if x != t]
            body = HEADER_ALL.format(v=v, title=title, others=", ".join(others) or "(단일 위치)")
        path = base / t / f"V{v}__{slug}.sql"
        if path.exists():
            print(f"이미 존재한다: {path}", file=sys.stderr)
            return 2
        path.write_text(body, encoding="utf-8")
        created.append(path.relative_to(root))

    print(f"V{v} 생성:")
    for c in created:
        print(f"  {c}")

    if gaps:
        print()
        print(f"⚠ 일부 방언 마이그레이션이다. {', '.join(gaps)} 의 V{v} 를 결번으로 등재해야 한다 — 3 곳 모두:")
        print(f"  1. {', '.join(gaps)} 각 폴더의 다음 번호 파일 헤더 주석에 사유")
        print("  2. db/migration/README.md 의 '결번 대장' 표에 행 추가 (없으면 만든다)")
        print("  3. 방언 간 버전 일치 테스트를 둔 프로젝트는 KNOWN_GAP_LEDGER 에 등재")
        print("  (2 와 3 이 어긋나면 버전 일치 테스트가 실패한다)")
        print()
        print("  no-op 파일로 번호를 채우지 말 것 — 결번으로 남기는 것이 정본 규칙이다.")

    print()
    print("검증: 그 모듈의 마이그레이션 테스트를 돌린다(Gradle 경로는 모듈 구조에 따라 :{m}: 또는 :api: — SKILL.md §6)".replace("{m}", module))
    return 0


def main():
    ap = argparse.ArgumentParser(description="Flyway 마이그레이션 채번·스캐폴딩")
    ap.add_argument("command", choices=["status", "scaffold"])
    ap.add_argument("--root", default=None, help="저장소 루트 (기본: .git 탐색)")
    ap.add_argument("--module", default="aps-core", help="모듈 이름 (예: aps-core, mcm-core, mdm, mls)")
    ap.add_argument("--slug", help="scaffold: 파일명 slug (snake_case)")
    ap.add_argument("--title", default="", help="scaffold: 헤더 제목")
    ap.add_argument(
        "--dialect",
        default="all",
        help="scaffold: all(기본, 모든 방언 폴더) | 폴더 이름 하나 또는 쉼표 목록 "
        "(예: oracle 또는 oracle,postgresql). 빠진 방언은 결번 등재가 따라온다.",
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
