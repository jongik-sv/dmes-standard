import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.config.MapBasedFunctionDictionary;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.AbstractFunction;
import com.ezylang.evalex.functions.FunctionIfc;
import com.ezylang.evalex.functions.FunctionParameter;
import com.ezylang.evalex.parser.ASTNode;
import com.ezylang.evalex.parser.Token;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig;

/**
 * TSK-02-02 설계 검증 도구(엔진 코드 아님). 초안 설정({@link MdmExpressionConfig#baseBuilder()})과
 * STANDARD 함수 사전으로 원천 문서의 예시 식을 파싱해 AST JSON 을 내보내고, 문법 축소(design D1)로
 * 거부돼야 할 식이 실제로 거부되는지 본다. 출력(JSON)은 ast.schema.json 으로 검증한다(design §3 V5).
 *
 * <p>MASTER·MASTER_AT·INSTR 는 인자 모양만 맞춘 가짜 함수다(파싱만 한다).
 */
public class AstSampleExport {

    @FunctionParameter(name = "id")
    @FunctionParameter(name = "cate")
    @FunctionParameter(name = "key")
    @FunctionParameter(name = "attr", isVarArg = true)
    static final class MasterStub extends AbstractFunction {
        @Override
        public EvaluationValue evaluate(Expression e, Token t, EvaluationValue... p) {
            return EvaluationValue.booleanValue(false);
        }
    }

    @FunctionParameter(name = "id")
    @FunctionParameter(name = "cate")
    @FunctionParameter(name = "key")
    @FunctionParameter(name = "baseDt")
    @FunctionParameter(name = "attr", isVarArg = true)
    static final class MasterAtStub extends AbstractFunction {
        @Override
        public EvaluationValue evaluate(Expression e, Token t, EvaluationValue... p) {
            return EvaluationValue.booleanValue(false);
        }
    }

    @FunctionParameter(name = "s")
    @FunctionParameter(name = "sub")
    static final class InstrStub extends AbstractFunction {
        @Override
        public EvaluationValue evaluate(Expression e, Token t, EvaluationValue... p) {
            return EvaluationValue.numberValue(java.math.BigDecimal.ZERO);
        }
    }

    static final String[] ACCEPT = {
            // evalex-guide §7·§8.3
            "value >= 0.1 && value <= 3.5",
            "value % 0.1 == 0",
            "STR_MATCHES(value, \"^[A-Z0-9]{10,20}$\")",
            "value >= COALESCE(COIL_THK, 0)",
            "IF(GRADE == \"A\", value <= 2.0, value <= 3.5)",
            // 06 생성 규칙·op-code 표
            "V != NULL && V >= (-1.5)",
            "V != NULL && V >= 1.6 && V < 2.5",
            "V != NULL && (V == \"A\" || V == \"B\")",
            "V != NULL && V != \"C\"",
            "V != NULL && MASTER(\"PROC_CD\", \"PLATING\", V)",
            "V != NULL && INSTR(V, \"SGCC\") > 0",
            "V != NULL && STR_STARTS_WITH(V, \"SGC\")",
            "V != NULL && STR_MATCHES(V, \"A\\\\.B.*\")",
            "V == NULL",
            "V == TRUE",
            "_V7 != NULL && _V7 == \"A\"",
            // 06 결과식·식 변수·열 조건
            "ROUND(BASE_FCT * 0.98, 2)",
            "COIL_THK * COIL_WID > 3000",
            "STR_SUBSTRING(MAT_CD, 1, 2)",
            "STR_STARTS_WITH(TOP_RESIN_CD, \"2\")",
            "PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID * (1 - COIL_VOID_RT / 100) * SPEC_GRAV",
            "MASTER(\"CUST\", \"BASE\", CUST_CD) && MASTER(\"CUST\", \"BASE\", CUST_CD, \"attr01\") != \"X\"",
            "MASTER_AT(\"PORT\", \"BASE\", PORT_CD, SHIP_DT, \"attr01\")",
            "SWITCH(GRD, \"A\", 1, \"B\", 2, 3)",
            "-2^2",
            "!(A > 1)",
            "NOT(A > 1)",
            "0xFF + 1e-3 + .5",
            "\"1\\\"인치\" + STR_UPPER(\"a\")",
    };

