#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 2 Fast Path: class_analysis.md → java_analysis.json

기존 커스텀 클래스 분석 보고서(class_analysis.md)를 파싱하여
java_analysis.json을 즉시 생성한다.

Exit codes:
  0 = 성공 (JSON 생성 완료)
  1 = 오류 (structure.json 없음 등)
  2 = 클래스 보고서 누락 (stderr에 JSON 출력)

Usage:
  python3 phase2-generator.py SERVICE-ID SERVICE-TYPE PROJECT-ROOT
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


def get_unique_classes(structure):
    """structure.json에서 중복 제거한 고유 커스텀 클래스 목록 반환"""
    custom_activities = structure.get('customActivities', [])
    if not custom_activities:
        return []
    # 중복 제거하되 순서 보존
    seen = set()
    unique = []
    for cls in custom_activities:
        if cls not in seen:
            seen.add(cls)
            unique.append(cls)
    return unique


def find_class_report(project_root, full_class_name):
    """커스텀 클래스 분석 보고서 경로 반환 (없으면 None)"""
    report_path = os.path.join(
        project_root, 'docs', 'analysis', 'service', 'customClass',
        '%s_class_analysis.md' % full_class_name)
    if os.path.exists(report_path):
        return report_path
    return None


def parse_header_table(content):
    """마크다운 헤더 테이블에서 key-value 추출"""
    result = {}
    # | 항목 | 내용 | 형태의 테이블 파싱
    table_pattern = re.compile(r'^\|\s*(.+?)\s*\|\s*(.+?)\s*\|', re.MULTILINE)
    for match in table_pattern.finditer(content):
        key = match.group(1).strip()
        value = match.group(2).strip()
        if key == '---' or key == '항목':
            continue
        result[key] = value
    return result


def extract_section(content, heading, next_heading_level=2):
    """특정 섹션의 내용 추출"""
    # ## N. 섹션명 형태
    pattern = r'(?:^|\n)#{%d}\s+(?:\d+\.\s+)?%s\s*\n(.*?)(?=\n#{1,%d}\s|\Z)' % (
        next_heading_level, re.escape(heading), next_heading_level)
    match = re.search(pattern, content, re.DOTALL)
    if match:
        return match.group(1).strip()
    # 더 유연한 매칭: heading이 포함된 경우
    pattern2 = r'(?:^|\n)#{%d}\s+[^#\n]*%s[^#\n]*\n(.*?)(?=\n#{1,%d}\s|\Z)' % (
        next_heading_level, re.escape(heading), next_heading_level)
    match2 = re.search(pattern2, content, re.DOTALL)
    if match2:
        return match2.group(1).strip()
    return ''


def extract_overview(content):
    """## 1. 클래스 개요 섹션에서 첫 문단(businessPurpose) 추출"""
    section = extract_section(content, '클래스 개요')
    if not section:
        return ''
    # 첫 비어있지 않은 텍스트 문단 추출 (마크다운 리스트나 테이블 전까지)
    lines = []
    for line in section.split('\n'):
        stripped = line.strip()
        if not stripped:
            if lines:
                break
            continue
        if stripped.startswith('#') or stripped.startswith('|') or stripped.startswith('-'):
            if lines:
                break
            continue
        if stripped.startswith('**') and stripped.endswith('**:'):
            if lines:
                break
            continue
        lines.append(stripped)
    return ' '.join(lines)


def extract_methods(content):
    """## 2. 메소드 상세 분석 섹션에서 methods 배열 추출"""
    section = extract_section(content, '메소드 상세 분석')
    if not section:
        return []

    methods = []
    # ### N.N 메소드명(파라미터) 패턴으로 메소드 분리
    method_splits = re.split(r'\n###\s+\d+\.\d+\s+', section)

    for method_block in method_splits[1:] if len(method_splits) > 1 else []:
        method = parse_method_block(method_block)
        if method:
            methods.append(method)

    # 메소드가 하나도 안 추출되면, 전체 섹션을 하나의 메소드로 처리
    if not methods and section:
        method = parse_method_block(section)
        if method:
            methods.append(method)

    return methods


