package com.dongkuk.dmes.cactus.datasource;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.AbstractBeanDefinition;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.env.MockEnvironment;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link CactusMultiDataSourceAutoConfiguration} 특성 테스트 — extras 마다 등록되는 DataSource 빈 정의·alias·검증.
 *
 * <p>Hikari 직결 경로는 빈을 만들면 풀이 바로 접속을 시도하므로 인스턴스는 만들지 않고 빈 정의만 본다.
 * (cactus-core 시험 클래스패스에 SQLite 드라이버가 없다.)
 */
class CactusMultiDataSourceAutoConfigurationTest {

    private static DefaultListableBeanFactory process(String... props) {
        MockEnvironment env = new MockEnvironment();
        for (String p : props) {
            int eq = p.indexOf('=');
            env.setProperty(p.substring(0, eq), p.substring(eq + 1));
        }
        CactusMultiDataSourceAutoConfiguration cfg = new CactusMultiDataSourceAutoConfiguration();
        cfg.setEnvironment(env);
        DefaultListableBeanFactory registry = new DefaultListableBeanFactory();
        cfg.postProcessBeanDefinitionRegistry(registry);
        return registry;
    }

    @Test
    void 설정이_없으면_아무것도_등록하지_않는다() {
        DefaultListableBeanFactory registry = process();

        assertThat(registry.getBeanDefinitionNames()).isEmpty();
        assertThat(registry.getAliases("dataSource")).isEmpty();
    }

    @Test
    void url_extras는_Hikari_빈을_cactusDataSource_이름과_key_alias로_등록한다() {
        DefaultListableBeanFactory registry = process(
                "cactus.datasource.extras.cmn.url=jdbc:test:cmn",
                "cactus.datasource.extras.if.url=jdbc:test:if");

        assertThat(registry.getBeanDefinitionNames()).containsExactlyInAnyOrder("cactusDataSourceCmn", "cactusDataSourceIf");
        BeanDefinition cmn = registry.getBeanDefinition("cactusDataSourceCmn");
        assertThat(cmn.getBeanClassName()).isEqualTo(HikariDataSource.class.getName());
        assertThat(cmn.isPrimary()).isFalse();
        assertThat(cmn.getDestroyMethodName()).isEqualTo("close");
        assertThat(((AbstractBeanDefinition) cmn).getInstanceSupplier()).isNotNull();
        assertThat(registry.getAliases("cactusDataSourceCmn")).containsExactly("cmn");
        assertThat(registry.getAliases("cactusDataSourceIf")).containsExactly("if");
    }

    @Test
    void jndi_name이_있으면_DataSource_타입으로_등록하고_destroy_메서드를_두지_않는다() {
        DefaultListableBeanFactory registry = process(
                "cactus.datasource.extras.cmn.jndi-name=java:/jdbc/cmn",
                "cactus.datasource.extras.cmn.url=jdbc:ignored");

        BeanDefinition cmn = registry.getBeanDefinition("cactusDataSourceCmn");
        assertThat(cmn.getBeanClassName()).isEqualTo(DataSource.class.getName());
        assertThat(cmn.getDestroyMethodName()).isNull();
        assertThat(cmn.isPrimary()).isFalse();
        assertThat(registry.getAliases("cactusDataSourceCmn")).containsExactly("cmn");
    }

    @Test
    void jndi_name이_공백이면_Hikari_경로로_간다() {
        DefaultListableBeanFactory registry = process(
                "cactus.datasource.extras.cmn.jndi-name= ",
                "cactus.datasource.extras.cmn.url=jdbc:test:cmn");

        assertThat(registry.getBeanDefinition("cactusDataSourceCmn").getBeanClassName())
                .isEqualTo(HikariDataSource.class.getName());
    }

    @Test
    void primary_alias는_dataSource_빈에_alias로_붙는다() {
        DefaultListableBeanFactory registry = process("cactus.datasource.primary-alias=biz");

        assertThat(registry.getAliases("dataSource")).containsExactly("biz");
        assertThat(registry.getBeanDefinitionNames()).isEmpty();
    }

    @Test
    void primary_alias가_공백이면_alias를_붙이지_않는다() {
        DefaultListableBeanFactory registry = process("cactus.datasource.primary-alias= ");

        assertThat(registry.getAliases("dataSource")).isEmpty();
    }

    @Test
    void primary_alias가_extras_key와_같으면_실패한다() {
        assertThatThrownBy(() -> process(
                "cactus.datasource.primary-alias=cmn",
                "cactus.datasource.extras.cmn.url=jdbc:test:cmn"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("primary-alias='cmn' 가 cactus.datasource.extras 의 key 와 충돌");
    }

    @Test
    void extras_key가_스프링_표준_빈_이름이면_실패한다() {
        assertThatThrownBy(() -> process("cactus.datasource.extras.transactionManager.url=jdbc:test:x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Spring Boot 표준 빈 이름과 충돌");
    }

    @Test
    void extras_key가_cactus로_시작하면_실패한다() {
        assertThatThrownBy(() -> process("cactus.datasource.extras.cactusCmn.url=jdbc:test:x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cactus 자체 빈 prefix 와 충돌");
    }

    @Test
    void 대시가_든_key는_첫_글자만_대문자로_바꿔_빈_이름에_그대로_쓴다() {
        DefaultListableBeanFactory registry = process("cactus.datasource.extras.my-db.url=jdbc:test:x");

        assertThat(registry.getBeanDefinitionNames()).containsExactly("cactusDataSourceMy-db");
        assertThat(registry.getAliases("cactusDataSourceMy-db")).containsExactly("my-db");
    }

    @Test
    void 자동설정으로_올리면_extras_빈_정의와_alias가_컨텍스트에_생긴다() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(CactusMultiDataSourceAutoConfiguration.class))
                // Hikari 풀이 접속하지 않도록 모든 빈을 lazy 로 둔다
                .withInitializer(ctx -> ctx.addBeanFactoryPostProcessor(bf -> {
                    for (String n : bf.getBeanDefinitionNames()) {
                        bf.getBeanDefinition(n).setLazyInit(true);
                    }
                }))
                .withPropertyValues(
                        "cactus.datasource.primary-alias=biz",
                        "cactus.datasource.extras.cmn.url=jdbc:test:cmn")
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx.getBeanFactory().containsBeanDefinition("cactusDataSourceCmn")).isTrue();
                    assertThat(ctx.getBeanFactory().getAliases("cactusDataSourceCmn")).containsExactly("cmn");
                    assertThat(ctx.getBeanFactory().getAliases("dataSource")).containsExactly("biz");
                    assertThat(ctx.getBeanFactory().getType("cmn")).isEqualTo(HikariDataSource.class);
                });
    }
}
