package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 목차 값(D-154, 스펙 §3.1) — {@code {header, versions}}. versions 는 RELEASED 만, ver 수 비교 오름차순. header 는 코드만 쓰고 나머지 대상은 null.
 * {@link #codeRows()} 는 엔진 {@code CodeLookup.code(id)} 가 줄 목차 행 {@code (header, versions, [], [], [])} 이고 만들 때 한 번 계산한다(조회마다
 * 버전 수만큼 새로 만들지 않는다). JSON 에는 header·versions 만 나간다.
 */
public final class MdmToc {

    private final CodeHeader header;
    private final List<MdmTocVersion> versions;
    private final CodeRows codeRows;
    /** ver 키(scale 3) → 버전 — {@link #version} 이 판정마다 버전 전체를 훑으며 문자열을 만들지 않게 한 번 만든다. */
    private final Map<String, MdmTocVersion> byKey;

    @JsonCreator
    public MdmToc(@JsonProperty("header") CodeHeader header, @JsonProperty("versions") List<MdmTocVersion> versions) {
        this.header = header;
        this.versions = versions == null ? List.of() : List.copyOf(versions);
        this.codeRows = new CodeRows(header, this.versions.stream()
                .map(v -> new CodeVersionRow(v.ver(), v.status(), v.applyFrom(), v.applyTo())).toList(), List.of(), List.of(), List.of());
        Map<String, MdmTocVersion> index = new HashMap<>();
        this.versions.forEach(v -> index.putIfAbsent(MdmVersions.key(v.ver()), v));
        this.byKey = Collections.unmodifiableMap(index);
    }

    @JsonProperty("header")
    public CodeHeader header() {
        return header;
    }

    @JsonProperty("versions")
    public List<MdmTocVersion> versions() {
        return versions;
    }

    public CodeRows codeRows() {
        return codeRows;
    }

    /** ver 키(scale 3)가 같은 버전. */
    public Optional<MdmTocVersion> version(String verKey) {
        return Optional.ofNullable(byKey.get(verKey));
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmToc t && Objects.equals(header, t.header) && versions.equals(t.versions);
    }

    @Override
    public int hashCode() {
        return Objects.hash(header, versions);
    }

    @Override
    public String toString() {
        return "MdmToc[header=" + header + ", versions=" + versions + "]";
    }
}
