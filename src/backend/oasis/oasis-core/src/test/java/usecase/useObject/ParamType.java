package usecase.useObject;

public class ParamType {
    private final String name;

    public ParamType() {
        this.name = "self";
    }

    public ParamType(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }
}
