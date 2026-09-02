#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Analyze queries orchestrator - batch and query-id mode management for query analysis."""

import argparse
import json
import os
import re
import sys
from collections import OrderedDict
from datetime import datetime

# Import QueryCacheDB from query_cache.py
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
QUERY_CACHE_DIR = os.path.normpath(os.path.join(
    SCRIPT_DIR, '..', '..', '..', '..', 'docs', 'common', 'tools', 'query-cache'))
sys.path.insert(0, QUERY_CACHE_DIR)
from query_cache import QueryCacheDB, DEFAULT_DB_PATH, DEFAULT_QUERY_DIR

STATE_FILE = os.path.join(QUERY_CACHE_DIR, 'data', 'batch_state.json')
DEFAULT_BATCH_SIZE = 30

# SQL keywords to exclude when extracting table names
_SQL_KEYWORDS = {
    'SELECT', 'SET', 'VALUES', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'DUAL',
    'TABLE', 'INDEX', 'VIEW', 'AS', 'ON', 'IN', 'IS', 'BY', 'ASC', 'DESC',
    'THEN', 'ELSE', 'END', 'WHEN', 'CASE', 'EXISTS', 'ALL', 'ANY', 'BETWEEN',
    'LIKE', 'HAVING', 'GROUP', 'ORDER', 'DISTINCT', 'UNION', 'MINUS', 'INTERSECT',
}

TABLE_PATTERNS = [
    re.compile(r'\bFROM\s+([A-Z_]\w*(?:\.[A-Z_]\w*)?)', re.IGNORECASE),
    re.compile(r'\bJOIN\s+([A-Z_]\w*(?:\.[A-Z_]\w*)?)', re.IGNORECASE),
    re.compile(r'\bINTO\s+([A-Z_]\w*(?:\.[A-Z_]\w*)?)', re.IGNORECASE),
    re.compile(r'\bUPDATE\s+([A-Z_]\w*(?:\.[A-Z_]\w*)?)', re.IGNORECASE),
    re.compile(r'\bMERGE\s+INTO\s+([A-Z_]\w*(?:\.[A-Z_]\w*)?)', re.IGNORECASE),
]


def extract_table_names(sql):
    """Extract table/view names from SQL text."""
    names = set()
    for pattern in TABLE_PATTERNS:
        for m in pattern.finditer(sql):
            name = m.group(1).upper()
            names.add(name)
    # Also extract comma-separated tables in FROM clause
    for m in re.finditer(
        r'\bFROM\s+([\w.]+(?:\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+\w+)?)*)',
        sql, re.IGNORECASE
    ):
        for part in m.group(1).split(','):
            tokens = part.strip().split()
            if tokens:
                name = tokens[0].upper()
                names.add(name)
    return names - _SQL_KEYWORDS


def _enrich_with_table_columns(db, queries_dict):
    """Extract table names from queries' SQL, look up metadata, return tableColumns dict."""
    all_table_names = set()
    for qid, entry in queries_dict.items():
        sql = entry.get('sql', '') or ''
        tables = extract_table_names(sql)
        all_table_names.update(tables)

    if not all_table_names:
        return {}

    table_info = db.get_table_info(list(all_table_names), exclude_audit=True)

    # Simplify for output: only include tableComment and columns
    table_columns = {}
    for key, info in table_info.items():
        table_columns[key] = {
            "tableComment": info["tableComment"],
            "columns": info["columns"],
        }
    return table_columns


def _count_from_tables(sql_upper):
    """FROM 절에서 테이블 수를 세기 (서브쿼리 괄호 제외)."""
    max_count = 0
    for m in re.finditer(r'\bFROM\s+(.*?)(?:\bWHERE\b|\bGROUP\b|\bORDER\b|\bHAVING\b|\bUNION\b|$)', sql_upper, re.DOTALL):
        from_clause = m.group(1)
        # 서브쿼리 괄호 내부 제거
        depth = 0
        clean = []
        for ch in from_clause:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
            elif depth == 0:
                clean.append(ch)
        clean_from = ''.join(clean)
        tables = [t.strip() for t in clean_from.split(',') if t.strip()]
        max_count = max(max_count, len(tables))
    return max_count


