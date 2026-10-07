package com.dongkuk.dmes.mcm.testdb;

import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * mcm-core 의 모든 엔티티가 Oracle 기준선(db/migration/oracle/*&#47;V1__baseline.sql)과 맞는지 Hibernate validate 로 본다
 * (oracle-1007 c1 의 scratch 검증을 시험으로 옮김). 엔티티를 바꾸면 기준선에 새 V 파일을 더해야 이 시험이 지난다.
 */
class EntitySchemaValidateOraTest {

    @Test
    @DisplayName("모든 엔티티가 Oracle 기준선과 맞는다(hbm2ddl validate — 칸 이름·형·길이·표 존재)")
    void entitiesMatchBaseline() {
        try (HikariDataSource ds = McmCoreOraTestDb.appDataSource("validate-entities")) {
            LocalContainerEntityManagerFactoryBean em = McmCoreOraTestDb.entityManagerFactory(ds, "com.dongkuk.dmes.mcm");
            em.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "validate"));
            em.afterPropertiesSet(); // validate 가 어긋나면 여기서 SchemaManagementException
            EntityManagerFactory emf = em.getObject();
            assertThat(emf).isNotNull();
            assertThat(emf.getMetamodel().getEntities()).isNotEmpty();
            em.destroy();
        }
    }
}
