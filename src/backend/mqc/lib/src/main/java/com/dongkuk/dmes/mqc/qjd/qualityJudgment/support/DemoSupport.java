package com.dongkuk.dmes.mqc.qjd.qualityJudgment.support;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.oasis.audit.AuditHolder;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/**
 * 품질판정·출력물 서비스가 함께 쓰는 작은 도우미 — 처리자, 시각 형식, 기간 조건, 입력 검사, 업무 오류.
 * 시각은 KST 이고 초 아래를 버린다(Oracle DATE 칸).
 */
public final class DemoSupport {

    public static final ZoneId KST = ZoneId.of("Asia/Seoul");
    public static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    public static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    static final LocalDateTime MIN = LocalDateTime.of(1900, 1, 1, 0, 0);
    static final LocalDateTime MAX = LocalDateTime.of(9999, 12, 31, 0, 0);

    private DemoSupport() {
    }

    /** 기본 시계(KST). 시험은 고정 시계를 넘긴다. */
    public static Clock systemClock() {
        return Clock.system(KST);
    }

    /** 지금 시각(초 단위로 자름). */
    public static LocalDateTime now(Clock clock) {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    /** 처리자 — 요청 감사 정보의 사용자 ID. 없으면 system. */
    public static String actor() {
        Object audit = AuditHolder.getAudit();
        if (audit instanceof CactusAudit a && a.userId() != null && !a.userId().isBlank()) return a.userId();
        return "system";
    }

    public static String format(LocalDateTime t) {
        return t == null ? null : DATE_TIME.format(t);
    }

    public static String formatDate(LocalDateTime t) {
        return t == null ? null : DATE.format(t);
    }

    /** 기간 [from 00:00, to 다음 날 00:00). 빈 값은 열린 쪽이다. 형식은 yyyy-MM-dd(또는 yyyyMMdd). */
    public static LocalDateTime[] range(String fromDt, String toDt) {
        LocalDateTime from = isBlank(fromDt) ? MIN : parseDate(fromDt, "시작일").atStartOfDay();
        LocalDateTime to = isBlank(toDt) ? MAX : parseDate(toDt, "종료일").plusDays(1).atStartOfDay();
        if (from.isAfter(to)) throw invalid("시작일이 종료일보다 늦을 수 없습니다.");
        return new LocalDateTime[] {from, to};
    }

    static LocalDate parseDate(String text, String label) {
        String t = text.trim();
        try {
            return t.length() == 8 ? LocalDate.parse(t, DateTimeFormatter.BASIC_ISO_DATE) : LocalDate.parse(t.substring(0, 10), DATE);
        } catch (DateTimeParseException | StringIndexOutOfBoundsException e) {
            throw invalid(label + " 형식이 올바르지 않습니다: " + text);
        }
    }

    public static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    public static String trimToNull(String s) {
        return isBlank(s) ? null : s.trim();
    }

    public static String required(String value, String label) {
        if (isBlank(value)) throw new BusinessException(ErrorCode.REQUIRED_VALUE, label + "을(를) 입력하세요.");
        return value.trim();
    }

    /** 쉼표로 이은 키 목록(중복·빈 칸 제거, 순서 유지). 하나도 없으면 필수 오류. */
    public static List<String> keys(String csv, String label) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (csv != null) {
            for (String s : csv.split(",")) {
                if (!s.isBlank()) out.add(s.trim());
            }
        }
        if (out.isEmpty()) throw new BusinessException(ErrorCode.REQUIRED_VALUE, label + "을(를) 고르세요.");
        if (out.size() > 200) throw invalid(label + "은(는) 한 번에 200개까지 처리합니다.");
        return new ArrayList<>(out);
    }

    /** 키워드가 비었거나 값 중 하나에 들어 있으면 참(대소문자 무시). */
    public static boolean matches(String keyword, String... values) {
        if (isBlank(keyword)) return true;
        String k = keyword.trim().toLowerCase(Locale.ROOT);
        for (String v : values) {
            if (v != null && v.toLowerCase(Locale.ROOT).contains(k)) return true;
        }
        return false;
    }

    /** 조건 값이 비었거나 같으면 참. */
    public static boolean eq(String filter, String value) {
        return isBlank(filter) || filter.trim().equals(value);
    }

    public static BusinessException business(String message) {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, message);
    }

    public static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }

    public static BusinessException notFound(String what, String key) {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, what + "을(를) 찾을 수 없습니다: " + key);
    }
}
