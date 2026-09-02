package sample.order.domain;

import net.datafaker.Faker;

import java.util.Locale;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
public class FakeItemRepository implements ItemRepository {
    Faker faker = new Faker(Locale.ENGLISH);

    @Override
    public Item find(String itemId) {
        return new Item(itemId, faker.food().ingredient(), faker.number().numberBetween(0, 10000));
    }
}
