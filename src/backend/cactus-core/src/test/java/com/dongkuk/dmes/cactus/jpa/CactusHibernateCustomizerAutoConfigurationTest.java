package com.dongkuk.dmes.cactus.jpa;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CactusHibernateCustomizerAutoConfiguration} 특성 테스트 — primary EMF 에 넣는 네이밍 전략 선택.
 */
class CactusHibernateCustomizerAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(CactusHibernateCustomizerAutoConfiguration.class));

    private static Map<String, Object> customized(HibernatePropertiesCustomizer c) {
        Map<String, Object> props = new HashMap<>();
        c.customize(props);
        return props;
    }

    @Test
    void 기본은_SnakePhysicalNamingStrategy만_넣는다() {
        runner.run(ctx -> {
            assertThat(ctx).hasBean("cactusSnakeNamingCustomizer");
            Map<String, Object> props = customized(ctx.getBean(HibernatePropertiesCustomizer.class));
            assertThat(props.get("hibernate.physical_naming_strategy"))
                    .isExactlyInstanceOf(SnakePhysicalNamingStrategy.class);
            assertThat(props).doesNotContainKey("hibernate.implicit_naming_strategy");
        });
    }

    @Test
    void table_prefix가_있으면_Prefixed_전략을_넣는다() {
        runner.withPropertyValues("cactus.jpa.table-prefix=tb_mpn_").run(ctx -> {
            Map<String, Object> props = customized(ctx.getBean(HibernatePropertiesCustomizer.class));
            Object physical = props.get("hibernate.physical_naming_strategy");
            assertThat(physical).isExactlyInstanceOf(PrefixedSnakePhysicalNamingStrategy.class);
            assertThat(((PrefixedSnakePhysicalNamingStrategy) physical)
                    .toPhysicalTableName(new org.hibernate.boot.model.naming.Identifier("Item", false), null)
                    .getText()).isEqualTo("tb_mpn_item");
        });
    }

    @Test
    void implicit_naming을_켜면_Implicit_전략도_넣는다() {
        runner.withPropertyValues(
                        "cactus.jpa.implicit-naming.enabled=true",
                        "cactus.jpa.implicit-naming.uk-prefix=UQ_",
                        "cactus.jpa.table-prefix=tb_")
                .run(ctx -> {
                    Map<String, Object> props = customized(ctx.getBean(HibernatePropertiesCustomizer.class));
                    assertThat(props.get("hibernate.implicit_naming_strategy"))
                            .isExactlyInstanceOf(CactusImplicitNamingStrategy.class);
                });
    }

    @Test
    void 같은_customizer는_매번_같은_전략_인스턴스를_넣는다() {
        runner.run(ctx -> {
            HibernatePropertiesCustomizer c = ctx.getBean(HibernatePropertiesCustomizer.class);
            assertThat(customized(c).get("hibernate.physical_naming_strategy"))
                    .isSameAs(customized(c).get("hibernate.physical_naming_strategy"));
        });
    }

    @Test
    void snake_naming을_끄면_customizer를_등록하지_않는다() {
        runner.withPropertyValues("cactus.jpa.snake-naming.enabled=false")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(HibernatePropertiesCustomizer.class));
    }

    @Test
    void 프로퍼티_기본값() {
        CactusJpaProperties p = new CactusJpaProperties();

        assertThat(p.getSnakeNaming().isEnabled()).isTrue();
        assertThat(p.getTablePrefix()).isEmpty();
        assertThat(p.getImplicitNaming().isEnabled()).isFalse();
        assertThat(p.getImplicitNaming().getUkPrefix()).isEqualTo("uk_");
        assertThat(p.getImplicitNaming().getIdxPrefix()).isEqualTo("idx_");
        assertThat(p.getExtras()).isEmpty();

        p.setTablePrefix(null);
        assertThat(p.getTablePrefix()).isEmpty();
    }
}
