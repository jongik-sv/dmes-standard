// Pattern: a `check` validator that receives a domain object via the `$type{...}`
// PropertyEL injection and returns boolean — the BPMN routes the false case to an
// Error End Event with `#root = false` on the sequenceFlow.

package sample.biz.master.checker;

import sample.biz.master.Item;

public class HoldChecker {

    /**
     * `$type{...}` PropertyEL 로 BPMN 컨텍스트의 객체가 Item 타입으로 캐스팅되어 들어온다.
     * 반환값 boolean 은 BPMN sequenceFlow 의 `#root = false` 조건으로 에러 분기에 사용된다.
     */
    public boolean check(Item item) {
        return !item.isHold();
    }
}
