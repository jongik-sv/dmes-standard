package client;

import com.dongkuk.oasis.methodinvoker.*;
import com.dongkuk.oasis.methodinvoker.exceptions.MethodInvokeException;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import sample.order.domain.FakeItemRepository;
import sample.order.domain.FakeOrderRepository;
import sample.order.domain.Item;
import sample.order.domain.Order;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * @author Jeongjin Kim
 * @since 2021-03-23
 */
public class OrderFulfilment {
    private MethodInvoker strictMethodInvoker;
    private Context context;

    @BeforeEach
    void setting() {
        strictMethodInvoker = new StrictMethodInvoker();
        context = new SingleLevelContext();

        context.add("orderRepo", new TypeDescribableObject(new FakeOrderRepository()));
        context.add("itemRepo", new TypeDescribableObject(new FakeItemRepository()));
    }

    @Test
    void placeOrder() {
        String fqcn = "sample.order.domain.OrderManager";
        List<String> itemIds = Arrays.asList("hi", "way");
        context.add("itemIds", new TypeDescribableObject(itemIds, new TypeReference<List<String>>() {
        }));

        TypeDescribableObject methodResult = strictMethodInvoker.invoke(fqcn, "placeOrder", context);
        Order object = methodResult.getObject(Order.class);
        List<Item> items = object.getItems();
        Assertions.assertThat(items.size()).isEqualTo(2);
    }

    @Test
    void cancelOrder() {
        String fqcn = "sample.order.domain.OrderManager";
        String orderId = UUID.randomUUID().toString();
        context.add("orderId", new TypeDescribableObject(
                orderId
        ));

        TypeDescribableObject methodResult = strictMethodInvoker.invoke(fqcn, "cancelOrder", context);
        Assertions.assertThat(methodResult.getType()).isEqualTo(void.class);
    }

    @Test
    void cancelOrderByType() {
        String fqcn = "sample.order.domain.OrderManager";
        String orderId = UUID.randomUUID().toString();
        context.add("id", new TypeDescribableObject(
                orderId
        ));

        TypeDescribableObject methodResult = strictMethodInvoker.invoke(fqcn, "cancelOrder", context);
        Assertions.assertThat(methodResult.getType()).isEqualTo(void.class);
    }

    @Test
    void delivery() {
        String fqcn = "sample.order.domain.OrderManager";
        String orderId = UUID.randomUUID().toString();
        context.add("orderId", new TypeDescribableObject(
                        orderId
                )
        );
        TypeDescribableObject methodResult = strictMethodInvoker.invoke(fqcn, "deliveryOrder", context);
        Assertions.assertThat(methodResult.getType()).isEqualTo(void.class);
    }

    @Test
    void givenDeliverOrderByWrongContextKeyThenThrowsException() {
        String fqcn = "sample.order.domain.OrderManager";
        String orderId = UUID.randomUUID().toString();
        context.add("oid", new TypeDescribableObject(
                orderId
        ));

        Assertions.assertThatExceptionOfType(MethodInvokeException.class)
                .isThrownBy(() -> strictMethodInvoker.invoke(fqcn, "deliveryOrder", context))
                .withMessage("No suitable method. : Class[sample.order.domain.OrderManager], Method[deliveryOrder]");
    }

    @Test
    void givenNoMethodNameThenUseDefaultMethod() {
        String fqcn = "sample.order.domain.OrderManager";
        String orderId = UUID.randomUUID().toString();
        context.add("itemId", new TypeDescribableObject(
                orderId
        ));

        TypeDescribableObject methodResult = strictMethodInvoker.invoke(fqcn, null, context);
        Assertions.assertThat(methodResult.getType()).isEqualTo(void.class);
    }

    @Test
    void generic() {
        List<String> strings = new ArrayList<>();
        List<Integer> integers = new ArrayList<>();
        call(strings);
        call(integers);
        Type type = findType(strings.getClass());
        System.out.println(type.getTypeName());
    }

    public void call(Object o) {
        System.out.println(o.getClass().getTypeName());
    }

    public Type findType(Type type) {
        return type;
    }
}
