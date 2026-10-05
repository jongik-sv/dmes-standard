package kr.dongkuk.maru.mdm.engine.expr;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;

/**
 * 레코드 예약 키 검사(06:199·422·424). 대소문자를 가리지 않는다(EvalEx 변수 조회와 같다).
 * 상수 8종 → {@code CONSTANT_KEY}, {@code EVAL_TS} → {@code EVAL_TS_KEY}, {@code _} 접두 → {@code RESERVED_KEY}.
 */
public final class RecordKeys {

    private RecordKeys() {}

    /** 위반을 모두 모아 키 이름순으로 돌려준다. stage 는 INPUT_CHECK. 비었으면 통과다. */
    public static List<Violation> violations(Map<String, ?> record) {
        List<Violation> out = new ArrayList<>();
        if (record == null) {
            return out;
        }
        record.keySet().stream().sorted(Comparator.naturalOrder()).forEach(key -> {
            Code code = codeOf(key);
            if (code != null) {
                out.add(new Violation(Stage.INPUT_CHECK, code, null, null, key, message(code, key), List.of()));
            }
        });
        return out;
    }

    private static Code codeOf(String key) {
        String upper = key.toUpperCase(Locale.ROOT);
        if (ReservedNames.CONSTANTS.contains(upper)) {
            return Code.CONSTANT_KEY;
        }
        if (upper.equals(ReservedNames.EVAL_TS)) {
            return Code.EVAL_TS_KEY;
        }
        if (key.startsWith(ReservedNames.RESERVED_PREFIX)) {
            return Code.RESERVED_KEY;
        }
        return null;
    }

    private static String message(Code code, String key) {
        return switch (code) {
            case CONSTANT_KEY -> "레코드 키 '" + key + "' 는 표준 상수 이름이다";
            case EVAL_TS_KEY -> "레코드 키 '" + key + "' 는 평가 시각 예약 키다";
            default -> "레코드 키 '" + key + "' 는 '_' 로 시작하는 예약 키다";
        };
    }
}
