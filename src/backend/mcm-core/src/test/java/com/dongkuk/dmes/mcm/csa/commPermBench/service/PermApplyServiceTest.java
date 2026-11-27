/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermApplyService 단위 시험 — 메모리 가짜 DB(연결·퍼미션·이력·초안)와 실제 계산기(DefaultPermResolver·DefaultImpactCalculator), Oracle 없음
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchApplyRequest;
import com.dongkuk.dmes.mcm.entity.SecPermDraft;
import com.dongkuk.dmes.mcm.entity.SecPermHis;
import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;
import com.dongkuk.dmes.mcm.repository.SecPermDraftRepository;
import com.dongkuk.dmes.mcm.security.perm.GroupMeta;
import com.dongkuk.dmes.mcm.security.perm.ImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.security.perm.RoleMeta;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.lang.reflect.Proxy;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PermApplyServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-27T01:02:03.456Z"), ZoneId.of("Asia/Seoul"));
    private static final ObjectMapper JSON = new ObjectMapper();

    // ────────────────────────────────────────────────────────────────
    // 메모리 DB
    // ────────────────────────────────────────────────────────────────

    private final Set<String> users = new TreeSet<>(Set.of("u1", "u2", "u3", "admin1"));
    private final Set<String> groups = new TreeSet<>(Set.of("G1", "G2"));
    private final Set<String> roles = new TreeSet<>(Set.of("R1", "R2", "SYSADMIN"));
    private final Map<String, ObjMeta> objects = new LinkedHashMap<>();
    private final Map<String, Set<String>> userGroups = new TreeMap<>();
    private final Map<String, Set<String>> groupRoles = new TreeMap<>();
    /** 키 = ROLE|OBJECT, 값 = [BTN, POPUP, DATA]. */
    private final Map<String, String[]> rolePerms = new TreeMap<>();
    private final Map<String, SecPermDraft> draftRows = new LinkedHashMap<>();
    private final List<SecPermHis> hisRows = new ArrayList<>();
    private final List<SecPermHisDtl> dtlRows = new ArrayList<>();
    /** 호출 기록 — 순서 검사용(lockDraft·lockScopes·exists·write·flush). */
    private final List<String> calls = new ArrayList<>();
    private final List<Object> events = new ArrayList<>();

    private String user = "admin1";
    private boolean sysadminUser = false;

    private final SecurityIdentity identity = new SecurityIdentity() {
        @Override public String currentUserId() { return user; }
        @Override public boolean hasAuthority(String authority) { return false; }
    };

    private final SecPermDraftRepository drafts = (SecPermDraftRepository) Proxy.newProxyInstance(
            getClass().getClassLoader(), new Class<?>[]{SecPermDraftRepository.class}, (p, m, a) -> switch (m.getName()) {
                case "findById" -> Optional.ofNullable(draftRows.get((String) a[0]));
                case "existsById" -> draftRows.containsKey((String) a[0]);
                case "delete" -> { draftRows.remove(((SecPermDraft) a[0]).getOwnerUserId()); calls.add("deleteDraft"); yield null; }
                default -> throw new UnsupportedOperationException(m.getName());
            });

    /** 다음 flush·이력 넣기에서 제약 위반을 낸다(시험 주입). */
    private boolean failFlush = false;
    private boolean failHistory = false;

    private final PermApplyStore store = new PermApplyStore() {
        @Override public void lockDraft(String owner) { calls.add("lockDraft:" + owner); }
        @Override public Set<String> lockScopes(Collection<String> keys) {
            calls.add("lockScopes:" + String.join(",", keys));
            Set<String> out = new LinkedHashSet<>();
            for (String k : keys) {
                String id = k.substring(k.indexOf(':') + 1);
                if (k.startsWith("user:") && users.contains(id) || k.startsWith("group:") && groups.contains(id)
                        || k.startsWith("role:") && roles.contains(id)) {
                    out.add(k);
                }
            }
            return out;
        }
        @Override public boolean userGroupExists(String u, String g) { return userGroups.getOrDefault(u, Set.of()).contains(g); }
        @Override public void insertUserGroup(String u, String g) { calls.add("write"); userGroups.computeIfAbsent(u, k -> new TreeSet<>()).add(g); }
        @Override public boolean deleteUserGroup(String u, String g) {
            boolean gone = userGroups.getOrDefault(u, new TreeSet<>()).remove(g);
            if (gone) calls.add("write");
            return gone;
        }
        @Override public boolean groupRoleExists(String g, String r) { return groupRoles.getOrDefault(g, Set.of()).contains(r); }
        @Override public void insertGroupRole(String g, String r) { calls.add("write"); groupRoles.computeIfAbsent(g, k -> new TreeSet<>()).add(r); }
        @Override public boolean deleteGroupRole(String g, String r) {
            boolean gone = groupRoles.getOrDefault(g, new TreeSet<>()).remove(r);
            if (gone) calls.add("write");
            return gone;
        }
        @Override public Optional<PermRow> findRolePerm(String r, String o) {
            String[] v = rolePerms.get(r + "|" + o);
            return v == null ? Optional.empty() : Optional.of(new PermRow(v[0], v[1], v[2]));
        }
        @Override public void insertRolePerm(String r, String o, String btn, String popup) {
            calls.add("write");
            if (rolePerms.containsKey(r + "|" + o)) throw new IllegalStateException("PK 중복");
            rolePerms.put(r + "|" + o, new String[]{btn, popup, null});
        }
        @Override public void updateRolePerm(String r, String o, String btn, String popup) {
            calls.add("write");
            String[] v = rolePerms.get(r + "|" + o);
            rolePerms.put(r + "|" + o, new String[]{btn, popup, v[2]});
        }
        @Override public Optional<PermRow> deleteRolePerm(String r, String o) {
            String[] v = rolePerms.remove(r + "|" + o);
            if (v == null) return Optional.empty();
            calls.add("write");
            return Optional.of(new PermRow(v[0], v[1], v[2]));
        }
        @Override public boolean applyIdExists(String id) { return hisRows.stream().anyMatch(h -> h.getApplyId().equals(id)); }
        @Override public void insertHistory(SecPermHis header, List<SecPermHisDtl> rows) {
            calls.add("history");
            if (failHistory) throw new org.springframework.dao.DataIntegrityViolationException("ORA-00001 PK_TB_MCM_SEC_PERM_HIS");
            hisRows.add(header);
            dtlRows.addAll(rows);
        }
        @Override public void flush() {
            calls.add("flush");
            if (failFlush) throw new org.springframework.dao.DataIntegrityViolationException("ORA-00001 PK_TB_MCM_SEC_USER_MAPPING");
        }
    };

    /** 지문이 읽는 지금 행 — 메모리 DB 에서 바로 만든다(쓰면 지문이 바뀐다). */
    private final PermScopeRowSource scopeRows = keys -> {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String k : keys) {
            List<String> lines = new ArrayList<>();
            String id = k.substring(k.indexOf(':') + 1);
            if (k.startsWith("user:")) {
                lines.addAll(userGroups.getOrDefault(id, Set.of()));
            } else if (k.startsWith("group:")) {
                lines.addAll(groupRoles.getOrDefault(id, Set.of()));
            } else if (k.startsWith("role:")) {
                rolePerms.forEach((pk, v) -> {
                    if (pk.startsWith(id + "|")) lines.add(pk + "|" + v[0] + "|" + v[1] + "|" + v[2]);
                });
            }
            out.put(k, lines);
        }
        return out;
    };

    private final PermChangeLookup lookup = new PermChangeLookup() {
        @Override public Map<String, ObjAllowed> objectAllowed(Collection<String> ids) {
            Map<String, ObjAllowed> out = new LinkedHashMap<>();
            for (String id : ids) {
                ObjMeta o = objects.get(id);
                if (o != null) out.put(id, new ObjAllowed(o.btnPerm(), o.popupPerm()));
            }
            return out;
        }
        @Override public Map<String, Set<String>> rolesOfGroups(Collection<String> ids) {
            Map<String, Set<String>> out = new LinkedHashMap<>();
            ids.forEach(g -> out.put(g, Set.copyOf(groupRoles.getOrDefault(g, Set.of()))));
            return out;
        }
        @Override public Set<String> existing(Target kind, Collection<String> ids) {
            calls.add("exists:" + kind);
            Set<String> all = switch (kind) {
                case USER -> users;
                case GROUP -> groups;
                case ROLE -> roles;
            };
            Set<String> out = new LinkedHashSet<>(ids);
            out.retainAll(all);
            return out;
        }
        @Override public boolean currentUserIsSysadmin() { return sysadminUser; }
    };

    /** 메모리 DB → 그래프(사용·유효 기간 모두 열림). */
    private final PermGraphLoader loader = new PermGraphLoader() {
        @Override public PermGraph loadForUsers(Set<String> ids) { return loadAll(); }
        @Override public PermGraph loadAll() {
            calls.add("loadAll");
            Map<String, Set<String>> ug = new LinkedHashMap<>();
            userGroups.forEach((k, v) -> ug.put(k, new LinkedHashSet<>(v)));
            Map<String, Set<String>> gr = new LinkedHashMap<>();
            groupRoles.forEach((k, v) -> gr.put(k, new LinkedHashSet<>(v)));
            Map<String, RoleMeta> rm = new LinkedHashMap<>();
            roles.forEach(r -> rm.put(r, new RoleMeta(r, "Y", null, null)));
            Map<String, GroupMeta> gm = new LinkedHashMap<>();
            groups.forEach(g -> gm.put(g, new GroupMeta(g, "Y", null, null)));
            Map<String, Map<String, RolePerm>> rp = new LinkedHashMap<>();
            rolePerms.forEach((pk, v) -> {
                String[] ro = pk.split("\\|");
                rp.computeIfAbsent(ro[0], k -> new LinkedHashMap<>()).put(ro[1],
                        new RolePerm(ro[0], ro[1], PermTokens.parse(v[0]), PermTokens.parse(v[1]), v[2]));
            });
            return new PermGraph(ug, gr, rm, gm, new LinkedHashMap<>(objects), rp, List.of());
        }
    };

    private PermDraftFingerprint fp;
    private PermApplyService svc;

    private static <T> ObjectProvider<T> provider(Class<T> type, T bean) {
        DefaultListableBeanFactory bf = new DefaultListableBeanFactory();
        if (bean != null) bf.registerSingleton("b", bean);
        return bf.getBeanProvider(type);
    }

    private PermApplyService service(PermGraphLoader l) {
        return service(l, events::add);
    }

    private PermApplyService service(PermGraphLoader l, org.springframework.context.ApplicationEventPublisher publisher) {
        return new PermApplyService(drafts, store, new PermChangeValidator(lookup), fp,
                provider(PermGraphLoader.class, l), provider(PermResolver.class, new DefaultPermResolver(CLOCK)),
                provider(ImpactCalculator.class, new DefaultImpactCalculator(CLOCK)), identity, publisher, CLOCK);
    }

    @BeforeEach
    void setUp() {
        objects.put("O1", new ObjMeta("O1", "mcm", "Y", List.of("find", "save", "delete"), List.of("pop1"), null, null));
        objects.put("O2", new ObjMeta("O2", "mcm", "Y", List.of("find", "save"), List.of(), null, null));
        userGroups.put("u1", new TreeSet<>(Set.of("G1")));
        userGroups.put("u2", new TreeSet<>(Set.of("G1")));
        userGroups.put("u3", new TreeSet<>(Set.of("G2")));
        groupRoles.put("G1", new TreeSet<>(Set.of("R1")));
        groupRoles.put("G2", new TreeSet<>(Set.of("R2")));
        rolePerms.put("R1|O1", new String[]{"find,save", null, "D1"});
        rolePerms.put("R2|O2", new String[]{"find", null, null});
        fp = new PermDraftFingerprint(scopeRows);
        svc = service(loader);
    }

    // ────────────────────────────────────────────────────────────────
    // 도우미
    // ────────────────────────────────────────────────────────────────

    /** saveDraft 와 같은 모양으로 초안을 둔다(기준 지문 = 지금 값). 검사는 하지 않는다 — 저장 뒤 상태가 바뀐 경우를 흉내 낸다. */
    private void draft(PermChange... changes) throws Exception {
        List<PermChange> list = List.of(changes);
        SecPermDraft d = new SecPermDraft(user);
        d.setDraftJson(JSON.writeValueAsString(list));
        d.setBaseFpJson(PermDraftFingerprint.toJson(fp.extend(Map.of(), PermDraftFingerprint.scopeKeys(list))));
        d.setChangeCnt(list.size());
        draftRows.put(user, d);
    }

    private static CommPermBenchApplyRequest req(String confirmLoss, String memo) {
        CommPermBenchApplyRequest r = new CommPermBenchApplyRequest();
        r.setConfirmLoss(confirmLoss);
        r.setMemo(memo);
        return r;
    }

    private static PermChange upd(String role, String obj, String btn, String popup) {
        return PermChange.roleObj(role, obj, PermChange.UPD, btn, popup);
    }

    private static PermChange link(String tp, String k1, String k2, String op) {
        return PermChange.link(tp, k1, k2, op);
    }

    private void assertNothingWritten() {
        assertThat(calls).doesNotContain("write", "history", "deleteDraft");
        assertThat(hisRows).isEmpty();
        assertThat(events).isEmpty();
        assertThat(draftRows).containsKey(user);
    }

    private static String code(Throwable t) {
        return t.getMessage().substring(0, t.getMessage().indexOf(':'));
    }

    // ────────────────────────────────────────────────────────────────
    // 성공
    // ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("성공: ROLE_OBJ UPD — DATA_PERM 유지, 이력 머리·줄, 초안 삭제, 결과 한 줄, roleIds = KEY1")
    void applyRoleObjUpd() throws Exception {
        draft(upd("R1", "O1", "find,delete", ""));
        List<Map<String, Object>> out = svc.apply(req("Y", "  분기 정리  "));

        assertThat(rolePerms.get("R1|O1")).containsExactly("find,delete", null, "D1");
        assertThat(out).hasSize(1);
        assertThat((String) out.get(0).get("APPLY_ID")).matches("PA20261127100203456\\d{3}");
        assertThat(out.get(0)).containsEntry("CHANGE_CNT", 1);

        SecPermHis h = hisRows.get(0);
        assertThat(h.getApplyId()).isEqualTo(out.get(0).get("APPLY_ID"));
        assertThat(h.getApplyUserId()).isEqualTo("admin1");
        assertThat(h.getApplyAt()).isEqualTo(LocalDateTime.of(2026, 11, 27, 10, 2, 3, 456_000_000));
        assertThat(h.getChangeCnt()).isEqualTo(1);
        assertThat(h.getGainUserCnt()).isEqualTo(2); // u1·u2 가 delete 를 얻고
        assertThat(h.getLoseUserCnt()).isEqualTo(2); // save 를 잃는다
        assertThat(h.getApplyMemo()).isEqualTo("분기 정리");

        assertThat(dtlRows).singleElement().satisfies(d -> {
            assertThat(d.getApplyId()).isEqualTo(h.getApplyId());
            assertThat(d.getSeqNo()).isEqualTo(1);
            assertThat(d.getTargetTp()).isEqualTo("ROLE_OBJ");
            assertThat(d.getKey1()).isEqualTo("R1");
            assertThat(d.getKey2()).isEqualTo("O1");
            assertThat(d.getOpTp()).isEqualTo("UPD");
            assertThat(d.getBeforeVal()).isEqualTo("BTN=find,save|POPUP=");
            assertThat(d.getAfterVal()).isEqualTo("BTN=find,delete|POPUP=");
        });
        assertThat(draftRows).doesNotContainKey("admin1");
        assertThat(events).singleElement().isInstanceOfSatisfying(RoleChangedEvent.class,
                e -> assertThat(e.getRoleIds()).containsExactly("R1"));
    }

    @Test
    @DisplayName("순서: 초안 잠금 → 범위 잠금(그룹·역할·사람 정렬) → 존재 확인 → 그래프 → 쓰기 → 이력 → 초안 삭제 → flush")
    void order() throws Exception {
        draft(link(PermChange.USER_GRP, "u3", "G1", PermChange.ADD), upd("R2", "O2", "find,save", ""),
                link(PermChange.GRP_ROLE, "G2", "R1", PermChange.ADD));
        svc.apply(req("N", null));

        assertThat(calls.get(0)).isEqualTo("lockDraft:admin1");
        assertThat(calls.get(1)).isEqualTo("lockScopes:group:G1,group:G2,object:O2,role:R1,role:R2,user:u3");
        int firstExists = calls.indexOf("exists:USER");
        int load = calls.indexOf("loadAll");
        int write = calls.indexOf("write");
        int history = calls.indexOf("history");
        int del = calls.indexOf("deleteDraft");
        int flush = calls.lastIndexOf("flush");
        assertThat(firstExists).isGreaterThan(1);
        assertThat(load).isGreaterThan(firstExists);
        assertThat(write).isGreaterThan(load);
        assertThat(history).isGreaterThan(calls.lastIndexOf("write"));
        assertThat(del).isGreaterThan(history);
        assertThat(flush).isGreaterThan(del);
    }

    @Test
    @DisplayName("USER_GRP·GRP_ROLE 이력 값 = N→Y·Y→N, roleIds = GRP_ROLE KEY2 ∪ USER_GRP 그룹의 역할(전·후)")
    void links() throws Exception {
        groups.add("G3");
        draft(link(PermChange.USER_GRP, "u3", "G1", PermChange.ADD),
                link(PermChange.GRP_ROLE, "G2", "R2", PermChange.DEL),
                link(PermChange.USER_GRP, "u1", "G3", PermChange.ADD),
                link(PermChange.GRP_ROLE, "G3", "R2", PermChange.ADD));
        svc.apply(req("Y", null)); // u3 이 R2(O2 find)를 잃는다

        assertThat(userGroups.get("u3")).containsExactlyInAnyOrder("G1", "G2");
        assertThat(groupRoles.get("G2")).isEmpty();
        assertThat(dtlRows).extracting(SecPermHisDtl::getSeqNo, SecPermHisDtl::getTargetTp, SecPermHisDtl::getKey1,
                SecPermHisDtl::getKey2, SecPermHisDtl::getOpTp, SecPermHisDtl::getBeforeVal, SecPermHisDtl::getAfterVal)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "USER_GRP", "u3", "G1", "ADD", "N", "Y"),
                        org.assertj.core.groups.Tuple.tuple(2, "GRP_ROLE", "G2", "R2", "DEL", "Y", "N"),
                        org.assertj.core.groups.Tuple.tuple(3, "USER_GRP", "u1", "G3", "ADD", "N", "Y"),
                        org.assertj.core.groups.Tuple.tuple(4, "GRP_ROLE", "G3", "R2", "ADD", "N", "Y"));
        // G1 의 역할 R1(USER_GRP), G2 에서 뺀 R2(GRP_ROLE), G3 는 전에는 역할이 없고 후에 R2(USER_GRP after)
        assertThat(((RoleChangedEvent) events.get(0)).getRoleIds()).containsExactlyInAnyOrder("R1", "R2");
    }

    @Test
    @DisplayName("ROLE_OBJ: 없는 행 ADD = 넣기(이력 ADD, 전 null), 있는 행 DEL = 지우기(이력 DEL, 후 null)")
    void roleObjAddDel() throws Exception {
        draft(PermChange.roleObj("R2", "O1", PermChange.ADD, "save,find", "pop1"),
                PermChange.roleObj("R1", "O1", PermChange.DEL, null, null));
        svc.apply(req("Y", null));

        assertThat(rolePerms.get("R2|O1")).containsExactly("save,find", "pop1", null);
        assertThat(rolePerms).doesNotContainKey("R1|O1");
        assertThat(dtlRows).extracting(SecPermHisDtl::getOpTp, SecPermHisDtl::getBeforeVal, SecPermHisDtl::getAfterVal)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("ADD", null, "BTN=save,find|POPUP=pop1"),
                        org.assertj.core.groups.Tuple.tuple("DEL", "BTN=find,save|POPUP=", null));
        assertThat(((RoleChangedEvent) events.get(0)).getRoleIds()).containsExactly("R1", "R2");
    }

    @Test
    @DisplayName("ROLE_OBJ ADD 인데 행이 이미 있고 값이 다르면 = BTN·POPUP 갱신(DATA 유지), 이력 OP_TP 는 실제로 한 일 UPD")
    void roleObjAddOnExisting() throws Exception {
        draft(PermChange.roleObj("R1", "O1", PermChange.ADD, "find,save,delete", ""));
        svc.apply(req("N", null));
        assertThat(rolePerms.get("R1|O1")).containsExactly("find,save,delete", null, "D1");
        assertThat(dtlRows).singleElement().extracting(SecPermHisDtl::getOpTp).isEqualTo("UPD");
    }

    @Test
    @DisplayName("no-op(이미 있는 ADD·없는 DEL·같은 값 UPD) = 쓰기·이력 줄 없음, 머리는 CHANGE_CNT 0 으로 남고 초안 삭제, 이벤트 없음")
    void noOps() throws Exception {
        draft(link(PermChange.USER_GRP, "u1", "G1", PermChange.ADD),
                link(PermChange.USER_GRP, "u3", "G1", PermChange.DEL),
                link(PermChange.GRP_ROLE, "G1", "R2", PermChange.DEL),
                upd("R1", "O1", "save,find", ""), // 순서만 다른 같은 값
                PermChange.roleObj("R2", "O1", PermChange.DEL, null, null));
        List<Map<String, Object>> out = svc.apply(req("N", null));

        assertThat(calls).doesNotContain("write");
        assertThat(dtlRows).isEmpty();
        assertThat(hisRows).singleElement().satisfies(h -> {
            assertThat(h.getChangeCnt()).isZero();
            assertThat(h.getLoseUserCnt()).isZero();
        });
        assertThat(out.get(0)).containsEntry("CHANGE_CNT", 0);
        assertThat(draftRows).isEmpty();
        assertThat(events).isEmpty();
        assertThat(rolePerms.get("R1|O1")).containsExactly("find,save", null, "D1");
    }

    // ────────────────────────────────────────────────────────────────
    // 실패 — 모두 쓰기 없음·초안 유지
    // ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("V-005: 초안 없음·빈 초안 = VALIDATION_ERROR")
    void noDraft() throws Exception {
        assertThatThrownBy(() -> svc.apply(req("Y", null))).isInstanceOf(BusinessException.class)
                .hasMessage("VALIDATION_ERROR: 적용할 초안이 없습니다.");
        draft();
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessageStartingWith("VALIDATION_ERROR: ");
        assertThat(hisRows).isEmpty();
    }

    @Test
    @DisplayName("V-006: 메모 1,001자 = VALIDATION_ERROR, 1,000자는 통과")
    void memoLength() throws Exception {
        draft(upd("R2", "O2", "find,save", ""));
        assertThatThrownBy(() -> svc.apply(req("Y", "가".repeat(1001))))
                .hasMessage("VALIDATION_ERROR: 메모는 1,000자 이하로 입력하세요.");
        assertNothingWritten();
        svc.apply(req("Y", "가".repeat(1000)));
        assertThat(hisRows.get(0).getApplyMemo()).hasSize(1000);
    }

    @Test
    @DisplayName("XV-002: 저장 뒤 다른 경로가 범위를 바꾸면 PERM_CONFLICT: 충돌 범위 키(정렬)")
    void conflict() throws Exception {
        draft(upd("R1", "O1", "find", ""), link(PermChange.USER_GRP, "u3", "G1", PermChange.ADD),
                link(PermChange.GRP_ROLE, "G2", "R1", PermChange.ADD));
        rolePerms.put("R1|O1", new String[]{"find,save,delete", null, "D1"}); // 옛 화면이 바꿈
        userGroups.get("u3").add("G1");                                    // 다른 관리자가 적용
        assertThatThrownBy(() -> svc.apply(req("Y", null))).isInstanceOf(BusinessException.class)
                .hasMessage("PERM_CONFLICT: role:R1,user:u3");
        assertNothingWritten();
    }

    @Test
    @DisplayName("XV-001: 잃는 사람이 있고 confirmLoss≠Y 이면 PERM_NEED_CONFIRM: {잃는 사람 수}")
    void needConfirm() throws Exception {
        draft(upd("R1", "O1", "find", ""));
        assertThatThrownBy(() -> svc.apply(req("N", null))).hasMessage("PERM_NEED_CONFIRM: 2");
        assertThatThrownBy(() -> svc.apply(req(null, null))).hasMessage("PERM_NEED_CONFIRM: 2");
        assertNothingWritten();
        svc.apply(req("y", null)); // 대소문자 무시
        assertThat(rolePerms.get("R1|O1")[0]).isEqualTo("find");
    }

    @Test
    @DisplayName("V-001: 저장 뒤 BTN 이 빈 ROLE_OBJ = PERM_EMPTY_BTN")
    void emptyBtn() throws Exception {
        draft(upd("R1", "O1", "", "pop1"));
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessage("PERM_EMPTY_BTN: R1/O1");
        assertNothingWritten();
    }

    @Test
    @DisplayName("V-002: 저장 뒤 오브젝트 허용 값이 줄면 PERM_NOT_IN_OBJ — 잠근 뒤 지금 오브젝트로 판정")
    void notInObj() throws Exception {
        draft(upd("R1", "O1", "find,delete", ""));
        objects.put("O1", new ObjMeta("O1", "mcm", "Y", List.of("find", "save"), List.of("pop1"), null, null));
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessage("PERM_NOT_IN_OBJ: R1/O1/delete");
        assertNothingWritten();
    }

    @Test
    @DisplayName("XV-003: 저장 뒤 대상이 사라지면 NOT_FOUND — 범위 잠금 뒤에 판정")
    void targetGone() throws Exception {
        draft(link(PermChange.USER_GRP, "u3", "G1", PermChange.ADD));
        users.remove("u3");
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessage("NOT_FOUND: 변경 대상이 없습니다: user:u3");
        assertThat(calls.indexOf("lockScopes:group:G1,user:u3")).isLessThan(calls.indexOf("exists:USER"));
        assertNothingWritten();
    }

    @Test
    @DisplayName("V-008·V-003: 중복 변경 = PERM_BAD_VALUE, SYSADMIN 퍼미션 편집 = PERM_FORBIDDEN")
    void badValueAndForbidden() throws Exception {
        draft(upd("R1", "O1", "find", ""), upd("R1", "O1", "save", ""));
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessageStartingWith("PERM_BAD_VALUE: ");
        draft(upd("SYSADMIN", "O1", "find", ""));
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessageStartingWith("PERM_FORBIDDEN: ");
        assertNothingWritten();
    }

    @Test
    @DisplayName("BTN 1,000자 초과 = PERM_BAD_VALUE(DB 오류 대신)")
    void btnTooLong() throws Exception {
        StringBuilder sb = new StringBuilder();
        List<String> codes = new ArrayList<>();
        for (int i = 0; sb.length() <= 1000; i++) {
            String c = "c" + i;
            codes.add(c);
            sb.append(c).append(',');
        }
        objects.put("O1", new ObjMeta("O1", "mcm", "Y", codes, List.of(), null, null));
        draft(upd("R1", "O1", String.join(",", codes), ""));
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessageStartingWith("PERM_BAD_VALUE: 버튼·팝업 값은 1,000자");
        assertNothingWritten();
    }

    @Test
    @DisplayName("로그인 없음 = PERM_NO_USER, 그래프 로더 빈 없음 = PERM_NOT_READY(쓰기 없음)")
    void noUserNotReady() throws Exception {
        draft(upd("R2", "O2", "find,save", ""));
        assertThatThrownBy(() -> service(null).apply(req("Y", null))).hasMessageStartingWith("PERM_NOT_READY: ");
        assertNothingWritten();
        user = null;
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessageStartingWith("PERM_NO_USER: ");
    }

    // ────────────────────────────────────────────────────────────────
    // 이벤트 시점·값 형식
    // ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("트랜잭션 동기화가 켜져 있으면 RoleChangedEvent 는 afterCommit 에서만 발행된다(롤백이면 없음)")
    void eventAfterCommit() throws Exception {
        draft(upd("R2", "O2", "find,save", ""));
        TransactionSynchronizationManager.initSynchronization();
        try {
            svc.apply(req("N", null));
            assertThat(events).isEmpty();
            List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
            assertThat(syncs).hasSize(1);
            syncs.forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
            assertThat(events).isEmpty();
            syncs.forEach(TransactionSynchronization::afterCommit);
            assertThat(events).singleElement().isInstanceOfSatisfying(RoleChangedEvent.class,
                    e -> assertThat(e.getRoleIds()).containsExactly("R2"));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("ROLE_OBJ 이력 값: 정리된 목록, 2,000자 넘으면 자름, APPLY_ID 는 이미 있으면 다음 일련")
    void formats() throws Exception {
        assertThat(PermApplyService.permVal(" a , b,a", null)).isEqualTo("BTN=a,b|POPUP=");
        String v = PermApplyService.permVal("x".repeat(1000), "y".repeat(1000));
        assertThat(v).hasSize(2000).endsWith("…");

        LocalDateTime at = LocalDateTime.of(2026, 11, 27, 10, 2, 3, 456_000_000);
        String first = svc.newApplyId(at);
        assertThat(first).hasSize(22).startsWith("PA20261127100203456");
        SecPermHis h = new SecPermHis();
        h.setApplyId(first);
        hisRows.add(h);
        String second = svc.newApplyId(at);
        assertThat(second).isNotEqualTo(first).hasSize(22);
    }

    // ────────────────────────────────────────────────────────────────
    // 리뷰 반영(M1·S1·S3·S5·N1·N4)
    // ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("S5: 변경의 범위가 기준 지문에 없으면 PERM_DRAFT_CORRUPT(키 목록) — 잠그기 전에 거절")
    void unbasedScope() throws Exception {
        draft(upd("R1", "O1", "find", ""), link(PermChange.USER_GRP, "u3", "G1", PermChange.ADD));
        draftRows.get(user).setBaseFpJson(PermDraftFingerprint.toJson(Map.of("user:u3", "x")));
        assertThatThrownBy(() -> svc.apply(req("Y", null)))
                .hasMessageStartingWith("PERM_DRAFT_CORRUPT: 기준 지문에 없는 범위가 있습니다 (role:R1)");
        assertThat(calls).noneMatch(c -> c.startsWith("lockScopes"));
        assertNothingWritten();
    }

    @Test
    @DisplayName("M1: 잠금 전용 키(USER_GRP group:KEY2·GRP_ROLE role:KEY2·ROLE_OBJ ADD·UPD object:KEY2)를 잠그되 지문 비교에는 쓰지 않는다")
    void lockOnlyKeys() throws Exception {
        assertThat(PermApplyService.lockOnlyKeys(List.of(
                link(PermChange.USER_GRP, "u1", "G9", PermChange.DEL),
                link(PermChange.GRP_ROLE, "G1", "R9", PermChange.ADD),
                upd("R1", "O9", "find", ""),
                PermChange.roleObj("R1", "O8", PermChange.DEL, null, null))))
                .containsExactly("group:G9", "object:O9", "role:R9");

        // 저장 뒤 G1 의 역할이 바뀌어도(group:G1 은 잠금 전용) 충돌이 아니다
        draft(link(PermChange.USER_GRP, "u3", "G1", PermChange.ADD));
        groupRoles.get("G1").add("R2");
        svc.apply(req("N", null));
        assertThat(calls).contains("lockScopes:group:G1,user:u3");
        assertThat(userGroups.get("u3")).contains("G1");
    }

    @Test
    @DisplayName("M1: 저장 뒤 다른 관리자가 그룹에 SYSADMIN 을 붙였으면(잠금으로 기다린 뒤 보이는 상태) 그 그룹에 사람 넣기 = PERM_FORBIDDEN")
    void sysadminAddedMeanwhile() throws Exception {
        draft(link(PermChange.USER_GRP, "u3", "G1", PermChange.ADD));
        groupRoles.get("G1").add("SYSADMIN");
        assertThatThrownBy(() -> svc.apply(req("Y", null))).hasMessageStartingWith("PERM_FORBIDDEN: G1 ");
        assertNothingWritten();
    }

    @Test
    @DisplayName("S3: 쓰기 flush 제약 위반(잠그지 않는 옛 화면과 같은 키) = PERM_CONFLICT: 범위, 이력·이벤트 없음")
    void writeConstraintConflict() throws Exception {
        draft(link(PermChange.USER_GRP, "u3", "G1", PermChange.ADD), upd("R2", "O2", "find,save", ""));
        failFlush = true;
        assertThatThrownBy(() -> svc.apply(req("Y", null))).isInstanceOf(BusinessException.class)
                .hasMessage("PERM_CONFLICT: role:R2,user:u3");
        assertThat(hisRows).isEmpty();
        assertThat(events).isEmpty();
        assertThat(draftRows).containsKey(user);
    }

    @Test
    @DisplayName("S1: 이력 머리 PK 위반(다른 노드와 같은 APPLY_ID) = PERM_BUSY")
    void historyCollisionBusy() throws Exception {
        draft(upd("R2", "O2", "find,save", ""));
        failHistory = true;
        assertThatThrownBy(() -> svc.apply(req("Y", null)))
                .hasMessage("PERM_BUSY: 다른 적용과 겹쳤습니다. 다시 시도해 주세요");
        assertThat(events).isEmpty();
        assertThat(draftRows).containsKey(user);
    }

    @Test
    @DisplayName("N1: 실제 트랜잭션은 있는데 동기화가 꺼져 있으면 커밋 전에 발행하지 않는다(경고만)")
    void noSyncNoPublish() throws Exception {
        draft(upd("R2", "O2", "find,save", ""));
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            svc.apply(req("N", null));
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
        assertThat(hisRows).hasSize(1);
        assertThat(events).isEmpty();
    }

    @Test
    @DisplayName("N1: afterCommit 에서 발행해도 MenuCatalog 식 @TransactionalEventListener(AFTER_COMPLETION)와 @EventListener 가 커밋 뒤 돈다")
    void afterCompletionListenersRun() throws Exception {
        try (org.springframework.context.annotation.AnnotationConfigApplicationContext ctx =
                     new org.springframework.context.annotation.AnnotationConfigApplicationContext(TxEventConfig.class)) {
            TxEventListeners l = ctx.getBean(TxEventListeners.class);
            PermApplyService s = service(loader, ctx);
            draft(upd("R2", "O2", "find,save", ""));
            new org.springframework.transaction.support.TransactionTemplate(
                    ctx.getBean(org.springframework.transaction.PlatformTransactionManager.class)).executeWithoutResult(st -> {
                s.apply(req("N", null));
                assertThat(l.got).as("커밋 전").isEmpty();
            });
            assertThat(l.got).containsExactlyInAnyOrder("plain:[R2]", "afterCompletion:[R2]");
        }
    }

    @Test
    @DisplayName("N4: 이력 값 자르기는 코드 포인트 기준(서로게이트 쌍을 가르지 않는다)")
    void truncateByCodePoint() {
        String emoji = new String(Character.toChars(0x1F600));
        String v = PermApplyService.permVal(emoji.repeat(1000), emoji.repeat(1000));
        assertThat(v.codePointCount(0, v.length())).isEqualTo(2000);
        assertThat(v).endsWith("…");
        assertThat(Character.isHighSurrogate(v.charAt(v.length() - 2))).isFalse();
    }

    /** 커밋만 흉내 내는 트랜잭션 관리자(동기화는 Spring 이 실제로 돌린다). */
    static class FakeTxManager extends org.springframework.transaction.support.AbstractPlatformTransactionManager {
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object tx, org.springframework.transaction.TransactionDefinition def) { }
        @Override protected void doCommit(org.springframework.transaction.support.DefaultTransactionStatus st) { }
        @Override protected void doRollback(org.springframework.transaction.support.DefaultTransactionStatus st) { }
    }

    static class TxEventListeners {
        final List<String> got = new java.util.concurrent.CopyOnWriteArrayList<>();

        @org.springframework.context.event.EventListener
        public void plain(RoleChangedEvent e) { got.add("plain:" + e.getRoleIds()); }

        @org.springframework.transaction.event.TransactionalEventListener(
                phase = org.springframework.transaction.event.TransactionPhase.AFTER_COMPLETION, fallbackExecution = true)
        public void afterCompletion(RoleChangedEvent e) { got.add("afterCompletion:" + e.getRoleIds()); }
    }

    @org.springframework.context.annotation.Configuration
    @org.springframework.transaction.annotation.EnableTransactionManagement
    static class TxEventConfig {
        @org.springframework.context.annotation.Bean
        org.springframework.transaction.PlatformTransactionManager transactionManager() { return new FakeTxManager(); }

        @org.springframework.context.annotation.Bean
        TxEventListeners txEventListeners() { return new TxEventListeners(); }
    }
}
