#!/usr/bin/env python3
"""chg_seq 배포 방식 시뮬레이터.

원장(ledger) 하나와 사본(copy) 여러 개를 메모리에서 흉내 낸다.
- 원장 동작: 명세 1절 (버전 생성·DRAFT 편집·상신·반려·승인·승인 취소·배포·철회·DRAFT 삭제·경미 수정·복원·DEPRECATED)
- 배포: 명세 2절 (순번 발급, 보내기+가리기, 받기 옛 묶음 폐기 + upsert + CANCELLED 삭제)
- 판정: sql/04-code-exists.sql 의 code_exists / cate_codes 를 그대로 옮김
- 사본이 동기화를 마칠 때마다 모든 (base_dt, cate, code) 판정과 CODE_LIST 를 원장 "배포된 상태"와 대조

버전 번호는 정수(1,2,3...)로 둔다. 열린 행 to_ver = INF(9999). 시각은 정수 틱.

사용법:
  python3 sql/04-chg-seq-sim.py --runs 2000 --seed 1 [--mode snapshot|rows_then_seq|seq_then_rows|full] [--deployed-view open|raw]
  --mode full 은 전체 방식(04-master-code-deploy-full.md)이다. 행 순번을 보지 않고 배포된 행 전부를 보내고 사본을 통째로 교체한다.
  --drop-old-bundle 은 변경분 방식의 「옛 묶음 폐기」(묶음의 last_chg_seq 가 사본의 last 보다 크지 않으면 통째로 버린다)를 켠다.
"""
import argparse
import collections
import copy as pycopy
import random
import re
import sys

DROP_OLD_BUNDLE = False   # 변경분 방식 「옛 묶음 폐기」 규칙을 켜는 스위치

INF = 9999          # 열린 to_ver
DT_INF = 10 ** 9    # apply_to 9999-12-31
RELEASED, CANCELLED, DRAFT, REQUESTED, APPROVED = 'RELEASED', 'CANCELLED', 'DRAFT', 'REQUESTED', 'APPROVED'
UNAPPLIED_STATUSES = (DRAFT, REQUESTED, APPROVED)

CODES = ['A1', 'A2', 'B1', 'B2', 'C1']
CATES = ['BASE', 'L', 'R', 'T']
REGEXES = ['A.*', 'B.*', '[AC]1', '.*1', '.*2']
FIX_APPLY_TO = False
APPLY_FAULT = False


class Precond(Exception):
    pass


