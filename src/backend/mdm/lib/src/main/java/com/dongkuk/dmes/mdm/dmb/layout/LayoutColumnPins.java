package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 레이아웃 확정 때 컬럼 속성 고정(D-151, 스펙 2026-10-02-mdm-object-versioning-design §7 후속 P3-28 — 3단계 최종 검토 I1 의 장기 대책).
 * 확정({@link #pin})은 그 버전 항목 행 전부를 고정 표시하고 확정 시점 사전 유효값(타입·단위·소수, 없으면 NULL)을 쓰며, 확정 취소
 * ({@link #clear})는 표시와 값을 비운다. 새 버전 복사({@link LayoutWriter#copyVersionRows})는 옮기지 않고 DRAFT 저장도 쓰지 않는다 —
 * DRAFT 는 늘 고정 아님이다. 합성은 고정 표시 행이면 NULL 까지 그 값을, 아니면 지금 사전 값을 쓴다({@link LayoutSnapshotAssembler#columnAttrs}).
 *
 * <p>값의 출처는 합성기와 같다 — {@link LayoutDictionary#byPhysNames}(컬럼 → 유효 도메인, 같은 트랜잭션). 그래서 확정 직후 합성은 고정
 * 전과 같다. 전문·헤더 공용이다. 트랜잭션은 부르는 쪽(확정 = OASIS action, 확정 취소 = 공통 엔진)의 것에 합류한다.
 */
@Component
public class LayoutColumnPins {

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final LayoutVersionStore store;

    public LayoutColumnPins(LayoutQueries queries, LayoutDictionary dictionary, LayoutVersionStore store) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.store = store;
    }

    /**
     * 확정 — RELEASED 로 바뀐 이 버전의 항목 행 전부를 고정 표시하고, 물리명 있는 항목마다 지금 사전 유효값을 쓴다. 사전에 없거나 도메인이
     * 없는 컬럼(순환·깨진 사슬 포함)은 "값 없음" 으로 고정된다. 관리 상태의 항목 엔티티가 있으면 옛 값을 쥐므로, 부르는 쪽은 그 전에 영속
     * 컨텍스트를 비우거나 이 뒤에 다시 읽는다.
     *
     * @throws IllegalStateException 고정 표시한 행 수가 그 버전 항목 수와 다를 때(RELEASED 가 아닌 버전 — 확정 뒤에 부르지 않은 잘못된
     *                               호출). 조용히 넘어가면 고정 표시 없는 확정 버전이 생긴다. 부르는 쪽 트랜잭션이 롤백된다
     */
    public void pin(long layoutId, BigDecimal ver) {
        long expected = queries.itemCountOf(layoutId, ver);
        int marked = store.markPinned(layoutId, ver);
        if (marked != expected) {
            throw new IllegalStateException("확정 고정 표시 행 수가 항목 수와 다르다(RELEASED 가 아닌 버전): 레이아웃 " + layoutId + " "
                    + VersionNumbers.label(ver) + " 표시 " + marked + " / 항목 " + expected);
        }
        List<String> phys = queries.columnPhysOf(layoutId, ver);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
        for (String p : phys) {
            LayoutColumnInfo c = dict.get(p);
            store.pinColumnAttrs(layoutId, ver, p, c == null ? null : c.dataType(), c == null ? null : c.unitCode(),
                    c == null ? null : c.scale());
        }
    }

    /** 확정 취소 — DRAFT 로 되돌린 이 버전 항목 행의 고정 표시와 고정값을 비운다. */
    public void clear(long layoutId, BigDecimal ver) {
        store.clearColumnAttrs(layoutId, ver);
    }
}
