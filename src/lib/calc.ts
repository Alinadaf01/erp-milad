// Mattress production calculation helpers
import { format as formatJ } from "date-fns-jalali";

export const WIDTHS = [90, 120, 140, 160, 180, 200] as const;
export type Width = typeof WIDTHS[number];
export const BASE_WIDTH = 90;
export const BASE_LENGTH = 200;

export const scaleFactor = (w: number) => w / BASE_WIDTH;

export const fmt = (n: number) =>
  new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(n);

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("fa-IR").format(Math.round(n)) + " تومان";

const toFaDigits = (s: string) => s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

export const formatJalali = (input: string | Date | null | undefined): string => {
  if (!input) return "—";
  try {
    const d = typeof input === "string"
      ? (input.length === 10 ? new Date(input + "T00:00:00") : new Date(input))
      : input;
    if (isNaN(d.getTime())) return String(input);
    return toFaDigits(formatJ(d, "yyyy/MM/dd"));
  } catch { return String(input); }
};

export const formatJalaliDateTime = (input: string | Date | null | undefined): string => {
  if (!input) return "—";
  try {
    const d = typeof input === "string" ? new Date(input) : input;
    if (isNaN(d.getTime())) return String(input);
    return toFaDigits(formatJ(d, "yyyy/MM/dd HH:mm"));
  } catch { return String(input); }
};

export const BEDDING_CATEGORY = "کالای خواب" as const;
export const CATEGORIES = ["طبی", "فنری", "لاکچری", "کودک", "بیمارستانی", BEDDING_CATEGORY] as const;

export const ORDER_STATUSES = {
  pending_approval: "در انتظار تأیید",
  pending: "در انتظار",
  in_production: "در حال تولید",
  completed: "تکمیل شده",
  delivered: "تحویل داده شده",
  overdue: "معوق",
  cancelled: "رد شده",
} as const;

export const CALC_TYPES = {
  fixed: "ثابت",
  per_width: "بر اساس عرض",
  per_area: "بر اساس مساحت",
} as const;

export type CalcType = keyof typeof CALC_TYPES;

// Restricted statuses — only admin / sales_manager / factory_manager can set
export const RESTRICTED_STATUSES = ["overdue"] as const;
export const RESTRICTED_ROLES = ["admin", "sales_manager", "factory_manager"] as const;

// Roles allowed to edit the order exit number
export const EXIT_NUMBER_ROLES = ["admin", "warehouse_keeper", "factory_manager"] as const;

// Roles allowed to enter the proforma number on order creation
export const PROFORMA_CREATE_ROLES = ["admin", "factory_manager", "sales_manager", "sales_expert", "marketing_manager"] as const;

// Can the given roles edit the proforma number for an order with the given status?
export function canEditProformaFor(roles: string[] | undefined, status: string): boolean {
  const r = new Set(roles ?? []);
  if (r.has("admin") || r.has("factory_manager")) return true;
  // Before sales-manager approval, sales roles can still edit
  if (status === "pending_approval") {
    if (r.has("sales_manager") || r.has("sales_expert") || r.has("marketing_manager")) return true;
  }
  return false;
}

// Operational permission groups
export const ORDER_CREATE_ROLES = ["admin", "factory_manager", "sales_manager", "sales_expert", "marketing_manager"] as const;
export const ORDER_DELETE_ROLES = ["admin", "factory_manager"] as const;
export const DUE_DATE_ROLES = ["admin", "factory_manager", "production_manager"] as const;
export const MATERIAL_EDIT_ROLES = ["admin", "factory_manager", "warehouse_keeper"] as const;
export const INVENTORY_EDIT_ROLES = ["admin", "factory_manager", "warehouse_keeper"] as const;

// Who can open the edit dialog for a given order
export function canEditOrderFor(roles: string[] | undefined, status: string): boolean {
  const r = new Set(roles ?? []);
  if (r.has("admin") || r.has("factory_manager")) return true;
  if (r.has("sales_manager")) return true; // limited by status options
  if (r.has("sales_expert") || r.has("marketing_manager")) return status === "pending_approval";
  if (r.has("production_manager")) return status === "pending" || status === "in_production";
  if (r.has("warehouse_keeper")) return status !== "overdue" && (status === "in_production" || status === "completed");
  return false;
}

// Allowed status values when editing — always includes the current status
export function allowedStatusesFor(roles: string[] | undefined, currentStatus: string): Set<string> {
  const r = new Set(roles ?? []);
  if (r.has("admin") || r.has("factory_manager")) {
    return new Set(Object.keys(ORDER_STATUSES));
  }
  const allowed = new Set<string>([currentStatus]);
  if (r.has("sales_manager")) {
    allowed.add("pending");
    allowed.add("overdue");
    if (currentStatus === "pending_approval") { allowed.add("pending"); allowed.add("cancelled"); }
  }
  if ((r.has("sales_expert") || r.has("marketing_manager")) && currentStatus === "pending_approval") { allowed.add("pending_approval"); }
  if (r.has("production_manager")) { allowed.add("in_production"); }
  if (r.has("warehouse_keeper") && currentStatus !== "overdue") {
    if (currentStatus === "in_production") allowed.add("completed");
    if (currentStatus === "completed") allowed.add("delivered");
  }
  return allowed;
}


// Persian labels for roles (used in users management page)
export const ROLE_LABELS: Record<string, string> = {
  admin: "مدیر سیستم",
  user: "کاربر",
  factory_manager: "مدیر کارخانه",
  sales_manager: "مدیر فروش",
  sales_expert: "کارشناس فروش",
  marketing_manager: "مدیر بازاریابی",
  production_manager: "مدیر تولید",
  warehouse_keeper: "انباردار",
};

export const ASSIGNABLE_ROLES = [
  "factory_manager", "sales_manager", "sales_expert", "marketing_manager", "production_manager", "warehouse_keeper", "user",
] as const;

/**
 * Compute material quantity needed for ONE product of given width/length,
 * based on the BOM base value and the material's calculation type.
 */
export const materialQtyPerUnit = (
  base: number,
  calcType: CalcType,
  width: number,
  length: number = BASE_LENGTH,
): number => {
  switch (calcType) {
    case "fixed":
      return base;
    case "per_area":
      return base * (width / BASE_WIDTH) * (length / BASE_LENGTH);
    case "per_width":
    default:
      return base * (width / BASE_WIDTH);
  }
};