# ───────────────────────────────────────────── 원장
class Ledger:
    def __init__(self):
        self.now = 0
        self.code = {'status': 'CREATED', 'name': 'MC', 'chg_seq': None}
        self.last_chg_seq = 0
        self.vers = {}        # ver -> {status, apply_from, apply_to, desc, chg_seq}
        self.items = {}       # (code, from_ver) -> {to_ver, name, chg_seq}
        self.cates = {}       # (cate, from_ver) -> {to_ver, kind, expr, cname, chg_seq}
        self.cate_items = {}  # (cate, code, from_ver) -> {to_ver, chg_seq}
        self.name_ctr = 0
        self.log = []         # 사건 로그(트레이스용)

    # --- 조회 도우미
    def released_vers(self):
        return sorted(v for v, r in self.vers.items() if r['status'] == RELEASED)

    def unapplied(self):
        out = []
        for v, r in self.vers.items():
            if r['status'] in UNAPPLIED_STATUSES:
                out.append(v)
            elif r['status'] == RELEASED and r['apply_from'] > self.now:
                out.append(v)
        return sorted(out)

    def ver_with(self, status):
        vs = [v for v, r in self.vers.items() if r['status'] == status]
        return vs[0] if vs else None

    def draft(self):
        return self.ver_with(DRAFT)

    def prev_released(self, V):
        vs = [v for v in self.released_vers() if v < V]
        return max(vs) if vs else None

    def next_seq(self):
        self.last_chg_seq += 1
        return self.last_chg_seq

    def new_name(self):
        self.name_ctr += 1
        return 'n%d' % self.name_ctr

    def tables(self):
        return (self.items, self.cates, self.cate_items)

    # 버전 V에 유효한 행 (from_ver <= V < to_ver)
    @staticmethod
    def valid_at(table, V):
        return {k: r for k, r in table.items() if k[-1] <= V < r['to_ver']}

    # --- 사건
    def ev_new_ver(self, restore_from):
        if self.unapplied():
            raise Precond('unapplied exists')
        if self.code['status'] == 'DEPRECATED':
            raise Precond('deprecated')
        V = (max(self.vers) + 1) if self.vers else 1
        self.vers[V] = {'status': DRAFT, 'apply_from': None, 'apply_to': None, 'desc': 'd', 'chg_seq': None,
                        'restored_from': None}
        if restore_from is not None and restore_from in self.vers and self.vers[restore_from]['status'] == RELEASED \
                and restore_from < V:
            self._restore(V, restore_from)
        return V

    def _restore(self, V, R):
        P = self.prev_released(V)
        self.vers[V]['restored_from'] = R
        for table, keylen, fields in ((self.items, 1, ('name',)), (self.cates, 1, ('kind', 'expr', 'cname')),
                                      (self.cate_items, 2, ())):
            at_r = {k[:-1]: r for k, r in self.valid_at(table, R).items()}
            at_p = {k[:-1]: (k, r) for k, r in self.valid_at(table, P).items()}
            for key, r in at_r.items():
                if key not in at_p:
                    table[key + (V,)] = self._row_like(r, fields)
                else:
                    pk, pr = at_p[key]
                    if any(pr[f] != r[f] for f in fields):
                        pr['to_ver'] = V
                        table[key + (V,)] = self._row_like(r, fields)
            for key, (pk, pr) in at_p.items():
                if key not in at_r:
                    pr['to_ver'] = V

    @staticmethod
    def _row_like(r, fields):
        new = {'to_ver': INF, 'chg_seq': None}
        for f in fields:
            new[f] = r[f]
        return new

    def _need_draft(self):
        V = self.draft()
        if V is None:
            raise Precond('no draft')
        return V

    def _close_or_delete(self, table, pk, V):
        """DRAFT V 에서 행을 닫는다. from_ver = V 이면 닫지 않고 지운다."""
        if pk[-1] == V:
            del table[pk]
        else:
            table[pk]['to_ver'] = V

    def ev_edit(self, kind, *args):
        V = self._need_draft()
        if kind == 'add_item':
            code, = args
            if self.valid_at(self.items, V).keys() & {k for k in self.items if k[0] == code} or (code, V) in self.items:
                raise Precond('item exists')
            self.items[(code, V)] = {'to_ver': INF, 'name': self.new_name(), 'chg_seq': None}
        elif kind == 'close_item':
            code, = args
            rows = [k for k in self.valid_at(self.items, V) if k[0] == code]
            if not rows:
                raise Precond('no item')
            self._close_or_delete(self.items, rows[0], V)
            # 연쇄: CATE_ITEM 닫기, LIST 텍스트에서 빼기
            for k in [k for k in self.valid_at(self.cate_items, V) if k[1] == code]:
                self._close_or_delete(self.cate_items, k, V)
            for k, r in list(self.valid_at(self.cates, V).items()):
                if r['kind'] == 'LIST':
                    lst = [x for x in r['expr'].replace(' ', '').split(',') if x]
                    if code in lst:
                        newexpr = ', '.join(x for x in lst if x != code)
                        if k[-1] == V:
                            r['expr'] = newexpr
                        else:
                            r['to_ver'] = V
                            self.cates[(k[0], V)] = {'to_ver': INF, 'kind': 'LIST', 'expr': newexpr,
                                                     'cname': r['cname'], 'chg_seq': None}
        elif kind == 'mod_item':
            code, = args
            rows = [k for k in self.valid_at(self.items, V) if k[0] == code]
            if not rows:
                raise Precond('no item')
            k = rows[0]
            if k[-1] == V:
                self.items[k]['name'] = self.new_name()
            else:
                self.items[k]['to_ver'] = V
                self.items[(code, V)] = {'to_ver': INF, 'name': self.new_name(), 'chg_seq': None}
        elif kind == 'add_cate':
            cate, ckind, expr = args
            if [k for k in self.valid_at(self.cates, V) if k[0] == cate] or (cate, V) in self.cates:
                raise Precond('cate exists')
            self.cates[(cate, V)] = {'to_ver': INF, 'kind': ckind, 'expr': expr, 'cname': self.new_name(),
                                     'chg_seq': None}
        elif kind == 'mod_cate':
            cate, ckind, expr = args
            rows = [k for k in self.valid_at(self.cates, V) if k[0] == cate]
            if not rows:
                raise Precond('no cate')
            k = rows[0]
            r = self.cates[k]
            if r['kind'] == ckind and r['expr'] == expr:
                raise Precond('same')
            if k[-1] == V:
                r['kind'], r['expr'] = ckind, expr
            else:
                r['to_ver'] = V
                self.cates[(cate, V)] = {'to_ver': INF, 'kind': ckind, 'expr': expr, 'cname': r['cname'],
                                         'chg_seq': None}
            if ckind != 'TABLE':
                for ck in [ck for ck in self.valid_at(self.cate_items, V) if ck[0] == cate]:
                    self._close_or_delete(self.cate_items, ck, V)
        elif kind == 'close_cate':
            cate, = args
            rows = [k for k in self.valid_at(self.cates, V) if k[0] == cate]
            if not rows:
                raise Precond('no cate')
            self._close_or_delete(self.cates, rows[0], V)
            for ck in [ck for ck in self.valid_at(self.cate_items, V) if ck[0] == cate]:
                self._close_or_delete(self.cate_items, ck, V)
        elif kind == 'add_ci':
            cate, code = args
            crow = [k for k, r in self.valid_at(self.cates, V).items() if k[0] == cate and r['kind'] == 'TABLE']
            if not crow:
                raise Precond('no TABLE cate')
            if [k for k in self.valid_at(self.cate_items, V) if k[0] == cate and k[1] == code] \
                    or (cate, code, V) in self.cate_items:
                raise Precond('ci exists')
            self.cate_items[(cate, code, V)] = {'to_ver': INF, 'chg_seq': None}
        elif kind == 'close_ci':
            cate, code = args
            rows = [k for k in self.valid_at(self.cate_items, V) if k[0] == cate and k[1] == code]
            if not rows:
                raise Precond('no ci')
            self._close_or_delete(self.cate_items, rows[0], V)
        elif kind == 'undo':
            # 키 하나에 대한 V 의 변경을 취소: from_ver = V 행 삭제, to_ver = V 행은 9999 로
            table_name, key = args
            table = {'items': self.items, 'cates': self.cates, 'cate_items': self.cate_items}[table_name]
            changed = False
            if key + (V,) in table:
                del table[key + (V,)]
                changed = True
            for k, r in table.items():
                if k[:-1] == key and r['to_ver'] == V:
                    r['to_ver'] = INF
                    changed = True
            if not changed:
                raise Precond('nothing to undo')
        else:
            raise ValueError(kind)

    def ev_request(self, delta):
        V = self._need_draft()
        if not self.released_vers():
            af = self.now + delta            # 최초 버전: 과거도 허용 (delta 가 음수일 수 있음)
        else:
            if delta < 1:
                raise Precond('delta')
            af = self.now + delta
            P = self.prev_released(V)
            if af <= self.vers[P]['apply_from']:
                raise Precond('apply_from order')
        self.vers[V].update(status=REQUESTED, apply_from=af)

    def ev_reject(self):
        V = self.ver_with(REQUESTED)
        if V is None:
            raise Precond('no requested')
        self.vers[V].update(status=DRAFT, apply_from=None)

    def ev_approve(self):
        V = self.ver_with(REQUESTED)
        if V is None:
            raise Precond('no requested')
        self.vers[V].update(status=APPROVED, apply_to=DT_INF)
        P = self.prev_released(V)
        if P is not None:
            self.vers[P]['apply_to'] = self.vers[V]['apply_from']   # 순번 없음

    def ev_approve_cancel(self):
        V = self.ver_with(APPROVED)
        if V is None:
            raise Precond('no approved')
        self.vers[V].update(status=DRAFT, apply_from=None, apply_to=None)
        P = self.prev_released(V)
        if P is not None:
            self.vers[P]['apply_to'] = DT_INF                          # 순번 없음

    def ev_release(self):
        V = self.ver_with(APPROVED)
        if V is None:
            raise Precond('no approved')
        s = self.next_seq()
        self.vers[V].update(status=RELEASED, chg_seq=s)
        P = self.prev_released(V)
        if P is not None:
            self.vers[P]['chg_seq'] = s
        for table in self.tables():
            for k, r in table.items():
                if k[-1] == V or r['to_ver'] == V:
                    r['chg_seq'] = s
        if P is None and self.code['chg_seq'] is None:
            self.code['chg_seq'] = s   # 최초 배포: MD_CODE 에도 같은 순번을 찍는다(04 「배포 순번」)
        # CREATED→INUSE 자동 전이는 apply_from 이 지날 때 일어나며 순번을 찍지 않는다(04 「버전 상태와 적용시점」)
        return s

    def ev_cancel(self):
        vs = [v for v, r in self.vers.items() if r['status'] == RELEASED and r['apply_from'] > self.now]
        if not vs:
            raise Precond('no future released')
        V = vs[0]
        s = self.next_seq()
        self.vers[V].update(status=CANCELLED, chg_seq=s)
        P = self.prev_released(V)
        if P is not None:
            self.vers[P].update(apply_to=DT_INF, chg_seq=s)
        for table in self.tables():
            for k in [k for k in table if k[-1] == V]:
                del table[k]
            for k, r in table.items():
                if r['to_ver'] == V:
                    r['to_ver'] = INF
                    r['chg_seq'] = s
        return s

    def ev_draft_delete(self):
        V = self._need_draft()
        del self.vers[V]
        for table in self.tables():
            for k in [k for k in table if k[-1] == V]:
                del table[k]
            for k, r in table.items():
                if r['to_ver'] == V:
                    r['to_ver'] = INF

    def ev_patch(self, target, key):
        s = None
        if target == 'code':
            self.code['name'] = self.new_name()
            s = self.next_seq()
            self.code['chg_seq'] = s
        elif target == 'ver':
            if key not in self.vers or self.vers[key]['status'] != RELEASED:
                raise Precond('ver not released')
            self.vers[key]['desc'] = self.new_name()
            s = self.next_seq()
            self.vers[key]['chg_seq'] = s
        else:
            table = {'items': self.items, 'cates': self.cates}[target]
            if key not in table or self.vers.get(key[-1], {}).get('status') != RELEASED:
                raise Precond('row not released')
            table[key]['name' if target == 'items' else 'cname'] = self.new_name()
            s = self.next_seq()
            table[key]['chg_seq'] = s
        return s

    def ev_deprecate(self):
        if self.unapplied() or self.code['status'] == 'DEPRECATED':
            raise Precond('cannot deprecate')
        if not self.released_vers():
            raise Precond('no released')
        self.code['status'] = 'DEPRECATED'
        s = self.next_seq()
        self.code['chg_seq'] = s
        return s

    def ev_tick(self, n):
        self.now += n

    # --- 보내기
    def snapshot_rows(self, last):
        """chg_seq > last 인 행(가리기 적용)을 모아 돌려준다. 하나의 읽기 스냅샷."""
        def unapplied_ver(v):
            return v != INF and (v not in self.vers or self.vers[v]['status'] != RELEASED)

        out = {'vers': {}, 'items': {}, 'cates': {}, 'cate_items': {}, 'code': None}
        unapplied_from = {r['apply_from'] for r in self.vers.values()
                          if r['status'] in UNAPPLIED_STATUSES and r['apply_from'] is not None}
        for v, r in self.vers.items():
            if r['chg_seq'] is not None and r['chg_seq'] > last:
                rr = dict(r)
                if FIX_APPLY_TO and rr['status'] == RELEASED and rr['apply_to'] in unapplied_from:
                    rr['apply_to'] = DT_INF
                out['vers'][v] = rr
        for name, table in (('items', self.items), ('cates', self.cates), ('cate_items', self.cate_items)):
            for k, r in table.items():
                if r['chg_seq'] is not None and r['chg_seq'] > last:
                    rr = dict(r)
                    if unapplied_ver(rr['to_ver']):
                        rr['to_ver'] = INF
                    out[name][k] = rr
        if self.code['chg_seq'] is not None and self.code['chg_seq'] > last:
            out['code'] = dict(self.code)
        return out

    def bundle(self, last):
        rows = self.snapshot_rows(last)
        rows['last_chg_seq'] = self.last_chg_seq
        return rows

    def full_rows(self):
        """전체 방식(04-master-code-deploy-full.md): 행의 chg_seq 를 보지 않고 배포된 행 전부를 모은다.
        VER 은 RELEASED·CANCELLED, ITEM·CATE·CATE_ITEM 은 from_ver 가 RELEASED 인 행. 가리기 규칙은 같다."""
        def unapplied_ver(v):
            return v != INF and (v not in self.vers or self.vers[v]['status'] != RELEASED)

        out = {'vers': {}, 'items': {}, 'cates': {}, 'cate_items': {}, 'code': None}
        unapplied_from = {r['apply_from'] for r in self.vers.values()
                          if r['status'] in UNAPPLIED_STATUSES and r['apply_from'] is not None}
        for v, r in self.vers.items():
            if r['status'] in (RELEASED, CANCELLED):
                rr = dict(r)
                if FIX_APPLY_TO and rr['status'] == RELEASED and rr['apply_to'] in unapplied_from:
                    rr['apply_to'] = DT_INF
                out['vers'][v] = rr
        for name, table in (('items', self.items), ('cates', self.cates), ('cate_items', self.cate_items)):
            for k, r in table.items():
                if not unapplied_ver(k[-1]):
                    rr = dict(r)
                    if unapplied_ver(rr['to_ver']):
                        rr['to_ver'] = INF
                    out[name][k] = rr
        out['code'] = dict(self.code)
        out['last_chg_seq'] = self.last_chg_seq
        return out


