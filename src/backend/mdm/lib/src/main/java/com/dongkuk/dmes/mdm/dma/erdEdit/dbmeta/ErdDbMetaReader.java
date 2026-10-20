package com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Component;

/**
 * ERD 가져오기용 딕셔너리 메타 조회(스펙 2.1-4). ALL_* 뷰만 읽고 행 데이터는 읽지 않는다. 다른 스키마는 로컬의 SELECT ANY TABLE 로 보인다.
 *
 * <p>같은 이름의 표·제약·인덱스가 여러 스키마에 있을 수 있으므로 모든 조인을 OWNER 로 묶는다
 * (Review Focus 2). analog DB 뷰어 템플릿(maxRows·허용 스키마·10초 제한)은 쓰지 않는다. 쿼리는 네 번이다(표·컬럼·제약·인덱스).
 */
@Component
public class ErdDbMetaReader {

    private static final Pattern OWNER = Pattern.compile("^[A-Z][A-Z0-9_$#]{0,127}$");
    private static final int FETCH_SIZE = 500;

    static final String TABLES_SQL = """
            SELECT T.TABLE_NAME
                 , C.COMMENTS
              FROM ALL_TABLES T
                 , ALL_TAB_COMMENTS C
             WHERE T.OWNER = ?
               AND T.DROPPED = 'NO'
               AND T.NESTED = 'NO'
               AND T.SECONDARY = 'N'
               AND (T.IOT_TYPE IS NULL OR T.IOT_TYPE = 'IOT')
               AND T.TABLE_NAME NOT LIKE 'BIN$%'
               AND UPPER(T.TABLE_NAME) <> 'FLYWAY_SCHEMA_HISTORY'
               AND C.OWNER(+) = T.OWNER
               AND C.TABLE_NAME(+) = T.TABLE_NAME
             ORDER BY T.TABLE_NAME
            """;

    /** 보이지 않는 컬럼(COLUMN_ID null)의 자리 시작값. Oracle 표의 컬럼 상한(1000)보다 커서 보이는 컬럼 뒤에 온다(deferred 51). */
    static final int INVISIBLE_POSITION_BASE = 10_000;

    /** 뷰의 컬럼도 나오지만 표 목록에 없는 행은 자바에서 버린다. */
    static final String COLUMNS_SQL = """
            SELECT C.TABLE_NAME
                 , C.COLUMN_NAME
                 , C.COLUMN_ID
                 , C.DATA_TYPE
                 , C.DATA_LENGTH
                 , C.CHAR_LENGTH
                 , C.CHAR_USED
                 , C.DATA_PRECISION
                 , C.DATA_SCALE
                 , C.NULLABLE
                 , C.IDENTITY_COLUMN
                 , C.DATA_DEFAULT_VC
                 , M.COMMENTS
              FROM ALL_TAB_COLUMNS C
                 , ALL_COL_COMMENTS M
             WHERE C.OWNER = ?
               AND M.OWNER(+) = C.OWNER
               AND M.TABLE_NAME(+) = C.TABLE_NAME
               AND M.COLUMN_NAME(+) = C.COLUMN_NAME
             ORDER BY C.TABLE_NAME, C.COLUMN_ID NULLS LAST, C.COLUMN_NAME
            """;

    /** 부모가 다른 스키마인 FK 는 읽지 않는다(모듈 사이 FK 없음, ADR-0003). R 의 부모 컬럼은 같은 POSITION 으로 짝짓는다. */
    static final String CONSTRAINTS_SQL = """
            SELECT K.TABLE_NAME
                 , K.CONSTRAINT_NAME
                 , K.CONSTRAINT_TYPE
                 , CC.COLUMN_NAME
                 , CC.POSITION
                 , R.TABLE_NAME AS REF_TABLE
                 , RC.COLUMN_NAME AS REF_COLUMN
              FROM ALL_CONSTRAINTS K
                 , ALL_CONS_COLUMNS CC
                 , ALL_CONSTRAINTS R
                 , ALL_CONS_COLUMNS RC
             WHERE K.OWNER = ?
               AND K.CONSTRAINT_TYPE IN ('P', 'U', 'R')
               AND (K.CONSTRAINT_TYPE <> 'R' OR K.R_OWNER = K.OWNER)
               AND CC.OWNER = K.OWNER
               AND CC.TABLE_NAME = K.TABLE_NAME
               AND CC.CONSTRAINT_NAME = K.CONSTRAINT_NAME
               AND R.OWNER(+) = K.R_OWNER
               AND R.CONSTRAINT_NAME(+) = K.R_CONSTRAINT_NAME
               AND RC.OWNER(+) = R.OWNER
               AND RC.CONSTRAINT_NAME(+) = R.CONSTRAINT_NAME
               AND RC.POSITION(+) = CC.POSITION
             ORDER BY K.TABLE_NAME, K.CONSTRAINT_NAME, CC.POSITION
            """;

