import { redirect } from "next/navigation";

import { currentMember } from "@/lib/session";

export default async function Home() {
  redirect((await currentMember()) ? "/dashboard" : "/sign-in");
}
