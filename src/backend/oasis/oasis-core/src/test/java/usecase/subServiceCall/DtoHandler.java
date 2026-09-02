package usecase.subServiceCall;

public class DtoHandler {
    public String handle(NameDto dto) {
        return "hello" + dto.getName();
    }
}
