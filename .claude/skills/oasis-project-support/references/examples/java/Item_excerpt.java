// Pattern: domain master service that exposes (1) a state-change method bound from
// a BPMN service task, and (2) a boolean validator that drives `#root = false` branches.

package sample.biz.master;

import sample.biz.cmm.MCC;
import sample.biz.master.dto.ItemDto;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class Item {
    private final ItemMasterRepository itemRepo;

    public Item(ItemMasterRepository itemRepo) {
        this.itemRepo = itemRepo;
    }

    /**
     * Bound from BPMN <serviceTask camunda:class="...Item#changeStatus">.
     * `itemId` comes from the service context, `nextStatus` is supplied via
     * <camunda:inputParameter name="nextStatus">K1</camunda:inputParameter>.
     */
    public void changeStatus(String itemId, String nextStatus) {
        ItemMasterEntity entity = findById(itemId);
        entity.changeStatus(nextStatus);
        log.info("item {} status -> {}", itemId, nextStatus);
        itemRepo.flush();
    }

    /**
     * Bound from BPMN <serviceTask camunda:class="...Item#isReady">.
     * Returns boolean — the BPMN sequenceFlow uses `#root = false` to route
     * to an Error End Event when this returns false.
     */
    public boolean isReady(String itemId) {
        ItemDto dto = findByIdToDto(itemId);
        return dto.getStatusCode().equals(MCC.ITEM_STS_CD.READY);
    }

    private ItemMasterEntity findById(String itemId)   { /* repo lookup, throws if missing */ return null; }
    private ItemDto         findByIdToDto(String itemId) { /* repo lookup + map to dto */     return null; }
}
