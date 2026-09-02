package invoker;

import com.dongkuk.oasis.methodinvoker.*;
import com.dongkuk.oasis.methodinvoker.annotations.DefaultMethod;
import com.dongkuk.oasis.methodinvoker.exceptions.MethodInvokeException;
import org.junit.jupiter.api.Test;

import java.lang.reflect.ParameterizedType;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
class StrictMethodInvokerTest {
    MethodInvoker methodInvoker = new StrictMethodInvoker();

    @Test
    void ifExceptionOccursInCalledMethodThenTheExceptionFromMethodShouldPass() {
        ExceptionTestMethod testClass = new ExceptionTestMethod();
        assertThatExceptionOfType(MyException.class).isThrownBy(() ->
                methodInvoker.invoke(testClass, "call", null)
        ).withMessage("hi");
    }

    @Test
    void givenNoArgsMethodThenShouldInvokeMethod() {
        SimpleMethod simpleMethod = new SimpleMethod();

        TypeDescribableObject myName = methodInvoker.invoke(simpleMethod, "myName", null);

        assertThat(myName.getObject()).isEqualTo("myName");
        assertThat(myName.getType()).isEqualTo(String.class);
    }

    @Test
    void givenNoMethodNameUseDefaultMethod() {
        DefaultMethodUse defaultMethodUse = new DefaultMethodUse();
        TypeDescribableObject invoke = methodInvoker.invoke(defaultMethodUse, null, null);
        assertThat(invoke.getObject()).isEqualTo("two");
        assertThat(invoke.getType()).isEqualTo(String.class);
    }

    @Test
    void givenVoidMethodThenObjectIsNullAndTypeIsVoid() {
        VoidMethodClass voidMethodClass = new VoidMethodClass();
        TypeDescribableObject invoke = methodInvoker.invoke(voidMethodClass, "process", null);
        assertThat(invoke.getObject()).isEqualTo(null);
        assertThat(invoke.getType()).isEqualTo(void.class);
    }

    @Test
    void givenParameterizedTypeReturnMethodThenTypeDescribableObjectTypeIsParameterizedType() {
        ParameterizedTypeClass parameterizedTypeClass = new ParameterizedTypeClass();
        TypeDescribableObject parameterizedTypeReturn =
                methodInvoker.invoke(parameterizedTypeClass, "parameterizedTypeReturn", null);
        assertThat(parameterizedTypeReturn.getType()).
                isEqualTo((new TypeReference<List<Map<String, Object>>>() {
                }).getType());
        assertThat(parameterizedTypeReturn.getType()).isInstanceOf(ParameterizedType.class);

    }

    @Test
    void givenPlainTypeReturnMethodThenTypeDescribableObjectTypeIsPlainType() {
        ParameterizedTypeClass parameterizedTypeClass = new ParameterizedTypeClass();
        TypeDescribableObject parameterizedTypeReturn =
                methodInvoker.invoke(parameterizedTypeClass, "plainObject", null);
        assertThat(parameterizedTypeReturn.getType()).isEqualTo(VoidMethodClass.class);
        assertThat(parameterizedTypeReturn.getType()).isInstanceOf(Class.class);
    }

    @Test
    void givenGenericParametersThenInvokeTheMethod() {
        ParameterMethod parameterMethodInstance = new ParameterMethod();
        Context context = new SingleLevelContext();
        context.add("name", new TypeDescribableObject("hi"));
        context.add("addresses", new TypeDescribableObject(
                Arrays.asList("Seoul", "Busan"), new TypeReference<List<String>>() {
        }
        ));

        TypeDescribableObject parameterizedTypeReturn =
                methodInvoker.invoke(parameterMethodInstance, "myName", context);
        assertThat(parameterizedTypeReturn.getObject()).isEqualTo("myName");
    }

    @Test
    void givenNoMatchedMethods() {
        ParameterMethod parameterMethodInstance = new ParameterMethod();
        Context context = new SingleLevelContext();
        context.add("addresses", new TypeDescribableObject(
                Arrays.asList("Seoul", "Busan"), new TypeReference<List<String>>() {
        }
        ));

        TypeDescribableObject parameterizedTypeReturn =
                methodInvoker.invoke(parameterMethodInstance, "myName", context);
        assertThat(parameterizedTypeReturn.getObject()).isEqualTo("myName");
    }

