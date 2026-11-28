/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermDraftService·PermDraftFingerprint 단위 시험 — 가짜 저장소·가짜 행 원천(Oracle 없음)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecPermDraft;
import com.dongkuk.dmes.mcm.repository.SecPermDraftRepository;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PermDraftServiceTest {

    /** 메모리 저장소 — SecPermDraftRepository 의 쓰는 메서드만 흉내 낸다. */
    private final Map<String, SecPermDraft> store = new LinkedHashMap<>();
    private final SecPermDraftRepository repo = (SecPermDraftRepository) Proxy.newProxyInstance(
            getClass().getClassLoader(), new Class<?>[]{SecPermDraftRepository.class}, (p, m, a) -> switch (m.getName()) {
                case "findById" -> Optional.ofNullable(store.get((String) a[0]));
                case "existsById" -> store.containsKey((String) a[0]);
                case "deleteById" -> { store.remove((String) a[0]); yield null; }
                case "saveAndFlush", "save" -> {
                    SecPermDraft d = (SecPermDraft) a[0];
                    d.setUpdatedAt(Instant.parse("2026-11-27T01:02:03Z"));
                    d.setVersion(d.getVersion() == null ? 0L : d.getVersion() + 1);
                    store.put(d.getOwnerUserId(), d);
                    yield d;
                }
                default -> throw new UnsupportedOperationException(m.getName());
            });

    /** 가짜 DB 행. 키 = 범위 키. */
    private final Map<String, List<String>> db = new LinkedHashMap<>();
    private final List<Collection<String>> rowReads = new ArrayList<>();
    private final PermScopeRowSource source = keys -> {
        rowReads.add(List.copyOf(keys));
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String k : keys) {
            out.put(k, new ArrayList<>(db.getOrDefault(k, List.of())));
        }
        return out;
    };

    private String user = "admin1";
    private final SecurityIdentity identity = new SecurityIdentity() {
        @Override public String currentUserId() { return user; }
        @Override public boolean hasAuthority(String authority) { return false; }
    };

    // 가짜 검사 원천
    private final Map<String, PermChangeLookup.ObjAllowed> objs = new LinkedHashMap<>();
    private final Map<String, java.util.Set<String>> groupRoles = new LinkedHashMap<>();
    private boolean sysadminUser = false;
    /** SYSADMIN 전용 오브젝트 퍼미션을 가진 역할(m19). */
    private final java.util.Set<String> objOnlyRoles = new java.util.HashSet<>();
    private final PermChangeLookup lookup = new PermChangeLookup() {
        @Override public Map<String, ObjAllowed> objectAllowed(Collection<String> ids) {
            Map<String, ObjAllowed> out = new LinkedHashMap<>();
            for (String id : ids) { if (objs.containsKey(id)) { out.put(id, objs.get(id)); } }
            return out;
        }
        @Override public Map<String, java.util.Set<String>> rolesOfGroups(Collection<String> ids) {
            Map<String, java.util.Set<String>> out = new LinkedHashMap<>();
            for (String id : ids) { out.put(id, groupRoles.getOrDefault(id, java.util.Set.of())); }
            return out;
        }
        @Override public java.util.Set<String> existing(Target kind, Collection<String> ids) { return java.util.Set.of(); }
        @Override public boolean currentUserIsSysadmin() { return sysadminUser; }
        @Override public java.util.Set<String> rolesWithSysadminOnlyObjects() { return objOnlyRoles; }
    };

    private PermDraftFingerprint fp;
    private PermDraftService svc;

    @BeforeEach
    void setUp() {
        fp = new PermDraftFingerprint(source);
        svc = new PermDraftService(repo, fp, new PermChangeValidator(lookup), identity, owner -> { });
        PermChangeLookup.ObjAllowed all = new PermChangeLookup.ObjAllowed(
                List.of("find", "save", "delete"), List.of("pop1", "pop2"));
        objs.put("OBJ1", all);
        objs.put("OBJ2", all);
        objs.put("mpp0123", all);
        objs.put("dbViewer", new PermChangeLookup.ObjAllowed(List.of("query"), List.of()));
    }

    private static Map<String, Object> row(String tp, String k1, String k2, String op, String btn, String popup) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("TP", tp);
        m.put("KEY1", k1);
        m.put("KEY2", k2);
        m.put("OP", op);
        m.put("BTN_PERM", btn);
        m.put("POPUP_PERM", popup);
        return m;
    }

    private static Map<String, Object> only(List<Map<String, Object>> result) {
        return result.get(0);
    }

    @Test
    @DisplayName("loadDraft: 초안이 없으면 빈 draft 한 줄(CHANGE_CNT 0)")
    void loadEmpty() {
        Map<String, Object> d = only(svc.loadDraft());
        assertThat(d).containsEntry("CHANGES_JSON", "[]").containsEntry("CHANGE_CNT", 0).containsEntry("U_AT", null);
    }

    @Test
    @DisplayName("saveDraft: 전체 교체 저장 → loadDraft 가 같은 값, U_AT 은 yyyy-MM-dd HH:mm:ss")
    void saveThenLoad() {
        db.put("user:u1", List.of("G_OLD"));
        Map<String, Object> saved = only(svc.saveDraft(List.of(
                row("USER_GRP", "u1", "G1", "ADD", null, null),
                row("ROLE_OBJ", "R1", "OBJ1", "UPD", " find, save ,find", "pop1"))));
        assertThat(saved.get("CHANGE_CNT")).isEqualTo(2);
        assertThat((String) saved.get("U_AT")).matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}");

        assertThat(svc.myChanges()).containsExactly(
                PermChange.link("USER_GRP", "u1", "G1", "ADD"),
                PermChange.roleObj("R1", "OBJ1", "UPD", "find,save", "pop1"));
        assertThat(only(svc.loadDraft()).get("CHANGES_JSON")).isEqualTo(saved.get("CHANGES_JSON"));
        assertThat(svc.savedChanges()).isEqualTo(svc.myChanges());
    }

    @Test
    @DisplayName("saveDraft: 같은 내용을 다시 보내도 같은 결과(멱등)")
    void idempotent() {
        List<Map<String, Object>> req = List.of(row("GRP_ROLE", "G1", "R1", "ADD", null, null));
        Object first = only(svc.saveDraft(req)).get("CHANGES_JSON");
        Object second = only(svc.saveDraft(req)).get("CHANGES_JSON");
        assertThat(second).isEqualTo(first);
        assertThat(store).hasSize(1);
    }

    @Test
    @DisplayName("saveDraft: 변경 0건이면 초안 행을 지우고 빈 draft")
    void emptyDeletes() {
        svc.saveDraft(List.of(row("USER_GRP", "u1", "G1", "ADD", null, null)));
        assertThat(store).hasSize(1);
        assertThat(only(svc.saveDraft(List.of())).get("CHANGE_CNT")).isEqualTo(0);
        assertThat(store).isEmpty();
        svc.saveDraft(null); // 없는 초안 지우기도 성공
    }

    @Test
    @DisplayName("discardDraft: 지운다, 없어도 성공, 남의 초안은 그대로")
    void discard() {
        svc.saveDraft(List.of(row("USER_GRP", "u1", "G1", "ADD", null, null)));
        user = "admin2";
        svc.saveDraft(List.of(row("USER_GRP", "u2", "G1", "ADD", null, null)));
        assertThat(store).hasSize(2);
        svc.discardDraft();
        assertThat(store.keySet()).containsExactly("admin1");
        svc.discardDraft();
        assertThat(only(svc.loadDraft()).get("CHANGE_CNT")).isEqualTo(0);
        user = "admin1";
        assertThat(only(svc.loadDraft()).get("CHANGE_CNT")).isEqualTo(1);
    }

    @Test
    @DisplayName("saveDraft: 링크 변경의 BTN·POPUP, ROLE_OBJ DEL 의 BTN·POPUP 은 버린다")
    void normalize() {
        svc.saveDraft(List.of(
                row("USER_GRP", "u1", "G1", "DEL", "find", "x"),
                row("ROLE_OBJ", "R1", "OBJ1", "DEL", "find", "x"),
                row("ROLE_OBJ", "R1", "OBJ2", "ADD", "find", null)));
        assertThat(svc.myChanges()).containsExactly(
                PermChange.link("USER_GRP", "u1", "G1", "DEL"),
                PermChange.roleObj("R1", "OBJ1", "DEL", null, null),
                PermChange.roleObj("R1", "OBJ2", "ADD", "find", ""));
    }

    @Test
    @DisplayName("saveDraft: V-004 — TP·OP·KEY 가 틀리면 PERM_BAD_VALUE, 한 줄이라도 틀리면 전체 거절(기존 초안 유지)")
    void rejectBad() {
        svc.saveDraft(List.of(row("USER_GRP", "u1", "G1", "ADD", null, null)));
        String before = (String) only(svc.loadDraft()).get("CHANGES_JSON");
        for (Map<String, Object> bad : List.of(
                row("XXX", "a", "b", "ADD", null, null),
                row("USER_GRP", "a", "b", "MOVE", null, null),
                row("USER_GRP", " ", "b", "ADD", null, null),
                row("USER_GRP", "a", null, "ADD", null, null),
                row("GRP_ROLE", "a", "b", "UPD", null, null))) {
            assertThatThrownBy(() -> svc.saveDraft(List.of(row("USER_GRP", "ok", "G", "ADD", null, null), bad)))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageStartingWith("PERM_BAD_VALUE: ")
                    .hasMessageContaining("2번째 줄");
        }
        assertThatThrownBy(() -> svc.saveDraft(java.util.Collections.singletonList(null)))
                .hasMessageStartingWith("PERM_BAD_VALUE: ");
        assertThat(only(svc.loadDraft()).get("CHANGES_JSON")).isEqualTo(before);
    }

    @Test
    @DisplayName("V-008: 같은 (TP,KEY1,KEY2) 두 번이면 PERM_BAD_VALUE")
    void duplicates() {
        assertThatThrownBy(() -> svc.saveDraft(List.of(
                row("USER_GRP", "u1", "G1", "ADD", null, null),
                row("USER_GRP", "u1", "G1", "DEL", null, null))))
                .hasMessageStartingWith("PERM_BAD_VALUE: ").hasMessageContaining("두 번");
    }

    @Test
    @DisplayName("V-001·V-002: 빈 BTN = PERM_EMPTY_BTN, 오브젝트 밖 값 = PERM_NOT_IN_OBJ(R/O/코드), 없는 오브젝트 = PERM_BAD_VALUE")
    void roleObjValues() {
        assertThatThrownBy(() -> svc.saveDraft(List.of(row("ROLE_OBJ", "R1", "OBJ1", "UPD", " , ", "pop1"))))
                .hasMessage("PERM_EMPTY_BTN: R1/OBJ1");
        assertThatThrownBy(() -> svc.saveDraft(List.of(row("ROLE_OBJ", "R1", "OBJ1", "ADD", "find,zap", "pop9"))))
                .hasMessage("PERM_NOT_IN_OBJ: R1/OBJ1/zap,pop9");
        assertThatThrownBy(() -> svc.saveDraft(List.of(row("ROLE_OBJ", "R1", "NOPE", "ADD", "find", null))))
                .hasMessageStartingWith("PERM_BAD_VALUE: ").hasMessageContaining("NOPE");
        svc.saveDraft(List.of(row("ROLE_OBJ", "R1", "NOPE", "DEL", null, null))); // DEL 은 값 검사 없음
        assertThat(svc.myChanges()).hasSize(1);
    }

    @Test
    @DisplayName("V-009(m19): SYSADMIN 전용 오브젝트(dbViewer) 퍼미션·그 퍼미션을 가진 역할·그 역할이 든 그룹 변경은 SYSADMIN 만")
    void sysadminOnlyObjectScope() {
        objOnlyRoles.add("R_DB");
        groupRoles.put("G_DB", java.util.Set.of("R_DB"));
        List<List<Map<String, Object>>> involved = List.of(
                List.of(row("ROLE_OBJ", "R1", "dbViewer", "ADD", "query", null)),
                List.of(row("ROLE_OBJ", "R_DB", "dbViewer", "DEL", null, null)),
                List.of(row("GRP_ROLE", "G1", "R_DB", "ADD", null, null)),
                List.of(row("USER_GRP", "u1", "G_DB", "ADD", null, null)),
                List.of(row("USER_GRP", "u1", "G_NEW", "ADD", null, null), row("GRP_ROLE", "G_NEW", "R_DB", "ADD", null, null)));
        for (List<Map<String, Object>> req : involved) {
            assertThatThrownBy(() -> svc.saveDraft(req)).hasMessageStartingWith("PERM_FORBIDDEN: ");
        }
        svc.saveDraft(List.of(row("ROLE_OBJ", "R1", "OBJ1", "ADD", "find", null))); // 다른 오브젝트는 통과
        sysadminUser = true;
        for (List<Map<String, Object>> req : involved) {
            svc.saveDraft(req);
        }
    }

    @Test
    @DisplayName("V-009: SYSADMIN 이 걸린 변경은 SYSADMIN 사용자만, 아니면 PERM_FORBIDDEN")
    void sysadminScope() {
        groupRoles.put("G_ADM", java.util.Set.of("SYSADMIN"));
        List<List<Map<String, Object>>> involved = List.of(
                List.of(row("GRP_ROLE", "G1", "SYSADMIN", "ADD", null, null)),
                List.of(row("USER_GRP", "u1", "G_ADM", "ADD", null, null)),
                List.of(row("USER_GRP", "u1", "G_NEW", "ADD", null, null), row("GRP_ROLE", "G_NEW", "SYSADMIN", "ADD", null, null)),
                List.of(row("ROLE_OBJ", "SYSADMIN", "OBJ1", "DEL", null, null)));
        for (List<Map<String, Object>> req : involved) {
            assertThatThrownBy(() -> svc.saveDraft(req)).hasMessageStartingWith("PERM_FORBIDDEN: ");
        }
        svc.saveDraft(List.of(row("USER_GRP", "u1", "G_OK", "ADD", null, null))); // 관계없는 변경은 통과
        sysadminUser = true;
        for (List<Map<String, Object>> req : involved) {
            svc.saveDraft(req);
        }
    }

    @Test
    @DisplayName("V-003: SYSADMIN 역할의 ROLE_OBJ 값 편집(ADD·UPD)은 SYSADMIN 사용자도 PERM_FORBIDDEN")
    void sysadminValuesLocked() {
        sysadminUser = true;
        assertThatThrownBy(() -> svc.saveDraft(List.of(row("ROLE_OBJ", "SYSADMIN", "OBJ1", "ADD", "find", null))))
                .hasMessageStartingWith("PERM_FORBIDDEN: ");
    }

    @Test
    @DisplayName("로그인 사용자가 없으면 action 은 PERM_NO_USER, savedChanges 는 빈 목록")
    void noUser() {
        user = null;
        assertThatThrownBy(() -> svc.loadDraft()).hasMessageStartingWith("PERM_NO_USER: ");
        assertThatThrownBy(() -> svc.saveDraft(List.of())).hasMessageStartingWith("PERM_NO_USER: ");
        assertThatThrownBy(() -> svc.discardDraft()).hasMessageStartingWith("PERM_NO_USER: ");
        assertThat(svc.savedChanges()).isEmpty();
    }

    @Test
    @DisplayName("깨진 DRAFT_JSON 은 PERM_DRAFT_CORRUPT")
    void corrupt() {
        SecPermDraft d = new SecPermDraft("admin1");
        d.setDraftJson("{not json");
        store.put("admin1", d);
        assertThatThrownBy(() -> svc.savedChanges()).hasMessageStartingWith("PERM_DRAFT_CORRUPT: ");
    }

    // ── 지문 ────────────────────────────────────────────────────────

    @Test
    @DisplayName("범위 키: USER_GRP→user:key1, GRP_ROLE→group:key1, ROLE_OBJ→role:key1, 정렬·중복 제거")
    void scopeKeys() {
        assertThat(PermDraftFingerprint.scopeKeys(List.of(
                PermChange.roleObj("R2", "O1", "ADD", "a", null),
                PermChange.link("GRP_ROLE", "G1", "R1", "ADD"),
                PermChange.link("USER_GRP", "u1", "G1", "ADD"),
                PermChange.roleObj("R2", "O2", "DEL", null, null))))
                .containsExactly("group:G1", "role:R2", "user:u1");
    }

    @Test
    @DisplayName("지문: 줄 순서와 무관, 내용이 바뀌면 달라지고, 행 없는 범위도 지문이 있다")
    void hashStable() {
        assertThat(PermDraftFingerprint.hashRows(List.of("b", "a"))).isEqualTo(PermDraftFingerprint.hashRows(List.of("a", "b")));
        assertThat(PermDraftFingerprint.hashRows(List.of("a", "b"))).isNotEqualTo(PermDraftFingerprint.hashRows(List.of("a", "c")));
        assertThat(PermDraftFingerprint.hashRows(List.of())).hasSize(64)
                .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    @Test
    @DisplayName("saveDraft: 기준 지문은 처음 건드릴 때만 찍고, 이후 저장에서 유지·추가·제거(D22)")
    void baseFingerprintExtends() {
        db.put("user:u1", List.of("G_A"));
        svc.saveDraft(List.of(row("USER_GRP", "u1", "G1", "ADD", null, null)));
        String first = store.get("admin1").getBaseFpJson();
        assertThat(PermDraftFingerprint.fromJson(first)).containsOnlyKeys("user:u1");
        assertThat(rowReads).hasSize(1);

        // 다른 사람이 u1 의 그룹을 바꿨다 + 내가 role:R1 을 더 건드림 → u1 기준은 그대로, R1 만 새로 찍는다
        db.put("user:u1", List.of("G_A", "G_B"));
        db.put("role:R1", List.of("OBJ1" + PermScopeRowSource.FIELD_SEP + "find" + PermScopeRowSource.FIELD_SEP + PermScopeRowSource.FIELD_SEP));
        svc.saveDraft(List.of(
                row("USER_GRP", "u1", "G1", "ADD", null, null),
                row("ROLE_OBJ", "R1", "OBJ1", "UPD", "find,save", null)));
        Map<String, String> second = PermDraftFingerprint.fromJson(store.get("admin1").getBaseFpJson());
        assertThat(second).containsOnlyKeys("user:u1", "role:R1");
        assertThat(second.get("user:u1")).isEqualTo(PermDraftFingerprint.fromJson(first).get("user:u1"));
        assertThat(rowReads.get(1)).containsExactly("role:R1"); // 새 범위만 읽었다

        // u1 변경을 빼면 user:u1 기준이 빠진다
        svc.saveDraft(List.of(row("ROLE_OBJ", "R1", "OBJ1", "UPD", "find,save", null)));
        assertThat(PermDraftFingerprint.fromJson(store.get("admin1").getBaseFpJson())).containsOnlyKeys("role:R1");
    }

    @Test
    @DisplayName("충돌 검사(b4 용): 범위 행이 바뀌면 그 키만 돌려주고, 안 바뀌면 빈 목록")
    void conflicts() {
        db.put("user:u1", List.of("G_A"));
        db.put("group:G9", List.of("R_X"));
        svc.saveDraft(List.of(
                row("USER_GRP", "u1", "G1", "ADD", null, null),
                row("GRP_ROLE", "G9", "R1", "ADD", null, null)));
        String base = store.get("admin1").getBaseFpJson();
        assertThat(fp.conflicts(base)).isEmpty();

        db.put("group:G9", List.of("R_X", "R_Y"));
        assertThat(fp.conflicts(base)).containsExactly("group:G9");

        db.remove("user:u1"); // 행이 사라져도 충돌
        assertThat(fp.conflicts(base)).containsExactly("group:G9", "user:u1");
    }

    @Test
    @DisplayName("기준 지문 JSON 은 키 정렬 · null/빈 값은 빈 맵 · 깨지면 PERM_DRAFT_CORRUPT")
    void fpJson() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("user:b", "2");
        m.put("group:a", "1");
        assertThat(PermDraftFingerprint.toJson(m)).isEqualTo("{\"group:a\":\"1\",\"user:b\":\"2\"}");
        assertThat(PermDraftFingerprint.fromJson(null)).isEmpty();
        assertThat(PermDraftFingerprint.fromJson(" ")).isEmpty();
        assertThatThrownBy(() -> PermDraftFingerprint.fromJson("[1]")).hasMessageStartingWith("PERM_DRAFT_CORRUPT: ");
    }
}
