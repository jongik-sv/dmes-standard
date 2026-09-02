package sample.order.domain;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
public interface OrderRepository {
    /**
     * @param order order
     * @return order
     */
    Order saveOrder(Order order);

    /**
     * @param orderId id
     * @return order
     */
    Order find(String orderId);
}