    /** 함수 기반·LOB·도메인 인덱스와 PK·UK 를 받치는 인덱스는 뺀다. */
    static final String INDEXES_SQL = """
            SELECT I.TABLE_NAME
                 , I.INDEX_NAME
                 , I.UNIQUENESS
                 , IC.COLUMN_NAME
                 , IC.COLUMN_POSITION
              FROM ALL_INDEXES I
                 , ALL_IND_COLUMNS IC
             WHERE I.TABLE_OWNER = ?
               AND I.OWNER = I.TABLE_OWNER
               AND I.INDEX_TYPE IN ('NORMAL', 'NORMAL/REV', 'BITMAP')
               AND IC.INDEX_OWNER = I.OWNER
               AND IC.INDEX_NAME = I.INDEX_NAME
               AND IC.TABLE_OWNER = I.TABLE_OWNER
               AND IC.TABLE_NAME = I.TABLE_NAME
               AND NOT EXISTS (SELECT 1
                                 FROM ALL_CONSTRAINTS K
                                WHERE K.OWNER = I.TABLE_OWNER
                                  AND K.TABLE_NAME = I.TABLE_NAME
                                  AND K.INDEX_OWNER = I.OWNER
                                  AND K.INDEX_NAME = I.INDEX_NAME
                                  AND K.CONSTRAINT_TYPE IN ('P', 'U'))
             ORDER BY I.TABLE_NAME, I.INDEX_NAME, IC.COLUMN_POSITION
            """;

    private final JdbcTemplate jdbc;

