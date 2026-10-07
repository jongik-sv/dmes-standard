package com.dongkuk.dmes.mcm.queryroute;

import com.dongkuk.dmes.cactus.audit.CactusMybatisAuditInterceptor;
import com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor;
import com.dongkuk.dmes.cactus.mybatis.CactusMultiMybatisAutoConfiguration;
import com.dongkuk.dmes.mcm.common.audit.McmSqliteMybatisInterceptor;
import com.dongkuk.dmes.mcm.config.McmMybatisConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 운영 조립 경로 확인 — cactus {@link CactusMultiMybatisAutoConfiguration} 이 만든 sqlSessionFactoryBiz 에 mcm
 * {@link McmMybatisConfig} 가 {@link McmSqliteMybatisInterceptor} 를 붙이는지, 기본 매퍼 위치({@code classpath*:persistence/**})
 * 전체를 읽어도 namespace 가 부딪히지 않는지, 그 팩토리로 {@code MCMAPUSER.} 접두가 있는 매퍼 SQL 이 SQLite 에서 도는지 본다.
 * (동등성 시험 하네스는 인터셉터를 직접 붙이므로 이 조립 경로를 거치지 않는다.)
 */
class McmMybatisConfigWiringTest {

    @TempDir
    static Path tmp;

    @Configuration
    static class SqliteDataSourceConfig {
        @Bean
        DataSource dataSource() {
            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl("jdbc:sqlite:" + tmp.resolve("wiring.db"));
            ds.setPoolName("mcm-mybatis-wiring");
            return ds;
        }
    }

    @Test
    void cactus_팩토리에_SQLite_인터셉터가_붙고_매퍼가_돈다() throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + tmp.resolve("wiring.db"));
             Statement s = c.createStatement()) {
            s.execute("CREATE TABLE VI_MCM_CODE_ACCESS (CODE_ID TEXT, CODE_VAL TEXT, CODE_VAL_MEAN TEXT, CATEGORY_ID TEXT, CATEGORY_NM TEXT)");
            s.execute("INSERT INTO VI_MCM_CODE_ACCESS VALUES ('B029', 'A1', '의미', 'C1', NULL)");
        }

        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(CactusMultiMybatisAutoConfiguration.class))
                .withUserConfiguration(SqliteDataSourceConfig.class, McmMybatisConfig.class)
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    SqlSessionFactory factory = ctx.getBean("sqlSessionFactoryBiz", SqlSessionFactory.class);
                    List<Class<?>> interceptors = factory.getConfiguration().getInterceptors().stream()
                            .<Class<?>>map(Interceptor::getClass).toList();
                    assertThat(interceptors).contains(SqlLoggingInterceptor.class, CactusMybatisAuditInterceptor.class,
                            McmSqliteMybatisInterceptor.class);
                    assertThat(interceptors).filteredOn(McmSqliteMybatisInterceptor.class::equals).hasSize(1);
                    assertThat(factory.getConfiguration().hasStatement("masterCodeSelPop.search")).isTrue();

                    List<Map<String, Object>> rows = new SqlSessionTemplate(factory)
                            .selectList("masterCodeSelPop.search", Map.of("pCodeId", "b029"));
                    assertThat(rows).hasSize(1);
                    assertThat(rows.get(0)).containsEntry("CODE_VAL", "A1").containsEntry("CATEGORY_NM", null);
                });
    }
}
