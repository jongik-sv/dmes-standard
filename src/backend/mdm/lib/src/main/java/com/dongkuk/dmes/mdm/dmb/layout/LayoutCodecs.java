package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutParser;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutSerializer;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutUnitTable;
import com.dongkuk.dmes.mdm.entity.MdmUnit;
import com.dongkuk.dmes.mdm.repository.MdmUnitRepository;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * 직렬화기·파서 조립(TSK-05-03 design.md §2, D9). 단위 환산 계수는 단위 마스터가 레이아웃과 별도 배포 대상이라(03:46) 스냅샷에
 * 넣지 않고 {@code TB_MDM_UNIT} 에서 부를 때마다 읽는다. codec 은 이 클래스를 모른다(I11).
 */
@Component
public class LayoutCodecs {

    private final MdmUnitRepository unitRepository;

    public LayoutCodecs(MdmUnitRepository unitRepository) {
        this.unitRepository = unitRepository;
    }

    public LayoutUnitTable units() {
        List<LayoutUnitTable.Unit> list = new ArrayList<>();
        for (MdmUnit u : unitRepository.findAll()) {
            list.add(new LayoutUnitTable.Unit(u.getUnitCode(), u.getDimension(), u.getFactor()));
        }
        return LayoutUnitTable.of(list);
    }

    public LayoutSerializer serializer() {
        return new LayoutSerializer(units());
    }

    public LayoutParser parser() {
        return new LayoutParser(units());
    }
}
