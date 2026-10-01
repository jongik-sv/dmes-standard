package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import org.junit.jupiter.api.Test;

/** 받는 노드 spec §1 — 코드 → 종류 표. flow 패키지는 expr 를 못 보므로 코드 이름 문자열로 두고, 여기서 실제 Code 와 맞춘다. */
class CatchKindTableTest {

    @Test
    void 표의_코드_이름은_모두_실제_위반_코드다() {
        Set<String> real = new TreeSet<>(Arrays.stream(Code.values()).map(Enum::name).toList());
        for (CatchKind k : CatchKind.values()) {
            for (String code : k.codes()) {
                assertTrue(real.contains(code), k + " 의 " + code + " 가 Code 에 없다");
            }
        }
    }

    @Test
    void 받는_코드와_받지_않는_코드() {
        assertEquals(Optional.of(CatchKind.INPUT_ERROR), CatchKind.ofCode("MISSING_KEY"));
        assertEquals(Optional.of(CatchKind.INPUT_ERROR), CatchKind.ofCode("REQUIRED_NULL"));
        assertEquals(Optional.of(CatchKind.INPUT_ERROR), CatchKind.ofCode("TYPE_CONVERSION"));
        assertEquals(Optional.of(CatchKind.EVAL_ERROR), CatchKind.ofCode("EVALUATION_ERROR"));
        assertEquals(Optional.of(CatchKind.HIT_CONFLICT), CatchKind.ofCode("UNIQUE_MULTIPLE_HITS"));
        assertEquals(Optional.of(CatchKind.HIT_CONFLICT), CatchKind.ofCode("ANY_CONFLICT"));
        for (String no : List.of("RULE_NOT_FOUND", "SET_NOT_FOUND", "SET_DEPRECATED", "FLOW_INVALID", "CONSTANT_KEY", "RESERVED_KEY",
                "EVAL_TS_KEY", "BRANCH_EVAL_ERROR", "EDIT_POINT_MISMATCH")) {
            assertEquals(Optional.empty(), CatchKind.ofCode(no), no);
        }
    }

    @Test
    void 저장_키는_이름_그대로이고_모르는_키는_비었다() {
        assertEquals(Optional.of(CatchKind.NO_RESULT), CatchKind.parse("NO_RESULT"));
        assertEquals(Optional.empty(), CatchKind.parse("no_result"));
        assertEquals(Optional.empty(), CatchKind.parse("BOOM"));
        assertEquals(Optional.empty(), CatchKind.parse(null));
    }
}
