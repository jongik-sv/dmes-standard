package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmColumnSystem;
import com.dongkuk.dmes.mdm.entity.MdmColumnSystemId;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.entity.MdmUnit;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.dongkuk.dmes.mdm.repository.MdmUnitRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-04-01 design.md §3.3 — {@code ddl-auto: none}(F5) 이라 부팅이 매핑 오류를 잡지 못하므로, 5개
 * 엔티티 각각 최소 1건 저장→조회 왕복을 직접 수행해 칼럼명·타입 매핑이 실제로 맞는지 확인한다.
 *
 * <p>{@code lib} 가 아니라 {@code api} 의 test 소스셋에 둔다 — Flyway 리소스는 {@code api/src/main/resources}
 * 에만 있고 {@code lib} 은 {@code api} 에 의존하지 않는 방향이라 {@code lib/src/test} 에서는 실제 스키마를
 * 만들 수 없다(F6). 모든 조회는 {@code em.flush()+em.clear()} 뒤에 한다 — 1차 캐시가 값을 돌려주면 칼럼·타입
 * 매핑 변이가 초록으로 남기 때문이다. 클래스 단위 {@code @Transactional} 로 묶어 메서드마다 rollback 한다
 * ({@code save()} 가 flush() 와 같은 트랜잭션에 참여하려면 테스트 메서드 자체가 트랜잭션이어야 한다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class MdmEntityJpaRoundtripTest {

    @TempDir
    static Path tempDir;

    @Autowired
    MdmUnitRepository unitRepository;
    @Autowired
    MdmTermRepository termRepository;
    @Autowired
    MdmDomainRepository domainRepository;
    @Autowired
    MdmColumnRepository columnRepository;
    @Autowired
    MdmColumnSystemRepository columnSystemRepository;
    @Autowired
    EntityManager entityManager;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-entity-roundtrip-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @Test
    void MdmUnit_은_지정_PK_로_저장_조회_왕복한다() {
        MdmUnit unit = new MdmUnit("KG-RT");
        unit.setDimension("MASS");
        unit.setBaseUnit("KG");
        unit.setFactor(new BigDecimal("1.5"));
        unit.setChgSeq(0L);
        unitRepository.save(unit);
        entityManager.flush();
        entityManager.clear();

        MdmUnit reloaded = unitRepository.findById("KG-RT").orElseThrow();
        assertEquals("MASS", reloaded.getDimension());
        assertEquals("KG", reloaded.getBaseUnit());
        // FACTOR — SQLite NUMERIC 친화도로 저장 형식이 REAL 로 새어 scale 이 달라질 수 있어 compareTo 로 비교한다.
        assertEquals(0, new BigDecimal("1.5").compareTo(reloaded.getFactor()),
                "FACTOR 왕복 값: " + reloaded.getFactor());
        assertNotNull(reloaded.getCreatedAt(), "CactusAuditListener 가 C_AT 을 항상 채워야 한다(F14)");
        assertEquals(0L, reloaded.getVersion(), "VER 초깃값은 0(F14)");
    }

    @Test
    void MdmTerm_은_IDENTITY_채번_으로_저장_조회_왕복한다() {
        MdmTerm term = new MdmTerm("왕복용어", 1, "정의");
        term.setEngAbbr("RTABR");
        MdmTerm saved = termRepository.save(term);
        entityManager.flush();
        entityManager.clear();

        assertNotNull(saved.getTermId());
        MdmTerm reloaded = termRepository.findById(saved.getTermId()).orElseThrow();
        assertEquals("왕복용어", reloaded.getTermName());
        assertEquals(1, reloaded.getSenseNo());
        assertEquals("정의", reloaded.getDefinition());
        assertEquals("RTABR", reloaded.getEngAbbr());
        assertNotNull(reloaded.getCreatedAt());
    }

    @Test
    void MdmDomain_은_IDENTITY_채번_으로_저장_조회_왕복하고_연관관계_매핑을_쓰지_않는다() {
        MdmDomain domain = new MdmDomain("왕복도메인", "RT_DOMAIN", "QTY", "NUMBER");
        MdmDomain saved = domainRepository.save(domain);
        entityManager.flush();
        entityManager.clear();

        assertNotNull(saved.getDomainId());
        MdmDomain reloaded = domainRepository.findById(saved.getDomainId()).orElseThrow();
        assertEquals("왕복도메인", reloaded.getDomainName());
        assertEquals("QTY", reloaded.getDomainKind());
        assertEquals("NUMBER", reloaded.getDataType());
        // parentDomainId 는 원시 Long 필드다 — MdmDomain 을 참조하는 @ManyToOne 필드가 아니다(불변 규칙 9).
        assertEquals(null, reloaded.getParentDomainId());
    }

    @Test
    void MdmColumn_은_REQUIRED_를_원시_boolean_으로_왕복한다() {
        MdmDomain domain = domainRepository.save(new MdmDomain("컬럼용도메인", "RT_COL_DOMAIN", "TEXT", "STRING"));
        entityManager.flush();

        MdmColumn column = new MdmColumn("왕복컬럼", "RT_PHYS", domain.getDomainId());
        column.setRequired(true);
        MdmColumn saved = columnRepository.save(column);
        entityManager.flush();
        entityManager.clear();

        MdmColumn reloaded = columnRepository.findById(saved.getColumnId()).orElseThrow();
        assertTrue(reloaded.isRequired());
        assertEquals(domain.getDomainId(), reloaded.getDomainId());
        assertEquals("RT_PHYS", reloaded.getPhysName());

        MdmColumn column2 = new MdmColumn("왕복컬럼2", "RT_PHYS2", domain.getDomainId());
        column2.setRequired(false);
        MdmColumn saved2 = columnRepository.save(column2);
        entityManager.flush();
        entityManager.clear();
        assertFalse(columnRepository.findById(saved2.getColumnId()).orElseThrow().isRequired());
    }

    @Test
    void MdmColumnSystem_은_IdClass_복합_PK_로_저장_조회_왕복한다() {
        MdmDomain domain = domainRepository.save(new MdmDomain("전문도메인", "RT_SYS_DOMAIN", "TEXT", "STRING"));
        entityManager.flush();
        MdmColumn column = columnRepository.save(new MdmColumn("전문컬럼", "RT_SYS_PHYS", domain.getDomainId()));
        entityManager.flush();

        MdmColumnSystem columnSystem = new MdmColumnSystem(column.getColumnId(), "ERP", "ERP_PHYS");
        columnSystem.setTransform("UPPER");
        columnSystemRepository.save(columnSystem);
        entityManager.flush();
        entityManager.clear();

        MdmColumnSystemId id = new MdmColumnSystemId(column.getColumnId(), "ERP", "ERP_PHYS");
        Optional<MdmColumnSystem> reloaded = columnSystemRepository.findById(id);
        assertTrue(reloaded.isPresent());
        assertEquals("UPPER", reloaded.get().getTransform());
    }

    /**
     * D2 가드 — {@code TB_MDM_DICT_SEQ}·{@code TB_MDM_DICT_SYSTEM} 은 엔티티를 붙이지 않는다. 왕복 테스트
     * 만으로는 "엔티티를 추가해도" 아무것도 깨지지 않는다(mutation check 실측, Build 기록) — 매핑된 엔티티
     * 집합을 정확히 5개로 고정해 늘어나는 변이를 잡는다.
     */
    @Test
    void 매핑된_엔티티는_정확히_5개다_DICT_SEQ_DICT_SYSTEM_제외() {
        Set<String> entityNames = entityManager.getMetamodel().getEntities().stream()
                .map(e -> e.getJavaType().getSimpleName())
                .filter(name -> !name.startsWith("Sec") && !name.startsWith("Revoked") && !name.startsWith("AuditLog")
                        && !name.startsWith("MasterCode"))
                .collect(Collectors.toSet());
        assertEquals(Set.of("MdmUnit", "MdmTerm", "MdmDomain", "MdmColumn", "MdmColumnSystem"), entityNames,
                "TB_MDM_DICT_SEQ·TB_MDM_DICT_SYSTEM 은 D2 에 따라 엔티티를 붙이지 않는다");
    }

    /**
     * 불변 규칙 7 가드 — {@code MdmTerm} 은 {@code EMBEDDING}/{@code EMBEDDING_MODEL} 을 매핑하지 않는다.
     * 매핑해도 저장·조회 왕복 자체는 그대로 통과하므로(mutation check 실측) 메타모델 속성 이름으로 직접 확인한다.
     */
    @Test
    void MdmTerm_은_EMBEDDING_EMBEDDING_MODEL_을_매핑하지_않는다() {
        Set<String> attributeNames = entityManager.getMetamodel().entity(
                com.dongkuk.dmes.mdm.entity.MdmTerm.class).getAttributes().stream()
                .map(jakarta.persistence.metamodel.Attribute::getName)
                .collect(Collectors.toSet());
        assertFalse(attributeNames.contains("embedding"), "EMBEDDING 은 네이티브 SQL 로만 다룬다(불변 규칙 7)");
        assertFalse(attributeNames.contains("embeddingModel"), "EMBEDDING_MODEL 은 네이티브 SQL 로만 다룬다(불변 규칙 7)");
    }
}
