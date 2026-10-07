# SQLite 사본 읽기 도구(로컬 DB 가 Oracle 로 바뀐 뒤에는 SQLite 사본이 있을 때만 동작), Oracle 판은 후속(oracle-1007 b8).
"""TB_MDM_TERM 의 EMBEDDING·EMBEDDING_MODEL 을 KURE-v1 INT8 로 채운다(서버 재인코딩과 같은 벡터).

- 모델·풀링: term-embedding.md §2 그대로(thkmon/KURE-v1-onnx-int8, model.onnx sha256 1808718e…, CLS + L2, 배치 1, intra 4)
- 입력: "{표기}: {정의} ({영문명})". 값은 strip, 정의가 비면 ": {정의}", 영문명이 비면 " ({영문명})" 를 뺀다
  (term-embedding.md §2·D-025, 서버 TermMngService.buildEncodingInput 과 같다)
- 저장: float32 little-endian 1024개(4,096바이트), EMBEDDING_MODEL = KURE-v1/int8-{sha8}/cls-l2/in1 (TermEmbeddingCodec)
- 대상: EMBEDDING 이 NULL 이거나 EMBEDDING_MODEL 이 현재 모델과 다른 행. 다시 돌리면 남은 행만 한다.

사용: MODEL_DIR=~/.cache/kure-v1-onnx-int8 .venv/bin/python embed_terms.py [--db 경로] [--all]
의존: numpy, onnxruntime, tokenizers
"""
import argparse, hashlib, os, sqlite3, time

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
MODEL_SHA = '1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b'
EMBEDDING_MODEL = f'KURE-v1/int8-{MODEL_SHA[:8]}/cls-l2/in1'


def build_input(name, definition, eng):
    s = (name or '').strip()
    if (definition or '').strip():
        s += ': ' + definition.strip()
    if (eng or '').strip():
        s += ' (' + eng.strip() + ')'
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=os.path.join(ROOT, 'src/backend/data/mdm.db'))
    ap.add_argument('--all', action='store_true', help='모델이 같아도 전부 다시 인코딩')
    a = ap.parse_args()
    mdir = os.path.expanduser(os.environ.get('MODEL_DIR', '~/.cache/kure-v1-onnx-int8'))
    model = os.path.join(mdir, 'model.onnx')
    if hashlib.sha256(open(model, 'rb').read()).hexdigest() != MODEL_SHA:
        raise SystemExit('model.onnx sha256 이 PoC 파일과 다르다')

    tok = Tokenizer.from_file(os.path.join(mdir, 'tokenizer.json'))
    tok.enable_truncation(512)
    tok.no_padding()
    so = ort.SessionOptions()
    so.intra_op_num_threads, so.inter_op_num_threads = 4, 1
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])

    db = sqlite3.connect(a.db, timeout=60)
    where = '' if a.all else 'where EMBEDDING is null or EMBEDDING_MODEL is null or EMBEDDING_MODEL <> ?'
    rows = db.execute(f'select TERM_ID, TERM_NAME, DEFINITION, ENG_NAME from TB_MDM_TERM {where} order by TERM_ID',
                      () if a.all else (EMBEDDING_MODEL,)).fetchall()
    print(f'대상 {len(rows)}건', flush=True)
    t0, buf = time.time(), []
    for i, (tid, name, definition, eng) in enumerate(rows, 1):
        e = tok.encode(build_input(name, definition, eng), add_special_tokens=True)
        ids = np.array([e.ids], dtype=np.int64)
        v = sess.run(None, {'input_ids': ids, 'attention_mask': np.ones_like(ids)})[0][0, 0, :].astype(np.float32)
        v /= np.linalg.norm(v)
        buf.append((v.astype('<f4').tobytes(), EMBEDDING_MODEL, tid))
        if len(buf) == 200 or i == len(rows):
            db.executemany('update TB_MDM_TERM set EMBEDDING = ?, EMBEDDING_MODEL = ? where TERM_ID = ?', buf)
            db.commit()
            buf.clear()
        if i % 1000 == 0:
            print(f'{i}/{len(rows)} {time.time() - t0:.0f}s', flush=True)
    print(f'완료 {len(rows)}건 {time.time() - t0:.1f}s', flush=True)


if __name__ == '__main__':
    main()
