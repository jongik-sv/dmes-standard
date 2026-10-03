package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 코드 버전 본문 캐시 값(D-154, 스펙 §5.3·§5.4). 두 갈래다.
 * <ul>
 *   <li>{@link #sliced} — MDM 본문(또는 물러남으로 자른 본문). 엔진 {@code codeAt} 행({@link CodeVersionSlice#rows})과 카테고리 → 소속 해시 집합
 *       색인을 적재할 때 한 번 만든다. {@code all} 카테고리는 items 코드 집합 한 벌을 공유한다(복사하지 않는다).</li>
 *   <li>{@link #full} — {@code versioned-feed: off} 의 전 이력 행. {@link #members} 는 늘 빈 값(계산해 두지 않음)이라 해석기가 전체 행으로 계산한다
 *       — 지금 동작과 같고, 호출마다 자르지 않는다.</li>
 * </ul>
 * 코드 → 행 색인(스펙 §5.3 표 첫 줄)은 두지 않는다 — 엔진 해석기가 attr·codeList 에서 {@code codeAt} 행을 훑으므로 쓰는 곳이 없다(ns 급 확장은 범위 밖,
 * 결정 P7). JSON 은 본문 모양({@link #json})이다 — 추정 크기·관리 화면 상세가 쓴다.
 */
public final class MdmCodeVersion {

    private final CodeVersionSlice slice;
    private final CodeRows rows;
    private final Map<String, Set<String>> members;

    private MdmCodeVersion(CodeVersionSlice slice, CodeRows rows, Map<String, Set<String>> members) {
        this.slice = slice;
        this.rows = rows;
        this.members = members;
    }

    public static MdmCodeVersion sliced(CodeVersionSlice slice, CodeHeader header, MdmTocVersion version) {
        CodeRows rows = slice.rows(header, new CodeVersionRow(version.ver(), version.status(), version.applyFrom(), version.applyTo()));
        Set<String> itemCodes = new HashSet<>();
        slice.items().forEach(i -> itemCodes.add(i.code()));
        Set<String> shared = Collections.unmodifiableSet(itemCodes);
        Map<String, Set<String>> index = new HashMap<>();
        for (CodeVersionSlice.SlicedCategory c : slice.categories()) {
            index.put(c.cateId(), c.all() ? shared : Set.copyOf(c.members()));
        }
        return new MdmCodeVersion(slice, rows, Collections.unmodifiableMap(index));
    }

    public static MdmCodeVersion full(CodeRows rows) {
        return new MdmCodeVersion(null, rows, null);
    }

    /** 엔진 {@code CodeLookup.codeAt} 이 줄 행. */
    public CodeRows rows() {
        return rows;
    }

    /** 엔진 {@code CodeEffLookup} 이 줄 값 — sliced 면 늘 값이 있다(본문에 없는 cateId 는 빈 집합), full 이면 빈 값. */
    public Optional<Set<String>> members(String cateId) {
        return slice == null ? Optional.empty() : Optional.of(members.getOrDefault(cateId, Set.of()));
    }

    @JsonValue
    public Object json() {
        return slice != null ? slice : rows;
    }
}
