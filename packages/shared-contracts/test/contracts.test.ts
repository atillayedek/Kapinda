import { describe, expect, it } from "vitest";
import { canTransition, isTerminalStatus, nextStatusesFor, OrderTransitions, OrderStatusValues } from "../src";

describe("order state machine contract", () => {
  it("delivered yalnız qr_verification aktörüyle ulaşılabilir", () => {
    const toDelivered = OrderTransitions.filter(([, to]) => to === "delivered");
    expect(toDelivered.length).toBeGreaterThan(0);
    for (const [, , actor] of toDelivered) expect(actor).toBe("qr_verification");
  });

  it("admin hiçbir durumdan delivered'a geçemez", () => {
    for (const s of OrderStatusValues) expect(canTransition(s, "delivered", "admin")).toBe(false);
  });

  it("terminal durumlardan çıkış yoktur", () => {
    for (const [from] of OrderTransitions) expect(isTerminalStatus(from)).toBe(false);
  });

  it("tüm geçişler tanımlı durumları kullanır", () => {
    for (const [from, to] of OrderTransitions) {
      expect(OrderStatusValues).toContain(from);
      expect(OrderStatusValues).toContain(to);
    }
  });

  it("vendor yeni siparişi kabul veya reddedebilir", () => {
    expect(nextStatusesFor("vendor_pending", "vendor").sort()).toEqual(["rejected", "vendor_accepted"]);
  });
});
