package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;

/** 한 묶음을 처리하는 작업 사본과 상태. */
final class Ctx {
    static final String REV = "_rev";
    /** 명령이 고치지 않는 속성 — restore 가 값을 써도 _rev 를 찍지 않는다(deferred 51). */
    static final Set<String> UNSTAMPED = Set.of("candidateRank");

    record Key(String kind, String id) {}

    final ErdModel m;
    final long baseRev;
    final long newRev;
    final String session;
    final LinkedHashMap<Key, JsonNode> before = new LinkedHashMap<>();
    final List<ErdWarning> warnings = new ArrayList<>();
    int index;

    Ctx(ErdModel m, long baseRev, long newRev, String session) {
        this.m = m;
        this.baseRev = baseRev;
        this.newRev = newRev;
        this.session = session;
    }

    /** 고치기 전 상태를 처음 한 번만 담는다(역명령·델타 재료). */
    void touch(String kind, String id) {
        // computeIfAbsent 는 null 값을 담지 않는다 — 새로 만든 요소(이전 상태 null)도 기록해야 델타·역명령에 들어간다.
        Key key = new Key(kind, id);
        if (!before.containsKey(key)) before.put(key, snapshot(kind, id));
    }

    JsonNode snapshot(String kind, String id) {
        Object o = switch (kind) {
            case "table" -> m.tables.get(id);
            case "column" -> m.columns.get(id);
            case "key" -> m.keys.get(id);
            case "relation" -> m.relations.get(id);
            default -> throw new IllegalArgumentException(kind);
        };
        return o == null ? null : ErdModelCodec.MAPPER.valueToTree(o);
    }

    JsonNode node(Object element) {
        return ErdModelCodec.MAPPER.valueToTree(element);
    }

    void put(String kind, String id, JsonNode value) {
        var mapper = ErdModelCodec.MAPPER;
        try {
            switch (kind) {
                case "table" -> { if (value == null) m.tables.remove(id); else m.tables.put(id, mapper.treeToValue(value, ErdTable.class)); }
                case "column" -> { if (value == null) m.columns.remove(id); else m.columns.put(id, mapper.treeToValue(value, ErdColumn.class)); }
                case "key" -> { if (value == null) m.keys.remove(id); else m.keys.put(id, mapper.treeToValue(value, ErdKey.class)); }
                case "relation" -> { if (value == null) m.relations.remove(id); else m.relations.put(id, mapper.treeToValue(value, ErdRelation.class)); }
                default -> throw new IllegalArgumentException(kind);
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw invalid("요소 JSON 을 읽을 수 없습니다: " + id, "restore 값은 getChangesSince 가 준 값을 그대로 쓰세요", id, null);
        }
        if (value == null) m.tombstones.put(id, new PropRev(newRev, session)); else m.tombstones.remove(id);
    }

    Map<String, PropRev> revOf(String kind, String id) {
        return switch (kind) {
            case "table" -> m.tables.get(id).rev;
            case "column" -> m.columns.get(id).rev;
            case "key" -> m.keys.get(id).rev;
            case "relation" -> m.relations.get(id).rev;
            default -> throw new IllegalArgumentException(kind);
        };
    }

    void stamp(Map<String, PropRev> rev, Collection<String> props) {
        for (String p : props) rev.put(p, new PropRev(newRev, session));
    }

    void checkConflict(Map<String, PropRev> rev, Collection<String> props, String elementId, JsonNode current) {
        for (String p : props) {
            PropRev pr = rev.get(p);
            if (pr != null && !pr.session().equals(session) && pr.rev() > baseRev) {
                throw conflict(elementId, p, pr, current == null ? null : current.get(p),
                        "다른 세션(" + pr.session() + ")이 rev " + pr.rev() + " 에서 먼저 고쳤습니다",
                        "getChangesSince(" + baseRev + ") 로 최신 값을 읽고 다시 보내세요");
            }
        }
    }

    void requireKnownKeys(Map<String, Object> set, Set<String> allowed, String elementId) {
        if (set == null || set.isEmpty()) throw invalid("set 이 비었습니다", "고칠 속성을 넣으세요", elementId, null);
        for (String k : set.keySet()) {
            if (!allowed.contains(k)) throw invalid("고칠 수 없는 속성입니다: " + k, "허용: " + allowed, elementId, k);
        }
    }

    /** 요소 JSON 의 {@code _rev} 에 속성별 이번 rev·세션을 적는다(restore 가 JSON 단계에서 고칠 때 쓴다). UNSTAMPED 는 건너뛴다. */
    void stampNode(ObjectNode node, Collection<String> props) {
        ObjectNode revs = node.get(REV) instanceof ObjectNode o ? o : node.putObject(REV);
        for (String p : props) {
            if (UNSTAMPED.contains(p)) continue;
            ObjectNode pr = revs.putObject(p);
            pr.put("rev", newRev);
            pr.put("session", session);
        }
    }

    /** 숫자는 표현(Int/Long)이 달라도 값이 같으면 같다고 본다. */
    static boolean jsonEquals(JsonNode a, JsonNode b) {
        if (a.isNumber() && b.isNumber()) return a.decimalValue().compareTo(b.decimalValue()) == 0;
        return a.equals(b);
    }

    // ---- set 맵 값의 형 검사(잘못된 JSON 형은 조용히 바꾸지 않고 INVALID 로 거절한다) ----

    String strOrNull(Map<String, Object> set, String key, String elementId) {
        Object v = set.get(key);
        if (v == null) return null;
        if (v instanceof String s) return s;
        throw invalid("문자열이어야 합니다: " + key, key + " 값을 문자열로 보내세요", elementId, key);
    }

    String strReq(Map<String, Object> set, String key, String elementId) {
        String v = strOrNull(set, key, elementId);
        if (v == null) throw invalid("값이 필요합니다: " + key, key + " 값을 넣으세요", elementId, key);
        return v;
    }

    boolean bool(Map<String, Object> set, String key, String elementId) {
        if (set.get(key) instanceof Boolean b) return b;
        throw invalid("true·false 여야 합니다: " + key, key + " 값을 JSON 불리언으로 보내세요", elementId, key);
    }

    Integer intOrNull(Map<String, Object> set, String key, String elementId) {
        Long v = integral(set.get(key), key, elementId, Integer.MIN_VALUE, Integer.MAX_VALUE);
        return v == null ? null : v.intValue();
    }

    Long longOrNull(Map<String, Object> set, String key, String elementId) {
        return integral(set.get(key), key, elementId, Long.MIN_VALUE, Long.MAX_VALUE);
    }

    private Long integral(Object v, String key, String elementId, long min, long max) {
        if (v == null) return null;
        if (v instanceof Number n) {
            try {
                long l = new java.math.BigDecimal(n.toString()).longValueExact();
                if (l >= min && l <= max) return l;
            } catch (ArithmeticException | NumberFormatException ignored) {
                // 소수·범위 밖·NaN 은 아래에서 거절한다.
            }
        }
        throw invalid("범위 안의 정수여야 합니다: " + key, key + " 값을 정수로 보내세요", elementId, key);
    }

    List<String> strList(Map<String, Object> set, String key, String elementId) {
        if (set.get(key) instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object o : list) {
                if (!(o instanceof String s)) throw invalid("문자열 목록이어야 합니다: " + key, key + " 값을 문자열 배열로 보내세요", elementId, key);
                out.add(s);
            }
            return out;
        }
        throw invalid("목록이어야 합니다: " + key, key + " 값을 배열로 보내세요", elementId, key);
    }