def classify_sql_complexity(sql):
    """Oracle SQL 복잡도를 simple/medium/complex로 분류."""
    sql_upper = sql.upper()
    score = 0

    # CTE (WITH ... AS) - 고복잡도 지표
    if re.search(r'\bWITH\b\s+\w+\s+AS\s*\(', sql_upper):
        score += 3

    # UNION / UNION ALL
    if re.search(r'\bUNION\b', sql_upper):
        score += 2

    # 비즈니스 변환 함수
    if 'DECODE(' in sql_upper:
        score += 1
    if re.search(r'\bCASE\b\s+\bWHEN\b', sql_upper):
        score += 1

    # FROM 절 테이블 수 (Oracle 암시적 조인 대응)
    from_table_count = _count_from_tables(sql_upper)
    if from_table_count >= 5:
        score += 3
    elif from_table_count >= 3:
        score += 1

    # 서브쿼리 깊이 (SELECT 키워드 수)
    select_count = len(re.findall(r'\bSELECT\b', sql_upper))
    if select_count >= 4:
        score += 2
    elif select_count >= 2:
        score += 1

    # SQL 길이 (5000자 이상)
    if len(sql) > 5000:
        score += 1

    # 분석함수 (OVER, PARTITION BY)
    if re.search(r'\bOVER\s*\(', sql_upper):
        score += 1

    # 분류
    if score >= 4:
        return 'complex'
    elif score >= 2:
        return 'medium'
    return 'simple'


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def save_state(state):
    state_dir = os.path.dirname(STATE_FILE)
    if not os.path.exists(state_dir):
        os.makedirs(state_dir)
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def build_batches(query_rows, batch_size):
    """Group queries by source_file, then pack into batches of ~batch_size."""
    # Group by source_file preserving order
    file_groups = OrderedDict()
    for row in query_rows:
        sf = row['source_file']
        if sf not in file_groups:
            file_groups[sf] = []
        file_groups[sf].append(row['query_id'])

    batches = []
    current_ids = []
    current_files = set()

    for sf, qids in file_groups.items():
        if len(qids) > batch_size:
            # Flush current batch first
            if current_ids:
                batches.append({
                    'id': len(batches),
                    'queryIds': current_ids,
                    'sourceFiles': sorted(current_files),
                    'status': 'pending',
                    'analyzedAt': None,
                })
                current_ids = []
                current_files = set()
            # Split large file into chunks
            for i in range(0, len(qids), batch_size):
                chunk = qids[i:i + batch_size]
                batches.append({
                    'id': len(batches),
                    'queryIds': chunk,
                    'sourceFiles': [sf],
                    'status': 'pending',
                    'analyzedAt': None,
                })
        else:
            if len(current_ids) + len(qids) > batch_size:
                # Flush
                batches.append({
                    'id': len(batches),
                    'queryIds': current_ids,
                    'sourceFiles': sorted(current_files),
                    'status': 'pending',
                    'analyzedAt': None,
                })
                current_ids = []
                current_files = set()
            current_ids.extend(qids)
            current_files.add(sf)

    if current_ids:
        batches.append({
            'id': len(batches),
            'queryIds': current_ids,
            'sourceFiles': sorted(current_files),
            'status': 'pending',
            'analyzedAt': None,
        })

    return batches


