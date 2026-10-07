#!/usr/bin/env python3
"""OASIS/cactus 계약 위반 검사기.

정본: docs/guide/BackEnd/standard-v2/backend-standard/02-structure-naming-constraints.md §6-B~6-E

검사 대상은 BPMN 의 camunda:class 로 참조되는 진입점 bean 이다.
디렉터리 glob 이 아니라 BPMN 을 근거로 대상을 정하므로, service/ 밖에 있는
Service(mqc/domain, mls/common 등)도 빠짐없이 잡힌다.

주석/문자열 리터럴은 제거한 뒤 판정한다. 코드가 "@Transactional 미부착(cactus 경계)"
처럼 규칙 자체를 Javadoc 에 적어두는 경우가 많아, 소박한 grep 은 대량 오탐을 낸다.
"""

import argparse
import json
import re
import sys
from pathlib import Path

MES_MODULES = ["mcm", "mls", "mqc", "mpp", "mas", "mcm-core"]
SKIP_DIR_PARTS = {"build", "node_modules", ".next", "dist", "out", ".git"}


def is_skipped(path: Path) -> bool:
    return any(part in SKIP_DIR_PARTS for part in path.parts)


def strip_java(src: str) -> str:
    """주석과 문자열 리터럴을 제거한다. 판정은 반드시 이 결과 위에서 한다."""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"//[^\n]*", "", src)
    src = re.sub(r'"(?:\\.|[^"\\])*"', '""', src)
    return src


def strip_ts(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"//[^\n]*", "", src)
    return src


class Finding:
    def __init__(self, rule, severity, target, detail):
        self.rule = rule
        self.severity = severity
        self.target = target
        self.detail = detail

    def as_dict(self):
        return {
            "rule": self.rule,
            "severity": self.severity,
            "target": self.target,
            "detail": self.detail,
        }


def collect_bpmn(root: Path, modules):
    out = []
    for m in modules:
        base = root / "src" / "backend" / m
        if not base.exists():
            continue
        out += [p for p in base.rglob("*.bpmn") if not is_skipped(p)]
    return sorted(set(out))


def collect_java(root: Path):
    base = root / "src" / "backend"
    return [
        p
        for p in base.rglob("*.java")
        if not is_skipped(p) and "/src/test/" not in str(p)
    ]


def resolve_beans(bpmns, javas):
    """camunda:class 는 FQCN 이 아니라 Spring bean 이름이다."""
    beans = {}
    for p in bpmns:
        txt = p.read_text(encoding="utf-8", errors="ignore")
        for b in re.findall(r'camunda:class="([^"]+)"', txt):
            beans.setdefault(b, []).append(p)

    by_stem, by_explicit = {}, {}
    for p in javas:
        by_stem.setdefault(p.stem, p)
        txt = p.read_text(encoding="utf-8", errors="ignore")
        for b in re.findall(r'@Service\(\s*"([^"]+)"\s*\)', txt):
            by_explicit[b] = p

    resolved, unresolved = {}, []
    for b in sorted(beans):
        p = by_explicit.get(b) or by_stem.get(b[:1].upper() + b[1:])
        if p:
            resolved[b] = p
        else:
            unresolved.append(b)
    return beans, resolved, unresolved


def check_6b(resolved, root, findings):
    """진입점 Service 의 @Transactional -> CGLIB proxy -> ParameterName must not be null."""
    for bean, path in resolved.items():
        code = strip_java(path.read_text(encoding="utf-8", errors="ignore"))
        hits = re.findall(r"@Transactional\b[^\n]*", code)
        if hits:
            findings.append(
                Finding(
                    "6-B-1",
                    "ERROR",
                    f"{path.relative_to(root)}",
                    f"진입점 bean '{bean}' 에 {hits[0].strip()} 잔존. "
                    "CGLIB proxy 생성으로 parameter name 유실 -> "
                    "IllegalArgumentException('ParameterName must not be null'). "
                    "제거하고 BPMN process 의 camunda:property name=\"tx\" 로 대체할 것.",
                )
            )


SERVICE_TASK_RE = re.compile(r"<bpmn:serviceTask\b(.*?)</bpmn:serviceTask>", re.S)


