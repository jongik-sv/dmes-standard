package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * TSK-07-01 design.md §3.3′-A — 두 V7 DDL 파일을 DB 에 적용하지 않고 클래스패스 리소스 텍스트로 읽어
 * 파싱·대조한다(도커·SQLite 커넥션 모두 불필요, 순수 문자열 처리, {@code testAll} 에 포함).
 *
 * <p>파싱은 괄호 깊이를 추적해 {@code VARCHAR(50)}·{@code CHECK (...)} 같은 중첩 괄호를 안전하게
 * 건너뛴다. 각 테이블 본문 항목에서 {@code CONSTRAINT (\w+)}를 위치와 무관하게 찾아(SQLite {@code
 * RECV_ID INTEGER CONSTRAINT PK_... PRIMARY KEY AUTOINCREMENT}처럼 칼럼 선언 안에 인라인으로 PK 가
 * 붙는 경우까지 잡기 위해서다) {@code PK_}·{@code FK_}·{@code CK_}·{@code UX_} 접두만 제약 이름
 * 집합에 넣고, MSSQL 전용 인라인 기본값 이름({@code DF_...})은 뺀다(Build 이탈 — advisor 재검토로
 * 발견, design.md 원안의 "CONSTRAINT (\w+)로 시작하면"만으로는 SQLite RECV 인라인 PK 를 놓친다).
 */
class MdmMasterDataDdlParityTest {

    private static final Pattern CREATE_TABLE = Pattern.compile("CREATE TABLE (\\w+)\\s*\\(");
    private static final Pattern CREATE_INDEX =
            Pattern.compile("CREATE (UNIQUE )?INDEX (\\w+) ON (\\w+)");
    private static final Pattern CONSTRAINT_NAME = Pattern.compile("CONSTRAINT\\s+(\\w+)");
    private static final Set<String> CONSTRAINT_PREFIXES = Set.of("PK_", "FK_", "CK_", "UX_");

    private record TableDdl(String name, List<String> columns, Set<String> constraints) {
    }

    private record IndexEntry(String name, String table) {
    }

    private record DdlFile(List<String> tableOrder, Map<String, TableDdl> tables, Set<IndexEntry> indexes) {
    }

    @Test
    void 두_방언_V7_DDL_이_테이블_칼럼_제약_인덱스_이름에서_정확히_대응한다() {
        DdlFile sqlite = parse(readClasspath("db/migration/mdm/sqlite/V7__create_mdm_master_data.sql"));
        DdlFile mssql = parse(readClasspath("db/migration/mdm/mssql/V7__create_mdm_master_data.sql"));

        assertEquals(sqlite.tableOrder(), mssql.tableOrder(), "테이블 이름 순서 있는 목록");
        assertEquals(MdmMasterDataExpectations.TABLES, sqlite.tableOrder(), "SQLite 테이블 순서가 기대값과 다르다");

        for (String table : sqlite.tableOrder()) {
            TableDdl s = sqlite.tables().get(table);
            TableDdl m = mssql.tables().get(table);
            assertEquals(s.columns(), m.columns(), table + " 칼럼 이름 순서 있는 목록");
            assertEquals(s.constraints(), m.constraints(), table + " 제약 이름 집합");
        }

        assertEquals(sqlite.indexes(), mssql.indexes(), "인덱스 이름·대상 테이블 집합");

        // F13 직접 증거 — CATE_ITEM 의 제약 이름 집합에 CATE_ID·CODE 를 참조하는 FK 가 없다(두 방언 모두).
        Set<String> cateItemConstraints = sqlite.tables().get("TB_MDM_DATA_CATE_ITEM").constraints();
        assertEquals(Set.of("PK_TB_MDM_DATA_CATE_ITEM", "FK_TB_MDM_DATA_CATE_ITEM_DATA"), cateItemConstraints,
                "TB_MDM_DATA_CATE_ITEM 은 MARU_DATA_ID FK 하나만 가져야 한다(F13)");
    }

    @Test
    void 공허_통과_방지_두_방언_파일이_실제로_읽혔다() {
        DdlFile sqlite = parse(readClasspath("db/migration/mdm/sqlite/V7__create_mdm_master_data.sql"));
        DdlFile mssql = parse(readClasspath("db/migration/mdm/mssql/V7__create_mdm_master_data.sql"));
        assertFalse(sqlite.tableOrder().isEmpty());
        assertFalse(mssql.tableOrder().isEmpty());
        assertEquals(7, sqlite.tableOrder().size());
    }