# ───────────────────────────────────────────── 사본
class Copy:
    def __init__(self, name):
        self.name = name
        self.active = False
        self.last = 0
        self.vers, self.items, self.cates, self.cate_items = {}, {}, {}, {}
        self.code = {'status': 'CREATED', 'name': 'MC'}

    def apply(self, b, drop_check=True):
        # 옛 묶음 폐기: 묶음의 last_chg_seq 가 사본이 받은 순번보다 크지 않으면 통째로 버린다.
        # drop_check=False 는 한 트랜잭션 안에서 일어나는 부분 쓰기를 흉내 낼 때만 쓴다.
        if DROP_OLD_BUNDLE and drop_check and b['last_chg_seq'] <= self.last:
            return
        # 묶음 전체를 한 트랜잭션으로. 행은 PK upsert. 순서 무관.
        for v, r in b['vers'].items():
            self.vers[v] = dict(r)
        for name in ('items', 'cates', 'cate_items'):
            tbl = getattr(self, name)
            for k, r in b[name].items():
                tbl[k] = dict(r)
        if b['code'] is not None:
            self.code = dict(b['code'])
        for v, r in b['vers'].items():
            if r['status'] == CANCELLED:
                for name in ('items', 'cates', 'cate_items'):
                    tbl = getattr(self, name)
                    for k in [k for k in tbl if k[-1] == v]:
                        del tbl[k]
        self.last = b['last_chg_seq']

    def apply_full(self, b):
        # 전체 방식: 순번이 사본보다 작은 옛 묶음만 버린다(같으면 다시 적용해도 무해). 사본을 비우고 묶음으로 채운다. 한 트랜잭션.
        if b['last_chg_seq'] < self.last:
            return
        self.vers, self.items, self.cates, self.cate_items = {}, {}, {}, {}
        for v, r in b['vers'].items():
            self.vers[v] = dict(r)
        for name in ('items', 'cates', 'cate_items'):
            tbl = getattr(self, name)
            for k, r in b[name].items():
                tbl[k] = dict(r)
        self.code = dict(b['code'])
        self.last = b['last_chg_seq']


