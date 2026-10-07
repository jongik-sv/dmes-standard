package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetUserSearchRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabs;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetFixedTabs;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 사용자 위젯 탭·배치 저장 — OASIS {@code secWidget}(스펙 2026-10-02-widget-foundation §4.2, 공유는
 * docs/widget-2026-10/design-widget-tabs.md §3.1, 고정 탭은 스펙 2026-10-07-widget-fixed-tabs). 사용자는 늘 인증 컨텍스트에서
 * 얻는다(IDOR). 쓰기 원자성은 {@link SecWidgetTabWriter} 가 맡는다 — 이 클래스에는 {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 * <p>고정 탭(「홈」·전사·부서 관리자 배치, {@link WidgetFixedTabs})은 관리자 테이블에서 접속 때마다 풀어 주고 사용자는 고칠 수 없다.
 * 사용자가 저장하는 탭은 개인 탭({@code tab-N})뿐이다. 예전에 저장한 「홈」·기본 탭 재정의 행은 조회 때 개인 탭으로 옮긴다(행 삭제 없음).
 */
@Service("secWidgetService")
public class SecWidgetService {

    private static final Logger log = LoggerFactory.getLogger(SecWidgetService.class);

    static final String HOME_TAB_ID = "home";
    static final String HOME_TAB_NM = "홈";
    static final int GRID_COLS = 24;
    /** 개인 탭({@code tab-N}) 한도 — 고정 탭은 세지 않는다(스펙 2026-10-07 §3). */
    static final int MAX_TABS = 10;
    static final int MAX_WIDGETS = 30;
    static final int TAB_NM_MAX = 20;
    static final int MAX_SHARE_TARGETS = 10;
    static final String SHARE_PREFIX = "(공유) ";
    /** 옛 「홈」 행을 옮긴 개인 탭 이름, 옛 기본 탭 재정의 행은 「내 」+관리자 탭 이름. */
    static final String MIGRATED_HOME_NM = "내 홈";
    static final String MIGRATED_PREFIX = "내 ";
    static final String FIXED_TAB_MESSAGE = "관리자가 정한 탭은 바꿀 수 없습니다. 내 탭에서 편집하세요.";
    static final int USER_SEARCH_MIN = 2;
    static final int USER_SEARCH_MAX = 30;
    static final int USER_SEARCH_LIMIT = 20;
    private static final int USER_ID_MAX = 30;
    private static final Pattern TAB_ID = Pattern.compile("^(home|tab-\\d{1,6}|def-\\d{1,6}|dept-[A-Za-z0-9_.-]{1,30})$");
    private static final Pattern USER_TAB_ID = Pattern.compile("^tab-(\\d{1,6})$");
    private static final String TAB_PREFIX = "tab-";

    private final SecUserWidgetTabRepository tabRepository;
    private final SecUserWidgetRepository widgetRepository;
    private final SecWidgetTabWriter writer;
    private final SecurityIdentity securityIdentity;
    private final WidgetFixedTabs fixedTabs;
    private final WidgetDefaultLayoutRepository layoutRepository;
    private final WidgetUserContextResolver userContextResolver;
    private final WidgetUserLookupRepository userLookup;
    /** OASIS 바깥 트랜잭션을 내려놓고 도는 틀 — search 의 이전 쓰기가 자기 트랜잭션으로 커밋되게(§4). */
    private final TransactionTemplate outsideTx;

    @Autowired
    public SecWidgetService(SecUserWidgetTabRepository tabRepository,
                            SecUserWidgetRepository widgetRepository,
                            SecWidgetTabWriter writer,
                            SecurityIdentity securityIdentity,
                            WidgetFixedTabs fixedTabs,
                            WidgetDefaultLayoutRepository layoutRepository,
                            WidgetUserContextResolver userContextResolver,
                            WidgetUserLookupRepository userLookup,
                            PlatformTransactionManager transactionManager) {
        this.tabRepository = tabRepository;
        this.widgetRepository = widgetRepository;
        this.writer = writer;
        this.securityIdentity = securityIdentity;
        this.fixedTabs = fixedTabs;
        this.layoutRepository = layoutRepository;
        this.userContextResolver = userContextResolver;
        this.userLookup = userLookup;
        TransactionTemplate outside = new TransactionTemplate(transactionManager);
        outside.setName("secWidgetSearch");
        outside.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
        this.outsideTx = outside;
    }

    /**
     * 고정 탭(전사 기본 탭 → 부서 대표·기본 탭, 관리자 배치 그대로, fixedYn=Y·lockYn=Y) + 개인 탭. 「홈」은 돌려주지 않는다 —
     * 화면이 widgetDef/list 의 전사 「홈」 배치로 그린다. 응답 전에 옛 「홈」·기본 탭 재정의 행을 개인 탭으로 옮긴다(§4).
     * <p><b>트랜잭션</b>: OASIS({@code cactus.oasis.transactional: true})가 서비스 전체를 txBiz 로 감싸므로, 그 바깥 트랜잭션을
     * {@code NOT_SUPPORTED} 로 내려놓고 돈다 — 이전은 writer 가 자기 트랜잭션으로 커밋하고, 실패해도 바깥을 rollback-only 로
     * 만들지 않는다(WidgetChatService 와 같은 방식). 이전이 실패하면 경고만 남기고 옛 행을 숨긴 채 응답한다(다음 조회에 다시 시도).
     */
    public Map<String, Object> search(SecWidgetSearchRequest request) {
        return outsideTx.execute(status -> searchOutsideTx());
    }

    private Map<String, Object> searchOutsideTx() {
        String userId = requireUser();
        List<WidgetFixedTabs.FixedTab> fixed = fixedFor(userId);
        List<SecUserWidgetTab> rows = tabRepository.findByUserIdOrderByTabSeqAsc(userId);
        List<SecUserWidget> userWidgets = widgetRepository.findByUserId(userId);
        if (migrateLegacy(userId, rows, userWidgets, fixed)) {
            rows = tabRepository.findByUserIdOrderByTabSeqAsc(userId);
            userWidgets = widgetRepository.findByUserId(userId);
        }

        List<Map<String, Object>> tabs = new ArrayList<>();
        List<Map<String, Object>> widgets = new ArrayList<>();
        for (WidgetFixedTabs.FixedTab f : fixed) {
            Map<String, Object> m = tabMap(f.tabId(), f.tabNm(), f.tabSeq(), "Y", true);
            m.put("origin", f.origin());
            tabs.add(m);
            for (WidgetFixedTabs.Item i : f.items()) {
                widgets.add(widgetMap(f.tabId(), i.instId(), i.widgetId(), i.posX(), i.posY(), i.sizeW(), i.sizeH(),
                        i.lockYn(), null));
            }
        }
        Set<String> personal = new HashSet<>();
        for (SecUserWidgetTab t : rows) {
            if (!isPersonalTabId(t.getTabId())) continue; // 옮기지 않은 옛 행(빈 「홈」 등)은 숨긴다
            personal.add(t.getTabId());
            tabs.add(tabMap(t.getTabId(), t.getTabNm(), t.getTabSeq(), t.getLockYn(), false));
        }
        for (SecUserWidget w : userWidgets) {
            if (!personal.contains(w.getTabId())) continue;
            widgets.add(widgetMap(w.getTabId(), w.getInstId(), w.getWidgetId(), w.getPosX(), w.getPosY(),
                    w.getSizeW(), w.getSizeH(), w.getLockYn(), w.getConfigJson()));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabs", tabs);
        result.put("widgets", widgets);
        return result;
    }

    /**
     * 개인 탭 하나를 통째로 바꾼다. 위젯 목록은 grids.widgets.rows. 고정 탭(home·def-*·dept-*)은 거절한다. newYn=Y 인 {@code tab-N} 이
     * 이미 있으면(화면이 연 뒤 공유 사본이 그 번호로 생긴 경우) 덮어쓰지 않고 개인 탭 최대 번호 + 1 로 옮겨 새 탭으로 저장하며,
     * 응답 tabId 에 실제 ID 를 돌려준다. 새 탭은 writer 가 넣기만 하고(그사이 그 번호가 차면 다음 빈 번호 — 동시에 옮긴 「내 홈」을
     * 덮어쓰지 않게), 이름 중복은 새 탭이거나 이름이 바뀔 때만 본다(나중에 생긴 고정 탭 이름과 같아도 배치 저장은 막지 않게).
     */
    public Map<String, Object> saveTab(SecWidgetTabSaveRequest request, List<Map<String, Object>> widgets) {
        String userId = requireUser();
        String requestedId = requireTabId(request.getTabId());
        if (WidgetFixedTabs.isFixedTabId(requestedId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, FIXED_TAB_MESSAGE);
        }
        List<SecUserWidgetTab> existing = tabRepository.findByUserIdOrderByTabSeqAsc(userId);
        String tabId = "Y".equals(request.getNewYn())
                && existing.stream().anyMatch(t -> t.getTabId().equals(requestedId))
                ? TAB_PREFIX + (maxUserTabNo(existing) + 1) : requestedId;
        String tabNm = trim(request.getTabNm());
        if (tabNm == null || tabNm.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "탭 이름을 입력해 주세요.");
        }
        if (tabNm.length() > TAB_NM_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 이름은 " + TAB_NM_MAX + "자 이하로 정합니다.");
        }
        boolean isNew = existing.stream().noneMatch(t -> t.getTabId().equals(tabId));
        if (isNew && userTabCount(existing) >= MAX_TABS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "내 탭은 " + MAX_TABS + "개까지 만들 수 있습니다.");
        }
        String prevNm = existing.stream().filter(t -> t.getTabId().equals(tabId)).map(SecUserWidgetTab::getTabNm)
                .findFirst().orElse(null);
        if (!tabNm.equals(prevNm)) {
            Set<String> taken = fixedNames(fixedFor(userId));
            for (SecUserWidgetTab t : existing) {
                if (isPersonalTabId(t.getTabId()) && !t.getTabId().equals(tabId)) taken.add(t.getTabNm());
            }
            if (taken.contains(tabNm)) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 이름의 탭이 있습니다.");
            }
        }
        List<Map<String, Object>> rows = widgets == null ? List.of() : widgets;
        if (rows.size() > MAX_WIDGETS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "위젯은 탭당 " + MAX_WIDGETS + "개까지 놓을 수 있습니다.");
        }
        List<SecWidgetTabWriter.WidgetValues> values = new ArrayList<>();
        Set<String> instIds = new HashSet<>();
        for (Map<String, Object> row : rows) {
            SecWidgetTabWriter.WidgetValues v = toWidget(row);
            if (!instIds.add(v.instId())) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 위젯 인스턴스 ID 가 두 번 있습니다: " + v.instId());
            }
            values.add(v);
        }
        // 0 은 옮긴 「내 홈」의 자리(개인 탭 맨 앞)라 그대로 받는다.
        int seq = Math.max(0, request.getTabSeq() == null ? existing.size() : request.getTabSeq());
        String lockYn = "Y".equals(request.getLockYn()) ? "Y" : "N";
        SecWidgetTabWriter.TabValues tabValues = new SecWidgetTabWriter.TabValues(tabId, tabNm, seq, lockYn);
        String savedId = tabId;
        if (isNew) {
            savedId = writer.insertTab(userId, tabValues, values);
        } else {
            writer.replaceTab(userId, tabValues, values);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", savedId);
        result.put("savedCount", values.size());
        return result;
    }

    public Map<String, Object> deleteTab(SecWidgetTabRequest request) {
        String userId = requireUser();
        String tabId = requireTabId(request.getTabId());
        if (WidgetFixedTabs.isFixedTabId(tabId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "관리자가 정한 탭은 지울 수 없습니다.");
        }
        writer.deleteTab(userId, tabId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", tabId);
        result.put("deleted", true);
        return result;
    }

    /** grids.tabs.rows 의 tabId 순서대로 1부터 매긴다. 고정 탭은 관리자 순서라 건너뛴다. */
    public Map<String, Object> reorderTabs(List<Map<String, Object>> tabs) {
        String userId = requireUser();
        Set<String> owned = new HashSet<>();
        for (SecUserWidgetTab t : tabRepository.findByUserIdOrderByTabSeqAsc(userId)) owned.add(t.getTabId());
        Map<String, Integer> seq = new LinkedHashMap<>();
        int n = 1;
        for (Map<String, Object> row : tabs == null ? List.<Map<String, Object>>of() : tabs) {
            String tabId = row == null || row.get("tabId") == null ? null : trim(String.valueOf(row.get("tabId")));
            if (tabId == null || !isPersonalTabId(tabId) || !owned.contains(tabId) || seq.containsKey(tabId)) continue;
            seq.put(tabId, n++);
        }
        writer.reorder(userId, seq);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", seq.size());
        return result;
    }

    /**
     * 옛 「기본 배치로 되돌리기」 — 「홈」은 이제 관리자 배치로 고정이라 되돌릴 것이 없다. 사용자 행을 지우지 않고 거절한다
     * (옛 화면이 불러도 아직 옮기지 않은 개인 「홈」이 지워지지 않게, 스펙 2026-10-07 §2).
     */
    public Map<String, Object> resetHome(SecWidgetSearchRequest request) {
        requireUser();
        throw new BusinessException(ErrorCode.BUSINESS_ERROR, "「홈」은 관리자가 정한 배치라 되돌릴 것이 없습니다. 예전 배치는 「내 홈」 탭에 있습니다.");
    }

    /** 옛 기본 탭 되돌리기 — 고정 탭은 사용자 재정의가 없으므로 거절한다(행 삭제 없음). */
    public Map<String, Object> resetTab(SecWidgetTabRequest request) {
        requireUser();
        requireTabId(request.getTabId());
        throw new BusinessException(ErrorCode.BUSINESS_ERROR, "관리자가 정한 탭은 되돌릴 것이 없습니다. 예전 배치는 「내 …」 탭에 있습니다.");
    }

    /**
     * 탭 공유 — 본인 탭의 사본을 받는 사람(grids.targets.rows = [{userId}])마다 「(공유) 이름」 새 개인 탭으로 넣는다.
     * 원본은 개인 탭이면 본인 행, 고정 탭이면 관리자 배치다. 배치·위젯 설정만 넘기고 instId 는 새로 만들며 잠금은 모두 푼다.
     * 받는 사람마다 결과를 돌려주고, 통과한 사본은 한 트랜잭션으로 넣는다.
     */
    public Map<String, Object> shareTab(SecWidgetTabRequest request, List<Map<String, Object>> targets) {
        String userId = requireUser();
        String tabId = requireTabId(request.getTabId());
        // 받는 사람 → 입력 오류 문구(null 이면 정상). 빈 ID·너무 긴 ID 도 조용히 빼지 않고 실패 줄로 돌려준다.
        Map<String, String> requested = new LinkedHashMap<>();
        Set<String> targetIds = new LinkedHashSet<>();
        for (Map<String, Object> row : targets == null ? List.<Map<String, Object>>of() : targets) {
            String id = row == null || row.get("userId") == null ? "" : trim(String.valueOf(row.get("userId")));
            if (id == null || id.isEmpty()) {
                requested.putIfAbsent("", "사용자 ID 가 비었습니다.");
            } else if (id.length() > USER_ID_MAX) {
                requested.putIfAbsent(id, "사용자 ID 가 너무 깁니다.");
            } else {
                requested.putIfAbsent(id, null);
                targetIds.add(id);
            }
        }
        if (requested.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "공유할 사용자를 골라 주세요.");
        }
        if (requested.size() > MAX_SHARE_TARGETS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "한 번에 " + MAX_SHARE_TARGETS + "명까지 공유할 수 있습니다.");
        }
        ShareSource source = shareSource(userId, tabId);
        Set<String> others = new LinkedHashSet<>(targetIds);
        others.remove(userId);
        Set<String> active = new HashSet<>(userLookup.findActiveUserIds(others, LocalDateTime.now()));

        List<Map<String, Object>> results = new ArrayList<>();
        List<SecWidgetTabWriter.TabCopy> copies = new ArrayList<>();
        for (Map.Entry<String, String> req : requested.entrySet()) {
            String target = req.getKey();
            if (req.getValue() != null) {
                results.add(shareResult(target, false, null, req.getValue()));
                continue;
            }
            if (target.equals(userId)) {
                results.add(shareResult(target, false, null, "본인에게는 공유할 수 없습니다."));
                continue;
            }
            if (!active.contains(target)) {
                results.add(shareResult(target, false, null, "없거나 사용하지 않는 사용자입니다."));
                continue;
            }
            List<SecUserWidgetTab> rows = tabRepository.findByUserIdOrderByTabSeqAsc(target);
            if (userTabCount(rows) >= MAX_TABS) {
                results.add(shareResult(target, false, null, "받는 사람의 탭이 가득 찼습니다(" + MAX_TABS + "개)."));
                continue;
            }
            Set<String> names = fixedNames(fixedFor(target));
            int maxSeq = 0;
            for (SecUserWidgetTab t : rows) {
                if (!isPersonalTabId(t.getTabId())) continue;
                names.add(t.getTabNm());
                maxSeq = Math.max(maxSeq, t.getTabSeq() == null ? 0 : t.getTabSeq());
            }
            String tabNm = shareName(source.tabNm(), names);
            List<SecWidgetTabWriter.WidgetValues> widgets = new ArrayList<>();
            for (SecWidgetTabWriter.WidgetValues w : source.widgets()) {
                widgets.add(new SecWidgetTabWriter.WidgetValues(newInstId(), w.widgetId(), w.posX(), w.posY(), w.sizeW(),
                        w.sizeH(), "N", w.configJson()));
            }
            copies.add(new SecWidgetTabWriter.TabCopy(target,
                    new SecWidgetTabWriter.TabValues(TAB_PREFIX + (maxUserTabNo(rows) + 1), tabNm, maxSeq + 1, "N"), widgets));
            results.add(shareResult(target, true, tabNm, null));
        }
        if (!copies.isEmpty()) writer.copyTabs(copies);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("results", results);
        return result;
    }

    /** 공유 받는 사람 고르기 — 아이디·이름에 keyword 가 들어간 사용 중 사용자(본인 제외), 최대 20건. 칸은 userId·userNm·deptNm. */
    public Map<String, Object> searchUsers(SecWidgetUserSearchRequest request) {
        String userId = requireUser();
        String keyword = trim(request.getKeyword());
        if (keyword == null || keyword.length() < USER_SEARCH_MIN) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "검색어는 " + USER_SEARCH_MIN + "자 이상 입력해 주세요.");
        }
        if (keyword.length() > USER_SEARCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "검색어는 " + USER_SEARCH_MAX + "자 이하로 입력해 주세요.");
        }
        List<Map<String, Object>> users = new ArrayList<>();
        for (WidgetUserLookupRepository.UserRow r : userLookup.searchActive(keyword, userId, LocalDateTime.now(), USER_SEARCH_LIMIT)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", r.userId());
            m.put("userNm", r.userNm());
            m.put("deptNm", r.deptNm());
            users.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("users", users);
        return result;
    }

    // ── 옛 행 이전 (스펙 2026-10-07 §4) ──────────────────────────────────

    /**
     * 옛 「홈」 행과 지금 고정 탭 집합에 있는 기본 탭 재정의 행 중 위젯이 1개 이상인 것을 개인 탭으로 옮긴다. 옮길 것이 있었으면 true(다시 읽는다).
     * 새 탭 번호가 그사이 차면 writer 가 다음 빈 번호를 고른다. 위젯 0개인 옛 행은 그대로 두고 숨긴다(지우지 않는다).
     * 실패하면(DB 잠금 등) 경고만 남기고 false — 옛 행은 숨긴 채 응답하고 다음 조회에 다시 옮긴다.
     */
    private boolean migrateLegacy(String userId, List<SecUserWidgetTab> rows, List<SecUserWidget> widgets,
                                  List<WidgetFixedTabs.FixedTab> fixed) {
        List<SecWidgetTabWriter.TabMove> moves = legacyMoves(rows, widgets, fixed);
        if (moves.isEmpty()) return false;
        try {
            writer.moveTabs(userId, moves); // 0 이어도 다른 요청이 먼저 옮긴 것이라 다시 읽는다
            return true;
        } catch (RuntimeException e) {
            log.warn("위젯 옛 배치 이전 실패 — 다음 조회에 다시 시도한다. userId={}, moves={}", userId, moves, e);
            return false;
        }
    }

    /** 옮길 목록 — 「홈」 먼저(개인 탭 맨 앞 순서 0), 기본 탭 재정의는 고정 탭 순서대로 개인 탭 뒤에. 이름은 개인·고정 탭과 겹치지 않게. */
    static List<SecWidgetTabWriter.TabMove> legacyMoves(List<SecUserWidgetTab> rows, List<SecUserWidget> widgets,
                                                       List<WidgetFixedTabs.FixedTab> fixed) {
        Map<String, Integer> widgetCount = new HashMap<>();
        for (SecUserWidget w : widgets) widgetCount.merge(w.getTabId(), 1, Integer::sum);
        Map<String, SecUserWidgetTab> byId = new HashMap<>();
        for (SecUserWidgetTab t : rows) byId.put(t.getTabId(), t);

        List<String> from = new ArrayList<>();
        Map<String, String> baseName = new HashMap<>();
        if (byId.containsKey(HOME_TAB_ID) && widgetCount.getOrDefault(HOME_TAB_ID, 0) > 0) {
            from.add(HOME_TAB_ID);
            baseName.put(HOME_TAB_ID, MIGRATED_HOME_NM);
        }
        for (WidgetFixedTabs.FixedTab f : fixed) {
            if (!WidgetDefaultTabs.isDefaultTabId(f.tabId()) || !byId.containsKey(f.tabId())
                    || widgetCount.getOrDefault(f.tabId(), 0) == 0) continue;
            from.add(f.tabId());
            baseName.put(f.tabId(), MIGRATED_PREFIX + f.tabNm());
        }
        if (from.isEmpty()) return List.of();

        Set<String> taken = fixedNames(fixed);
        int maxSeq = 0;
        for (SecUserWidgetTab t : rows) {
            if (!isPersonalTabId(t.getTabId())) continue;
            taken.add(t.getTabNm());
            maxSeq = Math.max(maxSeq, t.getTabSeq() == null ? 0 : t.getTabSeq());
        }
        int no = maxUserTabNo(rows);
        List<SecWidgetTabWriter.TabMove> moves = new ArrayList<>();
        for (String id : from) {
            String nm = uniqueName(baseName.get(id), taken);
            taken.add(nm);
            int seq = HOME_TAB_ID.equals(id) ? 0 : ++maxSeq;
            moves.add(new SecWidgetTabWriter.TabMove(id, TAB_PREFIX + (++no), nm, seq));
        }
        return moves;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** 공유 원본 — 이름과 위젯(instId 는 원본 그대로, 사본에서 새로 만든다). */
    private record ShareSource(String tabNm, List<SecWidgetTabWriter.WidgetValues> widgets) {}

    /** 개인 탭은 본인 행, 「홈」은 전사 「홈」 배치, 그 밖 고정 탭은 본인 고정 탭 집합의 관리자 배치. */
    private ShareSource shareSource(String userId, String tabId) {
        if (isPersonalTabId(tabId)) {
            Optional<SecUserWidgetTab> own = tabRepository.findById(new SecUserWidgetTabId(userId, tabId));
            if (own.isEmpty()) throw new BusinessException(ErrorCode.BUSINESS_ERROR, "없는 탭입니다.");
            List<SecWidgetTabWriter.WidgetValues> widgets = new ArrayList<>();
            for (SecUserWidget w : widgetRepository.findByUserIdAndTabId(userId, tabId)) {
                widgets.add(new SecWidgetTabWriter.WidgetValues(w.getInstId(), w.getWidgetId(), w.getPosX(), w.getPosY(),
                        w.getSizeW(), w.getSizeH(), w.getLockYn(), w.getConfigJson()));
            }
            return new ShareSource(own.get().getTabNm(), widgets);
        }
        if (HOME_TAB_ID.equals(tabId)) {
            List<WidgetDefaultLayout> rows = layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc(WidgetDefaultLayout.COMPANY_KEY);
            if (rows == null || rows.isEmpty()) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, "전사 「홈」 배치가 아직 없어 공유할 수 없습니다.");
            }
            List<SecWidgetTabWriter.WidgetValues> widgets = new ArrayList<>();
            for (WidgetDefaultLayout l : rows) {
                widgets.add(new SecWidgetTabWriter.WidgetValues(l.getInstId(), l.getWidgetId(), l.getPosX(), l.getPosY(),
                        l.getSizeW(), l.getSizeH(), l.getLockYn(), null));
            }
            return new ShareSource(HOME_TAB_NM, widgets);
        }
        WidgetFixedTabs.FixedTab f = WidgetFixedTabs.find(fixedFor(userId), tabId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BUSINESS_ERROR, "쓸 수 없는 탭입니다: " + tabId));
        List<SecWidgetTabWriter.WidgetValues> widgets = new ArrayList<>();
        for (WidgetFixedTabs.Item i : f.items()) {
            widgets.add(new SecWidgetTabWriter.WidgetValues(i.instId(), i.widgetId(), i.posX(), i.posY(), i.sizeW(),
                    i.sizeH(), i.lockYn(), null));
        }
        return new ShareSource(f.tabNm(), widgets);
    }

    /** 「(공유) 」+원본 이름을 20자로 자르고, 받는 사람 탭 이름과 겹치면 숫자 꼬리(" 2", " 3" …)를 붙여 다시 20자 안에 맞춘다. */
    static String shareName(String sourceNm, Set<String> taken) {
        return uniqueName(SHARE_PREFIX + (sourceNm == null ? "" : sourceNm), taken);
    }

    /** full 을 20자로 자르고 taken 과 겹치면 숫자 꼬리(" 2", " 3" …)를 붙여 다시 20자 안에 맞춘다. */
    static String uniqueName(String full, Set<String> taken) {
        String name = cut(full, TAB_NM_MAX);
        for (int n = 2; taken.contains(name); n++) {
            String tail = " " + n;
            name = cut(full, TAB_NM_MAX - tail.length()) + tail;
        }
        return name;
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** 공유 사본의 새 instId — 기본 배치 instId 형식({@code [A-Za-z0-9_-]{1,40}})에 맞춘다. */
    private static String newInstId() {
        return "s" + UUID.randomUUID().toString().replace("-", "");
    }

    private static Map<String, Object> shareResult(String userId, boolean ok, String tabNm, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", userId);
        m.put("ok", ok);
        m.put("tabNm", tabNm);
        m.put("message", message);
        return m;
    }

    /** 사용자 부서 사슬 기준 고정 탭. 부서는 사용자 행에서 읽는다(요청 값을 쓰지 않는다). */
    private List<WidgetFixedTabs.FixedTab> fixedFor(String userId) {
        return fixedTabs.resolve(userContextResolver.deptChain(userLookup.findDeptCd(userId)));
    }

    /** 개인 탭이 쓸 수 없는 이름 — 「홈」과 고정 탭 이름. 고칠 수 있는 새 집합. */
    private static Set<String> fixedNames(List<WidgetFixedTabs.FixedTab> fixed) {
        Set<String> names = new HashSet<>();
        names.add(HOME_TAB_NM);
        for (WidgetFixedTabs.FixedTab f : fixed) names.add(f.tabNm());
        return names;
    }

    private static boolean isPersonalTabId(String tabId) {
        return tabId != null && USER_TAB_ID.matcher(tabId).matches();
    }

    /** 개인 탭({@code tab-N}) 중 가장 큰 N. 없으면 0. */
    private static int maxUserTabNo(List<SecUserWidgetTab> rows) {
        int max = 0;
        for (SecUserWidgetTab t : rows) {
            Matcher m = USER_TAB_ID.matcher(t.getTabId());
            if (m.matches()) max = Math.max(max, Integer.parseInt(m.group(1)));
        }
        return max;
    }

    /** 개인 탭({@code tab-N}) 수. 옮기지 않은 옛 행은 세지 않는다. */
    private static long userTabCount(List<SecUserWidgetTab> rows) {
        return rows.stream().filter(t -> isPersonalTabId(t.getTabId())).count();
    }

    private static Map<String, Object> tabMap(String tabId, String tabNm, Integer tabSeq, String lockYn, boolean fixed) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tabId", tabId);
        m.put("tabNm", tabNm);
        m.put("tabSeq", tabSeq);
        m.put("lockYn", lockYn);
        m.put("fixedYn", fixed ? "Y" : "N");
        // 옛 화면 호환 — 기본 탭 표시(고정 탭 = 관리자 탭). 사용자 재정의는 이제 없다.
        m.put("defaultYn", fixed ? "Y" : "N");
        m.put("customYn", "N");
        return m;
    }

    private static Map<String, Object> widgetMap(String tabId, String instId, String widgetId, Integer posX, Integer posY,
                                                 Integer sizeW, Integer sizeH, String lockYn, String configJson) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tabId", tabId);
        m.put("instId", instId);
        m.put("widgetId", widgetId);
        m.put("posX", posX);
        m.put("posY", posY);
        m.put("sizeW", sizeW);
        m.put("sizeH", sizeH);
        m.put("lockYn", lockYn);
        m.put("configJson", configJson);
        return m;
    }

    private String requireUser() {
        String userId = securityIdentity.currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        return userId;
    }

    private static String requireTabId(String raw) {
        String tabId = trim(raw);
        if (tabId == null || !TAB_ID.matcher(tabId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 ID 형식이 올바르지 않습니다.");
        }
        return tabId;
    }

    private static String trim(String s) {
        return s == null || "null".equals(s) ? null : s.trim();
    }

    private static int intOf(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v instanceof Number num) return num.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, key + " 는 정수여야 합니다.");
        }
    }

    private static SecWidgetTabWriter.WidgetValues toWidget(Map<String, Object> row) {
        String instId = trim(row.get("instId") == null ? null : String.valueOf(row.get("instId")));
        String widgetId = trim(row.get("widgetId") == null ? null : String.valueOf(row.get("widgetId")));
        if (instId == null || instId.isEmpty() || instId.length() > 40) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 인스턴스 ID 가 올바르지 않습니다.");
        }
        if (widgetId == null || widgetId.isEmpty() || widgetId.length() > 100) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 ID 가 올바르지 않습니다.");
        }
        int x = intOf(row, "posX");
        int y = intOf(row, "posY");
        int w = intOf(row, "sizeW");
        int h = intOf(row, "sizeH");
        if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > GRID_COLS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 자리·크기가 격자(" + GRID_COLS + "칸) 밖입니다: " + instId);
        }
        String lockYn = "Y".equals(row.get("lockYn")) ? "Y" : "N";
        Object config = row.get("configJson");
        String configJson = config == null ? null : String.valueOf(config);
        if (configJson != null && configJson.length() > 4000) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 설정이 너무 깁니다: " + instId);
        }
        return new SecWidgetTabWriter.WidgetValues(instId, widgetId, x, y, w, h, lockYn, configJson);
    }
}
