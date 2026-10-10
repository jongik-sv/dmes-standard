package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 컬럼 표준 판정(스펙 2.1-3). 저장하지 않고 읽을 때 계산한다. */
public final class ErdStandardJudge {

    /** STRING 도메인에 맞는 문자 타입. RAW 는 바이트라 넣지 않는다. */
    private static final Set<String> CHAR_TYPES = Set.of("VARCHAR2", "NVARCHAR2", "VARCHAR", "CHAR", "NCHAR");
    private static final Pattern TIMESTAMP = Pattern.compile("^TIMESTAMP\\((\\d+)\\)$");

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

    /**
     * 모델 컬럼 타입(Oracle 물리 타입)이 도메인 타입에 맞는지 본다. 표준 판정·미리보기(ErdEditService.previewStatus)·
     * 확정 검사·엔진 경고가 모두 judge 를 거쳐 이 함수 하나로 비교한다.
     * <ul>
     *   <li>세 값(타입·길이·소수)이 그대로 같으면 맞다 — 도메인 타입을 그대로 복사한 컬럼, 물리 타입으로 만든 시험 도메인.</li>
     *   <li>STRING ↔ VARCHAR2·NVARCHAR2·VARCHAR·CHAR·NCHAR. 길이(글자 수)가 같아야 하고, 도메인 길이가 없으면 길이를 보지 않는다.</li>
     *   <li>NUMBER ↔ NUMBER. 정밀도(length)·소수(scale)가 같아야 한다. Oracle NUMBER(p) 는 NUMBER(p,0) 이고 가져오기는
     *       (19,0) 을 주므로 정밀도가 있으면 scale null 을 0 으로 본다. 도메인 정밀도·소수가 모두 없으면 어떤 NUMBER 든 맞다.</li>
     *   <li>DATE(scale 없음) ↔ DATE, DATE(scale n) ↔ TIMESTAMP(n). WITH TIME ZONE 계열은 맞지 않는다.</li>
     *   <li>BOOLEAN ↔ 길이 1 문자 타입(Y/N) — DMES 의 _YN 컬럼 관례 VARCHAR2(1 CHAR).</li>
     *   <li>도메인 타입이 없거나 이 넷이 아니면 위 첫 줄(그대로 같음)만 본다.</li>
     * </ul>
     */
    static boolean sameType(ErdColumn c, String dataType, Integer length, Integer scale) {
        if (Objects.equals(c.dataType, dataType) && Objects.equals(c.length, length) && Objects.equals(c.scale, scale)) {
            return true;
        }
        if (c.dataType == null || dataType == null) return false;
        String phys = c.dataType.strip().toUpperCase(Locale.ROOT);
        return switch (dataType.strip().toUpperCase(Locale.ROOT)) {
            case "STRING" -> CHAR_TYPES.contains(phys) && (length == null || length.equals(c.length));
            case "NUMBER" -> "NUMBER".equals(phys) && (length == null && scale == null
                    || Objects.equals(c.length, length) && zeroIfNull(c.scale) == zeroIfNull(scale));
            case "DATE" -> scale == null ? "DATE".equals(phys) : Integer.valueOf(scale).equals(timestampScale(phys));
            case "BOOLEAN" -> CHAR_TYPES.contains(phys) && Integer.valueOf(1).equals(c.length);
            default -> false;
        };
    }

    private static int zeroIfNull(Integer v) {
        return v == null ? 0 : v;
    }

    /** {@code TIMESTAMP(n)} 의 n. 가져오기는 ALL_TAB_COLUMNS.DATA_TYPE 문자열을 그대로 두므로 여기서 푼다. */
    private static Integer timestampScale(String phys) {
        Matcher m = TIMESTAMP.matcher(phys);
        return m.matches() ? Integer.valueOf(m.group(1)) : null;
    }
}
