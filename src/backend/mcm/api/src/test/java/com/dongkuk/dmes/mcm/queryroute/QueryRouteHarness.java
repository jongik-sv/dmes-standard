package com.dongkuk.dmes.mcm.queryroute;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.inbound.OasisController;
import com.dongkuk.dmes.cactus.web.inbound.QueryController;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import com.dongkuk.dmes.cactus.web.inbound.QueryStatementGuard;
import org.apache.ibatis.session.SqlSessionFactory;
import org.springframework.stereotype.Controller;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.MediaType;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 조회 라우터 시범 하네스 — Oracle 시험 PDB 의 MCMAPUSER(Flyway 기준선) 위에 운영과 같은 두 경로를 조립해 MockMvc 로 부른다.
 * <ul>
 *   <li>OASIS: {@code POST /oasis/{serviceId}/{action}} → BPMN(classpath services/**) → 서비스 빈(JPA native)</li>
 *   <li>조회 라우터: {@code POST /query/{queryId}} → cactus {@link QueryController} → MyBatis 매퍼</li>
 * </ul>
 * 두 경로는 같은 {@code dataSource} 를 쓴다(운영의 sqlSessionFactoryBiz 와 같음, 설계 §1 F2). 매퍼 SqlSessionFactory 는
 * cactus 기본 설정 파일({@code cactus-mybatis-config.xml}, callSettersOnNulls)을 쓴다. 매퍼의 {@code MCMAPUSER.} 접두는 Oracle 에서
 * 그대로 돈다(옛 SQLite 접두 제거 인터셉터는 oracle-1007 에서 뺐다).
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

    /**
     * 시험 PDB 의 네 스키마를 비우고 Flyway 로 다시 만든 뒤 조립한다. 시드는 호출자가 {@link #insertCodeRows}·{@link #execute} 로 넣는다.
     *
     * @param poolName     커넥션 풀 이름
     * @param mapperPattern 매퍼 위치(classpath 패턴)
     * @param serviceBeans 서비스 빈 등록 — BPMN 의 camunda:class 이름으로 등록한다
     */
    QueryRouteHarness(String poolName, String mapperPattern, Consumer<AnnotationConfigApplicationContext> serviceBeans) throws Exception {
        McmOraTestDb.resetSchemas();
        dataSource = McmOraTestDb.appDataSource(poolName);

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
        // 운영 JpaConfig 와 같은 Hibernate 설정(OracleDialect·ddl none). 엔티티 없이 native 조회만 쓴다.
        return McmOraTestDb.entityManagerFactory(dataSource, "query-route-harness");
    }

    private SqlSessionFactory sqlSessionFactory(String mapperPattern) throws Exception {
        SqlSessionFactoryBean bean = new SqlSessionFactoryBean();
        bean.setDataSource(dataSource);
        bean.setConfigLocation(new ClassPathResource("cactus-mybatis-config.xml"));
        bean.setMapperLocations(new PathMatchingResourcePatternResolver().getResources(mapperPattern));
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
        try (Connection c = dataSource.getConnection();
             Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }

    /** 한 트랜잭션으로 여러 행을 넣는다(10,000행 시드용). */
    void insertRows(String insertSql, List<Object[]> rows) throws Exception {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement(insertSql)) {
                for (Object[] row : rows) {
                    for (int i = 0; i < row.length; i++) {
                        if (row[i] == null) {
                            ps.setNull(i + 1, java.sql.Types.VARCHAR); // ojdbc 는 형식 없는 null 을 받지 않는다
                        } else {
                            ps.setObject(i + 1, row[i]);
                        }
                    }
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            c.commit();
        }
    }

    /**
     * 운영 뷰 {@code MCMAPUSER.VI_MCM_CODE_ACCESS} 가 돌려줄 행을 넣는다. 행 = {CODE_ID, CODE_VAL, CODE_VAL_MEAN, CATEGORY_ID, CATEGORY_NM}.
     * 뷰는 사본 3표(MASTER·CATEGORY·DETAIL)를 MASTER_CODE·CATEGORY_ID 로 조인하므로 행마다 MASTER_CODE 를 따로 주어(Q00001…)
     * 다른 행과 섞이지 않게 한다 — 같은 CODE_ID·CATEGORY_ID 에 CATEGORY_NM 이 다른 행도 그대로 재현된다.
     */
    void insertCodeRows(List<Object[]> rows) throws Exception {
        List<Object[]> masters = new java.util.ArrayList<>();
        List<Object[]> categories = new java.util.ArrayList<>();
        List<Object[]> details = new java.util.ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Object[] r = rows.get(i);
            String master = String.format("Q%05d", i + 1);
            masters.add(new Object[]{master, r[0]});
            categories.add(new Object[]{master, r[3], r[4]});
            details.add(new Object[]{master, r[3], r[1], r[2]});
        }
        insertRows("INSERT INTO MCMAPUSER.TB_MCM_CODE_MASTER (MASTER_CODE, CODE_ID, USE_TP) VALUES (?, ?, 'Y')", masters);
        insertRows("INSERT INTO MCMAPUSER.TB_MCM_CODE_CATEGORY (MASTER_CODE, CATEGORY_ID, CATEGORY_NM) VALUES (?, ?, ?)", categories);
        insertRows("INSERT INTO MCMAPUSER.TB_MCM_CODE_DETAIL (MASTER_CODE, CATEGORY_ID, CODE_VAL, CODE_VAL_MEAN) VALUES (?, ?, ?, ?)",
                details);
    }

    @Override
    public void close() {
        ctx.close();
        dataSource.close();
    }
}
