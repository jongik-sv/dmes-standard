package com.dongkuk.dmes.mcm.code.service;

import com.dongkuk.dmes.mcm.code.dto.SecCodeItemSearchRequest;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItem;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItemId;
import com.dongkuk.dmes.mcm.code.repository.SecCodeGroupRepository;
import com.dongkuk.dmes.mcm.code.repository.SecCodeItemRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import com.dongkuk.dmes.mcm.widget.query.QueryCodeLookup;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service("secCodeItemService")
public class SecCodeItemService implements QueryCodeLookup {

    /** 맞춤 레포트·위젯 조건(codeGroup)의 항목 보관 — 그룹마다 60초, 그룹 200개, 그룹당 항목 5000개까지. */
    static final Duration LOOKUP_TTL = Duration.ofSeconds(60);
    static final int LOOKUP_MAX_GROUPS = 200;
    static final int LOOKUP_MAX_ITEMS = 5000;

    private record Cached(Set<String> items, Instant expiresAt) {}

    private final SecCodeItemRepository secCodeItemRepository;
    private final SecCodeGroupRepository secCodeGroupRepository;
    private final Clock clock;
    private final ConcurrentHashMap<String, Cached> lookupCache = new ConcurrentHashMap<>();

    public SecCodeItemService(SecCodeItemRepository secCodeItemRepository) {
        this(secCodeItemRepository, null, Clock.systemUTC());
    }

    @Autowired
    public SecCodeItemService(SecCodeItemRepository secCodeItemRepository, SecCodeGroupRepository secCodeGroupRepository) {
        this(secCodeItemRepository, secCodeGroupRepository, Clock.systemUTC());
    }

    SecCodeItemService(SecCodeItemRepository secCodeItemRepository, SecCodeGroupRepository secCodeGroupRepository, Clock clock) {
        this.secCodeItemRepository = secCodeItemRepository;
        this.secCodeGroupRepository = secCodeGroupRepository;
        this.clock = clock;
    }

    /** 그룹의 사용 중 항목 코드 — 정적 JPQL·바인드로만 읽고 짧게(60초) 보관한다. 형식이 틀린 그룹 이름은 읽지 않는다. */
    @Override
    public Set<String> items(String groupCd) {
        if (groupCd == null || groupCd.isBlank() || groupCd.length() > 50) return Set.of();
        Instant now = clock.instant();
        Cached hit = lookupCache.get(groupCd);
        if (hit != null && now.isBefore(hit.expiresAt())) return hit.items();
        Set<String> items = new HashSet<>();
        items.addAll(secCodeItemRepository.findActiveItemCds(groupCd, PageRequest.of(0, LOOKUP_MAX_ITEMS)));
        Set<String> frozen = Collections.unmodifiableSet(items);
        lookupCache.values().removeIf(c -> !now.isBefore(c.expiresAt()));
        // 빈 결과(없는 그룹)도 같은 60초 보관한다 — 없는 그룹을 가리키는 정의가 실행마다 DB 를 치지 않게. 새 그룹은 최대 60초 뒤에 보인다.
        if (lookupCache.size() < LOOKUP_MAX_GROUPS) {
            lookupCache.put(groupCd, new Cached(frozen, now.plus(LOOKUP_TTL)));
        }
        return frozen;
    }

    /** 그룹이 있고 사용 중인가 — 정의 저장 때만 부른다. 그룹 저장소가 없으면(시험 구성) 항목이 하나라도 있는지로 본다. */
    @Override
    public boolean groupExists(String groupCd) {
        if (groupCd == null || groupCd.isBlank() || groupCd.length() > 50) return false;
        if (secCodeGroupRepository == null) return !items(groupCd).isEmpty();
        return secCodeGroupRepository.findById(groupCd).map(g -> "Y".equals(g.getUseYn())).orElse(false);
    }

    public List<Map<String, Object>> searchItems(SecCodeItemSearchRequest request) {
        if (request.getGroupCd() == null || request.getGroupCd().isBlank()) {
            return List.of();
        }
        List<SecCodeItem> items = "Y".equals(request.getUseYn())
                ? secCodeItemRepository.findActiveByGroupCd(request.getGroupCd())
                : secCodeItemRepository.findByGroupCdOrderBySortOrdAsc(request.getGroupCd());

        List<Map<String, Object>> result = new ArrayList<>(items.size());
        for (SecCodeItem item : items) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("groupCd",  item.getId().getGroupCd());
            row.put("itemCd",   item.getId().getItemCd());
            row.put("itemNm",   item.getItemNm());
            row.put("itemDesc", item.getItemDesc());
            row.put("sortOrd",  item.getSortOrd());
            row.put("extraVal1", item.getExtraVal1());
            row.put("extraVal2", item.getExtraVal2());
            row.put("useYn",    item.getUseYn());
            result.add(row);
        }
        return result;
    }

    /** LoV 용 — group_cd 의 활성 항목만 (itemCd, itemNm) 짝으로 반환. */
    public List<Map<String, Object>> getCodesByGroup(SecCodeItemSearchRequest request) {
        if (request.getGroupCd() == null || request.getGroupCd().isBlank()) {
            return List.of();
        }
        List<SecCodeItem> items = secCodeItemRepository.findActiveByGroupCd(request.getGroupCd());
        List<Map<String, Object>> result = new ArrayList<>(items.size());
        for (SecCodeItem item : items) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code",  item.getId().getItemCd());
            row.put("name",  item.getItemNm());
            row.put("desc",  item.getItemDesc());
            row.put("extra1", item.getExtraVal1());
            row.put("extra2", item.getExtraVal2());
            result.add(row);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    public int saveItems(List<Map<String, Object>> master) {
        if (master == null) return 0;

        List<ErrorDetail> errors = new ArrayList<>();
        int count = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            String rowKey = (String) row.get("rowKey");
            String rowStatus = (String) row.get("rowStatus");
            String groupCd = (String) row.get("groupCd");
            String itemCd = (String) row.get("itemCd");

            if (groupCd == null || groupCd.isBlank()) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "groupCd", "E001", "그룹코드는 필수입니다."));
                continue;
            }
            if (itemCd == null || itemCd.isBlank()) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "itemCd", "E001", "항목코드는 필수입니다."));
                continue;
            }
            SecCodeItemId id = new SecCodeItemId(groupCd, itemCd);

            if ("C".equals(rowStatus) || "U".equals(rowStatus)) {
                SecCodeItem entity = secCodeItemRepository.findById(id).orElse(new SecCodeItem());
                entity.setId(id);
                entity.setItemNm((String) row.get("itemNm"));
                entity.setItemDesc((String) row.get("itemDesc"));
                entity.setSortOrd(row.get("sortOrd") instanceof Number n ? n.intValue() : 0);
                entity.setExtraVal1((String) row.get("extraVal1"));
                entity.setExtraVal2((String) row.get("extraVal2"));
                entity.setUseYn((String) row.get("useYn"));
                secCodeItemRepository.save(entity);
                count++;
            } else if ("D".equals(rowStatus)) {
                secCodeItemRepository.deleteById(id);
                count++;
            }
        }

        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", errors);
        }
        return count;
    }
}
