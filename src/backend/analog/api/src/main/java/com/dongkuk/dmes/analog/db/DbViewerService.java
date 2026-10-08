package com.dongkuk.dmes.analog.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * DB 뷰어 조회 서비스 (ADR-0002 D2·D3·D4).
 *
 * <p>테이블·컬럼 목록은 오라클 딕셔너리({@code ALL_TABLES}/{@code ALL_TAB_COLUMNS}/{@code ALL_CONSTRAINTS})에서 읽고,
 * 데이터 조회는 검증된 파싱 결과로 재조립한 SQL만 실행한다. 건별 감사로그를 남긴다.
 */
@Service
@ConditionalOnBean(JdbcTemplate.class)
public class DbViewerService {

    private static final Logger log = LoggerFactory.getLogger(DbViewerService.class);
    private static final Logger audit = LoggerFactory.getLogger("dbViewerAudit");

    /**
     * 컬럼 속성 + PK·FK 여부. FK_REF 는 참조 대상 {@code 스키마.테이블}(한 컬럼에 FK 가 여럿이면 하나만).
     * 참조 대상 제약을 볼 권한이 없으면 FK_YN 은 Y 이고 FK_REF 만 비어 있다.
     * 바인드 순서: 제약 조회(OWNER, TABLE_NAME) → 컬럼 조회(OWNER, TABLE_NAME).
     */
    private static final String COLUMNS_SQL = """
            WITH T_CONS AS
            (
                SELECT C.COLUMN_NAME
                     , MAX(DECODE(K.CONSTRAINT_TYPE, 'P', 'Y')) PK_YN
                     , MAX(DECODE(K.CONSTRAINT_TYPE, 'R', 'Y')) FK_YN
                     , MAX(DECODE(K.CONSTRAINT_TYPE, 'R', R.OWNER || '.' || R.TABLE_NAME)) FK_REF
                FROM   ALL_CONS_COLUMNS C
                     , ALL_CONSTRAINTS K
                     , ALL_CONSTRAINTS R
                WHERE  K.OWNER = C.OWNER
                AND    K.CONSTRAINT_NAME = C.CONSTRAINT_NAME
                AND    R.OWNER(+) = K.R_OWNER
                AND    R.CONSTRAINT_NAME(+) = K.R_CONSTRAINT_NAME
                AND    C.OWNER = ?
                AND    C.TABLE_NAME = ?
                AND    K.CONSTRAINT_TYPE IN ('P', 'R')
                GROUP BY C.COLUMN_NAME
            )
            SELECT A.COLUMN_NAME
                 , A.DATA_TYPE
                 , A.DATA_LENGTH
                 , A.NULLABLE
                 , NVL(B.PK_YN, 'N') PK_YN
                 , NVL(B.FK_YN, 'N') FK_YN
                 , B.FK_REF
            FROM   ALL_TAB_COLUMNS A
                 , T_CONS B
            WHERE  B.COLUMN_NAME(+) = A.COLUMN_NAME
            AND    A.OWNER = ?
            AND    A.TABLE_NAME = ?
            ORDER BY A.COLUMN_ID
            """;

    private final JdbcTemplate jdbcTemplate;
    private final DbViewerProperties properties;
    private final Set<String> allowedSchemas;

    public DbViewerService(JdbcTemplate dbViewerJdbcTemplate, DbViewerProperties properties) {
        this.jdbcTemplate = dbViewerJdbcTemplate;
        this.properties = properties;
        this.allowedSchemas = properties.getAllowedSchemas().stream()
                .map(DbViewerValidator::normalizeSchema)
                .collect(Collectors.toUnmodifiableSet());
    }

    public List<String> listTables(String schema) {
        DbViewerValidator.checkSchemaAllowed(schema, allowedSchemas);
        String owner = DbViewerValidator.normalizeSchema(schema);
        long start = System.currentTimeMillis();
        List<String> tables = jdbcTemplate.queryForList(
                "SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = ? ORDER BY TABLE_NAME", String.class, owner);
        audit.info("tables schema={} count={} ms={}", owner, tables.size(), System.currentTimeMillis() - start);
        return tables;
    }

