package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.persistence.LocalDateTimeAttributeConverter;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngUserIdRequest;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link CommUserMngService#searchRoleGrp} SQLite 분기 특성 테스트 — 실제 SQLite 파일에서 네이티브 SQL 을 돌린다.
 *
 * <p>로컬 개발·테스트 DB 는 SQLite 이므로 실제로 실행되는 분기는
 * {@code CURRENT_TIMESTAMP BETWEEN START_ACTIVE_DATE AND IFNULL(END_ACTIVE_DATE, DATETIME(CURRENT_TIMESTAMP, '+100 day'))} 이다.
 * MSSQL 분기는 {@link CommUserMngServiceSearchTest}(H2 MSSQLServer 모드)가 같은 시나리오로 고정한다.
 *
 * <p>구성 — 로컬 실행(mcm {@code JpaConfig} 의 SQLite 분기)과 같게 {@link McmAuditStatementInspector} 를
 * statement inspector 로 걸어 {@code MCMAPUSER.} 접두를 지운다. 단 다음 두 가지는 다르다.
 * <ul>
 *   <li>Hibernate SQLite 방언({@code hibernate-community-dialects})은 mcm-core 시험 클래스패스에 없다(mcm/lib 에만 있다).
 *       그래서 hibernate-core 의 H2 방언을 걸고 엔티티는 올리지 않는다. 이 테스트가 타는 길은 네이티브 SQL 하나라
 *       방언이 SQL 을 바꾸지 않는다.</li>
 *   <li>테이블은 로컬 {@code mcm.db} 의 실제 스키마(날짜 컬럼이 {@code varchar(255)} 문자열)를 JDBC 로 만들고,
 *       데이터도 JDBC 로 넣는다. 날짜 문자열은 로컬 실행이 쓰는 {@link LocalDateTimeAttributeConverter} 형식 그대로다.</li>
 * </ul>
 *
 * <p>서비스는 {@code csa.commUserMng} 패키지를 컴포넌트 스캔해 빈으로 둔다(시험 지원 패키지 제외). 이 경로에서 쓰지 않는
 * 저장소는 대역(mock)이다. SQLite 모드 정적 플래그는 매 테스트 앞에서 켜고 뒤에서 이전 값으로 되돌린다.
 *
 * <p>날짜 여유는 모두 하루 단위다 — SQLite {@code CURRENT_TIMESTAMP} 는 UTC 이고 저장값은 로컬 시각 문자열이라
 * 몇 시간 어긋날 수 있다(결함 기록 대상, 이 테스트는 고정하지 않는다).
 */
@SpringJUnitConfig(CommUserMngServiceSearchRoleGrpSqliteTest.SqliteConfig.class)
class CommUserMngServiceSearchRoleGrpSqliteTest {

    @Autowired CommUserMngService service;
    @Autowired DataSource dataSource;
    @Autowired TransactionTemplate tx;

    JdbcTemplate jdbc;
    private boolean sqliteBefore;

    static final LocalDateTimeAttributeConverter DATE_TEXT = new LocalDateTimeAttributeConverter();

    @BeforeEach
    void setUp() {
        sqliteBefore = McmAuditStatementInspector.isSqlite();
        McmAuditStatementInspector.setSqlite(true);
        jdbc = new JdbcTemplate(dataSource);
        // 로컬 mcm.db 스키마 그대로(감사 컬럼 포함). 컨텍스트가 캐시되므로 IF NOT EXISTS + 비우기.
        jdbc.execute("CREATE TABLE IF NOT EXISTS TB_MCM_SEC_ROLEGROUP ("
                + " ROLE_GROUP_ID varchar(30) not null, C_AT timestamp, C_USR_ID varchar(100), C_PGM_ID varchar(100),"
                + " C_SVC_ID varchar(100), U_AT timestamp, U_USR_ID varchar(100), U_PGM_ID varchar(100), U_SVC_ID varchar(100),"
                + " VER bigint, END_ACTIVE_DATE varchar(255), ROLE_GROUP_DESC varchar(300), ROLE_GROUP_NM varchar(100),"
                + " START_ACTIVE_DATE varchar(255), USE_TP varchar(1), primary key (ROLE_GROUP_ID))");
        jdbc.execute("CREATE TABLE IF NOT EXISTS TB_MCM_SEC_USER_MAPPING ("
                + " ROLE_GROUP_ID varchar(30) not null, USER_ID varchar(100) not null, C_AT timestamp, C_USR_ID varchar(100),"
                + " C_PGM_ID varchar(100), C_SVC_ID varchar(100), U_AT timestamp, U_USR_ID varchar(100), U_PGM_ID varchar(100),"
                + " U_SVC_ID varchar(100), VER bigint, primary key (ROLE_GROUP_ID, USER_ID))");
        jdbc.update("DELETE FROM TB_MCM_SEC_USER_MAPPING");
        jdbc.update("DELETE FROM TB_MCM_SEC_ROLEGROUP");
    }