def check_bpmn(bpmns, root, findings):
    for p in bpmns:
        txt = p.read_text(encoding="utf-8", errors="ignore")
        rel = p.relative_to(root)

        for m in SERVICE_TASK_RE.finditer(txt):
            blk = m.group(0)
            tid_m = re.search(r'id="([^"]+)"', blk)
            tid = tid_m.group(1) if tid_m else "?"

            # 6-C-1: JavaServiceTask 는 grid property 미지원
            if re.search(r'name="grid"', blk):
                findings.append(
                    Finding(
                        "6-C-1",
                        "ERROR",
                        f"{rel}:{tid}",
                        "serviceTask 에 grid property 사용. JavaServiceTaskExecutable 미지원 -> "
                        "PropertyException('[grid] is an unavailable attribute') + 롤백. "
                        "method parameter 이름 <-> grids.{key} 자동 binding 을 쓸 것.",
                    )
                )

            # 6-C-2: output 누락 -> 응답에 data/grids 미생성 (성공처럼 보이는 실패)
            if not re.search(r'name="output"', blk):
                findings.append(
                    Finding(
                        "6-C-2",
                        "ERROR",
                        f"{rel}:{tid}",
                        "serviceTask 에 output property 누락. 반환값이 ServiceResult 에 "
                        '등록되지 않아 응답이 {"meta":{...}} 만 되고 화면 0 건. '
                        "단일 List -> output=\"{listKey}\", 단일 값 -> output=\"{valueKey}\".",
                    )
                )

        # 6-C-3: sequenceFlow name 만으로 분기.
        # 문서상 '불필요' 이지 금지가 아니고 기존 38 파일이 이미 쓰고 있다(baseline).
        # ERROR/WARN 으로 올리면 첫 실행부터 노이즈가 신호를 덮으므로 INFO 로 둔다.
        # 접두사 있는 형태(mqc)와 없는 형태(mcm)가 공존한다.
        n = len(re.findall(r"<(?:bpmn:)?conditionExpression\b", txt))
        if n:
            findings.append(
                Finding(
                    "6-C-3",
                    "INFO",
                    f"{rel}",
                    f"conditionExpression {n} 건. OASIS 는 actionGateway 의 input 값을 "
                    "sequenceFlow name 과 매칭하므로 불필요하다. 정본 reference"
                    "(secObj.bpmn 등)는 name 만 쓴다. 기존 파일이면 유지해도 동작한다.",
                )
            )


def check_frontend(root, findings):
    fe_roots = [root / "src" / "frontend" / f"m-{m}" for m in ["mcm", "mls", "mqc", "mpp", "mas"]]
    files = []
    for base in fe_roots:
        if not base.exists():
            continue
        for ext in ("*.ts", "*.tsx"):
            files += [p for p in base.rglob(ext) if not is_skipped(p)]

    for p in files:
        raw = p.read_text(encoding="utf-8", errors="ignore")
        src = strip_ts(raw)
        rel = p.relative_to(root)

        # 6-E-2: params 에 List -> CactusRequestConverter 가 throw
        for m in re.finditer(r"params\s*:\s*\{([^}]*)\}", src, re.S):
            body = m.group(1)
            bad = re.search(r"(\w+)\s*:\s*(rows\b|\[|\w*[Rr]ows\b)", body)
            if bad:
                line = src[: m.start()].count("\n") + 1
                findings.append(
                    Finding(
                        "6-E-2",
                        "ERROR",
                        f"{rel}:{line}",
                        f"params 에 배열로 보이는 값('{bad.group(0).strip()}') 전달. "
                        "CactusRequestConverter 가 TypeReference 없이 wrap 하여 "
                        "IllegalArgumentException('Generic type ...') throw. "
                        "grids: {{key}: {rows: [...]}} 로 옮길 것.",
                    )
                )

        # 6-E-3: grids key 는 Java parameter 이름과 글자 단위로 일치해야 한다 -> camelCase
        for m in re.finditer(r"grids\s*:\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)", src):
            key = m.group(1)
            if "_" in key:
                line = src[: m.start()].count("\n") + 1
                camel = re.sub(r"_(\w)", lambda g: g.group(1).upper(), key)
                findings.append(
                    Finding(
                        "6-E-3",
                        "ERROR",
                        f"{rel}:{line}",
                        f"grids key '{key}' 에 snake_case 사용. Java parameter 이름과 "
                        f"글자 단위로 일치해야 binding 된다. '{camel}' 로 통일할 것.",
                    )
                )


