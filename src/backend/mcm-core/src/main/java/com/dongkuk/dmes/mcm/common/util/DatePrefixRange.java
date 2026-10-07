package com.dongkuk.dmes.mcm.common.util;

import java.time.DateTimeException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 날짜 칸의 앞 일치 LIKE 패턴(예: {@code 202610%})을 같은 결과가 나오는 반열린 범위로 바꾼다.
 *
 * <p>{@code TO_CHAR(col, 'YYYYMMDDHH24MISS') LIKE '202610%'} 는 칼럼에 함수가 붙어 인덱스를 쓰지 못한다.
 * 숫자 앞부분이 달력 단위(연 4자·월 6자·일 8자·시 10자·분 12자·초 14자)와 맞으면
 * {@code col >= 시작 AND col < 다음 단위 시작} 으로 바꿔 칼럼을 원형으로 둘 수 있다.
 * 달력 단위가 아니거나(5자 등), 존재하지 않는 날짜이거나, {@code %} 가 끝에 하나만 있지 않으면 비어 있는 값을 돌려주고
 * 호출하는 쪽이 현행 {@code TO_CHAR ... LIKE} 형태를 그대로 쓴다.
 */
public final class DatePrefixRange {

    private static final Pattern PREFIX = Pattern.compile("(\\d{4}|\\d{6}|\\d{8}|\\d{10}|\\d{12}|\\d{14})%");
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final String FILL = "00000101000000";   // 연 뒤를 0101 0시로 채운다

    /** 반열린 범위: {@code col >= from AND col < to}. 둘 다 {@code yyyyMMddHHmmss} 14자. */
    public record Range(String from, String to) {
    }

    private DatePrefixRange() {
    }

    /**
     * @param likeValue 구분자를 이미 지운 LIKE 값(예: {@code 202610%})
     * @return 범위로 바꿀 수 있으면 범위, 아니면 비어 있다.
     */
    public static Optional<Range> of(String likeValue) {
        if (likeValue == null) return Optional.empty();
        Matcher m = PREFIX.matcher(likeValue);
        if (!m.matches()) return Optional.empty();
        String digits = m.group(1);
        int len = digits.length();
        String full = digits + FILL.substring(len);
        try {
            LocalDateTime from = LocalDateTime.parse(full, FMT);
            if (from.getYear() < 1) return Optional.empty();   // Oracle TO_DATE 는 0000 년을 받지 않는다
            LocalDateTime to = switch (len) {
                case 4 -> from.plusYears(1);
                case 6 -> from.plusMonths(1);
                case 8 -> from.plusDays(1);
                case 10 -> from.plusHours(1);
                case 12 -> from.plusMinutes(1);
                default -> from.plusSeconds(1);
            };
            if (to.getYear() > 9999) return Optional.empty();
            // 파싱은 2월 31일 같은 날을 말일로 보정하지 않고 거부한다(STRICT 가 아니어도 DateTimeParseException).
            if (!from.format(FMT).equals(full)) return Optional.empty();
            return Optional.of(new Range(from.format(FMT), to.format(FMT)));
        } catch (DateTimeException e) {
            return Optional.empty();   // 13월·32일처럼 존재하지 않는 날짜 — 현행 LIKE 가 아무 행도 못 찾는 것과 같게 둔다
        }
    }
}
