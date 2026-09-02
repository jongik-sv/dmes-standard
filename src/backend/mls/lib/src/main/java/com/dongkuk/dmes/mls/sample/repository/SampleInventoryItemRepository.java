package com.dongkuk.dmes.mls.sample.repository;

import com.dongkuk.dmes.mls.sample.domain.SampleInventoryItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SampleInventoryItemRepository extends JpaRepository<SampleInventoryItem, Long> {
}
