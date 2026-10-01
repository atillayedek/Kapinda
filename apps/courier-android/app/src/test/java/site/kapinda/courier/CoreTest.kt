package site.kapinda.courier

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import site.kapinda.courier.core.contracts.BusinessRules
import site.kapinda.courier.core.contracts.IncidentType
import site.kapinda.courier.core.contracts.OrderStatus
import site.kapinda.courier.core.errors.AppException
import site.kapinda.courier.core.errors.ErrorMessages
import site.kapinda.courier.ui.components.formatTrPhone

class CoreTest {
    @Test fun `sunucu kodları Türkçe mesaja çevrilir, iç hata gösterilmez`() {
        assertEquals("Bu QR kod daha önce kullanıldı.", ErrorMessages.of(AppException("KPD_QR_ALREADY_USED")))
        assertEquals("Beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.", ErrorMessages.of(RuntimeException("relation orders does not exist")))
        assertEquals("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.", ErrorMessages.of(java.io.IOException("x")))
    }

    @Test fun `contract enumları sunucu değerleriyle eşleşir`() {
        assertEquals(OrderStatus.ON_THE_WAY, OrderStatus.fromWire("on_the_way"))
        assertEquals(null, OrderStatus.fromWire("bilinmeyen"))
        assertTrue(IncidentType.ACCIDENT in BusinessRules.SERIOUS_INCIDENT_TYPES)
        assertFalse(IncidentType.ROAD_BLOCKED in BusinessRules.SERIOUS_INCIDENT_TYPES)
    }

    @Test fun `telefon biçimlendirme`() {
        assertEquals("0532 123 45 67", formatTrPhone("+905321234567"))
    }
}
