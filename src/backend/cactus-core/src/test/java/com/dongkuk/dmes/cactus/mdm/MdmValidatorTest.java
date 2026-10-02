package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 하위 프로젝트 C spec §6·§9 「cactus-core」 — 서버 저장 검증기. 엔진은 진짜(캐시 전용 조회기 + MdmEvaluator·DefaultDomainValidator·MdmRuleEngine)이고
 * MDM 만 가짜 피드다. "평가 중 HTTP 0회" 는 가짜 피드의 호출 기록으로 본다.
 */
class MdmValidatorTest {

    private static final Instant NOW = Instant.parse("2026-10-03T00:00:00Z");
    private static final LocalDateTime FROM = LocalDateTime.of(2026, 1, 1, 0, 0);

    private MutableClock clock;
    private FakeMetaFeed feed;
    private MdmMetaService service;
    private MdmValidator validator;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(NOW);
        feed = new FakeMetaFeed();
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofMinutes(60), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock);
        validator = validator(MdmValidator.OnUnavailable.REJECT);
    }

    private MdmValidator validator(MdmValidator.OnUnavailable policy) {
        return new MdmValidator(service, FunctionProvider.NONE, policy, clock);
    }

    // ------------------------------------------------------------------ 정의 도우미

    static MdmColumnMeta str(String phys, String labelMid, Integer length, boolean required) {
        return new MdmColumnMeta(phys, phys + " 컬럼", "긴 " + labelMid, labelMid, "짧은", null, null, "STRING", length, null, required, null,
                null, null, null, new MdmColumnMeta.DomainRef("1", "이름", "TEXT"), null, null, List.of(), null);
    }

    static MdmColumnMeta num(String phys, String labelMid, Integer precision, Integer scale, String stdExpr) {
        return new MdmColumnMeta(phys, phys + " 컬럼", null, labelMid, null, null, null, "NUMBER", precision, scale, false, null, null, null,
                null, new MdmColumnMeta.DomainRef("2", "수량", "QTY"), stdExpr == null ? null : new MdmColumnMeta.Expr(stdExpr, null), null,
                List.of(), null);
    }

    static MdmColumnMeta withBiz(MdmColumnMeta m, String bizExpr, List<String> requiredVars) {
        return new MdmColumnMeta(m.physName(), m.columnName(), m.labelLong(), m.labelMid(), m.labelShort(), m.description(), m.usageNote(),
                m.dataType(), m.length(), m.scale(), m.required(), m.defaultValue(), m.refKind(), m.refTarget(), m.refCateId(), m.domain(),
                m.stdExpr(), new MdmColumnMeta.BizExpr(bizExpr), requiredVars, m.codeRef());
    }

    static MdmColumnMeta codeCol(String phys, String labelMid, String maruCodeId) {
        return new MdmColumnMeta(phys, phys + " 컬럼", null, labelMid, null, null, null, "STRING", 10, null, false, null, null, null, null,
                new MdmColumnMeta.DomainRef("8", "공정", "CODE"), null, null, List.of(), new MdmColumnMeta.CodeRefMeta(maruCodeId, "BASE"));
    }

    /** 코드 A·B 가 있는 마루 코드. */
    static CodeRows codeRows(String maruCodeId) {
        return new CodeRows(new CodeHeader(maruCodeId, "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", FROM, LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(item("A"), item("B")),
                List.of(new CodeCateRow("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), "REGEX", ".*", "CODE")),
                List.of());
    }

    private static CodeItemRow item(String code) {
        return new CodeItemRow(code, new BigDecimal("1.000"), new BigDecimal("9999.000"), code + " 이름", null, 1,
                Arrays.asList(new String[5]), Arrays.asList(new String[10]));
    }

    /** 입력 계약 always 에 이름·타입만 있는 빈 룰(행 없음 — 판정은 결과 없음). */
    static RuleDefinition contractRule(String ruleId, String var, DataType type) {
        return new RuleDefinition(ruleId, new BigDecimal("1.000"), RuleKind.DECISION, HitPolicy.FIRST, FROM, null, "1", List.of(),
                new InputContract(List.of(new VarType(var, type, null, null)), List.of()), List.of());
    }

    static RuleSetDefinition set(String setId, String... ruleIds) {
        return new RuleSetDefinition(setId, new BigDecimal("1.000"), FROM, null, List.of(ruleIds), SetStatus.INUSE, null);
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private MdmValidationResult validateRows(List<Map<String, Object>> rows, String... columns) {
        return validator.validate(MdmValidationRequest.rows("grid1", rows).columns(columns).build());
    }

    // ------------------------------------------------------------------ 요청 모양

    @Test
    void record_는_grid_null_행_하나이고_evalTs_를_주지_않으면_시계로_채운다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 3, true));
        MdmValidationRequest req = MdmValidationRequest.record(row("title", "")).columns("title").build();
        assertThat(req.grid()).isNull();
        assertThat(req.rows()).hasSize(1);
        assertThat(req.columns()).containsExactly("title");
        assertThat(req.ruleSets()).isEmpty();

        MdmValidationResult r = validator.validate(req);

        assertThat(r.ok()).isFalse();
        assertThat(r.errors()).containsExactly(new ErrorDetail(null, null, 0, "title", "E001", "제목은(는) 필수입니다"));
    }

    // ------------------------------------------------------------------ 키 정규화·행 거르기

    @Test
    void 키는_물리명으로_맞추고_rowStatus_rowKey_밑줄_상수이름_키는_엔진에_넘기지_않는다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 5, true));
        feed.put(MdmTargetType.RULE_SET, "S1", List.of(set("S1", "R1")));
        feed.put(MdmTargetType.RULE, "R1", List.of(contractRule("R1", "TITLE", DataType.STRING)));
        Map<String, Object> ok = row("rowStatus", "C", "rowKey", "k1", "_tmp", 1, "e", "x", "pi", 3, "eval_ts", "x", "catch_kind", "x",
                "title", "abc");

        MdmValidationResult r = validator.validate(MdmValidationRequest.rows("grid1", List.of(ok)).columns("title").ruleSet("S1").build());

        assertThat(r.errors()).isEmpty();
        assertThat(r.unavailable()).isEmpty();
        assertThat(r.ok()).isTrue();
        assertThat(r.ruleSetResults()).containsOnlyKeys(0);
        assertThat(r.ruleSetResults().get(0)).singleElement().satisfies(s -> assertThat(s.setId()).isEqualTo("S1"));
    }

    /**
     * 같은 물리명으로 바뀌는 키가 둘 이상이면(별칭 충돌) 하나를 고르지 않고 E002 로 거부한다 — 서비스가 저장하는 키와 검증기가 검사하는 키가 갈려
     * 서버 검증을 우회하지 못하게. 키 순서(요청자가 정한다)와 앞뒤 공백 키도 같다. 같은 칸 오류는 한 번만.
     */
    @Test
    void 같은_물리명으로_바뀌는_키가_여럿이면_고르지_않고_E002_로_거부한다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 5, false));
        String bad = "x".repeat(50);

        MdmValidationResult r = validateRows(List.of(
                row("rowStatus", "C", "title", "ok", "TITLE", bad),   // 앞 키 정상·뒤 키 위반
                row("rowStatus", "C", "TITLE", bad, "title", "ok"),   // 순서 반대
                row("rowStatus", "C", "title", "ok", " TITLE", bad),  // trim 으로 같은 물리명
                row("rowStatus", "C", "TITLE", "ok")), "TITLE");

        assertThat(r.errors()).extracting(e -> e.rowIndex() + ":" + e.field() + ":" + e.code())
                .containsExactly("0:TITLE:E002", "1:TITLE:E002", "2:TITLE:E002");
        assertThat(r.errors()).extracting(ErrorDetail::message).allSatisfy(m -> assertThat(m).startsWith("제목: 값 형식이 올바르지 않습니다"));
        assertThat(r.errors().get(0).message()).contains("title", "TITLE");
    }

    @Test
    void 룰_세트_레코드도_별칭_충돌이면_판정하지_않고_E002_다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 5, false));
        feed.put(MdmTargetType.RULE_SET, "S1", List.of(set("S1", "R1")));
        feed.put(MdmTargetType.RULE, "R1", List.of(contractRule("R1", "TITLE", DataType.STRING)));

        MdmValidationResult onlySet = validator.validate(MdmValidationRequest.rows("g", List.of(
                row("title", "a", "TITLE", "b"),
                row("TITLE", "b"))).ruleSet("S1").build());
        MdmValidationResult both = validator.validate(MdmValidationRequest.rows("g", List.of(
                row("title", "a", "TITLE", "b"))).columns("TITLE").ruleSet("S1").build());

        assertThat(onlySet.errors()).extracting(e -> e.rowIndex() + ":" + e.field() + ":" + e.code()).containsExactly("0:TITLE:E002");
        assertThat(onlySet.ruleSetResults()).as("충돌 행은 판정하지 않는다").containsOnlyKeys(1);
        assertThat(both.errors()).as("컬럼·룰 세트가 같은 칸을 봐도 오류는 하나").hasSize(1);
    }

    /** 검사 대상 칸의 값이 배열·목록·객체면 빈 값으로 보지 않고 E002 다(빠뜨리면 길이·타입·표준식 검사를 건너뛰고 서비스는 "[…]" 를 저장한다). */
    @Test
    void 검사_대상_칸의_값이_스칼라가_아니면_E002_다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 5, false));
        feed.put(MdmTargetType.COLUMN, "NAME", str("NAME", "이름", 5, true));

        MdmValidationResult r = validateRows(List.of(
                row("TITLE", List.of("x".repeat(5000)), "NAME", "n"),
                row("TITLE", Map.of("a", "b"), "NAME", "n"),
                row("TITLE", new String[]{"x"}, "NAME", "n"),
                row("TITLE", "ok", "NAME", List.of("a")),            // 필수 칸도 E001 이 아니라 형식 오류
                row("TITLE", List.of("x"), "title", "ok", "NAME", "n"), // 비스칼라 정확한 키 + 스칼라 별칭 — 별칭이 대신하지 않는다
                row("TITLE", "ok", "NAME", "n", "ATTACH", List.of(1, 2), "META", Map.of("k", "v"))), // 검사 대상이 아닌 칸은 그대로 뺀다
                "TITLE", "NAME");

        assertThat(r.errors()).extracting(e -> e.rowIndex() + ":" + e.field() + ":" + e.code())
                .containsExactly("0:TITLE:E002", "1:TITLE:E002", "2:TITLE:E002", "3:NAME:E002", "4:TITLE:E002");
        assertThat(r.errors().get(0).message()).isEqualTo("제목: 값 형식이 올바르지 않습니다");
        assertThat(r.errors().get(3).message()).isEqualTo("이름: 값 형식이 올바르지 않습니다");
    }

    @Test
    void 비즈니스식_요구_변수가_스칼라가_아니거나_별칭이_충돌하면_그_칸이_E002_다() {
        feed.put(MdmTargetType.COLUMN, "QTY", withBiz(num("QTY", "수량", 10, 0, null), "value <= MAX_QTY", List.of("MAX_QTY")));

        MdmValidationResult r = validateRows(List.of(
                row("qty", 2, "maxQty", List.of(3)),
                row("qty", 2, "maxQty", 3, "MAX_QTY", 1),
                row("qty", 2, "maxQty", 3)), "qty");

        assertThat(r.errors()).extracting(e -> e.rowIndex() + ":" + e.field() + ":" + e.code()).containsExactly("0:maxQty:E002", "1:MAX_QTY:E002");
        assertThat(r.errors()).extracting(ErrorDetail::message).allSatisfy(m -> assertThat(m).contains("값 형식이 올바르지 않습니다"));
    }

    @Test
    void 오류의_field_는_행의_원래_키이고_rowKey_rowIndex_grid_를_싣는다() {
        feed.put(MdmTargetType.COLUMN, "CODE_NM", str("CODE_NM", "코드명", 3, false));

        MdmValidationResult r = validateRows(List.of(row("rowKey", "a", "codeNm", "ok"), row("rowKey", 7, "codeNm", "toolong")), "codeNm");

        assertThat(r.errors()).containsExactly(new ErrorDetail("grid1", "7", 1, "codeNm", "E002", "코드명은(는) 최대 3자입니다"));
    }

    @Test
    void 삭제_행은_건너뛰고_rowStatus_가_없는_행은_검사한다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 3, true));

        MdmValidationResult r = validateRows(List.of(
                row("rowStatus", "D", "TITLE", "too long"),
                row("rowStatus", "deleted", "TITLE", null),
                row("rowStatus", "d", "TITLE", null),
                row("rowStatus", "U", "TITLE", "ok"),
                row("TITLE", "")), "TITLE");

        assertThat(r.errors()).extracting(ErrorDetail::rowIndex).containsExactly(4);
    }

    // ------------------------------------------------------------------ cactus 검사(길이·소수·타입)

    @Test
    void 길이는_code_point_로_센다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 3, false));

        MdmValidationResult r = validateRows(List.of(
                row("TITLE", "😀😀😀"),      // UTF-16 6자, code point 3
                row("TITLE", "가나다"),
                row("TITLE", "가나다라"),
                row("TITLE", "😀😀😀😀")), "TITLE");

        assertThat(r.errors()).extracting(ErrorDetail::rowIndex).containsExactly(2, 3);
        assertThat(r.errors()).extracting(ErrorDetail::message).containsOnly("제목은(는) 최대 3자입니다");
    }

    @Test
    void 소수는_NUMBER_p_s_의_정수부_p_빼기_s_소수부_s_로_본다() {
        feed.put(MdmTargetType.COLUMN, "THK", num("THK", "두께", 3, 1, null));
        feed.put(MdmTargetType.COLUMN, "RATE", num("RATE", "비율", 2, 2, null));
        feed.put(MdmTargetType.COLUMN, "CNT", num("CNT", "개수", 3, 0, null));

        MdmValidationResult r = validateRows(List.of(
                row("THK", "12.3", "RATE", 0, "CNT", 100),
                row("THK", new BigDecimal("12.30"), "RATE", "0.12", "CNT", "100"),
                row("THK", 123, "RATE", 1, "CNT", "1.5"),
                row("THK", "1.23", "RATE", 0.5, "CNT", -999)), "THK", "RATE", "CNT");

        assertThat(r.errors()).extracting(e -> e.rowIndex() + ":" + e.field() + ":" + e.message()).containsExactly(
                "2:THK:두께은(는) 정수 2자리, 소수 1자리까지입니다",
                "2:RATE:비율은(는) 정수 0자리, 소수 2자리까지입니다",
                "2:CNT:개수은(는) 정수 3자리, 소수 0자리까지입니다",
                "3:THK:두께은(는) 정수 2자리, 소수 1자리까지입니다");
    }

    @Test
    void 숫자가_아니면_타입_오류이고_날짜_컬럼은_날짜_형식을_본다() {
        feed.put(MdmTargetType.COLUMN, "QTY", num("QTY", "수량", 10, 0, null));
        feed.put(MdmTargetType.COLUMN, "WORK_DT", new MdmColumnMeta("WORK_DT", "작업일 컬럼", null, "작업일", null, null, null, "DATE", null,
                null, false, null, null, null, null, new MdmColumnMeta.DomainRef("9", "일자", "DATE"), null, null, List.of(), null));

        MdmValidationResult r = validateRows(List.of(
                row("QTY", "abc", "WORK_DT", "2026-10-03"),
                row("QTY", "1e3", "WORK_DT", "20261003"),
                row("QTY", 5, "WORK_DT", "2026-13-40")), "QTY", "WORK_DT");

        assertThat(r.errors()).extracting(e -> e.rowIndex() + ":" + e.code() + ":" + e.message()).containsExactly(
                "0:E002:수량은(는) 숫자여야 합니다",
                "1:E002:수량은(는) 숫자여야 합니다",
                "2:E002:작업일은(는) 날짜 형식이 아닙니다");
    }

    // ------------------------------------------------------------------ 엔진 실패 → ErrorDetail

    @Test
    void 필수는_E001_공백만이면_빈_값이다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 10, true));

        MdmValidationResult r = validateRows(List.of(row("TITLE", "  "), row("OTHER", "x"), row("TITLE", "a")), "TITLE");

        assertThat(r.errors()).extracting(e -> e.rowIndex() + ":" + e.field() + ":" + e.code() + ":" + e.message()).containsExactly(
                "0:TITLE:E001:제목은(는) 필수입니다",
                "1:TITLE:E001:제목은(는) 필수입니다");
    }

    @Test
    void 캡션은_labelMid_labelLong_labelShort_columnName_원래_키_순이다() {
        feed.put(MdmTargetType.COLUMN, "A1", new MdmColumnMeta("A1", "컬럼명", "긴", null, "짧은", null, null, "STRING", 1, null, true, null,
                null, null, null, null, null, null, List.of(), null));
        feed.put(MdmTargetType.COLUMN, "A2", new MdmColumnMeta("A2", "컬럼명", null, null, "짧은", null, null, "STRING", 1, null, true, null,
                null, null, null, null, null, null, List.of(), null));
        feed.put(MdmTargetType.COLUMN, "A3", new MdmColumnMeta("A3", "컬럼명", null, null, null, null, null, "STRING", 1, null, true, null,
                null, null, null, null, null, null, List.of(), null));
        feed.put(MdmTargetType.COLUMN, "A4", new MdmColumnMeta("A4", null, null, null, null, null, null, "STRING", 1, null, true, null,
                null, null, null, null, null, null, List.of(), null));

        MdmValidationResult r = validateRows(List.of(row()), "a1", "a2", "a3", "a4");

        assertThat(r.errors()).extracting(ErrorDetail::message)
                .containsExactly("긴은(는) 필수입니다", "짧은은(는) 필수입니다", "컬럼명은(는) 필수입니다", "a4은(는) 필수입니다");
    }

    @Test
    void 표준식이_거짓이면_식_원문을_싣고_코드_도메인은_허용되지_않은_코드다() {
        feed.put(MdmTargetType.COLUMN, "THK", num("THK", "두께", 10, 2, "value >= 0"));
        feed.put(MdmTargetType.COLUMN, "PROC", codeCol("PROC", "공정", "PROC_CD"));
        feed.put(MdmTargetType.CODE, "PROC_CD", codeRows("PROC_CD"));

        MdmValidationResult r = validateRows(List.of(row("THK", "1.5", "PROC", "A"), row("THK", "-1", "PROC", "Z")), "THK", "PROC");

        assertThat(r.errors()).extracting(e -> e.rowIndex() + ":" + e.field() + ":" + e.code() + ":" + e.message()).containsExactly(
                "1:THK:E002:두께: 표준 규칙을 만족하지 않습니다(value >= 0)",
                "1:PROC:E002:공정: 허용되지 않은 코드입니다");
        assertThat(r.unavailable()).isEmpty();
    }

    @Test
    void 비즈니스식이_거짓이면_원문_없이_업무_규칙_문구이고_요구_변수는_원래_키에서_물리명으로_가져온다() {
        feed.put(MdmTargetType.COLUMN, "QTY", withBiz(num("QTY", "수량", 10, 0, null), "value <= MAX_QTY", List.of("MAX_QTY")));

        MdmValidationResult r = validateRows(List.of(row("qty", 2, "maxQty", 3), row("qty", 5, "maxQty", 3)), "qty");

        assertThat(r.errors()).containsExactly(new ErrorDetail("grid1", null, 1, "qty", "E002", "수량: 업무 규칙을 만족하지 않습니다"));
    }

    @Test
    void 비즈니스식_요구_변수가_행에_없으면_오류다() {
        // 메타의 bizRequiredVars 가 비어도 엔진은 식에서 요구 변수를 다시 뽑는다 — 검증기도 같은 합집합으로 레코드를 만든다
        feed.put(MdmTargetType.COLUMN, "QTY", withBiz(num("QTY", "수량", 10, 0, null), "value <= MAX_QTY", List.of()));

        MdmValidationResult r = validateRows(List.of(row("qty", 2, "maxQty", 3), row("qty", 2)), "qty");

        assertThat(r.errors()).extracting(e -> e.rowIndex() + ":" + e.field() + ":" + e.code()).containsExactly("1:qty:E002");
        assertThat(r.errors().get(0).message()).startsWith("수량: 업무 규칙에 필요한 값이 없습니다");
    }

    // ------------------------------------------------------------------ 룰 세트

    @Test
    void 룰_세트_위반은_행_오류이고_field_는_위반_이름의_원래_키다() {
        feed.put(MdmTargetType.RULE_SET, "S1", List.of(set("S1", "R1")));
        feed.put(MdmTargetType.RULE, "R1", List.of(contractRule("R1", "ORD_QTY", DataType.NUMBER)));

        MdmValidationResult r = validator.validate(MdmValidationRequest.rows("g", List.of(
                row("rowKey", "r0", "ordQty", 3),
                row("rowKey", "r1", "ordQty", "abc"),
                row("rowKey", "r2", "other", 1))).ruleSet("S1").build());

        assertThat(r.errors()).hasSize(2);
        assertThat(r.errors().get(0)).satisfies(e -> {
            assertThat(e.rowIndex()).isEqualTo(1);
            assertThat(e.rowKey()).isEqualTo("r1");
            assertThat(e.field()).isEqualTo("ordQty");
            assertThat(e.code()).isEqualTo("E002");
        });
        assertThat(r.errors().get(1)).satisfies(e -> {
            assertThat(e.rowIndex()).isEqualTo(2);
            assertThat(e.field()).as("행에 없는 이름").isNull();
            assertThat(e.code()).as("키 없음은 필수 누락").isEqualTo("E001");
        });
        assertThat(r.ruleSetResults()).containsOnlyKeys(0);
    }

    /**
     * 룰 세트 평가 오류(EVALUATION_ERROR)의 엔진 문구에는 식 원문과 Java 예외 문구가 담긴다. 화면(ErrorDetail)에는 고정 문구만 보내고 원문은
     * 싣지 않는다(spec B3·§6.2-5 — 컬럼 경로의 "검증 규칙을 평가하지 못했습니다" 와 같은 방침).
     */
    @Test
    void 룰_세트_평가_오류는_식_원문_없이_고정_문구다() {
        RuleVar cond = new RuleVar(1, VarKind.COND, DispType.EXPRESSION, "ORD_QTY", null, null, null, DataType.NUMBER, null, null, null,
                null, null, null, null, 1);
        RuleVar result = new RuleVar(2, VarKind.RESULT, DispType.VALUE, "OK_FLAG", null, null, null, DataType.STRING, null, null, null,
                null, null, null, null, 2);
        String expr = "ORD_QTY / ZERO_QTY > 1";
        RuleCell bad = new RuleCell(null, null, null, null, expr, null, null, expr);
        RuleCell yes = new RuleCell(null, null, null, null, null, null, "Y", "\"Y\"");
        RuleDefinition rule = new RuleDefinition("R9", new BigDecimal("1.000"), RuleKind.DECISION, HitPolicy.FIRST, FROM, null, "1",
                List.of(cond, result), new InputContract(List.of(new VarType("ORD_QTY", DataType.NUMBER, null, null),
                        new VarType("ZERO_QTY", DataType.NUMBER, null, null)), List.of()),
                List.of(new RuleRow(1, 1, RowKind.NORMAL, Map.of(1, bad, 2, yes))));
        feed.put(MdmTargetType.RULE_SET, "S9", List.of(set("S9", "R9")));
        feed.put(MdmTargetType.RULE, "R9", List.of(rule));

        MdmValidationResult r = validator.validate(MdmValidationRequest.rows("g", List.of(row("ordQty", 3, "zeroQty", 0)))
                .ruleSet("S9").build());

        assertThat(r.errors()).singleElement().satisfies(e -> {
            assertThat(e.code()).isEqualTo("E002");
            assertThat(e.message()).doesNotContain(expr).doesNotContain("ZERO_QTY").doesNotContain("평가 오류")
                    .doesNotContain("Exception").endsWith(": 업무 규칙을 평가하지 못했습니다(관리자 확인 필요)");
        });
    }

    @Test
    void 룰_세트_타입_변환_위반은_값_형식_문구다() {
        feed.put(MdmTargetType.RULE_SET, "S1", List.of(set("S1", "R1")));
        feed.put(MdmTargetType.RULE, "R1", List.of(contractRule("R1", "ORD_QTY", DataType.NUMBER)));
        feed.put(MdmTargetType.COLUMN, "ORD_QTY", num("ORD_QTY", "주문수량", 10, 0, null));
        service.lookup(MdmTargetType.COLUMN, List.of("ORD_QTY")); // 캡션은 캐시에서만 읽는다

        MdmValidationResult r = validator.validate(MdmValidationRequest.rows("g", List.of(row("ordQty", "abc"))).ruleSet("S1").build());

        assertThat(r.errors()).singleElement().satisfies(e -> {
            assertThat(e.field()).isEqualTo("ordQty");
            assertThat(e.code()).isEqualTo("E002");
            assertThat(e.message()).isEqualTo("주문수량: 값 형식이 올바르지 않습니다");
        });
    }

    @Test
    void 룰_셀_텍스트의_MASTER_첫_인자_코드도_미리_받고_평가는_캐시로만_한다() {
        RuleVar cond = new RuleVar(1, VarKind.COND, DispType.EQUAL, "PROC", null, null, null, DataType.STRING, null, "8", null, null, null,
                null, null, 1);
        RuleVar result = new RuleVar(2, VarKind.RESULT, DispType.VALUE, "OK_FLAG", null, null, null, DataType.STRING, null, null, null,
                null, null, null, null, 2);
        RuleCell codeIn = new RuleCell("CODE_IN", "BASE", null, null, null, null, null, "MASTER(\"PROC_CD\", \"BASE\", PROC)");
        RuleCell yes = new RuleCell(null, null, null, null, null, null, "Y", "\"Y\"");
        RuleDefinition rule = new RuleDefinition("R2", new BigDecimal("1.000"), RuleKind.DECISION, HitPolicy.FIRST, FROM, null, "1",
                List.of(cond, result), new InputContract(List.of(new VarType("PROC", DataType.STRING, null, null)), List.of()),
                List.of(new RuleRow(1, 1, RowKind.NORMAL, Map.of(1, codeIn, 2, yes))));
        feed.put(MdmTargetType.RULE_SET, "S2", List.of(set("S2", "R2")));
        feed.put(MdmTargetType.RULE, "R2", List.of(rule));
        feed.put(MdmTargetType.CODE, "PROC_CD", codeRows("PROC_CD"));

        MdmValidationResult r = validator.validate(MdmValidationRequest.rows("g", List.of(row("proc", "A"), row("proc", "Z")))
                .ruleSet("S2").build());

        assertThat(r.ok()).isTrue();
        assertThat(r.ruleSetResults().get(0).get(0).finalValues()).containsEntry("OK_FLAG", "Y");
        assertThat(r.ruleSetResults().get(1).get(0).finalValues().get("OK_FLAG")).isNull();
        assertThat(feed.fetchedKeys).containsExactly(List.of("S2"), List.of("R2"), List.of("PROC_CD"));
    }

    // ------------------------------------------------------------------ 미리 받기·검증 불가

    @Test
    void 미리_받기는_종류마다_한_번이고_다시_검증하면_MDM_을_부르지_않는다() {
        feed.put(MdmTargetType.COLUMN, "PROC", codeCol("PROC", "공정", "PROC_CD"));
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 10, false));
        feed.put(MdmTargetType.COLUMN, "LINE", new MdmColumnMeta("LINE", "라인 컬럼", null, "라인", null, null, null, "STRING", 10, null, false,
                null, null, null, null, new MdmColumnMeta.DomainRef("3", "라인", "ID"),
                new MdmColumnMeta.Expr("MASTER(\"LINE_CD\", \"BASE\", value)", Map.of("type", "FUNCTION", "value", "MASTER", "params", List.of(
                        Map.of("type", "STRING_LITERAL", "value", "LINE_CD"), Map.of("type", "STRING_LITERAL", "value", "BASE"),
                        Map.of("type", "VARIABLE_OR_CONSTANT", "value", "value")))), null, List.of(), null));
        feed.put(MdmTargetType.CODE, "PROC_CD", codeRows("PROC_CD"));
        feed.put(MdmTargetType.CODE, "LINE_CD", codeRows("LINE_CD"));
        List<Map<String, Object>> rows = List.of(row("PROC", "A", "TITLE", "t", "LINE", "B"), row("PROC", "Z", "TITLE", "t", "LINE", "A"));

        MdmValidationResult first = validateRows(rows, "PROC", "TITLE", "LINE");
        assertThat(feed.fetchedKeys).containsExactly(List.of("PROC", "TITLE", "LINE"), List.of("PROC_CD", "LINE_CD"));
        MdmValidationResult second = validateRows(rows, "PROC", "TITLE", "LINE");

        assertThat(feed.fetchCalls.get()).isEqualTo(2);
        assertThat(first.errors()).extracting(e -> e.rowIndex() + ":" + e.field()).containsExactly("1:PROC");
        assertThat(second.errors()).isEqualTo(first.errors());
    }

    /**
     * 평가 중 캐시 부재 — 비즈니스식의 MASTER 첫 인자가 행 값이라 미리 받기가 그 코드를 알 수 없다. 평가 스레드(가상 스레드)의 캐시 전용 조회기가 부재를
     * 기록하고, 검증기는 그것을 오류가 아니라 검증 불가로 돌린다. 피드에는 코드가 있지만 평가 중에 받지 않는다(HTTP 0회).
     */
    @Test
    void 평가_중_캐시에_없는_코드는_MDM_을_부르지_않고_검증_불가다() {
        feed.put(MdmTargetType.COLUMN, "PROC", withBiz(str("PROC", "공정", 10, false), "MASTER(CODE_SRC, \"BASE\", value)", List.of("CODE_SRC")));
        feed.put(MdmTargetType.CODE, "PROC_CD", codeRows("PROC_CD"));

        MdmValidationResult r = validateRows(List.of(row("PROC", "A", "codeSrc", "PROC_CD"), row("PROC", "B", "codeSrc", "PROC_CD")), "PROC");

        assertThat(r.errors()).as("같은 키를 두 번째 행에서 또 놓쳐도 검증 불가다(오류가 아니다)").isEmpty();
        assertThat(r.unavailable()).containsExactly("CODE:PROC_CD");
        assertThat(r.ok()).isFalse();
        assertThat(feed.fetchedKeys).containsExactly(List.of("PROC"));
    }

    @Test
    void 동시에_돌아도_부재_기록은_자기_검증에만_남는다() throws Exception {
        feed.put(MdmTargetType.COLUMN, "PROC", withBiz(str("PROC", "공정", 10, false), "MASTER(CODE_SRC, \"BASE\", value)", List.of("CODE_SRC")));
        feed.put(MdmTargetType.CODE, "PROC_CD", codeRows("PROC_CD"));
        service.lookup(MdmTargetType.CODE, List.of("PROC_CD")); // 있는 코드는 캐시에 둔다. NONE_CD 는 피드에도 캐시에도 없다
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<MdmValidationResult>> hits = new ArrayList<>();
            List<Future<MdmValidationResult>> misses = new ArrayList<>();
            for (int i = 0; i < 40; i++) {
                Callable<MdmValidationResult> hit = () -> validateRows(List.of(row("PROC", "A", "codeSrc", "PROC_CD")), "PROC");
                Callable<MdmValidationResult> miss = () -> validateRows(List.of(row("PROC", "A", "codeSrc", "MISS_CD")), "PROC");
                hits.add(pool.submit(hit));
                misses.add(pool.submit(miss));
            }
            for (Future<MdmValidationResult> f : hits) {
                assertThat(f.get().ok()).isTrue();
            }
            for (Future<MdmValidationResult> f : misses) {
                assertThat(f.get().unavailable()).containsExactly("CODE:MISS_CD");
                assertThat(f.get().errors()).isEmpty();
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void 미리_받기에서_받을_수_없는_컬럼은_검증_불가이고_다른_컬럼은_검사한다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 3, false));
        feed.put(MdmTargetType.COLUMN, "BAD", str("BAD", "나쁨", 3, false));
        feed.failedKeys.put("BAD", "정의를 만들지 못함");

        MdmValidationResult r = validateRows(List.of(row("TITLE", "toolong", "BAD", "toolong")), "TITLE", "BAD");

        assertThat(r.unavailable()).containsExactly("COLUMN:BAD");
        assertThat(r.errors()).extracting(ErrorDetail::field).containsExactly("TITLE");
    }

    @Test
    void 코드가_아닌_MASTER_첫_인자_상수는_마루_데이터라_검증_불가다() {
        feed.put(MdmTargetType.COLUMN, "EQP", new MdmColumnMeta("EQP", "설비 컬럼", null, "설비", null, null, null, "STRING", 10, null, false,
                null, null, null, null, new MdmColumnMeta.DomainRef("4", "설비", "ID"),
                new MdmColumnMeta.Expr("MASTER(\"EQP_DATA\", \"BASE\", value)", null), null, List.of(), null));

        MdmValidationResult r = validateRows(List.of(row("EQP", "X1")), "EQP");

        assertThat(r.errors()).isEmpty();
        assertThat(r.unavailable()).containsExactly("MASTER:EQP_DATA");
    }

    @Test
    void 사전에_없는_컬럼과_룰_세트는_프로그램_결함이라_IllegalArgumentException() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 3, false));

        assertThatThrownBy(() -> validateRows(List.of(row("TITLE", "a")), "TITLE", "NO_SUCH"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("NO_SUCH");
        assertThatThrownBy(() -> validator.validate(MdmValidationRequest.rows("g", List.of(row("TITLE", "a"))).ruleSet("NO_SET").build()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("NO_SET");
    }

    // ------------------------------------------------------------------ check 정책

    @Test
    void check_는_오류가_있으면_INVALID_VALUE_로_던진다() {
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 3, true));

        assertThatThrownBy(() -> validator.check(MdmValidationRequest.rows("grid1", List.of(row("TITLE", "toolong"))).columns("TITLE").build()))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
                    assertThat(e.getMessage()).isEqualTo("입력값을 확인해주세요.");
                    assertThat(e.getErrors()).extracting(ErrorDetail::field).containsExactly("TITLE");
                });
        assertThat(validator.check(MdmValidationRequest.rows("grid1", List.of(row("TITLE", "ok"))).columns("TITLE").build()).ok()).isTrue();
    }

    @Test
    void REJECT_는_검증_불가면_MDM_UNAVAILABLE_로_저장을_막는다() {
        feed.fetchError = new MdmUnavailableException("MDM 꺼짐");

        assertThatThrownBy(() -> validator.check(MdmValidationRequest.rows("grid1", List.of(row("TITLE", "a"))).columns("TITLE").build()))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR);
                    assertThat(e.getMessage()).isEqualTo(MdmValidator.UNAVAILABLE_MESSAGE);
                    assertThat(e.getErrors()).first().satisfies(d -> {
                        assertThat(d.code()).isEqualTo("MDM_UNAVAILABLE");
                        assertThat(d.field()).isNull();
                        assertThat(d.message()).isEqualTo(MdmValidator.UNAVAILABLE_MESSAGE);
                    });
                });
    }

    @Test
    void PASS_는_검증_불가_항목만_건너뛰고_나머지_오류는_막는다() {
        MdmValidator pass = validator(MdmValidator.OnUnavailable.PASS);
        feed.put(MdmTargetType.COLUMN, "TITLE", str("TITLE", "제목", 3, false));
        feed.put(MdmTargetType.COLUMN, "BAD", str("BAD", "나쁨", 3, false));
        feed.failedKeys.put("BAD", "정의를 만들지 못함");

        MdmValidationResult passed = pass.check(MdmValidationRequest.rows("g", List.of(row("TITLE", "ok", "BAD", "toolong")))
                .columns("TITLE", "BAD").build());
        assertThat(passed.unavailable()).containsExactly("COLUMN:BAD");
        assertThat(passed.errors()).isEmpty();

        assertThatThrownBy(() -> pass.check(MdmValidationRequest.rows("g", List.of(row("TITLE", "toolong", "BAD", "x")))
                .columns("TITLE", "BAD").build()))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @Test
    void 판정_시각을_주면_그_시각의_룰_세트_버전을_쓴다() {
        RuleSetDefinition future = new RuleSetDefinition("S3", new BigDecimal("2.000"), LocalDateTime.of(2027, 1, 1, 0, 0), null,
                List.of("R1"), SetStatus.INUSE, null);
        RuleSetDefinition current = new RuleSetDefinition("S3", new BigDecimal("1.000"), FROM, LocalDateTime.of(2027, 1, 1, 0, 0),
                List.of("R0"), SetStatus.INUSE, null);
        feed.put(MdmTargetType.RULE_SET, "S3", List.of(current, future));
        feed.put(MdmTargetType.RULE, "R0", List.of(contractRule("R0", "A_QTY", DataType.NUMBER)));
        feed.put(MdmTargetType.RULE, "R1", List.of(contractRule("R1", "B_QTY", DataType.NUMBER)));
        Map<String, Object> onlyA = new HashMap<>(Map.of("aQty", 1));

        assertThat(validator.validate(MdmValidationRequest.rows("g", List.of(onlyA)).ruleSet("S3").build()).ok()).isTrue();
        assertThat(validator.validate(MdmValidationRequest.rows("g", List.of(onlyA)).ruleSet("S3")
                .evalTs(Instant.parse("2027-06-01T00:00:00Z")).build()).errors()).hasSize(1);
    }
}
