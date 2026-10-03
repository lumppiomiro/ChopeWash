import { CheckInPage } from "@/components/check-in-page";

export default async function Page({ searchParams }: { searchParams: Promise<{ booking?: string; source?: string; entry?: string }> }) {
  const params = await searchParams;
  return <CheckInPage bookingId={params.booking} source={params.source} entryId={params.entry} />;
}
