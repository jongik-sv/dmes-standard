package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.util.List;

/**
 * 확정 때 버전 행에 남기는 본문 스냅샷. 헤더는 ID 만 담는다 — 헤더 내용은 판정 시각에 고른다(K1). 항목 offset 은 저장값 그대로(헤더
 * 버전은 헤더 안 상대, 전문 버전은 본문 기준 상대). LEGACY 스냅샷(MdmLayoutSnapshot)과 모양이 다르다 — 읽는 쪽은
 * {@link MdmLayoutVer#isLegacySnapshot()} 으로 가른다.
 */
public record LayoutBodySnapshot(long layoutId, String ver, String layoutKind, String layoutName, String eaiCode, String sndSystem,
                                 String rcvSystem, int ownLength, List<Long> headerIds, List<Const> consts,
                                 List<MdmLayoutItemSnapshot> items) {

    public record Const(long headerLayoutId, String headerColumnPhys, String value) {
    }

    public static LayoutBodySnapshot of(MdmLayout layout, MdmLayoutVer v, List<MdmLayoutHeader> stack, List<MdmLayoutConst> consts,
                                        List<MdmLayoutItemSnapshot> items) {
        return new LayoutBodySnapshot(layout.getLayoutId(), VersionNumbers.plain(v.getVer()), layout.getLayoutKind(),
                layout.getLayoutName(), v.getEaiCode(), layout.getSndSystem(), layout.getRcvSystem(), v.getOwnLength(),
                stack.stream().map(MdmLayoutHeader::getHeaderLayoutId).toList(),
                consts.stream().map(c -> new Const(c.getHeaderLayoutId(), c.getHeaderColumnPhys(), c.getConstValue())).toList(),
                List.copyOf(items));
    }
}
