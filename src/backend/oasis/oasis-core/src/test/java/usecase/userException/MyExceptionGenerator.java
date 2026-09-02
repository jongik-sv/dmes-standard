package usecase.userException;

/**
 * @author Jeongjin Kim
 * @since 2021-08-19
 */
public class MyExceptionGenerator {
    public void makeException() {
        throw new ValidationException("검증 예외");
    }

    public void makeRuntimeException() {
        throw new RuntimeException("런타임 예외");
    }
}
