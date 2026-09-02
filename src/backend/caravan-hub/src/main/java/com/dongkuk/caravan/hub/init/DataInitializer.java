package com.dongkuk.caravan.hub.init;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * caravan-hub 애플리케이션 시작 시 mst DataSource 의 필수 테이블을 생성한다.
 *
 * <p>지원 DB: SQLite, Microsoft SQL Server. 두 벤더 자동 감지 후 분기.</p>
 *
 * <ul>
 *   <li>mst : TB_CARAVAN_TOPICS, TB_CARAVAN_TC_ERROR, TB_CARAVAN_HUB_CONFIG</li>
 *   <li>if  : 동적 인터페이스 테이블(IF_*) 은 운영자/배포 시 직접 정의 (본 클래스는 다루지 않음)</li>
 * </ul>
 *
 * <p>이미 존재하는 테이블은 건너뛴다. mcm 의 {@code DataInitializer} 가 데이터 INSERT 위주인 것과 달리,
 * caravan-hub 는 JPA 가 아닌 MyBatis 만 사용해서 ddl-auto 가 동작하지 않으므로 본 클래스가 DDL 까지 책임진다.</p>
 *
 * <p><b>잔여 이슈</b>: caravan 매퍼는 Tibero 전용 시퀀스 {@code SQ_MCM_MOM_TC_ERROR.NEXTVAL} 로 SQ_VAL 을
 * 채우는데, 본 DDL 은 SQLite AUTOINCREMENT / MSSQL IDENTITY 로 자동 채번하도록 정의했다. caravan 측
 * KafkaMapper.xml 을 벤더별로 분기(또는 NEXTVAL 호출 제거)해야 INSERT 가 정상 동작한다.</p>
 */
@Slf4j
@Component
public class DataInitializer {

    private final DataSource mstDataSource;

    /** caravan-hub.init.enabled=false 시 DDL 전체 skip — WildFly dev/prod 기동용 게이트 (2026-07-09 JNDI 전환). 기본 true(현행 동작). */
    private final boolean initEnabled;

    public DataInitializer(@Qualifier("mstDataSource") DataSource mstDataSource,
                           @Value("${caravan-hub.init.enabled:true}") boolean initEnabled) {
        this.mstDataSource = mstDataSource;
        this.initEnabled = initEnabled;
    }

    /**
     * Spring 빈 초기화 단계에 실행 (다른 @PostConstruct 보다 먼저 실행되도록
     * 의존하는 빈은 {@code @DependsOn("dataInitializer")} 명시).
     */
    @PostConstruct
    public void initialize() throws SQLException {
        if (!initEnabled) {
            log.info("[DataInitializer] caravan-hub.init.enabled=false — 스키마 DDL skip (WildFly/운영 기동, 스키마는 사전 생성분 사용)");
            return;
        }
        initSchema(mstDataSource, "MST", buildMstDdl());
    }

