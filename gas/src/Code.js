function doGet(e) {
  return routeRequest_("GET", e);
}

function doPost(e) {
  return routeRequest_("POST", e);
}

function doOptions(e) {
  return routeRequest_("OPTIONS", e);
}

function initializeSheets() {
  return ensureSheets_();
}
