"""TSK-02-02 설계 검증 도구 — 계약 JSON Schema 를 실제 산출물로 확인한다.

사용: python3 validate.py <schema.json> <sample-corpus.json> <ast-samples.json>
  ast-samples.json 은 AstSampleExport(Java, EvalEx 3.7.0 + 초안 설정)의 출력이다.
통과하면 "VALIDATE_OK" 를 찍고 0 으로 끝난다.
"""
import json
import sys

from jsonschema import Draft202012Validator


def main(schema_path, corpus_path, ast_path):
    schema = json.load(open(schema_path, encoding="utf-8"))
    Draft202012Validator.check_schema(schema)

    def errors(defn, inst):
        sch = {"$schema": schema["$schema"], "$defs": schema["$defs"], "$ref": "#/$defs/" + defn}
        return list(Draft202012Validator(sch).iter_errors(inst))

    fails = []
    corpus = json.load(open(corpus_path, encoding="utf-8"))
    for e in errors("CorpusFile", corpus):
        fails.append("corpus: " + e.message)

    samples = json.load(open(ast_path, encoding="utf-8"))
    if samples.get("unexpected") != 0:
        fails.append("ast-samples: unexpected=%s" % samples.get("unexpected"))
    for item in samples["accepted"]:
        if "ast" not in item:
            fails.append("ast parse failed: " + item["expr"])
            continue
        for e in errors("AstNode", item["ast"]):
            fails.append("ast schema: %s -> %s" % (item["expr"], e.message))

    # 음성 확인 — 스키마가 막아야 하는 모양
    negatives = [
        ("AstNode", {"type": "ARRAY_INDEX", "value": "[", "params": [
            {"type": "VARIABLE_OR_CONSTANT", "value": "B"}, {"type": "NUMBER_LITERAL", "value": "0"}]}),
        ("AstNode", {"type": "STRUCTURE_SEPARATOR", "value": ".", "params": [
            {"type": "VARIABLE_OR_CONSTANT", "value": "c"}, {"type": "VARIABLE_OR_CONSTANT", "value": "d"}]}),
        ("AstNode", {"type": "INFIX_OPERATOR", "value": ">=", "params": [{"type": "NUMBER_LITERAL", "value": "1"}]}),
        ("CellJson", {"op": "IN", "list": []}),
        ("CellJson", {"op": "GE", "left": 2.5}),
        ("CellJson", {"op": "<= 변수 <", "left": "1.6"}),
        ("TypedValue", {"type": "NUMBER", "value": 1.5}),
    ]
    for defn, inst in negatives:
        if not errors(defn, inst):
            fails.append("negative accepted: %s %s" % (defn, json.dumps(inst, ensure_ascii=False)))

    for f in fails:
        print("FAIL", f)
    if fails:
        sys.exit(1)
    print("VALIDATE_OK accepted=%d corpus=%d negatives=%d" % (
        len(samples["accepted"]), len(corpus["cases"]), len(negatives)))


if __name__ == "__main__":
    main(*sys.argv[1:4])
