package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 도메인 타입(STRING·NUMBER·DATE·BOOLEAN) → Oracle 물리 타입 대응(physicalOf)과, 모델 컬럼이 도메인에 맞는지 보는 비교(sameType).
 * 둘을 한 파일에 둔다(S2-3, deferred 42) — 어긋나면 엔진이 도메인으로 만든 컬럼이 곧바로 DOMAIN·TYPE 위반이 된다.
 *
 * <p>쓰는 곳: 엔진 copyDomain(addColumn·applyDomain), 표준 판정(ErdStandardJudge), 미리보기(ErdEditService.previewStatus),
 * 다음 단계의 DDL 생성(P3). 물리 타입 표현은 가져오기(ErdImportBuilder.typeOf)와 같다 — TIMESTAMP 는 "TIMESTAMP(n)" 글자에
 * 길이·소수 null, NUMBER(p) 는 (p, 0) 이다. 그래야 DDL 로 만든 표를 다시 가져와도 DB_DIFF 가 비어 있다.
 */
public final class ErdTypeMapping {

    /** 모델 컬럼의 물리 타입 세 값. */
    public record PhysType(String dataType, Integer length, Integer scale) {}

    /** STRING 도메인에 맞는 문자 타입. RAW 는 바이트라 넣지 않는다. */
    static final Set<String> CHAR_TYPES = Set.of("VARCHAR2", "NVARCHAR2", "VARCHAR", "CHAR", "NCHAR");
    /** 정밀도 없이 소수만 있는 NUMBER 도메인에 주는 정밀도(Oracle NUMBER(*,s) 의 정밀도). DDL 은 NUMBER(38,s) 로 쓴다. */
    public static final int NUMBER_MAX_PRECISION = 38;
    private static final Pattern TIMESTAMP = Pattern.compile("^TIMESTAMP\\((\\d+)\\)$");

    private ErdTypeMapping() {
    }

    public static PhysType physicalOf(ErdDomainSpec d) {
        return physicalOf(d.dataType(), d.length(), d.scale());
    }

    /**
     * 도메인 타입 → 물리 타입. 이름은 앞뒤 공백을 지우고 대문자로 맞춰 고른다. 네 논리 타입이 아니면(이미 물리 타입이거나 모르는 타입)
     * 받은 값을 그대로 돌려준다.
     */
    public static PhysType physicalOf(String dataType, Integer length, Integer scale) {
        if (dataType == null) return new PhysType(null, length, scale);
        return switch (dataType.strip().toUpperCase(Locale.ROOT)) {
            case "STRING" -> length == null ? new PhysType("CLOB", null, null) : new PhysType("VARCHAR2", length, null);
            case "NUMBER" -> {
                if (length == null && scale == null) yield new PhysType("NUMBER", null, null);
                if (length == null) yield new PhysType("NUMBER", NUMBER_MAX_PRECISION, scale);
                yield new PhysType("NUMBER", length, scale == null ? 0 : scale);
            }
            case "DATE" -> scale == null ? new PhysType("DATE", null, null) : new PhysType("TIMESTAMP(" + scale + ")", null, null);
            case "BOOLEAN" -> new PhysType("VARCHAR2", 1, null);
            default -> new PhysType(dataType, length, scale);
        };
    }

    /**
     * 모델 컬럼 타입(Oracle 물리 타입)이 도메인 타입에 맞는지 본다. 표준 판정·미리보기·확정 검사·엔진 경고가 모두 이 함수로 비교한다.
     * <ul>
     *   <li>세 값(타입·길이·소수)이 그대로 같으면 맞다 — 물리 타입으로 만든 도메인, 옛 모델에 남은 논리 타입 컬럼.</li>
     *   <li>STRING ↔ 문자 타입. 길이(글자 수)가 같아야 하고, 도메인 길이가 없으면 길이를 보지 않는다. 길이 없는 STRING 은 CLOB 도 맞다.</li>
     *   <li>NUMBER ↔ NUMBER. 정밀도·소수가 같아야 한다. 정밀도가 있는 컬럼의 소수 null 은 0 이다(NUMBER(p) = NUMBER(p,0)).
     *       도메인에 정밀도·소수가 모두 없으면 어떤 NUMBER 든 맞고, 소수만 있으면 소수만 본다.</li>
     *   <li>DATE(scale 없음) ↔ DATE, DATE(scale n) ↔ TIMESTAMP(n). WITH TIME ZONE 계열은 맞지 않는다.</li>
     *   <li>BOOLEAN ↔ 길이 1 문자 타입(Y/N) — DMES 의 _YN 컬럼 관례 VARCHAR2(1 CHAR).</li>
     * </ul>
     */
    public static boolean sameType(ErdColumn c, String dataType, Integer length, Integer scale) {
        if (Objects.equals(c.dataType, dataType) && Objects.equals(c.length, length) && Objects.equals(c.scale, scale)) {
            return true;
        }
        if (c.dataType == null || dataType == null) return false;
        String phys = c.dataType.strip().toUpperCase(Locale.ROOT);
        return switch (dataType.strip().toUpperCase(Locale.ROOT)) {
            case "STRING" -> CHAR_TYPES.contains(phys) && (length == null || length.equals(c.length))
                    || "CLOB".equals(phys) && length == null;
            case "NUMBER" -> "NUMBER".equals(phys) && numberMatches(c, length, scale);
            case "DATE" -> scale == null ? "DATE".equals(phys) : Integer.valueOf(scale).equals(timestampScale(phys));
            case "BOOLEAN" -> CHAR_TYPES.contains(phys) && Integer.valueOf(1).equals(c.length);
            default -> false;
        };
    }

    private static boolean numberMatches(ErdColumn c, Integer length, Integer scale) {
        if (length == null && scale == null) return true;
        // 정밀도가 있는 컬럼의 scale null 은 0 이다. 정밀도 없는 NUMBER 의 scale null 은 "제한 없음" 이라 0 으로 보지 않는다.
        Integer colScale = c.length != null && c.scale == null ? Integer.valueOf(0) : c.scale;
        if (length == null) return scale.equals(colScale);
        return length.equals(c.length) && (scale == null ? 0 : scale) == (colScale == null ? 0 : colScale);
    }

    /** {@code TIMESTAMP(n)} 의 n. 가져오기는 ALL_TAB_COLUMNS.DATA_TYPE 문자열을 그대로 두므로 여기서 푼다. */
    private static Integer timestampScale(String phys) {
        Matcher m = TIMESTAMP.matcher(phys);
        return m.matches() ? Integer.valueOf(m.group(1)) : null;
    }
}
