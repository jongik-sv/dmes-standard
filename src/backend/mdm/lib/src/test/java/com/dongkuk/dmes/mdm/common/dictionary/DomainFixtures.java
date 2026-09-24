package com.dongkuk.dmes.mdm.common.dictionary;

import com.dongkuk.dmes.mdm.common.engine.MdmEngineConfig;
import com.ezylang.evalex.parser.ParseException;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.BusinessFunction;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.Param;

/** TSK-04-03 lib 단위 테스트 공용 — 평가기와 메모리 도메인 행 빌더. DB 없음. */
public final class DomainFixtures {

    /** 비즈니스 함수 THK_OK(v) — 늘 true. 표준 칸에 쓰면 R02 다. */
    public static final FunctionProvider THK_OK = () -> List.of(
            new BusinessFunction("THK_OK", List.of(new Param("v", true)), false, args -> Boolean.TRUE));

    private DomainFixtures() {}

    public static MdmEvaluator evaluator() {
        return evaluator(null);
    }

    public static MdmEvaluator evaluator(CodeLookup codes) {
        return new MdmEvaluator(MdmEngineConfig.lookups(codes, null, THK_OK));
    }

    public static Map<String, Object> ast(MdmEvaluator evaluator, String text) {
        if (text == null) {
            return null;
        }
        try {
            return AstExporter.export(text, evaluator.configuration());
        } catch (ParseException e) {
            throw new IllegalArgumentException(e);
        }
    }

    public static Builder node(long id) {
        return new Builder(id);
    }

    /** 테스트용 행 빌더 — 지정하지 않은 칸은 null. 식을 주면 AST 도 만든다. */
    public static final class Builder {
        private final Long id;
        private Long parent;
        private String name;
        private String std;
        private String kind = "TEXT";
        private String type = "STRING";
        private Integer length;
        private Integer scale;
        private String unit;
        private String maruCodeId;
        private String cateId;
        private String stdRule;
        private String bizRule;
        private String testCases;
        private String examples;
        private Long ver = 0L;

        Builder(long id) {
            this.id = id;
            this.name = "도메인" + id;
            this.std = "D" + id;
        }

        public Builder parent(Long v) { this.parent = v; return this; }
        public Builder name(String v) { this.name = v; return this; }
        public Builder std(String v) { this.std = v; return this; }
        public Builder kind(String v) { this.kind = v; return this; }
        public Builder type(String v) { this.type = v; return this; }
        public Builder length(Integer v) { this.length = v; return this; }
        public Builder scale(Integer v) { this.scale = v; return this; }
        public Builder unit(String v) { this.unit = v; return this; }
        public Builder code(String maru, String cate) { this.maruCodeId = maru; this.cateId = cate; return this; }
        public Builder stdRule(String v) { this.stdRule = v; return this; }
        public Builder bizRule(String v) { this.bizRule = v; return this; }
        public Builder testCases(String json) { this.testCases = json; return this; }
        public Builder examples(String json) { this.examples = json; return this; }
        public Builder ver(Long v) { this.ver = v; return this; }

        public DomainNode build(MdmEvaluator evaluator) {
            return new DomainNode(id, parent, name, std, kind, type, length, scale, unit, maruCodeId, cateId,
                    stdRule, ast(evaluator, stdRule), bizRule, ast(evaluator, bizRule), null, examples, testCases, ver);
        }
    }
}