def parse_method_block(block):
    """메소드 블록을 파싱하여 method dict 반환"""
    if not block.strip():
        return None

    lines = block.strip().split('\n')
    # 첫 줄에서 메소드명 추출
    first_line = lines[0].strip()
    # "### 2.1 runActivity(PosContext ctx)" 형태 정리
    first_line = re.sub(r'^#+\s*[\d.]*\s*', '', first_line)
    # "runActivity(PosContext ctx)" 또는 메소드명만
    method_name_match = re.match(r'(\w+)\s*\(', first_line)
    if method_name_match:
        method_name = method_name_match.group(1)
    else:
        method_name = first_line.split('(')[0].strip()

    # description: 메소드 블록 내 첫 번째 테이블이나 텍스트
    description = ''
    steps = []
    data_flow = {}

    # Step 패턴 추출: **Step N: ...** 형태
    step_pattern = re.compile(
        r'\*\*Step\s+(\d+):\s*(.+?)\*\*\s*(?:\(.*?\))?\s*\n(.*?)(?=\*\*Step\s+\d+:|\*\*에러 처리|\*\*데이터 흐름|\Z)',
        re.DOTALL)
    for step_match in step_pattern.finditer(block):
        order = int(step_match.group(1))
        step_desc = step_match.group(2).strip()
        step_detail = step_match.group(3).strip()
        # detail에서 코드 블록, 리스트 등을 정리
        detail_lines = []
        for line in step_detail.split('\n'):
            stripped = line.strip()
            if stripped.startswith('-'):
                detail_lines.append(stripped[1:].strip())
            elif stripped and not stripped.startswith('```'):
                detail_lines.append(stripped)
        step_obj = {
            'order': order,
            'description': step_desc
        }
        if detail_lines:
            step_obj['detail'] = ' '.join(detail_lines)
        steps.append(step_obj)

    # 데이터 흐름 추출
    data_flow_section = re.search(
        r'\*\*데이터 흐름[^*]*\*\*[:\s]*\n(.*?)(?=\n\*\*|\n##|\Z)', block, re.DOTALL)
    if data_flow_section:
        flow_text = data_flow_section.group(1)
        # 입력/출력 파싱 시도
        inputs = []
        outputs = []
        for line in flow_text.split('\n'):
            stripped = line.strip()
            if '->' in stripped or '→' in stripped:
                # 화살표가 있는 줄은 흐름 설명
                continue

    return {
        'name': method_name,
        'description': description or method_name,
        'steps': steps,
        'dataFlow': data_flow if data_flow else None
    }


