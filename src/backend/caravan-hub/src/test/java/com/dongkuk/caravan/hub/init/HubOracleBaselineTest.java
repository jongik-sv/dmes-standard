package com.dongkuk.caravan.hub.init;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.dongkuk.caravan.hub.mapper.InterfaceMapper;
import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * caravan-hub Oracle 기준선 시험 — 시험 PDB(-Pdmes.ora.test=clone, 시스템 속성 dmes.ora.url)에서만 돈다.
 *
 * <p>HubFlywayConfig 와 같은 위치의 V 파일을 CARAVANUSER·IFUSER 로 적용하고, 그 위에서 IF 표 매퍼(InterfaceMapper.xml)를
 * EAIUSER 접속으로 실행해 세 가지를 확인한다: (1) 표 5개가 만들어진다 (2) 4000자를 넘는 INTERFACE_MSG(CLOB)를
 * String 으로 읽는다 (3) 읽은 U_AT 를 그대로 갱신 조건(U_AT = ?)에 되돌려 1행이 갱신된다(TIMESTAMP(6) 왕복).
 */
class HubOracleBaselineTest {

    private static final String URL = System.getProperty("dmes.ora.url");
    private static final String PASSWORD = System.getProperty("dmes.ora.password", "dmes_password_123");
    private static final String TABLE = "IFUSER.IF_MMPPMMCMTT01";

    private static SqlSessionFactory factory;

    @BeforeAll
    static void migrate() throws Exception {
        assumeTrue(URL != null && !URL.isBlank(), "시험 PDB 접속값(dmes.ora.url)이 없어 건너뜀");

        Flyway.configure().dataSource(URL, "CARAVANUSER", PASSWORD)
                .locations("classpath:db/migration/caravanuser").load().migrate();
        Flyway.configure().dataSource(URL, "IFUSER", PASSWORD)
                .locations("classpath:db/migration/ifuser").load().migrate();

        // 매퍼는 if 데이터소스와 같이 EAIUSER(표 없이 접속만 하는 사용자)로 실행한다.
        UnpooledDataSource ds = new UnpooledDataSource("oracle.jdbc.OracleDriver", URL, "EAIUSER", PASSWORD);
        Configuration configuration = new Configuration(new Environment("oracle", new JdbcTransactionFactory(), ds));
        configuration.setMapUnderscoreToCamelCase(false);
        configuration.setCallSettersOnNulls(true);
        configuration.addMapper(InterfaceMapper.class);
        try (InputStream xml = HubOracleBaselineTest.class.getResourceAsStream("/mapper/if/InterfaceMapper.xml")) {
            new XMLMapperBuilder(xml, configuration, "mapper/if/InterfaceMapper.xml", configuration.getSqlFragments()).parse();
        }
        factory = new SqlSessionFactoryBuilder().build(configuration);
    }

    @AfterAll
    static void cleanup() throws Exception {
        if (URL == null || URL.isBlank()) {
            return;
        }
        try (Connection c = DriverManager.getConnection(URL, "IFUSER", PASSWORD); Statement s = c.createStatement()) {
            s.executeUpdate("DELETE FROM IF_MMPPMMCMTT01");
        }
    }

    @Test
    void flyway_creates_caravanuser_and_ifuser_tables() throws Exception {
        // Flyway 는 Oracle 에서 이력 표를 소문자(flyway_schema_history)로 만들므로 대소문자를 무시하고 비교한다.
        assertThat(tables("CARAVANUSER")).containsExactlyInAnyOrder(
                "TB_CARAVAN_APPHOST", "TB_CARAVAN_HUB_CONFIG", "TB_CARAVAN_TC_ERROR", "TB_CARAVAN_TOPICS", "FLYWAY_SCHEMA_HISTORY");
        assertThat(tables("IFUSER")).contains("IF_MMPPMMCMTT01");
    }

    @Test
    void clob_message_is_read_as_string_and_updated_by_the_row_key() {
        String message = "{\"k\":\"" + "가".repeat(5000) + "\"}";
        try (SqlSession session = factory.openSession(true)) {
            InterfaceMapper mapper = session.getMapper(InterfaceMapper.class);
            LocalDateTime now = LocalDateTime.now();
            assertThat(mapper.insertOutboundData("IFUSER", "IF_MMPPMMCMTT01", "TC-CLOB", "IF-1", message, "N", now)).isEqualTo(1);

            List<Map<String, Object>> rows = mapper.selectPendingMessages(TABLE);
            assertThat(rows).hasSize(1);
            Map<String, Object> row = rows.get(0);
            assertThat(row.get("INTERFACE_MSG")).isInstanceOf(String.class).isEqualTo(message);
            assertThat(row.get("U_AT")).isNotNull();

            int updated = mapper.updateSuccess(TABLE, row.get("U_AT"), "TC-CLOB", "20261007", "170000", now.plusSeconds(1));
            assertThat(updated).as("읽은 U_AT 를 되돌려 낙관락 조건이 맞아야 한다").isEqualTo(1);
            assertThat(mapper.selectPendingMessages(TABLE)).isEmpty();
        }
    }

    private static List<String> tables(String owner) throws Exception {
        List<String> names = new ArrayList<>();
        try (Connection c = DriverManager.getConnection(URL, owner, PASSWORD);
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT table_name FROM user_tables")) {
            while (rs.next()) {
                names.add(rs.getString(1).toUpperCase());
            }
        }
        return names;
    }
}
