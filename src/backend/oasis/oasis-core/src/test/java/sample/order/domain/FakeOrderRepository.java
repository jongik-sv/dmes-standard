package sample.order.domain;

import net.datafaker.Faker;

import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
public class FakeOrderRepository implements OrderRepository {
    @Override
    public Order saveOrder(Order order) {
        return order;
    }

    @Override
    public Order find(String orderId) {
        Faker faker = new Faker(Locale.ENGLISH);
        return new Order(UUID.randomUUID().toString(),
                Arrays.asList(
                        new Item(UUID.randomUUID().toString()
                                , faker.food().ingredient()
                                , faker.number().numberBetween(0, 1000))
                        , new Item(UUID.randomUUID().toString()
                                , faker.food().ingredient()
                                , faker.number().numberBetween(0, 1000))
                )
        );
    }
}
