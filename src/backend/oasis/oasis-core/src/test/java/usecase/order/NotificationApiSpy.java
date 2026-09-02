package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class NotificationApiSpy implements NotificationApi {
    private int count;

    @Override
    public void notifyToCustomer() {
        count++;
    }

    public int getCount() {
        return count;
    }
}
