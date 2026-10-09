package com.dongkuk.dmes.mcm.widget.ext;

import java.math.BigDecimal;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * MDM 환율 마스터(마스터 {@code FX_RATE}) 읽기 전용 조회 — 환율 위젯의 데이터 원천(설계 2026-10-09-mdm-fx-master §2 D4·§6 R4·R5).
 * <ul>
 *   <li>마스터 값은 {@code <mdm-schema>.TB_MDM_DATA_ITEM} 한 표에 있다. 열린 행(VALID_TO 가 열린 끝)만 유효하고,
 *       키 {@code CODE}(통화+기준일 yyyyMMdd)·{@code ATTR01} 통화·{@code ATTR02} 기준일·{@code ATTR03} 환율(1 대상통화당 기준 통화 값)·
 *       {@code ATTR04} 기준 통화다.</li>
 *   <li>조회는 통화마다 기본 키 범위({@code CODE BETWEEN '<통화><시작일>' AND '<통화><끝일>'})로 건다 — 칼럼에 함수를 씌우지 않고
 *       DB 시각 함수도 쓰지 않는다. 환율 문자열이 숫자가 아니거나 0 이하인 행은 건너뛴다.</li>
 *   <li>이 표를 못 읽는 사이트(스키마 없음·SELECT 권한 없음)는 예외를 올리지 않고 「데이터 없음」으로 돌려주며 경고를 한 번 남긴다
 *       (읽을 수 있게 된 뒤 다시 못 읽게 되면 또 한 번). 그 밖의 DB 오류는 그대로 올린다.</li>
 *   <li>스키마 이름은 SQL 에 이어 붙이므로 {@link #SCHEMA_PATTERN} 에 맞아야 한다 — 맞지 않으면 사용 때 {@link IllegalStateException}.</li>
 * </ul>
 * 쓰기는 하지 않는다(마스터 값은 mdm 예약 작업이 채운다).
 */
@Component
public class FxMasterReader {

    /** 환율 마스터의 마루 데이터 ID. */
    static final String MARU_DATA_ID = "FX_RATE";
    /** 선분 이력의 열린 끝 — 현재 유효한 행. */
    static final Timestamp OPEN_END = Timestamp.valueOf("9999-12-31 00:00:00");
    static final Pattern SCHEMA_PATTERN = Pattern.compile("^[A-Z][A-Z0-9_]{0,29}$");
    /** 표·스키마·권한이 없을 때 Oracle 이 내는 오류(ORA-00942 표 없음·ORA-00980 동의어·ORA-01031 권한 부족·ORA-01435 사용자 없음). */
    private static final Set<Integer> UNREADABLE_CODES = Set.of(942, 980, 1031, 1435);
    private static final int QUERY_TIMEOUT_SEC = 10;
    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;

    private static final Logger log = LoggerFactory.getLogger(FxMasterReader.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final WidgetExtProperties properties;
    /** 「표를 못 읽음」 경고를 한 번만 — 다시 읽게 되면 풀린다. */
    private final AtomicBoolean unreadableLogged = new AtomicBoolean();

    @Autowired
    public FxMasterReader(DataSource dataSource, WidgetExtProperties properties) {
        this(readOnlyTemplate(dataSource), properties);
    }

    FxMasterReader(NamedParameterJdbcTemplate jdbc, WidgetExtProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    private static NamedParameterJdbcTemplate readOnlyTemplate(DataSource dataSource) {
        JdbcTemplate template = new JdbcTemplate(dataSource);
        template.setQueryTimeout(QUERY_TIMEOUT_SEC);
        return new NamedParameterJdbcTemplate(template);
    }

    /**
     * 기준 통화·대상 통화들의 {@code [from, to]} 기준일 값. 순서는 보장하지 않는다(호출자가 날짜별로 모은다).
     * 표를 못 읽으면 빈 목록.
     */
    public List<ExchangeRatePoint> read(String base, Collection<String> currencies, LocalDate from, LocalDate to) {
        if (currencies == null || currencies.isEmpty()) return List.of();
        String schema = schema();
        List<String> curs = new ArrayList<>(currencies);
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("md", MARU_DATA_ID)
                .addValue("openEnd", OPEN_END)
                .addValue("base", base);
        StringBuilder sql = new StringBuilder(256)
                .append("SELECT A.CODE\n")
                .append("     , A.ATTR01\n")
                .append("     , A.ATTR02\n")
                .append("     , A.ATTR03\n")
                .append("FROM   ").append(schema).append(".TB_MDM_DATA_ITEM A\n")
                .append("WHERE  A.MARU_DATA_ID = :md\n")
                .append("AND    A.VALID_TO = :openEnd\n")
                .append("AND    A.ATTR04 = :base\n")
                .append("AND\n")
                .append("       (\n");
        for (int i = 0; i < curs.size(); i++) {
            sql.append(i == 0 ? "           " : "    OR     ")
                    .append("A.CODE BETWEEN :lo").append(i).append(" AND :hi").append(i).append('\n');
            params.addValue("lo" + i, curs.get(i) + from.format(YMD));
            params.addValue("hi" + i, curs.get(i) + to.format(YMD));
        }
        sql.append("       )");

        Set<String> wanted = Set.copyOf(curs);
        List<ExchangeRatePoint> out = new ArrayList<>();
        try {
            jdbc.query(sql.toString(), params, rs -> {
                ExchangeRatePoint point = toPoint(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), wanted);
                if (point != null && !point.date().isBefore(from) && !point.date().isAfter(to)) out.add(point);
            });
        } catch (DataAccessException e) {
            if (!isUnreadable(e)) throw e;
            if (unreadableLogged.compareAndSet(false, true)) {
                log.warn("[widgetExt] MDM 환율 마스터({}.TB_MDM_DATA_ITEM)를 읽지 못해 환율 없음으로 답한다"
                        + " — 스키마·SELECT 권한(dmes.widget.ext.exchange.mdm-schema)을 확인하세요: {}", schema, e.getMessage());
            }
            return List.of();
        }
        unreadableLogged.set(false);
        return out;
    }

    /** 한 행을 점으로 바꾼다. 통화·기준일·환율이 맞지 않으면 경고를 남기고 null. */
    private static ExchangeRatePoint toPoint(String code, String cur, String ymd, String rate, Set<String> wanted) {
        try {
            if (cur == null || !wanted.contains(cur.trim()) || ymd == null || rate == null) return null;
            BigDecimal value = new BigDecimal(rate.trim());
            if (value.signum() <= 0) throw new NumberFormatException("0 이하");
            return new ExchangeRatePoint(LocalDate.parse(ymd.trim(), YMD), cur.trim(), value);
        } catch (NumberFormatException | DateTimeParseException e) {
            log.warn("[widgetExt] MDM 환율 마스터 행을 건너뜀 — 환율·기준일을 읽을 수 없다: code={}", code);
            return null;
        }
    }

    private String schema() {
        String schema = properties.getExchange().getMdmSchema();
        if (schema == null || !SCHEMA_PATTERN.matcher(schema).matches()) {
            throw new IllegalStateException("dmes.widget.ext.exchange.mdm-schema 가 올바르지 않습니다: 영문 대문자로 시작하는"
                    + " 대문자·숫자·밑줄 30자 이내여야 합니다(현재 값: " + schema + ")");
        }
        return schema;
    }

    /** 원인 사슬에 「표·스키마·권한 없음」 계열 Oracle 오류가 있는가. */
    private static boolean isUnreadable(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause() == t ? null : t.getCause()) {
            if (t instanceof SQLException sql && UNREADABLE_CODES.contains(sql.getErrorCode())) return true;
        }
        return false;
    }
}
