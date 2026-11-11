"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearAdminSession,
  isAdminAuthenticated,
  setAdminSession,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import {
  deleteDemoStore,
  deleteProduct,
  getProduct,
  getStoreById,
  updateProduct,
  updateStoreCheckoutMode,
  updateStoreShowPhone,
} from "@/lib/db/repos";

async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    throw new Error("No autorizado");
  }
}

function bustStoreCache(slug: string | null | undefined) {
  if (!slug) return;
  try {
    revalidateTag(`store:${slug}`, { expire: 0 });
  } catch (err) {
    console.warn("[admin] revalidateTag failed", err);
  }
  revalidatePath(`/${slug}`);
}

export async function loginAdminAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (!verifyAdminPassword(password)) {
    return { error: "Clave incorrecta" };
  }
  await setAdminSession();
  redirect("/admin");
}

export async function logoutAdminAction(): Promise<void> {
  await clearAdminSession();
  redirect("/admin");
}

export async function toggleProductStockAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const storeId = String(formData.get("storeId") ?? "");
  const product = await getProduct(productId);
  if (!product || product.storeId !== storeId) return;
  await updateProduct(productId, { inStock: !product.inStock });
  revalidatePath(`/admin/${storeId}`);
  const store = await getStoreById(storeId);
  bustStoreCache(store?.slug);
}

export async function toggleProductHiddenAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const storeId = String(formData.get("storeId") ?? "");
  const product = await getProduct(productId);
  if (!product || product.storeId !== storeId) return;
  await updateProduct(productId, { hidden: !product.hidden });
  revalidatePath(`/admin/${storeId}`);
  const store = await getStoreById(storeId);
  bustStoreCache(store?.slug);
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const storeId = String(formData.get("storeId") ?? "");
  const product = await getProduct(productId);
  if (!product || product.storeId !== storeId) return;
  await deleteProduct(productId);
  revalidatePath(`/admin/${storeId}`);
  const store = await getStoreById(storeId);
  bustStoreCache(store?.slug);
}

export async function deleteDemoStoreAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const storeId = String(formData.get("storeId") ?? "");
  const store = await getStoreById(storeId);
  const result = await deleteDemoStore(storeId);
  if (!result.ok) return;
  bustStoreCache(store?.slug);
  revalidatePath("/admin");
  redirect("/admin");
}

export async function setCheckoutModeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const storeId = String(formData.get("storeId") ?? "");
  const modeRaw = String(formData.get("checkoutMode") ?? "");
  const checkoutMode = modeRaw === "cart" ? "cart" : "whatsapp";
  const updated = await updateStoreCheckoutMode(storeId, checkoutMode);
  if (!updated) return;
  revalidatePath(`/admin/${storeId}`);
  bustStoreCache(updated.slug);
}

export async function setShowPhoneAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const storeId = String(formData.get("storeId") ?? "");
  const showPhone = String(formData.get("showPhone") ?? "") === "true";
  const updated = await updateStoreShowPhone(storeId, showPhone);
  if (!updated) return;
  revalidatePath(`/admin/${storeId}`);
  bustStoreCache(updated.slug);
}
