package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.metarev.LayoutColumnUsers;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 03 이 구현하는 메타 기록 펼침 SPI(검토 I1, Ruling P3-28 — D-151 확정 고정 뒤에는 무해한 캐시 무효화로 남긴다, {@link LayoutColumnUsers}).
 * 영향 전문 목록({@link LayoutImpactFinder#itemsUsing})과 같은 조회({@link LayoutQueries#itemsUsingColumns})를 쓰되 거르는 기준이
 * 다르다 — 영향 목록은 화면용이라 닫힌(PAST) 버전을 빼고 DRAFT 를 넣지만, 메타 피드는 RELEASED 버전 전체(지난 구간 포함)를 내주므로
 * 여기서는 RELEASED 만, PAST 도 넣는다. 이행 전 스냅샷 버전(LEGACY)은 저장된 스냅샷을 그대로 내줘 사전과 무관하므로 뺀다. 헤더면 헤더 확정
 * 기록과 같은 {@link LayoutQueries#withStackingMessages}(헤더 자신 + 쌓은 전문, 버전 무관 — 넉넉히 펼친다)로 펼친다.
 */
@Component
public class LayoutColumnUsersSpi implements LayoutColumnUsers {

    private static final String HEADER = "HEADER";

    private final LayoutQueries queries;

    public LayoutColumnUsersSpi(LayoutQueries queries) {
        this.queries = queries;
    }

    @Override
    public Set<Long> layoutIdsUsing(Collection<String> physNames) {
        Set<Long> out = new LinkedHashSet<>();
        Set<Long> headersDone = new HashSet<>();
        for (List<String> chunk : LayoutQueries.chunks(physNames)) {
            for (Object[] r : queries.itemsUsingColumns(chunk)) {
                MdmLayout l = (MdmLayout) r[1];
                MdmLayoutVer v = (MdmLayoutVer) r[2];
                if (!v.isReleased() || v.isLegacySnapshot()) {
                    continue;
                }
                if (!HEADER.equals(l.getLayoutKind())) {
                    out.add(l.getLayoutId());
                } else if (headersDone.add(l.getLayoutId())) {
                    out.addAll(queries.withStackingMessages(l.getLayoutId()));
                }
            }
        }
        return out;
    }
}
