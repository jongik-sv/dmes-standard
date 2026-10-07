package utils;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.util.StreamUtils;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;

/**
 * 시험용 Oracle 접속 도우미. 임베디드 H2 를 대신한다.
 *
 * <p>접속값은 시스템 속성에서 읽는다.
 * <ul>
 *   <li>{@code dmes.ora.url} (필수)</li>
 *   <li>{@code dmes.ora.user} (기본 APSAPUSER)</li>
 *   <li>{@code dmes.ora.password} (기본 dmes_password_123)</li>
 * </ul>
 *
 * <p>스크립트에 나온 표 이름(create table ...)만 지우고 다시 만든다. 접속한 사용자의 다른 표는 건드리지 않는다.
 */
public final class OracleTestDatabase {
    private static final String URL_PROPERTY = "dmes.ora.url";
    private static final String USER_PROPERTY = "dmes.ora.user";
    private static final String PASSWORD_PROPERTY = "dmes.ora.password";
    private static final String DEFAULT_USER = "APSAPUSER";
    private static final String DEFAULT_PASSWORD = "dmes_password_123";
    private static final Pattern CREATE_TABLE = Pattern.compile("(?i)create\\s+table\\s+(\"?\\w+\"?)");

    private OracleTestDatabase() {
    }

    /**
     * 스크립트의 표를 지우고 스크립트를 실행한 뒤, 새 연결을 돌려 주는 DataSource 를 반환한다.
     *
     * @param classpathScripts 클래스패스 SQL 스크립트 경로
     * @return 시험 PDB 접속 DataSource
     */
    public static DataSource create(String... classpathScripts) {
        // 이전 시험이 남긴 연결의 미완료 트랜잭션(행 잠금)을 먼저 정리한다. 각 시험은 설정 단계에서 한 번만 create 를 부른다.
        closeOpenedConnections();
        DriverManagerDataSource dataSource = newDataSource();
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(true);
            Set<String> tableNames = new LinkedHashSet<>();
            for (String script : classpathScripts) {
                Resource resource = new ClassPathResource(script);
                tableNames.addAll(findTableNames(readScript(resource)));
            }
            for (String tableName : tableNames) {
                dropIfExists(connection, tableName);
            }
            for (String script : classpathScripts) {
                ScriptUtils.executeSqlScript(connection,
                        new EncodedResource(new ClassPathResource(script), StandardCharsets.UTF_8));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("시험 표 준비에 실패했다: " + e.getMessage(), e);
        }
        return dataSource;
    }

    /**
     * 시험이 끝났을 때 표를 치운다. 표가 없으면 무시한다.
     *
     * @param dataSource 시험 DataSource
     * @param tableNames 지울 표 이름
     */
    public static void dropTables(DataSource dataSource, String... tableNames) {
        // 시험이 쥔 연결의 미완료 트랜잭션이 행 잠금을 잡고 있으면 DROP 이 끝없이 기다리므로 먼저 되돌려 닫는다.
        closeOpenedConnections();
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(true);
            for (String tableName : tableNames) {
                dropIfExists(connection, tableName);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("시험 표 정리에 실패했다: " + e.getMessage(), e);
        }
    }

    /** 이 도우미의 DataSource 가 내준 연결. 시험 클래스가 끝날 때 {@link OracleConnectionCleaner} 가 닫는다. */
    private static final List<Connection> OPENED = new CopyOnWriteArrayList<>();

    /** 내준 연결을 모두 닫는다(Oracle 세션 누수 방지 — H2 의 shutdown() 이 하던 일). */
    static void closeOpenedConnections() {
        for (Connection connection : new ArrayList<>(OPENED)) {
            try {
                // Oracle 은 닫을 때 끝나지 않은 트랜잭션을 커밋하므로 먼저 되돌린다(시험이 남긴 행 잠금도 풀린다).
                if (!connection.isClosed() && !connection.getAutoCommit()) {
                    connection.rollback();
                }
                connection.close();
            } catch (SQLException ignored) {
                // 이미 닫힌 연결
            }
        }
        OPENED.clear();
    }

    private static DriverManagerDataSource newDataSource() {
        String url = System.getProperty(URL_PROPERTY);
        if (url == null || url.isBlank()) {
            throw new IllegalStateException(
                    "시험 PDB 접속값(dmes.ora.url)이 없다. -Pdmes.ora.test=clone 으로 실행한다");
        }
        DriverManagerDataSource dataSource = new DriverManagerDataSource() {
            @Override
            protected Connection getConnectionFromDriver(java.util.Properties props) throws SQLException {
                Connection connection = super.getConnectionFromDriver(props);
                OPENED.add(connection);
                return connection;
            }
        };
        dataSource.setDriverClassName("oracle.jdbc.OracleDriver");
        dataSource.setUrl(url);
        dataSource.setUsername(System.getProperty(USER_PROPERTY, DEFAULT_USER));
        dataSource.setPassword(System.getProperty(PASSWORD_PROPERTY, DEFAULT_PASSWORD));
        return dataSource;
    }

    private static String readScript(Resource resource) {
        try {
            return StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("SQL 스크립트를 읽지 못했다: " + resource, e);
        }
    }

    private static Set<String> findTableNames(String script) {
        Set<String> names = new LinkedHashSet<>();
        Matcher matcher = CREATE_TABLE.matcher(script);
        while (matcher.find()) {
            names.add(matcher.group(1));
        }
        return names;
    }

    /** 접속 사용자 스키마(user_tables)에 있는 표만 지운다. */
    private static void dropIfExists(Connection connection, String tableName) throws SQLException {
        try (Statement alter = connection.createStatement()) {
            // 다른 세션이 잠금을 쥐고 있어도 끝없이 기다리지 않고 ORA-00054 로 실패하게 한다.
            alter.execute("ALTER SESSION SET ddl_lock_timeout = 10");
        }
        boolean quoted = tableName.startsWith("\"") && tableName.endsWith("\"") && tableName.length() > 1;
        String dictionaryName = quoted
                ? tableName.substring(1, tableName.length() - 1)
                : tableName.toUpperCase(Locale.ROOT);
        String identifier = quoted ? tableName : dictionaryName;
        boolean exists;
        try (PreparedStatement query = connection.prepareStatement(
                "select count(*) from user_tables where table_name = ?")) {
            query.setString(1, dictionaryName);
            try (ResultSet resultSet = query.executeQuery()) {
                resultSet.next();
                exists = resultSet.getInt(1) > 0;
            }
        }
        if (exists) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("DROP TABLE " + identifier + " CASCADE CONSTRAINTS PURGE");
            }
        }
    }
}