# ───────────────────────────────────────────── 원장의 "배포된 상태"
def deployed_view(L, mode='open'):
    """명세 3절. mode='open': 미적용 버전이 닫은 apply_to 는 9999 로 본다. 'raw': 원장 값 그대로."""
    st = Copy('ledger')
    approved_from = {r['apply_from'] for r in L.vers.values() if r['status'] in UNAPPLIED_STATUSES
                     and r['apply_from'] is not None}
    for v, r in L.vers.items():
        if r['status'] in (RELEASED, CANCELLED):
            rr = dict(r)
            if mode == 'open' and rr['status'] == RELEASED and rr['apply_to'] in approved_from:
                rr['apply_to'] = DT_INF
            st.vers[v] = rr
    released = {v for v, r in L.vers.items() if r['status'] == RELEASED}
    for name, table in (('items', L.items), ('cates', L.cates), ('cate_items', L.cate_items)):
        tbl = getattr(st, name)
        for k, r in table.items():
            if k[-1] in released:
                rr = dict(r)
                tv = rr['to_ver']
                if tv != INF and (tv not in L.vers or L.vers[tv]['status'] != RELEASED):
                    rr['to_ver'] = INF
                tbl[k] = rr
    st.code = dict(L.code)
    return st


# ───────────────────────────────────────────── 판정 (04-code-exists.sql 포팅)
def pick_ver(st, base_dt):
    cover = [v for v, r in st.vers.items() if r['status'] == RELEASED and r['apply_from'] <= base_dt < r['apply_to']]
    if len(cover) > 1:
        return ('MULTI', tuple(sorted(cover)))
    if cover:
        return cover[0]
    rel = [v for v, r in st.vers.items() if r['status'] == RELEASED]
    return min(rel) if rel else None


def pick_cate(st, cate, v):
    rows = [(k, r) for k, r in st.cates.items() if k[0] == cate]
    if not rows:
        return None
    min_from = min(k[1] for k, _ in rows)
    cand = [(k, r) for k, r in rows if (k[1] <= v < r['to_ver']) or (v < min_from)]
    if not cand:
        return None
    cand.sort(key=lambda kr: kr[0][1])
    k, r = cand[0]
    return {'kind': r['kind'], 'expr': r['expr'], 'eff_ver': max(k[1], v)}


