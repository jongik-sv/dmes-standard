package com.dongkuk.dmes.mcm.widget.ext;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * MDM 환율 마스터(마스터 {@code FX_RATE}) 읽기 전용 조회 — 환율 위젯의 데이터 원천(설계 2026-10-09-mdm-fx-master §2 D4·§6 R4·R5, §7).
 * <ul>
 *   <li>모양은 「날짜 한 행, 통화는 칼럼」이다. 마스터 값은 {@code <mdm-schema>.TB_MDM_DATA_ITEM} 의 열린 행(VALID_TO 가 열린 끝)이고,
 *       키 {@code CODE} 가 기준일(yyyyMMdd), 추가 컬럼 {@code ATTR01~10} 이 통화별 환율(1 통화 단위당 원화, 소수 문자열)이다.
 *       어느 칼럼이 어느 통화인지는 {@code <mdm-schema>.TB_MDM_DATA} 의 {@code ATTRnn_NAME} 라벨(통화 코드)에서 읽는다 — 하드코딩하지 않는다.
 *       기준 통화는 KRW 로 고정이라 {@code base} 인자는 쓰지 않는다.</li>
 *   <li>조회는 라벨 조회 한 번과 기준일 키 범위({@code CODE BETWEEN '<시작일>' AND '<끝일>'}) 한 번이다 — 칼럼에 함수를 씌우지 않고
 *       DB 시각 함수도 쓰지 않는다. 키가 날짜가 아니거나 환율 문자열이 숫자가 아니거나 0 이하인 칼럼은 건너뛴다.</li>
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
    private static final int ATTR_COUNT = 10;
    private static final Pattern CURRENCY = Pattern.compile("^[A-Z]{3}$");
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
     * 대상 통화들의 {@code [from, to]} 기준일 값(기준 통화는 KRW 고정). 순서는 보장하지 않는다(호출자가 날짜별로 모은다).
     * 표를 못 읽으면 빈 목록.
     */
    public List<ExchangeRatePoint> read(String base, Collection<String> currencies, LocalDate from, LocalDate to) {
        if (currencies == null || currencies.isEmpty()) return List.of();
        String schema = schema();
        List<ExchangeRatePoint> out = new ArrayList<>();
        try {
            String[] labels = readLabels(schema);
            // 요청한 통화 → 칼럼 번호(0 기준). 라벨에 없는 통화는 값이 없다.
            List<String> curs = new ArrayList<>();
            List<Integer> columns = new ArrayList<>();
            for (String cur : currencies) {
                int column = cur == null ? -1 : Arrays.asList(labels).indexOf(cur.trim().toUpperCase(Locale.ROOT));
                if (column >= 0 && !curs.contains(cur.trim().toUpperCase(Locale.ROOT))) {
                    curs.add(cur.trim().toUpperCase(Locale.ROOT));
                    columns.add(column);
                }
            }
            if (!curs.isEmpty()) {
                MapSqlParameterSource params = new MapSqlParameterSource()
                        .addValue("md", MARU_DATA_ID)
                        .addValue("openEnd", OPEN_END)
                        .addValue("lo", from.format(YMD))
                        .addValue("hi", to.format(YMD));
                jdbc.query(itemSql(schema, columns), params, (RowCallbackHandler) rs -> readRow(rs, curs, from, to, out));
            }
        } catch (DataAccessException e) {
            handleUnreadable(schema, e);
            return List.of();
        }
        unreadableLogged.set(false);
        return out;
    }

    /**
     * 환율 마스터가 가진 통화 코드 — {@code ATTR01~10_NAME} 라벨 순서대로, 영문 대문자 3자리이고 KRW 가 아닌 것만 중복 없이.
     * 위젯 편집기의 통화 선택지다. 표를 못 읽으면 빈 목록(읽는 쪽이 고정 목록으로 대신한다).
     */
    public List<String> currencies() {
        String schema = schema();
        try {
            List<String> out = new ArrayList<>();
            for (String label : readLabels(schema)) {
                if (label != null && CURRENCY.matcher(label).matches() && !"KRW".equals(label) && !out.contains(label)) out.add(label);
            }
            unreadableLogged.set(false);
            return List.copyOf(out);
        } catch (DataAccessException e) {
            handleUnreadable(schema, e);
            return List.of();
        }
    }

    /** 칼럼 번호(0 기준)별 통화 라벨 — 라벨이 없으면 null. 마스터 정의 행이 없으면 모두 null. */
    private String[] readLabels(String schema) {
        String[] labels = new String[ATTR_COUNT];
        jdbc.query(labelSql(schema), new MapSqlParameterSource().addValue("md", MARU_DATA_ID), (RowCallbackHandler) rs -> {
            for (int i = 0; i < ATTR_COUNT; i++) {
                String v = rs.getString(i + 1);
                labels[i] = v == null || v.isBlank() ? null : v.trim().toUpperCase(Locale.ROOT);
            }
        });
        return labels;
    }

    /** 「표를 못 읽음」 계열 오류면 경고를 한 번 남기고 삼킨다. 그 밖의 DB 오류는 그대로 올린다. */
    private void handleUnreadable(String schema, DataAccessException e) {
        if (!isUnreadable(e)) throw e;
        if (unreadableLogged.compareAndSet(false, true)) {
            log.warn("[widgetExt] MDM 환율 마스터({}.TB_MDM_DATA_ITEM)를 읽지 못해 환율 없음으로 답한다"
                    + " — 스키마·SELECT 권한(dmes.widget.ext.exchange.mdm-schema)을 확인하세요: {}", schema, e.getMessage());
        }
    }

    private static String labelSql(String schema) {
        StringBuilder sql = new StringBuilder(256).append("SELECT ");
        for (int i = 1; i <= ATTR_COUNT; i++) {
            sql.append(i == 1 ? "" : "\n     , ").append(String.format("A.ATTR%02d_NAME", i));
        }
        return sql.append("\nFROM   ").append(schema).append(".TB_MDM_DATA A\nWHERE  A.MARU_DATA_ID = :md").toString();
    }

    private static String itemSql(String schema, List<Integer> columns) {
        StringBuilder sql = new StringBuilder(256).append("SELECT A.CODE");
        for (int column : columns) {
            sql.append("\n     , ").append(String.format("A.ATTR%02d", column + 1));
        }
        return sql.append("\nFROM   ").append(schema).append(".TB_MDM_DATA_ITEM A\n")
                .append("WHERE  A.MARU_DATA_ID = :md\n")
                .append("AND    A.VALID_TO = :openEnd\n")
                .append("AND    A.CODE BETWEEN :lo AND :hi").toString();
    }

    /** 한 날짜 행을 통화별 점으로 바꾼다. 키가 날짜가 아니거나 구간 밖이면 행째 건너뛰고, 환율이 맞지 않는 칼럼만 건너뛴다. */
    private static void readRow(ResultSet rs, List<String> curs, LocalDate from, LocalDate to, List<ExchangeRatePoint> out)
            throws SQLException {
        String code = rs.getString(1);
        LocalDate date;
        try {
            date = LocalDate.parse(code == null ? "" : code.trim(), YMD);
        } catch (DateTimeParseException e) {
            log.warn("[widgetExt] MDM 환율 마스터 행을 건너뜀 — 키가 기준일(yyyyMMdd)이 아니다: code={}", code);
            return;
        }
        if (date.isBefore(from) || date.isAfter(to)) return;
        for (int i = 0; i < curs.size(); i++) {
            String rate = rs.getString(i + 2);
            if (rate == null || rate.isBlank()) continue;
            try {
                BigDecimal value = new BigDecimal(rate.trim());
                if (value.signum() <= 0) throw new NumberFormatException("0 이하");
                out.add(new ExchangeRatePoint(date, curs.get(i), value));
            } catch (NumberFormatException e) {
                log.warn("[widgetExt] MDM 환율 마스터 칼럼을 건너뜀 — 환율을 읽을 수 없다: code={} cur={}", code, curs.get(i));
            }
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
