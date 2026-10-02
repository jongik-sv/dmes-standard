package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import kr.dongkuk.maru.mdm.engine.expr.ValueConversionException;
import kr.dongkuk.maru.mdm.engine.expr.ValueConverter;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;

/**
 * 엔진 앞에서 cactus 가 하는 값 검사(하위 프로젝트 C spec §6.2-5, C1·C5) — 타입, 문자열 길이(code point), 숫자 자리(NUMBER(p,s)). 엔진
 * {@code DomainValidator} 는 길이·자리를 보지 않는다. 문구는 화면 검증(spec §5)과 같은 꼴이다.
 */
final class MdmValueChecks {

    private static final List<DateTimeFormatter> DATE_ONLY = List.of(
            DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT),
            DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT),
            DateTimeFormatter.ofPattern("uuuu/MM/dd").withResolverStyle(ResolverStyle.STRICT));
    private static final List<DateTimeFormatter> DATE_TIME = List.of(
            DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss").withResolverStyle(ResolverStyle.STRICT),
            DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss").withResolverStyle(ResolverStyle.STRICT),
            DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm").withResolverStyle(ResolverStyle.STRICT),
            DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm").withResolverStyle(ResolverStyle.STRICT),
            DateTimeFormatter.ofPattern("uuuuMMddHHmmss").withResolverStyle(ResolverStyle.STRICT));

    private MdmValueChecks() {
    }

    /** 검사 결과 — {@code message} 가 있으면 실패, 없으면 {@code value} 가 엔진에 넘길 값(NUMBER 는 BigDecimal, DATE 는 Instant). */
    record Checked(Object value, String message) {
    }

    /** 폼 캡션(spec §5, B2) — labelMid → labelLong → labelShort → columnName → 원래 키. */
    static String caption(MdmColumnMeta meta, String fallbackKey) {
        for (String s : new String[] {meta.labelMid(), meta.labelLong(), meta.labelShort(), meta.columnName()}) {
            if (s != null && !s.isBlank()) {
                return s;
            }
        }
        return fallbackKey;
    }

    static String requiredMessage(String caption) {
        return caption + "은(는) 필수입니다";
    }

    static String typeMessage(MdmColumnMeta meta, String caption) {
        return switch (dataType(meta)) {
            case NUMBER -> caption + "은(는) 숫자여야 합니다";
            case DATE -> caption + "은(는) 날짜 형식이 아닙니다";
            default -> caption + ": 값 형식이 올바르지 않습니다";
        };
    }

    static DataType dataType(MdmColumnMeta meta) {
        String t = meta.dataType();
        if (t == null || t.isBlank()) {
            return DataType.STRING;
        }
        try {
            return DataType.valueOf(t.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return DataType.STRING; // MdmDefinitionLookup.toColumnDefinition 과 같은 기본값
        }
    }

    /** 빈 값이 아닌 {@code raw} 의 타입·길이·자리. */
    static Checked check(MdmColumnMeta meta, Object raw, String caption) {
        Object v = MdmValidator.normalize(raw);
        return switch (dataType(meta)) {
            case NUMBER -> number(meta, v, caption);
            case DATE -> date(v) == null ? fail(typeMessage(meta, caption)) : new Checked(date(v), null);
            case STRING -> text(meta, v, caption);
            case BOOLEAN -> new Checked(v, null); // 엔진이 바꾼다
        };
    }

    private static Checked number(MdmColumnMeta meta, Object v, String caption) {
        BigDecimal n;
        try {
            n = (BigDecimal) ValueConverter.convert(v, DataType.NUMBER);
        } catch (ValueConversionException e) {
            return fail(typeMessage(meta, caption));
        }
        Integer precision = meta.length();
        Integer scaleDef = meta.scale();
        if (precision == null && scaleDef == null) {
            return new Checked(n, null);
        }
        int s = scaleDef == null ? 0 : scaleDef;
        BigDecimal a = n.abs().stripTrailingZeros();
        int frac = Math.max(a.scale(), 0);
        int intDigits = a.signum() == 0 ? 0 : Math.max(a.precision() - a.scale(), 0);
        if (precision != null) {
            if (intDigits > precision - s || frac > s) {
                return fail(caption + "은(는) 정수 " + (precision - s) + "자리, 소수 " + s + "자리까지입니다");
            }
        } else if (frac > s) {
            return fail(caption + "은(는) 소수 " + s + "자리까지입니다");
        }
        return new Checked(n, null);
    }

    private static Checked text(MdmColumnMeta meta, Object v, String caption) {
        String s;
        try {
            s = (String) ValueConverter.convert(v, DataType.STRING);
        } catch (ValueConversionException e) {
            return fail(typeMessage(meta, caption));
        }
        Integer max = meta.length();
        if (max != null && s.codePointCount(0, s.length()) > max) {
            return fail(caption + "은(는) 최대 " + max + "자입니다");
        }
        return new Checked(s, null);
    }

    /** 날짜 값 → Instant(KST 벽시계). 못 읽으면 null. */
    static Instant date(Object v) {
        if (v instanceof Instant i) {
            return i;
        }
        if (v instanceof Date d) {
            return d.toInstant();
        }
        if (v instanceof LocalDate d) {
            return d.atStartOfDay(MdmDefinitionLookup.KST).toInstant();
        }
        if (v instanceof LocalDateTime d) {
            return d.atZone(MdmDefinitionLookup.KST).toInstant();
        }
        if (v instanceof OffsetDateTime d) {
            return d.toInstant();
        }
        if (v instanceof ZonedDateTime d) {
            return d.toInstant();
        }
        if (!(v instanceof String text)) {
            return null;
        }
        String s = text.trim();
        for (DateTimeFormatter f : DATE_ONLY) {
            try {
                return LocalDate.parse(s, f).atStartOfDay(MdmDefinitionLookup.KST).toInstant();
            } catch (DateTimeParseException e) {
                // 다음 형식
            }
        }
        for (DateTimeFormatter f : DATE_TIME) {
            try {
                return LocalDateTime.parse(s, f).atZone(MdmDefinitionLookup.KST).toInstant();
            } catch (DateTimeParseException e) {
                // 다음 형식
            }
        }
        try {
            return OffsetDateTime.parse(s).toInstant(); // ISO-8601 + 오프셋(예 2026-10-03T09:00:00+09:00, ...Z)
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static Checked fail(String message) {
        return new Checked(null, message);
    }
}