def eval_table(st, v):
    """버전 v 에 대해 cate -> {code: name} (MASTER(마루 코드 대상) / CODE_LIST 둘 다 여기서 나온다)"""
    if v is None or isinstance(v, tuple):
        return {'_ver': v}
    codes = {k[0]: r['name'] for k, r in st.items.items() if k[1] <= v < r['to_ver']}
    out = {'_ver': v}
    for cate in CATES:
        c = pick_cate(st, cate, v)
        res = {}
        if c is not None:
            for code, name in codes.items():
                ok = False
                if c['kind'] == 'ALL':
                    ok = True
                elif c['kind'] == 'LIST':
                    ok = code in [x for x in c['expr'].replace(' ', '').split(',') if x]
                elif c['kind'] == 'REGEX':
                    ok = re.fullmatch('(' + c['expr'] + ')', code) is not None
                elif c['kind'] == 'TABLE':
                    ok = any(k[0] == cate and k[1] == code and k[2] <= c['eff_ver'] < r['to_ver']
                             for k, r in st.cate_items.items())
                if ok:
                    res[code] = name
        out[cate] = res
    return out


def judgments(st, dts):
    """base_dt -> (판정표, 목록 감춤 여부)"""
    cache = {}
    out = {}
    for dt in dts:
        v = pick_ver(st, dt)
        key = v
        if key not in cache:
            cache[key] = eval_table(st, v)
        out[dt] = cache[key]
    return out, st.code['status'] == 'DEPRECATED'


def compare(L, cp, dts, view_mode):
    """사본과 원장 배포 상태를 대조한다. 어긋남 목록을 돌려준다."""
    probs = []
    lv = deployed_view(L, view_mode)
    jl, hl = judgments(lv, dts)
    jc, hc = judgments(cp, dts)
    for dt in dts:
        a, b = jl[dt], jc[dt]
        if isinstance(b.get('_ver'), tuple):
            probs.append(('overlap', dt, b['_ver']))
            continue
        for cate in CATES:
            ea, eb = a.get(cate, {}), b.get(cate, {})
            if set(ea) != set(eb):
                probs.append(('judgment', dt, cate, 'ledger_ver=%s copy_ver=%s ledger=%s copy=%s'
                              % (a['_ver'], b['_ver'], sorted(ea), sorted(eb))))
            elif ea != eb:
                probs.append(('list_name', dt, cate, 'ledger=%s copy=%s' % (sorted(ea.items()), sorted(eb.items()))))
    if hl != hc:
        probs.append(('list_hidden', 'ledger=%s copy=%s' % (hl, hc)))
    # 미적용 흔적
    for v, r in cp.vers.items():
        if r['status'] not in (RELEASED, CANCELLED):
            probs.append(('trace', 'ver', v, r['status']))
    for name in ('items', 'cates', 'cate_items'):
        for k, r in getattr(cp, name).items():
            fv = k[-1]
            if fv not in cp.vers or cp.vers[fv]['status'] != RELEASED:
                probs.append(('orphan', name, k, 'from_ver not RELEASED in copy'))
            elif k not in getattr(lv, name):
                probs.append(('orphan', name, k, 'not in ledger deployed view'))
    return probs


def row_diff(L, cp, view_mode):
    """행 단위 대조(최종 동기화 뒤). 사본이 영원히 못 받는 변경을 찾는다."""
    lv = deployed_view(L, view_mode)
    diffs = []
    for name in ('vers', 'items', 'cates', 'cate_items'):
        a, b = getattr(lv, name), getattr(cp, name)
        for k in set(a) | set(b):
            ra, rb = a.get(k), b.get(k)
            if ra is None or rb is None:
                diffs.append((name, k, 'ledger=%s copy=%s' % (ra, rb)))
                continue
            fields = {'vers': ('status', 'apply_from', 'apply_to', 'desc'), 'items': ('to_ver', 'name'),
                      'cates': ('to_ver', 'kind', 'expr', 'cname'), 'cate_items': ('to_ver',)}[name]
            for f in fields:
                if ra[f] != rb[f]:
                    diffs.append((name, k, f, 'ledger=%s copy=%s' % (ra[f], rb[f])))
    for f in ('status', 'name'):
        if lv.code[f] != cp.code[f]:
            diffs.append(('code', f, 'ledger=%s copy=%s' % (lv.code[f], cp.code[f])))
    return diffs


