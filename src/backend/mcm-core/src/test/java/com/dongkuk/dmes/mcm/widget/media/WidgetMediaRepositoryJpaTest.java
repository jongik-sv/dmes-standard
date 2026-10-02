package com.dongkuk.dmes.mcm.widget.media;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.widget.media.entity.WidgetMedia;
import com.dongkuk.dmes.mcm.widget.media.repository.WidgetMediaRepository;
import jakarta.persistence.EntityManagerFactory;
import java.util.Properties;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * {@code TB_MCM_WIDGET_MEDIA} 매핑 확인 — H2 메모리(MCMAPUSER 스키마)에 저장·조회, 감사 컬럼 자동 채움.
 * 구성은 {@code ScreenUsageJpaTestConfig}·{@code WidgetJpaTestConfig} 방식(최소 EMF·저장소만).
 */
@SpringJUnitConfig(WidgetMediaRepositoryJpaTest.Config.class)
class WidgetMediaRepositoryJpaTest {

    @Autowired WidgetMediaRepository repository;

    @Test
    @DisplayName("메타 행을 저장·조회한다(FILE_SIZE 는 int 범위를 넘는 값도 그대로)")
    void roundTrip() {
        WidgetMedia m = new WidgetMedia();
        m.setFileId("0123456789abcdef0123456789abcdef");
        m.setOrigNm("사진 1.png");
        m.setContentType("video/mp4");
        m.setFileSize(3_000_000_000L);
        repository.saveAndFlush(m);

        WidgetMedia found = repository.findById("0123456789abcdef0123456789abcdef").orElseThrow();
        assertThat(found.getOrigNm()).isEqualTo("사진 1.png");
        assertThat(found.getContentType()).isEqualTo("video/mp4");
        assertThat(found.getFileSize()).isEqualTo(3_000_000_000L);
        assertThat(found.getCreatedAt()).isNotNull();
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = WidgetMediaRepository.class)
    static class Config {

        @Bean
        DataSource dataSource() {
            DriverManagerDataSource ds = new DriverManagerDataSource();
            ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
            ds.setUrl("jdbc:h2:mem:widgetmedia;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS MCMAPUSER");
            ds.setUsername("sa");
            ds.setPassword("");
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setPackagesToScan("com.dongkuk.dmes.mcm.widget.media.entity");
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            Properties props = new Properties();
            props.put("hibernate.hbm2ddl.auto", "create-drop");
            em.setJpaProperties(props);
            return em;
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
            return new JpaTransactionManager(entityManagerFactory);
        }
    }
}
