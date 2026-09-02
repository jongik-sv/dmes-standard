package learning.wow;

import com.dongkuk.oasis.methodinvoker.Context;
import com.dongkuk.oasis.methodinvoker.MethodInvoker;
import com.dongkuk.oasis.methodinvoker.StrictMethodInvoker;
import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-02-15
 */
public class DynamicOrder {
    @Test
    void placeOrder() {
        Context serviceContext = mock(Context.class);
        given(serviceContext.hasKey("orderDto")).willReturn(true);
        given(serviceContext.getValueByKey("orderDto")).willReturn(
                new TypeDescribableObject(new OrderDto("id#1", "foo"))
        );

        String className = "learning.wow.Order";
        String name = "placeOrder";
        MethodInvoker methodInvoker = new StrictMethodInvoker();
        TypeDescribableObject invoke =
                methodInvoker.invoke(className, name, serviceContext);

        Assertions.assertThat(invoke.getObject()).isNull();
    }
}
