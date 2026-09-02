package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public interface StockApi {
    int reserveProducts(String productId, int quantity);

    int cancelReservationProducts(String productId, int quantity);
}
