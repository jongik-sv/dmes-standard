package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutReleaseTimeline;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutReleaseTimeline.ReleasedVersion;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutReleaseTimeline.Segment;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * D-144 3단계 · ADR-0007 D6 — 메타 피드 LAYOUT 의 버전별 합성 구간. 전문 버전 구간을 쌓은 헤더의 RELEASED 버전 경계로 나누고, 구간마다
 * 시작 시각 합성이 그 구간 모든 시각의 {@link LayoutComposer#at} 과 같다. 합성이 같은 이웃 구간은 합치고, LEGACY 는 나누지 않으며,
 * 구간이 빈 버전은 합성하지 않는다. 어느 구간이든 깨지면 예외(호출자가 failed 로).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutReleaseTimelineSqliteTest extends LayoutTestSupport {

    private static final LocalDateTime Y2000 = LocalDateTime.of(2000, 1, 1, 0, 0);
    private static final LocalDateTime JAN1 = LocalDateTime.of(2026, 1, 1, 0, 0);
    private static final LocalDateTime APR1 = LocalDateTime.of(2026, 4, 1, 0, 0);
    private static final LocalDateTime MAY1 = LocalDateTime.of(2026, 5, 1, 0, 0);
    private static final LocalDateTime JUL1 = LocalDateTime.of(2026, 7, 1, 0, 0);
    private static final LocalDateTime OCT1 = LocalDateTime.of(2026, 10, 1, 0, 0);
    private static final LocalDateTime OPEN_END = LocalDateTime.of(9999, 12, 31, 0, 0);

    @Autowired
    LayoutReleaseTimeline timeline;
    @Autowired
    LayoutComposer composer;

    @BeforeEach
    void seed() {
        String ids = "(960001, 960002, 960003, 960004, 960090, 960091, 960092)";
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID IN " + ids);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID IN " + ids);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID IN " + ids);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID IN " + ids);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID IN " + ids);
        layout(960090, "HEADER", "TH", "INUSE");
        layout(960091, "HEADER", "TH2", "CREATED");
        layout(960092, "HEADER", "TH3", "INUSE");
        layout(960001, "MESSAGE", "TM", "INUSE");
        layout(960002, "MESSAGE", "TM2", "INUSE");
        layout(960003, "MESSAGE", "TM3", "INUSE");
        layout(960004, "MESSAGE", "TM4", "INUSE");
        // 헤더 960090: 1.000 [2000, 4/1) 7자, 2.000 [4/1, 열린 끝) 9자, 그리고 2.000 안에 겹쳐 끝나는 낮은 VER 1.001 [4/1, 10/1) —
        // 10/1 은 경계지만 그 앞뒤로 고르는 헤더 버전(2.000)이 같아 합성 구간을 합친다.
        ver(960090, "1.000", "RELEASED", "2000-01-01 00:00:00", "2026-04-01 00:00:00", 7);
        ver(960090, "1.001", "RELEASED", "2026-04-01 00:00:00", "2026-10-01 00:00:00", 8);
        ver(960090, "2.000", "RELEASED", "2026-04-01 00:00:00", "9999-12-31 00:00:00", 9);
        ver(960091, "1.000", "DRAFT", null, null, 3);
        // 전문 960001: 1.000 [1/1, 7/1) — 헤더 경계 4/1 로 두 구간, 2.000 [7/1, 열린 끝) — 10/1 경계는 합쳐 한 구간, 1.500 은 구간이 빈 버전
        ver(960001, "1.000", "RELEASED", "2026-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        ver(960001, "1.500", "RELEASED", "2026-07-01 00:00:00", "2026-07-01 00:00:00", 11);
        ver(960001, "2.000", "RELEASED", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 12);
        ver(960001, "3.000", "DRAFT", null, null, 13);
        for (String v : new String[] {"1.000", "1.500", "2.000", "3.000"}) {
            stack(960001, v, 960090);
        }
        // 전문 960002: 1.000 RELEASED 이지만 쌓은 헤더 960091 에 RELEASED 가 없다 — 깨진 버전
        ver(960002, "1.000", "RELEASED", "2026-01-01 00:00:00", "9999-12-31 00:00:00", 4);
        stack(960002, "1.000", 960091);
        // 전문 960004: 1.000 [1/1, 7/1) 에 헤더 두 개 — 960090(경계 4/1) 위에 960092(1.000 [2000, 5/1) 3자, 2.000 [5/1, 열린 끝) 4자)
        ver(960092, "1.000", "RELEASED", "2000-01-01 00:00:00", "2026-05-01 00:00:00", 3);
        ver(960092, "2.000", "RELEASED", "2026-05-01 00:00:00", "9999-12-31 00:00:00", 4);
        ver(960004, "1.000", "RELEASED", "2026-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        stack(960004, "1.000", 1, 960090);
        stack(960004, "1.000", 2, 960092);
    }

    /** Oracle 은 여러 행 VALUES 가 없어 부모 행을 하나씩 넣는다. */
    private void layout(long id, String kind, String name, String status) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES (?, ?, ?, ?, 0)", id, kind, name,
                status);
    }

    private void ver(long id, String ver, String status, String from, String to, int own) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', ?, ?, ?, ?, ?)", id, new BigDecimal(ver), status, "DRAFT".equals(status) ? "kim" : null,
                from == null ? null : ts(from), to == null ? null : ts(to), own);
    }

    private void stack(long messageId, String ver, long headerId) {
        stack(messageId, ver, 1, headerId);
    }

    private void stack(long messageId, String ver, int seq, long headerId) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (?, ?, ?, ?)",
                messageId, new BigDecimal(ver), seq, headerId);
    }

    @Test
    void 전문_버전_구간을_헤더_버전_경계로_나누고_같은_합성은_합친다() {
        List<ReleasedVersion> versions = timeline.released(960001L);

        assertThat(versions).extracting(ReleasedVersion::ver).extracting(BigDecimal::toPlainString)
                .containsExactly("1.000", "1.500", "2.000");                                 // VER 수 비교 오름차순, DRAFT 없음
        ReleasedVersion v1 = versions.get(0);
        assertThat(v1.segments()).extracting(Segment::applyFrom).containsExactly(JAN1, APR1);
        assertThat(v1.segments()).extracting(Segment::applyTo).containsExactly(APR1, JUL1);
        assertThat(v1.segments()).extracting(s -> s.snapshot().totalLength()).containsExactly(17, 19);
        assertThat(versions.get(1).segments()).as("구간이 빈 버전은 고를 수 없어 합성하지 않는다").isEmpty();
        ReleasedVersion v2 = versions.get(2);
        assertThat(v2.segments()).singleElement().satisfies(s -> {
            assertThat(s.applyFrom()).isEqualTo(JUL1);
            assertThat(s.applyTo()).isEqualTo(OPEN_END);
            assertThat(s.snapshot().totalLength()).isEqualTo(21);
        });
        // 구간 안 어느 시각이든 원장의 시각 T 합성과 같다
        for (ReleasedVersion v : versions) {
            for (Segment s : v.segments()) {
                assertThat(composer.at(960001L, s.applyFrom())).isEqualTo(s.snapshot());
                assertThat(composer.at(960001L, s.applyTo().minusSeconds(1))).isEqualTo(s.snapshot());
            }
        }
        assertThat(composer.at(960001L, OCT1)).isEqualTo(v2.segments().get(0).snapshot());
    }

    /** 쌓은 헤더가 둘이면 두 헤더의 경계를 모두 합친다 — 4/1(960090)·5/1(960092) 로 세 구간. */
    @Test
    void 경계가_다른_헤더_두_개를_쌓으면_두_경계를_모두_나눈다() {
        ReleasedVersion v = timeline.released(960004L).get(0);

        assertThat(v.segments()).extracting(Segment::applyFrom).containsExactly(JAN1, APR1, MAY1);
        assertThat(v.segments()).extracting(Segment::applyTo).containsExactly(APR1, MAY1, JUL1);
        assertThat(v.segments()).extracting(s -> s.snapshot().totalLength()).containsExactly(20, 22, 23);
        for (Segment s : v.segments()) {
            assertThat(composer.at(960004L, s.applyFrom())).isEqualTo(s.snapshot());
            assertThat(composer.at(960004L, s.applyTo().minusSeconds(1))).isEqualTo(s.snapshot());
        }
    }

    @Test
    void LEGACY_버전은_저장된_스냅샷_한_구간이다() {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH, SNAPSHOT_JSON, "
                + "LEGACY_SNAPSHOT_YN) VALUES (960003, 0.500, 'MAJOR', 'RELEASED', TIMESTAMP '2000-01-01 00:00:00', TIMESTAMP '2026-04-01 00:00:00', 0, ?, 'Y')",
                "{\"eaiCode\":null,\"encoding\":null,\"headers\":[],\"items\":[],\"layoutId\":960003,\"layoutName\":\"TM3\","
                        + "\"layoutVersion\":1,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":77}");

        List<ReleasedVersion> versions = timeline.released(960003L);

        assertThat(versions).singleElement().satisfies(v -> assertThat(v.segments()).singleElement().satisfies(s -> {
            assertThat(s.applyFrom()).isEqualTo(Y2000);
            assertThat(s.applyTo()).isEqualTo(APR1);
            assertThat(s.snapshot().totalLength()).isEqualTo(77);
        }));
    }

    @Test
    void 쌓은_헤더에_RELEASED_가_없는_구간이_있으면_예외다() {
        BusinessException e = assertThrows(BusinessException.class, () -> timeline.released(960002L));
        assertThat(e.getMessage()).contains("960091");
    }
}
