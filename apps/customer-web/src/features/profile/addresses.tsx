import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addressSchema, type AddressInput, formatTrPhone } from "@kapinda/shared-validation";
import { supabase, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/hooks/useAuth";
import type { Address } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, FieldError, Skeleton } from "@/components/ui/misc";
import { PinPicker } from "@/features/maps/Maps";
import { useServiceArea } from "@/features/vendors/queries";
import { cn } from "@/lib/utils";

const ADDRESS_COLS = "id, label, district_id, neighborhood, street, building, apartment, floor, door_number, directions, recipient_name, phone, lat, lng, is_default";

export function useAddresses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["addresses", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("addresses").select(ADDRESS_COLS).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []) as Address[];
    },
  });
}

export function addressLine(a: Pick<Address, "neighborhood" | "street" | "building" | "apartment" | "floor" | "door_number">): string {
  return [a.neighborhood, a.street, `No: ${a.building}`, a.apartment, a.floor && `Kat ${a.floor}`, a.door_number && `Daire ${a.door_number}`].filter(Boolean).join(", ");
}

export function AddressForm({ initial, onSaved }: { initial?: Address; onSaved: (a: Address) => void }) {
  const { user, profile } = useAuth();
  const areas = useServiceArea();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, control, formState } = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: initial
      ? { ...initial, label: initial.label ?? undefined, apartment: initial.apartment ?? undefined, floor: initial.floor ?? undefined, doorNumber: initial.door_number ?? undefined, directions: initial.directions ?? undefined, recipientName: initial.recipient_name, districtId: initial.district_id, isDefault: initial.is_default }
      : { recipientName: profile?.full_name ?? "", phone: profile?.phone ?? "", isDefault: false },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const row = {
      label: v.label || null,
      district_id: v.districtId,
      neighborhood: v.neighborhood,
      street: v.street,
      building: v.building,
      apartment: v.apartment || null,
      floor: v.floor || null,
      door_number: v.doorNumber || null,
      directions: v.directions || null,
      recipient_name: v.recipientName,
      phone: v.phone,
      lat: v.lat,
      lng: v.lng,
      is_default: v.isDefault,
    };
    const q = initial
      ? supabase.from("addresses").update(row).eq("id", initial.id).select(ADDRESS_COLS).single()
      : supabase.from("addresses").insert({ ...row, user_id: user!.id }).select(ADDRESS_COLS).single();
    const { data, error: err } = await q;
    if (err) {
      setError(errorMessage(toAppError(err)));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["addresses"] });
    toast.success("Adres kaydedildi.");
    onSaved(data as Address);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="districtId">İlçe</Label>
          <NativeSelect id="districtId" className="mt-1.5" {...register("districtId")}>
            <option value="">Seçin</option>
            {areas.data?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </NativeSelect>
          <FieldError message={formState.errors.districtId?.message} />
        </div>
        <div>
          <Label htmlFor="label">Adres adı (isteğe bağlı)</Label>
          <Input id="label" placeholder="Ev, İş…" className="mt-1.5" {...register("label")} />
        </div>
      </div>
      <div>
        <Label htmlFor="neighborhood">1. Mahalle</Label>
        <Input id="neighborhood" className="mt-1.5" {...register("neighborhood")} />
        <FieldError message={formState.errors.neighborhood?.message} />
      </div>
      <div>
        <Label htmlFor="street">2. Cadde / Sokak</Label>
        <Input id="street" className="mt-1.5" {...register("street")} />
        <FieldError message={formState.errors.street?.message} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="building">3. Bina no</Label>
          <Input id="building" className="mt-1.5" {...register("building")} />
          <FieldError message={formState.errors.building?.message} />
        </div>
        <div>
          <Label htmlFor="apartment">4. Apartman</Label>
          <Input id="apartment" className="mt-1.5" {...register("apartment")} />
        </div>
        <div>
          <Label htmlFor="floor">5. Kat</Label>
          <Input id="floor" className="mt-1.5" {...register("floor")} />
        </div>
        <div>
          <Label htmlFor="doorNumber">6. Daire</Label>
          <Input id="doorNumber" className="mt-1.5" {...register("doorNumber")} />
        </div>
      </div>
      <div>
        <Label htmlFor="directions">7. Adres tarifi</Label>
        <Textarea id="directions" placeholder="Örn. eczanenin yanındaki yeşil kapı" className="mt-1.5" {...register("directions")} />
      </div>
      <div>
        <Label>8. Harita pini</Label>
        <Controller
          control={control}
          name="lat"
          render={({ field: latField }) => (
            <Controller
              control={control}
              name="lng"
              render={({ field: lngField }) => (
                <div className="mt-1.5">
                  <PinPicker
                    value={typeof latField.value === "number" && typeof lngField.value === "number" ? { lat: latField.value, lng: lngField.value } : null}
                    onChange={(p) => {
                      latField.onChange(p.lat);
                      lngField.onChange(p.lng);
                    }}
                  />
                </div>
              )}
            />
          )}
        />
        <FieldError message={formState.errors.lat?.message ?? formState.errors.lng?.message} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="recipientName">Teslim alacak kişi</Label>
          <Input id="recipientName" className="mt-1.5" {...register("recipientName")} />
          <FieldError message={formState.errors.recipientName?.message} />
        </div>
        <div>
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" type="tel" inputMode="tel" className="mt-1.5" {...register("phone")} />
          <FieldError message={formState.errors.phone?.message} />
        </div>
      </div>
      <Controller
        control={control}
        name="isDefault"
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Checkbox id="isDefault" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
            <Label htmlFor="isDefault" className="font-normal">Varsayılan adresim yap</Label>
          </div>
        )}
      />
      {error && <ErrorState message={error} />}
      <Button type="submit" className="w-full" disabled={formState.isSubmitting}>{formState.isSubmitting ? "Kaydediliyor…" : "Adresi kaydet"}</Button>
    </form>
  );
}

