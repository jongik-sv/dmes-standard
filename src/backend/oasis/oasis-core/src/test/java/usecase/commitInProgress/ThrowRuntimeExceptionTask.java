package usecase.commitInProgress;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
public class ThrowRuntimeExceptionTask {
    public void exception() {
        throw new RuntimeException("예외 발생");
    }
}