    String newIdOrGiven(String given, char prefix) {
        if (given == null) return ErdIds.newId(prefix);
        if (!ErdIds.isElementId(given) || given.charAt(0) != prefix) {
            throw invalid("요소 id 형식이 틀렸습니다: " + given, prefix + "-로 시작하는 id 를 쓰거나 비워 두세요", given, "id");
        }
        if (snapshotAny(given)) throw invalid("이미 있는 id 입니다: " + given, "다른 id 를 쓰세요", given, "id");
        return given;
    }

    private boolean snapshotAny(String id) {
        return m.tables.containsKey(id) || m.columns.containsKey(id) || m.keys.containsKey(id) || m.relations.containsKey(id);
    }

    ErdTable table(String id) { return require(m.tables.get(id), id); }
    ErdColumn column(String id) { return require(m.columns.get(id), id); }
    ErdKey key(String id) { return require(m.keys.get(id), id); }
    ErdRelation relation(String id) { return require(m.relations.get(id), id); }

    private <T> T require(T v, String id) {
        if (v != null) return v;
        PropRev tomb = m.tombstones.get(id);
        if (tomb != null) {
            return fail(new ErdRejection(ErdRejection.NOT_FOUND, index, "이미 지워진 요소입니다: " + id,
                    "getChangesSince 로 최신 모델을 읽으세요", id, null, tomb.rev(), tomb.session(), null, null));
        }
        return fail(new ErdRejection(ErdRejection.INVALID, index, "없는 요소 id 입니다: " + id,
                "getModelText 로 id 를 확인하세요", id, null, null, null, null, null));
    }

    Reject invalid(String message, String hint, String elementId, String property) {
        return new Reject(new ErdRejection(ErdRejection.INVALID, index, message, hint, elementId, property, null, null, null, null));
    }

    Reject conflict(String elementId, String property, PropRev by, JsonNode current, String message, String hint) {
        return new Reject(new ErdRejection(ErdRejection.CONFLICT, index, message, hint, elementId, property,
                by.rev(), by.session(), current, null));
    }

    Reject needsChoice(String elementId, String property, String message, String hint, JsonNode choices) {
        return new Reject(new ErdRejection(ErdRejection.NEEDS_CHOICE, index, message, hint, elementId, property, null, null, null, choices));
    }

    private static <T> T fail(ErdRejection r) {
        throw new Reject(r);
    }
}
