package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.PROC_CD;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.V1_000;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.V1_001;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;

/** D-154(결정 P7) — 해석기는 버전 선택·DEPRECATED 에만 {@code code(id)} 를, items·카테고리 계산에는 {@code codeAt(id, ver)} 를 쓴다. */
class DefaultCodeResolverCodeAtTest {

    /** {@code code(id)} 는 목차(헤더·버전)만, {@code codeAt(id, ver)} 는 전체 행을 준다 — 해석기가 items 를 {@code code(id)} 에서 읽으면 판정이 틀린다. */
    private static final class TocAndAt implements CodeLookup {
        final CodeRows full;
        final List<BigDecimal> atCalls = new ArrayList<>();

        TocAndAt(CodeRows full) {
            this.full = full;
        }

        @Override
        public Optional<CodeRows> code(String id) {
            return Optional.of(new CodeRows(full.header(), full.versions(), List.of(), List.of(), List.of()));
        }

        @Override
        public Optional<CodeRows> codeAt(String id, BigDecimal ver) {
            atCalls.add(ver);
            return Optional.of(full);
        }
    }

    @Test
    void 해석기는_items_와_카테고리를_codeAt_으로_읽고_고른_버전을_넘긴다() {
        CodeRows full = CodeFixtures.procCd();
        TocAndAt split = new TocAndAt(full);
        DefaultCodeResolver viaAt = new DefaultCodeResolver(split, CodeEffLookup.NONE);
        DefaultCodeResolver reference = new DefaultCodeResolver(InMemoryLookups.codeLookup(full), CodeEffLookup.NONE);
        List<LocalDateTime> times = List.of(dt("2024-01-01T00:00"), dt("2026-08-01T00:00"), dt("2026-10-01T00:00"));
        List<String> cates = Arrays.asList(null, "BASE", "COATING", "NONE");
        List<String> codes = Arrays.asList("81", "82", "83", "84", "99", null);
        for (LocalDateTime t : times) {
            assertEquals(reference.selectVersion(PROC_CD, t), viaAt.selectVersion(PROC_CD, t));
            for (String cate : cates) {
                assertEquals(reference.codeList(PROC_CD, cate, t), viaAt.codeList(PROC_CD, cate, t), cate + " " + t);
                for (String code : codes) {
                    assertEquals(reference.isMember(PROC_CD, cate, code, t), viaAt.isMember(PROC_CD, cate, code, t));
                    assertEquals(reference.attr(PROC_CD, cate, code, t, 1), viaAt.attr(PROC_CD, cate, code, t, 1));
                }
            }
        }
        assertTrue(viaAt.isMember(PROC_CD, "COATING", "84", dt("2026-08-01T00:00")));
        assertTrue(split.atCalls.contains(V1_001), "고른 버전(1.001)으로 codeAt 을 부른다: " + split.atCalls);
    }

    @Test
    void effectiveCodes_도_미리_계산한_집합을_먼저_보고_없는_코드는_빈_집합이다() {
        CodeEffLookup eff = (id, ver, cate) -> Optional.of(Set.of("ZZ"));
        DefaultCodeResolver r = new DefaultCodeResolver(InMemoryLookups.codeLookup(CodeFixtures.procCd()), eff);
        assertEquals(Set.of("ZZ"), r.effectiveCodes(PROC_CD, V1_001, "COATING"));
        assertEquals(Set.of(), r.effectiveCodes("NO_CD", V1_001, "COATING"));
    }

    @Test
    void codeAt_기본_구현은_code_와_같은_행이다() {
        CodeLookup l = InMemoryLookups.codeLookup(CodeFixtures.procCd());
        assertSame(l.code(PROC_CD).orElseThrow(), l.codeAt(PROC_CD, V1_000).orElseThrow());
    }
}
