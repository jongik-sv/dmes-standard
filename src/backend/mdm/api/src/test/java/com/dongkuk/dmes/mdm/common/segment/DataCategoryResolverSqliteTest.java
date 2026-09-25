package com.dongkuk.dmes.mdm.common.segment;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMdm;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMemberRow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-07-02 design.md §1·§3.1 — {@link DataCategoryResolver} REGEX 매칭 미리보기(열린 항목만, F10·R5), 문법 오류
 * {@code invalid=true}(던지지 않음), {@link DataSegmentRowStore#openMemberCodes} TABLE 소속 건수.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataCategoryResolverSqliteTest {

    private static final String MD = "RESOLV";

    @TempDir
    static Path tempDir;

    @Autowired
    DataCategoryResolver resolver;
    @Autowired
    DataSegmentRowStore rows;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDir.resolve("mdm-dmd-cate-resolver.db"));
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        insertMdm(jdbc, MD, 1, "국가");
        // 열린 KRPUS(lvl1=KR) · 열린 CNSHA(lvl1=CN) · 닫힌 KRINC(lvl1=KR, F10 — 매칭에서 빠져야 한다)
        insertItemRow(jdbc, MD, "KRPUS", "부산", T0.minusDays(5), OPEN, 0, List.of("KR"), List.of());
        insertItemRow(jdbc, MD, "CNSHA", "상하이", T0.minusDays(5), OPEN, 0, List.of("CN"), List.of());
        insertItemRow(jdbc, MD, "KRINC", "인천", T0.minusDays(5), DmdSegmentTestSupport.text(T0.minusDays(1)), 0,
                List.of("KR"), List.of());
        insertMemberRow(jdbc, MD, "MAJOR", "KRPUS", T0.minusDays(5), OPEN);
    }

    @Test
    @Transactional
    void REGEX_매칭은_열린_항목만_대상이다() {
        DataCategoryResolver.Preview preview = resolver.preview(MD, "^KR$", "LVL1");

        assertFalse(preview.invalid());
        assertEquals(List.of("KRPUS"), preview.codes());
        assertEquals(1, preview.count());
    }

    @Test
    void 문법_오류는_던지지_않고_invalid_true_로_응답한다() {
        DataCategoryResolver.Preview preview = resolver.preview(MD, "[", "LVL1");

        assertTrue(preview.invalid());
        assertEquals(List.of(), preview.codes());
    }

    @Test
    @Transactional
    void KEY_대상_매칭() {
        DataCategoryResolver.Preview preview = resolver.preview(MD, "^CNSHA$", "KEY");

        assertFalse(preview.invalid());
        assertEquals(List.of("CNSHA"), preview.codes());
    }

    @Test
    @Transactional
    void openMemberCodes_는_열린_소속만_돌려준다() {
        insertMemberRow(jdbc, MD, "MAJOR", "CNSHA", T0.minusDays(5), DmdSegmentTestSupport.text(T0.minusDays(1)));

        List<String> codes = rows.openMemberCodes(MD, "MAJOR");

        assertEquals(List.of("KRPUS"), codes);
    }
}