# ───────────────────────────────────────────── 사건 실행
class World:
    def __init__(self, ncopies, mode, view_mode):
        self.L = Ledger()
        self.copies = [Copy('C%d' % i) for i in range(ncopies)]
        self.mode = mode
        self.view_mode = view_mode
        self.trace = []
        self.problems = []
        self.dts = None
        self.stats = collections.Counter()
        self.sent = collections.defaultdict(list)   # 사본별로 지금까지 보낸 묶음
        self.faultrng = random.Random(12345) if APPLY_FAULT else None

    def dts_range(self):
        afs = [r['apply_from'] for r in self.L.vers.values() if r['apply_from'] is not None]
        lo = min([0] + afs) - 2
        hi = max([self.L.now] + afs) + 3
        return list(range(lo, hi + 1))

    def sync(self, i, interleave=None):
        cp = self.copies[i]
        if not cp.active:
            raise Precond('inactive copy')
        if self.mode == 'full':
            b = self.L.full_rows()
            if APPLY_FAULT and self.faultrng is not None:
                r = self.faultrng.random()
                if r < 0.5:
                    # 부분 적용 뒤 재시도: 일부 행만 넣고 last 는 안 올린 상태에서 다시 전체 적용
                    part = {'vers': {}, 'items': {}, 'cates': {}, 'cate_items': {}, 'code': b['code'],
                            'last_chg_seq': cp.last}
                    for name in ('vers', 'items', 'cates', 'cate_items'):
                        for k, v in b[name].items():
                            if self.faultrng.random() < 0.5:
                                part[name][k] = v
                    cp.apply_full(part)
                    cp.apply_full(b)
                else:
                    cp.apply_full(b)
                    cp.apply_full(b)      # 같은 묶음 두 번(두 번째는 옛 묶음으로 버려진다)
            else:
                cp.apply_full(b)
            return b
        if self.mode == 'snapshot' or interleave is None:
            b = self.L.bundle(cp.last)
        elif self.mode == 'seq_then_rows':
            # 수정안: last_chg_seq 를 먼저 읽고(L), 그 사이 커밋이 끼어든 뒤, chg_seq <= L 로 행을 읽는다(READ COMMITTED)
            Lseq = self.L.last_chg_seq
            try:
                self.run_ledger_event(interleave)
                self.trace.append('  (커밋 끼어듦: sync %s 가 last_chg_seq 를 읽은 뒤, 행을 읽기 전에 %s 커밋)' % (cp.name, interleave))
            except Precond:
                pass
            rows = self.L.snapshot_rows(cp.last)
            for name in ('vers', 'items', 'cates', 'cate_items'):
                rows[name] = {k: r for k, r in rows[name].items() if r['chg_seq'] <= Lseq}
            if rows['code'] is not None and rows['code']['chg_seq'] > Lseq:
                rows['code'] = None
            rows['last_chg_seq'] = Lseq
            b = rows
        else:
            # 행을 먼저 읽고(스냅샷 1), 그 사이 다른 트랜잭션이 커밋한 뒤, last_chg_seq 를 읽는다(스냅샷 2)
            rows = self.L.snapshot_rows(cp.last)
            try:
                self.run_ledger_event(interleave)
                self.trace.append('  (커밋 끼어듦: sync %s 가 행을 읽은 뒤, last_chg_seq 를 읽기 전에 %s 커밋)' % (cp.name, interleave))
            except Precond:
                pass
            rows['last_chg_seq'] = self.L.last_chg_seq
            b = rows
        if APPLY_FAULT and self.faultrng is not None:
            r = self.faultrng.random()
            if r < 0.5:
                # 부분 적용(트랜잭션 실패 흉내): 일부 행만 넣고 last 는 안 올림. 그 뒤 같은 묶음을 다시 적용
                part = {'vers': {}, 'items': {}, 'cates': {}, 'cate_items': {}, 'code': None,
                        'last_chg_seq': cp.last}
                for name in ('vers', 'items', 'cates', 'cate_items'):
                    for k, v in b[name].items():
                        if self.faultrng.random() < 0.5:
                            part[name][k] = v
                cp.apply(part, drop_check=False)
                cp.apply(b)
            else:
                cp.apply(b)
                cp.apply(b)      # 같은 묶음 두 번
        else:
            cp.apply(b)
        self.sent[i].append(b)
        return b

    def run_ledger_event(self, ev):
        L = self.L
        k = ev[0]
        if k == 'new_ver':
            L.ev_new_ver(ev[1])
        elif k == 'edit':
            L.ev_edit(*ev[1:])
        elif k == 'request':
            L.ev_request(ev[1])
        elif k == 'reject':
            L.ev_reject()
        elif k == 'approve':
            L.ev_approve()
        elif k == 'approve_cancel':
            L.ev_approve_cancel()
        elif k == 'release':
            L.ev_release()
        elif k == 'cancel':
            L.ev_cancel()
        elif k == 'draft_delete':
            L.ev_draft_delete()
        elif k == 'patch':
            L.ev_patch(ev[1], ev[2])
        elif k == 'deprecate':
            L.ev_deprecate()
        elif k == 'tick':
            L.ev_tick(ev[1])
        else:
            raise ValueError(k)

    def run_event(self, ev):
        """사건 하나를 실행한다. 전제 조건이 안 맞으면 False."""
        k = ev[0]
        try:
            if k in ('sync', 'sync_split'):
                i = ev[1]
                self.sync(i, ev[2] if k == 'sync_split' else None)
                self.check(i, ev)
            elif k == 'stale':
                # 늦게 도착한 옛 묶음. 최신으로 맞춘 뒤 지난 묶음 하나가 뒤늦게 도착한다.
                i = ev[1]
                cp = self.copies[i]
                if not cp.active:
                    raise Precond('inactive copy')
                if not [x for x in self.sent[i] if x['last_chg_seq'] < cp.last]:
                    raise Precond('no old bundle')
                self.sync(i)
                old = [x for x in self.sent[i] if x['last_chg_seq'] < cp.last]
                if not old:
                    raise Precond('no old bundle')
                cp.apply(old[0])
                self.check(i, ev)
            elif k == 'add_copy':
                cp = self.copies[ev[1]]
                if cp.active:
                    raise Precond('already active')
                cp.active = True
                cp.last = 0           # 초기 적재. 사본 행은 지우지 않는다.
                self.sync(ev[1])
                self.check(ev[1], ev)
            elif k == 'remove_copy':
                cp = self.copies[ev[1]]
                if not cp.active:
                    raise Precond('already inactive')
                cp.active = False
            else:
                self.run_ledger_event(ev)
        except Precond:
            return False
        label = k
        if k == 'edit':
            label = 'edit:' + ev[1]
        elif k == 'new_ver' and ev[1] is not None:
            label = 'new_ver:restore'
        self.stats[label] += 1
        return True

    def check(self, i, ev):
        dts = self.dts_range()
        probs = compare(self.L, self.copies[i], dts, self.view_mode)
        if probs:
            self.problems.append((ev, probs))

    def final_check(self):
        for i, cp in enumerate(self.copies):
            if cp.active:
                self.sync(i)
                d = row_diff(self.L, cp, self.view_mode)
                if d:
                    self.problems.append((('final_sync', i), [('row_diff',) + x for x in d]))