    public List<Map<String, Object>> listColumns(String schema, String table) {
        DbViewerValidator.checkSchemaAllowed(schema, allowedSchemas);
        DbViewerValidator.checkIdentifier("테이블", table);
        String owner = DbViewerValidator.normalizeSchema(schema);
        String tableName = table.trim().toUpperCase(java.util.Locale.ROOT);
        long start = System.currentTimeMillis();
        List<Map<String, Object>> columns = jdbcTemplate.queryForList(COLUMNS_SQL,
                owner, tableName, owner, tableName);
        audit.info("columns {}.{} count={} ms={}", owner, tableName, columns.size(),
                System.currentTimeMillis() - start);
        return columns;
    }

    /** 자유 SQL 실행 — 파싱·재조립 후 실행한다. */
    public QueryResult query(String sql) {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(sql, allowedSchemas);
        List<String> effectiveColumns = parsed.columns();
        if (parsed.star()) {
            effectiveColumns = columnNames(parsed.schema(), parsed.table()).stream()
                    .filter(c -> !DbViewerValidator.isSensitiveColumn(c))
                    .toList();
            if (effectiveColumns.isEmpty()) {
                throw new DbViewerException(400, "테이블에 조회 가능한 컬럼이 없습니다: " + parsed.table());
            }
        }
        String finalSql = DbViewerValidator.buildSql(parsed, effectiveColumns, properties.getMaxRows());
        return execute(parsed, effectiveColumns, finalSql);
    }

    /** 구조화 조회 — 스키마·테이블·컬럼·건수 지정. */
    public QueryResult queryStructured(String schema, String table, List<String> columns, Integer limit) {
        DbViewerValidator.checkSchemaAllowed(schema, allowedSchemas);
        DbViewerValidator.checkIdentifier("테이블", table);
        String owner = DbViewerValidator.normalizeSchema(schema);
        String tableName = table.trim().toUpperCase(java.util.Locale.ROOT);
        List<String> effectiveColumns;
        if (columns == null || columns.isEmpty()) {
            effectiveColumns = columnNames(owner, tableName);
            if (effectiveColumns.isEmpty()) {
                throw new DbViewerException(400, "테이블에 조회 가능한 컬럼이 없습니다: " + tableName);
            }
        } else {
            effectiveColumns = columns.stream()
                    .map(c -> {
                        DbViewerValidator.checkIdentifier("컬럼", c);
                        return c.trim().toUpperCase(java.util.Locale.ROOT);
                    })
                    .toList();
        }
        int capped = Math.max(1, Math.min(
                limit == null || limit <= 0 ? properties.getMaxRows() : limit, properties.getMaxRows()));
        DbViewerValidator.ParsedQuery parsed =
                new DbViewerValidator.ParsedQuery(owner, tableName, false, effectiveColumns, null);
        String finalSql = DbViewerValidator.buildSql(parsed, effectiveColumns, capped);
        return execute(parsed, effectiveColumns, finalSql);
    }

    private List<String> columnNames(String schema, String table) {
        return jdbcTemplate.queryForList(
                "SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE OWNER = ? AND TABLE_NAME = ? ORDER BY COLUMN_ID",
                String.class, schema, table);
    }

    private QueryResult execute(DbViewerValidator.ParsedQuery parsed, List<String> columns, String finalSql) {
        long start = System.currentTimeMillis();
        // FETCH FIRST 상한과 별개로 드라이버·추출 단계에서도 상한을 강제한다
        // (SQL 텍스트 우회 시에도 JVM 적재 폭주 방지 — 방어 심화).
        final int hardCap = properties.getMaxRows();
        List<Map<String, Object>> rows = jdbcTemplate.query(finalSql, rs -> {
            List<Map<String, Object>> out = new java.util.ArrayList<>();
            int count = rs.getMetaData().getColumnCount();
            while (rs.next() && out.size() < hardCap) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (int i = 1; i <= count; i++) {
                    Object value = rs.getObject(i);
                    row.put(rs.getMetaData().getColumnLabel(i), value == null ? null : value.toString());
                }
                out.add(row);
            }
            return out;
        });
        long elapsed = System.currentTimeMillis() - start;
        audit.info("query {}.{} cols={} rows={} ms={} sql={}", parsed.schema(), parsed.table(),
                columns.size(), rows.size(), elapsed, finalSql);
        return new QueryResult(columns, rows, rows.size(), elapsed, finalSql);
    }

    /** 조회 결과. */
    public record QueryResult(List<String> columns, List<Map<String, Object>> rows, int rowCount,
                             long elapsedMs, String executedSql) {
    }
}
