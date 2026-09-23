import com.ezylang.evalex.*;
import java.util.*;
/**
 * TSK-02-02 설계 근거 도구(엔진 코드 아님) — EvalEx 3.7.0 기본 설정에서 함수·연산자에 NULL 이 들어가면 어떻게 되는지 찍는다.
 * 출력은 evalex-null-probe.txt. 허용 함수 표의 'NULL 인자' 열과 입력 계약 필수·선택 판정(06:208)의 근거다.
 */
public class EvalExNullProbe {
  static String run(String e){ try { Object v = new Expression(e).with("X", null).and("S","abc").and("N", 2).evaluate().getValue(); return "=> " + v; } catch (Exception ex) { return "!! " + ex.getClass().getSimpleName(); } }
  public static void main(String[] a){
    String[] es = {"IF(X, 1, 2)","IF(TRUE, X, 2)","SWITCH(X, 1, 10, 20)","COALESCE(X, 5)","NOT(X)","!X","ABS(X)","CEILING(X)","FLOOR(X)","SQRT(X)","ROUND(X, 2)","ROUND(N, X)","MIN(X, 1)","MAX(N, X)","SUM(X, 1)","AVERAGE(X, 1)",
     "STR_LENGTH(X)","STR_UPPER(X)","STR_LOWER(X)","STR_TRIM(X)","STR_LEFT(X, 1)","STR_LEFT(S, X)","STR_RIGHT(X, 1)","STR_SUBSTRING(X, 0, 1)","STR_SUBSTRING(S, X)","STR_CONTAINS(X, \"a\")","STR_CONTAINS(S, X)","STR_STARTS_WITH(X, \"a\")","STR_STARTS_WITH(S, X)","STR_ENDS_WITH(X, \"a\")","STR_MATCHES(X, \"a\")","STR_MATCHES(S, X)",
     "X + 1","X + \"a\"","X * 2","X == NULL","X != 1","X < 1","X && TRUE","FALSE && X","TRUE || X","X || TRUE", "STR_SUBSTRING(\"ABCDE\", 1, 2)", "STR_LEFT(\"ABC\", 5)"};
    for (String e: es) System.out.println(e + "  " + run(e));
  }
}
