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
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
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
    void 목차에_없는_버전의_본문_행과_소속은_빈_값이_아니라_받을_수_없음이다() {
        lookup.code("C");

        assertThatThrownBy(() -> lookup.codeAt("C", new BigDecimal("2.001"))).as("DRAFT 2.001 은 목차에 없다")
                .isInstanceOf(MdmUnavailableException.class);
        assertThatThrownBy(() -> lookup.codes("C", new BigDecimal("2.001"), "TB")).isInstanceOf(MdmUnavailableException.class);
    }

    @Test
    void 엔진이_옛_목차로_고른_버전이_그새_확정_취소되면_소속은_빈_값이_아니라_받을_수_없음이다() {
        lookup.code("C"); // 목차(1.000·2.000) + current 2.000 본문 — 1.000 본문은 없다
        feed.put(MdmTargetType.CODE, "C", withStatus(MdmMetaServiceVersionedTest.codeRows(), "1.000", "CANCELLED"));

        assertThatThrownBy(() -> lookup.codes("C", new BigDecimal("1.000"), "BASE")).isInstanceOf(MdmUnavailableException.class);
        assertThat(feed.bodyCalls.get()).as("본문 NOT_RELEASED → 목차 다시 받기 → 그 버전 없음").isEqualTo(1);
        assertThat(feed.tocCalls.get()).isEqualTo(2);
    }

    private static CodeRows withStatus(CodeRows rows, String ver, String status) {
        return new CodeRows(rows.header(), rows.versions().stream()
                .map(v -> v.ver().compareTo(new BigDecimal(ver)) == 0
                        ? new CodeVersionRow(v.ver(), status, v.applyFrom(), v.applyTo()) : v)
                .toList(), rows.items(), rows.categories(), rows.cateItems());
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

    // ---- fu4 — 기준 시각(evalTs)을 받는 공개 미리 받기. 과거 시각 = KST 2026-03-01 09:00(코드 C 의 1.000 [01-01, 07-01)), 지금(T0)은 2.000.

    private static final Instant PAST = Instant.parse("2026-03-01T00:00:00Z");
    private static final MdmBodyKey C_V1 = new MdmBodyKey("C", "1.000");

    private DomainValidator generalValidator() {
        return new DefaultDomainValidator(lookup,
                new MdmEvaluator(new EngineLookups(lookup, lookup, lookup, MasterLookup.NONE, FunctionProvider.NONE)));
    }

    @Test
    void prefetchColumns_는_과거_evalTs_본문을_미리_받아_이후_평가와_조회가_MDM_을_더_부르지_않는다() {
        feed.put(MdmTargetType.COLUMN, "BASE_COL", codeCol("BASE_COL", "C", "BASE"));

        lookup.prefetchColumns(List.of("BASE_COL"), PAST);

        assertThat(feed.tocAts).as("컬럼은 목차 없는 값이라 코드 C 의 목차만 과거 시각으로, 응답 current 로 그 시각 본문이 온다")
                .containsExactly(LocalDateTime.parse("2026-03-01T09:00:00"));
        assertThat(feed.tocKeys).containsExactly(List.of("C"));
        assertThat(feed.bodyCalls.get()).as("current 가 과거 시각 버전이라 본문 요청은 없다").isZero();
        int toc = feed.tocCalls.get();
        int body = feed.bodyCalls.get();

        assertThat(lookup.codeAt("C", new BigDecimal("1.000")).orElseThrow().versions()).hasSize(1);
        assertThat(lookup.codes("C", new BigDecimal("1.000"), "BASE")).isNotNull();

        assertThat(feed.tocCalls.get()).isEqualTo(toc);
        assertThat(feed.bodyCalls.get()).isEqualTo(body);
    }

    @Test
    void prefetchColumns_뒤_과거_evalTs_평가는_평가_스레드에서_본문을_받지_않는다() {
        feed.put(MdmTargetType.COLUMN, "BASE_COL", codeCol("BASE_COL", "C", "BASE"));
        DomainValidator v = generalValidator();
        lookup.prefetchColumns(List.of("BASE_COL"), PAST);
        lookup.column("T", "BASE_COL"); // 컬럼 정의는 호출자 스레드에서(지금 시각 본문 2.000 도 여기서)
        int toc = feed.tocCalls.get();
        int body = feed.bodyCalls.get();

        assertThat(v.validate("T", "BASE_COL", Map.of("BASE_COL", "A"), PAST).valid()).as("평가가 코드 도메인(1.000 의 A)까지 갔다").isTrue();

        assertThat(feed.tocCalls.get()).isEqualTo(toc);
        assertThat(feed.bodyCalls.get()).isEqualTo(body);
    }

    @Test
    void 미리_받기_없이_과거_evalTs_로_평가하면_평가_중에_그_시각_본문을_받는다_현재_동작_고정() {
        feed.put(MdmTargetType.COLUMN, "BASE_COL", codeCol("BASE_COL", "C", "BASE"));
        DomainValidator v = generalValidator();
        lookup.column("T", "BASE_COL"); // 지금 시각 본문만
        assertThat(feed.bodyKeys.stream().flatMap(List::stream)).doesNotContain(C_V1);

        v.validate("T", "BASE_COL", Map.of("BASE_COL", "A"), PAST);

        assertThat(feed.bodyKeys.stream().flatMap(List::stream)).as("평가 스레드에서 받았다").contains(C_V1);
    }

    @Test
    void prefetchCodes_는_여러_코드를_목차_한_번_본문_한_번으로_묶어_그_시각_본문을_받는다() {
        CodeRows c = MdmMetaServiceVersionedTest.codeRows();
        feed.put(MdmTargetType.CODE, "D", new CodeRows(new kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader("D", "INUSE"), c.versions(),
                c.items(), c.categories(), c.cateItems()));

        feed.omitCurrent = true; // 본문 요청 경로를 강제 — 목차 한 번 + 본문 한 번으로 묶이는지 본다

        lookup.prefetchCodes(List.of("C", "D", "C"), PAST);

        assertThat(feed.tocCalls.get()).isEqualTo(1);
        assertThat(feed.tocKeys.get(0)).containsExactly("C", "D");
        assertThat(feed.bodyCalls.get()).isEqualTo(1);
        assertThat(feed.bodyKeys.get(0)).containsExactlyInAnyOrder(C_V1, new MdmBodyKey("D", "1.000"));
        lookup.codeAt("C", new BigDecimal("1.000"));
        lookup.codeAt("D", new BigDecimal("1.000"));
        assertThat(feed.bodyCalls.get()).as("이어진 조회는 캐시").isEqualTo(1);
    }

    @Test
    void prefetchCodes_로_받은_과거_본문은_codes_codeAt_조회에_HTTP_를_더_부르지_않는다() {
        lookup.prefetchCodes(List.of("C"), PAST);
        int toc = feed.tocCalls.get();
        int body = feed.bodyCalls.get();

        assertThat(lookup.codeAt("C", new BigDecimal("1.000"))).isPresent();
        assertThat(lookup.codes("C", new BigDecimal("1.000"), "BASE")).isNotNull();

        assertThat(feed.tocCalls.get()).isEqualTo(toc);
        assertThat(feed.bodyCalls.get()).isEqualTo(body);
    }

    @Test
    void 미리_받기에서_MDM_을_받을_수_없으면_호출자_스레드에서_MdmUnavailableException_이다() {
        feed.omitCurrent = true;
        feed.failedBodies.put(C_V1, "BOOM");

        assertThatThrownBy(() -> lookup.prefetchCodes(List.of("C"), PAST)).isInstanceOf(MdmUnavailableException.class);

        feed.fetchError = new MdmUnavailableException("MDM 연결 실패");
        assertThatThrownBy(() -> lookup.prefetchColumns(List.of("ANY_COL"), PAST)).isInstanceOf(MdmUnavailableException.class);
    }

    @Test
    void 없는_코드와_컬럼_빈_입력은_미리_받기에서_예외_없이_넘어간다() {
        lookup.prefetchCodes(List.of("NOPE"), PAST);
        lookup.prefetchCodes(List.of(), PAST);
        lookup.prefetchColumns(List.of("NO_SUCH_COL", " "), PAST);
        lookup.prefetchColumns(List.of(), PAST);
        assertThat(feed.bodyCalls.get()).isZero();
    }

    @Test
    void column_은_지금_시각으로_위임한다_과거_시각_목차를_요청하지_않는다() {
        feed.put(MdmTargetType.COLUMN, "BASE_COL", codeCol("BASE_COL", "C", "BASE"));

        lookup.column("T", "BASE_COL");

        assertThat(feed.tocAts).containsExactly(LocalDateTime.parse("2026-10-03T00:00:00"));
        assertThat(feed.bodyCalls.get()).isZero();
    }
}
