package sample.order.domain;

import com.dongkuk.oasis.methodinvoker.annotations.ParameterQualifier;
import com.dongkuk.oasis.methodinvoker.annotations.DefaultMethod;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
public class OrderManager {
    private final OrderRepository orderRepository;
    private final ItemRepository itemRepository;

    public OrderManager(OrderRepository orderRepository, ItemRepository itemRepository) {
        this.orderRepository = orderRepository;
        this.itemRepository = itemRepository;
    }

    public Order placeOrder(List<String> itemIds) {
        List<Item> itemList = new ArrayList<>();
        for (String itemId : itemIds) {
            itemList.add(itemRepository.find(itemId));
        }
        System.out.println("Order placed");
        return orderRepository.saveOrder(new Order(UUID.randomUUID().toString(), itemList));
    }

    public void cancelOrder(CharSequence orderId) {
        System.out.println(orderId);
        Order order = orderRepository.find((String) orderId);
        order.cancel();
        orderRepository.saveOrder(order);
    }

    public void deliveryOrder(CharSequence oid,
                              @ParameterQualifier("orderId") CharSequence oid2) {
        System.out.println("delivery");
        System.out.println(oid);
        System.out.println(oid2);

    }

    @DefaultMethod
    public void removeItem(String itemId) {
        System.out.println("remove item");
    }
}
