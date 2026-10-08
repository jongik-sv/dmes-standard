package com.dongkuk.dmes.mcm.job.def;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.scheduling.support.CronExpression;

/**
 * crontab 5칸 식(분 시 일 월 요일, Asia/Seoul) 검사·다음 시각·설명 — 설계 §4.0.
 * 계산은 Spring {@link CronExpression} 에 초 칸 {@code 0} 을 앞에 붙여 맡긴다. Spring 만 받는 문법({@code ? L W #}, 6칸)과
 * crontab 과 뜻이 다른 「일·요일 함께 제한」은 거절한다(crontab 은 OR, Spring 은 AND).
 */
public final class CronSpec {

    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private static final Map<String, String> MACROS = Map.of(
            "@yearly", "0 0 1 1 *", "@annually", "0 0 1 1 *", "@monthly", "0 0 1 * *", "@weekly", "0 0 * * 0",
            "@daily", "0 0 * * *", "@midnight", "0 0 * * *", "@hourly", "0 * * * *");
    private static final String[] FIELD_NAMES = {"분", "시", "일", "월", "요일"};
    private static final int[] MIN = {0, 0, 1, 1, 0};
    private static final int[] MAX = {59, 23, 31, 12, 7};
    private static final List<String> MONTH_NAMES = List.of("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC");
    private static final List<String> DOW_NAMES = List.of("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT");
    private static final String[] DOW_KO = {"일", "월", "화", "수", "목", "금", "토"};
    private static final int GAP_SCAN_LIMIT = 600_000;

    private final String[] fields;
    private final CronExpression spring;

    private CronSpec(String[] fields, CronExpression spring) {
        this.fields = fields;
        this.spring = spring;
    }

    /** 식을 읽는다. 틀리면 어느 칸이 왜 틀렸는지 한국어로 알리는 {@link IllegalArgumentException}. */
    public static CronSpec parse(String expr) {
        if (expr == null || expr.isBlank()) throw bad("crontab 식이 비어 있습니다");
        String t = expr.trim().replaceAll("\\s+", " ");
        if (t.startsWith("@")) {
            String macro = MACROS.get(t.toLowerCase(Locale.ROOT));
            if (macro == null) throw bad("지원하지 않는 매크로입니다: " + t + " (@hourly @daily @weekly @monthly @yearly)");
            t = macro;
        }
        String[] f = t.toUpperCase(Locale.ROOT).split(" ");
        if (f.length != 5) {
            throw bad(f.length > 5
                    ? "5칸 crontab 식만 쓸 수 있습니다(초 칸·연도 칸 없음): 분 시 일 월 요일"
                    : "5칸이어야 합니다(분 시 일 월 요일): 지금 " + f.length + "칸");
        }
        for (int i = 0; i < 5; i++) checkField(i, f[i]);
        if (!f[2].equals("*") && !f[4].equals("*")) {
            throw bad("일과 요일 중 하나는 * 로 두세요 (crontab 은 둘이 OR, 이 화면은 AND 라 뜻이 달라집니다)");
        }
        CronExpression spring;
        try {
            spring = CronExpression.parse("0 " + String.join(" ", f));
        } catch (IllegalArgumentException e) {
            throw bad("crontab 식을 해석하지 못했습니다: " + t);
        }
        return new CronSpec(f, spring);
    }

    public static Optional<String> validate(String expr) {
        try {
            parse(expr);
            return Optional.empty();
        } catch (IllegalArgumentException e) {
            return Optional.of(e.getMessage());
        }
    }

    /** 정규화한 5칸 식(대문자, 매크로 펼침). */
    public String expression() {
        return String.join(" ", fields);
    }

    /** after 보다 엄격히 뒤인 첫 시각(초 0). 없으면 null. */
    public LocalDateTime next(LocalDateTime after) {
        ZonedDateTime n = spring.next(after.atZone(ZONE));
        return n == null ? null : n.toLocalDateTime();
    }

    public List<LocalDateTime> nextN(LocalDateTime after, int n) {
        List<LocalDateTime> out = new ArrayList<>();
        LocalDateTime cur = after;
        for (int i = 0; i < n; i++) {
            cur = next(cur);
            if (cur == null) break;
            out.add(cur);
        }
        return out;
    }

    /** from 부터 horizon 안의 연속한 두 실행 사이 간격의 최솟값. 실행이 2회 미만이면 366일. */
    public Duration minGap(LocalDateTime from, Duration horizon) {
        LocalDateTime end = from.plus(horizon);
        LocalDateTime prev = next(from);
        Duration min = null;
        for (int i = 0; prev != null && i < GAP_SCAN_LIMIT; i++) {
            LocalDateTime n = next(prev);
            if (n == null || n.isAfter(end)) break;
            Duration d = Duration.between(prev, n);
            if (min == null || d.compareTo(min) < 0) min = d;
            if (min.compareTo(Duration.ofMinutes(1)) <= 0) break;
            prev = n;
        }
        return min == null ? Duration.ofDays(366) : min;
    }

