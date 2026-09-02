package learning.wow;

import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-02-15
 */
public interface OrderRepository {
    /**
     * @return 미완성된 오더
     */
    List<MyDto> uncompletedOrders();

    /**
     * @param order 오더
     * @return 저장결과
     */
    int saveOrder(Order order);
}
