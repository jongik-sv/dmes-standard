package kr.dongkuk.maru.mdm.engine.expr;

import java.util.Set;

/**
 * 예약 이름 — 레코드 키로 쓰면 판정 오류(06-business-rule.md:199·422·424).
 */
public final class ReservedNames {

    /** EvalEx 3.7.0 표준 상수 여덟(대소문자 무시). allowOverwriteConstants=false 라 레코드 키로 오면 EvalEx 가 예외를 낸다. */
    public static final Set<String> CONSTANTS = Set.of(
            "NULL", "TRUE", "FALSE", "PI", "E",
            "DT_FORMAT_ISO_DATE_TIME", "DT_FORMAT_LOCAL_DATE_TIME", "DT_FORMAT_LOCAL_DATE");

    /** 평가 시각 예약 키. 값은 초 단위로 자른 {@link java.time.Instant}(EvalEx DATE_TIME). 식에서 직접 쓰지 못한다(06:422). */
    public static final String EVAL_TS = "EVAL_TS";

    /** {@code _} 로 시작하는 레코드 키는 판정 오류(06:424). 식 변수 값은 {@code _V<var_id>}. */
    public static final String RESERVED_PREFIX = "_";

    public static final String EXPR_VAR_PREFIX = "_V";

    /** 도메인 표준식의 검사 대상 변수(evalex-guide §7). */
    public static final String DOMAIN_VALUE = "value";

    /** 받는 노드 처리 갈래가 읽는 예약 이름(받는 노드 spec §4·X-D8). 처리 갈래 안에서만 ctx 에 있고, 레코드 키로 오면 RESERVED_KEY 다. */
    public static final String CATCH_KIND = "CATCH_KIND";
    public static final String CATCH_RULE = "CATCH_RULE";
    public static final String CATCH_CODE = "CATCH_CODE";
    public static final String CATCH_MSG = "CATCH_MSG";
    /** 위반이 난 가장 안쪽 세트 ID(하위 세트 spec §4.1, C-D7). 처리 갈래 안에서만 ctx 에 있다. */
    public static final String CATCH_SET = "CATCH_SET";
    /** 처리 갈래가 읽는 예약 이름 다섯. 레코드 키로 오면 RESERVED_KEY 이고 하위 세트 입력으로 넘기지 않는다. */
    public static final Set<String> CATCH_NAMES = Set.of(CATCH_KIND, CATCH_RULE, CATCH_CODE, CATCH_MSG, CATCH_SET);

    private ReservedNames() {}
}
