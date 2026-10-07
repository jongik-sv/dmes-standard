package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.metamodel.EntityType;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.test.context.ActiveProfiles;

/**
 * mdm 엔티티 전체 ↔ Oracle 기준선 V1 대조(oracle-1007 m3). 앱 설정 그대로(application.yml 의
 * {@code preferred_boolean_jdbc_type=TINYINT}·{@code preferred_instant_jdbc_type=TIMESTAMP}) 컨텍스트를
 * {@code spring.jpa.hibernate.ddl-auto=validate} 로 띄운다 — 표·컬럼·형이 하나라도 어긋나면 Hibernate 가 기동을 막아 이 시험이 실패한다
 * (실패 원인은 컨텍스트 적재 오류의 {@code SchemaManagementException} 문구에 있다).
 *
 * <p>스키마는 공용 기반({@link AbstractMdmSharedDbTest})이 JVM 당 한 번 V1 로 migrate 한 MDMAPUSER 다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = "spring.jpa.hibernate.ddl-auto=validate")
@ActiveProfiles("local")
class MdmEntitySchemaValidateOraTest extends AbstractMdmSharedDbTest {

    private static final Logger log = LoggerFactory.getLogger(MdmEntitySchemaValidateOraTest.class);

    @Autowired
    EntityManagerFactory entityManagerFactory;

    @Test
    void 엔티티_전체가_V1_기준선과_validate_로_맞는다() {
        // validate 가 실제로 켜졌고 공통 형 설정이 들어갔는지 — 그래야 컨텍스트가 뜬 것이 대조 통과를 뜻한다.
        assertEquals("validate", String.valueOf(entityManagerFactory.getProperties().get("hibernate.hbm2ddl.auto")));
        assertEquals("TINYINT", String.valueOf(entityManagerFactory.getProperties().get("hibernate.type.preferred_boolean_jdbc_type")));
        assertEquals("TIMESTAMP", String.valueOf(entityManagerFactory.getProperties().get("hibernate.type.preferred_instant_jdbc_type")));

        // mdm 패키지의 @Entity 가 모두 EMF 에 올라 대조됐는지(엔티티 스캔이 빠뜨린 것이 없는지).
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
        Set<String> declared = scanner.findCandidateComponents("com.dongkuk.dmes.mdm").stream()
                .map(BeanDefinition::getBeanClassName)
                .collect(Collectors.toCollection(TreeSet::new));
        Set<String> managed = entityManagerFactory.getMetamodel().getEntities().stream()
                .map(EntityType::getJavaType)
                .map(Class::getName)
                .collect(Collectors.toCollection(TreeSet::new));
        log.info("[validate] mdm @Entity {}개, EMF 엔티티 {}개", declared.size(), managed.size());
        assertTrue(!declared.isEmpty(), "mdm @Entity 를 하나도 찾지 못했다");
        Set<String> missing = new TreeSet<>(declared);
        missing.removeAll(managed);
        assertTrue(missing.isEmpty(), "EMF 에 오르지 않아 validate 되지 않은 mdm 엔티티: " + missing);
    }
}
