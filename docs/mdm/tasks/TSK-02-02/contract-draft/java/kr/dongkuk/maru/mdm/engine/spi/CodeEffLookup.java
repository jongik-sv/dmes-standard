package kr.dongkuk.maru.mdm.engine.spi;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.Set;

/**
 * 미리 계산한 (마루 코드, 버전, 카테고리) 코드 집합 — 사본의 {@code TB_MDM_CODE_CATE_EFF}(04:732).
 * 소급은 적재할 때 이미 적용돼 있다. 판정과 콤보는 이것으로 한 번 찾는다.
 *
 * <p>원장 서버 구현체는 늘 빈 값을 돌려주고, 그러면 {@code engine.code} 가 {@link CodeLookup} 행으로 해석한다(06:461).
 * 빈 값은 "계산해 두지 않았다"이고, 빈 집합은 "소속 코드가 없다"이다.
 */
public interface CodeEffLookup {

    Optional<Set<String>> codes(String maruCodeId, BigDecimal ver, String cateId);

    /** 원장 서버용 — 늘 빈 값. */
    CodeEffLookup NONE = (id, ver, cate) -> Optional.empty();
}
