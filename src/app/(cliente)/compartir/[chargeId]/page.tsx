import { SocialPage } from "@/components/social-page";
export default async function Page({ params }: { params: Promise<{ chargeId: string }> }) { const { chargeId } = await params; return <SocialPage chargeId={chargeId} />; }
