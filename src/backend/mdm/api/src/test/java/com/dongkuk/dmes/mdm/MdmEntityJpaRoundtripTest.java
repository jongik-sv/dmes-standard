package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
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
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
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
class MdmEntityJpaRoundtripTest extends AbstractMdmSharedDbTest {

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
     * 만으로는 "엔티티를 추가해도" 아무것도 깨지지 않는다(mutation check 실측, Build 기록).
     *
     * <p>매핑된 엔티티 "개수"가 아니라 <b>테이블 이름 집합</b>으로 검사한다 — 엔티티 개수 고정은 TSK-05-01·
     * 06-01·07-01·08-01 이 각자 {@code com.dongkuk.dmes.mdm.entity} 에 자기 엔티티를 추가하는 정상 진화와
     * 충돌한다(advisor 재검토). D2 가 실제로 금지하는 것은 "DICT_SEQ·DICT_SYSTEM 두 테이블에 엔티티가
     * 붙는 것"이므로, 그 두 테이블 이름의 부재만 고정하고 5개 업무 테이블의 존재는 별개로 확인한다.
     */
    @Test
    void 관리_엔티티_테이블_집합에_DICT_SEQ_DICT_SYSTEM_이_없고_5개_업무_테이블은_있다() {
        Set<String> managedTableNames = entityManager.getMetamodel().getEntities().stream()
                .map(e -> e.getJavaType().getAnnotation(jakarta.persistence.Table.class))
                .filter(java.util.Objects::nonNull)
                .map(jakarta.persistence.Table::name)
                .collect(Collectors.toSet());
        assertTrue(managedTableNames.containsAll(Set.of(
                "TB_MDM_UNIT", "TB_MDM_TERM", "TB_MDM_DOMAIN", "TB_MDM_COLUMN", "TB_MDM_COLUMN_SYSTEM")));
        assertFalse(managedTableNames.contains("TB_MDM_DICT_SEQ"), "D2 — TB_MDM_DICT_SEQ 는 엔티티를 붙이지 않는다");
        assertFalse(managedTableNames.contains("TB_MDM_DICT_SYSTEM"), "D2 — TB_MDM_DICT_SYSTEM 은 엔티티를 붙이지 않는다");
    }

    /**
     * 불변 규칙 7 가드 — {@code MdmTerm} 은 {@code EMBEDDING}/{@code EMBEDDING_MODEL} <b>칼럼</b>을 매핑하지
     * 않는다. 매핑해도 저장·조회 왕복 자체는 그대로 통과하므로(mutation check 실측) 직접 확인이 필요하다.
     *
     * <p>필드 자바 이름이 아니라 {@code @Column(name=...)} 값으로 검사한다 — 필드명을 {@code vector} 등으로
     * 바꾸고 {@code @Column(name="EMBEDDING")}만 유지하는 변이는 필드 이름 검사로는 잡히지 않는다
     * (advisor 재검토).
     */
    @Test
    void MdmTerm_은_EMBEDDING_EMBEDDING_MODEL_칼럼을_매핑하지_않는다() {
        Set<String> mappedColumnNames = java.util.Arrays.stream(
                        com.dongkuk.dmes.mdm.entity.MdmTerm.class.getDeclaredFields())
                .map(f -> f.getAnnotation(jakarta.persistence.Column.class))
                .filter(java.util.Objects::nonNull)
                .map(jakarta.persistence.Column::name)
                .collect(Collectors.toSet());
        assertFalse(mappedColumnNames.contains("EMBEDDING"), "EMBEDDING 은 네이티브 SQL 로만 다룬다(불변 규칙 7)");
        assertFalse(mappedColumnNames.contains("EMBEDDING_MODEL"), "EMBEDDING_MODEL 은 네이티브 SQL 로만 다룬다(불변 규칙 7)");
    }

    /**
     * #16(naming-dialect-rules.md §3) — {@code CactusAuditEntity.C_AT}(Instant) 가 SQLite 에 실제로
     * 어떤 형식으로 저장되는지(정수 epoch 인지 ISO 텍스트인지) {@code typeof()} 로 직접 관찰한다.
     *
     * <p>mcm {@code SqliteTemporalConverterContributor} 는 {@code LocalDate}/{@code LocalDateTime}
     * 전용 컨버터만 등록하며 {@code Instant} 는 애초에 그 우회 대상이 아니다(코드 확인) — "같은 결함이
     * mdm 에도 재현되는지" 가 아니라, {@code Instant} 자체의 SQLite 저장 형식이 무엇인지를 새로 관찰한다.
     */
    @Test
    void C_AT_의_SQLite_저장_형식을_typeof_로_관찰한다() {
        MdmUnit unit = new MdmUnit("KG-TYPEOF");
        unit.setDimension("MASS");
        unit.setBaseUnit("KG");
        unit.setFactor(new BigDecimal("1"));
        unit.setChgSeq(0L);
        unitRepository.save(unit);
        entityManager.flush();

        // 같은 트랜잭션(같은 커넥션) 안에서 봐야 한다 — dataSource.getConnection() 으로 별도 커넥션을
        // 열면 이 테스트 트랜잭션이 아직 커밋 전이라 그 행을 볼 수 없다(실측: rs.next()==false 로 확인).
        Object[] row = (Object[]) entityManager.createNativeQuery(
                        "SELECT typeof(C_AT), C_AT FROM TB_MDM_UNIT WHERE UNIT_CODE = 'KG-TYPEOF'")
                .getSingleResult();
        String sqliteType = String.valueOf(row[0]);
        Object rawValue = row[1];
        assertNotNull(rawValue, "C_AT 원시 저장값");
        // 관찰한 사실을 그대로 고정한다(design.md D10, naming-dialect-rules.md #16 참고) — Hibernate
        // 커뮤니티 dialect 의 Instant 매핑이 SQLite 에 실제로는 INTEGER(epoch millis)로 저장한다
        // (typeof()=integer). 이 Task 는 이 사실만 기록하고 고치지 않는다 — 네이티브 SQL 로 C_AT 를
        // ISO-8601 텍스트로 다루는 후속 Task 에 인계한다(§8).
        assertEquals("integer", sqliteType, "C_AT SQLite 저장 typeof(): " + rawValue);
    }
}
