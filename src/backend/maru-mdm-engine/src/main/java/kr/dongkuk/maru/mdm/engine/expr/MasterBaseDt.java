package kr.dongkuk.maru.mdm.engine.expr;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * {@code MASTER_AT} base_dt 문자열 해석(engine-contract §7, D-023) — 8자리 {@code YYYYMMDD} 는 그날 00:00:00, 14자리 {@code YYYYMMDDHHMMSS} 는 그
 * 시각(KST). 엔진 평가({@link MasterQuery#baseDt})와 업무 모듈 미리 받기(D-154)가 이 한 곳을 쓴다.
 */
public final class MasterBaseDt {

    private static final Pattern DATE_8 = Pattern.compile("[0-9]{8}");
    private static final Pattern DATE_TIME_14 = Pattern.compile("[0-9]{14}");
    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter YYYYMMDDHHMMSS =
            DateTimeFormatter.ofPattern("uuuuMMddHHmmss").withResolverStyle(ResolverStyle.STRICT);

    private MasterBaseDt() {
    }

    /** 8자리 또는 14자리 숫자 모양인가(달력 검사는 하지 않는다). */
    public static boolean isShape(String s) {
        return s != null && (DATE_8.matcher(s).matches() || DATE_TIME_14.matcher(s).matches());
    }

    /** 모양이 맞고 달력에 있는 일시면 그 값, 아니면 빈 값. */
    public static Optional<LocalDateTime> parse(String s) {
        if (!isShape(s)) {
            return Optional.empty();
        }
        try {
            return Optional.of(s.length() == 8 ? LocalDate.parse(s, YYYYMMDD).atStartOfDay() : LocalDateTime.parse(s, YYYYMMDDHHMMSS));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }
}
