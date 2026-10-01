export * from "./generated";
import { OrderTransitions, type OrderStatus, type TransitionActor, BusinessRules } from "./generated";

/** Verilen aktör için durum geçişi izinli mi? Sunucu tarafı (PostgreSQL) otoritedir; bu yalnız UI içindir. */
export function canTransition(from: OrderStatus, to: OrderStatus, actor: TransitionActor): boolean {
  return OrderTransitions.some(([f, t, a]) => f === from && t === to && a === actor);
}

export function nextStatusesFor(from: OrderStatus, actor: TransitionActor): OrderStatus[] {
  return OrderTransitions.filter(([f, , a]) => f === from && a === actor).map(([, t]) => t);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return (BusinessRules.terminalOrderStatuses as readonly string[]).includes(status);
}