    /** 벤더 → (테이블명 → CREATE DDL) — INSERT 순서를 위해 LinkedHashMap. */
    private Map<Vendor, Map<String, String>> buildMstDdl() {
        Map<Vendor, Map<String, String>> all = new LinkedHashMap<>();

        // ── SQLite ──
        Map<String, String> sqlite = new LinkedHashMap<>();
        sqlite.put("TB_CARAVAN_TOPICS", """
                CREATE TABLE TB_CARAVAN_TOPICS (
                    TOPIC_ID         VARCHAR(100) NOT NULL,
                    BIZ_SYSTEM       VARCHAR(20)  NOT NULL,
                    TOPIC_DESC       VARCHAR(300),
                    GROUP_ID         VARCHAR(100) NOT NULL,
                    SEND_MODULE_ID   VARCHAR(20),
                    RECV_MODULE_ID   VARCHAR(20),
                    USE_TP           VARCHAR(1),
                    STATUS           VARCHAR(20),
                    ASSIGNED_HOST    VARCHAR(50),
                    ERROR_AT         TIMESTAMP,
                    ERROR_OFFSET     BIGINT,
                    LAST_ERROR_CODE  VARCHAR(100),
                    LAST_ERROR_MSG   VARCHAR(1000),
                    PRIMARY KEY (TOPIC_ID, BIZ_SYSTEM)
                )
                """);
        sqlite.put("TB_CARAVAN_TC_ERROR", """
                CREATE TABLE TB_CARAVAN_TC_ERROR (
                    SQ_VAL              VARCHAR(32) PRIMARY KEY,
                    TRANSACTION_CODE    VARCHAR(50),
                    INTERFACE_ID        VARCHAR(100),
                    INTERFACE_MSG       TEXT,
                    INTERFACE_PROTOCOL  VARCHAR(20),
                    ERROR_TYPE          VARCHAR(3),
                    ERROR_CODE          VARCHAR(100),
                    ERROR_MSG           VARCHAR(1000),
                    ERROR_STATUS_CODE   VARCHAR(1),
                    CREATED_AT          TIMESTAMP,
                    CREATED_BY          VARCHAR(20),
                    UPDATED_AT          TIMESTAMP,
                    UPDATED_BY          VARCHAR(20)
                )
                """);
        sqlite.put("TB_CARAVAN_HUB_CONFIG", """
                CREATE TABLE TB_CARAVAN_HUB_CONFIG (
                    TOPIC_ID            VARCHAR(100) NOT NULL,
                    DIRECTION           VARCHAR(10)  NOT NULL,
                    INTEGRATION_TYPE    VARCHAR(20),
                    POLLING_INTERVAL_MS INTEGER,
                    DB_TABLE_NAME       VARCHAR(100),
                    DB_SCHEMA           VARCHAR(100),
                    FILE_PATH           VARCHAR(500),
                    BACKUP_PATH         VARCHAR(500),
                    FTP_HOST            VARCHAR(200),
                    FTP_PORT            INTEGER,
                    FTP_USER            VARCHAR(100),
                    FTP_PASSWORD        VARCHAR(200),
                    HTTP_URL            VARCHAR(500),
                    HTTP_METHOD         VARCHAR(10),
                    HTTP_HEADERS        TEXT,
                    USE_YN              VARCHAR(1),
                    PRIMARY KEY (TOPIC_ID, DIRECTION)
                )
                """);
        all.put(Vendor.SQLITE, sqlite);

        // ── MSSQL ──
        Map<String, String> mssql = new LinkedHashMap<>();
        mssql.put("TB_CARAVAN_TOPICS", """
                CREATE TABLE TB_CARAVAN_TOPICS (
                    TOPIC_ID         VARCHAR(100) NOT NULL,
                    BIZ_SYSTEM       VARCHAR(20)  NOT NULL,
                    TOPIC_DESC       VARCHAR(300),
                    GROUP_ID         VARCHAR(100) NOT NULL,
                    SEND_MODULE_ID   VARCHAR(20),
                    RECV_MODULE_ID   VARCHAR(20),
                    USE_TP           VARCHAR(1),
                    STATUS           VARCHAR(20),
                    ASSIGNED_HOST    VARCHAR(50),
                    ERROR_AT         DATETIME2(6),
                    ERROR_OFFSET     BIGINT,
                    LAST_ERROR_CODE  VARCHAR(100),
                    LAST_ERROR_MSG   VARCHAR(1000),
                    PRIMARY KEY (TOPIC_ID, BIZ_SYSTEM)
                )
                """);
        mssql.put("TB_CARAVAN_TC_ERROR", """
                CREATE TABLE TB_CARAVAN_TC_ERROR (
                    SQ_VAL              VARCHAR(32) NOT NULL PRIMARY KEY,
                    TRANSACTION_CODE    VARCHAR(50),
                    INTERFACE_ID        VARCHAR(100),
                    INTERFACE_MSG       NVARCHAR(MAX),
                    INTERFACE_PROTOCOL  VARCHAR(20),
                    ERROR_TYPE          VARCHAR(3),
                    ERROR_CODE          VARCHAR(100),
                    ERROR_MSG           VARCHAR(1000),
                    ERROR_STATUS_CODE   VARCHAR(1),
                    CREATED_AT          DATETIME2(6),
                    CREATED_BY          VARCHAR(20),
                    UPDATED_AT          DATETIME2(6),
                    UPDATED_BY          VARCHAR(20)
                )
                """);
        mssql.put("TB_CARAVAN_HUB_CONFIG", """
                CREATE TABLE TB_CARAVAN_HUB_CONFIG (
                    TOPIC_ID            VARCHAR(100) NOT NULL,
                    DIRECTION           VARCHAR(10)  NOT NULL,
                    INTEGRATION_TYPE    VARCHAR(20),
                    POLLING_INTERVAL_MS INT,
                    DB_TABLE_NAME       VARCHAR(100),
                    DB_SCHEMA           VARCHAR(100),
                    FILE_PATH           VARCHAR(500),
                    BACKUP_PATH         VARCHAR(500),
                    FTP_HOST            VARCHAR(200),
                    FTP_PORT            INT,
                    FTP_USER            VARCHAR(100),
                    FTP_PASSWORD        VARCHAR(200),
                    HTTP_URL            VARCHAR(500),
                    HTTP_METHOD         VARCHAR(10),
                    HTTP_HEADERS        NVARCHAR(MAX),
                    USE_YN              VARCHAR(1),
                    PRIMARY KEY (TOPIC_ID, DIRECTION)
                )
                """);
        all.put(Vendor.MSSQL, mssql);

        return all;
    }

