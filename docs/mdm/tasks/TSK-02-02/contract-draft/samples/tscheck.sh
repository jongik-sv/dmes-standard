#!/bin/sh
# TSK-02-02 설계 검증 도구 — TS 타입 초안이 스키마 표본(코퍼스·AST)을 받아들이고 틀린 모양은 거부하는지 tsc 로 본다.
# 사용: sh tscheck.sh <tsc 경로> <작업 폴더(스크래치)> <ast-samples.json>
# 통과하면 TSC_OK. 작업 폴더에만 파일을 만든다.
set -eu
TSC="$1"; OUT="$2"; AST="$3"
HERE=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$OUT"
cp "$HERE/ts/engine-contract.ts" "$OUT/engine-contract.ts"
{
  echo "import type { AstNode, CellJson, CorpusFile, TypedValue } from './engine-contract';"
  printf 'export const corpus = '; cat "$HERE/samples/sample-corpus.json"; echo ' satisfies CorpusFile;'
  printf 'export const asts = '
  python3 -c "import json,sys; sys.stdout.write(json.dumps([a['ast'] for a in json.load(open(sys.argv[1]))['accepted']], ensure_ascii=False))" "$AST"
  echo ' satisfies AstNode[];'
  echo '// @ts-expect-error 목록 원소는 문자열이다'
  echo "export const bad1 = { op: 'IN', list: [1] } satisfies CellJson;"
  echo '// @ts-expect-error 숫자는 문자열로 직렬화한다'
  echo "export const bad2 = { type: 'NUMBER', value: 1.5 } satisfies TypedValue;"
  echo '// @ts-expect-error 중위 연산자는 자식 둘'
  echo "export const bad3 = { type: 'INFIX_OPERATOR', value: '>=', params: [{ type: 'NUMBER_LITERAL', value: '1' }] } satisfies AstNode;"
} > "$OUT/check.ts"
"$TSC" --noEmit --strict --target es2022 --module esnext --moduleResolution bundler "$OUT/engine-contract.ts" "$OUT/check.ts"
echo TSC_OK
