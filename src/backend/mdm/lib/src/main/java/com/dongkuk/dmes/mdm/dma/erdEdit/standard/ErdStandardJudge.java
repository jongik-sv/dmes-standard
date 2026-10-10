package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** 컬럼 표준 판정(스펙 2.1-3). 저장하지 않고 읽을 때 계산한다. */
public final class ErdStandardJudge {

    private ErdStandardJudge() {
    }

    public static Map<String, ErdColumnStatus> judge(ErdModel m, ErdDictionary d) {
        return judge(m, d, m.columns.keySet());
    }

    public static Map<String, ErdColumnStatus> judge(ErdModel m, ErdDictionary d, Collection<String> columnIds) {
        Map<String, Set<String>> typesByPhys = new HashMap<>();
        for (ErdColumn c : m.columns.values()) {
            typesByPhys.computeIfAbsent(c.phys, k -> new HashSet<>()).add(typeKey(c));
        }
        Map<String, ErdColumnStatus> out = new LinkedHashMap<>();
        for (String id : columnIds) {
            ErdColumn c = m.columns.get(id);
            if (c == null) continue;
            ErdColumnStatus s;
            if (d.columnPhys.contains(c.phys)) s = ErdColumnStatus.OK;
            else if (d.aliasPhys.contains(c.phys)) s = ErdColumnStatus.ALIAS;
            else if (d.reverse(c.phys).placeholder()) s = ErdColumnStatus.MISS;
            else s = ErdColumnStatus.NEW;
            if (c.domainId != null) {
                var dom = d.domain(c.domainId);
                if (dom.isPresent() && !sameType(c, dom.get().dataType(), dom.get().length(), dom.get().scale())) {
                    s = s.worse(ErdColumnStatus.DOMAIN);
                }
            }
            if (typesByPhys.getOrDefault(c.phys, Set.of()).size() > 1) s = s.worse(ErdColumnStatus.TYPE);
            out.put(id, s);
        }
        return out;
    }

    static String typeKey(ErdColumn c) {
        return c.dataType + "(" + c.length + "," + c.scale + ")";
    }

    static boolean sameType(ErdColumn c, String dataType, Integer length, Integer scale) {
        return Objects.equals(c.dataType, dataType) && Objects.equals(c.length, length) && Objects.equals(c.scale, scale);
    }
}
