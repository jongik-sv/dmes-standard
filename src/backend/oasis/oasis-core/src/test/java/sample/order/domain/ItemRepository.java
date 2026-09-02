package sample.order.domain;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
public interface ItemRepository {
    Item find(String itemId);
}
