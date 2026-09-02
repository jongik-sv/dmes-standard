package usecase.errorBoundary;

public class OtherRuntimeException extends RuntimeException {
    public OtherRuntimeException(String message) {
        super(message);
    }
}