def parse_class_report(report_path, full_class_name):
    """class_analysis.md를 파싱하여 customActivity 항목 생성"""
    with open(report_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 헤더 테이블 파싱
    header = parse_header_table(content)

    # 클래스명 추출
    class_name = full_class_name.split('.')[-1]

    # filePath
    file_path = header.get('파일 경로', '')
    if file_path.startswith('`') and file_path.endswith('`'):
        file_path = file_path[1:-1]

    # extends
    extends_val = header.get('상위 클래스', '')
    # "M47CommonActivity (extends DhtmlxActivity)" → "M47CommonActivity"
    extends_match = re.match(r'`?(\w+)`?', extends_val)
    extends_str = extends_match.group(1) if extends_match else extends_val

    # implements
    implements_val = header.get('구현 인터페이스', '')
    if implements_val.startswith('`') and implements_val.endswith('`'):
        implements_val = implements_val[1:-1]
    implements_list = [s.strip().strip('`') for s in implements_val.split(',') if s.strip()] if implements_val else []

    # businessPurpose
    business_purpose = extract_overview(content)

    # complexity (기본값)
    complexity = '중간'

    # methods
    methods = extract_methods(content)

    return {
        'className': class_name,
        'fullClassName': full_class_name,
        'filePath': file_path,
        'extends': extends_str,
        'implements': implements_list,
        'complexity': complexity,
        'businessPurpose': business_purpose,
        'methods': methods
    }


def build_activity_instance_mapping(structure, class_map):
    """structure.json activities에서 activityInstanceMapping 구성"""
    activities = structure.get('serviceStructure', {}).get('activities', [])
    custom_classes = set(structure.get('customActivities', []))
    mapping = []

    for act in activities:
        act_class = act.get('class', '')
        if act_class not in custom_classes:
            continue

        class_name = act_class.split('.')[-1]
        props = act.get('properties', {})
        transition = act.get('transition', '')
        purpose = act.get('name', '')

        entry = {
            'activityName': act.get('name', ''),
            'className': class_name,
            'sqlkey': props.get('sqlkey', ''),
            'dao': props.get('dao', ''),
            'transition': transition,
            'purpose': purpose
        }
        mapping.append(entry)

    return mapping


def build_class_to_activities_map(structure):
    """클래스별 사용 Activity Name 목록 생성"""
    activities = structure.get('serviceStructure', {}).get('activities', [])
    custom_classes = set(structure.get('customActivities', []))
    class_activities = {}

    for act in activities:
        act_class = act.get('class', '')
        if act_class not in custom_classes:
            continue
        if act_class not in class_activities:
            class_activities[act_class] = []
        class_activities[act_class].append(act.get('name', ''))

    return class_activities


def run_sql_mapping_integration(service_id, process_code, project_root, service_type):
    """sql_mapping_integration.py 실행"""
    script_path = os.path.join(project_root, 'docs', 'common', 'tools', 'sql_mapping_integration.py')
    output_dir = os.path.join(project_root, 'docs', 'analysis', 'service', service_type)

    if not os.path.exists(script_path):
        sys.stderr.write('WARN: sql_mapping_integration.py not found, skipping\n')
        return

    try:
        subprocess.run(
            [sys.executable, script_path, service_id, process_code, project_root, output_dir],
            cwd=project_root,
            timeout=30,
            capture_output=True
        )
    except Exception as e:
        sys.stderr.write('WARN: sql_mapping_integration.py failed: %s\n' % str(e))


def main():
    # --force 플래그 확인
    force = '--force' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--force']

    if len(args) < 3:
        print('Usage: python3 phase2-generator.py SERVICE-ID SERVICE-TYPE PROJECT-ROOT [--force]')
        sys.exit(1)

    service_id = args[0]
    service_type = args[1]  # 'ui' or 'nui'
    project_root = os.path.abspath(args[2])

    temp_dir = os.path.join(project_root, 'docs', 'analysis', 'service', service_type, '.temp')

    # 스킵 체크: java_analysis.json이 이미 존재하면 건너뛰기
    output_path = os.path.join(temp_dir, '%s_java_analysis.json' % service_id)
    if not force and os.path.exists(output_path):
        print('⏭️ Phase 2 스킵: 이미 존재함 → %s' % output_path)
        print('   재생성하려면 --force 옵션을 사용하세요.')
        sys.exit(0)

    # 1. structure.json 로드
    structure = load_structure(temp_dir, service_id)

    # 2. customActivities 빈 배열 → 최소 JSON 생성
    unique_classes = get_unique_classes(structure)
    if not unique_classes:
        minimal = {
            'analysisInfo': {
                'serviceId': service_id,
                'analysisType': 'java_phase2',
                'analysisDate': datetime.now().strftime('%Y-%m-%d'),
                'analysisModel': 'script:phase2-generator',
                'totalCustomActivities': 0,
                'uniqueCustomClasses': 0,
                'sourceServices': [service_id]
            },
            'customActivities': [],
            'activityInstanceMapping': []
        }
        output_path = os.path.join(temp_dir, '%s_java_analysis.json' % service_id)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(minimal, f, ensure_ascii=False, indent=2)
        print('Phase 2 Fast Path: customActivities empty, minimal JSON created')
        sys.exit(0)

    # 3. 각 클래스의 class_analysis.md 존재 확인
    missing = []
    found_reports = {}
    for full_class_name in unique_classes:
        report_path = find_class_report(project_root, full_class_name)
        if report_path:
            found_reports[full_class_name] = report_path
        else:
            missing.append(full_class_name)

    if missing:
        sys.stderr.write(json.dumps({'missing': missing}, ensure_ascii=False))
        sys.stderr.write('\n')
        print('Phase 2 Fast Path: %d class report(s) missing' % len(missing))
        sys.exit(2)

    # 4. 각 class_analysis.md 파싱 → customActivities 배열 구성
    class_activities_map = build_class_to_activities_map(structure)
    custom_activities = []

    for full_class_name in unique_classes:
        report_path = found_reports[full_class_name]
        activity_data = parse_class_report(report_path, full_class_name)

        # activityNames 추가
        activity_data['sourceService'] = service_id
        activity_data['activityNames'] = class_activities_map.get(full_class_name, [])

        # note 생성
        act_count = len(activity_data['activityNames'])
        if act_count > 1:
            activity_data['note'] = (
                '동일 클래스가 %d개 Activity 인스턴스에서 사용됨. '
                '각 인스턴스는 service XML의 property(sqlkey, dao)로 서로 다른 쿼리를 실행' % act_count
            )
        else:
            activity_data['note'] = ''

        custom_activities.append(activity_data)

    # 5. activityInstanceMapping 구성
    activity_instance_mapping = build_activity_instance_mapping(structure, found_reports)

    # 6. 총 Activity 수 계산
    total_custom = sum(len(ca['activityNames']) for ca in custom_activities)

    # 7. java_analysis.json 생성
    result = {
        'analysisInfo': {
            'serviceId': service_id,
            'analysisType': 'java_phase2',
            'analysisDate': datetime.now().strftime('%Y-%m-%d'),
            'analysisModel': 'script:phase2-generator (source: sonnet)',
            'totalCustomActivities': total_custom,
            'uniqueCustomClasses': len(unique_classes),
            'sourceServices': [service_id]
        },
        'customActivities': custom_activities,
        'activityInstanceMapping': activity_instance_mapping
    }

    output_path = os.path.join(temp_dir, '%s_java_analysis.json' % service_id)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print('Phase 2 Fast Path: java_analysis.json created (%d classes, %d activity instances)' % (
        len(unique_classes), total_custom))

    # 8. sql_mapping_integration.py 실행
    process_code = extract_process_code(service_id)
    run_sql_mapping_integration(service_id, process_code, project_root, service_type)

    sys.exit(0)


def extract_process_code(service_id):
    """서비스 ID에서 프로세스 코드 추출"""
    # M471010010 → m47, B47R1001 → m47
    if len(service_id) >= 3:
        num = service_id[1:3].lower()
        if num == '10':
            return 'c10'
        return 'm' + num
    return 'm47'


if __name__ == '__main__':
    main()
