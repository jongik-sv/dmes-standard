package usecase.order;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class Payment {
    private final PaymentRepository paymentRepository;

    public Payment(PaymentRepository paymentRepository) {
        this.paymentRepository = paymentRepository;
    }

    public void pay() {
        paymentRepository.pay();
    }
}
