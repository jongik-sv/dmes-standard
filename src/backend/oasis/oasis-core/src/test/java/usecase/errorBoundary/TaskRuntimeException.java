package usecase.errorBoundary;

public class TaskRuntimeException extends RuntimeException {
    public TaskRuntimeException(String message) {
        super(message);
    }
}
