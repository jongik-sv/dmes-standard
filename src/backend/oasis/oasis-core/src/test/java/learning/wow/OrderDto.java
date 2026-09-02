package learning.wow;

/**
 * @author Jeongjin Kim
 * @since 2021-02-15
 */
@SuppressWarnings("CheckStyle")
public class OrderDto {
    private String id;
    private String name;

    public OrderDto(String id, String name) {
        this.id = id;
        this.name = name;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    @Override
    public String toString() {
        return "OrderDto{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                '}';
    }
}
