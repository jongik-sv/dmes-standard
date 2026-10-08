package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.job.builtin.JobBind;
import com.dongkuk.dmes.mcm.widget.query.SqlGuard;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetReadOnlyJdbc;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.support.JdbcUtils;

/**
 * 수집(SQL) 원천의 읽기 전용 실행 — 그 모듈의 기본 DataSource 를 {@link WidgetReadOnlyJdbc}(연결 readOnly·늘 롤백·Oracle {@code SET TRANSACTION READ ONLY})로
 * 읽고 SQL 은 {@link SqlGuard}(한 문장 SELECT·WITH, 금지 낱말·DB 링크 거절)로 검사한다. 위젯 쿼리 실행기({@code WidgetQueryExecutor})는 MCM 에만 있어
 * 쓰지 않는다(계획 D7). 행 상한은 호출자가 정하고(수집 50), 쿼리 시간 초과는 호출자가 min(10초, 남은 시간)으로 준다.
 * 변수: 작업 변수는 {@code :이름} 으로 바인드한다. 위젯 시스템 변수 {@code :today :yesterday :monthStart :now} 는 같은 이름의 작업 변수가 없을 때
 * 예정 날짜 기준으로 채운다. {@code :userId·:deptCd} 는 수집에 사용자가 없어 거절한다. 실패 문구에는 DB 메시지를 넣지 않는다.
 */
public class JobCollectSql {

    public static final int MAX_TIMEOUT_SEC = 10;
    public static final String MSG_LOAD_FAILED = "수집 데이터를 불러오지 못했습니다";
    static final String MSG_USER_VARIABLE = "수집 SQL 에는 사용자 변수(:userId·:deptCd)를 쓸 수 없습니다. 수집에는 사용자가 없습니다";

    private static final Logger log = LoggerFactory.getLogger(JobCollectSql.class);
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final int FETCH_SIZE = 100;

    private final WidgetReadOnlyJdbc readOnlyJdbc;
    private final Prepared prepared;

    public JobCollectSql(DataSource dataSource) {
        this.readOnlyJdbc = new WidgetReadOnlyJdbc(dataSource);
        this.prepared = new Prepared(dataSource);
    }

    /** 저장 검사 — 한 문장 SELECT·WITH, 선언한 작업 변수만, 사용자 변수 거절. 어기면 {@link CollectException}. */
    public void validate(String sql, Set<String> declaredVars) {
        SqlGuard.Validated v;
        try {
            v = SqlGuard.checkDeclared(sql, declaredVars);
        } catch (BusinessException e) {
            throw new CollectException(e.getMessage());
        }
        requireNoUserVariables(v);
    }

    public WidgetQueryResult run(String sql, Map<String, Object> vars, Map<String, String> varTypes, int timeoutSec, int maxRows, LocalDate today) {
        SqlGuard.Validated v;
        try {
            v = SqlGuard.checkDeclared(sql, vars.keySet());
        } catch (BusinessException e) {
            throw new CollectException(e.getMessage());   // 검사 문구 — DB 메시지가 아니다
        }
        requireNoUserVariables(v);
        MapSqlParameterSource params = new MapSqlParameterSource();
        for (String name : v.userVariables()) bind(params, name, vars.get(name), varTypes.get(name));
        for (String name : v.variables()) {
            if (vars.containsKey(name)) bind(params, name, vars.get(name), varTypes.get(name));
            else params.addValue(name, systemValue(name, today), "now".equals(name) ? java.sql.Types.TIMESTAMP : java.sql.Types.VARCHAR);
        }
        int timeout = Math.max(1, Math.min(MAX_TIMEOUT_SEC, timeoutSec));
        try {
            return readOnlyJdbc.execute(con -> {
                PreparedStatementCreator creator = prepared.creator(v.sql(), params);
                try (PreparedStatement ps = creator.createPreparedStatement(con)) {
                    ps.setMaxRows(maxRows + 1);
                    ps.setQueryTimeout(timeout);
                    ps.setFetchSize(Math.min(FETCH_SIZE, maxRows + 1));
                    try (ResultSet rs = ps.executeQuery()) {
                        return extract(rs, maxRows);
                    }
                }
            });
        } catch (SQLException | RuntimeException e) {
            log.warn("수집 쿼리 실행 실패 원인={}", e.getClass().getSimpleName());   // DB 메시지는 남기지 않는다
            if (e instanceof java.sql.SQLTimeoutException || e instanceof org.springframework.dao.QueryTimeoutException
                    || (e instanceof SQLException se && se.getErrorCode() == 1013)) {
                // FAIL 이 아니라 TIMEOUT 으로 기록되도록 쿼리 시간 초과 예외를 원인과 함께 올린다(진입점이 원인 사슬로 판정한다)
                throw new org.springframework.dao.QueryTimeoutException("수집 쿼리가 제한 시간을 넘었습니다", e);
            }
            throw new CollectException(MSG_LOAD_FAILED);
        }
    }

    private static void requireNoUserVariables(SqlGuard.Validated v) {
        for (String name : v.variables()) {
            if ("userId".equals(name) || "deptCd".equals(name)) throw new CollectException(MSG_USER_VARIABLE);
        }
    }

    private static void bind(MapSqlParameterSource params, String name, Object value, String type) {
        JobBind.Bound b = JobBind.of(value, type);
        params.addValue(name, b.value(), b.sqlType());
    }

    private static Object systemValue(String name, LocalDate today) {
        return switch (name) {
            case "today" -> YMD.format(today);
            case "yesterday" -> YMD.format(today.minusDays(1));
            case "monthStart" -> YMD.format(today.withDayOfMonth(1));
            case "now" -> Timestamp.valueOf(LocalDateTime.now(ZONE));
            default -> throw new CollectException("알 수 없는 변수입니다: :" + name);
        };
    }

    private static WidgetQueryResult extract(ResultSet rs, int maxRows) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int count = md.getColumnCount();
        List<String> columns = new ArrayList<>(count);
        Set<String> seen = new HashSet<>();
        for (int i = 1; i <= count; i++) {
            String label = JdbcUtils.lookupColumnName(md, i);
            if (label == null || label.isBlank()) label = "COL" + i;
            String unique = label;
            for (int k = 2; !seen.add(unique); k++) unique = label + "_" + k;
            columns.add(unique);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        boolean truncated = false;
        while (rs.next()) {
            if (rows.size() >= maxRows) {
                truncated = true;
                break;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= count; i++) row.put(columns.get(i - 1), value(rs, i));
            rows.add(Collections.unmodifiableMap(row));
        }
        return new WidgetQueryResult(List.copyOf(columns), List.copyOf(rows), truncated);
    }

    private static Object value(ResultSet rs, int index) throws SQLException {
        Object v = JdbcUtils.getResultSetValue(rs, index);   // CLOB 은 글자로
        if (v instanceof Timestamp ts) return ts.toLocalDateTime().toString();
        if (v instanceof byte[]) return null;
        return v;
    }

    /** NamedParameterJdbcTemplate 의 이름 붙은 변수 처리를 빌려 문장을 만든다(연결은 읽기 전용 범위가 준 것을 쓴다). */
    private static final class Prepared extends NamedParameterJdbcTemplate {
        Prepared(DataSource dataSource) {
            super(dataSource);
        }

        PreparedStatementCreator creator(String sql, SqlParameterSource params) {
            return getPreparedStatementCreator(sql, params);
        }
    }
}
