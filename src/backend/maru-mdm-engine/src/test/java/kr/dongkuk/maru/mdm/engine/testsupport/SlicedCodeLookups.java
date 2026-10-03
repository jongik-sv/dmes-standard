package kr.dongkuk.maru.mdm.engine.testsupport;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlicer;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 업무 모듈 새 경로(D-154)를 엔진 안에서 흉내 낸다 — 원장 → RELEASED 투영 → 목차({@code code}: 헤더·버전만)·버전 본문({@code codeAt}: 자른 본문의
 * {@code rows})·소속({@code codeEff}: 본문의 {@code membersOf}). {@code withEff} 가 거짓이면 {@link CodeEffLookup#NONE} 으로 합성 cateItems 경로를 본다.
 */
public final class SlicedCodeLookups {

    private SlicedCodeLookups() {}

    public static DefaultCodeResolver resolver(CodeRows full, boolean withEff) {
        CodeRows projected = CodeRowsProjection.releasedOnly(full);
        String id = projected.header().maruCodeId();
        Map<BigDecimal, CodeVersionSlice> slices = new ConcurrentHashMap<>();
        CodeLookup lookup = new CodeLookup() {
            @Override
            public Optional<CodeRows> code(String maruCodeId) {
                return id.equals(maruCodeId)
                        ? Optional.of(new CodeRows(projected.header(), projected.versions(), List.of(), List.of(), List.of()))
                        : Optional.empty();
            }

            @Override
            public Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) {
                if (!id.equals(maruCodeId)) {
                    return Optional.empty();
                }
                CodeVersionRow row = projected.versions().stream().filter(v -> v.ver().compareTo(ver) == 0).findFirst().orElseThrow();
                return Optional.of(slice(ver).rows(projected.header(), row));
            }

            private CodeVersionSlice slice(BigDecimal ver) {
                return slices.computeIfAbsent(ver.stripTrailingZeros(), k -> CodeVersionSlicer.slice(projected, ver));
            }
        };
        CodeEffLookup eff = withEff
                ? (maruCodeId, ver, cateId) -> lookup.codeAt(maruCodeId, ver).isEmpty() ? Optional.empty()
                        : Optional.of(slices.get(ver.stripTrailingZeros()).membersOf(cateId))
                : CodeEffLookup.NONE;
        return new DefaultCodeResolver(lookup, eff);
    }
}