    private void initSchema(DataSource ds, String label,
                            Map<Vendor, Map<String, String>> ddlByVendor) throws SQLException {
        try (Connection conn = ds.getConnection()) {
            Vendor vendor = detectVendor(conn);
            log.info("[CaravanHub DataInitializer] {} DataSource vendor = {}", label, vendor);

            Map<String, String> ddls = ddlByVendor.get(vendor);
            if (ddls == null) {
                log.warn("[CaravanHub DataInitializer] {}: 미지원 DB 벤더. 테이블 생성 skip.", label);
                return;
            }

            int created = 0;
            int skipped = 0;
            for (Map.Entry<String, String> e : ddls.entrySet()) {
                String table = e.getKey();
                if (tableExists(conn, vendor, table)) {
                    log.info("[CaravanHub DataInitializer] {}: {} 이미 존재 → skip", label, table);
                    skipped++;
                    continue;
                }
                try (Statement stmt = conn.createStatement()) {
                    stmt.execute(e.getValue());
                }
                log.info("[CaravanHub DataInitializer] {}: {} 생성", label, table);
                created++;
            }
            log.info("[CaravanHub DataInitializer] {} 완료: 생성 {}, skip {}", label, created, skipped);
        }
    }

    private Vendor detectVendor(Connection conn) throws SQLException {
        DatabaseMetaData meta = conn.getMetaData();
        String prod = meta.getDatabaseProductName();
        if (prod == null) return Vendor.UNKNOWN;
        String lower = prod.toLowerCase();
        if (lower.contains("sqlite")) return Vendor.SQLITE;
        if (lower.contains("microsoft") || lower.contains("sql server")) return Vendor.MSSQL;
        return Vendor.UNKNOWN;
    }

    private boolean tableExists(Connection conn, Vendor vendor, String tableName) throws SQLException {
        String sql = switch (vendor) {
            case SQLITE -> "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?";
            case MSSQL  -> "SELECT 1 FROM sys.tables WHERE name = ?";
            default     -> null;
        };
        if (sql == null) return true;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private enum Vendor { SQLITE, MSSQL, UNKNOWN }
}