# ───────────────────────────────────────────── 무작위 사건 생성
def gen_events(rng, n, ncopies, mode):
    """상태를 보며 그럴듯한 사건을 만든다. 실행은 replay 에서 다시 한다."""
    W = World(ncopies, mode, 'open')
    L = W.L
    events = []
    # 초기 적재 사본 1~2개는 처음부터 활성
    for i in range(ncopies):
        if rng.random() < 0.6:
            ev = ('add_copy', i)
            if W.run_event(ev):
                events.append(ev)
    while len(events) < n:
        choices = []
        d = L.draft()
        un = L.unapplied()
        rel = L.released_vers()
        if not un and L.code['status'] != 'DEPRECATED':
            choices += [('new_ver', None)] * 5
            if len(rel) >= 2:
                choices += [('new_ver', rng.choice(rel[:-1]))] * 2
        if d is not None:
            choices += [('edit',)] * 9 + [('request', rng.choice([1, 2, 3, 4]) if rel else rng.choice([-3, -1, 0, 1, 2]))] * 3
            choices += [('draft_delete',)] * 1
        if L.ver_with(REQUESTED) is not None:
            choices += [('approve',)] * 5 + [('reject',)] * 1
        if L.ver_with(APPROVED) is not None:
            choices += [('release',)] * 5 + [('approve_cancel',)] * 1
        if any(r['status'] == RELEASED and r['apply_from'] > L.now for r in L.vers.values()):
            choices += [('cancel',)] * 2
        choices += [('patch',)] * 3
        if rel and not un and L.code['status'] != 'DEPRECATED':
            choices += [('deprecate',)] * 1 if rng.random() < 0.15 else []
        choices += [('tick', rng.choice([1, 1, 2, 3]))] * 6
        for i in range(ncopies):
            if W.copies[i].active:
                choices += [('sync', i)] * 3
                if mode != 'full':
                    choices += [('stale', i)] * 2
                if mode in ('rows_then_seq', 'seq_then_rows'):
                    choices += [('sync_split', i)] * 2
                choices += [('remove_copy', i)] * 1
            else:
                choices += [('add_copy', i)] * 2
        ev = rng.choice(choices)
        if ev[0] == 'edit':
            ev = gen_edit(rng, L)
            if ev is None:
                continue
        elif ev[0] == 'patch':
            ev = gen_patch(rng, L)
            if ev is None:
                continue
        elif ev[0] == 'sync_split':
            inner = gen_patch(rng, L) if rng.random() < 0.5 else rng.choice([('release',), ('cancel',), ('deprecate',)])
            if inner is None:
                continue
            ev = ('sync_split', ev[1], inner)
        if W.run_event(ev):
            events.append(ev)
    return events


def gen_edit(rng, L):
    V = L.draft()
    kinds = ['add_item', 'close_item', 'mod_item', 'add_cate', 'mod_cate', 'close_cate', 'add_ci', 'close_ci', 'undo']
    w = [5, 3, 2, 3, 3, 1, 3, 2, 2]
    if not L.valid_at(L.cates, V):
        return ('edit', 'add_cate', 'BASE', 'ALL', '')
    kind = rng.choices(kinds, w)[0]
    code = rng.choice(CODES)
    cate = rng.choice(CATES)
    if kind in ('add_item', 'close_item', 'mod_item'):
        return ('edit', kind, code)
    if kind in ('add_cate', 'mod_cate'):
        ck = {'BASE': 'ALL', 'L': 'LIST', 'R': 'REGEX', 'T': 'TABLE'}[cate]
        if rng.random() < 0.2:
            ck = rng.choice(['ALL', 'LIST', 'REGEX', 'TABLE'])
        expr = ''
        if ck == 'LIST':
            expr = ', '.join(sorted(rng.sample(CODES, rng.randint(1, 3))))
        elif ck == 'REGEX':
            expr = rng.choice(REGEXES)
        return ('edit', kind, cate, ck, expr)
    if kind == 'close_cate':
        return ('edit', kind, cate)
    if kind in ('add_ci', 'close_ci'):
        tcs = [k[0] for k, r in L.valid_at(L.cates, V).items() if r['kind'] == 'TABLE']
        if not tcs:
            return ('edit', 'add_cate', 'T', 'TABLE', '')
        return ('edit', kind, rng.choice(tcs), code)
    if kind == 'undo':
        t = rng.choice(['items', 'cates', 'cate_items'])
        key = {'items': (code,), 'cates': (cate,), 'cate_items': (cate, code)}[t]
        return ('edit', 'undo', t, key)
    return None


def gen_patch(rng, L):
    r = rng.random()
    if r < 0.15:
        return ('patch', 'code', None)
    if r < 0.35:
        vs = L.released_vers()
        return ('patch', 'ver', rng.choice(vs)) if vs else None
    if r < 0.8:
        ks = [k for k in L.items if L.vers.get(k[-1], {}).get('status') == RELEASED]
        return ('patch', 'items', rng.choice(ks)) if ks else None
    ks = [k for k in L.cates if L.vers.get(k[-1], {}).get('status') == RELEASED]
    return ('patch', 'cates', rng.choice(ks)) if ks else None


# ───────────────────────────────────────────── 재생·최소화·트레이스
def replay(events, ncopies, mode, view_mode, final=True, trace=False):
    W = World(ncopies, mode, view_mode)
    for ev in events:
        ok = W.run_event(ev)
        if trace and ok:
            W.trace.append((ev, dump_ledger(W.L), {c.name: dump_copy(c) for c in W.copies if c.active}))
    if final:
        W.final_check()
    return W


