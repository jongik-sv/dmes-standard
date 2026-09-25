package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConstId;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeaderId;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItemId;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutConstRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutHeaderRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import jakarta.persistence.EntityManager;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-05-01 design.md §3.3 — {@code ddl-auto: none} 이라 부팅이 매핑 오류를 잡지 못하므로, 5개 엔티티
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
    MdmLayoutItemRepository layoutItemRepository;
    @Autowired
    MdmLayoutHeaderRepository layoutHeaderRepository;
    @Autowired
    MdmLayoutConstRepository layoutConstRepository;
    @Autowired
    EntityManager entityManager;

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

    @Test
    void MdmLayout_은_IDENTITY_채번_으로_저장_조회_왕복하고_연관관계_매핑을_쓰지_않는다() {
        MdmLayout layout = new MdmLayout("MESSAGE", "왕복레이아웃");
        layout.setTotalLength(100);
        layout.setLayoutVersion(3L);
        MdmLayout saved = layoutRepository.save(layout);
        entityManager.flush();
        entityManager.clear();

        assertNotNull(saved.getLayoutId());
        MdmLayout reloaded = layoutRepository.findById(saved.getLayoutId()).orElseThrow();
        assertEquals("MESSAGE", reloaded.getLayoutKind());
        assertEquals("왕복레이아웃", reloaded.getLayoutName());
        assertEquals(100, reloaded.getTotalLength());
        assertEquals(3L, reloaded.getLayoutVersion());
        // eaiCode 는 원시 String 필드다 — TB_MDM_EAI 를 참조하는 연관관계 매핑이 아니다(불변 규칙 9).
        assertEquals(null, reloaded.getEaiCode());
    }

    @Test
    void MdmLayoutItem_은_IdClass_복합_PK_로_저장_조회_왕복한다() {
        MdmLayout layout = layoutRepository.save(new MdmLayout("MESSAGE", "항목용레이아웃"));
        entityManager.flush();

        MdmLayoutItem item = new MdmLayoutItem(layout.getLayoutId(), 1, "DATA");
        item.setOffset(10);
        item.setLength(20);
        item.setDefaultValue("기본값");
        layoutItemRepository.save(item);
        entityManager.flush();
        entityManager.clear();

        MdmLayoutItemId id = new MdmLayoutItemId(layout.getLayoutId(), 1);
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

        MdmLayoutHeader header = new MdmLayoutHeader(messageLayout.getLayoutId(), 1, headerLayout.getLayoutId());
        layoutHeaderRepository.save(header);
        entityManager.flush();
        entityManager.clear();

        MdmLayoutHeaderId id = new MdmLayoutHeaderId(messageLayout.getLayoutId(), 1);
        Optional<MdmLayoutHeader> reloaded = layoutHeaderRepository.findById(id);
        assertTrue(reloaded.isPresent());
        assertEquals(headerLayout.getLayoutId(), reloaded.get().getHeaderLayoutId());
    }

    @Test
    void MdmLayoutConst_는_IdClass_복합_PK_로_저장_조회_왕복한다() {
        MdmLayout messageLayout = layoutRepository.save(new MdmLayout("MESSAGE", "상수용메시지"));
        MdmLayout headerLayout = layoutRepository.save(new MdmLayout("HEADER", "상수용헤더"));
        entityManager.flush();
        MdmLayoutItem headerItem = new MdmLayoutItem(headerLayout.getLayoutId(), 1, "CONST");
        layoutItemRepository.save(headerItem);
        layoutHeaderRepository.save(new MdmLayoutHeader(messageLayout.getLayoutId(), 1, headerLayout.getLayoutId()));
        entityManager.flush();

        MdmLayoutConst layoutConst = new MdmLayoutConst(
                messageLayout.getLayoutId(), headerLayout.getLayoutId(), 1, "B1");
        layoutConstRepository.save(layoutConst);
        entityManager.flush();
        entityManager.clear();

        MdmLayoutConstId id = new MdmLayoutConstId(messageLayout.getLayoutId(), headerLayout.getLayoutId(), 1);
        Optional<MdmLayoutConst> reloaded = layoutConstRepository.findById(id);
        assertTrue(reloaded.isPresent());
        assertEquals("B1", reloaded.get().getConstValue());
    }

    /**
     * 불변 규칙 6 가드 — {@code layoutVersion} 은 {@code @Version}(JPA 낙관적 락)이 아니다(F14·F19).
     * 더티 업데이트 후 {@code layoutVersion} 은 그대로 남고, 감사 {@code VER}(getVersion())은 별도로
     * 오른다(F25) — 둘이 서로 독립임을 확인한다.
     */
    @Test
    void layoutVersion_은_더티_업데이트_후에도_자동으로_증가하지_않고_감사_VER_과_독립이다() {
        MdmLayout layout = new MdmLayout("MESSAGE", "버전용레이아웃");
        layout.setLayoutVersion(5L);
        MdmLayout saved = layoutRepository.save(layout);
        entityManager.flush();
        Long versionBeforeUpdate = saved.getVersion();

        saved.setLayoutName("이름변경");
        entityManager.flush();
        entityManager.clear();

        MdmLayout reloaded = layoutRepository.findById(saved.getLayoutId()).orElseThrow();
        assertEquals(5L, reloaded.getLayoutVersion(), "layoutVersion 은 업무 저장 로직이 올릴 때만 바뀐다(자동 증가 아님)");
        assertNotNull(reloaded.getVersion());
        assertNotEquals(versionBeforeUpdate, reloaded.getVersion(),
                "감사 VER(CactusAuditListener.onPreUpdate)은 더티 업데이트마다 조건 없이 오른다(F25)");
    }
}