def cmd_prepare(args):
    db = QueryCacheDB(args.db)
    try:
        # Step 1: sync
        query_dir = args.query_dir or os.environ.get('QUERY_DIR', DEFAULT_QUERY_DIR)
        if os.path.isdir(query_dir):
            sync_result = db.sync(query_dir)
            sys.stderr.write("Sync: +%d -%d ~%d (total %d)\n" % (
                sync_result['added'], sync_result['removed'],
                sync_result['updated'], sync_result['totalQueries']))

        # Step 2: determine target queries
        conn = db.conn
        scope = 'all'
        scope_value = None
        where_clauses = []
        params = []

        if args.file:
            scope = 'file'
            scope_value = args.file
            where_clauses.append("source_file = ?")
            params.append(args.file)
        elif args.pattern:
            scope = 'pattern'
            scope_value = args.pattern
            where_clauses.append("source_file LIKE ?")
            params.append(args.pattern)
        elif args.folder:
            scope = 'folder'
            scope_value = args.folder
            # folder filter: source_file path contains the folder name
            where_clauses.append("source_file LIKE ?")
            params.append('%' + args.folder + '%')

        # Step 3: mode filter
        mode = 'force' if args.force else 'update'
        if args.invalidate_below:
            mode = 'invalidate_below_%d' % args.invalidate_below
            where_clauses.append("(analysis_json IS NULL OR version IS NULL OR version < ?)")
            params.append(args.invalidate_below)
        elif not args.force:
            where_clauses.append("analysis_json IS NULL")

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
        query = "SELECT query_id, source_file FROM queries WHERE %s ORDER BY source_file, query_id" % where_sql
        rows = conn.execute(query, params).fetchall()
        target_rows = [{'query_id': r['query_id'], 'source_file': r['source_file']} for r in rows]

        total_all = conn.execute("SELECT COUNT(*) AS c FROM queries").fetchone()['c']

        # Step 4: build batches
        batch_size = args.batch_size or DEFAULT_BATCH_SIZE
        batches = build_batches(target_rows, batch_size)

        state = {
            'createdAt': datetime.now().isoformat(),
            'version': 1,
            'scope': scope,
            'scopeValue': scope_value,
            'mode': mode,
            'totalQueries': total_all,
            'totalToAnalyze': len(target_rows),
            'batchSize': batch_size,
            'batches': batches,
            'completedBatches': 0,
            'completedQueries': 0,
            'failedBatches': [],
            'failedQueries': [],
        }

        if not args.dry_run:
            save_state(state)

        # Output summary
        summary = {
            'scope': scope,
            'scopeValue': scope_value,
            'mode': mode,
            'totalQueries': total_all,
            'totalToAnalyze': len(target_rows),
            'totalBatches': len(batches),
            'batchSize': batch_size,
            'dryRun': args.dry_run,
        }
        if args.dry_run and batches:
            summary['batchPreview'] = [
                {'id': b['id'], 'queryCount': len(b['queryIds']), 'sourceFiles': b['sourceFiles']}
                for b in batches[:10]
            ]
            if len(batches) > 10:
                summary['batchPreview'].append({'note': '... and %d more batches' % (len(batches) - 10)})

        print(json.dumps(summary, ensure_ascii=False, indent=2))

    finally:
        db.close()


