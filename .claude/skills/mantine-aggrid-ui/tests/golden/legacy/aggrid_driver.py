#!/usr/bin/env python3
"""aggrid_docs 골든 시험용 python 드라이버(시험 전용 — 실행 경로 아님).

legacy 스크립트(원래 이름 aggrid_docs.py)를 시험이 임시 폴더에 복사해 두면, 이 드라이버가 그 모듈을 불러
환경 변수 AGGRID_DOCS_SITE·AGGRID_DOCS_AGDEV_RAW 가 있을 때 SITE·AGDEV_RAW 를 바꾸고(로컬 가짜 서버용) 아래 모드로 돈다.

  aggrid_driver.py <legacy 폴더> cli <인자...>   원래 CLI 와 같게 main() 을 돌린다(prog 이름은 aggrid_docs.py)
  aggrid_driver.py <legacy 폴더> call            stdin 의 JSON [[함수이름, [인자...]], ...] 를 불러 결과를 JSON 으로 stdout 에 쓴다
"""
import importlib.util
import json
import os
import sys

mod_dir, mode = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("aggrid_docs", os.path.join(mod_dir, "aggrid_docs.py"))
mod = importlib.util.module_from_spec(spec)
sys.modules["aggrid_docs"] = mod
spec.loader.exec_module(mod)
if os.environ.get("AGGRID_DOCS_SITE"):
    mod.SITE = os.environ["AGGRID_DOCS_SITE"]
if os.environ.get("AGGRID_DOCS_AGDEV_RAW"):
    mod.AGDEV_RAW = os.environ["AGGRID_DOCS_AGDEV_RAW"]


def plain(v):
    """JSON 으로 쓸 수 있게 바꾼다(튜플→리스트, re.Match→그룹 목록)."""
    if isinstance(v, (list, tuple)):
        return [plain(x) for x in v]
    if isinstance(v, dict):
        return {str(k): plain(x) for k, x in v.items()}
    if isinstance(v, (set, frozenset)):
        return sorted(plain(x) for x in v)
    return v


if mode == "cli":
    sys.argv = ["aggrid_docs.py"] + sys.argv[3:]
    mod.main()
elif mode == "call":
    import html

    calls = json.load(sys.stdin)
    results = []
    for name, args in calls:
        fn = html.unescape if name == "html.unescape" else getattr(mod, name)
        results.append(plain(fn(*args)))
    sys.stdout.write(json.dumps(results, ensure_ascii=True))
else:
    sys.exit(f"알 수 없는 모드: {mode}")
