"""용어 사전 8,152개(2026-10-02, D-137 병합 뒤) 유사어 후보 쌍 추출.

사전에 저장된 EMBEDDING 은 "{표기}: {정의} ({영문명})" 이라, 정의가 없는 표준용어와 정의가 있는 기존 용어 사이의
코사인이 입력 모양 차이로 낮게 나온다. 그래서 비교 전용으로 모든 용어를 "{표기} ({영문명})" 으로 다시 인코딩한다
(모델·풀링은 term-embedding.md §2 와 같다. 이 벡터는 사전에 저장하지 않는다).

쌍 기준(이름이 같은 쌍 제외, 출처 old=그 밖·gl=용어집·std=표준용어):
  출처가 다른 쌍 0.82 이상 · old-old·gl-gl 0.85 이상 · std-std 0.90 이상(옛 표준 안의 변형이 많아 높게 잡음)

사용: MODEL_DIR=~/.cache/kure-v1-onnx-int8 python pairs_v2.py --out 작업폴더 [--db mdm.db] [--batches 6]
출력: 작업폴더/pairs.json(전체), batch{N}.jsonl(판정용)
"""
import argparse, collections, json, os, re, sqlite3

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
TH = {('old', 'std'): .82, ('gl', 'old'): .82, ('gl', 'std'): .82, ('old', 'old'): .85, ('gl', 'gl'): .85,
      ('std', 'std'): .90}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=os.path.join(ROOT, 'src/backend/data/mdm.db'))
    ap.add_argument('--out', required=True)
    ap.add_argument('--batches', type=int, default=6)
    a = ap.parse_args()
    mdir = os.path.expanduser(os.environ.get('MODEL_DIR', '~/.cache/kure-v1-onnx-int8'))
    tok = Tokenizer.from_file(os.path.join(mdir, 'tokenizer.json'))
    tok.enable_truncation(512)
    tok.no_padding()
    so = ort.SessionOptions()
    so.intra_op_num_threads, so.inter_op_num_threads = 4, 1
    sess = ort.InferenceSession(os.path.join(mdir, 'model.onnx'), so, providers=['CPUExecutionProvider'])

    db = sqlite3.connect(a.db)
    rows = db.execute('select TERM_ID, TERM_NAME, SENSE_NO, SRC_ORIGIN, DEFINITION, ENG_NAME, CONTEXT, EMBEDDING '
                      'from TB_MDM_TERM order by TERM_ID').fetchall()
    ref = collections.Counter(j for (t,) in db.execute('select TERM_IDS from TB_MDM_COLUMN') for j in json.loads(t or '[]'))
    vecs = []
    for r in rows:
        s = r[1].strip() + (f' ({r[5].strip()})' if (r[5] or '').strip() else '')
        ids = np.array([tok.encode(s).ids], dtype=np.int64)
        v = sess.run(None, {'input_ids': ids, 'attention_mask': np.ones_like(ids)})[0][0, 0].astype(np.float32)
        vecs.append(v / np.linalg.norm(v))
    M = np.stack(vecs)
    F = np.stack([np.frombuffer(r[7], dtype='<f4') for r in rows])

    def grp(r):
        o = r[3] or ''
        return 'gl' if o.startswith('용어집') else 'std' if o.startswith('표준용어') else 'old'

    def info(r):
        return {'id': r[0], 'name': r[1], 'sense': r[2], 'eng': r[5], 'def': (r[4] or '')[:160], 'ctx': r[6],
                'src': grp(r), 'cols': ref.get(r[0], 0)}

    key = [re.sub(r'\s+', '', r[1]).upper() for r in rows]
    S = M @ M.T
    np.fill_diagonal(S, 0)
    iu = np.triu_indices(len(rows), 1)
    v = S[iu]
    pairs = []
    for k in np.where(v >= min(TH.values()))[0]:
        i, j = iu[0][k], iu[1][k]
        if key[i] == key[j]:
            continue
        g = tuple(sorted((grp(rows[i]), grp(rows[j]))))
        if v[k] < TH[g]:
            continue
        pairs.append({'a': rows[i][0], 'b': rows[j][0], 'cos_short': round(float(v[k]), 3),
                      'cos_full': round(float(F[i] @ F[j]), 3), 'groups': '-'.join(g),
                      'A': info(rows[i]), 'B': info(rows[j])})
    pairs.sort(key=lambda p: -p['cos_short'])
    os.makedirs(a.out, exist_ok=True)
    json.dump(pairs, open(os.path.join(a.out, 'pairs.json'), 'w'), ensure_ascii=False)
    size = -(-len(pairs) // a.batches)
    for n in range(a.batches):
        with open(os.path.join(a.out, f'batch{n + 1}.jsonl'), 'w') as f:
            for p in pairs[n * size:(n + 1) * size]:
                f.write(json.dumps({'pair': f"{p['a']}-{p['b']}", 'cos': p['cos_short'], 'A': p['A'], 'B': p['B']},
                                   ensure_ascii=False) + '\n')
    print(len(pairs), collections.Counter(p['groups'] for p in pairs))


if __name__ == '__main__':
    main()
