export const ROUTES = {
  HOME: "/",
  CUSTOMER: "/customer",
  CUSTOMER_SECTION1: "/customer/section1",
  CUSTOMER_SECTION2: "/customer/section2",
  CUSTOMER_SECTION3: "/customer/section3",
  CUSTOMER_SECTION5: "/customer/section5",
  CUSTOMER_SUMMARY: "/customer/summary",
  ADMIN: "/admin",
  ADMIN_DASHBOARD: "/admin/dashboard",
  ADMIN_REQUEST_PREFIX: "/admin/request/",
};

function normalizeHash(hash) {
  const value = hash.replace(/^#/, "").trim() || ROUTES.HOME;
  if (value.startsWith(ROUTES.ADMIN_REQUEST_PREFIX)) {
    return value;
  }
  if (Object.values(ROUTES).includes(value)) {
    return value;
  }
  return ROUTES.HOME;
}

export function currentRoute() {
  return normalizeHash(window.location.hash);
}

export function navigate(route) {
  window.location.hash = route;
}

export function onRouteChange(handler) {
  window.addEventListener("hashchange", () => handler(currentRoute()));
  handler(currentRoute());
}
