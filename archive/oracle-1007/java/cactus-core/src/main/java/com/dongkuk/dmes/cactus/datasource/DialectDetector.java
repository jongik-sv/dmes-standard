package com.dongkuk.dmes.cactus.datasource;

/**
 * JDBC URL 또는 driver class name 으로부터 cactus dialect 추정.
 * 미결 #6/#7 결정 반영: 명시값({@code cactus.oasis.dialect}) 우선.
 *
 * <p>반환값:
 * <ul>
 *   <li>{@code "mssql"} — jdbc:sqlserver / jdbc:jtds:sqlserver / mssql-jdbc 드라이버</li>
 *   <li>{@code "sqlite"} — jdbc:sqlite / org.sqlite.JDBC</li>
 *   <li>{@code "none"} — 그 외 또는 null (oracle 포함, 미결 #5 결정으로 미지원)</li>
 * </ul>
 */
public final class DialectDetector {

    private DialectDetector() {}

    public static String detect(String jdbcUrl, String driverClassName) {
        String url = jdbcUrl == null ? "" : jdbcUrl.toLowerCase();
        String driver = driverClassName == null ? "" : driverClassName.toLowerCase();

        if (url.startsWith("jdbc:sqlserver:")
                || url.startsWith("jdbc:jtds:sqlserver:")
                || driver.contains("sqlserver")
                || driver.contains("jtds")) {
            return "mssql";
        }
        if (url.startsWith("jdbc:sqlite:") || driver.contains("sqlite")) {
            return "sqlite";
        }
        return "none";
    }
}
