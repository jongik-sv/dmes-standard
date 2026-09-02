package sample.order.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
public class Order {
    private final String orderId;
    private final List<Item> items;
    private OrderStatus orderStatus;

    public Order(String orderId, List<Item> items) {
        this.orderId = orderId;
        this.items = items;
        orderStatus = OrderStatus.PLACED;
    }

    public void cancelItem(Item item) {
        items.remove(item);
        this.orderStatus = OrderStatus.CANCELLED;
    }

    public Order duplicateOrder(String orderId) {
        return new Order(orderId, new ArrayList<>(items));
    }

    public String getOrderId() {
        return orderId;
    }

    public List<Item> getItems() {
        return items;
    }

    public void cancel() {
        System.out.println("Order canceled of " + orderId);
        orderStatus = OrderStatus.CANCELLED;
    }
}
