package com.dongkuk.dmes.mcm.widget.query;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.sql.Blob;
import java.sql.Clob;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.support.JdbcUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 쿼리 위젯 실행기 — 스펙 2026-10-02-widget-admin-generic §7. {@link WidgetQueryRunner} 의 유일한 구현.
 * <ul>
 *   <li>mcm 업무 코드에 기대지 않고 {@link DataSource}·{@link PlatformTransactionManager} 만 받는다 — 다른 모듈은 같은 클래스를
 *       자기 DataSource 로 붙이면 된다(다른 모듈 실제 연결은 이번 범위 밖, 지금은 {@code dataSrc=mcm} 만 실행).</li>
 *   <li>SQL 은 늘 {@link SqlGuard} 검사(§7.1)를 거친다. 저장된 정의도 실행 때마다 다시 검사한다.</li>
 *   <li>실행은 별도(REQUIRES_NEW)·읽기 전용 트랜잭션에서 하고 <b>늘 롤백</b>한다. 행 상한+1·10초·가져오기 100(§7.3).</li>
 *   <li>시스템 변수(§7.2)는 SQL 이 쓰는 것만 만들고 바인딩한다. 사용자 값은 늘 인증 컨텍스트에서 얻는다(IDOR).</li>
 *   <li>결과 캐시: 키 (defId, 행 상한, 쓰인 시스템 변수 값들 — {@code :now} 는 30초 구간 시작), 30초. 정의 저장 이벤트가 오면
 *       그 defId 캐시를 비운다.</li>
 *   <li>DB 오류: 사용자에게는 고정 문구, 서버 로그에는 defId·원인. 관리자 미리보기만 DB 메시지를 보여 준다.</li>
 * </ul>
 * <b>운영 주의</b>: {@code readOnly} 는 SQLite 에서 효과가 없고 SQL Server 에서는 힌트일 뿐이며, SQL Server 는 {@code ;} 없이도
 * 한 배치에 문장을 이어 쓸 수 있다. 그래서 운영 DB 에서는 이 실행기에 <b>읽기 권한만 가진 DB 계정의 DataSource</b> 를 붙이는 것이
 * 근본 대책이다(실행기는 DataSource 만 받으므로 빈 연결만 바꾸면 된다).
 */
@Component
public class WidgetQueryExecutor implements WidgetQueryRunner {

    private static final Logger log = LoggerFactory.getLogger(WidgetQueryExecutor.class);

    /** 시스템 변수 날짜 기준 시간대(§7.2). */
    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    static final String DATA_SRC_MCM = "mcm";
    static final String QUERY_TYPE_PREFIX = "query-";
    static final int QUERY_TIMEOUT_SEC = 10;
    static final int FETCH_SIZE = 100;
    static final Duration CACHE_TTL = Duration.ofSeconds(30);
    /** 캐시 항목 상한 — 사용자마다 키가 다른 SQL(:userId 등)이 많아도 메모리가 끝없이 늘지 않게. 넘으면 그 결과는 캐시하지 않는다. */
    static final int CACHE_MAX_ENTRIES = 1000;
    static final int CLOB_MAX_CHARS = 4000;

    static final String MSG_NOT_FOUND = "위젯 정의를 찾을 수 없습니다";
    static final String MSG_DISABLED = "사용 중지된 위젯입니다";
    static final String MSG_NOT_QUERY = "쿼리 위젯이 아닙니다";
    static final String MSG_UNSUPPORTED_SRC = "아직 지원하지 않는 모듈입니다";
    static final String MSG_NO_SQL = "위젯 정의에 SQL 이 없습니다";
    static final String MSG_LOAD_FAILED = "위젯 데이터를 불러오지 못했습니다";
    static final String MSG_PREVIEW_PREFIX = "쿼리 오류: ";

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    /** 로컬 SQLite 실행 때 지우는 스키마 접두(대소문자 무시, 식별자 중간은 제외). */
    private static final Pattern SCHEMA_PREFIX = Pattern.compile("(?i)(?<![\\p{L}\\p{N}_$#])MCMAPUSER\\.");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final WidgetDefRepository defRepository;
    private final WidgetUserContextResolver userContextResolver;
    private final DataSource dataSource;
    private final LimitedJdbcTemplate jdbc;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;
    private final Map<CacheKey, CachedResult> cache = new ConcurrentHashMap<>();