def problem_kinds(W):
    return {p[0] for _, ps in W.problems for p in ps}


def minimize(events, ncopies, mode, view_mode, kind):
    def bad(evs):
        W = replay(evs, ncopies, mode, view_mode)
        return kind in problem_kinds(W)
    evs = list(events)
    changed = True
    while changed:
        changed = False
        i = 0
        while i < len(evs):
            cand = evs[:i] + evs[i + 1:]
            if bad(cand):
                evs = cand
                changed = True
            else:
                i += 1
    return evs


def fmt_dt(x):
    return 'INF' if x == DT_INF else str(x)


def dump_ledger(L):
    lines = ['now=%d last_chg_seq=%d code=%s/%s/seq%s' % (L.now, L.last_chg_seq, L.code['status'], L.code['name'],
                                                          L.code['chg_seq'])]
    for v in sorted(L.vers):
        r = L.vers[v]
        lines.append('  VER %s %s apply=[%s,%s) desc=%s seq=%s' % (v, r['status'], r['apply_from'],
                                                                   fmt_dt(r['apply_to']) if r['apply_to'] is not None else None,
                                                                   r['desc'], r['chg_seq']))
    for name, tbl in (('ITEM', L.items), ('CATE', L.cates), ('CI', L.cate_items)):
        for k in sorted(tbl):
            r = tbl[k]
            extra = ''
            if name == 'ITEM':
                extra = r['name']
            elif name == 'CATE':
                extra = '%s(%s)/%s' % (r['kind'], r['expr'], r['cname'])
            lines.append('  %s %s [%s,%s) %s seq=%s' % (name, k[:-1], k[-1], r['to_ver'], extra, r['chg_seq']))
    return '\n'.join(lines)


def dump_copy(c):
    lines = ['%s last=%d code=%s/%s' % (c.name, c.last, c.code['status'], c.code['name'])]
    for v in sorted(c.vers):
        r = c.vers[v]
        lines.append('  VER %s %s apply=[%s,%s) desc=%s' % (v, r['status'], r['apply_from'], fmt_dt(r['apply_to']), r['desc']))
    for name, tbl in (('ITEM', c.items), ('CATE', c.cates), ('CI', c.cate_items)):
        for k in sorted(tbl):
            r = tbl[k]
            extra = ''
            if name == 'ITEM':
                extra = r['name']
            elif name == 'CATE':
                extra = '%s(%s)/%s' % (r['kind'], r['expr'], r['cname'])
            lines.append('  %s %s [%s,%s) %s' % (name, k[:-1], k[-1], r['to_ver'], extra))
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', type=int, default=2000)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--events', type=int, default=70)
    ap.add_argument('--copies', type=int, default=3)
    ap.add_argument('--mode', choices=['snapshot', 'rows_then_seq', 'seq_then_rows', 'full'], default='snapshot',
                    help='full: 전체 방식(행 순번 없이 배포된 행 전부를 보내고 사본은 통째로 교체)')
    ap.add_argument('--deployed-view', choices=['open', 'raw'], default='open')
    ap.add_argument('--fix-apply-to', action='store_true', help='수정안: 미적용 버전이 닫은 apply_to 를 9999 로 보낸다')
    ap.add_argument('--apply-fault', action='store_true', help='묶음을 두 번 적용하거나 부분 적용 뒤 재시도한다')
    ap.add_argument('--drop-old-bundle', action='store_true',
                    help='수정안: 묶음의 last_chg_seq 가 사본의 last 보다 크지 않으면 통째로 버린다')
    ap.add_argument('--max-report', type=int, default=1, help='종류별로 보고할 최소화 시나리오 수')
    args = ap.parse_args()
    global FIX_APPLY_TO, APPLY_FAULT, DROP_OLD_BUNDLE
    FIX_APPLY_TO = args.fix_apply_to
    APPLY_FAULT = args.apply_fault
    DROP_OLD_BUNDLE = args.drop_old_bundle

    stats = collections.Counter()
    found = collections.OrderedDict()   # kind -> list of (seed, events)
    nbad = 0
    for run in range(args.runs):
        seed = args.seed * 100000 + run
        rng = random.Random(seed)
        events = gen_events(rng, args.events, args.copies, args.mode)
        W = replay(events, args.copies, args.mode, args.deployed_view)
        stats.update(W.stats)
        kinds = problem_kinds(W)
        if kinds:
            nbad += 1
            for k in kinds:
                found.setdefault(k, [])
                if len(found[k]) < args.max_report:
                    found[k].append((seed, events))

    print('runs=%d bad_runs=%d mode=%s deployed_view=%s' % (args.runs, nbad, args.mode, args.deployed_view))
    print('event stats:')
    for k, v in sorted(stats.items()):
        print('  %-18s %d' % (k, v))
    print('problem kinds:', {k: len(v) for k, v in found.items()} if found else 'none')

    for kind, lst in found.items():
        for seed, events in lst:
            evs = minimize(events, args.copies, args.mode, args.deployed_view, kind)
            print('\n' + '=' * 78)
            print('KIND=%s seed=%d  minimized %d -> %d events' % (kind, seed, len(events), len(evs)))
            W = replay(evs, args.copies, args.mode, args.deployed_view, trace=True)
            for step, entry in enumerate(W.trace, 1):
                if isinstance(entry, str):
                    print(entry)
                    continue
                ev, led, cps = entry
                print('\n--- step %d: %s' % (step, ev))
                print(led)
                for name, d in cps.items():
                    print(d)
            print('\nPROBLEMS:')
            for ev, ps in W.problems:
                print(' after', ev)
                for p in ps[:12]:
                    print('   ', p)
                if len(ps) > 12:
                    print('    ... %d more' % (len(ps) - 12))


if __name__ == '__main__':
    main()
