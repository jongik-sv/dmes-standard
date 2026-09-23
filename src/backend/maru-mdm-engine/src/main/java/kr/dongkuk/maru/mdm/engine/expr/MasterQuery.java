package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.parser.Token;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.Optional;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.code.CodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;

/**
 * {@code MASTER}·{@code MASTER_AT} 이 공유하는 조회 코드 하나(06:444, 05:363-400, engine-contract §7).
 * 첫 인자 ID 가 {@link CodeLookup#code} 에 있으면 마루 코드 대상({@link CodeResolver}), 없으면 마루 데이터 대상
 * ({@link MasterLookup})이다. 두 원장은 한 이름 공간이다(05:409).
 */
final class MasterQuery {

    private static final String BASE = "BASE";
    private static final Pattern ATTR = Pattern.compile("attr(0[1-9]|10)");
    private static final Pattern DATE_8 = Pattern.compile("[0-9]{8}");
    private static final Pattern DATE_TIME_14 = Pattern.compile("[0-9]{14}");
    private static final DateTimeFormatter YYYYMMDD =
            DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter YYYYMMDDHHMMSS =
            DateTimeFormatter.ofPattern("uuuuMMddHHmmss").withResolverStyle(ResolverStyle.STRICT);

    private final CodeLookup codes;
    private final CodeResolver resolver;
    private final MasterLookup masters;

    MasterQuery(CodeLookup codes, CodeResolver resolver, MasterLookup masters) {
        this.codes = codes;
        this.resolver = resolver;
        this.masters = masters;
    }

    /**
     * @param attr 속성 형태면 넷째(MASTER)·다섯째(MASTER_AT) 인자, 불리언 형태면 null
     * @param baseDt 기준 시각(KST). null 이면 {@code MASTER_AT} 의 base_dt 가 NULL 이다 — 불리언 false, 속성 NULL
     */
    EvaluationValue query(Token token, EvaluationValue id, EvaluationValue cate, EvaluationValue key,
                          LocalDateTime baseDt, EvaluationValue attr) throws EvaluationException {
        String maruId = requireString(token, id, "id");
        String cateId = cate.isNullValue() ? BASE : requireString(token, cate, "cate");
        if (cateId.isEmpty()) {
            cateId = BASE;
        }
        Integer attrNo = attr == null ? null : attrNo(token, attr);
        String keyText = keyText(token, key);
        if (keyText == null || baseDt == null) {
            return attrNo == null ? EvaluationValue.booleanValue(false) : EvaluationValue.NULL_VALUE;
        }
        boolean isCode = codes.code(maruId).isPresent();
        if (attrNo == null) {
            return EvaluationValue.booleanValue(isCode
                    ? resolver.isMember(maruId, cateId, keyText, baseDt)
                    : masters.isValid(maruId, cateId, keyText, baseDt));
        }
        Optional<String> value = isCode
                ? resolver.attr(maruId, cateId, keyText, baseDt, attrNo)
                : masters.attr(maruId, cateId, keyText, baseDt, attrNo);
        return value.map(EvaluationValue::stringValue).orElse(EvaluationValue.NULL_VALUE);
    }

    /**
     * {@code MASTER_AT} 의 base_dt(engine-contract §7, D-023) — 8자리 {@code YYYYMMDD} 는 그날 00:00:00,
     * 14자리 {@code YYYYMMDDHHMMSS} 는 그 시각(KST). NULL 은 null. 그 밖의 문자열·숫자·불린, 달력에 없는 날짜는 평가 오류.
     */
    static LocalDateTime baseDt(Token token, EvaluationValue value) throws EvaluationException {
        if (value.isNullValue()) {
            return null;
        }
        if (value.isStringValue()) {
            String s = value.getStringValue();
            try {
                if (DATE_8.matcher(s).matches()) {
                    return LocalDate.parse(s, YYYYMMDD).atStartOfDay();
                }
                if (DATE_TIME_14.matcher(s).matches()) {
                    return LocalDateTime.parse(s, YYYYMMDDHHMMSS);
                }
            } catch (DateTimeParseException e) {
                throw new EvaluationException(token, "MASTER_AT base_dt '" + s + "' 는 달력에 없는 일시다");
            }
        }
        throw new EvaluationException(token,
                "MASTER_AT base_dt 는 YYYYMMDD·YYYYMMDDHHMMSS 문자열이어야 한다: " + value.getValue());
    }

    private static String requireString(Token token, EvaluationValue value, String name) throws EvaluationException {
        if (!value.isStringValue()) {
            throw new EvaluationException(token, token.getValue() + " 의 " + name + " 인자는 문자열이어야 한다");
        }
        return value.getStringValue();
    }

    /** NULL 이면 null. 숫자 key 는 {@code toPlainString()} 으로 본다. */
    private static String keyText(Token token, EvaluationValue key) throws EvaluationException {
        if (key.isNullValue()) {
            return null;
        }
        if (key.isStringValue()) {
            return key.getStringValue();
        }
        if (key.isNumberValue()) {
            return key.getNumberValue().toPlainString();
        }
        throw new EvaluationException(token, token.getValue() + " 의 key 인자는 문자열·숫자여야 한다");
    }

    /** {@code "attr01"}-{@code "attr10"} → 1-10. */
    private static int attrNo(Token token, EvaluationValue attr) throws EvaluationException {
        if (attr.isStringValue()) {
            var m = ATTR.matcher(attr.getStringValue());
            if (m.matches()) {
                return Integer.parseInt(m.group(1));
            }
        }
        throw new EvaluationException(token, token.getValue() + " 의 attr 인자는 \"attr01\"-\"attr10\" 이어야 한다");
    }
}
