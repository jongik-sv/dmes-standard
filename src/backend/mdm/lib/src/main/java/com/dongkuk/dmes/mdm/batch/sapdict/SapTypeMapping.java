package com.dongkuk.dmes.mdm.batch.sapdict;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmDataType;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainKind;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * SAP {@code DATATYPE} → 마루 도메인 값 정의(TSK-04-05 design.md §4.2 타입 매핑 표, 불변 규칙 I8). 표에 없는 타입은
 * {@link Optional#empty()} 이고 호출자가 {@code UNSUPPORTED_TYPE} 으로 돌린다. 종류 힌트는 값 정의에서 기계적으로
 * 정해지는 두 경우(DATS·TIMS → DATE, QUAN → QTY)만 붙인다.
 */
public final class SapTypeMapping {

    private static final Set<String> STRING_TYPES = Set.of("CHAR", "NUMC", "CLNT", "LANG", "CUKY", "UNIT", "ACCP", "SSTR");
    private static final Set<String> DECIMAL_TYPES = Set.of("DEC", "CURR");
    private static final Set<String> INTEGER_TYPES = Set.of("INT1", "INT2", "INT4", "INT8");

    private SapTypeMapping() {
    }

    /**
     * 마루 값 정의. {@code scale} 은 NUMBER 일 때만 있고, {@code kindHint} 는 없으면 null 이다.
     * 도메인 후보는 이 값 정의로 묶는다(I10) — SAP 도메인 이름은 키에 들어가지 않는다.
     */
    public record ValueDefinition(MdmDataType dataType, Integer length, Integer scale, MdmDomainKind kindHint) {

        /** {@code STRING(20)}, {@code NUMBER(3,1)}, 종류 힌트가 있으면 {@code STRING(8):DATE} 처럼 뒤에 붙인다. */
        public String domainKey() {
            String base = dataType == MdmDataType.NUMBER
                    ? dataType.name() + "(" + length + "," + scale + ")"
                    : dataType.name() + "(" + length + ")";
            return kindHint == null ? base : base + ":" + kindHint.name();
        }
    }

    public static Optional<ValueDefinition> map(String datatype, int leng, int decimals) {
        String type = datatype == null ? "" : datatype.strip().toUpperCase(Locale.ROOT);
        if (STRING_TYPES.contains(type)) {
            return Optional.of(new ValueDefinition(MdmDataType.STRING, leng, null, null));
        }
        if (type.equals("DATS")) {
            // 내부 저장이 8자리 YYYYMMDD 문자라 마루 일자 도메인(문자 8)과 표현이 같다(design.md F11·F13)
            return Optional.of(new ValueDefinition(MdmDataType.STRING, 8, null, MdmDomainKind.DATE));
        }
        if (type.equals("TIMS")) {
            return Optional.of(new ValueDefinition(MdmDataType.STRING, 6, null, MdmDomainKind.DATE));
        }
        if (DECIMAL_TYPES.contains(type)) {
            return Optional.of(new ValueDefinition(MdmDataType.NUMBER, leng, decimals, null));
        }
        if (type.equals("QUAN")) {
            return Optional.of(new ValueDefinition(MdmDataType.NUMBER, leng, decimals, MdmDomainKind.QTY));
        }
        if (INTEGER_TYPES.contains(type)) {
            return Optional.of(new ValueDefinition(MdmDataType.NUMBER, leng, 0, null));
        }
        return Optional.empty();
    }
}
