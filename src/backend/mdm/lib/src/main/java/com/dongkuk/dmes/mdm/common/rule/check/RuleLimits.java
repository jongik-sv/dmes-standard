package com.dongkuk.dmes.mdm.common.rule.check;

import kr.dongkuk.maru.mdm.engine.rule.CellTextGenerator;

/**
 * 룰 저장·값 테스트·테스트 케이스가 함께 쓰는 상한(TSK-08-04 design D6). 06 이 정한 것은 {@code %} 3개뿐이고 나머지는 06 미결
 * 「상한값」(06:385)을 이 Task 가 정한 값이다. 상한과 같으면 통과, 넘으면 거부한다(I23).
 *
 * 2026-09-29 — 행 수·셀 합 상한을 올렸다(500 → 5,000행, 1MB → 8MB). 레거시 룰 C10B1040 이 2,599행·셀 JSON 약 2.5MB 라
 * 표 저장은 늘 표 전체를 보내므로 옛 상한으로는 한 번도 저장할 수 없었다. 행 하나 상한(16,384자)은 그 룰의 최대 1,452자로 충분해 그대로 둔다.
 */
public final class RuleLimits {

    /** 저장 요청 한 번의 행 수. */
    public static final int MAX_ROWS = 5_000;
    /** 행 하나의 {@code cells} JSON 문자열 길이. */
    public static final int MAX_ROW_CELLS_CHARS = 16_384;
    /** 요청 한 번의 {@code cells} 문자열 길이 합. */
    public static final int MAX_TOTAL_CELLS_CHARS = 8_388_608;
    /** 값 테스트 입력 JSON 길이. */
    public static final int MAX_INPUT_JSON_CHARS = 16_384;
    /** 값 테스트 입력 JSON 의 키 수. */
    public static final int MAX_INPUT_KEYS = 200;
    /** IN·NOT IN 원소 수(중복 제거 뒤). */
    public static final int MAX_LIST_ELEMENTS = 100;
    /** {@code =} 패턴 길이(연속 {@code %} 를 접은 뒤). */
    public static final int MAX_PATTERN_CHARS = 100;
    /** 접은 뒤 막지 않은 {@code %} 개수(06:158 고정값). */
    public static final int MAX_PATTERN_WILDCARDS = CellTextGenerator.MAX_PATTERN_WILDCARDS;
    /** CONTAINS·INSTR·IN 카테고리 값 길이. */
    public static final int MAX_TEXT_CHARS = 100;
    /** Expression 셀·결과 식 텍스트 길이. */
    public static final int MAX_EXPR_CHARS = 2_000;
    /** 룰 하나의 테스트 케이스 수. */
    public static final int MAX_CASES_PER_RULE = 100;
    /** 테스트 케이스 이름 길이. */
    public static final int MAX_CASE_NAME_CHARS = 100;
    /** 테스트 케이스 입력·기대 JSON 길이(각각). */
    public static final int MAX_CASE_JSON_CHARS = 16_384;

    private RuleLimits() {
    }
}
