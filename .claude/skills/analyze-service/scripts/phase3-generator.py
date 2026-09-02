#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 3 Fast Path: query-cache + PL/SQL → sql_analysis.json

query-cache에서 분석 캐시를 조회하고, PL/SQL 보고서 존재 여부를 확인하여
sql_analysis.json을 즉시 생성한다.

Exit codes:
  0 = 성공 (JSON 생성 완료)
  1 = 오류 (structure.json 없음 등)
  2 = 미분석 항목 존재 (stderr에 JSON 출력)

Usage:
  python3 phase3-generator.py SERVICE-ID SERVICE-TYPE PROJECT-ROOT
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime


def load_structure(temp_dir, service_id):
    """structure.json 로드"""
    path = os.path.join(temp_dir, '%s_structure.json' % service_id)
    if not os.path.exists(path):
        sys.stderr.write('ERROR: structure.json not found: %s\n' % path)
        sys.exit(1)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def collect_sql_keys(structure):
    """structure.json에서 중복 제거된 SQL key 목록 수집

    세 소스에서 SQL 키를 수집한다:
    1. dataFlow.sqlQueries - XML 기반 SQL 키 (sqlkey + DAO SQL 프로퍼티 포함)
    2. dataFlow.javaSqlQueries - Java 기반 SQL 키
    3. dataFlow.potentialSqlQueries - DAO 기반 SQL 프로퍼티 상세 (fallback)
       update-sql, insert-sql, delete-sql, select-sql 등의 값
    """
    data_flow = structure.get('dataFlow', {})
    xml_keys = data_flow.get('sqlQueries', [])
    java_keys = data_flow.get('javaSqlQueries', [])

    # potentialSqlQueries fallback: 객체 배열에서 sqlKey 추출
    potential_keys = []
    for item in data_flow.get('potentialSqlQueries', []):
        if isinstance(item, dict) and item.get('sqlKey'):
            potential_keys.append(item['sqlKey'])
        elif isinstance(item, str):
            potential_keys.append(item)

    all_keys = list(dict.fromkeys(xml_keys + java_keys + potential_keys))  # 순서 보존 중복 제거
    return all_keys