    public ErdDbMetaReader(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ErdDbMeta read(String owner) {
        String o = owner == null ? "" : owner.trim().toUpperCase(Locale.ROOT);
        if (!OWNER.matcher(o).matches()) throw new IllegalArgumentException("스키마 이름이 올바르지 않습니다: " + owner);

        Map<String, String> comments = new LinkedHashMap<>();
        query(TABLES_SQL, o, rs -> {
            String name = rs.getString("TABLE_NAME");
            // 같은 표가 두 번 나오면 주석 조인이 OWNER 로 묶이지 않은 것이다. 마지막 행이 이기게 두면 섞임을 숨긴다.
            if (comments.containsKey(name)) {
                throw new IllegalStateException("표 " + name + " 가 두 번 나왔다 — 딕셔너리 조인이 OWNER 로 묶이지 않았다");
            }
            comments.put(name, rs.getString("COMMENTS"));
        });

        Map<String, List<ErdDbMeta.Column>> columns = new LinkedHashMap<>();
        comments.keySet().forEach(t -> columns.put(t, new ArrayList<>()));
        query(COLUMNS_SQL, o, rs -> {
            List<ErdDbMeta.Column> list = columns.get(rs.getString("TABLE_NAME"));
            if (list == null) return; // 뺀 표 또는 뷰
            String type = rs.getString("DATA_TYPE");
            String def = "YES".equals(rs.getString("IDENTITY_COLUMN")) ? null : trimToNull(rs.getString("DATA_DEFAULT_VC"));
            Integer columnId = intOrNull(rs, "COLUMN_ID");
            int position = columnId != null ? columnId : INVISIBLE_POSITION_BASE + list.size();
            list.add(new ErdDbMeta.Column(rs.getString("COLUMN_NAME"), position, type,
                    length(type, rs.getString("CHAR_USED"), rs.getInt("DATA_LENGTH"), rs.getInt("CHAR_LENGTH")),
                    intOrNull(rs, "DATA_PRECISION"), intOrNull(rs, "DATA_SCALE"),
                    "Y".equals(rs.getString("NULLABLE")), def, rs.getString("COMMENTS")));
        });
        List<ErdDbMeta.Table> tables = new ArrayList<>();
        comments.forEach((name, comment) -> tables.add(new ErdDbMeta.Table(name, comment, columns.get(name))));

        // computeIfAbsent 람다 안에서는 SQLException 을 던질 수 없으므로 값을 먼저 읽는다.
        Map<String, ConstraintAcc> cons = new LinkedHashMap<>();
        query(CONSTRAINTS_SQL, o, rs -> {
            String table = rs.getString("TABLE_NAME");
            if (!comments.containsKey(table)) return; // flyway 이력 표 PK 등
            String name = rs.getString("CONSTRAINT_NAME");
            String type = rs.getString("CONSTRAINT_TYPE");
            String refTable = rs.getString("REF_TABLE");
            ConstraintAcc a = cons.computeIfAbsent(name, n -> new ConstraintAcc(n, table, type, refTable));
            a.columns.add(rs.getString("COLUMN_NAME"));
            String ref = rs.getString("REF_COLUMN");
            if (ref != null) a.refColumns.add(ref);
        });
        List<ErdDbMeta.Constraint> constraints = new ArrayList<>();
        for (ConstraintAcc a : cons.values()) {
            if ("R".equals(a.type) && !comments.containsKey(a.refTable)) continue; // 부모 표를 뺐다
            constraints.add(new ErdDbMeta.Constraint(a.name, a.table, a.type, a.columns,
                    "R".equals(a.type) ? a.refTable : null, "R".equals(a.type) ? a.refColumns : List.of()));
        }

        Map<String, IndexAcc> idx = new LinkedHashMap<>();
        query(INDEXES_SQL, o, rs -> {
            String table = rs.getString("TABLE_NAME");
            if (!comments.containsKey(table)) return;
            String name = rs.getString("INDEX_NAME");
            boolean unique = "UNIQUE".equals(rs.getString("UNIQUENESS"));
            idx.computeIfAbsent(name, n -> new IndexAcc(n, table, unique)).columns.add(rs.getString("COLUMN_NAME"));
        });
        List<ErdDbMeta.Index> indexes = idx.values().stream()
                .map(a -> new ErdDbMeta.Index(a.name, a.table, a.unique, a.columns)).toList();

        return new ErdDbMeta(o, tables, constraints, indexes);
    }

    /** 공유 JdbcTemplate 의 설정을 바꾸지 않고 문장마다 fetch 크기만 키운다(컬럼 수백 행). */
    private void query(String sql, String owner, RowCallbackHandler handler) {
        PreparedStatementCreator psc = con -> {
            PreparedStatement ps = con.prepareStatement(sql);
            ps.setFetchSize(FETCH_SIZE);
            ps.setString(1, owner);
            return ps;
        };
        jdbc.query(psc, handler);
    }

    static Integer length(String type, String charUsed, int dataLength, int charLength) {
        if ("C".equals(charUsed)) return charLength;
        if ("B".equals(charUsed) || "RAW".equals(type)) return dataLength;
        return null;
    }

    private static Integer intOrNull(ResultSet rs, String col) throws SQLException {
        int v = rs.getInt(col);
        return rs.wasNull() ? null : v;
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static final class ConstraintAcc {
        final String name;
        final String table;
        final String type;
        final String refTable;
        final List<String> columns = new ArrayList<>();
        final List<String> refColumns = new ArrayList<>();

        ConstraintAcc(String name, String table, String type, String refTable) {
            this.name = name;
            this.table = table;
            this.type = type;
            this.refTable = refTable;
        }
    }

    private static final class IndexAcc {
        final String name;
        final String table;
        final boolean unique;
        final List<String> columns = new ArrayList<>();

        IndexAcc(String name, String table, boolean unique) {
            this.name = name;
            this.table = table;
            this.unique = unique;
        }
    }
}
