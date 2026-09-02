package usecase.exceptionControll;

/**
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
public class Order {
    public void orderWithRuntimeException() {
        throw new RuntimeException("런타임 익셉숀");
    }
}