def check_6d(resolved, bpmn_by_bean, root, findings):
    """Map 반환 + output 명시 -> FE 가 unwrapPayload 로 풀어야 한다 (비표준)."""
    for bean, path in resolved.items():
        code = strip_java(path.read_text(encoding="utf-8", errors="ignore"))
        if re.search(r"public\s+Map<String,\s*Object>\s+\w+\s*\(", code):
            findings.append(
                Finding(
                    "6-D-2",
                    "INFO",
                    f"{path.relative_to(root)}",
                    f"진입점 bean '{bean}' 이 Map 을 반환한다. cactus 는 Map 내부 List 를 "
                    "자동 분리하지 않아 응답이 data.{key} 에 Map 통째로 담긴다. "
                    "FE 에 대응 unwrapPayload 가 있는지 확인할 것. "
                    "권장은 List/단일값 직접 반환 + serviceTask 분기.",
                )
            )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="저장소 루트")
    ap.add_argument("--module", action="append", help="검사할 모듈 (기본: MES 전체)")
    ap.add_argument("--json", action="store_true", help="JSON 출력")
    ap.add_argument("--all", action="store_true", help="WARN/INFO 도 전문 출력")
    ap.add_argument(
        "--severity",
        default="ERROR",
        choices=["ERROR", "WARN", "INFO"],
        help="이 등급 이상이 있으면 exit 1 (기본 ERROR)",
    )
    args = ap.parse_args()

    root = Path(args.root).resolve()
    modules = args.module or MES_MODULES

    bpmns = collect_bpmn(root, modules)
    if not bpmns:
        print(f"검사 대상 BPMN 이 없다. root={root} modules={modules}", file=sys.stderr)
        return 2

    javas = collect_java(root)
    beans, resolved, unresolved = resolve_beans(bpmns, javas)

    findings = []
    check_6b(resolved, root, findings)
    check_bpmn(bpmns, root, findings)
    check_frontend(root, findings)
    check_6d(resolved, beans, root, findings)

    for b in unresolved:
        findings.append(
            Finding(
                "RESOLVE",
                "WARN",
                b,
                "camunda:class 가 가리키는 bean 의 Java 클래스를 찾지 못했다. "
                "@Service(\"이름\") 명시 누락이거나 다른 모듈 소유일 수 있다. "
                "미해석 bean 은 6-B/6-D 검사에서 제외되었다.",
            )
        )

    order = {"ERROR": 0, "WARN": 1, "INFO": 2}
    findings.sort(key=lambda f: (order[f.severity], f.rule, f.target))
    counts = {s: sum(1 for f in findings if f.severity == s) for s in order}

    if args.json:
        print(
            json.dumps(
                {
                    "scanned": {
                        "bpmn": len(bpmns),
                        "entrypoint_beans": len(beans),
                        "resolved": len(resolved),
                        "unresolved": len(unresolved),
                    },
                    "counts": counts,
                    "findings": [f.as_dict() for f in findings],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(
            f"BPMN {len(bpmns)} / 진입점 bean {len(beans)} "
            f"(해석 {len(resolved)}, 미해석 {len(unresolved)})"
        )
        print(f"ERROR {counts['ERROR']} / WARN {counts['WARN']} / INFO {counts['INFO']}")

        # ERROR 는 전문 출력. WARN/INFO 는 기본적으로 규칙별 집계만 낸다.
        # baseline 성 항목(6-C-3 38 건, 6-D-2 49 건)이 ERROR 를 덮는 것을 막는다.
        shown = [f for f in findings if f.severity == "ERROR" or args.all]
        if shown:
            print()
        for f in shown:
            print(f"[{f.severity}] {f.rule}  {f.target}")
            print(f"    {f.detail}")

        if not args.all:
            rest = [f for f in findings if f.severity != "ERROR"]
            if rest:
                by_rule = {}
                for f in rest:
                    by_rule.setdefault((f.severity, f.rule), 0)
                    by_rule[(f.severity, f.rule)] += 1
                print("\n-- 참고 (--all 로 전문 출력) --")
                for (sev, rule), n in sorted(by_rule.items()):
                    print(f"[{sev}] {rule}  {n} 건")

        if not findings:
            print("\n위반 없음.")

    threshold = order[args.severity]
    return 1 if any(order[f.severity] <= threshold for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
