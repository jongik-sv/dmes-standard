// 도메인 검증식 → AST JSON. 앱의 DomainExpressionCompiler.astJson 과 같은 AstExporter·설정을 쓴다.
// 입력(stdin): id\t식  출력(stdout): id\tAST JSON(파싱 실패면 빈 값)\t검사 문제(; 구분)
// test 모드: id\t타입\t값\t기대\t식(부모 사슬, \u0001 구분) → id\t값\t기대\t결과(검증식만 본다. 길이·타입 검사는 앱 몫)
import java.io.*;
import java.util.*;
import kr.dongkuk.maru.mdm.engine.expr.*;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;

public class AstGen {
    public static void main(String[] a) throws Exception {
        var ctor = EngineLookups.class.getRecordComponents();
        Object[] args = new Object[ctor.length];
        for (int i = 0; i < ctor.length; i++) args[i] = stub(ctor[i].getType()); // 파싱만 하므로 조회는 쓰지 않는다
        MdmEvaluator ev = new MdmEvaluator((EngineLookups) EngineLookups.class.getDeclaredConstructors()[0].newInstance(args));
        ExpressionChecker ck = new ExpressionChecker(ev);
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        PrintStream out = new PrintStream(System.out, true, "UTF-8");
        if (a.length > 0 && a[0].equals("test")) {
            for (String line; (line = in.readLine()) != null; ) {
                String[] p = line.split("\t", 5);
                Object v = p[2];
                if (p[1].equals("NUMBER")) {
                    try { v = new java.math.BigDecimal(p[2]); } catch (NumberFormatException e) { v = null; }
                }
                String res;
                if (v == null) {
                    res = "false(숫자 아님)";
                } else {
                    boolean ok = true;
                    try {
                        for (String r : p[4].split("\u0001")) {
                            if (r.isBlank()) continue;
                            ok &= ev.evaluate(r, Map.of("value", v), java.time.Instant.now()).getBooleanValue();
                        }
                        res = String.valueOf(ok);
                    } catch (Exception e) { res = "ERROR " + e.getMessage(); }
                }
                out.println(p[0] + "\t" + p[2] + "\t" + p[3] + "\t" + res);
            }
            System.exit(0);
        }
        for (String line; (line = in.readLine()) != null; ) {
            String[] p = line.split("\t", 2);
            String ast = "";
            try { ast = json(AstExporter.export(p[1], ev.configuration())); } catch (Exception e) { }
            StringBuilder pr = new StringBuilder();
            try { for (var x : ck.check(p[1], Slot.DOMAIN_STD)) pr.append(x.kind()).append(':').append(x.detail()).append("; "); }
            catch (Exception e) { pr.append("EXC:").append(e); }
            out.println(p[0] + "\t" + ast + "\t" + pr.toString().replace('\t', ' ').replace('\n', ' '));
        }
    }
    static Object stub(Class<?> t) {
        return java.lang.reflect.Proxy.newProxyInstance(t.getClassLoader(), new Class<?>[] {t}, (pr, m, as) -> {
            Class<?> r = m.getReturnType();
            if (r == Optional.class) return Optional.empty();
            if (r == List.class) return List.of();
            if (r == Set.class) return Set.of();
            if (r == Map.class) return Map.of();
            if (r == boolean.class) return false;
            if (r.isPrimitive()) return 0;
            return null;
        });
    }
    static String json(Object o) {
        if (o == null) return "null";
        if (o instanceof Map<?, ?> m) {
            StringJoiner j = new StringJoiner(",", "{", "}");
            m.forEach((k, v) -> j.add(str(k.toString()) + ":" + json(v)));
            return j.toString();
        }
        if (o instanceof List<?> l) {
            StringJoiner j = new StringJoiner(",", "[", "]");
            l.forEach(v -> j.add(json(v)));
            return j.toString();
        }
        return str(o.toString());
    }
    static String str(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> { if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
            }
        }
        return b.append('"').toString();
    }
}
