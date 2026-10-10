package com.dongkuk.dmes.mcm.widget.query;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.util.BizDay;
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
import java.sql.Connection;
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
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterUtils;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.support.JdbcUtils;
import org.springframework.stereotype.Component;

/**
 * 쿼리 위젯 실행기 — 스펙 2026-10-02-widget-admin-generic §7. {@link WidgetQueryRunner} 의 유일한 구현.
 * <ul>
 *   <li>mcm 업무 코드에 기대지 않고 {@link DataSource} 만 받는다 — 다른 모듈은 같은 클래스를 자기 DataSource 로 붙이면 된다
 *       (다른 모듈 실제 연결은 이번 범위 밖, 지금은 {@code dataSrc=mcm} 만 실행). 스프링 빈은 {@link WidgetQueryDataSource}
 *       (전용 설정 {@code dmes.widget.query.datasource.*} 이 있으면 그것, 없으면 앱 기본 DataSource)를 받는다.</li>
 *   <li>SQL 은 늘 {@link SqlGuard} 검사(§7.1)를 거친다. 저장된 정의도 실행 때마다 다시 검사한다.</li>
 *   <li>실행은 {@link WidgetReadOnlyJdbc} 가 따로 빌린 연결에서 읽기 전용(readOnly·방언별 보강)으로 하고 <b>늘 롤백</b>한다.
 *       스레드에 묶인 업무 트랜잭션 연결은 쓰지 않는다. 행 상한+1·10초·가져오기 100(§7.3).</li>
 *   <li>시스템 변수(§7.2)는 SQL 이 쓰는 것만 만들고 바인딩한다. 사용자 값은 늘 인증 컨텍스트에서 얻는다(IDOR).</li>
 *   <li>사용자 입력 조건(스펙 입력 조건): 정의 CONFIG_JSON 의 {@code params} 선언을 실행 때마다 다시 읽어 검사하고({@link QueryParams}),
 *       SQL 의 {@code :name} 중 시스템 변수가 아닌 것은 선언된 것만 허락한다. 값은 서버가 형별로 해석한 스칼라(BigDecimal·String·null)로
 *       <b>바인드 변수로만</b> 넣는다 — 문자열 이어붙이기는 없다.</li>
 *   <li>결과 캐시: 키 (defId, 행 상한, 쓰인 시스템 변수 값들 — {@code :now} 는 30초 구간 시작 — 과 해석을 마친 사용자 조건 값들), 30초.
 *       정의 저장 이벤트가 오면 그 defId 캐시를 비운다. 키가 끝없이 늘어도(조건 값 조합·사용자별 :userId) 정의 하나가 캐시 전체를 채우지 못하게 정의별 상한을 둔다.</li>
 *   <li>DB 오류: 사용자에게는 고정 문구, 서버 로그에는 defId·원인. 관리자 미리보기만 DB 메시지를 보여 준다.</li>
 *   <li>{@link #run}: 정의 없는 저수준 실행(맞춤 레포트 조회, 2026-10-10 스펙 §5) — 같은 검사·바인드·읽기 전용 실행을 캐시 없이.
 *       오류는 {@link WidgetQueryRunException}(Kind 로 구분, 안전 문구만 담는다)으로 돌리고 원인은 cause 로만 남긴다.</li>
 * </ul>
 * <b>운영 주의</b>: 읽기 전용 트랜잭션을 걸 수 없는 DB(Oracle 이 아닌 갈래 OTHER — {@code readOnly} 는 힌트일 뿐)에서는
 * 전용 DataSource({@code dmes.widget.query.datasource.*})가 없으면 <b>실행·미리보기·저장 검사를 모두 거절한다</b>(실패 닫힘, {@link #validate}).
 * Oracle 은 자율 트랜잭션 함수·DDL 의 암묵 커밋이 읽기 전용 트랜잭션과 롤백을 벗어난다.
 * 그래서 운영 DB 에서는 어느 DB 든 <b>읽기 권한만 가진 DB 계정의 DataSource</b> 를 붙이는 것이 근본 대책이다.
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
    /** 정의 하나가 차지할 수 있는 캐시 항목 상한 — 입력 조건 값 조합·사용자(:userId)마다 키가 달라 한 정의가 전체 상한을 채우지 못하게. 이름은 옛 이름 그대로. */
    static final int CACHE_MAX_ENTRIES_PER_PARAM_DEF = 50;
    static final int CLOB_MAX_CHARS = 4000;

    static final String MSG_NOT_FOUND = "위젯 정의를 찾을 수 없습니다";
    static final String MSG_DISABLED = "사용 중지된 위젯입니다";
    static final String MSG_NOT_QUERY = "쿼리 위젯이 아닙니다";
    static final String MSG_UNSUPPORTED_SRC = "아직 지원하지 않는 모듈입니다";
    static final String MSG_NO_SQL = "위젯 정의에 SQL 이 없습니다";
    static final String MSG_LOAD_FAILED = "위젯 데이터를 불러오지 못했습니다";
    static final String MSG_PREVIEW_PREFIX = "쿼리 오류: ";
    static final String MSG_OTHER_NEEDS_DEDICATED =
            "읽기 전용 트랜잭션을 걸 수 없는 DB 에서는 읽기 전용 계정의 전용 연결(dmes.widget.query.datasource)을 설정해야 쿼리 위젯을 실행할 수 있습니다";
    static final String MSG_REQUIRE_DEDICATED =
            "이 서버는 쿼리 위젯에 읽기 전용 계정의 전용 연결(dmes.widget.query.datasource)을 요구합니다(dmes.widget.query.require-dedicated)"
                    + " — 읽기 권한만 가진 계정을 쓰고, 그 계정에 자율 트랜잭션 함수의 EXECUTE 권한과 DB 링크를 주지 마세요";
    static final String MSG_CODE_LOOKUP_FAILED = QueryParams.MSG_CODE_LOOKUP_FAILED;
    static final String MSG_DB_UNAVAILABLE = "쿼리 위젯 DB 에 연결하지 못했습니다";

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final WidgetDefRepository defRepository;
    private final WidgetUserContextResolver userContextResolver;
    private final WidgetReadOnlyJdbc readOnlyJdbc;
    /** 전용 DataSource(dmes.widget.query.datasource.*)인가 — 읽기 전용 트랜잭션이 없는 DB 에서 실행을 허락할지 정한다. */
    private final boolean dedicated;
    /** dmes.widget.query.require-dedicated — true 면 전용 DataSource 가 아닐 때 DB 갈래와 상관없이 거절한다. */
    private final boolean requireDedicated;
    private final LimitedJdbcTemplate jdbc;
    private final Clock clock;
    /** 코드 그룹 조건(codeGroup)의 항목 확인 — 없으면 codeGroup 값이 있는 실행은 거절한다(실패 닫힘). */
    private QueryCodeLookup codeLookup;
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
                               WidgetQueryDataSource queryDataSource) {
        this(defRepository, userContextResolver, queryDataSource, Clock.system(ZONE));
    }

    WidgetQueryExecutor(WidgetDefRepository defRepository,
                        WidgetUserContextResolver userContextResolver,
                        WidgetQueryDataSource queryDataSource,
                        Clock clock) {
        DataSource dataSource = queryDataSource.dataSource();
        this.defRepository = defRepository;
        this.userContextResolver = userContextResolver;
        this.readOnlyJdbc = new WidgetReadOnlyJdbc(dataSource);
        this.dedicated = queryDataSource.dedicated();
        this.requireDedicated = queryDataSource.requireDedicated();
        this.jdbc = new LimitedJdbcTemplate(dataSource);
        this.clock = clock;
    }

    @Autowired(required = false)
    public void setCodeLookup(QueryCodeLookup codeLookup) {
        this.codeLookup = codeLookup;
    }

    @Override
    public WidgetQueryResult runDefinition(String defId, int maxRows, Map<String, ?> userValues) {
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
        String sql = sqlOf(def);
        // 저장 때 검사했어도 실행 때마다 서버가 다시 판정한다 — 정의가 DB 에서 바뀌었거나 검사를 거치지 않고 들어왔을 수 있다.
        List<QueryParam> defs = QueryParams.fromConfig(def.getConfigJson());
        Prepared prepared = prepare(sql, defs, userValues, false);
        SqlGuard.Validated validated = prepared.validated();
        Map<String, QueryParams.Bound> userBinds = prepared.userBinds();
        Map<String, Object> values = prepared.systemValues();

        Instant now = clock.instant();
        CacheKey key = new CacheKey(id, validated.sql(), maxRows, cacheKeyValues(values, userBinds, now));
        CachedResult hit = cache.get(key);
        if (hit != null && now.isBefore(hit.expiresAt())) return hit.result();

        WidgetQueryResult result;
        try {
            result = execute(validated.sql(), values, userBinds, maxRows);
        } catch (RuntimeException e) {
            // DB 메시지(표·컬럼 이름 등)는 사용자에게 보내지 않는다 — 서버 로그에만(§7.3).
            log.warn("위젯 쿼리 실행 실패 defId={} 원인={}", id, rootMessage(e));
            log.debug("위젯 쿼리 실행 실패 상세 defId={}", id, e);
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_LOAD_FAILED);
        }
        cache.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt()));
        boolean roomForDef = cache.keySet().stream().filter(k -> k.defId().equals(id)).count() < CACHE_MAX_ENTRIES_PER_PARAM_DEF;
        if (roomForDef && cache.size() < CACHE_MAX_ENTRIES) cache.put(key, new CachedResult(result, now.plus(CACHE_TTL)));
        return result;
    }

    @Override
    public WidgetQueryResult preview(String dataSrc, String sql, int maxRows, String paramDefsJson) {
        requireMaxRows(maxRows);
        requireSupportedSource(dataSrc);
        List<QueryParam> defs = QueryParams.fromDefsJson(paramDefsJson);
        // 관리자 시험 실행 — 각 조건의 기본값을 값으로 쓰고, 값 없는 필수 조건도 형 붙은 null 로 둔다(컬럼 확인이 목적).
        Prepared prepared = prepare(sql, defs, Map.of(), true);
        try {
            return execute(prepared.validated().sql(), prepared.systemValues(), prepared.userBinds(), maxRows);
        } catch (RuntimeException e) {
            // 관리자 SQL 작성 도움 — DB 메시지를 그대로 보여 준다(§7.3).
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_PREVIEW_PREFIX + rootMessage(e));
        }
    }

    @Override
    public WidgetQueryResult run(String sql, String paramDefsJson, Map<String, ?> values, int maxRows) {
        requireMaxRows(maxRows);
        if (maxRows > WidgetQueryRunner.MAX_ROWS) {
            throw new IllegalArgumentException("행 상한은 " + WidgetQueryRunner.MAX_ROWS + " 이하여야 합니다: " + maxRows);
        }
        List<QueryParam> defs;
        SqlGuard.Validated validated;
        try {
            defs = QueryParams.fromDefsJson(paramDefsJson);
            validated = guard(sql, QueryParams.names(defs), QueryParams.listNames(defs)); // 어느 DB 에나 적용하는 정적 검사 — 정의 오류
        } catch (RuntimeException e) {
            throw new WidgetQueryRunException(WidgetQueryRunException.Kind.DEFINITION, e);
        }
        try {
            requireRunnableDialect(); // 방언·전용 연결 정책 — DB 쪽 오류라 EXECUTION
        } catch (RuntimeException e) {
            throw new WidgetQueryRunException(WidgetQueryRunException.Kind.EXECUTION, e);
        }
        // 입력 값 해석 — 사용자에게 보여도 되는 BusinessException(REQUIRED_VALUE·INVALID_VALUE)이 그대로 나간다(§5).
        Map<String, QueryParams.Bound> userBinds = resolveBinds(defs, validated.userVariables(), values, false);
        Map<String, Object> systemVals;
        try {
            systemVals = systemValues(validated.variables()); // 인증 컨텍스트·사용자 조회 실패도 EXECUTION
        } catch (RuntimeException e) {
            throw new WidgetQueryRunException(WidgetQueryRunException.Kind.EXECUTION, e);
        }
        try {
            return execute(validated.sql(), systemVals, userBinds, maxRows);
        } catch (RuntimeException e) {
            throw new WidgetQueryRunException(WidgetQueryRunException.Kind.EXECUTION, e);
        }
    }

    @Override
    public void validateSql(String sql) {
        validate(sql, Set.of(), Set.of());
    }

    @Override
    public List<String> validateSql(String sql, Set<String> declaredNames) {
        return validate(sql, declaredNames, Set.of()).userVariables();
    }

    @Override
    public List<String> validateSql(String sql, Set<String> declaredNames, Set<String> listNames) {
        return validate(sql, declaredNames, listNames).userVariables();
    }

    @Override
    public void validateCollectSql(String sql) {
        requireNoUserVariables(validate(sql, Set.of(), Set.of()));
    }

    @Override
    public WidgetQueryResult runCollect(String sql, int maxRows) {
        requireMaxRows(maxRows);
        SqlGuard.Validated validated = validate(sql, Set.of(), Set.of());
        requireNoUserVariables(validated);
        Map<String, Object> values = systemValues(validated.variables()); // 사용자 변수가 없으니 인증 컨텍스트를 읽지 않는다
        try {
            return execute(validated.sql(), values, maxRows);
        } catch (RuntimeException e) {
            // DB 메시지는 RUN 행·로그로 새지 않게 서버 로그에만(§7.3).
            log.warn("정시 수집 쿼리 실행 실패 원인={}", rootMessage(e));
            log.debug("정시 수집 쿼리 실행 실패 상세", e);
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_LOAD_FAILED);
        }
    }

    /** 입력 값 해석 — 기본값의 상대 날짜는 실행기 시계의 Asia/Seoul 오늘, 코드 그룹 값은 {@link QueryCodeLookup} 항목으로 확인한다. */
    private Map<String, QueryParams.Bound> resolveBinds(List<QueryParam> defs, Collection<String> used, Map<String, ?> values,
                                                        boolean lenient) {
        return QueryParams.resolve(defs, used, values, lenient, LocalDate.ofInstant(clock.instant(), ZONE), safeLookup());
    }

    /**
     * 코드 조회가 DB 오류로 실패하면 실패 닫힘 — 원인(DB 메시지)은 서버 로그에만 남기고 사용자에게는 안전한 문구의 BusinessException 을 던진다
     * (그대로 나가면 일반 RuntimeException 이라 호출자가 안전 문구로 바꾸지 못한다).
     */
    private QueryCodeLookup safeLookup() {
        QueryCodeLookup lookup = codeLookup;
        if (lookup == null) return null;
        return new QueryCodeLookup() {
            @Override
            public Set<String> items(String groupCd) {
                try {
                    return lookup.items(groupCd);
                } catch (RuntimeException e) {
                    log.warn("코드 그룹 조회 실패 group={} 원인={}", groupCd, rootMessage(e));
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_CODE_LOOKUP_FAILED);
                }
            }

            @Override
            public boolean groupExists(String groupCd) {
                return lookup.groupExists(groupCd);
            }
        };
    }

    /** 검사 → 입력 값 해석 → 시스템 변수까지의 공통 단계를 마친 결과(스펙 2026-10-10-user-query-program-design §5). */
    private record Prepared(SqlGuard.Validated validated, Map<String, QueryParams.Bound> userBinds,
                            Map<String, Object> systemValues) {}

    /** 공통 단계 — SqlGuard 검사 → 입력 값 해석(lenient 여부) → 시스템 변수. runDefinition·preview·run 이 함께 쓴다. */
    private Prepared prepare(String sql, List<QueryParam> defs, Map<String, ?> userValues, boolean lenient) {
        return prepare(validate(sql, QueryParams.names(defs), QueryParams.listNames(defs)), defs, userValues, lenient);
    }

    /** 검사를 마친 뒤의 공통 단계 — {@link #run} 은 예외 종류별 안전 문구(§5·§7) 때문에 단계를 따로 감싼다. */
    private Prepared prepare(SqlGuard.Validated validated, List<QueryParam> defs, Map<String, ?> userValues,
                             boolean lenient) {
        Map<String, QueryParams.Bound> userBinds = resolveBinds(defs, validated.userVariables(), userValues, lenient);
        return new Prepared(validated, userBinds, systemValues(validated.variables()));
    }

    private static void requireNoUserVariables(SqlGuard.Validated validated) {
        for (String name : validated.variables()) {
            if ("userId".equals(name) || "deptCd".equals(name)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE,
                        "정시 수집 SQL 에는 사용자 변수(:userId·:deptCd)를 쓸 수 없습니다. 수집에는 사용자가 없습니다");
            }
        }
    }

    /** 정의를 저장·삭제하면 그 정의의 캐시 항목(모든 사용자·행 상한)을 비운다. */
    @EventListener
    public void onDefSaved(WidgetDefSavedEvent event) {
        if (event == null || event.widgetId() == null) return;
        String id = event.widgetId().strip();
        cache.keySet().removeIf(key -> key.defId().equals(id));
    }

    WidgetReadOnlyJdbc readOnlyJdbc() {
        return readOnlyJdbc;
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
        return cacheKeyValues(values, Map.of(), now);
    }

    /**
     * 시스템 변수 값에 사용자 입력 조건 값(서버가 형 변환·정규화를 마친 것 — 요청 원문이 아니다)을 한 맵으로 합친 캐시 키 값.
     * 사용자 조건 이름은 시스템 변수 이름과 같을 수 없으므로(정의 검사) 서로 덮어쓰지 않는다.
     */
    static Map<String, Object> cacheKeyValues(Map<String, Object> values, Map<String, QueryParams.Bound> userBinds, Instant now) {
        if (!values.containsKey("now") && userBinds.isEmpty()) return values;
        Map<String, Object> keyValues = new TreeMap<>(values);
        if (values.containsKey("now")) {
            long ttl = CACHE_TTL.toSeconds();
            keyValues.put("now", Instant.ofEpochSecond(Math.floorDiv(now.getEpochSecond(), ttl) * ttl));
        }
        userBinds.forEach((name, bound) -> keyValues.put(name, bound.cacheValue()));
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
                case "bizDate" -> YMD.format(BizDay.bizDate(now));
                case "bizYesterday" -> YMD.format(BizDay.bizDate(now).minusDays(1));
                case "baseHour" -> BizDay.BASE_HOUR;
                default -> throw new IllegalArgumentException("알 수 없는 시스템 변수입니다: " + name);
            };
            values.put(name, value);
        }
        return Collections.unmodifiableMap(values);
    }

    // ── 실행 ────────────────────────────────────────────────────────────

    /**
     * 검사(§7.1)를 마친 SQL 을 읽기 전용 연결에서 실행한다(늘 롤백). 이 아래층은 검사를 하지 않는다 — 검사를 거치지 않은 쓰기 문장이
     * 와도 읽기 전용 강제·롤백이 DB 를 바꾸지 못하게 막는다(시험이 이 메서드로 직접 넣어 본다). SQL 오류는 런타임 예외로 감싼다.
     */
    WidgetQueryResult execute(String sql, Map<String, Object> values, int maxRows) {
        return execute(sql, values, Map.of(), maxRows);
    }

    /**
     * 사용자 입력 조건(userBinds)은 형(number=NUMERIC, 그 밖=VARCHAR)을 붙여 바인드 변수로만 넣는다 — null 에도 형이 붙어 PostgreSQL·H2 가 받는다.
     * 값은 {@link QueryParams} 가 만든 스칼라(BigDecimal·String·null)와 multi 의 불변 글자 목록뿐이다. 목록은 SqlGuard 가 {@code IN (:x)} 자리로
     * 제한했고 비어 있지 않으며(빈 선택은 {@code [null]}), 원소마다 같은 sqlType 이 붙어 펼쳐진다.
     */
    WidgetQueryResult execute(String sql, Map<String, Object> values, Map<String, QueryParams.Bound> userBinds, int maxRows) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        // 값이 null(부서 없음)이어도 형을 알려 줘야 PostgreSQL·H2 가 받는다.
        values.forEach((name, value) -> params.addValue(name, value,
                "now".equals(name) ? Types.TIMESTAMP : "baseHour".equals(name) ? Types.NUMERIC : Types.VARCHAR));
        userBinds.forEach((name, bound) -> params.addValue(name, bound.value(), bound.sqlType()));
        try {
            return readOnlyJdbc.execute(con -> jdbc.queryLimited(con, sql, params, maxRows + 1, rs -> extract(rs, maxRows)));
        } catch (SQLException e) {
            throw new UncategorizedSQLException("widgetQuery", sql, e);
        }
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

    /**
     * 실행·미리보기·저장 검사가 함께 쓰는 판정(§7.1 + 실패 닫힘). 순서:
     * <ol>
     *   <li>어느 DB 에나 적용하는 검사({@link #guard}) — 사전 검사(한 문장 SELECT·WITH·금지 낱말·알려진 변수)와
     *       사후 검사(Spring 이 이름 붙은 변수를 바꾼 뒤 남은 DB 고유 자리표시자)를 함께 한다. 여기서 걸리면 연결을 빌리지 않는다.</li>
     *   <li>실행 DB 갈래 판정(처음 한 번 연결을 빌려 메타데이터만 읽는다). 읽기 전용 트랜잭션을 걸 수 없는 갈래(OTHER — Oracle 이
     *       아닌 DB)인데 전용 DataSource 가 없으면 거절한다 — 그 DB 고유의 세션·흐름 문장을 낱말 목록이 다 막는다고 기대할 수 없고,
     *       앱 기본 DataSource 는 쓰기 계정이다. {@code require-dedicated} 가 켜져 있으면 갈래와 상관없이 전용 DataSource 를 요구한다.</li>
     * </ol>
     * 거절은 {@code BusinessException} 이고 미리보기·실행의 DB 오류 감싸기(쿼리 오류·고정 문구) 밖에서 던진다 — 설정 안내가 그대로 보인다.
     */
    private SqlGuard.Validated validate(String sql, Set<String> declaredNames, Set<String> listNames) {
        SqlGuard.Validated validated = guard(sql, declaredNames, listNames);
        requireRunnableDialect();
        return validated;
    }

    /** 어느 DB 에나 적용하는 검사 단계(§7.1) — 연결을 빌리지 않는다. {@link #run} 은 이 단계를 정의 오류로 분류한다. */
    private static SqlGuard.Validated guard(String sql, Set<String> declaredNames, Set<String> listNames) {
        SqlGuard.Validated validated = SqlGuard.checkDeclared(sql, declaredNames, listNames);
        // 사후 검사 — Spring 이 이름 붙은 변수를 ? 로 바꾼 SQL 에 DB 가 따로 읽을 자리표시자가 남지 않았는지.
        SqlGuard.requireNoLeftoverPlaceholders(NamedParameterUtils.substituteNamedParameters(
                NamedParameterUtils.parseSqlStatement(validated.sql()), new MapSqlParameterSource()));
        return validated;
    }

    private void requireRunnableDialect() {
        WidgetReadOnlyJdbc.Dialect dialect;
        try {
            dialect = readOnlyJdbc.resolveDialect();
        } catch (SQLException | RuntimeException e) {
            log.warn("위젯 쿼리 DB 갈래 판정 실패 원인={}", rootMessage(e));
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_DB_UNAVAILABLE);
        }
        if (!dedicated && requireDedicated) {
            // 정책 B(oracle-1007 c3) — Oracle 의 읽기 전용 트랜잭션은 기존 자율 트랜잭션 함수·DB 링크를 막지 못한다. 계정 권한이 근본 방어다.
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_REQUIRE_DEDICATED);
        }
        if (!dedicated && !WidgetReadOnlyJdbc.enforcesReadOnly(dialect)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_OTHER_NEEDS_DEDICATED);
        }
    }

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

    /**
     * {@link NamedParameterJdbcTemplate} 의 이름 붙은 변수 처리로 문장을 만들되, <b>넘겨받은 연결</b>(읽기 전용으로 건 연결)에서
     * 실행한다 — JdbcTemplate 이 DataSource 에서 연결을 다시 얻으면 스레드에 묶인 업무 트랜잭션 연결을 집을 수 있다.
     * 행 상한·시간 제한·가져오기 크기를 건다(§7.3).
     */
    static final class LimitedJdbcTemplate extends NamedParameterJdbcTemplate {

        LimitedJdbcTemplate(DataSource dataSource) {
            super(dataSource); // 연결은 쓰지 않는다 — 이름 붙은 변수 해석만 빌린다
        }

        <T> T queryLimited(Connection con, String sql, SqlParameterSource params, int fetchRows,
                           ResultSetExtractor<T> extractor) throws SQLException {
            PreparedStatementCreator named = getPreparedStatementCreator(sql, params);
            try (PreparedStatement ps = named.createPreparedStatement(con)) {
                ps.setMaxRows(fetchRows);
                ps.setQueryTimeout(QUERY_TIMEOUT_SEC);
                // 가져오기 크기가 행 상한보다 크면 거절하는 드라이버가 있다(H2 등 — 미리보기 50+1행).
                ps.setFetchSize(Math.min(FETCH_SIZE, fetchRows));
                try (ResultSet rs = ps.executeQuery()) {
                    return extractor.extractData(rs);
                }
            }
        }
    }
}
