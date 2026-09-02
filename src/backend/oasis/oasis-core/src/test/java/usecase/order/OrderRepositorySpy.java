package usecase.order;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class OrderRepositorySpy implements OrderRepository {
    private final List<Order> orderList = new ArrayList<>();

    @Override
    public void saveOrder(String key, Integer value, String orderer, String address) {
        Order order = new Order(key, value, orderer, address);
        orderList.add(order);
    }

    public List<Order> getOrderList() {
        return orderList;
    }
}
