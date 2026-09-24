package com.dongkuk.dmes.mdm;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.testcontainers.mssqlserver.MSSQLServerContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * mssqlTest 공용 MSSQL 접속점. 테스트 클래스마다 컨테이너를 띄우지 않고 서버 하나를 같이 쓴다
 * (2026-09-24 사용자 결정: 같은 목적의 도커는 한 곳에 모아 쓴다).
 *
 * <ul>
 *   <li>환경변수 {@code MSSQL_JDBC_URL} 이 있으면 그 서버에 붙고 컨테이너를 띄우지 않는다. 계정은
 *       {@code MSSQL_USER}(기본 sa)·{@code MSSQL_PASSWORD} 다. URL 은 databaseName 없이 서버까지만 준다
 *       (예 {@code jdbc:sqlserver://localhost:1433;encrypt=false}).</li>
 *   <li>없으면 재사용 컨테이너 하나를 띄운다({@code withReuse(true)}). {@code ~/.testcontainers.properties} 에
 *       {@code testcontainers.reuse.enable=true} 가 있으면 실행이 끝나도 컨테이너가 남아 다음 실행이 다시 쓴다.
 *       없으면 한 번의 Gradle 실행(JVM) 안에서만 공유된다.</li>
 * </ul>
 *
 * <p>서버를 재사용하므로 앞선 실행의 DB 가 남아 있을 수 있다. 고정 이름(mdm)을 쓰면 Flyway 가 이미 적용된
 * 스키마를 만나 기대값이 깨지므로, 테스트는 {@link #newDatabase(String)} 로 실행마다 새 DB 를 받는다.
 * 6시간이 지난 {@code mdmt_} DB 는 첫 접속 때 지운다.
 */
public final class MdmMssqlServer {

    private static final String IMAGE = "mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04";
    private static final String PREFIX = "mdmt_";

    private static String serverUrl;
    private static String user;
    private static String password;

    private MdmMssqlServer() {
    }

    private static synchronized void init() {
        if (serverUrl != null) {
            return;
        }
        String external = System.getenv("MSSQL_JDBC_URL");
        if (external != null && !external.isBlank()) {
            serverUrl = external;
            user = System.getenv().getOrDefault("MSSQL_USER", "sa");
            password = System.getenv("MSSQL_PASSWORD");
        } else {
            MSSQLServerContainer container = new MSSQLServerContainer(DockerImageName.parse(IMAGE))
                    .acceptLicense()
                    .withReuse(true);
            container.start();
            serverUrl = container.getJdbcUrl();
            user = container.getUsername();
            password = container.getPassword();
        }
        dropStaleDatabases();
    }

    /** master 접속 URL(databaseName 없음). */
    public static String serverUrl() {
        init();
        return serverUrl;
    }

    public static String user() {
        init();
        return user;
    }

    public static String password() {
        init();
        return password;
    }

    /**
     * 이름이 {@code mdmt_<label>_<임의 8자>} 인 새 DB 를 만들고 그 DB 의 JDBC URL 을 돌려준다.
     *
     * @param label 영문 소문자·숫자·밑줄만 쓴다(DB 이름에 그대로 들어간다)
     */
    public static String newDatabase(String label) {
        init();
        String name = PREFIX + label + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        try (Connection master = DriverManager.getConnection(serverUrl, user, password);
             Statement s = master.createStatement()) {
            s.execute("CREATE DATABASE " + name);
        } catch (SQLException e) {
            throw new IllegalStateException("MSSQL 테스트 DB 생성 실패: " + name, e);
        }
        return serverUrl + ";databaseName=" + name;
    }

    private static void dropStaleDatabases() {
        try (Connection master = DriverManager.getConnection(serverUrl, user, password);
             Statement s = master.createStatement()) {
            List<String> stale = new ArrayList<>();
            try (ResultSet rs = s.executeQuery("SELECT name FROM sys.databases WHERE name LIKE 'mdmt[_]%'"
                    + " AND create_date < DATEADD(HOUR, -6, GETDATE())")) {
                while (rs.next()) {
                    stale.add(rs.getString(1));
                }
            }
            for (String name : stale) {
                s.execute("ALTER DATABASE [" + name + "] SET SINGLE_USER WITH ROLLBACK IMMEDIATE");
                s.execute("DROP DATABASE [" + name + "]");
            }
        } catch (SQLException e) {
            // 정리는 부수 작업이다. 실패해도 테스트는 새 DB 이름으로 진행한다.
            System.err.println("[MdmMssqlServer] 오래된 테스트 DB 정리 실패: " + e.getMessage());
        }
    }
}
