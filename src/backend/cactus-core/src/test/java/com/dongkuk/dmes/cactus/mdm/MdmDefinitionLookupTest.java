package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.Step;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.ColumnDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DomainKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** spec §5.2·§7 「엔진 연동」 — MdmDefinitionLookup 으로 DomainValidator 가 돌고, 룰은 적용 기간 경계에서 판정 시각으로 고른다. */
class MdmDefinitionLookupTest {

    private static final Instant NOW = Instant.parse("2026-10-02T00:00:00Z");

    private FakeMetaFeed feed;
    private MdmMetaService service;
    private MdmDefinitionLookup lookup;
    private DomainValidator validator;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(NOW);
        feed = new FakeMetaFeed();
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock);
        lookup = new MdmDefinitionLookup(service);
        MdmEvaluator evaluator = new MdmEvaluator(new EngineLookups(lookup, lookup, CodeEffLookup.NONE, MasterLookup.NONE, FunctionProvider.NONE));
        validator = new DefaultDomainValidator(lookup, evaluator);
    }

    static MdmColumnMeta qty(String phys, String stdExpr, Integer scale) {
        return new MdmColumnMeta(phys, "이름", null, null, null, null, null, "NUMBER", 10, scale, true, null, null, null, null,
                new MdmColumnMeta.DomainRef("7", "두께", "QTY"), stdExpr == null ? null : new MdmColumnMeta.Expr(stdExpr, null),
                null, List.of(), null);
    }

    /** 룰 버전은 major/minor 소수(D-144) — 문자열로 받아 scale 그대로 BigDecimal 로 싣는다. */
    static RuleDefinition rule(String ver, LocalDateTime from, LocalDateTime to) {
        return new RuleDefinition("R", new BigDecimal(ver), RuleKind.DECISION, HitPolicy.FIRST, from, to, "1", List.of(),
                new InputContract(List.of(), List.of()), List.of());
    }

    @Test
    void column_은_camelCase_이름도_물리명으로_찾아_ColumnDefinition_을_만든다() {
        feed.put(MdmTargetType.COLUMN, "COIL_THK", qty("COIL_THK", "value >= 0", 2));

        ColumnDefinition d = lookup.column("TB_ANY", "coilThk").orElseThrow();

        assertThat(d.table()).isEqualTo("TB_ANY");
        assertThat(d.column()).isEqualTo("COIL_THK");
        assertThat(d.domainKind()).isEqualTo(DomainKind.QTY);
        assertThat(d.dataType()).isEqualTo(DataType.NUMBER);
        assertThat(d.scale()).isEqualTo(2);
        assertThat(d.required()).isTrue();
        assertThat(d.effectiveStdExpr()).isEqualTo("value >= 0");
        assertThat(d.bizRequiredVars()).isEmpty();
        assertThat(lookup.column("TB_ANY", "NO_SUCH")).isEmpty();
    }

    @Test
    void 도메인_없는_컬럼은_TEXT_STRING_으로_본다() {
        feed.put(MdmTargetType.COLUMN, "MEMO", new MdmColumnMeta("MEMO", "메모", null, null, null, null, null, null, null, null, false,
                null, null, null, null, null, null, null, null, null));
        ColumnDefinition d = lookup.column("T", "MEMO").orElseThrow();
        assertThat(d.domainKind()).isEqualTo(DomainKind.TEXT);
        assertThat(d.dataType()).isEqualTo(DataType.STRING);
        assertThat(d.bizRequiredVars()).isEmpty();
    }

    @Test
    void DomainValidator_가_캐시된_정의로_필수와_표준식을_검증한다() {
        feed.put(MdmTargetType.COLUMN, "COIL_THK", qty("COIL_THK", "value >= 0", 2));

        assertThat(validator.validate("TB_ANY", "COIL_THK", Map.of("COIL_THK", "1.5"), NOW).valid()).isTrue();
        DomainValidator.ValidationResult bad = validator.validate("TB_ANY", "COIL_THK", Map.of("COIL_THK", "-1"), NOW);
        assertThat(bad.valid()).isFalse();
        assertThat(bad.failures().get(0).step()).isEqualTo(Step.STD_EXPR);
        Map<String, Object> blank = new HashMap<>();
        blank.put("COIL_THK", null);
        assertThat(validator.validate("TB_ANY", "COIL_THK", blank, NOW).failures().get(0).step()).isEqualTo(Step.REQUIRED);
    }

    @Test
    void CODE_도메인_컬럼은_캐시된_코드_원본으로_MASTER_를_판정한다() {
        CodeRows rows = new CodeRows(new CodeHeader("PROC_CD", "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0),
                        LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(new CodeItemRow("A", new BigDecimal("1.000"), new BigDecimal("9999.000"), "에이", null, 1,
                        Arrays.asList(new String[5]), Arrays.asList(new String[10]))),
                List.of(new CodeCateRow("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), "REGEX", ".*", "CODE")),
                List.of());
        feed.put(MdmTargetType.CODE, "PROC_CD", rows);
        feed.put(MdmTargetType.COLUMN, "PROC_COL", new MdmColumnMeta("PROC_COL", "공정", null, null, null, null, null, "STRING", 10, null,
                false, null, null, null, null, new MdmColumnMeta.DomainRef("8", "공정", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("PROC_CD", "BASE")));

        assertThat(validator.validate("T", "PROC_COL", Map.of("PROC_COL", "A"), NOW).valid()).isTrue();
        assertThat(validator.validate("T", "PROC_COL", Map.of("PROC_COL", "Z"), NOW).valid()).isFalse();
        assertThat(lookup.code("PROC_CD")).contains(rows);
    }

    /**
     * 코드 버전 비교는 값(compareTo)으로 한다 — 자리수가 다른 {@code 1}·{@code 1.000} 도 같은 버전이다. 비교는 엔진({@code Segments:20}·
     * {@code DefaultCodeResolver:148})이 하고, 이 구현은 캐시 값을 손대지 않고 넘긴다.
     */
    @Test
    void 코드_버전_자리수가_달라도_값으로_비교해_MASTER_를_판정한다() {
        CodeRows rows = new CodeRows(new CodeHeader("SCALE_CD", "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0),
                        LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(new CodeItemRow("A", new BigDecimal("1"), new BigDecimal("9999"), "에이", null, 1,
                        Arrays.asList(new String[5]), Arrays.asList(new String[10]))),
                List.of(new CodeCateRow("BASE", new BigDecimal("1.0"), new BigDecimal("9999"), "REGEX", ".*", "CODE")),
                List.of());
        feed.put(MdmTargetType.CODE, "SCALE_CD", rows);
        feed.put(MdmTargetType.COLUMN, "SCALE_COL", new MdmColumnMeta("SCALE_COL", "공정", null, null, null, null, null, "STRING", 10,
                null, false, null, null, null, null, new MdmColumnMeta.DomainRef("9", "공정", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("SCALE_CD", "BASE")));

        assertThat(validator.validate("T", "SCALE_COL", Map.of("SCALE_COL", "A"), NOW).valid()).isTrue();
        assertThat(validator.validate("T", "SCALE_COL", Map.of("SCALE_COL", "Z"), NOW).valid()).isFalse();
    }

    static CodeRows procRows() {
        return new CodeRows(new CodeHeader("PROC_CD", "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0),
                        LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(new CodeItemRow("A", new BigDecimal("1.000"), new BigDecimal("9999.000"), "에이", null, 1,
                        Arrays.asList(new String[5]), Arrays.asList(new String[10]))),
                List.of(new CodeCateRow("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), "REGEX", ".*", "CODE")),
                List.of());
    }

    static MdmColumnMeta procCol() {
        return new MdmColumnMeta("PROC_COL", "공정", null, null, null, null, null, "STRING", 10, null, false, null, null, null, null,
                new MdmColumnMeta.DomainRef("8", "공정", "CODE"), null, null, List.of(), new MdmColumnMeta.CodeRefMeta("PROC_CD", "BASE"));
    }

    /**
     * 코드 참조 컬럼은 정의를 줄 때 코드 원본도 호출자 스레드에서 받아 둔다. 그러지 않으면 코드 적재가 MASTER 식 평가 안(엔진 평가 스레드,
     * {@code MdmEvaluator.DEFAULT_TIMEOUT} 1초)에서 일어나 받을 수 없음이 평가 오류로 감싸여 {@link MdmUnavailableException} 이 올라오지 않는다.
     */
    @Test
    void 코드_참조_컬럼의_코드를_받을_수_없으면_검증이_MdmUnavailableException_을_받는다() {
        feed.put(MdmTargetType.COLUMN, "PROC_COL", procCol());
        feed.failedKeys.put("PROC_CD", "정의 손상");

        assertThatThrownBy(() -> validator.validate("T", "PROC_COL", Map.of("PROC_COL", "A"), NOW))
                .isInstanceOf(MdmUnavailableException.class);
    }

    @Test
    void 코드_적재가_식_평가_시간_한도보다_느려도_MASTER_판정은_시간_초과가_아니다() throws Exception {
        feed.put(MdmTargetType.CODE, "PROC_CD", procRows());
        feed.put(MdmTargetType.COLUMN, "PROC_COL", procCol());
        MdmEvaluator tight = new MdmEvaluator(new EngineLookups(lookup, lookup, CodeEffLookup.NONE, MasterLookup.NONE, FunctionProvider.NONE),
                Duration.ofMillis(100));
        DomainValidator tightValidator = new DefaultDomainValidator(lookup, tight);
        service.one(MdmTargetType.COLUMN, "PROC_COL"); // 컬럼만 캐시에 두고, 코드는 느리게 받게 한다
        CountDownLatch gate = new CountDownLatch(1);
        feed.fetchGate = gate;
        Thread opener = new Thread(() -> {
            try {
                Thread.sleep(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            gate.countDown();
        });
        opener.start();

        assertThat(tightValidator.validate("T", "PROC_COL", Map.of("PROC_COL", "A"), NOW).valid()).isTrue();
        opener.join();
    }

    @Test
    void 적용_기간이_겹치면_VER_가_큰_RELEASED_를_고른다() {
        List<RuleDefinition> released = List.of(
                rule("3.000", LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0)),
                rule("5.000", LocalDateTime.of(2026, 3, 1, 0, 0), null),
                rule("4.000", LocalDateTime.of(2026, 2, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0)));
        Instant at = LocalDateTime.of(2026, 4, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant();
        assertThat(MdmDefinitionLookup.select(released, at).orElseThrow().ver()).isEqualTo(new BigDecimal("5.000"));
        Instant earlyFeb = LocalDateTime.of(2026, 2, 15, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant();
        assertThat(MdmDefinitionLookup.select(released, earlyFeb).orElseThrow().ver()).isEqualTo(new BigDecimal("4.000"));
    }

    /** D-144 소수 버전 — 최대는 수 비교다. 문자열 비교면 "9.000" &gt; "10.000", 자리수만 다른 1.0·1.000 은 같은 값이다. */
    @Test
    void 겹친_RELEASED_의_최대_VER_는_문자열이_아니라_수로_비교한다() {
        LocalDateTime from = LocalDateTime.of(2026, 1, 1, 0, 0);
        Instant at = LocalDateTime.of(2026, 4, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant();

        List<RuleDefinition> majors = List.of(rule("9.000", from, null), rule("10.000", from, null), rule("2.000", from, null));
        assertThat(MdmDefinitionLookup.select(majors, at).orElseThrow().ver()).isEqualTo(new BigDecimal("10.000"));

        List<RuleDefinition> minors = List.of(rule("1.010", from, null), rule("1.009", from, null), rule("1.000", from, null));
        assertThat(MdmDefinitionLookup.select(minors, at).orElseThrow().ver()).isEqualTo(new BigDecimal("1.010"));

        List<RuleDefinition> minorOverMajor = List.of(rule("2.000", from, null), rule("1.999", from, null));
        assertThat(MdmDefinitionLookup.select(minorOverMajor, at).orElseThrow().ver()).isEqualTo(new BigDecimal("2.000"));
    }

    @Test
    void rule_은_판정_시각이_적용_기간에_든_RELEASED_버전을_고른다_경계() {
        feed.put(MdmTargetType.RULE, "R", List.of(
                rule("1.000", LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(2026, 7, 1, 0, 0)),
                rule("1.001", LocalDateTime.of(2026, 7, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0))));

        Instant beforeSwitch = LocalDateTime.of(2026, 6, 30, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant();
        Instant atSwitch = LocalDateTime.of(2026, 7, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant();
        Instant beforeAll = LocalDateTime.of(2025, 12, 31, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant();

        // equals(자리수까지) — 캐시가 준 BigDecimal 을 그대로 돌려준다
        assertThat(lookup.rule("R", beforeSwitch).orElseThrow().ver()).isEqualTo(new BigDecimal("1.000"));
        assertThat(lookup.rule("R", atSwitch).orElseThrow().ver()).isEqualTo(new BigDecimal("1.001"));
        assertThat(lookup.rule("R", beforeAll)).isEmpty();
        assertThat(lookup.rule("NO", atSwitch)).isEmpty();
    }

    /** D-144 2단계 — 세트도 RELEASED 버전 목록을 캐시하고 룰과 같은 규칙으로 판정 시각마다 고른다. */
    @Test
    void ruleSet_은_판정_시각이_적용_기간에_든_RELEASED_세트_버전을_고른다_경계() {
        RuleSetDefinition v1 = set("1.000", List.of("R"), LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(2026, 7, 1, 0, 0));
        RuleSetDefinition v2 = set("1.001", List.of("R", "R2"), LocalDateTime.of(2026, 7, 1, 0, 0), null);
        feed.put(MdmTargetType.RULE_SET, "S", List.of(v1, v2));
        Instant beforeSwitch = LocalDateTime.of(2026, 6, 30, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant();
        Instant atSwitch = LocalDateTime.of(2026, 7, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant();
        Instant beforeAll = LocalDateTime.of(2025, 12, 31, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant();

        assertThat(lookup.ruleSet("S", beforeSwitch)).contains(v1);
        assertThat(lookup.ruleSet("S", atSwitch)).contains(v2);
        assertThat(lookup.ruleSet("S", beforeAll)).isEmpty();
        assertThat(lookup.ruleSet("NO", atSwitch)).isEmpty();
    }

    @Test
    void 세트_버전도_겹치면_VER_가_수로_큰_것을_고른다() {
        LocalDateTime from = LocalDateTime.of(2026, 1, 1, 0, 0);
        Instant at = LocalDateTime.of(2026, 4, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant();
        List<RuleSetDefinition> sets = List.of(set("9.000", List.of(), from, null), set("10.000", List.of(), from, null));
        assertThat(MdmDefinitionLookup.selectSet(sets, at).orElseThrow().ver()).isEqualTo(new BigDecimal("10.000"));
    }

    private static RuleSetDefinition set(String ver, List<String> ruleIds, LocalDateTime from, LocalDateTime to) {
        return new RuleSetDefinition("S", new BigDecimal(ver), from, to, ruleIds, SetStatus.INUSE, null);
    }

    @Test
    void MDM_을_받을_수_없으면_엔진_호출이_MdmUnavailableException_을_받는다() {
        feed.fetchError = new MdmUnavailableException("꺼짐");
        assertThatThrownBy(() -> lookup.column("T", "COIL_THK")).isInstanceOf(MdmUnavailableException.class);
    }
}