    /**
     * 캐시 키. sql 은 실행한 SQL — 정의 저장 순간 실행 중이던 호출이 옛 SQL 결과를 넣어도 저장 뒤 호출은 다른 키를 써서
     * 옛 결과를 받지 않는다. variables 는 SQL 이 쓰는 시스템 변수 이름 → 값(이름 순, null 값 허용).
     */
    record CacheKey(String defId, String sql, int maxRows, Map<String, Object> variables) {}

    private record CachedResult(WidgetQueryResult result, Instant expiresAt) {}

    @Autowired
    public WidgetQueryExecutor(WidgetDefRepository defRepository,
                               WidgetUserContextResolver userContextResolver,
                               DataSource dataSource,
                               PlatformTransactionManager transactionManager) {
        this(defRepository, userContextResolver, dataSource, transactionManager, Clock.system(ZONE));
    }

    WidgetQueryExecutor(WidgetDefRepository defRepository,
                        WidgetUserContextResolver userContextResolver,
                        DataSource dataSource,
                        PlatformTransactionManager transactionManager,
                        Clock clock) {
        this.defRepository = defRepository;
        this.userContextResolver = userContextResolver;
        this.dataSource = dataSource;
        this.jdbc = new LimitedJdbcTemplate(dataSource);
        this.clock = clock;
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setName("widgetQuery");
        tx.setReadOnly(true);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.transactionTemplate = tx;
    }

