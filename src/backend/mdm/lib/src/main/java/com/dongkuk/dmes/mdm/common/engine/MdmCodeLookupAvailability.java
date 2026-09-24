package com.dongkuk.dmes.mdm.common.engine;

import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * "서버용 {@link CodeLookup} 구현체가 있는가"를 한 곳에서 답한다(TSK-04-03 design.md §2, D2). 없으면(04 원장 미구축)
 * R10 을 거부하지 않고 경고 W02 로 두고, {@code MASTER} 가 든 판정은 UNDECIDED 로 둔다. TSK-06-01 이 빈을 등록하면
 * 자동으로 켜진다.
 */
@Component
public class MdmCodeLookupAvailability {

    private final CodeLookup lookup;

    @Autowired
    public MdmCodeLookupAvailability(ObjectProvider<CodeLookup> codes) {
        this(codes.getIfAvailable());
    }

    private MdmCodeLookupAvailability(CodeLookup lookup) {
        this.lookup = lookup;
    }

    /** 테스트·조립용. null 이면 원장 없음. */
    public static MdmCodeLookupAvailability of(CodeLookup lookup) {
        return new MdmCodeLookupAvailability(lookup);
    }

    public boolean available() {
        return lookup != null;
    }

    public Optional<CodeLookup> lookup() {
        return Optional.ofNullable(lookup);
    }
}
