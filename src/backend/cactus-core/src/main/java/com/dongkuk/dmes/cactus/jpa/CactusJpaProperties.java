package com.dongkuk.dmes.cactus.jpa;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * cactus JPA 자동 설정 프로퍼티. application.yml 의 {@code cactus.jpa.*} 바인딩.
 *
 * <pre>
 * cactus:
 *   jpa:
 *     snake-naming:
 *       enabled: true                # 기본 true (미결 #1 결정사항, 2026-05-12)
 *     table-prefix: ""               # 물리 테이블 prefix (예: "tb_"). 기본 공백 — 영향 없음
 *     implicit-naming:
 *       enabled: false               # UK/Index 자동명명 활성 (기본 false — 호환성 유지)
 *       uk-prefix: "uk_"
 *       idx-prefix: "idx_"
 *     secondary:
 *       enabled: false               # 보조 EMF 활성 (cactus.datasource.secondary.url 필요)
 *       packages-to-scan:
 *         - com.example.legacy
 *       hibernate:
 *         dialect: org.hibernate.dialect.SQLServerDialect
 *         ddl-auto: none
 *         show-sql: false
 * </pre>
 */
@ConfigurationProperties(prefix = "cactus.jpa")
public class CactusJpaProperties {

    private final SnakeNaming snakeNaming = new SnakeNaming();
    private final ImplicitNaming implicitNaming = new ImplicitNaming();

    /** @deprecated 1.0.21 부터 {@link #extras} 로 이전. 1.0.22 에서 제거. */
    @Deprecated
    private final Secondary secondary = new Secondary();

    /**
     * Map<name, ExtrasJpa> — 각 entry 별 EMF + JpaTransactionManager 자동 등록 (1.0.21 신규).
     * yml key 가 entry name. dmes 표준 컨벤션: cmn / if 등 cactus.datasource.extras 와 일치.
     * SqlScriptTask 만 사용하는 DS 는 jpa.extras 미정의 OK (DataSource + DataSourceTxMgr fallback).
     */
    private Map<String, ExtrasJpa> extras = new LinkedHashMap<>();

    /**
     * 물리 테이블 prefix. 빈 문자열이면 prefix 미적용 — 기존 동작 그대로.
     * 예: "tb_" 지정 시 논리명 {@code mpn} → 물리명 {@code tb_mpn}.
     * Snake 변환 이후에 prefix 가 부착되므로, prefix 자체는 snake 변환 대상이 아니다.
     */
    private String tablePrefix = "";

    public SnakeNaming getSnakeNaming() {
        return snakeNaming;
    }

    public ImplicitNaming getImplicitNaming() {
        return implicitNaming;
    }

    /** @deprecated 1.0.21 부터 {@link #getExtras()} 사용. 1.0.22 제거. */
    @Deprecated
    public Secondary getSecondary() {
        return secondary;
    }

    public Map<String, ExtrasJpa> getExtras() { return extras; }
    public void setExtras(Map<String, ExtrasJpa> extras) { this.extras = extras; }

    public String getTablePrefix() { return tablePrefix; }
    public void setTablePrefix(String tablePrefix) {
        this.tablePrefix = (tablePrefix == null) ? "" : tablePrefix;
    }

    public static class SnakeNaming {
        /**
         * Hibernate {@code physical_naming_strategy} 에 {@link SnakePhysicalNamingStrategy}
         * (또는 prefix 적용 시 {@link PrefixedSnakePhysicalNamingStrategy}) 를 자동 주입할지 여부. 기본 true.
         *
         * <p>모든 엔티티가 {@code @Table(name="...")} + {@code @Column(name="...")} 으로
         * 명시 컬럼명을 가지면 영향 없음. 신규 엔티티가 {@code @Table} 누락 시 안전망.
         */
        private boolean enabled = true;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }

