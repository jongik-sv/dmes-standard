package usecase.order;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class PaymentRepositorySpy implements PaymentRepository {
    private final List<String> paidList = new ArrayList<>();

    @Override
    public void pay() {
        paidList.add("paid");
    }

    public List<String> getPaidList() {
        return paidList;
    }
}
