"use client";

import { useLaundryStore } from "@/lib/laundry-store";
import { BookingFlow } from "@/components/booking-flow";

export function BookingPage() {
  const { state, ready, error, addBooking } = useLaundryStore();
  return <BookingFlow state={state} ready={ready} connectionError={error} onConfirm={addBooking} />;
}