    @Override
    public WidgetQueryResult runDefinition(String defId, int maxRows) {
        requireMaxRows(maxRows);
        String id = defId == null ? null : defId.strip();
        if (id == null || id.isEmpty()) throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_NOT_FOUND);
        WidgetDef def = defRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, MSG_NOT_FOUND));
        if (!def.isInUse()) throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_DISABLED);
        if (!def.isDefinition() || def.getTypeId() == null || !def.getTypeId().startsWith(QUERY_TYPE_PREFIX)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_NOT_QUERY);
        }
        requireSupportedSource(def.getDataSrc());
        SqlGuard.Validated validated = SqlGuard.check(sqlOf(def));
        Map<String, Object> values = systemValues(validated.variables());

        Instant now = clock.instant();
        CacheKey key = new CacheKey(id, validated.sql(), maxRows, cacheKeyValues(values, now));
        CachedResult hit = cache.get(key);
        if (hit != null && now.isBefore(hit.expiresAt())) return hit.result();

        WidgetQueryResult result;
        try {
            result = execute(validated.sql(), values, maxRows);
        } catch (RuntimeException e) {
            // DB 메시지(표·컬럼 이름 등)는 사용자에게 보내지 않는다 — 서버 로그에만(§7.3).
            log.warn("위젯 쿼리 실행 실패 defId={} 원인={}", id, rootMessage(e));
            log.debug("위젯 쿼리 실행 실패 상세 defId={}", id, e);
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_LOAD_FAILED);
        }
        cache.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt()));
        if (cache.size() < CACHE_MAX_ENTRIES) cache.put(key, new CachedResult(result, now.plus(CACHE_TTL)));
        return result;
    }

    @Override
    public WidgetQueryResult preview(String dataSrc, String sql, int maxRows) {
        requireMaxRows(maxRows);
        requireSupportedSource(dataSrc);
        SqlGuard.Validated validated = SqlGuard.check(sql);
        Map<String, Object> values = systemValues(validated.variables());
        try {
            return execute(validated.sql(), values, maxRows);
        } catch (RuntimeException e) {
            // 관리자 SQL 작성 도움 — DB 메시지를 그대로 보여 준다(§7.3).
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_PREVIEW_PREFIX + rootMessage(e));
        }
    }

    @Override
    public void validateSql(String sql) {
        SqlGuard.check(sql);
    }

    /** 정의를 저장·삭제하면 그 정의의 캐시 항목(모든 사용자·행 상한)을 비운다. */
    @EventListener
    public void onDefSaved(WidgetDefSavedEvent event) {
        if (event == null || event.widgetId() == null) return;
        String id = event.widgetId().strip();
        cache.keySet().removeIf(key -> key.defId().equals(id));
    }

    TransactionTemplate transactionTemplate() {
        return transactionTemplate;
    }

    int cacheSize() {
        return cache.size();
    }

    /**
     * 캐시 키에 넣을 변수 값. {@code :now} 는 부를 때마다 바뀌어(나노초) 그대로 넣으면 호출마다 새 항목이 생기고, 상한(1000)이 차면
     * 다른 정의의 결과까지 캐시되지 않는다. 그래서 키에는 TTL(30초) 구간의 시작 시각만 넣는다 — 같은 구간의 호출은 한 항목을 다시 쓴다.
     * 바인딩 값은 그대로 현재 시각이다(캐시된 결과가 최대 30초 묵는 것은 다른 변수와 같다).
     */
    static Map<String, Object> cacheKeyValues(Map<String, Object> values, Instant now) {
        if (!values.containsKey("now")) return values;
        long ttl = CACHE_TTL.toSeconds();
        Map<String, Object> keyValues = new TreeMap<>(values);
        keyValues.put("now", Instant.ofEpochSecond(Math.floorDiv(now.getEpochSecond(), ttl) * ttl));
        return Collections.unmodifiableMap(keyValues);
    }

    /**
     * SQL 이 쓰는 시스템 변수만 값을 만든다(§7.2). 사용자 정보는 :userId·:deptCd 를 쓸 때만 읽는다.
     * 날짜는 시계의 시간대와 관계없이 Asia/Seoul 기준.
     */
    Map<String, Object> systemValues(List<String> variables) {
        Map<String, Object> values = new TreeMap<>();
        if (variables.isEmpty()) return Collections.unmodifiableMap(values);
        WidgetUserContext user = variables.contains("userId") || variables.contains("deptCd")
                ? userContextResolver.current() : null;
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), ZONE);
        LocalDate today = now.toLocalDate();
        for (String name : variables) {
            Object value = switch (name) {
                case "userId" -> user.userId();
                case "deptCd" -> user.deptCd();
                case "today" -> YMD.format(today);
                case "yesterday" -> YMD.format(today.minusDays(1));
                case "monthStart" -> YMD.format(today.withDayOfMonth(1));
                case "now" -> Timestamp.valueOf(now);
                default -> throw new IllegalArgumentException("알 수 없는 시스템 변수입니다: " + name);
            };
            values.put(name, value);
        }
        return Collections.unmodifiableMap(values);
    }

    // ── 실행 ────────────────────────────────────────────────────────────

    private WidgetQueryResult execute(String sql, Map<String, Object> values, int maxRows) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        // 값이 null(부서 없음)이어도 형을 알려 줘야 PostgreSQL·H2 가 받는다.
        values.forEach((name, value) -> params.addValue(name, value, "now".equals(name) ? Types.TIMESTAMP : Types.VARCHAR));
        return transactionTemplate.execute(status -> {
            status.setRollbackOnly(); // 늘 롤백(§7.3) — 끝날 때 commit() 이 아니라 rollback 으로 닫힌다.
            if (!TransactionSynchronizationManager.hasResource(dataSource)) {
                // 트랜잭션 관리자가 이 DataSource 를 관리하지 않으면 자동 커밋 연결로 돌게 된다 — 실행하지 않는다.
                throw new IllegalStateException("위젯 쿼리 트랜잭션이 DataSource 연결을 잡지 못했습니다");
            }
            return jdbc.queryLimited(adaptForLocalSqlite(sql), params, maxRows + 1, rs -> extract(rs, maxRows));
        });
    }

    /**
     * 로컬 SQLite 는 스키마가 없다 — JDBC 로 바로 실행하는 SQL 은 Hibernate 의 {@link McmAuditStatementInspector} 를 거치지 않으므로
     * 같은 규칙({@code MCMAPUSER.} 접두·{@code N'…'} 접두 제거)을 여기서 적용한다. 운영 DB(Oracle·PostgreSQL)에서는 그대로 실행한다.
     * 검사(§7.1)는 늘 원문으로 끝낸 뒤라 이 변환이 검사를 우회하지 않는다(접두를 지우기만 한다).
     */
    static String adaptForLocalSqlite(String sql) {
        if (!McmAuditStatementInspector.isSqlite()) return sql;
        return McmAuditStatementInspector.stripUnicodeLiteralPrefix(SCHEMA_PREFIX.matcher(sql).replaceAll(""));
    }

    /** 행을 maxRows+1 개까지만 읽는다 — 하나라도 더 있으면 버리고 truncated. CLOB 은 연결이 닫히기 전에 여기서 읽는다. */
    private static WidgetQueryResult extract(ResultSet rs, int maxRows) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int count = md.getColumnCount();
        List<String> columns = new ArrayList<>(count);
        Set<String> seen = new HashSet<>();
        for (int i = 1; i <= count; i++) {
            String label = JdbcUtils.lookupColumnName(md, i);
            if (label == null || label.isBlank()) label = "COL" + i;
            String unique = label;
            for (int k = 2; !seen.add(unique); k++) unique = label + "_" + k; // SELECT a, a — 키가 겹치면 뒤에 번호
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
            for (int i = 1; i <= count; i++) row.put(columns.get(i - 1), readValue(rs, i));
            rows.add(Collections.unmodifiableMap(row));
        }
        return new WidgetQueryResult(List.copyOf(columns), List.copyOf(rows), truncated);
    }

    /** 값 → JSON 으로 보낼 수 있는 형(§7.3). */
    static Object readValue(ResultSet rs, int index) throws SQLException {
        Object value = rs.getObject(index);
        if (value == null) return null;
        if (value instanceof Clob clob) return clobText(clob);
        if (value instanceof Blob || value instanceof byte[]) return null;
        String className = value.getClass().getName();
        if (className.startsWith("oracle.sql.TIMESTAMP") || className.startsWith("oracle.sql.DATE")) {
            value = rs.getTimestamp(index); // Oracle 드라이버 고유 형
        }
        return toJsonValue(value);
    }

    static Object toJsonValue(Object value) {
        if (value == null) return null;
        if (value instanceof String || value instanceof Boolean) return value;
        if (value instanceof BigDecimal || value instanceof BigInteger || value instanceof Integer
                || value instanceof Long || value instanceof Short || value instanceof Byte) {
            return value;
        }
        if (value instanceof Double d) return d.isNaN() || d.isInfinite() ? d.toString() : d;
        if (value instanceof Float f) return f.isNaN() || f.isInfinite() ? f.toString() : f;
        if (value instanceof Timestamp ts) return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(ts.toLocalDateTime());
        if (value instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (value instanceof java.sql.Time t) return t.toLocalTime().toString();
        if (value instanceof java.util.Date d) return d.toInstant().toString();
        if (value instanceof LocalDateTime ldt) return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(ldt);
        if (value instanceof OffsetDateTime odt) return DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(odt);
        if (value instanceof TemporalAccessor) return value.toString();
        return value.toString();
    }

    private static String clobText(Clob clob) throws SQLException {
        try {
            long length = clob.length();
            return length == 0 ? "" : clob.getSubString(1, (int) Math.min(length, CLOB_MAX_CHARS));
        } finally {
            try {
                clob.free();
            } catch (SQLException | RuntimeException ignored) {
                // 드라이버가 free 를 지원하지 않아도 값은 이미 읽었다
            }
        }
    }

    // ── 검사 도우미 ──────────────────────────────────────────────────────

    /** 지금은 mcm 만 실행한다. 비어 있으면 mcm 으로 본다(유일한 모듈). */
    private static void requireSupportedSource(String dataSrc) {
        String src = dataSrc == null ? "" : dataSrc.strip();
        if (!src.isEmpty() && !DATA_SRC_MCM.equals(src)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_UNSUPPORTED_SRC);
        }
    }

    private static void requireMaxRows(int maxRows) {
        if (maxRows < 1) throw new IllegalArgumentException("행 상한은 1 이상이어야 합니다: " + maxRows);
    }

    /** CONFIG_JSON 의 sql(§6). */
    private static String sqlOf(WidgetDef def) {
        String json = def.getConfigJson();
        if (json == null || json.isBlank()) throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_NO_SQL);
        JsonNode node;
        try {
            node = JSON.readTree(json);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_NO_SQL);
        }
        JsonNode sql = node == null ? null : node.get("sql");
        if (sql == null || !sql.isTextual() || sql.asText().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_NO_SQL);
        }
        return sql.asText();
    }

    private static String rootMessage(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        String message = root.getMessage();
        return message == null || message.isBlank() ? root.getClass().getSimpleName() : message.strip();
    }

    /** {@link NamedParameterJdbcTemplate} 이 만든 문장에 행 상한·시간 제한·가져오기 크기를 건다(§7.3). */
    static final class LimitedJdbcTemplate extends NamedParameterJdbcTemplate {

        LimitedJdbcTemplate(DataSource dataSource) {
            super(dataSource);
        }

        <T> T queryLimited(String sql, SqlParameterSource params, int fetchRows, ResultSetExtractor<T> extractor) {
            PreparedStatementCreator named = getPreparedStatementCreator(sql, params);
            PreparedStatementCreator limited = con -> {
                PreparedStatement ps = named.createPreparedStatement(con);
                ps.setMaxRows(fetchRows);
                ps.setQueryTimeout(QUERY_TIMEOUT_SEC);
                // 가져오기 크기가 행 상한보다 크면 거절하는 드라이버가 있다(H2 등 — 미리보기 50+1행).
                ps.setFetchSize(Math.min(FETCH_SIZE, fetchRows));
                return ps;
            };
            return getJdbcOperations().query(limited, extractor);
        }
    }
}
