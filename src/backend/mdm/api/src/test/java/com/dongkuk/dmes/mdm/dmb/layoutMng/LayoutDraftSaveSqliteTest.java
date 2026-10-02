package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 3단계 — 저장은 내 DRAFT 의 행에만, 자동 +1(I15) 없음, 헤더 저장은 전문을 다시 계산하지 않는다(I18 폐지). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutDraftSaveSqliteTest extends LayoutServiceTestSupport {

    @Autowired
    LayoutComposer composer;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    /** MdmErrors 의 코드는 message 가 아니라 첫 detail 에 있다(message 는 기본 문구로 시작 — TSK-04-04 I25). */
    private static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    @Test
    void registrationCreatesParentAndFirstMajorDraftOwnedByMe() {
        M201 m = m201();
        // m201() 은 release 하기 전 상태를 확인할 수 없으므로 새 전문을 하나 더 등록한다
        Map<String, Object> out = layoutService.save(layoutReq(uniq("새 전문 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        assertEquals("1.000", out.get("ver"));
        assertEquals(0L, ((Number) out.get("rowVersion")).longValue());
        assertEquals("CREATED", layoutRow(id).get("STATUS"));
        assertThat(versionRows(id)).singleElement().satisfies(r -> {
            assertThat(r.get("STATUS")).isEqualTo("DRAFT");
            assertThat(r.get("OWNER_ID")).isEqualTo(KIM);
            assertThat(((Number) r.get("OWN_LENGTH")).intValue()).isEqualTo(57);
        });
        // 본문 오프셋은 본문 기준 상대값으로 저장한다(헤더 합 130 을 더하지 않는다)
        assertThat(column(itemRows(id, "1"), "OFFSET")).containsExactly(0, 20, 28, 32);
        assertEquals(187, ((Number) out.get("totalLength")).intValue());
    }

    @Test
    void savingDraftAgainBumpsRowVersionAndDoesNotCreateAVersion() {
        M201 m = m201();
        Map<String, Object> first = layoutService.save(layoutReq(uniq("저장 반복 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) first.get("layoutId")).longValue();
        Map<String, Object> second = layoutService.save(layoutReq("저장 반복 이름 바꿈", m.eai(), r -> {
            r.setLayoutId(id);
            r.setVer("1.000");
            r.setRowVersion(0L);
        }), List.of(headerRow(m.l110())), List.of(), m201Items());
        assertEquals(1L, ((Number) second.get("rowVersion")).longValue());
        assertThat(versionRows(id)).hasSize(1);
    }

    @Test
    void releasedVersionOtherOwnerAndStaleRowVersionAreRejected() {
        M201 m = m201();
        BusinessException released = rejected(() -> layoutService.save(layoutReq("확정본 저장", m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer("1.000");
            r.setRowVersion(rowVersion(m.message(), "1.000"));
        }), List.of(headerRow(m.l110())), List.of(), m201Items()));
        assertThat(code(released)).isEqualTo("MDM002");

        Map<String, Object> draft = layoutService.save(layoutReq(uniq("남의 DRAFT "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) draft.get("layoutId")).longValue();
        user.set("lee", Set.of(MdmRoles.STEWARD));
        BusinessException notOwner = rejected(() -> layoutService.save(layoutReq("남의 DRAFT", m.eai(), r -> {
            r.setLayoutId(id);
            r.setVer("1.000");
            r.setRowVersion(0L);
        }), List.of(headerRow(m.l110())), List.of(), m201Items()));
        assertThat(code(notOwner)).isEqualTo("MDM003");
        user.set(KIM, Set.of(MdmRoles.STEWARD));
        BusinessException stale = rejected(() -> layoutService.save(layoutReq("남의 DRAFT", m.eai(), r -> {
            r.setLayoutId(id);
            r.setVer("1.000");
            r.setRowVersion(7L);
        }), List.of(headerRow(m.l110())), List.of(), m201Items()));
        assertThat(code(stale)).isEqualTo("MDM001");
    }

    @Test
    void headerDraftSaveDoesNotTouchMessages() {
        M201 m = m201();
        List<Map<String, Object>> before = itemRows(m.message(), "1");
        // 헤더 새 DRAFT 를 만들 수단(Task 6 새 버전) 전이므로 DRAFT 를 JDBC 로 복사해 만든다
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, OWN_LENGTH) "
                + "VALUES (?, 2, 'MAJOR', 'DRAFT', 1, ?, 30)", m.l110(), KIM);
        List<Map<String, Object>> longer = l110Items();
        longer.set(5, filler(8));
        Map<String, Object> out = headerService.save(headerReq("L2 구간 헤더 길이 바꿈", r -> {
            r.setLayoutId(m.l110());
            r.setVer("2.000");
            r.setRowVersion(0L);
        }), numbered(longer));
        assertThat(out).doesNotContainKeys("recalculated", "versioned", "droppedOverrides");
        assertThat(itemRows(m.message(), "1")).isEqualTo(before);
        assertThat(versionRows(m.message())).hasSize(1);
    }

    @Test
    void eaiEncodingChangeIsRefusedWhileMessagesUseIt() {
        M201 m = m201();
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, OWN_LENGTH) "
                + "VALUES (?, 2, 'MAJOR', 'DRAFT', 1, ?, 100)", m.l100(), KIM);
        BusinessException e = rejected(() -> headerService.save(headerReq("GLUE 공통 헤더", r -> {
            r.setLayoutId(m.l100());
            r.setVer("2.000");
            r.setRowVersion(0L);
            r.setEaiCode(m.eai());
            r.setEncoding("UTF-8");
        }), l100Items()));
        assertThat(e.getMessage()).contains("L11").contains(m.eai());
    }

    @Test
    void headerDraftClaimingAnEaiDoesNotChangeOthersMessageSaves() {
        M201 m = m201();
        // 새 헤더 DRAFT 가 같은 EAI 를 주장한다 — 연결은 버전 행에만, 공유 EAI 행은 그대로(Review Focus 6)
        long claimer = saveHeader(headerReq(uniq("주장 헤더 "), r -> r.setEaiCode(m.eai())), l110Items());
        assertThat(jdbc.queryForObject("SELECT EAI_CODE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1", String.class, claimer))
                .isEqualTo(m.eai());
        assertThat(composer.eaiHeaderAt(m.eai(), DmeTestSupport.NOW)).contains(m.l100()); // DRAFT 주장은 표준 헤더를 바꾸지 않는다
        // 같은 EAI 의 전문 저장은 받아들여지고 구성은 지금 표준 헤더(L100)다
        Map<String, Object> out = layoutService.save(layoutReq(uniq("영향 없는 전문 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        assertThat(jdbc.queryForList("SELECT HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? ORDER BY SEQ", Long.class, id))
                .containsExactly(m.l100(), m.l110());
        // 헤더를 미래 시각에 확정하면 그 시각부터 표준 헤더지만, 지금 시각 저장은 아직 적용 전인 그 헤더를 끼우지 않는다
        release(claimer, "1.000", "2026-12-01 00:00:00");
        assertThat(composer.eaiHeaderAt(m.eai(), DmeTestSupport.NOW)).contains(m.l100());
        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2026, 12, 1, 0, 0, 0))).contains(claimer);
        Map<String, Object> again = layoutService.save(layoutReq(uniq("예약 뒤 전문 "), m.eai(), r -> {}),
                List.of(headerRow(m.l100()), headerRow(m.l110())), List.of(), m201Items());
        long id2 = ((Number) again.get("layoutId")).longValue();
        assertThat(jdbc.queryForList("SELECT HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? ORDER BY SEQ", Long.class, id2))
                .containsExactly(m.l100(), m.l110());
    }
}
