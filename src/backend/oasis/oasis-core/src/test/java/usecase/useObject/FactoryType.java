package usecase.useObject;

public class FactoryType {
    public ServiceType build() {
        return new ServiceType("factory");
    }
}
