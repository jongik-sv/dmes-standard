package com.dongkuk.dmes.mdm.common.testdb;

import org.junit.jupiter.api.BeforeAll;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * 공유 테스트 DB 기반 클래스 — Spring 테스트 컨텍스트를 테스트 클래스 사이에 재사용하게 한다(docs/dflow-team/perf-audit-report.md P2).
 *
 * <p>예전에는 클래스마다 {@code @TempDir} + 자기 {@code @DynamicPropertySource} 로 새 SQLite 파일을 가리켰다. 메서드가 클래스마다
 * 달라 TestContext 캐시 키가 전부 달랐고, 클래스마다 컨텍스트(Hibernate·Hikari·Flyway)를 새로 띄웠다(mdm/api 93개 중 75개).
 * 이 클래스를 상속하면 {@code @DynamicPropertySource} 가 이 한 벌이 되므로, 나머지 설정({@code @SpringBootTest}·{@code @ActiveProfiles}·
 * {@code @Import}·속성)이 같은 클래스끼리 컨텍스트 하나를 나눠 쓴다.
 *
 * <p>격리는 예전과 같다 — 각 클래스는 "방금 마이그레이션한 새 DB" 와 "처음 상태의 테스트 가짜 빈" 에서 시작한다
 * ({@link MdmSharedTestDb#resetForTestClass}). 테스트 DB 자체를 검증하는 {@code *MigrationTest} 는 상속하지 않는다.
 */
public abstract class AbstractMdmSharedDbTest {

    @DynamicPropertySource
    static void mdmSharedDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MdmSharedTestDb::url);
    }

    /** 하위 클래스의 {@code @BeforeAll}(시드)보다 먼저 돈다 — JUnit 은 상위 클래스의 {@code @BeforeAll} 을 먼저 부른다. */
    @BeforeAll
    protected static void resetMdmSharedDb(@Autowired ApplicationContext context) {
        MdmSharedTestDb.resetForTestClass(context);
    }
}