    /**
     * UK/Index 자동 명명 ({@link CactusImplicitNamingStrategy}) 토글.
     * 활성 시 {@code @UniqueConstraint(name=...)}, {@code @Index(name=...)} 의 {@code name}
     * 을 비우면 {@code uk_<table>_<cols>}, {@code idx_<table>_<cols>} 로 자동 생성된다.
     */
    public static class ImplicitNaming {
        /** 기본 false — 기존 모듈 호환성 유지. opt-in 한 모듈만 활성. */
        private boolean enabled = false;
        private String ukPrefix = "uk_";
        private String idxPrefix = "idx_";

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }

        public String getUkPrefix() { return ukPrefix; }
        public void setUkPrefix(String ukPrefix) {
            this.ukPrefix = (ukPrefix == null) ? "" : ukPrefix;
        }

        public String getIdxPrefix() { return idxPrefix; }
        public void setIdxPrefix(String idxPrefix) {
            this.idxPrefix = (idxPrefix == null) ? "" : idxPrefix;
        }
    }

    /**
     * extras Map 의 value — 각 보조 DS 의 EMF 설정 (1.0.21 신규).
     */
    public static class ExtrasJpa {
        /** 이 EMF 가 스캔할 entity 패키지. */
        private java.util.List<String> packagesToScan = new java.util.ArrayList<>();
        /** persistenceUnit 이름 (기본 "cactus-{name}"). null 이면 entry name 으로 자동 생성. */
        private String persistenceUnitName;
        /** Hibernate 속성 */
        private final Hibernate hibernate = new Hibernate();

        public java.util.List<String> getPackagesToScan() { return packagesToScan; }
        public void setPackagesToScan(java.util.List<String> packagesToScan) {
            this.packagesToScan = packagesToScan;
        }

        public String getPersistenceUnitName() { return persistenceUnitName; }
        public void setPersistenceUnitName(String persistenceUnitName) {
            this.persistenceUnitName = persistenceUnitName;
        }

        public Hibernate getHibernate() { return hibernate; }

        public static class Hibernate {
            private String dialect;
            private String ddlAuto = "none";
            private boolean showSql = false;
            private final Map<String, String> properties = new LinkedHashMap<>();

            public String getDialect() { return dialect; }
            public void setDialect(String dialect) { this.dialect = dialect; }

            public String getDdlAuto() { return ddlAuto; }
            public void setDdlAuto(String ddlAuto) { this.ddlAuto = ddlAuto; }

            public boolean isShowSql() { return showSql; }
            public void setShowSql(boolean showSql) { this.showSql = showSql; }

            public Map<String, String> getProperties() { return properties; }
        }
    }

    /**
     * @deprecated 1.0.21 부터 {@link ExtrasJpa} 로 이전. 1.0.22 에서 제거.
     */
    @Deprecated
    public static class Secondary {
        /** 보조 EMF 활성 여부 (기본 false). */
        private boolean enabled = false;
        /** 보조 EMF 가 스캔할 엔티티 패키지 리스트. */
        private java.util.List<String> packagesToScan = new java.util.ArrayList<>();
        /** 보조 EMF persistenceUnit 이름 (기본 "cactus-secondary"). */
        private String persistenceUnitName = "cactus-secondary";
        /** 보조 EMF 의 hibernate 속성 */
        private final Hibernate hibernate = new Hibernate();

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }

        public java.util.List<String> getPackagesToScan() { return packagesToScan; }
        public void setPackagesToScan(java.util.List<String> packagesToScan) {
            this.packagesToScan = packagesToScan;
        }

        public String getPersistenceUnitName() { return persistenceUnitName; }
        public void setPersistenceUnitName(String persistenceUnitName) {
            this.persistenceUnitName = persistenceUnitName;
        }

        public Hibernate getHibernate() { return hibernate; }

        public static class Hibernate {
            private String dialect;
            private String ddlAuto = "none";
            private boolean showSql = false;

            public String getDialect() { return dialect; }
            public void setDialect(String dialect) { this.dialect = dialect; }

            public String getDdlAuto() { return ddlAuto; }
            public void setDdlAuto(String ddlAuto) { this.ddlAuto = ddlAuto; }

            public boolean isShowSql() { return showSql; }
            public void setShowSql(boolean showSql) { this.showSql = showSql; }
        }
    }
}
