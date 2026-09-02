package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class OrderRecorder {
    private final OrderRecorderRepository orderRecorderRepository;

    public OrderRecorder(OrderRecorderRepository orderRecorderRepository) {
        this.orderRecorderRepository = orderRecorderRepository;
    }

    public void record(OrderRequestDocument orderRequestDocument) {
        orderRecorderRepository.saveOrder(orderRequestDocument);
    }
}
