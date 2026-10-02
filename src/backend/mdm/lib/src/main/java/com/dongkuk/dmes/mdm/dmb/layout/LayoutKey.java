package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.math.BigDecimal;
import java.util.Objects;

/** (레이아웃, 버전) 키 — 맵 키로 쓰므로 버전은 compareTo 로 같다. */
public record LayoutKey(long layoutId, BigDecimal ver) {

    public LayoutKey {
        ver = VersionNumbers.scaled(ver);
    }

    public static LayoutKey of(MdmLayoutVer v) {
        return new LayoutKey(v.getLayoutId(), v.getVer());
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof LayoutKey k && layoutId == k.layoutId && VersionNumbers.same(ver, k.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(layoutId, ver == null ? null : ver.stripTrailingZeros());
    }
}
