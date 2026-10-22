import express from "express";

// Express 4 does not forward rejected async handlers to the error boundary.
export function createRouter(options) {
  const router = express.Router(options);
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => register(path, ...handlers.flat(Infinity).map(handler =>
      (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next)
    ));
  }
  return router;
}
