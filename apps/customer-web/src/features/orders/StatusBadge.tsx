import { OrderStatusLabels, type OrderStatus } from "@kapinda/shared-contracts";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const variant =
    status === "delivered" ? "success" : ["cancelled", "rejected", "failed"].includes(status) ? "destructive" : status === "pending_payment" ? "warning" : "default";
  return <Badge variant={variant}>{OrderStatusLabels[status]}</Badge>;
}

export const CUSTOMER_STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: "vendor_pending", label: "Sipariş alındı" },
  { status: "vendor_accepted", label: "İşletme kabul etti" },
  { status: "preparing", label: "Hazırlanıyor" },
  { status: "courier_assigned", label: "Kurye atandı" },
  { status: "picked_up", label: "Kurye aldı" },
  { status: "on_the_way", label: "Yolda" },
  { status: "delivered", label: "Teslim edildi" },
];

const ORDER: OrderStatus[] = ["pending_payment", "payment_confirmed", "vendor_pending", "vendor_accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "on_the_way", "delivered"];

export function stepReached(current: OrderStatus, step: OrderStatus): boolean {
  if (["cancelled", "rejected", "failed"].includes(current)) return false;
  return ORDER.indexOf(current) >= ORDER.indexOf(step);
}
