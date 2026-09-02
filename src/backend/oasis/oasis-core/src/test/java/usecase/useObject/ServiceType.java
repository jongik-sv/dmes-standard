package usecase.useObject;

public class ServiceType {
    private final String name;

    public ServiceType() {
        this.name = "self";
    }

    public ServiceType(String name) {
        this.name = name;
    }

    public String service() {
        return name;
    }
}
