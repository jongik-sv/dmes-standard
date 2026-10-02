package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutKey;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 3단계 K1 — 전문 버전 T + 헤더 버전 T 합성, [from, to) 경계, RELEASED 없는 헤더는 오류(스펙 §8). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutComposerSqliteTest extends LayoutTestSupport {

    @Autowired
    LayoutComposer composer;
    @Autowired
    LayoutVersionStore store;
    @Autowired
    LayoutQueries queries;

    private static final LocalDateTime JUL1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);

    @BeforeEach
    void seed() {
        dictionary();
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID IN (9001, 9002)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID IN (9001, 9002)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID IN (9001, 9002, 9100, 9101)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID IN (9001, 9002, 9100, 9101)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID IN (9001, 9002, 9100, 9101)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES "
                + "(9100, 'HEADER', 'H', 'INUSE', 0), (9101, 'HEADER', 'H2', 'CREATED', 0), "
                + "(9001, 'MESSAGE', 'M', 'INUSE', 0), (9002, 'MESSAGE', 'M2', 'CREATED', 0)");
        ver(9100, "1.000", "RELEASED", "2026-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        ver(9100, "2.000", "RELEASED", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 14);
        ver(9101, "1.000", "DRAFT", null, null, 6);
        ver(9001, "1.000", "RELEASED", "2026-01-01 00:00:00", "9999-12-31 00:00:00", 20);
        ver(9002, "1.000", "DRAFT", null, null, 20);
        item(9100, "1.000", 1, "CONST", "SND_FAC_TP", "B0", null, 0, 4);
        item(9100, "1.000", 2, "FILLER", null, null, 6, 4, 6);
        item(9100, "2.000", 1, "FILLER", null, null, 10, 0, 10);
        item(9100, "2.000", 2, "CONST", "SND_FAC_TP", "B0", null, 10, 4);
        item(9101, "1.000", 1, "FILLER", null, null, 6, 0, 6);
        item(9001, "1.000", 1, "FILLER", null, null, 20, 0, 20);
        item(9002, "1.000", 1, "FILLER", null, null, 20, 0, 20);
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9001, 1.000, 1, 9100)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9002, 1.000, 1, 9101)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, VER, HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS, CONST_VALUE) "
                + "VALUES (9001, 1.000, 9100, 'SND_FAC_TP', 'B9')");
    }

    private void ver(long id, String ver, String status, String from, String to, int own) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', ?, ?, ?, ?, ?)", id, new BigDecimal(ver), status, "DRAFT".equals(status) ? "kim" : null,
                from, to, own);
    }

    private void item(long id, String ver, int seq, String kind, String phys, String dflt, Integer filler, int offset, int length) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, COLUMN_PHYS, DEFAULT_VALUE, FILLER_LENGTH, `OFFSET`, `LENGTH`) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, new BigDecimal(ver), seq, kind, phys, dflt, filler, offset, length);
    }

    @Test
    void headerVersionFollowsTimeWhileMessageVersionStays() {
        MdmLayoutSnapshot before = composer.at(9001L, JUL1.minusSeconds(1));
        assertThat(before.layoutVersion()).isEqualByComparingTo("1.000");
        assertThat(before.totalLength()).isEqualTo(30);
        assertThat(before.headers().get(0).headerVersion()).isEqualByComparingTo("1.000");
        assertThat(before.items().get(0).offset()).isEqualTo(10);
        assertThat(before.headers().get(0).items().get(0).overrideValue()).isEqualTo("B9");

        MdmLayoutSnapshot after = composer.at(9001L, JUL1);
        assertThat(after.layoutVersion()).isEqualByComparingTo("1.000");
        assertThat(after.totalLength()).isEqualTo(34);
        assertThat(after.headers().get(0).headerVersion()).isEqualByComparingTo("2.000");
        assertThat(after.items().get(0).offset()).isEqualTo(14);
        // 재정의는 물리명으로 짝지어져 헤더 v2 에서 SEQ 2 로 옮긴 CONST 항목에 붙는다
        assertThat(after.headers().get(0).items().get(1).overrideValue()).isEqualTo("B9");
    }

    @Test
    void noReleasedMessageOrHeaderIsAnErrorNotZeroLength() {
        BusinessException noMessage = assertThrows(BusinessException.class,
                () -> composer.at(9001L, LocalDateTime.of(2025, 12, 31, 0, 0)));
        assertThat(noMessage.getMessage()).contains("9001").contains("2025-12-31 00:00:00");
        BusinessException noHeader = assertThrows(BusinessException.class,
                () -> composer.compose(9002L, new BigDecimal("1.000"), JUL1));
        assertThat(noHeader.getMessage()).contains("9101").contains("2026-07-01 00:00:00");
    }

    @Test
    void pinnedHeaderVersionOverridesTimeResolution() {
        var c = composer.composeDetailed(9001L, new BigDecimal("1.000"), JUL1.minusDays(1), Map.of(9100L, new BigDecimal("2.000")));
        assertThat(c.snapshot().totalLength()).isEqualTo(34);
        assertThat(c.orphans()).isEmpty();
    }

    @Test
    void legacySnapshotVersionIsReturnedAsStored() {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH, SNAPSHOT_JSON, "
                + "LEGACY_SNAPSHOT_YN) VALUES (9001, 0.500, 'MAJOR', 'RELEASED', '2025-01-01 00:00:00', '2026-01-01 00:00:00', 0, ?, 'Y')",
                "{\"eaiCode\":null,\"encoding\":null,\"headers\":[],\"items\":[],\"layoutId\":9001,\"layoutName\":\"M\","
                        + "\"layoutVersion\":1,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":77}");
        assertThat(composer.at(9001L, LocalDateTime.of(2025, 6, 1, 0, 0)).totalLength()).isEqualTo(77);
    }

    /**
     * SQLite 는 1.000 을 INTEGER, 1.001 을 REAL 로 저장한다(Task 3 검토 ⚠️2). minor 버전 행을 JDBC 로 넣고 JPQL(단건 {@code VER = :ver}·
     * 묶음 Java 키)·네이티브 CAST 로 읽어 {@link VersionNumbers#same} 으로 맞는지, 그 버전으로 합성되는지 고정한다.
     */
    @Test
    void minorVersionStoredAsRealIsFoundByJpqlNativeCastAndComposer() {
        ver(9001, "1.001", "DRAFT", null, null, 24);
        item(9001, "1.001", 1, "FILLER", null, null, 24, 0, 24);
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9001, ?, 1, 9100)",
                new BigDecimal("1.001"));
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, VER, HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS, CONST_VALUE) "
                + "VALUES (9001, ?, 9100, 'SND_FAC_TP', 'B7')", new BigDecimal("1.001"));
        assertThat(jdbc.queryForObject("SELECT typeof(VER) FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 9001 AND VER = ?", String.class,
                new BigDecimal("1.001"))).isEqualTo("real");
        assertThat(jdbc.queryForList("SELECT CAST(VER AS VARCHAR(40)) FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = 9001", String.class)
                .stream().map(BigDecimal::new).filter(v -> VersionNumbers.same(v, new BigDecimal("1.001"))).count()).isEqualTo(1);

        BigDecimal minor = new BigDecimal("1.001");
        assertThat(store.versions(9001L)).extracting(v -> VersionNumbers.plain(v.getVer())).contains("1.001", "1.000");
        assertThat(store.find(9001L, minor)).isPresent();
        assertThat(queries.itemsOf(9001L, minor)).singleElement().satisfies(i -> assertThat(i.getLength()).isEqualTo(24));
        assertThat(queries.itemsOf(9001L, new BigDecimal("1.000"))).singleElement().satisfies(i -> assertThat(i.getLength()).isEqualTo(20));
        assertThat(queries.headersOf(9001L, minor)).hasSize(1);
        assertThat(queries.constsOf(9001L, minor)).singleElement().satisfies(c -> assertThat(c.getConstValue()).isEqualTo("B7"));
        Map<LayoutKey, ?> batch = queries.itemsOf(List.of(new LayoutKey(9001L, minor), new LayoutKey(9001L, new BigDecimal("1"))));
        assertThat(batch).containsKeys(new LayoutKey(9001L, new BigDecimal("1.0010")), new LayoutKey(9001L, new BigDecimal("1.000")));

        MdmLayoutSnapshot s = composer.compose(9001L, minor, JUL1);
        assertThat(s.layoutVersion()).isEqualByComparingTo("1.001");
        assertThat(s.totalLength()).isEqualTo(14 + 24);
        assertThat(s.headers().get(0).items().get(1).overrideValue()).isEqualTo("B7");
    }
}
