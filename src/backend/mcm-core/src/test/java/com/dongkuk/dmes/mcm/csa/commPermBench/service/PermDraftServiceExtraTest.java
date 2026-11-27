/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermDraftService·PermChangeValidator 보강 시험 — 행 잠금·동시 저장·SYSADMIN DEL·검사 순서·APPLY 모드·지문 골든
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecPermDraft;
import com.dongkuk.dmes.mcm.repository.SecPermDraftRepository;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.lang.reflect.Proxy;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PermDraftServiceExtraTest {

    private final Map<String, SecPermDraft> store = new LinkedHashMap<>();
    private RuntimeException saveFailure;
    private final SecPermDraftRepository repo = (SecPermDraftRepository) Proxy.newProxyInstance(
            getClass().getClassLoader(), new Class<?>[]{SecPermDraftRepository.class}, (p, m, a) -> switch (m.getName()) {
                case "findById" -> Optional.ofNullable(store.get((String) a[0]));
                case "existsById" -> store.containsKey((String) a[0]);
                case "deleteById" -> { store.remove((String) a[0]); yield null; }
                case "saveAndFlush", "save" -> {
                    if (saveFailure != null) {
                        throw saveFailure;
                    }
                    SecPermDraft d = (SecPermDraft) a[0];
                    d.setUpdatedAt(Instant.parse("2026-11-27T01:02:03Z"));
                    store.put(d.getOwnerUserId(), d);
                    yield d;
                }
                default -> throw new UnsupportedOperationException(m.getName());
            });

    private final Map<String, PermChangeLookup.ObjAllowed> objs = new LinkedHashMap<>();
    private final Map<String, Set<String>> groupRoles = new LinkedHashMap<>();
    private final Set<String> exists = new HashSet<>();
    private boolean sysadminUser;
    private int sysadminCalls;
    private final List<String> locked = new ArrayList<>();

    private final PermChangeLookup lookup = new PermChangeLookup() {
        @Override public Map<String, ObjAllowed> objectAllowed(Collection<String> ids) {
            Map<String, ObjAllowed> out = new LinkedHashMap<>();
            for (String id : ids) {
                if (objs.containsKey(id)) {
                    out.put(id, objs.get(id));
                }
            }
            return out;
        }
        @Override public Map<String, Set<String>> rolesOfGroups(Collection<String> ids) {
            Map<String, Set<String>> out = new LinkedHashMap<>();
            for (String id : ids) {
                out.put(id, groupRoles.getOrDefault(id, Set.of()));
            }
            return out;
        }
        @Override public Set<String> existing(Target kind, Collection<String> ids) {
            Set<String> out = new HashSet<>();
            for (String id : ids) {
                if (exists.contains(kind + ":" + id)) {
                    out.add(id);
                }
            }
            return out;
        }
        @Override public boolean currentUserIsSysadmin() {
            sysadminCalls++;
            return sysadminUser;
        }
    };

    private final SecurityIdentity identity = new SecurityIdentity() {
        @Override public String currentUserId() { return "admin1"; }
        @Override public boolean hasAuthority(String authority) { return false; }
    };

    private PermDraftService svc;

    @BeforeEach
    void setUp() {
        PermDraftFingerprint fp = new PermDraftFingerprint(keys -> {
            Map<String, List<String>> out = new LinkedHashMap<>();
            keys.forEach(k -> out.put(k, List.of()));
            return out;
        });
        svc = new PermDraftService(repo, fp, new PermChangeValidator(lookup), identity, locked::add);
        PermChangeLookup.ObjAllowed all = new PermChangeLookup.ObjAllowed(List.of("find", "save"), List.of("pop1"));
        objs.put("OBJ1", all);
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

    @Test
    @DisplayName("저장 전에 내 초안 행을 잠근다")
    void locksOwnerRow() {
        svc.saveDraft(List.of(row("USER_GRP", "u1", "G1", "ADD", null, null)));
        assertThat(locked).containsExactly("admin1");
    }

    @Test
    @DisplayName("동시 저장(PK 중복)·행 사라짐(StaleState)은 PERM_DRAFT_BUSY")
    void busy() {
        List<Map<String, Object>> req = List.of(row("USER_GRP", "u1", "G1", "ADD", null, null));
        saveFailure = new DataIntegrityViolationException("dup");
        assertThatThrownBy(() -> svc.saveDraft(req)).hasMessageStartingWith("PERM_DRAFT_BUSY: ");
        saveFailure = new ObjectOptimisticLockingFailureException(SecPermDraft.class, "admin1");
        assertThatThrownBy(() -> svc.saveDraft(req)).hasMessageStartingWith("PERM_DRAFT_BUSY: ");
    }

    @Test
    @DisplayName("SYSADMIN 그룹에서 빼기(USER_GRP DEL)·SYSADMIN 역할 떼기(GRP_ROLE DEL)도 SYSADMIN 사용자만")
    void sysadminDelForbidden() {
        groupRoles.put("G_ADM", Set.of("SYSADMIN"));
        assertThatThrownBy(() -> svc.saveDraft(List.of(row("USER_GRP", "u1", "G_ADM", "DEL", null, null))))
                .hasMessageStartingWith("PERM_FORBIDDEN: ");
        assertThatThrownBy(() -> svc.saveDraft(List.of(row("GRP_ROLE", "G1", "SYSADMIN", "DEL", null, null))))
                .hasMessageStartingWith("PERM_FORBIDDEN: ");
        sysadminUser = true;
        svc.saveDraft(List.of(row("GRP_ROLE", "G1", "SYSADMIN", "DEL", null, null)));
    }

    @Test
    @DisplayName("소문자 TP·OP·행 키를 받아들인다")
    void lowercase() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("tp", "role_obj");
        r.put("key1", "R1");
        r.put("key2", "OBJ1");
        r.put("op", "upd");
        r.put("btn_perm", "find");
        svc.saveDraft(List.of(r));
        assertThat(svc.myChanges()).containsExactly(PermChange.roleObj("R1", "OBJ1", "UPD", "find", ""));
    }

    @Test
    @DisplayName("검사 순서: 중복 + SYSADMIN 위반이 한 요청에 있으면 PERM_BAD_VALUE 가 먼저")
    void checkOrder() {
        assertThatThrownBy(() -> svc.saveDraft(List.of(
                row("GRP_ROLE", "G1", "SYSADMIN", "ADD", null, null),
                row("GRP_ROLE", "G1", "SYSADMIN", "ADD", null, null))))
                .hasMessageStartingWith("PERM_BAD_VALUE: ");
        assertThat(sysadminCalls).isZero();
    }

    @Test
    @DisplayName("SYSADMIN 과 무관한 요청은 currentUserIsSysadmin 을 부르지 않는다")
    void sysadminLookupLazy() {
        svc.saveDraft(List.of(
                row("USER_GRP", "u1", "G1", "ADD", null, null),
                row("GRP_ROLE", "G1", "R1", "ADD", null, null),
                row("ROLE_OBJ", "R1", "OBJ1", "UPD", "find", null)));
        assertThat(sysadminCalls).isZero();
    }

    @Test
    @DisplayName("APPLY 모드: 대상이 없으면 NOT_FOUND(첫 건), SAVE 모드는 사람·그룹·역할을 확인하지 않는다")
    void applyModeTargets() {
        PermChangeValidator v = new PermChangeValidator(lookup);
        List<PermChange> changes = List.of(
                PermChange.link("USER_GRP", "u1", "G1", "ADD"),
                PermChange.roleObj("R1", "OBJ1", "UPD", "find", null));
        v.check(changes, PermChangeValidator.Mode.SAVE);
        assertThatThrownBy(() -> v.check(changes, PermChangeValidator.Mode.APPLY))
                .hasMessage("NOT_FOUND: 변경 대상이 없습니다: user:u1");
        exists.add("USER:u1");
        assertThatThrownBy(() -> v.check(changes, PermChangeValidator.Mode.APPLY))
                .hasMessage("NOT_FOUND: 변경 대상이 없습니다: group:G1");
        exists.addAll(List.of("USER:u1", "GROUP:G1", "ROLE:R1"));
        v.check(changes, PermChangeValidator.Mode.APPLY);
        objs.remove("OBJ1");
        assertThatThrownBy(() -> v.check(changes, PermChangeValidator.Mode.APPLY))
                .hasMessage("NOT_FOUND: 변경 대상이 없습니다: object:OBJ1");
        assertThatThrownBy(() -> v.check(changes, PermChangeValidator.Mode.SAVE))
                .hasMessageStartingWith("PERM_BAD_VALUE: ");
        // DEL 은 사라진 대상을 확인하지 않는다(ROLE_OBJ DEL 의 역할만 확인)
        v.check(List.of(PermChange.link("USER_GRP", "gone", "gone", "DEL"),
                PermChange.roleObj("R1", "gone", "DEL", null, null)), PermChangeValidator.Mode.APPLY);
        assertThatThrownBy(() -> v.check(List.of(PermChange.roleObj("RX", "gone", "DEL", null, null)),
                PermChangeValidator.Mode.APPLY)).hasMessage("NOT_FOUND: 변경 대상이 없습니다: role:RX");
    }

    @Test
    @DisplayName("지문 골든: 고정 입력의 16진 출력이 변하지 않는다(저장된 지문과의 호환)")
    void goldenHash() {
        assertThat(PermDraftFingerprint.hashRows(List.of("a", "b")))
                .isEqualTo("7e18f737311b2dc3b2f269dd78396b0351f14fb66efa879f768cb23181883c78");
        assertThat(PermDraftFingerprint.hashRows(List.of("OBJ\u001Ffind,save\u001F\u001F")))
                .isEqualTo("89e190156dae1e5df8c23d4c4be85d88f9d6dab44cccc8c2c22388c74ef31d2c");
    }
}
