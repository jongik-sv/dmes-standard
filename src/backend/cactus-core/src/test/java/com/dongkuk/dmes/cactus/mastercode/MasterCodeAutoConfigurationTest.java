package com.dongkuk.dmes.cactus.mastercode;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * 마스터 코드 자동설정 특성 테스트 — {@link MasterCodeMybatisAutoConfiguration} 의 디코더 등록 조건과
 * {@link MasterCodeJpaAutoConfiguration} 의 고정 바인딩(primary EMF/TxMgr 이름).
 */
class MasterCodeAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MasterCodeMybatisAutoConfiguration.class));

    @Test
    void Repository가_있으면_기본_디코더를_등록한다() {
        runner.withBean(MasterCodeItemRepository.class, () -> mock(MasterCodeItemRepository.class))
                .run(ctx -> {
                    assertThat(ctx).hasBean("defaultMasterCodeDecoder");
                    assertThat(ctx.getBean(MasterCodeDecoder.class)).isInstanceOf(DefaultMasterCodeDecoder.class);
                });
    }

    @Test
    void Repository가_없으면_디코더를_만들지_않는다() {
        runner.run(ctx -> assertThat(ctx).doesNotHaveBean(MasterCodeDecoder.class));
    }

    @Test
    void 소비_모듈_디코더가_있으면_기본_디코더를_만들지_않는다() {
        MasterCodeDecoder own = mock(MasterCodeDecoder.class);
        runner.withBean(MasterCodeItemRepository.class, () -> mock(MasterCodeItemRepository.class))
                .withBean("ownDecoder", MasterCodeDecoder.class, () -> own)
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(MasterCodeDecoder.class);
                    assertThat(ctx.getBean(MasterCodeDecoder.class)).isSameAs(own);
                });
    }

    @Test
    void 디코딩을_끄면_디코더를_만들지_않는다() {
        runner.withBean(MasterCodeItemRepository.class, () -> mock(MasterCodeItemRepository.class))
                .withPropertyValues("cactus.mybatis.master-code-decoding.enabled=false")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(MasterCodeDecoder.class));
    }

    @Test
    void JPA_자동설정은_mastercode_패키지만_스캔하고_primary_EMF와_TxMgr_이름에_묶인다() {
        EnableJpaRepositories repos = MasterCodeJpaAutoConfiguration.class.getAnnotation(EnableJpaRepositories.class);
        EntityScan scan = MasterCodeJpaAutoConfiguration.class.getAnnotation(EntityScan.class);

        assertThat(repos.basePackages()).containsExactly("com.dongkuk.dmes.cactus.mastercode");
        assertThat(repos.entityManagerFactoryRef()).isEqualTo("entityManagerFactory");
        assertThat(repos.transactionManagerRef()).isEqualTo("transactionManager");
        assertThat(scan.basePackages()).containsExactly("com.dongkuk.dmes.cactus.mastercode");
    }

    @Test
    void MasterCodeItemId는_그룹과_항목_코드로_같음을_판단한다() {
        MasterCodeItemId a = new MasterCodeItemId("G", "I");

        assertThat(a).isEqualTo(new MasterCodeItemId("G", "I"));
        assertThat(a.hashCode()).isEqualTo(new MasterCodeItemId("G", "I").hashCode());
        assertThat(a).isNotEqualTo(new MasterCodeItemId("I", "G"));
        assertThat(new MasterCodeItemId()).isEqualTo(new MasterCodeItemId(null, null));
    }
}
