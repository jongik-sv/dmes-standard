package com.dongkuk.dmes.cactus.datasource;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * cactus 보조 DataSource 프로퍼티. application.yml 의 {@code cactus.datasource.*} 바인딩.
 *
 * <pre>
 * cactus:
 *   datasource:
 *     primary-alias: biz                           # 옵션 β (1.0.21) — Spring Boot dataSource 빈을 'biz' alias
 *     extras:                                      # Map<name, DataSourceProps> — N개 보조 DS (1.0.21)
 *       cmn:
 *         url: jdbc:sqlserver://prod-cmn-db/...
 *         username: ...
 *         password: ...
 *         driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
 *         maximum-pool-size: 10
 *       if:
 *         url: jdbc:sqlserver://localhost:1433;databaseName=CARAVANUSER;...
 *         username: seraiuser
 *         password: ...
 *         driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
 *         maximum-pool-size: 5
 *
 *     secondary:                                   # @Deprecated (1.0.20). 1.0.22 에서 제거 — extras 로 이전
 *       url: jdbc:sqlserver://...
 *       driver-class-name: ...
 *       username: ...
 *       password: ...
 * </pre>
 *
 * <p>1.0.21-SNAPSHOT 변경 (옵션 β + δ):
 * <ul>
 *   <li>{@code primaryAlias} 신규 — Spring Boot 의 dataSource 빈을 cactus 안에서 부를 alias.
 *       {@code CactusMultiDataSourceAutoConfiguration} 이 alias 등록 (예: 'biz').
 *       cactus.tx.managers 의 data-source 가 이 값과 일치하면 Spring Boot dataSource 사용.</li>
 *   <li>{@code extras} 신규 — Map<name, DataSourceProps> N개 보조 DS.
 *       각 entry 마다 {@code cactusDataSource{Name}} 빈 등록 + yml key alias (Phase 0-D).</li>
 *   <li>{@code secondary} (기존) — Phase 2 에서 제거 예정. 1.0.22 까지 호환 유지.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "cactus.datasource")
public class CactusDataSourceProperties {

    /**
     * Spring Boot 의 dataSource 빈을 cactus 안에서 부를 alias 이름 (옵션 β, 1.0.21 신규).
     * 예: 'biz'. cactus.tx.managers.{name}.data-source 가 이 값과 일치하면 Spring Boot dataSource 사용.
     * null 이면 alias 등록 안 함.
     */
    private String primaryAlias;

    /**
     * Map<name, DataSourceProps> — N개 보조 DS (1.0.21 신규).
     * yml key 가 entry name + 빈 alias 로 등록 (Phase 0-D).
     * dmes 표준 컨벤션: cmn (공통) / if (인터페이스). 모듈별 추가 가능.
     */
    private Map<String, DataSourceProps> extras = new LinkedHashMap<>();

    /** @deprecated 1.0.21 부터 extras 로 이전. 1.0.22 에서 제거. */
    @Deprecated
    private final Secondary secondary = new Secondary();

    public String getPrimaryAlias() { return primaryAlias; }
    public void setPrimaryAlias(String primaryAlias) { this.primaryAlias = primaryAlias; }

    public Map<String, DataSourceProps> getExtras() { return extras; }
    public void setExtras(Map<String, DataSourceProps> extras) { this.extras = extras; }

    @Deprecated
    public Secondary getSecondary() { return secondary; }

    /**
     * 단일 보조 DS props (extras Map 의 value).
     *
     * <p>연결 경로 2종 (jndi-name 유무로 분기, 2026-07-07 JNDI 전환 설계):
     * <ul>
     *   <li>{@code jndi-name} 설정 시 — WildFly 등 외부 컨테이너 관리 DataSource 를 JNDI lookup.
     *       url/username/password/driver/pool 프로퍼티는 전부 무시(물리 접속은 컨테이너 소유).</li>
     *   <li>{@code jndi-name} 미설정 시 — 기존 HikariCP 직결 (url 필수).</li>
     * </ul>
     */
    public static class DataSourceProps {
        private String url;
        private String driverClassName;
        private String username;
        private String password;
        private Integer maximumPoolSize;
        private Boolean autoCommit;
        private Long connectionTimeout;
        private Long idleTimeout;
        private Long maxLifetime;
        private String poolName;
        /** WildFly 등 컨테이너 관리 DataSource 의 JNDI 이름 (예: java:/jdbc/mcm/dsCmn). 설정 시 JNDI lookup 경로. */
        private String jndiName;

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }

        public String getJndiName() { return jndiName; }
        public void setJndiName(String jndiName) { this.jndiName = jndiName; }

        public String getDriverClassName() { return driverClassName; }
        public void setDriverClassName(String driverClassName) { this.driverClassName = driverClassName; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }

        public Integer getMaximumPoolSize() { return maximumPoolSize; }
        public void setMaximumPoolSize(Integer maximumPoolSize) { this.maximumPoolSize = maximumPoolSize; }

        public Boolean getAutoCommit() { return autoCommit; }
        public void setAutoCommit(Boolean autoCommit) { this.autoCommit = autoCommit; }

        public Long getConnectionTimeout() { return connectionTimeout; }
        public void setConnectionTimeout(Long connectionTimeout) { this.connectionTimeout = connectionTimeout; }

        public Long getIdleTimeout() { return idleTimeout; }
        public void setIdleTimeout(Long idleTimeout) { this.idleTimeout = idleTimeout; }

        public Long getMaxLifetime() { return maxLifetime; }
        public void setMaxLifetime(Long maxLifetime) { this.maxLifetime = maxLifetime; }

        public String getPoolName() { return poolName; }
        public void setPoolName(String poolName) { this.poolName = poolName; }
    }

    /**
     * @deprecated 1.0.21 부터 {@link #extras} 로 이전. 1.0.22 에서 제거.
     */
    @Deprecated
    public static class Secondary {
        private String url;
        private String driverClassName;
        private String username;
        private String password;
        private int maximumPoolSize = 10;
        private boolean autoCommit = false;
        private String poolName = "cactus-secondary";

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }

        public String getDriverClassName() { return driverClassName; }
        public void setDriverClassName(String driverClassName) { this.driverClassName = driverClassName; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }

        public int getMaximumPoolSize() { return maximumPoolSize; }
        public void setMaximumPoolSize(int maximumPoolSize) { this.maximumPoolSize = maximumPoolSize; }

        public boolean isAutoCommit() { return autoCommit; }
        public void setAutoCommit(boolean autoCommit) { this.autoCommit = autoCommit; }

        public String getPoolName() { return poolName; }
        public void setPoolName(String poolName) { this.poolName = poolName; }
    }
}
