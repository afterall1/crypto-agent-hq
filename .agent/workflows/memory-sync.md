---
description: Session memory'yi %100 eksiksiz kaydet ve güncelle
---

# Memory Sync Workflow

Bu workflow, mevcut session'ın tüm context'ini memory architecture'a kaydeder.

## Adımlar

### 1. Session Özeti Oluştur

Önce mevcut session'ın özet bilgilerini topla:
- Conversation ID
- Yapılan değişiklikler (dosya oluşturma, düzenleme, silme)
- Alınan kararlar
- Karşılaşılan hatalar ve çözümleri
- Öğrenilen bilgiler
- Mevcut task durumu

### 2. Memory Dosyalarını Güncelle

Aşağıdaki dosyaları güncelle veya oluştur:

#### 2.1 Session Snapshot
// turbo
```bash
mkdir -p src/lib/memory/.snapshots
```

Session snapshot dosyasını oluştur: `src/lib/memory/.snapshots/session-{timestamp}.json`

İçerik:
```json
{
  "id": "snapshot-{timestamp}",
  "conversationId": "{current-conversation-id}",
  "timestamp": "{ISO-timestamp}",
  "messages": [...tüm mesajlar...],
  "toolCalls": [...tool çağrıları...],
  "decisions": [...kararlar...],
  "entities": [...entities...],
  "summary": "Session özeti"
}
```

#### 2.2 Context Dosyası
`src/lib/memory/.context/resumable.json` dosyasını güncelle:

```json
{
  "hot": {
    "lastUserMessage": "Son kullanıcı mesajı",
    "lastAssistantMessage": "Son asistan mesajı", 
    "currentTask": "Mevcut görev",
    "taskStatus": "Görev durumu",
    "activeFiles": ["aktif dosya listesi"]
  },
  "warm": {
    "sessionSummary": "Session özeti",
    "recentDecisions": [...son kararlar...],
    "keyFacts": [...önemli bilgiler...],
    "filesModified": [...değiştirilen dosyalar...]
  },
  "cold": {
    "snapshotPath": "snapshot dosya yolu",
    "totalMessages": 0,
    "sessionDuration": 0
  }
}
```

### 3. Knowledge Base Güncelle

Eğer yeni öğrenilen bilgiler varsa, ilgili Knowledge Item'ları güncelle:
- Yeni patterns/best practices
- Çözülen problem tipleri
- Framework/library bilgileri

### 4. Task Durumunu Kaydet

`task.md` artifact'ını güncelle:
- Tamamlanan görevleri [x] olarak işaretle
- Devam eden görevleri [/] olarak işaretle
- Yeni görevleri ekle

### 5. Doğrulama

Aşağıdaki kontrolleri yap:
- Tüm dosyalar yazıldı mı?
- JSON formatları geçerli mi?
- Checksum'lar hesaplandı mı?

### 6. Özet Rapor

Kullanıcıya şu bilgileri raporla:
- Kaydedilen message sayısı
- Yapılan değişiklik sayısı
- Snapshot ID
- Context dosyası lokasyonu

---

## Önemli Notlar

- Bu workflow, session sonunda veya kritik değişikliklerden sonra çalıştırılmalı
- Tüm veriler atomic olarak kaydedilir
- Hata durumunda otomatik rollback yapılır
- Resumable context ile sonraki session'da devam edilebilir
