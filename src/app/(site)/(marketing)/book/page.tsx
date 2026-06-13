import { permanentRedirect } from "next/navigation";

export default async function BookPage() {
  permanentRedirect("/services");
}
