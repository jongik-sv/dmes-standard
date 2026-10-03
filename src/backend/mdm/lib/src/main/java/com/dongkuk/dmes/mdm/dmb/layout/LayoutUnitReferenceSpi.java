package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmUnitReferenceSpi;
import com.dongkuk.dmes.mdm.repository.MdmLayoutItemRepository;
import org.springframework.stereotype.Component;

/**
 * 03 이 구현하는 단위 참조 SPI(D-151 검토) — 레이아웃 항목 행의 단위 FK 두 칸, 확정 고정값 {@code UNIT_CODE}(확정 이후 버전)와 전송 단위
 * {@code TRANS_UNIT}(버전 상태 무관)이 가리키는 단위는 지울 수 없다. 단위 삭제가 commit 때 FK 위반(S999)을 내는 대신 업무 오류로
 * 거부하게 한다. 도메인 단위를 바꾼 뒤 옛 단위를 지우는 흐름에서도 확정 버전이 고정한 단위는 남아 있다.
 */
@Component
public class LayoutUnitReferenceSpi implements MdmUnitReferenceSpi {

    private final MdmLayoutItemRepository items;

    public LayoutUnitReferenceSpi(MdmLayoutItemRepository items) {
        this.items = items;
    }

    @Override
    public String label() {
        return "레이아웃 항목";
    }

    @Override
    public boolean references(String unitCode) {
        return items.existsByUnitCodeOrTransUnit(unitCode, unitCode);
    }
}