    @Test
    void givenObjectListThenMatchParameterByActualObjectType() {
        Consumer consumer = new Consumer();
        Context context = new SingleLevelContext();
        context.add("dto", new TypeDescribableObject(
                Collections.singletonList(new ConsumerDto("1")), new TypeReference<List<Object>>() {
        }
        ));
        TypeDescribableObject run = methodInvoker.invoke(consumer, "run", context);
        assertThat(run.getObject()).isEqualTo("run");
    }

    @Test
    void givenObjectEmptyListThenMatchParameterByActualObjectType() {
        Consumer consumer = new Consumer();
        Context context = new SingleLevelContext();
        context.add("dto", new TypeDescribableObject(
                Collections.emptyList(), new TypeReference<List<Object>>() {
        }
        ));
        TypeDescribableObject run = methodInvoker.invoke(consumer, "run", context);
        assertThat(run.getObject()).isEqualTo("run");
    }

    @Test
    void givenOptionalParamListThenMatchWithoutTheList() {
        OptionalContainsClass optionalContainsClass = new OptionalContainsClass();
        SingleLevelContext context = new SingleLevelContext();
        context.addOptionalParameter("age");
        context.add("school", new TypeDescribableObject("school1"));

        TypeDescribableObject retMyName = methodInvoker.invoke(optionalContainsClass, "myName", context);
        assertThat(retMyName.getObject()).isEqualTo("school1");

        TypeDescribableObject retSchoolAge = methodInvoker.invoke(optionalContainsClass, "schoolAge", context);
        assertThat(retSchoolAge.getObject()).isEqualTo("school10");
    }

    @Test
    void givenOptionalParamListAndFullMatchedParameterThenUseFullMatched() {
        ParameterMethod parameterMethod = new ParameterMethod();
        SingleLevelContext context = new SingleLevelContext();
        context.addOptionalParameter("name");
        context.add("school", new TypeDescribableObject("school1"));
        context.add("name", new TypeDescribableObject("name1"));

        TypeDescribableObject retMyName = methodInvoker.invoke(parameterMethod, "myName", context);
        assertThat(retMyName.getObject()).isEqualTo("school1name1");
    }

    @Test
    void givenNoResolvedMethodThenKeepSummaryMessageAndStoreDiagnosticsInCause() {
        SummaryOnlyMethod summaryOnlyMethod = new SummaryOnlyMethod();
        SingleLevelContext context = new SingleLevelContext();
        context.add("name", new TypeDescribableObject("name1"));

        Throwable throwable = org.assertj.core.api.Assertions.catchThrowable(
                () -> methodInvoker.invoke(summaryOnlyMethod, "call", context));

        assertThat(throwable)
                .isInstanceOf(MethodInvokeException.class)
                .hasMessage("No suitable method. : Class[invoker.StrictMethodInvokerTest$SummaryOnlyMethod], Method[call]");
        assertThat(throwable.getCause())
                .hasMessageContaining("Context diagnostics:")
                .hasMessageContaining("Candidate diagnostics:")
                .hasMessageContaining("Parameter [message : java.lang.Integer] was not bound.");
    }

    static class Consumer {
        public String run(List<ConsumerDto> dto) {
            return "run";
        }
    }

    static class ConsumerDto {
        private final String id;

        public ConsumerDto(String id) {
            this.id = id;
        }

        public String getId() {
            return id;
        }
    }

    static class ParameterizedTypeClass {
        public List<Map<String, Object>> parameterizedTypeReturn() {
            return new ArrayList<>();
        }

        public VoidMethodClass plainObject() {
            return new VoidMethodClass();
        }
    }

    static class VoidMethodClass {
        public void process() {

        }
    }

    static class DefaultMethodUse {
        public String one() {
            return "one";
        }

        @DefaultMethod
        public String two() {
            return "two";
        }
    }

    static class SimpleMethod {
        public String myName() {
            return "myName";
        }
    }

    static class ExceptionTestMethod {
        public String call() {
            throw new MyException("hi");
        }
    }

    static class MyException extends RuntimeException {
        public MyException(String message) {
            super(message);
        }
    }

    static class ParameterMethod {
        public String myName(String school, String name, List<String> addresses) {
            return "myName";
        }

        public String myName(String name, List<String> addresses) {
            return "myName";
        }

        public String myName(List<String> addresses) {
            return "myName";
        }

        public String myName(String school, String name) {
            return school + name;
        }
    }

    static class OptionalContainsClass {
        public String myName(String school, Integer age) {
            return school + (age == null ? "" : String.valueOf(age));
        }

        public String schoolAge(String school, int age) {
            return school + age;
        }
    }

    static class SummaryOnlyMethod {
        public String call(String name, Integer message) {
            return name + message;
        }
    }
}
