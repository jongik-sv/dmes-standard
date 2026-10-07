package com.dongkuk.dmes.mcm.queryroute;

import com.dongkuk.dmes.cactus.audit.CactusMybatisAuditInterceptor;
import com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor;
import com.dongkuk.dmes.cactus.mybatis.CactusMultiMybatisAutoConfiguration;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 운영 조립 경로 확인 — cactus {@link CactusMultiMybatisAutoConfiguration} 이 만든 sqlSessionFactoryBiz 가 기본 매퍼 위치
 * ({@code classpath*:persistence/**}) 전체를 읽어도 namespace 가 부딪히지 않는지, 그 팩토리로 {@code MCMAPUSER.} 접두가 있는 매퍼
 * SQL 이 Oracle 시험 PDB(Flyway 기준선의 VI_MCM_CODE_ACCESS 뷰)에서 그대로 도는지 본다.
 * (2026-10-07 oracle-1007 — 옛 McmMybatisConfig 의 SQLite 접두 제거 인터셉터 연결은 archive 했다.)
 */
class McmMybatisConfigWiringTest {

    @BeforeAll
    static void seed() {
        McmOraTestDb.resetSchemas();
        try (var ds = McmOraTestDb.appDataSource("mcm-mybatis-wiring-seed")) {
            JdbcTemplate jdbc = new JdbcTemplate(ds);
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_CODE_MASTER (MASTER_CODE, CODE_ID, USE_TP) VALUES ('W1', 'B029', 'Y')");
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_CODE_CATEGORY (MASTER_CODE, CATEGORY_ID, CATEGORY_NM) VALUES ('W1', 'C1', NULL)");
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_CODE_DETAIL (MASTER_CODE, CATEGORY_ID, CODE_VAL, CODE_VAL_MEAN)"
                    + " VALUES ('W1', 'C1', 'A1', '의미')");
        }
    }

    @Configuration
    static class OracleDataSourceConfig {
        @Bean(destroyMethod = "close")
        DataSource dataSource() {
            return McmOraTestDb.appDataSource("mcm-mybatis-wiring");
        }
    }

    @Test
    void cactus_팩토리가_매퍼를_읽고_Oracle_에서_돈다() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(CactusMultiMybatisAutoConfiguration.class))
                .withUserConfiguration(OracleDataSourceConfig.class)
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    SqlSessionFactory factory = ctx.getBean("sqlSessionFactoryBiz", SqlSessionFactory.class);
                    List<Class<?>> interceptors = factory.getConfiguration().getInterceptors().stream()
                            .<Class<?>>map(Interceptor::getClass).toList();
                    assertThat(interceptors).contains(SqlLoggingInterceptor.class, CactusMybatisAuditInterceptor.class);
                    assertThat(factory.getConfiguration().hasStatement("masterCodeSelPop.search")).isTrue();

                    List<Map<String, Object>> rows = new SqlSessionTemplate(factory)
                            .selectList("masterCodeSelPop.search", Map.of("pCodeId", "b029"));
                    assertThat(rows).hasSize(1);
                    assertThat(rows.get(0)).containsEntry("CODE_VAL", "A1").containsEntry("CATEGORY_NM", null);
                });
    }
}
