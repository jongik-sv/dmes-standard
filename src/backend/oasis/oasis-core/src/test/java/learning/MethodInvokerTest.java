package learning;

import com.dongkuk.oasis.process.VarietyReturnMethods;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import com.dongkuk.oasis.methodinvoker.MethodInvoker;
import com.dongkuk.oasis.methodinvoker.StrictMethodInvoker;
import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

/**
 * @author Jeongjin Kim
 * @since 2021-04-12
 */
@SuppressFBWarnings("DLS_DEAD_LOCAL_STORE")
@SuppressWarnings("unused")
public class MethodInvokerTest {
    @Test
    void call() throws NoSuchMethodException {
        MethodInvoker methodInvoker = new StrictMethodInvoker();
        TypeDescribableObject listMap = methodInvoker.invoke(VarietyReturnMethods.class, "listMap", null);
        System.out.println(listMap.getObject());
        Method listMap1 = VarietyReturnMethods.class.getMethod("listMap", (Class<?>[]) null);

    }

    @Test
    void voidMethodCall() {
        MethodInvoker methodInvoker = new StrictMethodInvoker();
        TypeDescribableObject listMap = methodInvoker.invoke(VarietyReturnMethods.class, "noReturnValue", null);
        Assertions.assertThat(((Class<?>) listMap.getType()).getName()).isEqualTo("void");
    }
}
