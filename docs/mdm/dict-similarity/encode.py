"""mdm.db 용어·컬럼을 KURE-v1 INT8 로 인코딩한다(term-embedding.md §2 와 같은 모델·풀링·입력 형식).

- 모델: thkmon/KURE-v1-onnx-int8 rev 118dcc12…, model.onnx sha256 1808718e…  (MODEL_DIR)
- 풀링: CLS(0번 토큰) + L2 정규화. 배치 1, intra 4 스레드
- 용어 입력: "{표기}: {정의} ({영문명})" — 비어 있는 부분은 뺀다(TermCorpus.encodeInput)
- 컬럼 입력: "{논리명}: {설명}" — 설명이 비면 논리명만

사용: MODEL_DIR=~/.cache/kure-v1-onnx-int8 python encode.py --out 작업폴더 [--db mdm.db] [--limit N]
출력: 작업폴더/term.npy·term.json, column.npy·column.json (행 순서 일치)
"""
import argparse, hashlib, json, os, sqlite3, time

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
MODEL_SHA = '1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b'
EMBEDDING_MODEL = 'KURE-v1/int8-1808718e/cls-l2/in1'


def term_input(name, definition, eng):
    s = (name or '').strip()
    if (definition or '').strip():
        s += ': ' + definition.strip()
    if (eng or '').strip():
        s += ' (' + eng.strip() + ')'
    return s


def column_input(name, desc):
    s = (name or '').strip()
    if (desc or '').strip():
        s += ': ' + desc.strip()
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=os.path.join(ROOT, 'src/backend/data/mdm.db'))
    ap.add_argument('--out', required=True)
    ap.add_argument('--limit', type=int)
    a = ap.parse_args()
    mdir = os.path.expanduser(os.environ.get('MODEL_DIR', '~/.cache/kure-v1-onnx-int8'))
    model = os.path.join(mdir, 'model.onnx')
    sha = hashlib.sha256(open(model, 'rb').read()).hexdigest()
    if sha != MODEL_SHA:
        raise SystemExit(f'model.onnx sha256 이 PoC 파일과 다르다: {sha}')

    tok = Tokenizer.from_file(os.path.join(mdir, 'tokenizer.json'))
    tok.enable_truncation(512)
    tok.no_padding()
    so = ort.SessionOptions()
    so.intra_op_num_threads, so.inter_op_num_threads = 4, 1
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])

    def encode(text):
        e = tok.encode(text, add_special_tokens=True)
        ids = np.array([e.ids], dtype=np.int64)
        out = sess.run(None, {'input_ids': ids, 'attention_mask': np.ones_like(ids)})[0]
        v = out[0, 0, :].astype(np.float32)
        return v / np.linalg.norm(v)

    db = sqlite3.connect(a.db)
    sets = {
        'term': ('select TERM_ID, TERM_NAME, SENSE_NO, DEFINITION, ENG_NAME, ENG_ABBR from TB_MDM_TERM order by TERM_ID',
                 lambda r: term_input(r[1], r[3], r[4]),
                 lambda r: {'id': r[0], 'name': r[1], 'sense': r[2], 'eng': r[4], 'abbr': r[5], 'def': r[3]}),
        'column': ('select COLUMN_ID, COLUMN_NAME, DESCRIPTION, PHYS_NAME, DOMAIN_ID from TB_MDM_COLUMN order by COLUMN_ID',
                   lambda r: column_input(r[1], r[2]),
                   lambda r: {'id': r[0], 'name': r[1], 'desc': r[2], 'phys': r[3], 'domain_id': r[4]}),
    }
    os.makedirs(a.out, exist_ok=True)
    for kind, (sql, inp, meta) in sets.items():
        rows = db.execute(sql).fetchall()[:a.limit]
        vecs, metas, t0 = [], [], time.time()
        for i, r in enumerate(rows):
            vecs.append(encode(inp(r)))
            m = meta(r)
            m['input'] = inp(r)
            metas.append(m)
            if (i + 1) % 1000 == 0:
                print(f'{kind} {i + 1}/{len(rows)} {time.time() - t0:.0f}s', flush=True)
        np.save(os.path.join(a.out, f'{kind}.npy'), np.stack(vecs))
        json.dump({'embedding_model': EMBEDDING_MODEL, 'rows': metas},
                  open(os.path.join(a.out, f'{kind}.json'), 'w'), ensure_ascii=False)
        print(f'{kind} {len(rows)}건 {time.time() - t0:.1f}s', flush=True)


if __name__ == '__main__':
    main()