def cmd_fetch_batch(args):
    state = load_state()
    if state is None:
        sys.stderr.write("ERROR: No batch state found. Run 'prepare' first.\n")
        sys.exit(1)

    batch_id = args.batch_id
    batch = None
    for b in state['batches']:
        if b['id'] == batch_id:
            batch = b
            break

    if batch is None:
        sys.stderr.write("ERROR: Batch %d not found.\n" % batch_id)
        sys.exit(1)

    db = QueryCacheDB(args.db)
    try:
        queries = db.get_queries(batch['queryIds'])

        # Enrich with table column metadata
        table_columns = _enrich_with_table_columns(db, queries)

        result = {
            'batchId': batch_id,
            'sourceFiles': batch['sourceFiles'],
            'queryCount': len(batch['queryIds']),
            'queries': queries,
            'tableColumns': table_columns,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        db.close()


def cmd_save_batch(args):
    state = load_state()
    if state is None:
        sys.stderr.write("ERROR: No batch state found. Run 'prepare' first.\n")
        sys.exit(1)

    batch_id = args.batch_id
    batch_idx = None
    for i, b in enumerate(state['batches']):
        if b['id'] == batch_id:
            batch_idx = i
            break

    if batch_idx is None:
        sys.stderr.write("ERROR: Batch %d not found.\n" % batch_id)
        sys.exit(1)

    # Read analysis results from stdin
    stdin_data = sys.stdin.read().strip()
    if not stdin_data:
        sys.stderr.write("ERROR: No input from stdin.\n")
        sys.exit(1)

    try:
        analyses = json.loads(stdin_data)
    except ValueError as e:
        sys.stderr.write("ERROR: Invalid JSON: %s\n" % str(e))
        sys.exit(1)

    version = args.version or 1
    db = QueryCacheDB(args.db)
    try:
        saved, errors = db.set_analyses(analyses, version)

        # Update state
        batch = state['batches'][batch_idx]
        if errors:
            batch['status'] = 'failed'
            state['failedBatches'].append(batch_id)
            for err in errors:
                state['failedQueries'].append(err['queryId'])
        else:
            batch['status'] = 'completed'

        batch['analyzedAt'] = datetime.now().isoformat()
        state['completedBatches'] = sum(1 for b in state['batches'] if b['status'] == 'completed')
        state['completedQueries'] = sum(
            len(b['queryIds']) for b in state['batches'] if b['status'] == 'completed')

        save_state(state)

        total_batches = len(state['batches'])
        progress = {
            'batchId': batch_id,
            'saved': saved,
            'errors': errors,
            'progress': '%d/%d batches (%d/%d queries)' % (
                state['completedBatches'], total_batches,
                state['completedQueries'], state['totalToAnalyze']),
            'percentComplete': round(state['completedBatches'] * 100.0 / total_batches, 1) if total_batches > 0 else 0,
        }
        print(json.dumps(progress, ensure_ascii=False, indent=2))

    finally:
        db.close()


def cmd_fetch_queries(args):
    """Fetch specific queries by ID with their cached analysis status."""
    query_ids = args.query_ids
    if not query_ids:
        sys.stderr.write("ERROR: No query IDs provided.\n")
        sys.exit(1)

    db = QueryCacheDB(args.db)
    try:
        # Get query SQL texts
        queries_data = db.get_queries(query_ids)

        # Get cached analyses
        analyses_data = db.get_analyses(query_ids)

        # Build combined result
        result_queries = {}
        cached_count = 0
        missed_count = 0

        for qid in query_ids:
            entry = {}
            if qid in queries_data:
                entry['sql'] = queries_data[qid].get('sql', None)
                entry['description'] = queries_data[qid].get('description', None)
                entry['sourceFile'] = queries_data[qid].get('sourceFile', None)
            else:
                entry['sql'] = None
                entry['description'] = None
                entry['sourceFile'] = None

            # Check analysis cache
            cached_analysis = None
            if qid in analyses_data and analyses_data[qid].get('analysis') is not None:
                cached_analysis = analyses_data[qid]['analysis']
                cached_count += 1
            else:
                missed_count += 1

            entry['cachedAnalysis'] = cached_analysis
            result_queries[qid] = entry

        # Enrich with table column metadata
        table_columns = _enrich_with_table_columns(db, result_queries)

        result = {
            'queries': result_queries,
            'summary': {
                'total': len(query_ids),
                'cached': cached_count,
                'missed': missed_count,
            },
            'tableColumns': table_columns,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))

    finally:
        db.close()


