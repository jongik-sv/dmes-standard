package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public interface OrderRepository {

    void saveOrder(String key, Integer value, String orderer, String address);
}
