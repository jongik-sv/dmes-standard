package usecase.order;

import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class OrderPlacer {
    private final OrderRepository orderRepository;
    private final StockApi stockApi;

    public OrderPlacer(OrderRepository orderRepository, StockApi stockApi) {
        this.orderRepository = orderRepository;
        this.stockApi = stockApi;
    }

    public boolean isOrderable(OrderRequestDocument orderRequestDocument) {
        Map<String, Integer> orderRequestDetails =
                orderRequestDocument.getOrderRequestDetails();
        int i = 0;
        for (Map.Entry<String, Integer> stringIntegerEntry : orderRequestDetails.entrySet()) {
            i = i + stockApi.reserveProducts(stringIntegerEntry.getKey(), stringIntegerEntry.getValue());
        }
        return i == orderRequestDocument.getTotalQuantity();
    }

    public void placeOrder(OrderRequestDocument orderRequestDocument) {
        Map<String, Integer> orderRequestDetails = orderRequestDocument.getOrderRequestDetails();
        for (Map.Entry<String, Integer> stringIntegerEntry : orderRequestDetails.entrySet()) {
            orderRepository.saveOrder(stringIntegerEntry.getKey(),
                    stringIntegerEntry.getValue(),
                    orderRequestDocument.orderer(),
                    orderRequestDocument.address());
        }
    }
}
