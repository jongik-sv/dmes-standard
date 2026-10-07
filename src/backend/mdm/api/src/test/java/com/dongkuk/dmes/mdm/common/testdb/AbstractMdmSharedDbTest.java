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
 * <p>DB 는 Oracle 시험 PDB 의 MDMAPUSER 스키마다(oracle-1007 m3, {@link MdmSharedTestDb}). 접속값은 여기 한 곳에서 하니스 값으로 넣는다 —
 * 시험은 모두 {@code @ActiveProfiles("local")} 이지만 이 속성이 local 프로파일 값(레인 개발 PDB {@code L_ORA_MDM})보다 우선한다.
 * 격리는 예전과 같다 — 각 클래스는 "기준선만 있는 빈 스키마" 와 "처음 상태의 테스트 가짜 빈" 에서 시작한다
 * ({@link MdmSharedTestDb#resetForTestClass}). 테스트 DB 자체를 검증하는 {@code *MigrationTest} 는 상속하지 않는다.
 */
public abstract class AbstractMdmSharedDbTest {

    /**
     * 컨텍스트를 띄우기 전에 돈다 — 여기서 JVM 당 한 번 스키마를 clean+migrate 해 두므로 컨텍스트의 Flyway 는 적용할 버전이 없다.
     * 풀은 작게: 인스턴스를 모든 레인이 나눠 쓴다. 상한 2 는 {@code DataSegmentLockSqliteTest} 의 두 연결 동시 수정 때문이고, 쉬는 연결은
     * 두지 않고 쉬는 연결을 10초(Hikari 하한)로 닫게 한다 — 정리 주기(기본 30초) 때문에 실제로는 최대 약 40초 뒤 닫힌다.
     * 캐시된 컨텍스트(최대 4)가 연결을 오래 쥐고 있지 않게.
     */
    @DynamicPropertySource
    static void mdmSharedDatasource(DynamicPropertyRegistry registry) {
        MdmSharedTestDb.ensureMigrated();
        registry.add("spring.datasource.url", MdmSharedTestDb::url);
        registry.add("spring.datasource.username", () -> MdmSharedTestDb.APP_USER);
        registry.add("spring.datasource.password", MdmSharedTestDb::password);
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "2");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "0");
        registry.add("spring.datasource.hikari.idle-timeout", () -> "10000");
    }

    /** 하위 클래스의 {@code @BeforeAll}(시드)보다 먼저 돈다 — JUnit 은 상위 클래스의 {@code @BeforeAll} 을 먼저 부른다. */
    @BeforeAll
    protected static void resetMdmSharedDb(@Autowired ApplicationContext context) {
        MdmSharedTestDb.resetForTestClass(context);
    }
}
