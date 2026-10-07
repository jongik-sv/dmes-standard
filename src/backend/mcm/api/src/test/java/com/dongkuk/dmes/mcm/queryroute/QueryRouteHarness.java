package com.dongkuk.dmes.mcm.queryroute;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.inbound.OasisController;
import com.dongkuk.dmes.cactus.web.inbound.QueryController;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.audit.McmSqliteMybatisInterceptor;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import com.dongkuk.dmes.cactus.web.inbound.QueryStatementGuard;
import org.apache.ibatis.session.SqlSessionFactory;
import org.springframework.stereotype.Controller;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.MediaType;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import javax.sql.DataSource;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.function.Consumer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 조회 라우터 시범 하네스 — 같은 SQLite 파일 위에 운영과 같은 두 경로를 조립해 MockMvc 로 부른다.
 * <ul>
 *   <li>OASIS: {@code POST /oasis/{serviceId}/{action}} → BPMN(classpath services/**) → 서비스 빈(JPA native)</li>
 *   <li>조회 라우터: {@code POST /query/{queryId}} → cactus {@link QueryController} → MyBatis 매퍼</li>
 * </ul>
 * 두 경로는 같은 {@code dataSource} 를 쓴다(운영의 sqlSessionFactoryBiz 와 같음, 설계 §1 F2). 매퍼 SqlSessionFactory 는
 * cactus 기본 설정 파일({@code cactus-mybatis-config.xml}, callSettersOnNulls)과 {@link McmSqliteMybatisInterceptor} 를 쓴다.
 *
 * <p>모듈을 바꿔 시범할 때는 서비스 빈 등록({@code serviceBeans})·매퍼 위치·서비스 경로만 바꾼다
 * (설계 docs/superpowers/specs/2026-10-07-query-route-mybatis-design.md §10). 라우터 보호(route-guard 레인의 스위치·검사)는
 * 여기서 조립하지 않는다 — 이 하네스는 결과 동등성과 경로 비용만 본다.
 */
final class QueryRouteHarness implements AutoCloseable {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final AnnotationConfigApplicationContext ctx;
    private final HikariDataSource dataSource;
    private final MockMvc mvc;
    private final Path db;

    /**
     * @param db           SQLite 파일(없으면 만든다). 테이블·시드는 호출자가 {@link #execute}·{@link #insertRows} 로 넣는다.
     * @param mapperPattern 매퍼 위치(classpath 패턴)
     * @param serviceBeans 서비스 빈 등록 — BPMN 의 camunda:class 이름으로 등록한다
     */
    QueryRouteHarness(Path db, String mapperPattern, Consumer<AnnotationConfigApplicationContext> serviceBeans) throws Exception {
        this.db = db;
        dataSource = new HikariDataSource();
        dataSource.setJdbcUrl("jdbc:sqlite:" + db);
        dataSource.setPoolName("query-route-harness");
        dataSource.setMaximumPoolSize(2);
        // SQLite LIKE 는 기본이 ASCII 대소문자 무시라 UPPER 가 빠져도 시험이 통과한다. 운영(Oracle·PostgreSQL)처럼 구분하게 한다.
        dataSource.setConnectionInitSql("PRAGMA case_sensitive_like = ON");

        ctx = new AnnotationConfigApplicationContext();
        ctx.registerBean("dataSource", DataSource.class, () -> dataSource);
        ctx.registerBean("entityManagerFactory", LocalContainerEntityManagerFactoryBean.class, this::entityManagerFactory);
        ctx.registerBean("txBiz", JpaTransactionManager.class,
                () -> new JpaTransactionManager(ctx.getBean(jakarta.persistence.EntityManagerFactory.class)));
        serviceBeans.accept(ctx);
        ctx.refresh();

        // 운영 스위치(cactus.inbound.query-routes.enabled, 기본 off)와 무관하게 시험에서만 라우터를 직접 조립한다.
        // 운영과 같은 QueryStatementGuard(SELECT 만·persistence/query/** 만·행 상한 기본 10,000)를 거친다.
        QueryController queryController = new TestQueryController(new QueryStatementGuard(
                new SqlSessionTemplate(sqlSessionFactory(mapperPattern)), 10_000));
        OasisController oasisController = new TestOasisController(new OasisServiceExecutor(
                serviceStarter(), ctx, new CactusRequestConverter(), new CactusResponseConverter()));
        mvc = MockMvcBuilders.standaloneSetup(oasisController, queryController).build();
    }

    // cactus 진입 컨트롤러는 @Controller 없이 클래스 @RequestMapping 만 단다(운영은 CactusRequestMappingHandlerMapping 이 인식).
    // MockMvc 단독 구성의 기본 매핑은 @Controller 만 핸들러로 보므로 시험에서만 표시를 붙인 하위 클래스로 감싼다.
    @Controller
    static class TestQueryController extends QueryController {
        TestQueryController(QueryStatementGuard guard) {
            super(guard);
        }
    }

    @Controller
    static class TestOasisController extends OasisController {
        TestOasisController(OasisServiceExecutor executor) {
            super(executor);
        }
    }

    private LocalContainerEntityManagerFactoryBean entityManagerFactory() {
        Properties props = new Properties();
        props.put("hibernate.dialect", "org.hibernate.community.dialect.SQLiteDialect");
        props.put("hibernate.hbm2ddl.auto", "none");
        // 로컬 JpaConfig 는 SQLite 일 때 McmAuditStatementInspector(정적 플래그)로 MCMAPUSER. 접두를 지운다. 플래그를 켜면 같은 JVM 의
        // 다른 시험에 남으므로 같은 치환 함수만 부르는 검사기 인스턴스를 넣는다(SELECT 경로라 audit 보강은 무관).
        props.put("hibernate.session_factory.statement_inspector",
                (StatementInspector) McmAuditStatementInspector::toSqliteCompatible);
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        em.setJpaProperties(props);
        em.setPersistenceUnitName("query-route-harness");
        em.setManagedTypes(PersistenceManagedTypes.of());
        em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
        return em;
    }

    private SqlSessionFactory sqlSessionFactory(String mapperPattern) throws Exception {
        SqlSessionFactoryBean bean = new SqlSessionFactoryBean();
        bean.setDataSource(dataSource);
        bean.setConfigLocation(new ClassPathResource("cactus-mybatis-config.xml"));
        bean.setMapperLocations(new PathMatchingResourcePatternResolver().getResources(mapperPattern));
        bean.setPlugins(new McmSqliteMybatisInterceptor());
        return bean.getObject();
    }

    /** 운영과 같은 조립 — mcm application.yml 의 service-path(/services)·transactional(true)·기본 트랜잭션 매니저(txBiz). */
    private com.dongkuk.oasis.service.ServiceStarter serviceStarter() {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        return new OasisAutoConfiguration().serviceStarter(props, tx, ctx);
    }

    /** OASIS 경로를 불러 {@code grids.{output}.rows} 를 돌려준다. */
    List<Map<String, Object>> oasis(String serviceId, String action, String output, Map<String, Object> params) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("meta", Map.of("userId", "harness", "menuId", serviceId));
        body.put("params", params);
        JsonNode root = call("/oasis/" + serviceId + "/" + action, body);
        if (!root.path("meta").path("success").asBoolean(false)) {
            throw new IllegalStateException("OASIS 실패: " + root);
        }
        return rows(root.path("grids").path(output).path("rows"));
    }

    /** 조회 라우터를 불러 {@code data} 를 돌려준다. */
    List<Map<String, Object>> query(String queryId, Map<String, Object> params) throws Exception {
        JsonNode root = call("/query/" + queryId, params);
        if (!root.path("success").asBoolean(false)) {
            throw new IllegalStateException("조회 라우터 실패: " + root);
        }
        return rows(root.path("data"));
    }

    private JsonNode call(String path, Object body) throws Exception {
        MvcResult result = mvc.perform(post(path)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn();
        return JSON.readTree(result.getResponse().getContentAsByteArray());
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        return JSON.convertValue(node, List.class);
    }

    void execute(String sql) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + db);
             Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }

    /** 한 트랜잭션으로 여러 행을 넣는다(10,000행 시드용). */
    void insertRows(String insertSql, List<Object[]> rows) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + db)) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement(insertSql)) {
                for (Object[] row : rows) {
                    for (int i = 0; i < row.length; i++) {
                        ps.setObject(i + 1, row[i]);
                    }
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            c.commit();
        }
    }

    @Override
    public void close() {
        ctx.close();
        dataSource.close();
    }
}
