package com.dongkuk.dmes.mcm.userq;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryAssignRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryDefRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryStore;
import com.dongkuk.dmes.mcm.userq.service.UserQueryMngService;
import com.dongkuk.dmes.mcm.userq.service.UserQueryService;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryDataSource;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryExecutor;
import jakarta.persistence.EntityManagerFactory;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 실제 services/cmq/userQueryMng.bpmn·services/cmq/userQuery.bpmn 을 OASIS 실행기로 돌려 action 분기·DTO 바인딩·
 * 응답 data.result 를 확인한다(스펙 2026-10-10 §4·§11). {@code JobSchedMngBpmnTest} 의 JPA 판 — 저장소·서비스만 올린
 * 컨텍스트에 실행기를 직접 조립한다. 사용자 문맥은 {@link WidgetUserContextResolver} 대역({@link #CURRENT_USER}).
 */
@SpringJUnitConfig(UserQueryBpmnTest.Config.class)
class UserQueryBpmnTest {

    private static boolean schemasReady;

    /** 현재 사용자(대역 인증 컨텍스트) — 시험마다 바꾼다. */
    static final AtomicReference<String> CURRENT_USER = new AtomicReference<>("userA");

    @Autowired DataSource dataSource;
    @Autowired ApplicationContext ctx;
    private JdbcTemplate jdbc;
    private OasisServiceExecutor executor;

    @BeforeAll
    static synchronized void prepareSchemas() {
        if (!schemasReady) {
            McmOraTestDb.resetSchemas();
            schemasReady = true;
        }
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID IN ('userA','userB')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP) VALUES ('userA', '사용자A', 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP) VALUES ('userB', '사용자B', 'Y')");
        CURRENT_USER.set("userA");
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        executor = new OasisServiceExecutor(new OasisAutoConfiguration().serviceStarter(props, tx, ctx), ctx,
                new CactusRequestConverter(), new CactusResponseConverter());
    }

    private static CactusRequest request(Map<String, Object> params) {
        return new CactusRequest(new RequestMeta("admin", "userQueryMng"), new HashMap<>(params), Map.of());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> result(CactusResponse response) {
        assertThat(response.getMeta().success()).as(response.getMeta().message()).isTrue();
        return (Map<String, Object>) response.getData().get("result");
    }

    @Test
    @DisplayName("userQueryMng save·get·saveAssign·searchAssign → userQuery myList·getDef·run·미할당 거절 → delete — BPMN 분기·data.result 모양")
    @SuppressWarnings("unchecked")
    void userQueryFlowThroughOasis() {
        // 정의 저장(SQL 은 CONNECT BY 표본 — 값 바인딩과 잘림을 함께 본다)
        Map<String, Object> save = new HashMap<>();
        save.put("queryId", "PRD_TOP10");
        save.put("queryNm", "상위 조회");
        save.put("categoryCd", "ETC");
        save.put("sqlText", "SELECT LEVEL AS L FROM DUAL CONNECT BY LEVEL <= :cnt");
        save.put("paramsJson", "[{\"name\":\"cnt\",\"label\":\"건수\",\"type\":\"number\",\"default\":\"3\"}]");
        save.put("maxRowCnt", 5);
        save.put("useYn", "Y");
        Map<String, Object> saved = result(executor.execute("userQueryMng", "save", request(save)));
        assertThat(saved).containsEntry("queryId", "PRD_TOP10").containsEntry("ver", 0L);

        // 상세 — paramsJson·columnsJson·sqlText 까지 그대로(관리자)
        Map<String, Object> def = (Map<String, Object>) result(executor.execute("userQueryMng", "get",
                request(Map.of("queryId", "PRD_TOP10")))).get("def");
        assertThat(def).containsEntry("queryNm", "상위 조회").containsKeys("sqlText", "paramsJson");

        // 할당 — userA·userB 전체 교체
        Map<String, Object> assign = new HashMap<>();
        assign.put("queryId", "PRD_TOP10");
        assign.put("userIdsJson", "[\"userA\",\"userB\"]");
        assertThat(result(executor.execute("userQueryMng", "saveAssign", request(assign))))
                .containsEntry("added", 2).containsEntry("removed", 0);
        List<Map<String, Object>> assigns = (List<Map<String, Object>>) result(executor.execute("userQueryMng",
                "searchAssign", request(Map.of("queryId", "PRD_TOP10")))).get("rows");
        assertThat(assigns).extracting(a -> a.get("userId")).containsExactlyInAnyOrder("userA", "userB");

        // 사용자 myList — userA
        CURRENT_USER.set("userA");
        List<Map<String, Object>> mine = (List<Map<String, Object>>) result(executor.execute("userQuery", "myList",
                request(Map.of()))).get("rows");
        assertThat(mine).extracting(r -> r.get("queryId")).containsExactly("PRD_TOP10");

        // getDef — SQL 칸이 없다
        Map<String, Object> runDef = result(executor.execute("userQuery", "getDef", request(Map.of("queryId", "PRD_TOP10"))));
        assertThat(runDef).containsEntry("maxRowCnt", 5).doesNotContainKey("sqlText");
        // FE 계약 — params[].type 은 소문자(text|number|date|select)
        List<Map<String, Object>> defParams = (List<Map<String, Object>>) runDef.get("params");
        assertThat(defParams).hasSize(1);
        assertThat(defParams.get(0)).containsEntry("name", "cnt").containsEntry("label", "건수").containsEntry("type", "number")
                .containsEntry("required", false)
                .containsEntry("default", "3").doesNotContainKey("defaultValue"); // FE 공용 파서는 default 만 읽는다

        // run — 값 바인딩·행 상한 잘림
        Map<String, Object> run = result(executor.execute("userQuery", "run",
                request(Map.of("queryId", "PRD_TOP10", "paramsJson", "{\"cnt\":\"10\"}"))));
        assertThat(run.get("columns")).isEqualTo(List.of("L"));
        assertThat((List<?>) run.get("rows")).hasSize(5);
        assertThat(run).containsEntry("truncated", true).containsEntry("maxRowCnt", 5);

        // 미할당 사용자 — 같은 문구(할당을 지운 뒤)
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN WHERE USER_ID = 'userB'");
        CURRENT_USER.set("userB");
        CactusResponse denied = executor.execute("userQuery", "getDef", request(Map.of("queryId", "PRD_TOP10")));
        assertThat(denied.getMeta().success()).isFalse();
        assertThat(denied.getMeta().message()).isEqualTo("쿼리를 찾을 수 없습니다");

        // 삭제 — 남은 할당(userA)까지
        Map<String, Object> delete = new HashMap<>();
        delete.put("queryId", "PRD_TOP10");
        delete.put("ver", 0L);
        assertThat(result(executor.execute("userQueryMng", "delete", request(delete))))
                .containsEntry("deleted", 1).containsEntry("assignDeleted", 1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_USRQ_DEF WHERE QUERY_ID = 'PRD_TOP10'", Long.class)).isZero();
    }

    @Test
    @DisplayName("FE 는 숫자 칸(ver·maxRowCnt)을 글자로 보낸다 — OASIS DTO 바인딩이 Long·Integer 로 바꿔 save 갱신·delete 가 통한다")
    void numericParamsAsStringsThroughOasis() {
        Map<String, Object> save = new HashMap<>();
        save.put("queryId", "PRD_STR01");
        save.put("queryNm", "글자 숫자");
        save.put("sqlText", "SELECT 1 AS A FROM DUAL");
        save.put("maxRowCnt", "1000");
        save.put("useYn", "Y");
        assertThat(result(executor.execute("userQueryMng", "save", request(save)))).containsEntry("ver", 0L);

        Map<String, Object> update = new HashMap<>(save);
        update.put("queryNm", "글자 숫자 갱신");
        update.put("maxRowCnt", "2000");
        update.put("ver", "0");
        assertThat(result(executor.execute("userQueryMng", "save", request(update)))).containsEntry("ver", 1L);
        assertThat(jdbc.queryForObject("SELECT MAX_ROW_CNT FROM MCMAPUSER.TB_MCM_USRQ_DEF WHERE QUERY_ID = 'PRD_STR01'", Integer.class))
                .isEqualTo(2000);

        Map<String, Object> delete = new HashMap<>();
        delete.put("queryId", "PRD_STR01");
        delete.put("ver", "1");
        assertThat(result(executor.execute("userQueryMng", "delete", request(delete)))).containsEntry("deleted", 1);
    }

    @Test
    @DisplayName("userQueryMng save 는 쓰기 문·잘못된 maxRowCnt 를 거절하고, previewQuery·searchDepts·searchUserList 도 BPMN 으로 지난다")
    @SuppressWarnings("unchecked")
    void mngGuardsAndLookupsThroughOasis() {
        Map<String, Object> dml = new HashMap<>();
        dml.put("queryId", "PRD_DML01");
        dml.put("queryNm", "쓰기");
        dml.put("sqlText", "UPDATE MCMAPUSER.TB_MCM_USRQ_DEF SET QUERY_NM = 'x'");
        dml.put("maxRowCnt", 1000);
        dml.put("useYn", "Y");
        CactusResponse rejected = executor.execute("userQueryMng", "save", request(dml));
        assertThat(rejected.getMeta().success()).isFalse();
        assertThat(rejected.getMeta().message()).isEqualTo("SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다");

        Map<String, Object> preview = new HashMap<>();
        preview.put("sqlText", "SELECT 1 AS A FROM DUAL");
        assertThat(result(executor.execute("userQueryMng", "previewQuery", request(preview))))
                .containsEntry("columns", List.of("A")).containsEntry("truncated", false);

        List<Map<String, Object>> users = (List<Map<String, Object>>) result(executor.execute("userQueryMng",
                "searchUserList", request(Map.of()))).get("rows");
        assertThat(users).extracting(u -> u.get("userId")).contains("userA", "userB");

        List<Map<String, Object>> depts = (List<Map<String, Object>>) result(executor.execute("userQueryMng",
                "searchDepts", request(Map.of()))).get("depts");
        assertThat(depts).isEmpty(); // 부서 시드는 없다 — 빈 목록도 정상 응답
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(
            basePackageClasses = {UserQueryDefRepository.class, DeptInfoRepository.class},
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                    UserQueryDefRepository.class,
                    UserQueryAssignRepository.class,
                    DeptInfoRepository.class
            }),
            transactionManagerRef = "transactionManager")
    static class Config {

        @Bean(destroyMethod = "close")
        DataSource dataSource() {
            return McmOraTestDb.appDataSource("userq-bpmn");
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            return McmOraTestDb.entityManagerFactory(dataSource, "default",
                    SecUser.class.getName(), DeptInfo.class.getName(),
                    com.dongkuk.dmes.mcm.userq.entity.UserQueryDef.class.getName(),
                    com.dongkuk.dmes.mcm.userq.entity.UserQueryAssign.class.getName());
        }

        /** OASIS 기본 매니저 txBiz = 운영의 primary JPA 매니저 별칭(McmNoticeTestDb 와 같다). */
        @Bean(name = {"transactionManager", "txBiz"})
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        UserQueryStore userQueryStore() {
            return new UserQueryStore();
        }

        @Bean
        WidgetUserContextResolver widgetUserContextResolver() {
            WidgetUserContextResolver resolver = mock(WidgetUserContextResolver.class);
            when(resolver.current()).thenAnswer(invocation -> {
                String userId = CURRENT_USER.get();
                return new WidgetUserContext(userId, userId, "D100", "생산팀", List.of("D100"));
            });
            return resolver;
        }

        @Bean
        WidgetQueryExecutor widgetQueryExecutor(WidgetUserContextResolver resolver, DataSource dataSource) {
            return new WidgetQueryExecutor(mock(WidgetDefRepository.class), resolver,
                    WidgetQueryDataSource.shared(dataSource));
        }

        @Bean(name = "userQueryMngService")
        UserQueryMngService userQueryMngService(UserQueryDefRepository defs, UserQueryAssignRepository assigns,
                                                UserQueryStore store, WidgetQueryExecutor executor,
                                                DeptInfoRepository depts) {
            return new UserQueryMngService(defs, assigns, store, executor, depts);
        }

        @Bean(name = "userQueryService")
        UserQueryService userQueryService(UserQueryDefRepository defs, UserQueryAssignRepository assigns,
                                          UserQueryStore store, WidgetQueryExecutor executor,
                                          WidgetUserContextResolver resolver) {
            return new UserQueryService(defs, assigns, store, executor, resolver);
        }
    }
}
