package com.dongkuk.oasis;

import com.dongkuk.oasis.utils.MapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.Map;
import java.util.Set;

class CaseInsensitiveMapTest {

    @Test
    void size() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();

        sut.put("s", "1");
        sut.put("a", "1");
        sut.put("A", "1");

        Assertions.assertThat(sut).hasSize(2);
    }

    @Test
    void get_upper_case() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();
        sut.put("A", "1");
        sut.put("B", "2");

        String a = sut.get("a");

        Assertions.assertThat(a).isEqualTo("1");
    }

    @Test
    void isEmpty() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();

        Assertions.assertThat(sut.isEmpty()).isTrue();
    }

    @Test
    void containsKey() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();

        sut.put("a", "1");
        sut.put("B", "1");

        Assertions.assertThat(sut.containsKey("a")).isTrue();
        Assertions.assertThat(sut.containsKey("A")).isTrue();
        Assertions.assertThat(sut.containsKey("b")).isTrue();
        Assertions.assertThat(sut.containsKey("B")).isTrue();
    }

    @Test
    void containsValue() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();

        sut.put("s", "1");
        sut.put("a", "1");

        Assertions.assertThat(sut.containsValue("1")).isTrue();
    }

    @Test
    void get() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();

        sut.put("a", "1");
        sut.put("B", "2");

        Assertions.assertThat(sut.get("a")).isEqualTo("1");
        Assertions.assertThat(sut.get("A")).isEqualTo("1");
        Assertions.assertThat(sut.get("b")).isEqualTo("2");
        Assertions.assertThat(sut.get("B")).isEqualTo("2");
    }

    @Test
    void put() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();

        String a = sut.put("a", "1");

        Assertions.assertThat(a).isNull();
        Assertions.assertThat(sut.keySet().stream().findFirst().get()).isEqualTo("a");

        a = sut.put("A", "2");
        Assertions.assertThat(a).isEqualTo("1");
        Assertions.assertThat(sut.keySet().stream().findFirst().get()).isEqualTo("A");

    }

    @Test
    void remove_with_same_key_as_inserted() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();
        sut.put("a", "1");

        sut.remove("a");

        Assertions.assertThat(sut.isEmpty()).isTrue();
    }

    @Test
    void remove_with_uppercase_key_of_inserted() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();
        sut.put("a", "1");

        sut.remove("A");

        Assertions.assertThat(sut.isEmpty()).isTrue();
    }

    @Test
    void putAll() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();
        Map<String, String> source = new MapBuilder<String, String>().addEntity("a", "1").build();

        sut.putAll(source);

        Assertions.assertThat(sut).hasSize(1);
    }

    @Test
    void clear() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();
        sut.put("a", "1");

        sut.clear();

        Assertions.assertThat(sut.isEmpty()).isTrue();
    }

    @Test
    void keySet() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();
        sut.put("a", "1");
        sut.put("b", "1");
        sut.put("B", "1");

        Set<String> strings = sut.keySet();

        Assertions.assertThat(strings).hasSize(2);
    }

    @Test
    void values() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();
        sut.put("a", "1");
        sut.put("b", "1");
        sut.put("B", "1");

        Collection<String> values = sut.values();

        Assertions.assertThat(values).hasSize(2);
    }

    @Test
    void entrySet() {
        CaseInsensitiveMap<String> sut = new CaseInsensitiveMap<>();
        sut.put("a", "1");
        sut.put("b", "1");
        sut.put("B", "1");

        Set<Map.Entry<String, String>> entries = sut.entrySet();

        Assertions.assertThat(entries).hasSize(2);
    }
}