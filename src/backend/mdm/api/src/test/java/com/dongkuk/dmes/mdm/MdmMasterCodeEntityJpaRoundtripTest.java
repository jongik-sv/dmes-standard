package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionRow;
import com.dongkuk.dmes.mdm.common.version.VersionRowStore;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeCate;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateId;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItemId;
import com.dongkuk.dmes.mdm.entity.MdmCodeItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeItemId;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import com.dongkuk.dmes.mdm.entity.MdmCodeVerId;
import com.dongkuk.dmes.mdm.repository.MdmCodeCateItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeCateRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeVerRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-06-01 design.md §3.3 — {@code ddl-auto: none} 이라 부팅이 매핑 오류를 다 잡지 못하므로 5개 엔티티 각각
 * 저장→{@code flush()}→{@code clear()}→조회 왕복을 한다({@code MdmLayoutEntityJpaRoundtripTest} 패턴). 1차 캐시가
 * 값을 돌려주면 매핑 변이가 초록으로 남으므로 모든 조회는 flush·clear 뒤에 한다. 클래스 단위 트랜잭션은 메서드마다
 * rollback 된다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class MdmMasterCodeEntityJpaRoundtripTest extends AbstractMdmSharedDbTest {

    private static final BigDecimal V1_000 = new BigDecimal("1.000");
    private static final BigDecimal V1_001 = new BigDecimal("1.001");
    private static final BigDecimal V2_000 = new BigDecimal("2.000");

    @Autowired
    MdmCodeRepository codeRepository;
    @Autowired
    MdmCodeVerRepository verRepository;
    @Autowired
    MdmCodeItemRepository itemRepository;
    @Autowired
    MdmCodeCateRepository cateRepository;
    @Autowired
    MdmCodeCateItemRepository cateItemRepository;
    @Autowired
    VersionRowStore versionRowStore;
    @Autowired
    MdmTemporalBinder temporalBinder;
    @Autowired
    EntityManager entityManager;

    /** 1 — 엔티티 필드 초기값이 DDL 기본값과 같다(Hibernate 는 매핑한 칼럼에 null 을 명시해 DB 기본값을 무력화한다, F27 ①). */
    @Test
    void 기본값을_설정하지_않은_새_엔티티가_DDL_기본값과_같은_값으로_저장된다() {
        codeRepository.save(new MdmCode("DEF_CD", "기본값코드", "MDM"));
        verRepository.save(new MdmCodeVer("DEF_CD", V1_000, "MAJOR"));
        itemRepository.save(new MdmCodeItem("DEF_CD", "A1", V1_000));
        flushAndClear();

        MdmCode code = codeRepository.findById("DEF_CD").orElseThrow();
        assertEquals("CREATED", code.getStatus());
        assertEquals(0, code.getLvlCnt());
        assertEquals("기본값코드", code.getMaruCodeName());
        assertNotNull(code.getCreatedAt(), "CactusAuditListener 가 C_AT 을 채워야 한다");

        MdmCodeVer ver = verRepository.findById(new MdmCodeVerId("DEF_CD", V1_000)).orElseThrow();
        assertEquals("DRAFT", ver.getStatus());
        assertEquals("N", ver.getEmergencyYn());
        assertEquals(0L, ver.getRowVersion());

        MdmCodeItem item = itemRepository.findById(new MdmCodeItemId("DEF_CD", "A1", V1_000)).orElseThrow();
        assertEquals(new BigDecimal("9999.000"), item.getToVer());
    }

    /** 2 — DECIMAL(7,3) 복합키(F26): scale 3 키로 찾고 게터가 scale 3 을 돌려준다. */
    @Test
    void DECIMAL_복합키_엔티티가_scale_3_키로_왕복한다() {
        codeRepository.save(new MdmCode("PROC_CD", "공정코드", "MDM"));
        verRepository.save(new MdmCodeVer("PROC_CD", V1_000, "MAJOR"));
        verRepository.save(new MdmCodeVer("PROC_CD", V1_001, "MINOR"));
        verRepository.save(new MdmCodeVer("PROC_CD", V2_000, "MAJOR"));
        flushAndClear();
        MdmCodeItem first = new MdmCodeItem("PROC_CD", "82", V1_000);
        first.setToVer(V1_001);
        first.setName("열연");
        itemRepository.save(first);
        MdmCodeItem second = new MdmCodeItem("PROC_CD", "82", V1_001);
        second.setName("열연(개정)");
        second.setLvl1("L1");
        second.setAttr10("속성10");
        second.setSeq(3);
        itemRepository.save(second);
        MdmCodeCate base = new MdmCodeCate("PROC_CD", "BASE", V1_000, "REGEX");
        base.setDefExpr(".*");
        base.setDefTarget("CODE");
        cateRepository.save(base);
        cateItemRepository.save(new MdmCodeCateItem("PROC_CD", "MAJOR", "82", V1_000));
        flushAndClear();

        for (BigDecimal v : new BigDecimal[] {V1_000, V1_001, V2_000}) {
            MdmCodeVer ver = verRepository.findById(new MdmCodeVerId("PROC_CD", v)).orElseThrow(() -> new AssertionError(v));
            assertEquals(v, ver.getVer(), "scale 까지 같아야 한다");
        }
        MdmCodeItem reFirst = itemRepository.findById(new MdmCodeItemId("PROC_CD", "82", V1_000)).orElseThrow();
        assertEquals(V1_000, reFirst.getFromVer());
        assertEquals(V1_001, reFirst.getToVer());
        assertEquals("열연", reFirst.getName());
        MdmCodeItem reSecond = itemRepository.findById(new MdmCodeItemId("PROC_CD", "82", V1_001)).orElseThrow();
        assertEquals(V1_001, reSecond.getFromVer());
        assertEquals(new BigDecimal("9999.000"), reSecond.getToVer());
        assertEquals("L1", reSecond.getLvl1());
        assertEquals("속성10", reSecond.getAttr10());
        assertEquals(3, reSecond.getSeq());

        MdmCodeCate reBase = cateRepository.findById(new MdmCodeCateId("PROC_CD", "BASE", V1_000)).orElseThrow();
        assertEquals(V1_000, reBase.getFromVer());
        assertEquals("REGEX", reBase.getDefKind());
        assertEquals(".*", reBase.getDefExpr());
        assertEquals("CODE", reBase.getDefTarget());
        MdmCodeCateItem reCateItem = cateItemRepository.findById(
                new MdmCodeCateItemId("PROC_CD", "MAJOR", "82", V1_000)).orElseThrow();
        assertEquals(V1_000, reCateItem.getFromVer());
        assertEquals(new BigDecimal("9999.000"), reCateItem.getToVer());

        // 규칙표 #17 — Oracle 은 VER 가 NUMBER(7,3) 이라 1.000 도 1.001 도 같은 형이다(SQLite 는 INTEGER·REAL 로 갈렸다).
        Object observed = entityManager.createNativeQuery(
                "SELECT LISTAGG(TO_CHAR(VER), ',') WITHIN GROUP (ORDER BY VER) FROM TB_MDM_CODE_VER "
                        + "WHERE MARU_CODE_ID = 'PROC_CD'").getSingleResult();
        assertEquals("1,1.001,2", String.valueOf(observed), "TB_MDM_CODE_VER.VER 저장값");
    }

    /** 3 — AUD_VER 는 감사 카운터로 오르고, 업무 VER·ROW_VERSION 은 그대로다(ROW_VERSION 은 @Version 아님, 불변 규칙 11·13). */
    @Test
    void MdmCodeVer_수정은_AUD_VER_만_올리고_업무_VER_와_ROW_VERSION_은_그대로다() {
        codeRepository.save(new MdmCode("AUD_CD", "감사코드", "MDM"));
        verRepository.save(new MdmCodeVer("AUD_CD", V1_000, "MAJOR"));
        flushAndClear();
        MdmCodeVer loaded = verRepository.findById(new MdmCodeVerId("AUD_CD", V1_000)).orElseThrow();
        Long auditBefore = loaded.getVersion();
        assertNotNull(auditBefore);

        loaded.setDescription("설명 변경");
        flushAndClear();

        MdmCodeVer reloaded = verRepository.findById(new MdmCodeVerId("AUD_CD", V1_000)).orElseThrow();
        assertEquals("설명 변경", reloaded.getDescription());
        assertEquals(auditBefore + 1, reloaded.getVersion(), "감사 카운터(AUD_VER)는 오른다");
        assertEquals(V1_000, reloaded.getVer(), "업무 VER 는 감사 카운터로 오르지 않는다");
        assertEquals(0L, reloaded.getRowVersion(), "ROW_VERSION 은 엔티티 수정으로 오르지 않는다(@Version 아님)");
        Object audVer = entityManager.createNativeQuery(
                "SELECT AUD_VER FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'AUD_CD'").getSingleResult();
        assertEquals(auditBefore + 1, ((Number) audVer).longValue());
    }

    /** 4 — 엔티티 업무 일시 = 네이티브와 같은 초 단위 TIMESTAMP(6)(D7, 규칙표 #16). 교차 읽기 양방향. */
    @Test
    void 업무_일시는_네이티브와_같은_초_단위_TIMESTAMP_로_저장되고_양방향으로_읽힌다() {
        LocalDateTime applyFrom = LocalDateTime.of(2026, 7, 1, 0, 0, 0, 700_000_000);
        codeRepository.save(new MdmCode("TIME_CD", "시각코드", "MDM"));
        MdmCodeVer ver = new MdmCodeVer("TIME_CD", V1_000, "MAJOR");
        ver.setApplyFrom(applyFrom);
        ver.setApplyTo(VersionConventions.OPEN_END);
        verRepository.save(ver);
        flushAndClear();

        Object[] stored = (Object[]) entityManager.createNativeQuery(
                "SELECT (SELECT DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TB_MDM_CODE_VER' AND COLUMN_NAME = 'APPLY_FROM'), "
                        + "APPLY_FROM, "
                        + "(SELECT DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TB_MDM_CODE_VER' AND COLUMN_NAME = 'APPLY_TO'), "
                        + "APPLY_TO FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'TIME_CD'")
                .getSingleResult();
        // 칼럼이 TIMESTAMP(6) 이라 값은 시각 형으로 읽힌다. 소수 초(700ms)는 엔티티 세터가 잘라 저장한다.
        assertEquals("TIMESTAMP(6)", stored[0], "① APPLY_FROM 저장 타입");
        assertEquals(LocalDateTime.of(2026, 7, 1, 0, 0, 0), temporalBinder.fromDb(stored[1]), "① 저장값은 초 단위");
        assertEquals(temporalBinder.toDb(applyFrom), temporalBinder.fromDb(stored[1]), "① 네이티브 경로와 같다");
        assertEquals("TIMESTAMP(6)", stored[2]);
        assertEquals(VersionConventions.OPEN_END, temporalBinder.fromDb(stored[3]));

        MdmCodeVer reloaded = verRepository.findById(new MdmCodeVerId("TIME_CD", V1_000)).orElseThrow();
        assertEquals(LocalDateTime.of(2026, 7, 1, 0, 0, 0), reloaded.getApplyFrom(), "② 초 절단");
        assertEquals(VersionConventions.OPEN_END, reloaded.getApplyTo());

        // ③ 네이티브로 쓴 행을 엔티티가 읽는다.
        entityManager.createNativeQuery("INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, APPLY_FROM) "
                + "VALUES ('TIME_CD', 2.000, 'MAJOR', TIMESTAMP '2024-01-01 00:00:00')").executeUpdate();
        entityManager.clear();
        assertEquals(LocalDateTime.of(2024, 1, 1, 0, 0),
                verRepository.findById(new MdmCodeVerId("TIME_CD", V2_000)).orElseThrow().getApplyFrom());

        // ④ 엔티티로 쓴 행을 공통 버전 서비스의 네이티브 읽기(fromDb)가 읽는다.
        VersionRow row = versionRowStore.find(new VersionRef(VersionTarget.MASTER_CODE, "TIME_CD", V1_000)).orElseThrow();
        assertEquals(LocalDateTime.of(2026, 7, 1, 0, 0, 0), row.applyFrom());
        assertEquals(VersionConventions.OPEN_END, row.applyTo());
    }

    /** 5 — 부모 FK 대조군: VER 에 없는 FROM_VER 의 코드 행은 저장되지 않는다(불변 규칙 6). */
    @Test
    void 부모_VER_가_없는_코드_행은_flush_에서_거부된다() {
        codeRepository.save(new MdmCode("ORPHAN_CD", "고아코드", "MDM"));
        verRepository.save(new MdmCodeVer("ORPHAN_CD", V1_000, "MAJOR"));
        flushAndClear();
        itemRepository.save(new MdmCodeItem("ORPHAN_CD", "82", new BigDecimal("1.002")));
        assertThrows(PersistenceException.class, entityManager::flush);
    }

    /** 6 — MdmCode 는 LAST_CHG_SEQ 를 매핑하지 않는다(D2): 엔티티 INSERT 뒤 DB 기본값 0 이 남는다. */
    @Test
    void MdmCode_는_LAST_CHG_SEQ_를_쓰지_않아_DB_기본값이_남는다() {
        codeRepository.save(new MdmCode("SEQ_CD", "순번코드", "MDM"));
        flushAndClear();
        Object lastChgSeq = entityManager.createNativeQuery(
                "SELECT LAST_CHG_SEQ FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'SEQ_CD'").getSingleResult();
        assertEquals(0L, ((Number) lastChgSeq).longValue());
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
