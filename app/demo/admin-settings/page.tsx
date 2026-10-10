import { redirect } from "next/navigation"

// The former demonstration matrix is replaced by the live administration surface.
export default function AdminSettingsPage() {
  redirect("/?admin=1")
}