package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class ShippingApiSpy implements ShippingApi {
    private int count;

    @Override
    public void requestGoodIssue() {
        count++;
    }

    public int getCount() {
        return count;
    }
}
