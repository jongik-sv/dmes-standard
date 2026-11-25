package com.dongkuk.dmes.mqc.qpr.tagManagement.repository;

import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagVersion;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagVersionId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TagVersionRepository extends JpaRepository<TagVersion, TagVersionId> {

    List<TagVersion> findByDocIdOrderByDocVerDesc(String docId);
}