def sync_query_cache(project_root):
    """query-cache sync 실행"""
    cache_script = os.path.join(
        project_root, 'docs', 'common', 'tools', 'query-cache', 'query_cache.py')
    if not os.path.exists(cache_script):
        sys.stderr.write('WARN: query_cache.py not found, skipping sync\n')
        return False
    try:
        result = subprocess.run(
            [sys.executable, cache_script, 'sync'],
            cwd=project_root,
            timeout=30,
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except Exception as e:
        sys.stderr.write('WARN: query-cache sync failed: %s\n' % str(e))
        return False


def fetch_queries(project_root, sql_keys):
    """orchestrator.py fetch-queries 실행하여 캐시 상태 조회"""
    orchestrator = os.path.join(
        project_root, '.claude', 'skills', 'analyze-queries', 'scripts', 'orchestrator.py')
    if not os.path.exists(orchestrator):
        sys.stderr.write('ERROR: orchestrator.py not found\n')
        sys.exit(1)

    try:
        cmd = [sys.executable, orchestrator, 'fetch-queries'] + sql_keys
        result = subprocess.run(
            cmd,
            cwd=project_root,
            timeout=30,
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            sys.stderr.write('ERROR: fetch-queries failed: %s\n' % result.stderr)
            sys.exit(1)
        return json.loads(result.stdout)
    except Exception as e:
        sys.stderr.write('ERROR: fetch-queries exception: %s\n' % str(e))
        sys.exit(1)


def detect_plsql_calls(queries_data):
    """쿼리 원문에서 PL/SQL 호출 감지

    전략: PL/SQL 호출 패턴만 감지하고, 일반 SQL 함수/테이블 참조는 제외.
    PL/SQL 명명 규칙: PL_, FUNC_, FC_, FN_, PKG_, SP_ 접두사를 가진 오브젝트.
    스키마 접두사가 있는 경우 (APSUSER.FUNC_xxx, MESAPUSER.FC_xxx)도 감지.
    """
    # PL/SQL 오브젝트 접두사 (패키지, 프로시저, 함수)
    PLSQL_PREFIXES = ('PL_', 'FUNC_', 'FC_', 'FN_', 'PKG_', 'SP_')

    # 알려진 스키마명 (스키마.오브젝트 패턴에서 스키마로 인식)
    KNOWN_SCHEMAS = {'MESAPUSER', 'APSUSER', 'EAIAPUSER', 'M00APUSER', 'C10APUSER', 'M90APUSER'}

    patterns = [
        # {call pkg.proc(...)} 또는 {? = call func(...)}
        re.compile(r'\{(?:\?\s*=\s*)?call\s+([A-Z_]\w*(?:\.[A-Z_]\w*)*)[\s(]', re.IGNORECASE),
        # CALL pkg.proc(...)
        re.compile(r'\bCALL\s+([A-Z_]\w*(?:\.[A-Z_]\w*)*)[\s(]', re.IGNORECASE),
        # BEGIN ... pkg.proc(...) ... END;
        re.compile(r'\bBEGIN\b[\s\S]*?([A-Z_]\w*\.[A-Z_]\w*)\s*\(', re.IGNORECASE),
        # schema.func_xxx(...) 또는 pkg_xxx.proc(...) — 3파트 또는 2파트 점 구분
        re.compile(r'\b([A-Z_]\w*\.[A-Z_]\w*(?:\.[A-Z_]\w*)?)\s*\(', re.IGNORECASE),
    ]

    detected = {}  # objectName → info
    queries = queries_data.get('queries', {})

    for qid, qinfo in queries.items():
        sql = qinfo.get('sql', '')
        if not sql:
            continue

        for pattern in patterns:
            for match in pattern.finditer(sql):
                full_call = match.group(1).strip()
                parts = full_call.split('.')

                schema_name = None
                obj_name = None
                proc_name = None

                if len(parts) == 3:
                    # schema.package.procedure
                    schema_name = parts[0].upper()
                    obj_name = parts[1].upper()
                    proc_name = parts[2].upper()
                elif len(parts) == 2:
                    p0 = parts[0].upper()
                    p1 = parts[1].upper()

                    # 단일 알파벳(1-2글자) → 테이블 alias, 스킵
                    if len(p0) <= 2 and p0.isalpha():
                        continue

                    if p0 in KNOWN_SCHEMAS:
                        # APSUSER.FUNC_APS_xxx → schema=APSUSER, obj=FUNC_APS_xxx
                        schema_name = p0
                        obj_name = p1
                        proc_name = None
                    else:
                        # PL_xxx.proc → schema=MESAPUSER, obj=PL_xxx, proc=proc
                        schema_name = 'MESAPUSER'
                        obj_name = p0
                        proc_name = p1
                elif len(parts) == 1:
                    obj_name = parts[0].upper()
                    schema_name = 'MESAPUSER'
                else:
                    continue

                if not obj_name:
                    continue

                # PL/SQL 오브젝트인지 판별: 접두사 기반
                is_plsql = any(obj_name.startswith(p) for p in PLSQL_PREFIXES)

                if not is_plsql:
                    # 테이블/뷰/일반 함수 → 스킵
                    continue

                key = obj_name
                if proc_name:
                    call_type = 'PACKAGE_MEMBER'
                    full_call_str = '%s.%s' % (obj_name, proc_name)
                else:
                    call_type = 'STANDALONE'
                    full_call_str = obj_name

                if key not in detected:
                    detected[key] = {
                        'objectName': obj_name,
                        'procedureName': proc_name,
                        'callType': call_type,
                        'fullCall': full_call_str,
                        'schemaName': schema_name,
                        'detectedIn': qid
                    }
                else:
                    # detectedIn에 qid 추가
                    existing = detected[key].get('detectedIn', '')
                    if qid not in existing:
                        detected[key]['detectedIn'] = '%s, %s' % (existing, qid)

    return list(detected.values())


def find_plsql_report(project_root, obj_name, schema_name='MESAPUSER'):
    """기존 PL/SQL 분석 보고서 찾기"""
    search_dirs = ['package', 'storedProcedure', 'function']
    for sub_dir in search_dirs:
        report_path = os.path.join(
            project_root, 'docs', 'analysis', 'dbms', schema_name,
            sub_dir, '%s_analysis_report.md' % obj_name)
        if os.path.exists(report_path):
            return report_path
    return None


def build_plsql_calls(project_root, detected_objects):
    """PL/SQL 호출 정보 구성, 미분석 항목 반환"""
    missing_plsql = []
    calls = []

    for obj in detected_objects:
        obj_name = obj['objectName']
        schema_name = obj.get('schemaName', 'MESAPUSER')
        report_path = find_plsql_report(project_root, obj_name, schema_name)

        call_info = {
            'objectName': obj_name,
            'procedureName': obj.get('procedureName'),
            'callType': obj['callType'],
            'fullCall': obj['fullCall'],
            'schemaName': schema_name,
            'detectedIn': obj.get('detectedIn', ''),
            'analyzed': report_path is not None,
            'reportPath': report_path
        }
        calls.append(call_info)

        if report_path is None:
            missing_plsql.append({
                'objectName': obj_name,
                'schemaName': schema_name,
                'callType': obj['callType']
            })

    return calls, missing_plsql


def build_query_details(queries_data, sql_keys, xml_keys, java_keys):
    """cachedAnalysis를 queryDetails 배열로 변환"""
    queries = queries_data.get('queries', {})
    query_details = []

    for qid in sql_keys:
        qinfo = queries.get(qid, {})
        cached = qinfo.get('cachedAnalysis')

        if cached:
            # cachedAnalysis를 그대로 사용하되 queryId 보장
            detail = dict(cached)
            if 'queryId' not in detail:
                detail['queryId'] = qid
            # sources 필드 보강
            sources = []
            if qid in xml_keys:
                sources.append('XML')
            if qid in java_keys:
                sources.append('Java')
            if sources:
                detail['sources'] = sources
                detail['isFromXml'] = 'XML' in sources
                detail['isFromJava'] = 'Java' in sources
        else:
            # 캐시 없음 → 최소 정보
            sources = []
            if qid in xml_keys:
                sources.append('XML')
            if qid in java_keys:
                sources.append('Java')
            detail = {
                'queryId': qid,
                'description': qinfo.get('description', ''),
                'queryType': 'UNKNOWN',
                'sources': sources,
                'isFromXml': 'XML' in sources,
                'isFromJava': 'Java' in sources,
                'parameters': [],
                'tables': [],
                'columns': [],
                'joins': [],
                'businessPurpose': '',
                'queryLogic': '',
                'performanceInfo': {}
            }

        query_details.append(detail)

    return query_details


def main():
    # --force 플래그 확인
    force = '--force' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--force']

    if len(args) < 3:
        print('Usage: python3 phase3-generator.py SERVICE-ID SERVICE-TYPE PROJECT-ROOT [--force]')
        sys.exit(1)

    service_id = args[0]
    service_type = args[1]  # 'ui' or 'nui'
    project_root = os.path.abspath(args[2])

    temp_dir = os.path.join(project_root, 'docs', 'analysis', 'service', service_type, '.temp')

    # 스킵 체크: sql_analysis.json이 이미 존재하면 건너뛰기
    output_path = os.path.join(temp_dir, '%s_sql_analysis.json' % service_id)
    if not force and os.path.exists(output_path):
        print('⏭️ Phase 3 스킵: 이미 존재함 → %s' % output_path)
        print('   재생성하려면 --force 옵션을 사용하세요.')
        sys.exit(0)

    # 1. structure.json 로드
    structure = load_structure(temp_dir, service_id)

    # 2. SQL keys 수집
    sql_keys = collect_sql_keys(structure)
    if not sql_keys:
        # SQL key 없음 → 최소 JSON 생성
        minimal = {
            'serviceInfo': {
                'serviceId': service_id,
                'serviceName': '%s-service' % service_id,
                'processCode': extract_process_code(service_id),
                'analysisDate': datetime.now().strftime('%Y-%m-%d'),
                'analysisModel': 'script:phase3-generator',
                'numberOfQuery': 0
            },
            'sqlAnalysis': {
                'totalQueries': 0,
                'queryDetails': []
            }
        }
        output_path = os.path.join(temp_dir, '%s_sql_analysis.json' % service_id)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(minimal, f, ensure_ascii=False, indent=2)
        print('Phase 3 Fast Path: no SQL keys, minimal JSON created')
        sys.exit(0)

    # 3. query-cache sync
    sync_query_cache(project_root)

    # 4. orchestrator fetch-queries
    fetch_result = fetch_queries(project_root, sql_keys)
    summary = fetch_result.get('summary', {})
    missed_count = summary.get('missed', 0)

    # missed 쿼리 목록 추출
    missed_queries = []
    queries = fetch_result.get('queries', {})
    for qid, qinfo in queries.items():
        if qinfo.get('cachedAnalysis') is None:
            missed_queries.append(qid)

    # 5. PL/SQL 호출 감지
    detected_objects = detect_plsql_calls(fetch_result)

    # 6. PL/SQL 보고서 존재 확인
    plsql_calls, missing_plsql = build_plsql_calls(project_root, detected_objects)

    # 7. 누락 항목 종합
    # PL/SQL 누락은 exit 2 트리거하지 않음 (analyzed=false로 JSON에 포함)
    if missed_queries:
        missing_info = {'missedQueries': missed_queries}
        if missing_plsql:
            missing_info['missingPlsql'] = missing_plsql
        sys.stderr.write(json.dumps(missing_info, ensure_ascii=False))
        sys.stderr.write('\n')
        print('Phase 3 Fast Path: %d missed queries, %d missing PL/SQL' % (
            len(missed_queries), len(missing_plsql)))
        sys.exit(2)

    # PL/SQL만 누락인 경우 → 경고만 출력하고 JSON 생성 진행
    if missing_plsql:
        info = {'missingPlsql': missing_plsql}
        sys.stderr.write('WARN: %d PL/SQL reports missing (will include as analyzed=false)\n' % len(missing_plsql))
        sys.stderr.write(json.dumps(info, ensure_ascii=False))
        sys.stderr.write('\n')

    # 8. 모든 항목 존재 → sql_analysis.json 생성
    data_flow = structure.get('dataFlow', {})
    xml_keys = set(data_flow.get('sqlQueries', []))
    java_keys = set(data_flow.get('javaSqlQueries', []))

    query_details = build_query_details(fetch_result, sql_keys, xml_keys, java_keys)

    # plsqlCalls 구성
    plsql_section = {
        'totalDetected': len(plsql_calls),
        'totalAnalyzed': sum(1 for c in plsql_calls if c['analyzed']),
        'totalSkipped': sum(1 for c in plsql_calls if not c['analyzed']),
        'detectedCalls': plsql_calls
    }

    result = {
        'serviceInfo': {
            'serviceId': service_id,
            'serviceName': '%s-service' % service_id,
            'processCode': extract_process_code(service_id),
            'analysisDate': datetime.now().strftime('%Y-%m-%d'),
            'analysisModel': 'script:phase3-generator (source: haiku/sonnet)',
            'numberOfQuery': len(sql_keys)
        },
        'sqlAnalysis': {
            'totalQueries': len(sql_keys),
            'queryDetails': query_details
        },
        'plsqlCalls': plsql_section
    }

    output_path = os.path.join(temp_dir, '%s_sql_analysis.json' % service_id)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print('Phase 3 Fast Path: sql_analysis.json created (%d queries, %d PL/SQL calls)' % (
        len(sql_keys), len(plsql_calls)))
    sys.exit(0)


def extract_process_code(service_id):
    """서비스 ID에서 프로세스 코드 추출"""
    if len(service_id) >= 3:
        num = service_id[1:3].lower()
        if num == '10':
            return 'c10'
        return 'm' + num
    return 'm47'


if __name__ == '__main__':
    main()