def cmd_save_queries(args):
    """Save analysis results for specific queries (stdin JSON). No batch state used."""
    stdin_data = sys.stdin.read().strip()
    if not stdin_data:
        sys.stderr.write("ERROR: No input from stdin.\n")
        sys.exit(1)

    try:
        analyses = json.loads(stdin_data)
    except ValueError as e:
        sys.stderr.write("ERROR: Invalid JSON: %s\n" % str(e))
        sys.exit(1)

    if not analyses:
        print(json.dumps({'saved': 0, 'errors': []}, ensure_ascii=False))
        return

    version = args.version or 1
    db = QueryCacheDB(args.db)
    try:
        saved, errors = db.set_analyses(analyses, version)
        result = {
            'saved': saved,
            'errors': errors,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        db.close()


def cmd_classify(args):
    """Classify queries by SQL complexity for model selection."""
    query_ids = args.query_ids
    db = QueryCacheDB(args.db)
    try:
        queries = db.get_queries(query_ids)
        groups = {'simple': [], 'medium': [], 'complex': []}
        details = {}
        for qid in query_ids:
            if qid in queries and queries[qid].get('sql'):
                level = classify_sql_complexity(queries[qid]['sql'])
                groups[level].append(qid)
                details[qid] = level
            else:
                groups['simple'].append(qid)  # fallback
                details[qid] = 'simple'

        result = {
            'groups': groups,
            'details': details,
            'summary': {
                'total': len(query_ids),
                'simple': len(groups['simple']),
                'medium': len(groups['medium']),
                'complex': len(groups['complex']),
            }
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        db.close()


def cmd_table_info(args):
    """Look up table metadata and columns from queries.db."""
    table_names = args.table_names
    exclude_audit = not args.include_audit
    db = QueryCacheDB(args.db)
    try:
        result = db.get_table_info(table_names, exclude_audit=exclude_audit)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        db.close()


def cmd_status(args):
    state = load_state()
    if state is None:
        print(json.dumps({'status': 'no_batch_state', 'message': 'No batch state file found. Run prepare first.'}, ensure_ascii=False))
        return

    total_batches = len(state['batches'])
    pending = sum(1 for b in state['batches'] if b['status'] == 'pending')
    completed = sum(1 for b in state['batches'] if b['status'] == 'completed')
    failed = sum(1 for b in state['batches'] if b['status'] == 'failed')

    completed_queries = sum(
        len(b['queryIds']) for b in state['batches'] if b['status'] == 'completed')
    pending_queries = sum(
        len(b['queryIds']) for b in state['batches'] if b['status'] == 'pending')

    result = {
        'createdAt': state['createdAt'],
        'scope': state['scope'],
        'scopeValue': state.get('scopeValue'),
        'mode': state['mode'],
        'totalToAnalyze': state['totalToAnalyze'],
        'batches': {
            'total': total_batches,
            'completed': completed,
            'pending': pending,
            'failed': failed,
        },
        'queries': {
            'completed': completed_queries,
            'pending': pending_queries,
            'total': state['totalToAnalyze'],
        },
        'percentComplete': round(completed * 100.0 / total_batches, 1) if total_batches > 0 else 0,
        'failedBatches': state.get('failedBatches', []),
        'nextPendingBatch': None,
    }

    # Find next pending batch
    for b in state['batches']:
        if b['status'] == 'pending':
            result['nextPendingBatch'] = b['id']
            break

    print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description='Analyze queries orchestrator')
    parser.add_argument('--db', default=DEFAULT_DB_PATH, help='SQLite DB path')

    sub = parser.add_subparsers(dest='command')

    # prepare
    p_prepare = sub.add_parser('prepare', help='Create batch plan')
    p_prepare.add_argument('--file', help='Specific .glue_sql file')
    p_prepare.add_argument('--pattern', help='Source file LIKE pattern')
    p_prepare.add_argument('--folder', help='Folder name filter')
    p_prepare.add_argument('--force', action='store_true', help='Re-analyze all (ignore existing)')
    p_prepare.add_argument('--invalidate-below', type=int, help='Re-analyze below version N')
    p_prepare.add_argument('--batch-size', type=int, help='Queries per batch (default: %d)' % DEFAULT_BATCH_SIZE)
    p_prepare.add_argument('--query-dir', help='Query directory path')
    p_prepare.add_argument('--dry-run', action='store_true', help='Show plan only, do not save state')

    # fetch-batch
    p_fetch = sub.add_parser('fetch-batch', help='Fetch queries for a batch')
    p_fetch.add_argument('batch_id', type=int, help='Batch ID')

    # save-batch
    p_save = sub.add_parser('save-batch', help='Save analysis results for a batch (stdin)')
    p_save.add_argument('batch_id', type=int, help='Batch ID')
    p_save.add_argument('--version', type=int, default=1, help='Analysis version')

    # fetch-queries (new: query-id mode)
    p_fq = sub.add_parser('fetch-queries', help='Fetch specific queries with cached analysis status')
    p_fq.add_argument('query_ids', nargs='+', help='Query IDs to fetch')

    # save-queries (new: query-id mode)
    p_sq = sub.add_parser('save-queries', help='Save analysis results for specific queries (stdin)')
    p_sq.add_argument('--version', type=int, default=1, help='Analysis version')

    # classify
    p_classify = sub.add_parser('classify', help='Classify queries by SQL complexity')
    p_classify.add_argument('query_ids', nargs='+', help='Query IDs to classify')

    # table-info
    p_ti = sub.add_parser('table-info', help='Get table metadata and columns')
    p_ti.add_argument('table_names', nargs='+', help='Table names')
    p_ti.add_argument('--include-audit', action='store_true', help='Include audit columns')

    # status
    sub.add_parser('status', help='Show current progress')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    handlers = {
        'prepare': cmd_prepare,
        'fetch-batch': cmd_fetch_batch,
        'save-batch': cmd_save_batch,
        'fetch-queries': cmd_fetch_queries,
        'save-queries': cmd_save_queries,
        'classify': cmd_classify,
        'table-info': cmd_table_info,
        'status': cmd_status,
    }
    handlers[args.command](args)


if __name__ == '__main__':
    main()