    @AfterEach
    void restore() {
        McmAuditStatementInspector.setSqlite(sqliteBefore);
    }

    void roleGroup(String id, String nm, String useTp, LocalDateTime start, LocalDateTime end) {
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE)"
                        + " VALUES (?, ?, ?, ?, ?)",
                id, nm, useTp, DATE_TEXT.convertToDatabaseColumn(start), DATE_TEXT.convertToDatabaseColumn(end));
    }

    void mapping(String userId, String roleGroupId) {
        jdbc.update("INSERT INTO TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", userId, roleGroupId);
    }

    static CommUserMngUserIdRequest userIdReq(String userId) {
        CommUserMngUserIdRequest r = new CommUserMngUserIdRequest();
        r.setUSER_ID(userId);
        return r;
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> grid(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("ds_rolegrpList");
    }

    static List<Object> col(List<Map<String, Object>> rows, String key) {
        return rows.stream().map(r -> r.get(key)).toList();
    }

    Map<String, Object> call(CommUserMngUserIdRequest req) {
        return tx.execute(s -> service.searchRoleGrp(req));
    }

    @Test
    @DisplayName("사용중·유효기간 안·미보유 역할그룹만, ROLE_GROUP_ID 순 — 종료일 null 은 포함(+100일), 시작일 null 은 제외")
    void addableRoleGroups() {
        LocalDateTime now = LocalDateTime.now();
        roleGroup("RG_A", "기본", "Y", now.minusDays(10), null);              // 종료일 없음 → +100일로 보고 포함
        roleGroup("RG_B", "보유", "Y", now.minusDays(10), null);              // 사용자가 이미 보유 → 제외
        roleGroup("RG_C", "미사용", "N", now.minusDays(10), null);             // USE_TP=N → 제외
        roleGroup("RG_D", "미래시작", "Y", now.plusDays(10), null);            // 시작 전 → 제외
        roleGroup("RG_E", "만료", "Y", now.minusDays(10), now.minusDays(1));  // 종료 → 제외
        roleGroup("RG_F", "기간안", "Y", now.minusDays(10), now.plusDays(5)); // 포함
        roleGroup("RG_G", "시작없음", "Y", null, null);                       // 시작일 null → BETWEEN 불성립, 제외
        roleGroup("RG_0", "다른사람보유", "Y", now.minusDays(1), null);         // 남이 보유한 건 상관없음 → 포함
        mapping("u1", "RG_B");
        mapping("u2", "RG_0");

        Map<String, Object> out = call(userIdReq("u1"));

        assertThat(out.keySet()).containsExactly("ds_rolegrpList");
        List<Map<String, Object>> rows = grid(out);
        assertThat(col(rows, "ROLE_GROUP_ID")).containsExactly("RG_0", "RG_A", "RG_F");
        assertThat(col(rows, "ROLE_GROUP_NM")).containsExactly("다른사람보유", "기본", "기간안");
        assertThat(rows.get(0).keySet()).containsExactly("ROLE_GROUP_ID", "ROLE_GROUP_NM");
    }

    @Test
    @DisplayName("USER_ID 가 null 이면 빈 문자열로 조회 — 보유 제외 없이 유효한 역할그룹 전체")
    void nullUserId() {
        LocalDateTime now = LocalDateTime.now();
        roleGroup("RG_A", "기본", "Y", now.minusDays(1), null);
        roleGroup("RG_B", "보유", "Y", now.minusDays(1), null);
        mapping("u1", "RG_B");

        assertThat(col(grid(call(userIdReq(null))), "ROLE_GROUP_ID")).containsExactly("RG_A", "RG_B");
        assertThat(col(grid(call(null)), "ROLE_GROUP_ID")).containsExactly("RG_A", "RG_B");
    }

    @Test
    @DisplayName("로컬 시드 형식(밀리초 없는 'yyyy-MM-dd HH:mm:ss') 날짜도 같은 결과")
    void seedDateFormat() {
        // 로컬 mcm.db 시드 행은 '2026-09-23 05:21:19' / '9999-12-31 23:59:59' 형식이다(컨버터는 .SSS 를 붙인다).
        LocalDateTime now = LocalDateTime.now();
        DateTimeFormatter seed = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE)"
                        + " VALUES (?, ?, 'Y', ?, ?)",
                "RG_SEED", "시드", now.minusDays(3).format(seed), "9999-12-31 23:59:59");
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE)"
                        + " VALUES (?, ?, 'Y', ?, ?)",
                "RG_OLD", "지난", now.minusDays(30).format(seed), now.minusDays(2).format(seed));

        assertThat(col(grid(call(userIdReq("u9"))), "ROLE_GROUP_ID")).containsExactly("RG_SEED");
    }

    @Configuration
    @EnableTransactionManagement
    @ComponentScan(
            basePackages = "com.dongkuk.dmes.mcm.csa.commUserMng",
            excludeFilters = {
                    @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class),
                    @ComponentScan.Filter(type = FilterType.REGEX, pattern = "com\\.dongkuk\\.dmes\\.mcm\\.csa\\.commUserMng\\.support\\..*")
            })
    static class SqliteConfig {

        @Bean
        DataSource dataSource() throws IOException {
            File db = File.createTempFile("commusermng-sqlite", ".db");
            db.deleteOnExit();
            DriverManagerDataSource ds = new DriverManagerDataSource();
            ds.setDriverClassName("org.sqlite.JDBC"); // testRuntimeOnly — 클래스 직접 참조 금지
            ds.setUrl("jdbc:sqlite:" + db.getAbsolutePath());
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            Properties props = new Properties();
            // SQLite 방언이 시험 클래스패스에 없어 hibernate-core 방언을 건다 — 네이티브 SQL 만 타므로 SQL 은 바뀌지 않는다.
            props.put("hibernate.dialect", "org.hibernate.dialect.H2Dialect");
            props.put("hibernate.boot.allow_jdbc_metadata_access", "false");
            props.put("hibernate.hbm2ddl.auto", "none");
            props.put("hibernate.session_factory.statement_inspector", McmAuditStatementInspector.class.getName());

            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            em.setJpaProperties(props);
            em.setPersistenceUnitName("default"); // 서비스의 @PersistenceContext(unitName = "default")
            em.setManagedTypes(PersistenceManagedTypes.of());
            em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
            return em;
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
            return new TransactionTemplate(transactionManager);
        }

        // searchRoleGrp 는 저장소를 쓰지 않는다 — 서비스 생성자 주입용 대역.
        @Bean SecUserRepository secUserRepository() { return mock(SecUserRepository.class); }
        @Bean SecUserMappingRepository secUserMappingRepository() { return mock(SecUserMappingRepository.class); }
        @Bean SecUserPwdRepository secUserPwdRepository() { return mock(SecUserPwdRepository.class); }
        @Bean SecUserHisRepository secUserHisRepository() { return mock(SecUserHisRepository.class); }
        @Bean SecUserRollHisRepository secUserRollHisRepository() { return mock(SecUserRollHisRepository.class); }
        @Bean DeptInfoRepository deptInfoRepository() { return mock(DeptInfoRepository.class); }
        @Bean SecRoleGroupMappingRepository secRoleGroupMappingRepository() { return mock(SecRoleGroupMappingRepository.class); }
    }
}
