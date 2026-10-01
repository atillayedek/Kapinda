// Supabase satır tipleri (yalnız istemcinin okuduğu kolonlar). Kaynak: supabase/migrations.
import type { OrderStatus, ProductPaymentMethod, SubstitutionPreference, ItemFulfillment, OrderPaymentState } from "@kapinda/shared-contracts";

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_age_restricted: boolean;
  is_online_sale_allowed: boolean;
  is_active: boolean;
}

export interface Vendor {
  id: string;
  slug: string;
  name: string;
  business_type: string;
  description: string | null;
  logo_path: string | null;
  cover_path: string | null;
  address_text: string;
  lat: number | null;
  lng: number | null;
  coverage_area_id: string;
  status: string;
  is_open: boolean;
  rating_avg: number;
  rating_count: number;
}

export interface Product {
  id: string;
  vendor_id: string;
  category_id: string;
  name: string;
  description: string | null;
  barcode: string | null;
  price: number;
  unit: string;
  track_stock: boolean;
  stock_quantity: number | null;
  is_active: boolean;
  is_age_restricted: boolean;
  product_images?: { storage_path: string; sort_order: number }[];
  categories?: Pick<Category, "name" | "slug" | "is_age_restricted" | "is_online_sale_allowed"> | null;
}

export interface District {
  id: string;
  name: string;
  slug: string;
  postal_code: string | null;
  province_id: string;
  is_active: boolean;
}

export interface CoverageArea {
  id: string;
  district_id: string;
  name: string;
  slug: string;
  center_lat: number;
  center_lng: number;
  max_radius_km: number;
  min_basket_amount: number;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
}

export interface Address {
  id: string;
  label: string | null;
  district_id: string;
  neighborhood: string;
  street: string;
  building: string;
  apartment: string | null;
  floor: string | null;
  door_number: string | null;
  directions: string | null;
  recipient_name: string;
  phone: string;
  lat: number;
  lng: number;
  is_default: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  vendor_id: string;
  status: OrderStatus;
  courier_id: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: Record<string, string | null>;
  delivery_lat: number;
  delivery_lng: number;
  product_subtotal: number;
  delivery_fee: number;
  delivery_fee_payable: number;
  delivery_fee_waived: boolean;
  item_count: number;
  distance_km: number;
  distance_source: "google_maps" | "haversine_estimate";
  payment_state: OrderPaymentState;
  product_payment_method: ProductPaymentMethod;
  customer_note: string | null;
  cancel_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  on_the_way_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  vendors?: Pick<Vendor, "name" | "slug" | "logo_path"> | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  substitution_preference: SubstitutionPreference;
  fulfillment: ItemFulfillment;
  substituted_from: Record<string, unknown> | null;
}

export interface OrderStatusHistory {
  id: number;
  order_id: string;
  previous_status: OrderStatus | null;
  new_status: OrderStatus;
  actor_role: string;
  reason: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  referral_code: string;
  consents_complete: boolean;
  is_blocked: boolean;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface SupportConversation {
  id: string;
  customer_id: string;
  order_id: string | null;
  subject: string;
  status: "open" | "waiting" | "resolved";
  last_message_at: string;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: "customer" | "admin";
  body: string;
  created_at: string;
}

export interface DeliveryQuote {
  quote_id: string;
  fee: number;
  distance_km: number;
  distance_source: "google_maps" | "haversine_estimate";
  is_estimated: boolean;
  duration_seconds: number | null;
  expires_at: string;
  min_basket_amount: number;
  pricing: { base_fee: number; base_distance_km: number; per_km_fee: number; max_distance_km: number };
}
