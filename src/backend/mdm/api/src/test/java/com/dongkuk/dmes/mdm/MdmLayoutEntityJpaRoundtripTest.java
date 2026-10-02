package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConstId;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeaderId;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItemId;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVerId;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutConstRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutHeaderRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutVerRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-05-01 design.md §3.3 — {@code ddl-auto: none} 이라 부팅이 매핑 오류를 잡지 못하므로, 레이아웃 6개 엔티티(버전 표 포함)
 * 각각 최소 1건 저장→조회 왕복을 수행한다({@code MdmEntityJpaRoundtripTest} 와 같은 패턴). 복합키
 * ({@code @IdClass}) 왕복(MdmLayoutItem·MdmLayoutHeader·MdmLayoutConst)을 포함한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class MdmLayoutEntityJpaRoundtripTest extends AbstractMdmSharedDbTest {

    @Autowired
    MdmEaiRepository eaiRepository;
    @Autowired
    MdmLayoutRepository layoutRepository;
    @Autowired
    MdmLayoutVerRepository layoutVerRepository;
    @Autowired
    MdmLayoutItemRepository layoutItemRepository;
    @Autowired
    MdmLayoutHeaderRepository layoutHeaderRepository;
    @Autowired
    MdmLayoutConstRepository layoutConstRepository;
    @Autowired
    EntityManager entityManager;
    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void MdmEai_는_지정_PK_로_저장_조회_왕복한다() {
        MdmEai eai = new MdmEai("EAI-RT", "왕복EAI", "EUC-KR");
        eai.setPadRule("숫자 왼쪽 0");
        eaiRepository.save(eai);
        entityManager.flush();
        entityManager.clear();

        MdmEai reloaded = eaiRepository.findById("EAI-RT").orElseThrow();
        assertEquals("왕복EAI", reloaded.getEaiName());
        assertEquals("EUC-KR", reloaded.getEncoding());
        assertEquals("숫자 왼쪽 0", reloaded.getPadRule());
        assertNotNull(reloaded.getCreatedAt(), "CactusAuditListener 가 C_AT 을 항상 채워야 한다(F14)");
    }

    private static final BigDecimal V1 = new BigDecimal("1.000");

    private void saveVer(Long layoutId, BigDecimal ver) {
        layoutVerRepository.save(new MdmLayoutVer(layoutId, ver, VersionKind.MAJOR, "kim"));
        entityManager.flush();
    }

    @Test
    void MdmLayout_은_IDENTITY_채번_으로_저장_조회_왕복하고_상태는_CREATED_다() {
        MdmLayout saved = layoutRepository.save(new MdmLayout("MESSAGE", "왕복레이아웃"));
        entityManager.flush();
        entityManager.clear();

        assertNotNull(saved.getLayoutId());
        MdmLayout reloaded = layoutRepository.findById(saved.getLayoutId()).orElseThrow();
        assertEquals("MESSAGE", reloaded.getLayoutKind());
        assertEquals("왕복레이아웃", reloaded.getLayoutName());
        assertEquals("CREATED", reloaded.getStatus());
    }

    @Test
    void MdmLayoutItem_은_IdClass_복합_PK_로_저장_조회_왕복한다() {
        MdmLayout layout = layoutRepository.save(new MdmLayout("MESSAGE", "항목용레이아웃"));
        entityManager.flush();
        saveVer(layout.getLayoutId(), V1);

        MdmLayoutItem item = new MdmLayoutItem(layout.getLayoutId(), V1, 1, "DATA");
        item.setOffset(10);
        item.setLength(20);
        item.setDefaultValue("기본값");
        layoutItemRepository.save(item);
        entityManager.flush();
        entityManager.clear();

        MdmLayoutItemId id = new MdmLayoutItemId(layout.getLayoutId(), V1, 1);
        Optional<MdmLayoutItem> reloaded = layoutItemRepository.findById(id);
        assertTrue(reloaded.isPresent());
        assertEquals(10, reloaded.get().getOffset());
        assertEquals(20, reloaded.get().getLength());
        assertEquals("기본값", reloaded.get().getDefaultValue());
    }

    @Test
    void MdmLayoutHeader_는_IdClass_복합_PK_로_저장_조회_왕복한다() {
        MdmLayout messageLayout = layoutRepository.save(new MdmLayout("MESSAGE", "부착용메시지"));
        MdmLayout headerLayout = layoutRepository.save(new MdmLayout("HEADER", "부착용헤더"));
        entityManager.flush();
        saveVer(messageLayout.getLayoutId(), V1);

        layoutHeaderRepository.save(new MdmLayoutHeader(messageLayout.getLayoutId(), V1, 1, headerLayout.getLayoutId()));
        entityManager.flush();
        entityManager.clear();

        Optional<MdmLayoutHeader> reloaded = layoutHeaderRepository.findById(
                new MdmLayoutHeaderId(messageLayout.getLayoutId(), V1, 1));
        assertTrue(reloaded.isPresent());
        assertEquals(headerLayout.getLayoutId(), reloaded.get().getHeaderLayoutId());
        assertThat(reloaded.get().getVer()).isEqualByComparingTo("1.000");
    }

    @Test
    void MdmLayoutConst_는_헤더_항목_물리명을_키로_저장_조회_왕복한다() {
        MdmLayout messageLayout = layoutRepository.save(new MdmLayout("MESSAGE", "상수용메시지"));
        MdmLayout headerLayout = layoutRepository.save(new MdmLayout("HEADER", "상수용헤더"));
        entityManager.flush();
        saveVer(messageLayout.getLayoutId(), V1);
        saveVer(headerLayout.getLayoutId(), V1);
        layoutItemRepository.save(new MdmLayoutItem(headerLayout.getLayoutId(), V1, 1, "CONST"));
        layoutHeaderRepository.save(new MdmLayoutHeader(messageLayout.getLayoutId(), V1, 1, headerLayout.getLayoutId()));
        entityManager.flush();

        layoutConstRepository.save(new MdmLayoutConst(
                messageLayout.getLayoutId(), V1, headerLayout.getLayoutId(), "SND_FAC_TP", "B1"));
        entityManager.flush();
        entityManager.clear();

        Optional<MdmLayoutConst> reloaded = layoutConstRepository.findById(new MdmLayoutConstId(
                messageLayout.getLayoutId(), V1, headerLayout.getLayoutId(), "SND_FAC_TP"));
        assertTrue(reloaded.isPresent());
        assertEquals("B1", reloaded.get().getConstValue());
        assertEquals("SND_FAC_TP", reloaded.get().getHeaderColumnPhys());
    }

    @Test
    void minorLayoutVersionRoundTripsWithRowsKeyedByVersion() {
        MdmLayout layout = layoutRepository.saveAndFlush(new MdmLayout("MESSAGE", "엔티티 왕복"));
        assertThat(layout.getStatus()).isEqualTo("CREATED");
        Long id = layout.getLayoutId();
        MdmLayoutVer v = new MdmLayoutVer(id, new BigDecimal("1.001"), VersionKind.MINOR, "kim");
        v.setBaseVer(new BigDecimal("1.000"));
        v.setOwnLength(20);
        layoutVerRepository.saveAndFlush(v);
        MdmLayoutItem item = new MdmLayoutItem(id, new BigDecimal("1.001"), 1, "FILLER");
        item.setFillerLength(20);
        item.setLength(20);
        layoutItemRepository.saveAndFlush(item);
        entityManager.clear();

        MdmLayoutVer read = layoutVerRepository.findById(new MdmLayoutVerId(id, new BigDecimal("1.001"))).orElseThrow();
        assertThat(read.getVer()).isEqualByComparingTo("1.001");
        assertThat(read.getVer().scale()).isEqualTo(3);
        assertThat(read.getVerKind()).isEqualTo(VersionKind.MINOR);
        assertThat(read.isDraft()).isTrue();
        assertThat(read.getOwnLength()).isEqualTo(20);
        assertThat(read.getVersion()).isEqualTo(0L); // 감사 카운터는 AUD_VER
        assertThat(layoutItemRepository.findById(new MdmLayoutItemId(id, new BigDecimal("1.001"), 1))).isPresent();
        assertThat(layoutItemRepository.findById(new MdmLayoutItemId(id, new BigDecimal("1.000"), 1))).isEmpty();
    }

    /** STATUS 는 updatable = false — 낡은 엔티티 저장이 공통 엔진이 올린 INUSE 를 CREATED 로 되돌리지 않는다. */
    @Test
    void 레이아웃_상태는_엔티티_더티_저장으로_바뀌지_않는다() {
        MdmLayout saved = layoutRepository.saveAndFlush(new MdmLayout("MESSAGE", "상태용레이아웃"));
        jdbcTemplate.update("UPDATE TB_MDM_LAYOUT SET STATUS = 'INUSE' WHERE LAYOUT_ID = ?", saved.getLayoutId());
        entityManager.clear();

        MdmLayout stale = layoutRepository.findById(saved.getLayoutId()).orElseThrow();
        stale.setLayoutName("이름변경");
        entityManager.flush();
        entityManager.clear();

        assertEquals("INUSE", layoutRepository.findById(saved.getLayoutId()).orElseThrow().getStatus());
        assertEquals("이름변경", layoutRepository.findById(saved.getLayoutId()).orElseThrow().getLayoutName());
    }
}
