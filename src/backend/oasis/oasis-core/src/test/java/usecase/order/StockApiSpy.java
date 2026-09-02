package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class StockApiSpy implements StockApi {
    private int reserveCount;
    private int reserveCancelCount;

    @Override
    public int reserveProducts(String productId, int quantity) {
        reserveCount = reserveCount + quantity;
        return quantity;
    }

    @Override
    public int cancelReservationProducts(String productId, int quantity) {
        reserveCount = reserveCount - quantity;
        return quantity;
    }

    public int getReserveCount() {
        return reserveCount;
    }

    public int getReserveCancelCount() {
        return reserveCancelCount;
    }
}
