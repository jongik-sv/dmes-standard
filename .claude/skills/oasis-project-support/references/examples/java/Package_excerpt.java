// Pattern: simple `isXxx` boolean validator bound from a BPMN service task.
// Lookup-or-throw style: when the lookup fails, throw a UserException-derived
// BizException so OASIS exposes the message in `serviceResult.exception()`.

package sample.biz.process;

import sample.biz.master.ItemMasterRepository;
import sample.cmn.exception.BizException;

public class Package {
    private final ItemMasterRepository itemMasterRepository;
    private final PackageRepository packageRepository;

    public Package(ItemMasterRepository itemMasterRepository,
                   PackageRepository packageRepository) {
        this.itemMasterRepository = itemMasterRepository;
        this.packageRepository = packageRepository;
    }

    /**
     * 검증성 task — 메서드 이름이 `isXxx`, 반환 boolean.
     * BPMN 에서 sequenceFlow 의 `#root = false` 로 에러 분기를 만든다.
     */
    public boolean isPacked(String itemId) {
        PackageEntity pkg = packageRepository
                .findTopByItemIdAndCancelYn(itemId, false)
                .orElseThrow(() -> new BizException("Pack record not found."));
        return pkg != null;
    }
}
