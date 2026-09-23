package kr.dongkuk.maru.mdm.engine.expr;

import java.util.Set;

/**
 * 허용 함수 집합(06-business-rule.md:443, evalex-guide §8.5 1항, 02 「검증식 계약」).
 * 이름은 대문자. EvalEx 함수 사전은 대소문자를 가리지 않는다.
 */
public final class FunctionSets {

    /** evalex-guide §8.5 목록. STR_* 는 3.7.0 표준 사전에서 STR_FORMAT·STR_SPLIT 을 뺀 11개(TSK-02-02 design D1). */
    public static final Set<String> BASE = Set.of(
            "IF", "SWITCH", "COALESCE", "NOT",
            "ABS", "CEILING", "FLOOR", "SQRT", "ROUND", "MIN", "MAX", "SUM", "AVERAGE",
            "STR_LENGTH", "STR_UPPER", "STR_LOWER", "STR_TRIM", "STR_LEFT", "STR_RIGHT", "STR_SUBSTRING",
            "STR_CONTAINS", "STR_STARTS_WITH", "STR_ENDS_WITH", "STR_MATCHES");

    /** 엔진 모듈이 구현하는 커스텀 함수(06:443-444). */
    public static final Set<String> MDM = Set.of("INSTR", "MASTER", "MASTER_AT");

    /** 표준 칸용 = BASE ∪ MDM(06:443). */
    public static final Set<String> STANDARD = Set.of(
            "IF", "SWITCH", "COALESCE", "NOT",
            "ABS", "CEILING", "FLOOR", "SQRT", "ROUND", "MIN", "MAX", "SUM", "AVERAGE",
            "STR_LENGTH", "STR_UPPER", "STR_LOWER", "STR_TRIM", "STR_LEFT", "STR_RIGHT", "STR_SUBSTRING",
            "STR_CONTAINS", "STR_STARTS_WITH", "STR_ENDS_WITH", "STR_MATCHES",
            "INSTR", "MASTER", "MASTER_AT");

    /** op-code 생성기가 만드는 텍스트에 나올 수 있는 함수(06:135-145·257). 생성기 회귀 테스트가 이 밖을 막는다. */
    public static final Set<String> GENERATED = Set.of("STR_MATCHES", "STR_STARTS_WITH", "STR_ENDS_WITH", "INSTR", "MASTER");

    /** 식 칸. 칸이 허용 집합과 변수 제한을 정한다. */
    public enum Slot {
        /** 도메인 표준식(std_rule) — STANDARD, 변수는 {@code value} 하나(evalex-guide §7, 02 「검증식 계약」). */
        DOMAIN_STD(false, true),
        /** 도메인 비즈니스식(biz_rule) — STANDARD ∪ 비즈니스 함수, 서버 전용. */
        DOMAIN_BIZ(true, false),
        /** 룰 Expression 조건 셀. */
        RULE_COND_EXPR(false, false),
        /** 룰 결과 Expression 셀(DERIVE 결과식 포함). */
        RULE_RESULT_EXPR(false, false),
        /** 식 변수(var_ast, 06:119). */
        RULE_EXPR_VAR(false, false),
        /** 결과 열 그룹의 열 조건(grp_cond). */
        RULE_GRP_COND(false, false);

        private final boolean businessFunctions;
        private final boolean valueOnly;

        Slot(boolean businessFunctions, boolean valueOnly) {
            this.businessFunctions = businessFunctions;
            this.valueOnly = valueOnly;
        }

        /** 비즈니스 함수(FunctionProvider)를 허용하는가. false 면 STANDARD 만. */
        public boolean businessFunctions() {
            return businessFunctions;
        }

        /** 변수를 {@code value} 하나로 제한하는가. */
        public boolean valueOnly() {
            return valueOnly;
        }
    }

    private FunctionSets() {}
}