export function AddressList({ selectable, selectedId, onSelect }: { selectable?: boolean; selectedId?: string | null; onSelect?: (a: Address) => void }) {
  const list = useAddresses();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("addresses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw toAppError(error);
    },
    onSuccess: () => {
      toast.success("Adres silindi.");
      void qc.invalidateQueries({ queryKey: ["addresses"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-3">
      {list.isLoading && <Skeleton className="h-24" />}
      {list.error && <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
      {list.data && list.data.length === 0 && <EmptyState icon={MapPin} title="Henüz adres eklenmemiş." />}
      {list.data?.map((a) => (
        <div
          key={a.id}
          className={cn("flex items-start gap-3 rounded-xl border bg-card p-4", selectable && "cursor-pointer", selectedId === a.id && "border-primary ring-2 ring-primary/30")}
          onClick={() => selectable && onSelect?.(a)}
          role={selectable ? "radio" : undefined}
          aria-checked={selectable ? selectedId === a.id : undefined}
          tabIndex={selectable ? 0 : undefined}
          onKeyDown={(e) => selectable && (e.key === "Enter" || e.key === " ") && onSelect?.(a)}
        >
          <MapPin className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{a.label ?? "Adres"} {a.is_default && <span className="text-xs text-primary">(varsayılan)</span>}</p>
            <p>{addressLine(a)}</p>
            <p className="text-muted-foreground">{a.recipient_name} · {formatTrPhone(a.phone)}</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label="Düzenle" onClick={(e) => { e.stopPropagation(); setEditing(a); }}><Pencil /></Button>
            <Button variant="ghost" size="icon" aria-label="Sil" onClick={(e) => { e.stopPropagation(); if (confirm("Adres silinsin mi?")) del.mutate(a.id); }}><Trash2 /></Button>
          </div>
        </div>
      ))}
      <Button variant="outline" className="w-full" onClick={() => setEditing("new")}><Plus aria-hidden /> Yeni adres ekle</Button>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent side="bottom" className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing === "new" ? "Yeni adres" : "Adresi düzenle"}</DialogTitle></DialogHeader>
          {editing !== null && (
            <AddressForm initial={editing === "new" ? undefined : editing} onSaved={(a) => { setEditing(null); onSelect?.(a); }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
