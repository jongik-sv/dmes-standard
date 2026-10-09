package com.dongkuk.dmes.mcm.job.def;

import com.dongkuk.dmes.mcm.common.util.BizDay;
import com.dongkuk.dmes.mcm.job.def.JobVar.Type;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 작업 변수 목록 — JSON 왕복·검사·실행 변수 확정(설계 §5.0).
 * 날짜 변수({@code :today :yesterday :monthStart :prevMonthStart :bizDate :bizYesterday})는 <b>SCHED_AT 기준</b>이다. DB_NOW 는 {@code :now} 에만 쓴다 —
 * 선점은 30초 일찍 할 수 있어서 자정 작업이 23:59:30 에 잡혀도 날짜가 하루 어긋나지 않게 한다.
 * 확정 값은 HTTP 본문·RUN.VARS_JSON 으로 그대로 나가므로 시각·날짜는 ISO 글자로 돌려준다.
 */
public final class JobVars {

    public static final int MAX_VARS = 30;
    public static final int MAX_VALUE_LENGTH = 1000;

    static final Pattern NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,29}$");
    /** 변수는 서비스 입력으로 그대로 넘어간다 — 내장 서비스의 입력 이름(sql·handlerId·source·save)과 예약 키 action 을 덮어쓰지 못하게 막는다. */
    static final Set<String> RESERVED = Set.of("action", "sql", "handlerId", "source", "save");
    private static final Set<String> RUNTIME = Set.of(":schedAt", ":now", ":today", ":yesterday", ":monthStart", ":prevMonthStart",
            ":bizDate", ":bizYesterday", ":prevRunAt", ":jobId", ":moduleCd");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();

    private JobVars() {}

    /** 확정에 쓰는 사실값. prevRunAt 은 직전 정상 일정 회차(TRIGGER_TP='S'·놓친 회차 'C')의 예정 시각이며 없으면 null. */
    public record RunFacts(LocalDateTime schedAt, LocalDateTime now, LocalDateTime prevRunAt, String jobId, String moduleCd) {}

    public static List<JobVar> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<Map<String, Object>> rows = JSON.readValue(json, new TypeReference<>() {});
            List<JobVar> out = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                out.add(new JobVar(str(r.get("name")), Type.valueOf(str(r.get("type")) == null ? "STRING" : str(r.get("type"))),
                        str(r.get("value")) == null ? "" : str(r.get("value")), str(r.get("desc")) == null ? "" : str(r.get("desc"))));
            }
            return List.copyOf(out);
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw new IllegalArgumentException("변수 목록(JSON)을 읽을 수 없습니다");
        }
    }

    public static String toJson(List<JobVar> vars) {
        try {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (JobVar v : vars) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("name", v.name());
                m.put("type", v.type().name());
                m.put("value", v.value());
                m.put("desc", v.desc());
                rows.add(m);
            }
            return JSON.writeValueAsString(rows);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 오류 문구 목록(빈 목록이면 통과). */
    public static List<String> validate(List<JobVar> vars) {
        List<String> errors = new ArrayList<>();
        if (vars.size() > MAX_VARS) errors.add("변수는 " + MAX_VARS + "개까지 쓸 수 있습니다");
        Set<String> seen = new HashSet<>();
        for (JobVar v : vars) {
            String n = v.name();
            if (n == null || !NAME.matcher(n).matches()) {
                errors.add("변수 이름은 영문자로 시작하는 영문·숫자·_ 30자 이하여야 합니다: " + n);
                continue;
            }
            if (RESERVED.contains(n)) errors.add("변수 이름 " + n + " 은(는) 예약어입니다(action sql handlerId source save)");
            if (!seen.add(n)) errors.add("변수 이름이 겹칩니다: " + n);
            String value = v.value() == null ? "" : v.value();
            if (value.length() > MAX_VALUE_LENGTH) errors.add("변수 " + n + " 의 값은 " + MAX_VALUE_LENGTH + "자까지입니다");
            if (value.startsWith(":")) {
                if (!RUNTIME.contains(value)) errors.add("알 수 없는 실행 변수입니다: " + value + " (" + String.join(" ", new java.util.TreeSet<>(RUNTIME)) + ")");
                continue;
            }
            switch (v.type()) {
                case NUMBER -> {
                    if (!value.isBlank() && !isNumber(value)) errors.add("변수 " + n + " 은(는) 숫자여야 합니다: " + value);
                }
                case DATE -> {
                    if (!value.isBlank() && !isDate(value)) errors.add("변수 " + n + " 은(는) 날짜(yyyy-MM-dd 또는 yyyy-MM-dd HH:mm[:ss])여야 합니다: " + value);
                }
                case JSON -> {
                    if (!value.isBlank() && !isJson(value)) errors.add("변수 " + n + " 은(는) 올바른 JSON 이어야 합니다");
                }
                default -> { }
            }
        }
        return errors;
    }

    /** 변수 이름 → 형 이름(요청 본문의 varTypes). */
    public static Map<String, String> typesOf(List<JobVar> vars) {
        Map<String, String> out = new LinkedHashMap<>();
        for (JobVar v : vars) out.put(v.name(), v.type().name());
        return out;
    }

    /** 변수 중 {@code :prevRunAt} 를 쓰는 것이 있는가 — 있을 때만 직전 정상 회차를 읽는다. */
    public static boolean usesPrevRunAt(List<JobVar> vars) {
        return vars.stream().anyMatch(v -> ":prevRunAt".equals(v.value()));
    }

    /** 실행 변수를 확정한 이름 → 값 맵(입력 순서 유지). */
    public static Map<String, Object> resolve(List<JobVar> vars, RunFacts f) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (JobVar v : vars) out.put(v.name(), resolveOne(v, f));
        return out;
    }

    /** 날짜 실행 변수 값 — 형 DATE 는 yyyy-MM-dd(JobBind 가 SQL 날짜로 묶는다), 그 밖(STRING 등)은 yyyyMMdd 8자리. */
    private static String day(JobVar v, LocalDate d) {
        return v.type() == Type.DATE ? d.toString() : d.format(DateTimeFormatter.BASIC_ISO_DATE);
    }

    private static Object resolveOne(JobVar v, RunFacts f) {
        String value = v.value() == null ? "" : v.value();
        LocalDate sched = f.schedAt().toLocalDate();
        switch (value) {
            case ":schedAt": return DATE_TIME.format(f.schedAt());
            case ":now": return DATE_TIME.format(f.now());
            case ":today": return day(v, sched);
            case ":yesterday": return day(v, sched.minusDays(1));
            case ":monthStart": return day(v, sched.withDayOfMonth(1));
            case ":bizDate": return day(v, BizDay.bizDate(f.schedAt()));
            case ":bizYesterday": return day(v, BizDay.bizDate(f.schedAt()).minusDays(1));
            case ":prevMonthStart": return day(v, sched.withDayOfMonth(1).minusMonths(1));
            case ":prevRunAt": return f.prevRunAt() == null ? null : DATE_TIME.format(f.prevRunAt());
            case ":jobId": return f.jobId();
            case ":moduleCd": return f.moduleCd();
            default: break;
        }
        return switch (v.type()) {
            case NUMBER -> value.isBlank() ? null : new BigDecimal(value.trim());
            case JSON -> value.isBlank() ? null : readJson(value);
            case DATE -> value.isBlank() ? null : normalizeDate(value);
            default -> value;
        };
    }

    private static Object readJson(String value) {
        try {
            return JSON.readValue(value, Object.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON 변수를 읽을 수 없습니다");
        }
    }

    private static String normalizeDate(String value) {
        String s = value.trim();
        if (s.length() == 10) return LocalDate.parse(s).toString();
        String iso = s.replace(' ', 'T');
        if (iso.length() == 16) iso += ":00";
        return DATE_TIME.format(LocalDateTime.parse(iso));
    }

    private static boolean isNumber(String s) {
        try {
            new BigDecimal(s.trim());
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private static boolean isDate(String s) {
        try {
            normalizeDate(s);
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private static boolean isJson(String s) {
        try {
            JSON.readTree(s);
            return true;
        } catch (JsonProcessingException e) {
            return false;
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
