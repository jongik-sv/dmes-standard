// Pattern: aggregate service that
//   (a) creates a new domain aggregate from incoming DTOs (auto-mapped by name from BPMN context), and
//   (b) handles a single element of a multi-instance loop, throwing a user-visible
//       BizException (a UserException subclass) when business rules fail.

package sample.biz.order;

import sample.biz.cmm.MCC;
import sample.biz.master.ItemMasterEntity;
import sample.biz.master.ItemMasterRepository;
import sample.biz.recipe.dto.RecipeDto;
import sample.biz.buyer.dto.BuyerOrderDto;
import sample.cmn.exception.BizException;
import lombok.RequiredArgsConstructor;

import java.util.List;

/**
 * Order — order generation, linking, mutation, completion.
 */
@RequiredArgsConstructor
public class Order {
    private final OrderRepository orderRepository;
    private final ItemMasterRepository itemRepo;

    /**
     * Bound from BPMN <serviceTask camunda:class="...Order#newOrder">.
     * Receives DTOs auto-mapped by name from the BPMN context.
     */
    public String newOrder(BuyerOrderDto buyerOrderDto, RecipeDto recipeDto) {
        String orderNo = new OrderNoGenerator().newOrderNo(/* sequenceRepo */ null);
        String orderId = new OrderIdGenerator().newOrderId(orderNo);
        OrderEntity entity = new OrderEntity(orderId, orderNo);
        entity.assignToBuyerOrder(
                buyerOrderDto.getBuyerOrderId(),
                buyerOrderDto.getRecipeId(),
                MCC.ORDER_PRG_STS.LINKING);
        orderRepository.save(entity);
        return entity.getOrderId();
    }

    /**
     * Bound from BPMN <serviceTask camunda:class="...Order#cancelRun">.
     * `multiInstanceLoopCharacteristics` 의 `elementVariable="orderId"` 가 한 건씩 들어온다.
     * 비즈니스 검증 실패 시 BizException 을 던지면 OASIS 가 UserException 으로 노출.
     */
    public void cancelRun(String orderId) {
        OrderEntity entity = orderRepository.findById(orderId).orElseThrow();
        if (!entity.getStatus().equals(MCC.ORDER_PRG_STS.IN_PROGRESS)) {
            throw new BizException("Order is not in cancellable state. current=" + entity.getStatus());
        }

        List<ItemMasterEntity> items = itemRepo.findByOrderId(orderId);
        for (ItemMasterEntity item : items) {
            if (!item.getStatus().equals("F1")) {
                throw new BizException(
                        "Cannot cancel: item " + item.getItemNo() + " is at " + item.getStatus());
            }
        }
        entity.cancelRun();
        orderRepository.flush();
    }

    /**
     * Bound from BPMN <serviceTask camunda:class="...Order#updateRoute">.
     * Plain Java task — parameters auto-bound from BPMN context by name.
     */
    public void updateRoute(String orderId, String pri, List<java.util.Map<String, Object>> changes) {
        OrderEntity entity = orderRepository.findById(orderId).orElseThrow();
        entity.updateRoute(pri, changes);
        orderRepository.flush();
    }

    static class OrderNoGenerator { String newOrderNo(Object seq) { return null; } }
    static class OrderIdGenerator { String newOrderId(String orderNo) { return null; } }
}
