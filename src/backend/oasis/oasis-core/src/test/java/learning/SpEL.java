package learning;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.event.Event;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.junit.jupiter.api.Test;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.util.StringUtils;

import java.lang.reflect.Type;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.AssertionsForClassTypes.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-04-06
 */
@SuppressWarnings("unused")
public class SpEL {
    /**
     * 패턴.
     */
    @SuppressWarnings("RegExpUnnecessaryNonCapturingGroup")
    public static final String SPEL_COMMENT_PATTERN = "(?:/\\*(?:[^*]|(?:\\*+[^*/]))*\\*+/)|(?://.*)";
    ExpressionParser parser = new SpelExpressionParser();

    private static String buildMultiLineSpEl(String spEl) {
        boolean first = true;

        int i = 0;
        /*
        입력 String 주석을 제거
        */
        List<String> expressions = new ArrayList<>(Arrays.asList(spEl.replaceAll(SPEL_COMMENT_PATTERN, "").split("\n")));

        StringBuilder stringBuilder = new StringBuilder();
        String returnString;
        for (String str : expressions) {
            if (StringUtils.hasText(str)) continue;
            if (first) {
                first = false;
                stringBuilder.append(str);
            } else {
                stringBuilder.append(", \n").append(str);
            }
            i++;
        }

        if (i > 1) {
            returnString = "{" + stringBuilder + "}";
        } else {
            returnString = stringBuilder.toString();
        }

        return returnString;
    }

    @Test
    void assignment() {
        String a = "hi";
        EvaluationContext evaluationContext = new StandardEvaluationContext(a);
        String text = "#this='hello'";
        Expression expression = parser.parseExpression(text);
        Object value = expression.getValue(evaluationContext);
        System.out.println(value);
        System.out.println(a);
    }

    @Test
    @SuppressWarnings("ArraysAsListWithZeroOrOneArgument")
    void listValueChange() {
        List<String> stringList = Collections.unmodifiableList(Arrays.asList("hi"));
        EvaluationContext evaluationContext = new StandardEvaluationContext(stringList);
        String text = "#this[0]='hello'";
        Expression expression = parser.parseExpression(text);
        assertThatExceptionOfType(UnsupportedOperationException.class).isThrownBy(() ->
                expression.getValue(evaluationContext));
    }

    @Test
    void mapValueChange() {
        Map<String, String> map = new HashMap<>();
        map.put("a", "a");
        Map<String, String> map1 = Collections.unmodifiableMap(map);

        EvaluationContext evaluationContext = new StandardEvaluationContext(map1);
        String text = "#this['a']='hello'";
        Expression expression = parser.parseExpression(text);
        assertThatExceptionOfType(UnsupportedOperationException.class).isThrownBy(() ->
                expression.getValue(evaluationContext));
    }

    @Test
    void chained() {
        EvaluationContext evaluationContext = new StandardEvaluationContext();
        String text = "{true, true}";
        Expression expression = parser.parseExpression(text);
        Object value = expression.getValue(evaluationContext);
        assertThat(value).isInstanceOf(List.class);
    }

    static class OrderDto {
        private final String id;
        private final String name;

        public OrderDto(String id, String name) {
            this.id = id;
            this.name = name;
        }

        public String getId() {
            return id;
        }

        public String getName() {
            return name;
        }
    }

    static class SimpleExecutableContext implements ExecutableContext {
        private TypedObject object;

        @SuppressFBWarnings("URF_UNREAD_FIELD")
        SimpleExecutableContext(TypedObject object) {
            this.object = object;
        }

        public SimpleExecutableContext() {
        }

        @Override
        public TypedObject get(String key) {
            return null;
        }

        @Override
        public List<TypedObject> get(Type type) {
            return null;
        }

        @Override
        public ServiceContext serviceContext() {
            return null;
        }

        @Override
        public ProcessContext processContext() {
            return null;
        }

        @Override
        public Object getObject(ObjectSearchCondition condition) {
            return null;
        }

        @Override
        public void registerObject(Object object, ObjectRegisterInfo info) {

        }

        @Override
        public void raiseEvent(Event event) {

        }
    }
}
