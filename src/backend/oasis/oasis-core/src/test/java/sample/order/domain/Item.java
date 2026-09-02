package sample.order.domain;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
public class Item {
    private final String id;
    private final String name;
    private final int price;

    public Item(String id, String name, int price) {
        this.id = id;
        this.name = name;
        this.price = price;
    }
}
