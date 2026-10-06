package com.dongkuk.dmes.mcm.searchdefaults.repository;

import com.dongkuk.dmes.mcm.searchdefaults.entity.SecUserSrchDflt;
import com.dongkuk.dmes.mcm.searchdefaults.entity.SecUserSrchDfltId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

public interface SecUserSrchDfltRepository extends JpaRepository<SecUserSrchDflt, SecUserSrchDfltId> {

    List<SecUserSrchDflt> findByUserIdOrderByPageIdAscFieldKeyAsc(String userId);

    List<SecUserSrchDflt> findByUserIdAndPageId(String userId, String pageId);

    @Modifying
    @Transactional
    void deleteByUserIdAndPageId(String userId, String pageId);
}
