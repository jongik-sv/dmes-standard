package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public interface OrderRecorderRepository {
    int saveOrder(OrderRequestDocument order);
}
