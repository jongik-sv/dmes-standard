package usecase.order;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
@SuppressFBWarnings({"URF_UNREAD_FIELD", "URF_UNREAD_FIELD"})
@SuppressWarnings("unused")
public class Order {
    private String key;
    private Integer value;
    private String orderer;
    private String address;

    public Order(String key, Integer value, String orderer, String address) {
        this.key = key;
        this.value = value;
        this.orderer = orderer;
        this.address = address;
    }

    public Order() {
    }
}
