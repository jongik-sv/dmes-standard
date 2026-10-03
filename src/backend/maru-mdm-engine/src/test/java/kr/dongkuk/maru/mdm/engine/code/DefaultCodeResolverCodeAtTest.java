package kr.dongkuk.maru.mdm.engine.code;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.PROC_CD;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.V1_000;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.V1_001;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
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

    /** 호출 수·넘긴 버전을 센다. {@code code(id)} 는 전체 행, {@code codeAt} 은 기본 구현이 아닌 직접 구현. */
    private static final class Counting implements CodeLookup {
        final CodeLookup delegate;
        int codeCalls;
        final List<BigDecimal> atCalls = new ArrayList<>();

        Counting(CodeRows rows) {
            this.delegate = InMemoryLookups.codeLookup(rows);
        }

        @Override
        public Optional<CodeRows> code(String id) {
            codeCalls++;
            return delegate.code(id);
        }

        @Override
        public Optional<CodeRows> codeAt(String id, BigDecimal ver) {
            atCalls.add(ver);
            return delegate.code(id);
        }
    }

    private static final LocalDateTime AUG = dt("2026-08-01T00:00");

    @Test
    void attr_는_목차_조회_1회와_본문_조회_1회만_쓴다() {
        Counting lookup = new Counting(CodeFixtures.procCd());
        DefaultCodeResolver r = new DefaultCodeResolver(lookup, CodeEffLookup.NONE);
        assertEquals(Optional.empty(), r.attr(PROC_CD, "BASE", "84", AUG, 1)); // 84 는 attr01 이 null
        assertEquals(1, lookup.codeCalls);
        assertEquals(List.of(V1_001), lookup.atCalls);

        Counting member = new Counting(CodeFixtures.procCd());
        new DefaultCodeResolver(member, CodeEffLookup.NONE).isMember(PROC_CD, "BASE", "84", AUG);
        assertEquals(member.codeCalls, lookup.codeCalls, "isMember 와 같은 조회 수");
        assertEquals(member.atCalls.size(), lookup.atCalls.size());
    }

    @Test
    void attr_가_값을_줄_때도_조회는_1회씩이다() {
        Counting lookup = new Counting(CodeFixtures.steel());
        DefaultCodeResolver r = new DefaultCodeResolver(lookup, CodeEffLookup.NONE);
        LocalDateTime t = dt("2026-08-01T00:00");
        assertEquals(Optional.of("KR"), r.attr(CodeFixtures.STEEL, "BASE", "82", t, 1));
        assertEquals(1, lookup.codeCalls);
        assertEquals(1, lookup.atCalls.size());
    }

    @Test
    void attr_색인_적중_경로도_버전을_한_번만_고른다() {
        Counting lookup = new Counting(CodeFixtures.steel());
        List<BigDecimal> effVers = new ArrayList<>();
        CodeEffLookup eff = (id, ver, cate) -> {
            effVers.add(ver);
            return Optional.of(Set.of("82"));
        };
        DefaultCodeResolver r = new DefaultCodeResolver(lookup, eff);
        assertEquals(Optional.of("KR"), r.attr(CodeFixtures.STEEL, "BASE", "82", dt("2026-08-01T00:00"), 1));
        assertEquals(1, lookup.codeCalls);
        assertEquals(List.of(V1_000), effVers);
        assertEquals(List.of(V1_000), lookup.atCalls);
    }

    @Test
    void attr_는_색인에_소속이_없으면_본문을_읽지_않는다() {
        Counting lookup = new Counting(CodeFixtures.steel());
        CodeEffLookup eff = (id, ver, cate) -> Optional.of(Set.of("83"));
        DefaultCodeResolver r = new DefaultCodeResolver(lookup, eff);
        assertEquals(Optional.empty(), r.attr(CodeFixtures.STEEL, "BASE", "82", dt("2026-08-01T00:00"), 1));
        assertEquals(1, lookup.codeCalls);
        assertEquals(List.of(), lookup.atCalls);
    }

    /** {@code code(id)} 가 부를 때마다 다른 버전 목차를 준다 — 두 번째 선택을 하면 1.001 이 새어 나온다. */
    private static final class Drifting implements CodeLookup {
        final CodeRows full = CodeFixtures.procCd();
        int codeCalls;
        final List<BigDecimal> atCalls = new ArrayList<>();

        @Override
        public Optional<CodeRows> code(String id) {
            codeCalls++;
            // 첫 호출은 AUG 가 v1.000, 이후는 v1.001 이 되도록 버전 구간을 옮긴다.
            List<CodeVersionRow> versions = codeCalls == 1
                    ? List.of(new CodeVersionRow(V1_000, "RELEASED", dt("2025-01-01T00:00"), CodeFixtures.OPEN_DT))
                    : List.of(new CodeVersionRow(V1_001, "RELEASED", dt("2025-01-01T00:00"), CodeFixtures.OPEN_DT));
            return Optional.of(new CodeRows(full.header(), versions, List.of(), List.of(), List.of()));
        }

        @Override
        public Optional<CodeRows> codeAt(String id, BigDecimal ver) {
            atCalls.add(ver);
            return Optional.of(full);
        }
    }

    @Test
    void attr_는_두_번째_버전_선택을_하지_않는다() {
        Drifting lookup = new Drifting();
        List<BigDecimal> effVers = new ArrayList<>();
        CodeEffLookup eff = (id, ver, cate) -> {
            effVers.add(ver);
            return Optional.empty();
        };
        DefaultCodeResolver r = new DefaultCodeResolver(lookup, eff);
        // 1.000 기준: 82 는 소속, 84(v1.001 부터) 는 소속 아님. 두 번째 선택이 있었다면 1.001 로 계산돼 달라진다.
        assertEquals(Optional.empty(), r.attr(PROC_CD, "BASE", "82", AUG, 1));
        assertEquals(1, lookup.codeCalls);
        assertEquals(List.of(V1_000), effVers);
        assertEquals(List.of(V1_000), lookup.atCalls);
    }

    @Test
    void attr_가_빈_결과를_주는_경계() {
        Counting lookup = new Counting(CodeFixtures.steel());
        DefaultCodeResolver r = new DefaultCodeResolver(lookup, CodeEffLookup.NONE);
        LocalDateTime t = dt("2026-08-01T00:00");
        // 소속인데 attrs 칸이 null
        assertEquals(Optional.empty(), r.attr(CodeFixtures.STEEL, "BASE", "83", t, 1));
        assertEquals(Optional.empty(), r.attr(CodeFixtures.STEEL, "BASE", "82", t, 2));
        // 소속이 아님
        assertEquals(Optional.empty(), r.attr(CodeFixtures.STEEL, "BASE", "99", t, 1));
        assertEquals(Optional.empty(), r.attr(CodeFixtures.STEEL, "NONE", "82", t, 1));
        // code null
        int before = lookup.codeCalls;
        assertEquals(Optional.empty(), r.attr(CodeFixtures.STEEL, "BASE", null, t, 1));
        assertEquals(before, lookup.codeCalls, "code 가 null 이면 조회하지 않는다");
        assertFalse(lookup.atCalls.isEmpty());
        // 고른 버전 없음(RELEASED 없음) / 코드 없음 — 본문은 읽지 않는다
        Counting noVer = new Counting(CodeFixtures.withAllVersionStatus(CodeFixtures.steel(), "CANCELLED"));
        assertEquals(Optional.empty(),
                new DefaultCodeResolver(noVer, CodeEffLookup.NONE).attr(CodeFixtures.STEEL, "BASE", "82", t, 1));
        assertEquals(1, noVer.codeCalls);
        assertEquals(List.of(), noVer.atCalls);
        assertEquals(Optional.empty(), r.attr("NO_CD", "BASE", "82", t, 1));
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
