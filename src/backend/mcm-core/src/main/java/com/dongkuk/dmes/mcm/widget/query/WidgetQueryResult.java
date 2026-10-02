package com.dongkuk.dmes.mcm.widget.query;

import java.util.List;
import java.util.Map;

/**
 * 쿼리 위젯 실행 결과(스펙 2026-10-02-widget-admin-generic §5.1 widgetData/run).
 *
 * @param columns   결과 컬럼 이름(SELECT 순서)
 * @param rows      행 — 컬럼 이름 → JSON 직렬화 가능한 값(문자열·숫자·불리언·null)
 * @param truncated 행 상한을 넘어 잘렸는지
 */
public record WidgetQueryResult(List<String> columns, List<Map<String, Object>> rows, boolean truncated) {}
