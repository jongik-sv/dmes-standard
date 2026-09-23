package kr.dongkuk.maru.mdm.engine.expr;

import java.util.List;

/**
 * 엔진이 구현하는 커스텀 식 함수의 시그니처(06-business-rule.md:443-444, 05-master-data.md:363-400).
 * 이름 집합은 {@link FunctionSets#MDM} 과 같다. 구현({@code AbstractFunction})은 TSK-03-02 가 한다(TSK-03-01 design D7).
 *
 * <p>쓰는 곳: TSK-03-02 의 인자 수 선언, 저장 시 AST 검사의 초과 인자 거부(05:400), TSK-03-04 의 {@code isSupported}.
 * {@code CODE_LIST} 는 식 함수가 아니라 Java API {@code CodeResolver.codeList} 다(06:316).
 */
public enum MdmFunction {
    /** INSTR(s, sub) → NUMBER|NULL. 대소문자 구분, 1부터, 없으면 0, 인자가 NULL 이면 NULL. */
    INSTR(2, 2, List.of("s", "sub")),
    /** MASTER(id, cate, key) → BOOLEAN(EVAL_TS 에 유효), MASTER(id, cate, key, attr) → STRING|NULL. */
    MASTER(3, 4, List.of("id", "cate", "key", "attr")),
    /** MASTER_AT(id, cate, key, base_dt) → BOOLEAN(base_dt 에 유효), + attr → STRING|NULL. base_dt 는 YYYYMMDD·YYYYMMDDHHMMSS(KST). */
    MASTER_AT(4, 5, List.of("id", "cate", "key", "base_dt", "attr"));

    private final int minArgs;
    private final int maxArgs;
    private final List<String> paramNames;

    MdmFunction(int minArgs, int maxArgs, List<String> paramNames) {
        this.minArgs = minArgs;
        this.maxArgs = maxArgs;
        this.paramNames = paramNames;
    }

    /** 최소 인자 수. */
    public int minArgs() {
        return minArgs;
    }

    /** 최대 인자 수. 넘으면 저장 시 거부한다(05:400). */
    public int maxArgs() {
        return maxArgs;
    }

    /** 인자 이름(최대 인자 수만큼). 선택 인자는 뒤에 온다. */
    public List<String> paramNames() {
        return paramNames;
    }
}
