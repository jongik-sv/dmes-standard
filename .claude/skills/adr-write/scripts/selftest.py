#!/usr/bin/env python3
"""adr_tool.py 자체 검증.

린트가 "통과" 를 낼 때 그게 규약을 지켜서인지 검사기가 고장나서인지 구분되어야 한다.
규약 위반을 하나씩 심은 임시 픽스처로 탐지를 확인한다(RED-first).
실 저장소는 건드리지 않는다.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL = HERE / "adr_tool.py"

GOOD = """# ADR-0007: 예시 결정

- **Status**: ACCEPTED
- **Date**: 2026-07-20
- **Decision Date**: 2026-07-20
- **Context Tags**: MLS, inventory

## 쉬운 설명 (현업용 요약)

창고에서 같은 자재를 두 사람이 동시에 가져가면 재고가 어긋나는 문제가 있었습니다.
앞으로는 먼저 요청한 쪽이 해당 수량을 확보하고, 나중 요청은 남은 수량만 봅니다.

## Context (배경)

배경 서술.

## Decision (결정)

결정 서술.

## Consequences (결과)

결과 서술.

## Alternatives Considered (대안)

대안 서술.

## References

- 참고
"""


def write_adr(root: Path, module: str, name: str, body: str) -> Path:
    d = root / f"docs/{module}/design/adr"
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    p.write_text(body, encoding="utf-8")
    return p


def run(root: Path, *args):
    r = subprocess.run(
        [sys.executable, str(TOOL), *args, "--root", str(root)],
        capture_output=True,
        text=True,
    )
    return r.stdout + r.stderr, r.returncode


def main():
    failures = []

    # --- GREEN: 규약을 지킨 ADR 은 통과해야 한다 (오탐 확인) ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / ".git").mkdir()
        p = write_adr(root, "mls", "0007-example.md", GOOD)
        out, code = run(root, "lint", str(p))
        if code != 0:
            failures.append(f"GREEN 실패: 규약 준수 ADR 이 통과하지 못함\n{out}")
        else:
            print("[OK] GREEN  규약 준수 ADR 통과")

    # --- RED: 위반을 하나씩 심어 탐지 확인 ---
    mutations = [
        (
            "Status 에 산문",
            lambda t: t.replace(
                "- **Status**: ACCEPTED",
                "- **Status**: ✅ ACCEPTED (2026-07-14 확정, 구현 D1~D6 완료, 회귀 2534/0)",
            ),
            "Status 가 enum 이 아니다",
        ),
        (
            "쉬운 설명 절 누락",
            lambda t: re.sub(r"## 쉬운 설명 \(현업용 요약\).*?(?=## Context)", "", t, flags=re.S),
            "필수 절 누락: ## 쉬운 설명",
        ),
        (
            "Alternatives 절 누락",
            lambda t: re.sub(r"## Alternatives Considered \(대안\).*?(?=## References)", "", t, flags=re.S),
            "필수 절 누락: ## Alternatives Considered",
        ),
        (
            "제목 번호 불일치",
            lambda t: t.replace("# ADR-0007:", "# ADR-0009:"),
            "제목의 번호",
        ),
        (
            "PROPOSED 인데 Trigger 없음",
            lambda t: t.replace("- **Status**: ACCEPTED", "- **Status**: PROPOSED"),
            "PROPOSED 인데 Trigger 절이 없다",
        ),
    ]

    for label, mutate, expect in mutations:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / ".git").mkdir()
            p = write_adr(root, "mls", "0007-example.md", mutate(GOOD))
            out, code = run(root, "lint", str(p))
            if expect not in out:
                failures.append(f"RED 실패: {label} 미탐지\n{out}")
            elif code == 0:
                failures.append(f"RED 실패: {label} 탐지했으나 exit 0")
            else:
                print(f"[OK] RED    {label}")

    # --- 쉬운 설명에 구현 용어가 섞이면 경고 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / ".git").mkdir()
        bad = GOOD.replace("먼저 요청한 쪽이", "`InventoryClaimService` 가")
        p = write_adr(root, "mls", "0007-example.md", bad)
        out, code = run(root, "lint", str(p))
        if "구현 용어 금지" not in out:
            failures.append(f"쉬운 설명의 클래스명 경고 미탐지\n{out}")
        else:
            print("[OK] WARN   쉬운 설명의 구현 용어 경고")

    # --- 채번: 모듈별 독립 시퀀스 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / ".git").mkdir()
        write_adr(root, "mls", "0001-a.md", GOOD)
        write_adr(root, "mls", "0002-b.md", GOOD)
        write_adr(root, "mcm", "0001-c.md", GOOD)
        out, _ = run(root, "status", "--module", "mls")
        if "다음 번호: 0003" not in out:
            failures.append(f"mls 채번 오류\n{out}")
        else:
            print("[OK] 채번    mls 다음 번호 0003")
        out, _ = run(root, "status", "--module", "mcm")
        if "다음 번호: 0002" not in out:
            failures.append(f"mcm 채번 오류 — 모듈 독립이어야 한다\n{out}")
        else:
            print("[OK] 채번    mcm 다음 번호 0002 (mls 와 독립)")

    # --- new: 스캐폴딩이 린트를 통과하는 뼈대를 만드는가 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / ".git").mkdir()
        out, code = run(root, "new", "--module", "mqc", "--slug", "sample-decision", "--title", "샘플")
        created = root / "docs/mqc/design/adr/0001-sample-decision.md"
        if not created.exists():
            failures.append(f"new 가 파일을 만들지 않았다\n{out}")
        else:
            print("[OK] 생성    new 가 0001 파일 생성")
            t = created.read_text(encoding="utf-8")
            missing = [h for h in ("## 쉬운 설명 (현업용 요약)", "## Context (배경)",
                                   "## Decision (결정)", "## References") if h not in t]
            if missing:
                failures.append(f"스캐폴딩에 필수 절 누락: {missing}")
            else:
                print("[OK] 뼈대    스캐폴딩에 필수 절 포함")
            if "## Trigger" not in t:
                failures.append("PROPOSED 기본인데 Trigger 절이 없다")
            else:
                print("[OK] 뼈대    PROPOSED 기본 → Trigger 절 포함")

    # --- new --status ACCEPTED 는 Trigger 절을 빼야 한다 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / ".git").mkdir()
        run(root, "new", "--module", "mqc", "--slug", "accepted-one", "--status", "ACCEPTED")
        t = (root / "docs/mqc/design/adr/0001-accepted-one.md").read_text(encoding="utf-8")
        if "## Trigger" in t:
            failures.append("ACCEPTED 인데 Trigger 절이 남아 있다")
        else:
            print("[OK] 뼈대    ACCEPTED → Trigger 절 제거")

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
