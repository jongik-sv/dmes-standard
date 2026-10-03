package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** D-154 — 버전 경로의 엔진 연결(스펙 §5.4). 코드 C 는 {@code MdmMetaServiceVersionedTest.codeRows()}(2.000 에서 TB 소속 B). 시계 = KST 2026-10-03 00:00. */
class MdmDefinitionLookupVersionedTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private FakeMetaFeed feed;
    private MdmMetaService service;
    private MdmDefinitionLookup lookup;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        feed.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock, true);
        lookup = new MdmDefinitionLookup(service);
    }

    private static MdmColumnMeta codeCol(String phys, String maruCodeId, String cateId) {
        return new MdmColumnMeta(phys, phys + " 컬럼", null, phys, null, null, null, "STRING", 10, null, false, null, null, null, null,
                new MdmColumnMeta.DomainRef("8", "코드", "CODE"), null, null, List.of(), new MdmColumnMeta.CodeRefMeta(maruCodeId, cateId),
                null, null, null);
    }

    @Test
    void CODE_도메인_TABLE_카테고리를_목차_본문_색인으로_판정하고_NONE_으로_묶어도_같다() {
        feed.put(MdmTargetType.COLUMN, "TB_COL", codeCol("TB_COL", "C", "TB"));
        for (CodeEffLookup eff : List.of((CodeEffLookup) lookup, CodeEffLookup.NONE)) {
            DomainValidator v = new DefaultDomainValidator(lookup,
                    new MdmEvaluator(new EngineLookups(lookup, lookup, eff, MasterLookup.NONE, FunctionProvider.NONE)));
            assertThat(v.validate("T", "TB_COL", Map.of("TB_COL", "B"), T0).valid()).isTrue();
            assertThat(v.validate("T", "TB_COL", Map.of("TB_COL", "A"), T0).valid()).as("A 는 TB 소속이 아니다").isFalse();
        }
    }

    @Test
    void code_는_목차_행_codeAt_은_본문_행_codes_는_소속_집합이고_빈_값을_주지_않는다() {
        CodeRows toc = lookup.code("C").orElseThrow();
        assertThat(toc.items()).isEmpty();
        assertThat(toc.versions()).hasSize(2);
        CodeRows at = lookup.codeAt("C", new BigDecimal("2")).orElseThrow();
        assertThat(at.versions()).hasSize(1);
        assertThat(at.items()).hasSize(2);
        assertThat(lookup.codes("C", new BigDecimal("2.000"), "TB")).contains(Set.of("B"));
        assertThat(lookup.codes("C", new BigDecimal("2.000"), "NO_SUCH")).contains(Set.of());
        assertThat(lookup.code("NO_CD")).isEmpty();
    }

    @Test
    void 룰_세트_전문은_목차로_버전을_고르고_적용_버전이_없으면_빈_값이다() {
        LocalDateTime b = LocalDateTime.parse("2026-06-01T00:00:00");
        feed.put(MdmTargetType.RULE, "R", List.of(MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), b),
                MdmDefinitionLookupTest.rule("2.000", b, null)));
        feed.put(MdmTargetType.LAYOUT, "42", List.of(new MdmLayoutVersion(new BigDecimal("1.000"), LocalDateTime.parse("2026-01-01T00:00:00"), null,
                List.of(new MdmLayoutVersion.Segment(LocalDateTime.parse("2026-01-01T00:00:00"), b, Map.of("totalLength", 10)),
                        new MdmLayoutVersion.Segment(b, null, Map.of("totalLength", 12))))));

        assertThat(lookup.rule("R", Instant.parse("2026-05-31T14:59:59Z")).orElseThrow().ver()).isEqualByComparingTo("1.000");
        assertThat(lookup.rule("R", Instant.parse("2026-05-31T15:00:00Z")).orElseThrow().ver()).isEqualByComparingTo("2.000");
        assertThat(lookup.rule("R", Instant.parse("2025-01-01T00:00:00Z"))).isEmpty();
        assertThat(lookup.layout("42", Instant.parse("2026-03-01T00:00:00Z")).orElseThrow()).containsEntry("totalLength", 10);
        assertThat(lookup.layout("42", T0).orElseThrow()).containsEntry("totalLength", 12);
    }

    @Test
    void MDM_을_받을_수_없으면_MdmUnavailableException_이다() {
        feed.fetchError = new MdmUnavailableException("MDM 연결 실패");
        assertThatThrownBy(() -> lookup.rule("R", T0)).isInstanceOf(MdmUnavailableException.class);
        assertThatThrownBy(() -> lookup.code("C")).isInstanceOf(MdmUnavailableException.class);
    }
}
