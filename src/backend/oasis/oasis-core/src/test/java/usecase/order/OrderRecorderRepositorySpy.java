package usecase.order;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class OrderRecorderRepositorySpy implements OrderRecorderRepository {
    private final List<OrderRequestDocument> orders = new ArrayList<>();

    @Override
    public int saveOrder(OrderRequestDocument order) {
        orders.add(order);
        return orders.size();
    }

    public List<OrderRequestDocument> getOrders() {
        return orders;
    }
}
