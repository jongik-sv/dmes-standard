package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class OutOfStockApiSpy implements StockApi {
    private int reserveCount;
    private int reserveCancelCount;

    @Override
    public int reserveProducts(String productId, int quantity) {
        return 0;
    }

    @Override
    public int cancelReservationProducts(String productId, int quantity) {
        return 0;
    }

    public int getReserveCount() {
        return reserveCount;
    }

    public int getReserveCancelCount() {
        return reserveCancelCount;
    }
}
