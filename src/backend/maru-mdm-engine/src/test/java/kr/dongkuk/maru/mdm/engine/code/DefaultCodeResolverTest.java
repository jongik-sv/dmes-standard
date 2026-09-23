package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.PROC_CD;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.SEQ_CD;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.STEEL;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.V1_000;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.V1_001;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeResolver.CodeListEntry;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvFileSource;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * TSK-03-02 design.md §3.2·§6.10 — 04 마루 코드 해석(버전 선택·버전 소급·카테고리 소급·REGEX/TABLE, 04:670-735).
 * 수용 기준 3: 04 판정 표가 {@code sql/04-code-exists.sql} 결과와 같다.
 */
class DefaultCodeResolverTest {

    private static DefaultCodeResolver resolver(CodeRows... rows) {
        return new DefaultCodeResolver(InMemoryLookups.codeLookup(rows), CodeEffLookup.NONE);
    }

    private static final DefaultCodeResolver PROC = resolver(CodeFixtures.procCd());

    @ParameterizedTest(name = "{0} {1} → {2}")
    @CsvFileSource(resources = "/kr/dongkuk/maru/mdm/engine/code/04-code-exists-expected.csv", numLinesToSkip = 1)
    void 원천04_판정_표와_같다(LocalDateTime baseDt, String code, boolean expected) {
        assertEquals(expected, PROC.isMember(PROC_CD, "COATING", code, baseDt));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource(delimiter = '|', value = {
            "2024-06-01T00:00|82",
            "2025-03-01T00:00|82",
            "2026-07-15T00:00|82,84",
            "2026-09-10T00:00|82,83,84"})
    void 원천04_목록_열과_같다(LocalDateTime baseDt, String expected) {
        List<String> codes = PROC.codeList(PROC_CD, "COATING", baseDt).stream().map(CodeListEntry::code).toList();
        assertEquals(List.of(expected.split(",")), codes);
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
            "2024-06-01T00:00:00, 1.000",
            "2024-12-31T23:59:59, 1.000",
            "2025-01-01T00:00:00, 1.000",
            "2026-06-30T23:59:59, 1.000",
            "2026-07-01T00:00:00, 1.001",
            "2026-08-31T23:59:59, 1.001",
            "2026-09-01T00:00:00, 1.002",
            "2030-01-01T00:00:00, 1.002"})
    void 버전_선택(LocalDateTime baseDt, BigDecimal expected) {
        BigDecimal actual = PROC.selectVersion(PROC_CD, baseDt).orElseThrow();
        assertEquals(0, expected.compareTo(actual), "고른 버전 " + actual);
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({"2026-08-31T23:59:59, false", "2026-09-01T00:00:00, true"})
    void apply_from_경계의_카테고리_소속(LocalDateTime baseDt, boolean expected) {
        assertEquals(expected, PROC.isMember(PROC_CD, "COATING", "83", baseDt));
    }

    @Test
    void CANCELLED_버전은_고르지_않는다() {
        DefaultCodeResolver r = resolver(CodeFixtures.withVersionStatus(CodeFixtures.procCd(), V1_001, "CANCELLED"));
        assertEquals(0, V1_000.compareTo(r.selectVersion(PROC_CD, dt("2026-07-15T00:00")).orElseThrow()));
    }

    @Test
    void RELEASED_가_없으면_빈_값이고_false_다() {
        DefaultCodeResolver r = resolver(CodeFixtures.withAllVersionStatus(CodeFixtures.procCd(), "DRAFT"));
        assertAll(
                () -> assertEquals(Optional.empty(), r.selectVersion(PROC_CD, dt("2026-09-10T00:00"))),
                () -> assertFalse(r.isMember(PROC_CD, "BASE", "82", dt("2026-09-10T00:00"))));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({"2025-03-01T00:00:00, true", "2026-07-15T00:00:00, false"})
    void v1_000_에만_있다가_닫힌_카테고리(LocalDateTime baseDt, boolean expected) {
        DefaultCodeResolver r = resolver(CodeFixtures.withCategory(CodeFixtures.procCd(),
                new CodeCateRow("OLD", V1_000, V1_001, "REGEX", "8[0-9]", "CODE")));
        assertEquals(expected, r.isMember(PROC_CD, "OLD", "82", baseDt));
    }

    @ParameterizedTest(name = "{0} {1} → {2}")
    @CsvSource({
            "CODE_8X, 82, true",
            "CODE_8, 82, false",
            "LVL2_KS3, 82, true",
            "ATTR01_KR, 82, true",
            "ATTR01_ANY, 83, false"})
    void REGEX_는_def_target_칸에_전체_일치다(String cate, String code, boolean expected) {
        assertEquals(expected, resolver(CodeFixtures.steel()).isMember(STEEL, cate, code, dt("2026-09-10T00:00")));
    }

    @Test
    void BASE_해석은_그_버전의_코드_전체다() {
        assertAll(
                () -> assertEquals(Set.of("81", "82", "83"), PROC.effectiveCodes(PROC_CD, V1_000, "BASE")),
                () -> assertEquals(Set.of("81", "82", "83", "84"), PROC.effectiveCodes(PROC_CD, V1_001, "BASE")));
    }

    @Test
    void 카테고리가_비면_BASE_다() {
        LocalDateTime at = dt("2026-09-10T00:00");
        assertAll(
                () -> assertTrue(PROC.isMember(PROC_CD, "BASE", "81", at)),
                () -> assertEquals(PROC.isMember(PROC_CD, "BASE", "81", at), PROC.isMember(PROC_CD, null, "81", at)),
                () -> assertEquals(PROC.isMember(PROC_CD, "BASE", "81", at), PROC.isMember(PROC_CD, "", "81", at)));
    }

    @Test
    void CodeEffLookup_집합이_있으면_그것을_쓴다() {
        CodeEffLookup eff = (id, ver, cate) -> Optional.of(Set.of("81"));
        DefaultCodeResolver r = new DefaultCodeResolver(InMemoryLookups.codeLookup(CodeFixtures.procCd()), eff);
        assertTrue(r.isMember(PROC_CD, "COATING", "81", dt("2026-09-10T00:00")));
    }

    @Test
    void CodeEffLookup_의_빈_집합은_소속_없음이다() {
        CodeEffLookup eff = (id, ver, cate) -> Optional.of(Set.of());
        DefaultCodeResolver r = new DefaultCodeResolver(InMemoryLookups.codeLookup(CodeFixtures.procCd()), eff);
        assertFalse(r.isMember(PROC_CD, "COATING", "82", dt("2026-09-10T00:00")));
    }

    @Test
    void attr_는_소속일_때만_돌려준다() {
        DefaultCodeResolver r = resolver(CodeFixtures.steel());
        LocalDateTime at = dt("2026-09-10T00:00");
        assertAll(
                () -> assertEquals(Optional.of("KR"), r.attr(STEEL, "CODE_8X", "82", at, 1)),
                () -> assertEquals(Optional.empty(), r.attr(STEEL, "CODE_8", "82", at, 1)));
    }

    @Test
    void CODE_LIST_는_seq_다음_code_순이다() {
        List<CodeListEntry> list = resolver(CodeFixtures.seqCd()).codeList(SEQ_CD, "BASE", dt("2026-09-10T00:00"));
        assertAll(
                () -> assertEquals(List.of("C", "D", "A", "B", "E"), list.stream().map(CodeListEntry::code).toList()),
                () -> assertEquals(new CodeListEntry("B", "나", "ㄴ", null), list.get(3)));
    }

    @Test
    void DEPRECATED_마루_코드의_CODE_LIST_는_빈_목록이다() {
        DefaultCodeResolver r = resolver(CodeFixtures.withHeaderStatus(CodeFixtures.procCd(), "DEPRECATED"));
        assertEquals(List.of(), r.codeList(PROC_CD, "BASE", dt("2026-09-10T00:00")));
    }

    @Test
    void effectiveCodes_는_CodeEffLookup_을_보지_않는다() {
        CodeEffLookup eff = (id, ver, cate) -> Optional.of(Set.of("81"));
        DefaultCodeResolver r = new DefaultCodeResolver(InMemoryLookups.codeLookup(CodeFixtures.procCd()), eff);
        assertEquals(Set.of("82", "84"), r.effectiveCodes(PROC_CD, V1_001, "COATING"));
    }
}