    private static String readClasspath(String path) {
        try (InputStream in = MdmMasterDataDdlParityTest.class.getClassLoader().getResourceAsStream(path)) {
            assertTrue(in != null, path + " 을 클래스패스에서 찾지 못했다");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static DdlFile parse(String sqlText) {
        String noComments = sqlText.lines()
                .map(line -> {
                    int idx = line.indexOf("--");
                    return idx >= 0 ? line.substring(0, idx) : line;
                })
                .reduce((a, b) -> a + "\n" + b).orElse("");

        List<String> tableOrder = new ArrayList<>();
        Map<String, TableDdl> tables = new LinkedHashMap<>();
        Matcher tableMatcher = CREATE_TABLE.matcher(noComments);
        while (tableMatcher.find()) {
            String tableName = tableMatcher.group(1);
            int bodyStart = tableMatcher.end(); // 여는 '(' 바로 다음
            int depth = 1;
            int i = bodyStart;
            boolean inQuote = false;
            while (i < noComments.length() && depth > 0) {
                char ch = noComments.charAt(i);
                if (ch == '\'') {
                    inQuote = !inQuote;
                } else if (!inQuote && ch == '(') {
                    depth++;
                } else if (!inQuote && ch == ')') {
                    depth--;
                }
                i++;
            }
            String body = noComments.substring(bodyStart, i - 1);
            tableOrder.add(tableName);
            tables.put(tableName, parseTableBody(tableName, body));
        }

        Set<IndexEntry> indexes = new LinkedHashSet<>();
        Matcher indexMatcher = CREATE_INDEX.matcher(noComments);
        while (indexMatcher.find()) {
            indexes.add(new IndexEntry(indexMatcher.group(2), indexMatcher.group(3)));
        }

        return new DdlFile(tableOrder, tables, indexes);
    }

    private static TableDdl parseTableBody(String tableName, String body) {
        List<String> items = splitTopLevel(body);
        List<String> columns = new ArrayList<>();
        Set<String> constraints = new LinkedHashSet<>();

        for (String item : items) {
            String trimmed = item.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            String firstToken = trimmed.split("\\s+", 2)[0];
            if (!firstToken.equalsIgnoreCase("CONSTRAINT")) {
                columns.add(normalizeIdentifier(firstToken));
            }
            Matcher cm = CONSTRAINT_NAME.matcher(trimmed);
            while (cm.find()) {
                String name = cm.group(1);
                if (CONSTRAINT_PREFIXES.stream().anyMatch(name::startsWith)) {
                    constraints.add(name);
                }
            }
        }
        return new TableDdl(tableName, columns, constraints);
    }

    /**
     * 괄호 깊이 0 인 콤마로만 분리한다(중첩 괄호 안전, design.md §3.3′-A 파싱 절차 2). 작은따옴표
     * 문자열 리터럴 안의 콤마·괄호는 깊이 계산에서 뺀다(예: {@code '^[0-9A-Z]{1,20}$'} 의 콤마가
     * 항목을 잘못 쪼개는 것을 막는다 — Build 이탈, advisor 재검토로 발견).
     */
    private static List<String> splitTopLevel(String body) {
        List<String> items = new ArrayList<>();
        int depth = 0;
        int start = 0;
        boolean inQuote = false;
        for (int i = 0; i < body.length(); i++) {
            char ch = body.charAt(i);
            if (ch == '\'') {
                inQuote = !inQuote;
            } else if (!inQuote && ch == '(') {
                depth++;
            } else if (!inQuote && ch == ')') {
                depth--;
            } else if (!inQuote && ch == ',' && depth == 0) {
                items.add(body.substring(start, i));
                start = i + 1;
            }
        }
        items.add(body.substring(start));
        return items;
    }

    /** 예약어 인용(`"RESULT"`/`[RESULT]`/`` `X` ``)의 따옴표·대괄호·백틱을 벗겨 이름을 정규화한다. */
    private static String normalizeIdentifier(String token) {
        String t = token.trim();
        if (t.startsWith("\"") && t.endsWith("\"")) {
            return t.substring(1, t.length() - 1);
        }
        if (t.startsWith("[") && t.endsWith("]")) {
            return t.substring(1, t.length() - 1);
        }
        if (t.startsWith("`") && t.endsWith("`")) {
            return t.substring(1, t.length() - 1);
        }
        return t;
    }
}