    /** 문법 축소·함수 화이트리스트로 파싱 단계에서 거부돼야 하는 식. */
    static final String[] REJECT = {
            "B[0] > 1",            // arraysAllowed=false
            "c.d > 1",             // structuresAllowed=false
            "2x > 1",              // implicitMultiplicationAllowed=false
            "'A' == V",            // singleQuoteStringLiteralsAllowed=false
            "DT_NOW() > 1",        // 시각 함수 — 사전 밖
            "RANDOM() > 0.5",      // 난수 — 사전 밖
            "STR_FORMAT(\"%s\", V)", // 로캘 — 사전 밖(D1)
            "STR_SPLIT(V, \",\")",  // 배열 반환 — 사전 밖(D1)
            "LOG(V) > 1",          // 표준 사전에 있으나 허용 집합 밖
    };

    public static void main(String[] args) throws Exception {
        List<Map.Entry<String, FunctionIfc>> fns = new ArrayList<>();
        ExpressionConfiguration std = ExpressionConfiguration.defaultConfiguration();
        for (String name : FunctionSets.BASE) {
            fns.add(new AbstractMap.SimpleEntry<>(name, std.getFunctionDictionary().getFunction(name)));
        }
        fns.add(new AbstractMap.SimpleEntry<>("MASTER", new MasterStub()));
        fns.add(new AbstractMap.SimpleEntry<>("MASTER_AT", new MasterAtStub()));
        fns.add(new AbstractMap.SimpleEntry<>("INSTR", new InstrStub()));
        @SuppressWarnings("unchecked")
        Map.Entry<String, FunctionIfc>[] arr = fns.toArray(new Map.Entry[0]);
        ExpressionConfiguration cfg = MdmExpressionConfig.baseBuilder()
                .functionDictionary(MapBasedFunctionDictionary.ofFunctions(arr))
                .build();

        StringBuilder out = new StringBuilder("{\n  \"accepted\": [\n");
        int bad = 0;
        for (int i = 0; i < ACCEPT.length; i++) {
            try {
                ASTNode root = new Expression(ACCEPT[i], cfg).getAbstractSyntaxTree();
                out.append("    {\"expr\": ").append(q(ACCEPT[i])).append(", \"ast\": ").append(json(root)).append('}');
            } catch (Exception e) {
                bad++;
                out.append("    {\"expr\": ").append(q(ACCEPT[i])).append(", \"error\": ").append(q(String.valueOf(e))).append('}');
            }
            out.append(i + 1 < ACCEPT.length ? ",\n" : "\n");
        }
        out.append("  ],\n  \"rejected\": [\n");
        for (int i = 0; i < REJECT.length; i++) {
            String err;
            try {
                new Expression(REJECT[i], cfg).getAbstractSyntaxTree();
                err = null;
                bad++;
            } catch (Exception e) {
                err = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            out.append("    {\"expr\": ").append(q(REJECT[i])).append(", \"parseError\": ")
                    .append(err == null ? "null" : q(err)).append('}');
            out.append(i + 1 < REJECT.length ? ",\n" : "\n");
        }
        // allowOverwriteConstants=false — 상수 이름 레코드 키는 예외(06:199)
        String constantKey;
        try {
            new Expression("V != NULL", cfg).with("null", 1).and("V", 1).evaluate();
            constantKey = "no error";
            bad++;
        } catch (Exception e) {
            constantKey = e.getClass().getSimpleName() + ": " + e.getMessage();
        }
        out.append("  ],\n  \"constantKey\": ").append(q(constantKey)).append(",\n  \"unexpected\": ").append(bad)
                .append("\n}\n");
        System.out.print(out);
        if (bad > 0) {
            System.exit(1);
        }
    }

    static String json(ASTNode n) {
        StringBuilder sb = new StringBuilder("{\"type\": ").append(q(n.getToken().getType().name()))
                .append(", \"value\": ").append(q(n.getToken().getValue()));
        List<ASTNode> ps = n.getParameters();
        if (ps != null && !ps.isEmpty()) {   // AstExporter 와 같이 자식이 없으면 params 키를 뺀다
            sb.append(", \"params\": [");
            for (int i = 0; i < ps.size(); i++) {
                sb.append(i > 0 ? ", " : "").append(json(ps.get(i)));
            }
            sb.append(']');
        }
        return sb.append('}').toString();
    }

    static String q(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        return sb.append('"').toString();
    }
}
