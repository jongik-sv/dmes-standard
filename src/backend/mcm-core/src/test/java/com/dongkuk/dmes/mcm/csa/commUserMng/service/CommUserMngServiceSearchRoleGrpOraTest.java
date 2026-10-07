package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngUserIdRequest;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
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
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link CommUserMngService#searchRoleGrp} 네이티브 SQL 특성 테스트 — Oracle 시험 PDB 에서 실제로 돌린다(oracle-1007 c4).
 *
 * <p>실행되는 SQL 은 {@code LOCALTIMESTAMP BETWEEN START_ACTIVE_DATE AND COALESCE(END_ACTIVE_DATE, LOCALTIMESTAMP + INTERVAL '100' DAY)}
 * 이다. 예전에는 로컬 SQLite 분기({@code DATETIME(CURRENT_TIMESTAMP, '+100 day')})를 SQLite 파일로 돌렸지만 방언 분기가 없어졌고,
 * 같은 시나리오를 H2 로 돌리던 {@link CommUserMngServiceSearchTest} 의 {@code SearchRoleGrp} 묶음과 이 시험이 모두 Oracle 에서 돈다.
 *
 * <p>구성 — 앱 EMF 와 같은 Hibernate 설정({@link McmCoreOraTestDb#jpaProperties})에 {@link McmAuditStatementInspector} 를
 * statement inspector 로 건다(감사 칸 보강 — SELECT 라 SQL 이 바뀌지 않는다).
 * 엔티티는 올리지 않는다(이 경로는 네이티브 SQL 하나). 표는 기준선 V1(MCMAPUSER)을 쓰고, 데이터는 JDBC 로 넣는다 —
 * 일시 칸은 TIMESTAMP(6) 이므로 문자열이 아니라 {@link Timestamp} 로 넣는다.
 *
 * <p>서비스는 {@code csa.commUserMng} 패키지를 컴포넌트 스캔해 빈으로 둔다(시험 지원 패키지 제외). 이 경로에서 쓰지 않는
 * 저장소는 대역(mock)이다. JDBC 로 넣은 행은 자동 커밋이라 시험 앞·뒤에서 두 표를 지운다.
 *
 * <p>날짜 여유는 모두 하루 단위다 — 비교 기준 {@code LOCALTIMESTAMP} 는 세션 시간대(JDBC 가 JVM 시간대 Asia/Seoul 로 맞춘다)
 * 이고 저장값도 JVM 로컬 시각이라 어긋나지 않지만, 시각 경계에 기대지 않게 하루 단위를 유지한다.
 */
@SpringJUnitConfig(CommUserMngServiceSearchRoleGrpOraTest.OraConfig.class)
class CommUserMngServiceSearchRoleGrpOraTest {

    @Autowired CommUserMngService service;
    @Autowired DataSource dataSource;
    @Autowired TransactionTemplate tx;

    JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        clearTables();
    }

    @AfterEach
    void tearDown() {
        clearTables();
    }

    private void clearTables() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP");
    }

    private static Timestamp ts(LocalDateTime t) {
        return t == null ? null : Timestamp.valueOf(t);
    }

    void roleGroup(String id, String nm, String useTp, LocalDateTime start, LocalDateTime end) {
        roleGroupRaw(id, nm, useTp, ts(start), ts(end));
    }

    private void roleGroupRaw(String id, String nm, String useTp, Timestamp start, Timestamp end) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE)"
                        + " VALUES (?, ?, ?, ?, ?)",
                new Object[]{id, nm, useTp, start, end},
                new int[]{Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.TIMESTAMP, Types.TIMESTAMP});
    }

    void mapping(String userId, String roleGroupId) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", userId, roleGroupId);
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
    @DisplayName("시드 행의 종료일 센티널(9999-12-31 23:59:59)도 유효기간 안으로 본다 — 지난 종료일은 제외")
    void sentinelEndDate() {
        // 시드 데이터는 무기한을 '9999-12-31 23:59:59' 로 둔다. TIMESTAMP 칸이라 문자열 형식이 아니라 값 자체가 비교된다.
        LocalDateTime now = LocalDateTime.now();
        roleGroup("RG_SEED", "시드", "Y", now.minusDays(3), LocalDateTime.of(9999, 12, 31, 23, 59, 59));
        roleGroup("RG_OLD", "지난", "Y", now.minusDays(30), now.minusDays(2));

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
    static class OraConfig {

        @Bean
        DataSource dataSource() {
            return McmCoreOraTestDb.appDataSource("commusermng-rolegrp");
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            em.setJpaProperties(McmCoreOraTestDb.jpaProperties(Map.<String, Object>of(
                    "hibernate.session_factory.statement_inspector", McmAuditStatementInspector.class.getName())));
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
