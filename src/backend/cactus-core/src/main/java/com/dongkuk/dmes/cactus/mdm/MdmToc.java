package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;
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
 *
 * <p>코드 목차 행의 null 일시: 엔진 {@code CodeVersions.select} 는 applyFrom·applyTo 를 null 검사 없이 비교한다(엔진 {@code CodeLookup} 계약은 열린 끝을
 * {@code 9999-12-31T00:00} 으로 싣는다). 그래서 {@link #codeRows()} 를 만들 때만 applyTo null 은 그 열린 끝으로, applyFrom null 은
 * {@link LocalDateTime#MAX}(어떤 시각도 덮지 않는다 — 룰·세트·전문의 "시작이 없으면 담지 않는다"와 같다. 가장 작은 ver 소급 후보로는 남는다)로 바꾼다.
 * {@link #versions()}·JSON·경계 계산은 받은 값 그대로다.
 */
public final class MdmToc {

    /** 엔진 코드 행의 열린 끝({@code CodeLookup} 계약). */
    static final LocalDateTime OPEN_END = LocalDateTime.of(9999, 12, 31, 0, 0);

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
                .map(v -> new CodeVersionRow(v.ver(), v.status(), v.applyFrom() == null ? LocalDateTime.MAX : v.applyFrom(),
                        v.applyTo() == null ? OPEN_END : v.applyTo())).toList(), List.of(), List.of(), List.of());
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
