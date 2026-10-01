#!/usr/bin/env python3
"""migration_tool.py 자체 검증.

임시 픽스처에 방언 비대칭(일부 방언에만 있는 번호)을 심어 채번이 실제로 충돌을
피하는지 확인한다. 방언은 oracle·postgresql·sqlite 3개로 둔다. 실 저장소는 건드리지 않는다.

사용: python3 selftest.py
"""

import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL = HERE / "migration_tool.py"
REL = "src/backend/aps-core/src/main/resources/db/migration"

# 실 저장소에서 있었던 모양: 한 방언이 90 까지, sqlite 는 88 까지
ASYM = {"oracle": [1, 22, 88, 89, 90], "postgresql": [1, 22, 88, 90], "sqlite": [1, 22, 61, 88]}


def build_fixture(root: Path, layout, rel=REL):
    for d, versions in layout.items():
        p = root / rel / d
        p.mkdir(parents=True, exist_ok=True)
        for v in versions:
            (p / f"V{v}__fixture_{v}.sql").write_text("-- fixture\n", encoding="utf-8")
    (root / ".git").mkdir(exist_ok=True)


def run(root: Path, *args):
    r = subprocess.run(
        [sys.executable, str(TOOL), *args, "--root", str(root)],
        capture_output=True,
        text=True,
    )
    return r.stdout + r.stderr, r.returncode


def main():
    failures = []

    def check(cond, ok, fail):
        if cond:
            print(f"[OK] {ok}")
        else:
            failures.append(fail)

    # --- 1) 채번: 방언별 max 가 다를 때 합집합 기준이어야 한다 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, ASYM)
        out, _ = run(root, "status")
        check("다음 안전 번호: V91" in out, "채번  3 방언 합집합 max+1 = V91 (sqlite max+1=89 함정 회피)", f"채번 오류: V91 이 아님\n{out}")
        check("충돌한다" in out, "경고  방언별 채번 시 충돌 경고 노출", "방언별 채번 충돌 경고가 없다")
        check("V61" in out and "V89" in out, "결번  방언별 빠진 번호 목록 노출", f"빠진 번호 목록이 없다\n{out}")

    # --- 2) scaffold all: 같은 번호로 모든 방언 생성 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, ASYM)
        out, _ = run(root, "scaffold", "--slug", "add_foo_column")
        paths = {d: root / REL / d / "V91__add_foo_column.sql" for d in ASYM}
        check(all(p.exists() for p in paths.values()), "전체생성  V91 이 3 방언 모두에 생성", f"scaffold all 이 전부 만들지 않았다\n{out}")
        if paths["oracle"].exists():
            txt = paths["oracle"].read_text(encoding="utf-8")
            check("postgresql/V91" in txt and "sqlite/V91" in txt, "헤더    나머지 방언 대응 명시", "헤더에 나머지 방언 참조가 없다")

    # --- 3) scaffold 일부 방언: 결번 3 곳 등재 안내가 떠야 한다 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, ASYM)
        out, _ = run(root, "scaffold", "--slug", "oracle_pg_fix", "--dialect", "oracle,postgresql")
        made = [d for d in ASYM if (root / REL / d / "V91__oracle_pg_fix.sql").exists()]
        check(made == ["oracle", "postgresql"], "일부    지정한 방언(oracle,postgresql)에만 생성", f"생성 위치 오류: {made}\n{out}")
        tokens = ("결번 대장", "KNOWN_GAP_LEDGER", "no-op", "sqlite 의 V91")
        check(all(t in out for t in tokens), "안내    결번 3 곳 등재 + no-op 금지 안내 노출", f"일부 방언 안내 누락\n{out}")

    # --- 4) 기존 번호 덮어쓰기 거부 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, {"oracle": [1, 91], "sqlite": [1, 91]})
        out, _ = run(root, "scaffold", "--slug", "collide")
        check((root / REL / "oracle" / "V92__collide.sql").exists(), "회피    기존 번호를 건너뛰고 V92 채번", f"기존 V91 을 피해 V92 로 가지 않았다\n{out}")

    # --- 5) 잘못된 slug·없는 방언 거부 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, {"oracle": [1], "sqlite": [1]})
        _, code = run(root, "scaffold", "--slug", "Bad-Slug")
        check(code != 0, "검증    잘못된 slug 거부", "잘못된 slug 를 받아들였다")
        out, code = run(root, "scaffold", "--slug", "x", "--dialect", "postgresql")
        check(code != 0 and "새 방언이면" in out, "검증    없는 방언 폴더 거부 + 생성 안내", f"없는 방언을 받아들였다\n{out}")

    # --- 6) 공통 폴더만 있는 모듈: 공통 폴더에 생성 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, {"aps-core": [1]})
        out, _ = run(root, "scaffold", "--slug", "add_bar")
        check((root / REL / "aps-core" / "V2__add_bar.sql").exists(), "공통    방언 폴더가 없으면 공통 폴더에 생성", f"공통 폴더 생성 실패\n{out}")

    # --- 6b) 공통 + 방언 혼합(mcm-core 모양): all 은 거부, 명시하면 그 폴더에만 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, {"aps-core": [1], "sqlite": [1, 2, 17]})
        out, code = run(root, "scaffold", "--slug", "mixed")
        made = list((root / REL).glob("*/V18__mixed.sql"))
        check(code != 0 and not made and "--dialect" in out, "혼합    공통+방언 혼합이면 all 거부·명시 요구", f"혼합 배치를 임의로 골랐다\n{out}")
        out, code = run(root, "scaffold", "--slug", "mixed", "--dialect", "aps-core")
        check((root / REL / "aps-core" / "V18__mixed.sql").exists(), "혼합    명시한 공통 폴더에 합집합 번호 V18 생성", f"명시 생성 실패\n{out}")

    # --- 7) api 하위 + 모듈 이름 한 단 더 (db/migration/mdm/sqlite) 해석 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        rel = "src/backend/mdm/api/src/main/resources/db/migration/mdm"
        build_fixture(root, {"sqlite": [1, 2, 5], "oracle": [1, 2]}, rel=rel)
        out, _ = run(root, "status", "--module", "mdm")
        check("다음 안전 번호: V6" in out and "oracle" in out, "경로    api/ 하위·중첩 모듈 폴더 해석", f"중첩 경로 해석 실패\n{out}")

    print()
    if failures:
        print(f"자체검증 실패 {len(failures)} 건:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("자체검증 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
