package com.dongkuk.dmes.mdm.common.rule;

import java.util.List;

/**
 * 룰 하나의 입출력 — 룰이 최신 RELEASED 버전에서 읽는 이름(conds)과 만드는 이름(results)(TSK-08-06 design §6.1·§6.5, D3·D4).
 * 정의는 엔진이 세트를 실행하기 전에 요구하는 키와 같다(자기 결과 이름 제외, 결과 열 그룹은 {@code resGrp}, EvalEx 상수 제외).
 * DB 에서 계산하는 곳은 {@code RuleIoReader} 한 곳이고, 세트 계산 {@link RuleSetAnalyzer}·{@link RuleSetGuide} 가 이것을 입력으로 받는다.
 *
 * @param exists      룰이 있는가. 없으면 나머지는 null·빈 목록
 * @param releasedVer 입출력을 계산한 RELEASED 버전. RELEASED 가 없으면 null 이고 conds·results 는 비어 있다
 * @param conds       읽는 이름(첫 등장 순). {@link IoName#source()} 는 {@link #DICT}·{@link #PROG}·{@link #NONE}
 * @param results     만드는 이름(첫 등장 순). {@link IoName#source()} 는 null
 * @param hasDefault  최신 RELEASED 버전에 기본(DEFAULT) 행이 있는가 — 받는 노드 검사 CATCH_NEVER(받는 노드 spec §5)가 쓴다
 */
public record RuleIo(
        String ruleId,
        String ruleName,
        String ruleKind,
        String status,
        boolean exists,
        Integer releasedVer,
        String hitPolicy,
        List<IoName> conds,
        List<IoName> results,
        boolean hasDefault) {

    /** 컬럼 사전에 그 물리명이 있다. */
    public static final String DICT = "DICT";
    /** 컬럼 사전에는 없고 룰이 조건 열에 도메인·데이터 타입을 선언했다(호출 프로그램이 넣는 값). */
    public static final String PROG = "PROG";
    /** 어디에도 없다. */
    public static final String NONE = "NONE";

    /** 기본 행 여부를 따지지 않는 곳(없는 룰·RELEASED 없는 룰·시험) — hasDefault=false. */
    public RuleIo(String ruleId, String ruleName, String ruleKind, String status, boolean exists, Integer releasedVer, String hitPolicy,
            List<IoName> conds, List<IoName> results) {
        this(ruleId, ruleName, ruleKind, status, exists, releasedVer, hitPolicy, conds, results, false);
    }

    /** 읽거나 만드는 이름 하나와 그 타입·표시명. NONE 이면 타입·표시명은 null 이다. */
    public record IoName(String name, String source, String label, String dataType, Integer scale, boolean dateString, String maruCodeId) {
    }
}
