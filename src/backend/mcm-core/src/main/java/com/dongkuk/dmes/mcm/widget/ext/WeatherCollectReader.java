package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 날씨 수집 값 읽기 — 예약 작업의 수집(jobCollect)이 {@code TB_MCM_JOB_COLLECT_DATA} 에 쌓은 값을 위젯 응답 모양으로 바꾼다
 * (설계 docs/superpowers/specs/2026-10-09-weather-collect-design.md §D4).
 * <ul>
 *   <li>지점 찾기: 모듈 MCM, 작업 ID 가 {@value #JOB_PREFIX} 로 시작하는 사용 중 COLLECT 작업 중, 변수 {@code lat}·{@code lon} 이 요청 좌표에서
 *       위·경도 모두 {@value #NEAR_DEG}도 이내(Open-Meteo 격자 약 11km 와 비슷한 거리)인 작업. 가장 가까운 작업을 고르고, 거리가 같은 작업이
 *       여럿이면(작업 복사 뒤 좌표를 안 고친 경우) 최신 회차가 있는 쪽을 고른다. 없으면 {@link Status#UNCOLLECTED}.</li>
 *   <li>값 읽기: 그 작업의 가장 최근 SLOT(yyyyMMddHHmm) 한 회차의 항목 최대 19개. 한 건도 없으면 {@link Status#EMPTY}.</li>
 *   <li>항목 이름: {@code cur_temp·cur_code·cur_wind·cur_humidity}, {@code d0_date·d0_min·d0_max·d0_code·d0_pop} … {@code d2_*}.
 *       빠진 값은 null 로 둔다.</li>
 * </ul>
 * 사용자 입력은 숫자 좌표뿐이고 SQL 은 바인드 변수만 쓴다. 표는 MCM 앱의 기본 DataSource 가 가리키는 스키마({@code dmes.job.schema})에서 읽는다.
 */
@Component
public class WeatherCollectReader {

    /** 날씨 수집 작업의 ID 접두. */
    public static final String JOB_PREFIX = "mcm.weather.";
    static final int FORECAST_DAYS = 3;
    static final int JOBS_MAX = 200;
    /** 요청 좌표와 작업 좌표가 이 도(°) 이내면 같은 지점으로 본다. */
    static final double NEAR_DEG = 0.1;

    private static final Logger log = LoggerFactory.getLogger(WeatherCollectReader.class);
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final DateTimeFormatter SLOT = DateTimeFormatter.ofPattern("yyyyMMddHHmm");

    public enum Status { OK, UNCOLLECTED, EMPTY }

    /** 읽은 결과 — report·collectedAt 은 OK 일 때만 있다. */
    public record Result(Status status, WeatherReport report, LocalDateTime collectedAt) {
        static Result of(Status status) {
            return new Result(status, null, null);
        }
    }

    private final JdbcTemplate jdbc;
    private final String jobSql;
    private final String dataSql;

    @Autowired
    public WeatherCollectReader(DataSource dataSource, @Value("${dmes.job.schema:MCMAPUSER}") String schema) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = new JdbcTemplate(dataSource);
        this.jobSql = """
                SELECT A.JOB_ID, A.VARS_JSON
                FROM   %1$s.TB_MCM_JOB_DEF A
                WHERE  A.JOB_KIND = 'COLLECT'
                AND    A.MODULE_CD = 'MCM'
                AND    A.USE_YN = 'Y'
                AND    A.JOB_ID LIKE '%2$s%%'
                ORDER BY A.JOB_ID
                FETCH FIRST %3$d ROWS ONLY
                """.formatted(schema, JOB_PREFIX, JOBS_MAX);
        this.dataSql = """
                SELECT A.SLOT, A.ITEM_KEY, A.VALUE_NUM, A.VALUE_TXT
                FROM   %1$s.TB_MCM_JOB_COLLECT_DATA A
                WHERE  A.JOB_ID = ?
                AND    A.SLOT = (SELECT MAX(B.SLOT) FROM %1$s.TB_MCM_JOB_COLLECT_DATA B WHERE B.JOB_ID = ?)
                """.formatted(schema);
    }

    private record Candidate(String jobId, double dist) {}

    private record Latest(String slot, Map<String, Object> items) {}

    /** 좌표(소수 둘째 자리로 반올림된 값)에 맞는 수집 작업의 최신 회차. */
    public Result read(BigDecimal lat, BigDecimal lon) {
        List<Candidate> near = candidates(lat, lon);
        if (near.isEmpty()) return Result.of(Status.UNCOLLECTED);
        double best = near.get(0).dist();
        Latest latest = null;
        for (Candidate c : near) {
            if (c.dist() > best) break;   // 가장 가까운 거리의 작업들 중에서만 고른다(같은 좌표 사본이면 최신 회차 쪽)
            Latest l = latest(c.jobId());
            if (l != null && (latest == null || l.slot().compareTo(latest.slot()) > 0)) latest = l;
        }
        if (latest == null) return Result.of(Status.EMPTY);
        LocalDateTime collectedAt = parseSlot(latest.slot());
        if (collectedAt == null) return Result.of(Status.EMPTY);
        return new Result(Status.OK, toReport(latest.items()), collectedAt);
    }

    private Latest latest(String jobId) {
        List<Map<String, Object>> rows = jdbc.queryForList(dataSql, jobId, jobId);
        if (rows.isEmpty()) return null;
        Map<String, Object> items = new HashMap<>();
        String slot = null;
        for (Map<String, Object> r : rows) {
            slot = (String) r.get("SLOT");
            Object num = r.get("VALUE_NUM");
            items.put((String) r.get("ITEM_KEY"), num != null ? num : r.get("VALUE_TXT"));
        }
        return new Latest(slot, items);
    }

    /** 좌표 허용 거리 안의 작업을 가까운 순(같으면 작업 ID 순)으로. 변수를 못 읽는 작업 하나가 다른 지점의 조회를 막지 않게 그 작업만 건너뛴다. */
    private List<Candidate> candidates(BigDecimal lat, BigDecimal lon) {
        List<Candidate> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(jobSql)) {
            String jobId = (String) row.get("JOB_ID");
            BigDecimal jobLat = null;
            BigDecimal jobLon = null;
            try {
                for (JobVar v : JobVars.parse((String) row.get("VARS_JSON"))) {
                    if ("lat".equals(v.name())) jobLat = coord(v.value());
                    if ("lon".equals(v.name())) jobLon = coord(v.value());
                }
            } catch (RuntimeException e) {
                log.warn("[widgetExt] 날씨 수집 작업의 변수를 읽지 못해 건너뜁니다: {}", jobId);
                continue;
            }
            if (jobLat == null || jobLon == null) continue;
            double dLat = lat.subtract(jobLat).abs().doubleValue();
            double dLon = lon.subtract(jobLon).abs().doubleValue();
            if (dLat <= NEAR_DEG + 1e-9 && dLon <= NEAR_DEG + 1e-9) out.add(new Candidate(jobId, dLat * dLat + dLon * dLon));
        }
        out.sort(Comparator.comparingDouble(Candidate::dist).thenComparing(Candidate::jobId));
        return out;
    }

    private static BigDecimal coord(String text) {
        try {
            return new BigDecimal(text.strip()).setScale(2, RoundingMode.HALF_UP);
        } catch (RuntimeException e) {
            return null;
        }
    }

    static LocalDateTime parseSlot(String slot) {
        if (slot == null) return null;
        try {
            return LocalDateTime.parse(slot, SLOT);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    static WeatherReport toReport(Map<String, Object> items) {
        WeatherReport.Current current = null;
        if (items.containsKey("cur_temp") || items.containsKey("cur_code") || items.containsKey("cur_wind") || items.containsKey("cur_humidity")) {
            current = new WeatherReport.Current(dbl(items.get("cur_temp")), integer(items.get("cur_code")), dbl(items.get("cur_wind")),
                    integer(items.get("cur_humidity")));
        }
        List<WeatherReport.Daily> days = new ArrayList<>();
        for (int i = 0; i < FORECAST_DAYS; i++) {
            Object date = items.get("d" + i + "_date");
            if (!(date instanceof String d) || d.isBlank()) continue;
            days.add(new WeatherReport.Daily(d, dbl(items.get("d" + i + "_min")), dbl(items.get("d" + i + "_max")),
                    integer(items.get("d" + i + "_code")), integer(items.get("d" + i + "_pop"))));
        }
        return new WeatherReport(current, days);
    }

    private static Double dbl(Object v) {
        return v instanceof Number n ? n.doubleValue() : null;
    }

    private static Integer integer(Object v) {
        return v instanceof Number n ? Integer.valueOf(n.intValue()) : null;
    }
}
