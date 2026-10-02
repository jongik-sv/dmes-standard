package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRate;
import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRateId;
import com.dongkuk.dmes.mcm.widget.ext.repository.ExchangeRateRepository;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Properties;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
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
 * {@code TB_MCM_EXCHANGE_RATE} 저장소·upsert(H2 메모리). 저장소 메서드 이름 해석(부팅 시 실패 방지)과
 * 같은 키 고치기·한 번에 같은 키 두 번을 확인한다. 구성은 screenusage 의 최소 JPA 시험 구성을 따른다.
 */
@SpringJUnitConfig(ExchangeRateJpaTest.Config.class)
class ExchangeRateJpaTest {

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = ExchangeRateRepository.class)
    static class Config {

        @Bean
        DataSource dataSource() {
            DriverManagerDataSource ds = new DriverManagerDataSource();
            ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
            ds.setUrl("jdbc:h2:mem:widgetext;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS MCMAPUSER");
            ds.setUsername("sa");
            ds.setPassword("");
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setPackagesToScan("com.dongkuk.dmes.mcm.widget.ext.entity");
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            Properties props = new Properties();
            props.put("hibernate.hbm2ddl.auto", "create-drop");
            em.setJpaProperties(props);
            return em;
        }

        @Bean
        ExchangeRateWriter exchangeRateWriter(ExchangeRateRepository repository) {
            return new ExchangeRateWriter(repository);
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
            return new JpaTransactionManager(entityManagerFactory);
        }
    }

    @Autowired ExchangeRateRepository repository;
    @Autowired ExchangeRateWriter writer;

    @BeforeEach
    void clean() {
        repository.deleteAllInBatch();
    }

    private static ExchangeRatePoint p(int month, int day, String cur, String rate) {
        return new ExchangeRatePoint(LocalDate.of(2026, month, day), cur, new BigDecimal(rate));
    }

    @Test
    @DisplayName("upsert — 없으면 넣고, 같은 (일자·기준·대상) 이면 값·출처만 고친다. 한 번에 같은 키가 두 번이면 뒤 값")
    void upsertInsertsAndUpdates() {
        assertThat(writer.upsert("KRW", "frankfurter", List.of(
                p(9, 30, "USD", "1380.12345678"),
                p(9, 30, "EUR", "1600"),
                p(9, 30, "EUR", "1601")))).isEqualTo(2);

        ExchangeRate eur = repository.findById(new ExchangeRateId("20260930", "KRW", "EUR")).orElseThrow();
        assertThat(eur.getRate()).isEqualByComparingTo("1601");
        assertThat(eur.getSource()).isEqualTo("frankfurter");

        writer.upsert("KRW", "koreaexim", List.of(p(9, 30, "USD", "1381.5")));

        assertThat(repository.count()).isEqualTo(2);
        ExchangeRate usd = repository.findById(new ExchangeRateId("20260930", "KRW", "USD")).orElseThrow();
        assertThat(usd.getRate()).isEqualByComparingTo("1381.5");
        assertThat(usd.getSource()).isEqualTo("koreaexim");
        assertThat(usd.getCreatedAt()).isNotNull();
    }

    @Test
    @DisplayName("기간 조회 — 기준 통화·대상 통화들·[from, to](yyyyMMdd) 만, 날짜 오름차순, 소수 8자리 보존")
    void findsRangeInDateOrder() {
        writer.upsert("KRW", "frankfurter", List.of(
                p(10, 1, "USD", "1385.12345678"),
                p(9, 29, "USD", "1380"),
                p(9, 30, "EUR", "1600"),
                p(9, 30, "JPY", "9.1"),
                p(9, 28, "USD", "1379")));

        List<ExchangeRate> rows = repository.findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
                "KRW", List.of("USD", "EUR"), "20260929", "20261001");

        assertThat(rows).extracting(ExchangeRate::getRateDate, ExchangeRate::getQuoteCur)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("20260929", "USD"),
                        org.assertj.core.groups.Tuple.tuple("20260930", "EUR"),
                        org.assertj.core.groups.Tuple.tuple("20261001", "USD"));
        assertThat(rows.get(2).getRate()).isEqualByComparingTo("1385.12345678");
    }
}
