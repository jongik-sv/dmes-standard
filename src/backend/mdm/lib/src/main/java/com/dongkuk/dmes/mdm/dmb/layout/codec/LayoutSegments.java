package com.dongkuk.dmes.mdm.dmb.layout.codec;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 스냅샷 → 절대 바이트 구간(TSK-05-03 design.md §2). 헤더 SEQ 순으로 {@code header.offset + item.offset}, 이어서 본문 항목
 * {@code item.offset}(이미 절대값, F23). 이웃 구간이 겹치거나 비거나 합이 총 길이와 다르면 오류다.
 */
public final class LayoutSegments {

    private LayoutSegments() {
    }

    public static List<LayoutSegment> of(MdmLayoutSnapshot snapshot) {
        List<LayoutSegment> out = new ArrayList<>();
        List<MdmLayoutHeaderRef> headers = new ArrayList<>(snapshot.headers() == null ? List.of() : snapshot.headers());
        headers.sort(Comparator.comparingInt(MdmLayoutHeaderRef::seq));
        for (MdmLayoutHeaderRef h : headers) {
            for (MdmLayoutItemSnapshot i : h.items()) {
                out.add(new LayoutSegment(LayoutSegment.HEADER, h.seq(), h.headerLayoutName(), i, h.offset() + i.offset(), i.length()));
            }
        }
        for (MdmLayoutItemSnapshot i : snapshot.items() == null ? List.<MdmLayoutItemSnapshot>of() : snapshot.items()) {
            out.add(new LayoutSegment(LayoutSegment.BODY, 0, null, i, i.offset(), i.length()));
        }
        out.sort(Comparator.comparingInt(LayoutSegment::offset));
        int at = 0;
        for (LayoutSegment s : out) {
            if (s.offset() != at || s.length() < 1) {
                throw new LayoutCodecException(s.item().seq(), s.item().columnPhys(),
                        "구간이 이어지지 않는다: 기대 위치 " + at + ", 실제 " + s.offset() + "/" + s.length());
            }
            at += s.length();
        }
        if (at != snapshot.totalLength()) {
            throw new LayoutCodecException("구간 합 " + at + " 이 총 길이 " + snapshot.totalLength() + " 와 다르다");
        }
        return List.copyOf(out);
    }
}