    public Duration minGap() {
        return minGap(LocalDateTime.now(ZONE), Duration.ofDays(366));
    }

    /** 사람이 읽는 설명. 줄일 수 없으면 식 그대로 + 「(직접 입력)」. */
    public String describe() {
        String min = fields[0], hour = fields[1], dom = fields[2], mon = fields[3], dow = fields[4];
        boolean monthAll = mon.equals("*");
        if (min.equals("*") && hour.equals("*") && dom.equals("*") && monthAll && dow.equals("*")) return "매분";
        Integer m = intOrNull(min);
        Integer h = intOrNull(hour);
        String step = stepOf(min);
        if (hour.equals("*") && dom.equals("*") && monthAll && dow.equals("*")) {
            if (step != null) return step + "분마다";
            if (m != null) return m == 0 ? "매시 정각" : "매시 " + m + "분";
        }
        String dowNum = normalizeDow(dow);
        if (m != null && h != null && monthAll) {
            String at = String.format("%02d:%02d", h, m);
            if (dom.equals("*") && dow.equals("*")) return "매일 " + at;
            if (dom.equals("*") && "1-5".equals(dowNum)) return "평일 " + at;
            if (dom.equals("*") && intOrNull(dowNum) != null) return "매주 " + DOW_KO[intOrNull(dowNum)] + "요일 " + at;
            Integer d = intOrNull(dom);
            if (dow.equals("*") && d != null) return "매월 " + d + "일 " + at;
        }
        if (step != null && hour.matches("\\d+-\\d+") && dom.equals("*") && monthAll) {
            String hours = hour.replace("-", "~") + "시 " + step + "분마다";
            if (dow.equals("*")) return hours;
            if (dowNum != null && dowNum.matches("\\d-\\d")) {
                String[] r = dowNum.split("-");
                return DOW_KO[Integer.parseInt(r[0])] + "~" + DOW_KO[Integer.parseInt(r[1])] + " " + hours;
            }
        }
        return expression() + " (직접 입력)";
    }

    // ── 검사 ─────────────────────────────────────────────────────────

    private static void checkField(int i, String text) {
        for (String token : text.split(",", -1)) {
            if (token.isEmpty()) throw bad(label(i) + " 에 빈 항목이 있습니다");
            if (token.matches(".*[?#].*") || (i == 2 && token.matches(".*[LW].*")) || (i == 4 && token.matches(".*L.*"))) {
                throw bad(label(i) + " 에 지원하지 않는 문법이 있습니다: " + token + " (? L W # 는 쓸 수 없습니다)");
            }
            String base = token;
            int step = 1;
            int slash = token.indexOf('/');
            if (slash >= 0) {
                base = token.substring(0, slash);
                String s = token.substring(slash + 1);
                if (!s.matches("\\d+") || Integer.parseInt(s) < 1) throw bad(label(i) + " 의 간격(/) 은 1 이상의 숫자여야 합니다: " + token);
                step = Integer.parseInt(s);
            }
            if (base.equals("*")) continue;
            int dash = base.indexOf('-');
            if (dash >= 0) {
                int a = value(i, base.substring(0, dash));
                int b = value(i, base.substring(dash + 1));
                if (a > b) throw bad(label(i) + " 의 범위 시작이 끝보다 큽니다: " + token);
            } else {
                value(i, base);
            }
            if (step < 1) throw bad(label(i) + " 의 간격이 올바르지 않습니다: " + token);
        }
    }

    private static int value(int i, String s) {
        Integer v = null;
        if (s.matches("\\d+")) v = Integer.parseInt(s);
        else if (i == 3 && MONTH_NAMES.contains(s)) v = MONTH_NAMES.indexOf(s) + 1;
        else if (i == 4 && DOW_NAMES.contains(s)) v = DOW_NAMES.indexOf(s);
        if (v == null) throw bad(label(i) + " 값을 읽을 수 없습니다: " + s);
        if (v < MIN[i] || v > MAX[i]) throw bad(label(i) + " 값 " + v + " 은 " + MIN[i] + "~" + MAX[i] + " 범위를 벗어났습니다");
        return v;
    }

    private static String label(int i) {
        return FIELD_NAMES[i] + " 칸(" + (i + 1) + "번째)";
    }

    private static IllegalArgumentException bad(String message) {
        return new IllegalArgumentException(message);
    }

    // ── 설명 도우미 ──────────────────────────────────────────────────

    private static Integer intOrNull(String s) {
        return s != null && s.matches("\\d+") ? Integer.valueOf(s) : null;
    }

    private static String stepOf(String s) {
        return s.matches("\\*/\\d+") ? s.substring(2) : null;
    }

    /** 요일 칸의 이름·7 을 숫자로(SUN=0). 해석하지 못하면 null. */
    private static String normalizeDow(String dow) {
        String out = dow;
        for (int i = 0; i < DOW_NAMES.size(); i++) out = out.replace(DOW_NAMES.get(i), String.valueOf(i));
        if (out.equals("7")) out = "0";
        return out.matches("\\d(-\\d)?") ? out : null;
    }
}
