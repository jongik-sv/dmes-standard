package usecase.order;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class OrderRequestDocument {
    private final Map<String, Integer> data = new HashMap<>();
    private int totalQuantity = 0;

    public void addOrder(Product product, int quantity) {
        if (data.containsKey(product.getProductId())) {
            Integer integer = data.get(product.getProductId());
            data.put(product.getProductId(), integer + quantity);
        } else {
            data.put(product.getProductId(), quantity);
        }
        totalQuantity = totalQuantity + quantity;
    }

    public Map<String, Integer> getOrderRequestDetails() {
        return data;
    }

    public int getTotalQuantity() {
        return totalQuantity;
    }

    public String orderer() {
        return null;
    }

    public String address() {
        return null;
    }
}
